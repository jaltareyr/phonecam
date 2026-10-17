const { app, BrowserWindow, dialog, globalShortcut, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { openFrameStore, PIXEL_BYTES } = require('./frame-store.cjs');

const baseUrl = 'http://127.0.0.1:8080';
let serverProcess = null;
let mainWindow = null;
let frameStore = null;

function openFrameFile() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const frameDir = path.join(programData, 'PhoneCam');
  fs.mkdirSync(frameDir, { recursive: true });
  frameStore = openFrameStore(frameDir);
  ipcMain.on('phonecam-frame', (event, data) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (data?.byteLength === PIXEL_BYTES) frameStore.writeFrame(data);
  });
  ipcMain.on('phonecam-clear-frame', event => {
    if (event.sender === mainWindow?.webContents) frameStore.clear();
  });
}

async function serverIsReady() {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(700) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.app === 'phonecam';
  } catch { return false; }
}

async function ensureServer() {
  if (await serverIsReady()) return;
  const script = path.join(app.getAppPath(), 'server.js');
  const localData = process.env.LOCALAPPDATA || app.getPath('userData');
  serverProcess = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1',
      PHONECAM_CERT_DIR: path.join(localData, 'PhoneCam', 'certs') },
    windowsHide: true,
    stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await serverIsReady()) return;
    if (serverProcess.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('PhoneCam could not start its local connection server. Check whether port 8080 is already in use.');
}

async function createWindow() {
  await ensureServer();
  openFrameFile();
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 850,
    minWidth: 700,
    minHeight: 580,
    title: 'PhoneCam',
    backgroundColor: '#091519',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') }
  });
  if (process.argv.includes('--fullscreen')) mainWindow.setFullScreen(true);
  if (process.argv.includes('--silent')) mainWindow.minimize();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${baseUrl}/`)) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(`${baseUrl}/viewer`);
  for (const [key, action] of Object.entries({
    'CommandOrControl+Alt+S': 'snapshot',
    'CommandOrControl+Alt+R': 'record',
    'CommandOrControl+Alt+P': 'pause',
    'CommandOrControl+Alt+N': 'new-camera'
  })) globalShortcut.register(key, () => mainWindow?.webContents.send('phonecam-shortcut', action));
}

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('PhoneCam could not start', error.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  frameStore?.close();
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});
