const { app, BrowserWindow, dialog, globalShortcut, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { openFrameStore, PIXEL_BYTES } = require('./frame-store.cjs');

const baseUrl = 'http://127.0.0.1:8080';
let serverProcess = null;
let mainWindow = null;
let feedWindow = null;
let frameStore = null;
let gpuInfoReady = false;
app.on('gpu-info-update', () => { gpuInfoReady = true; });

function openFrameFile() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const frameDir = path.join(programData, 'PhoneCam');
  fs.mkdirSync(frameDir, { recursive: true });
  frameStore = openFrameStore(frameDir);
  ipcMain.on('phonecam-frame', (event, data) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (data?.byteLength === PIXEL_BYTES) {
      frameStore.writeFrame(data);
      if (feedWindow && !feedWindow.isDestroyed()) feedWindow.webContents.send('phonecam-feed-frame', data);
    }
  });
  ipcMain.on('phonecam-clear-frame', event => {
    if (event.sender === mainWindow?.webContents) {
      frameStore.clear();
      if (feedWindow && !feedWindow.isDestroyed()) feedWindow.webContents.send('phonecam-feed-frame', null);
    }
  });
}

function openFeedWindow() {
  if (feedWindow && !feedWindow.isDestroyed()) {
    feedWindow.focus();
    return;
  }
  feedWindow = new BrowserWindow({
    width: 960,
    height: 620,
    minWidth: 400,
    minHeight: 300,
    title: 'PhoneCam feed',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      preload: path.join(__dirname, 'preload.cjs') }
  });
  feedWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  wireFullscreenState(feedWindow);
  feedWindow.on('closed', () => { feedWindow = null; });
  feedWindow.loadURL(`${baseUrl}/feed`);
}

function wireFullscreenState(window) {
  window.on('enter-full-screen', () => window.webContents.send('phonecam-fullscreen-state', true));
  window.on('leave-full-screen', () => window.webContents.send('phonecam-fullscreen-state', false));
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
  ipcMain.handle('phonecam-gpu-status', () => gpuInfoReady ? app.getGPUFeatureStatus().video_decode : 'checking');
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 850,
    minWidth: 700,
    minHeight: 580,
    title: 'PhoneCam',
    backgroundColor: '#091519',
    autoHideMenuBar: true,
    // The virtual camera is fed by this page's animation loop. Keep it running
    // while a call app is in front or the PhoneCam window is minimized.
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') }
  });
  ipcMain.on('phonecam-always-on-top', (event, enabled) => {
    if (event.sender === mainWindow?.webContents) mainWindow.setAlwaysOnTop(Boolean(enabled));
  });
  ipcMain.on('phonecam-open-feed-window', event => {
    if (event.sender === mainWindow?.webContents) openFeedWindow();
  });
  ipcMain.on('phonecam-toggle-fullscreen', event => {
    const target = event.sender === mainWindow?.webContents ? mainWindow
      : event.sender === feedWindow?.webContents ? feedWindow : null;
    if (target) target.setFullScreen(!target.isFullScreen());
  });
  if (process.argv.includes('--fullscreen')) mainWindow.setFullScreen(true);
  if (process.argv.includes('--silent')) mainWindow.minimize();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  wireFullscreenState(mainWindow);
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
    'CommandOrControl+Alt+N': 'new-camera',
    'CommandOrControl+Alt+Q': 'discard-recording'
  })) globalShortcut.register(key, () => mainWindow?.webContents.send('phonecam-shortcut', action));
}

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('PhoneCam could not start', error.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (feedWindow && !feedWindow.isDestroyed()) feedWindow.close();
  frameStore?.close();
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});
