const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const baseUrl = 'http://127.0.0.1:8080';
let serverProcess = null;
let mainWindow = null;

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
  serverProcess = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
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
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 850,
    minWidth: 700,
    minHeight: 580,
    title: 'PhoneCam',
    backgroundColor: '#091519',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${baseUrl}/`)) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(`${baseUrl}/viewer`);
}

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('PhoneCam could not start', error.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});
