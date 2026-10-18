const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phoneCamDesktop', {
  sendFrame(bytes) { ipcRenderer.send('phonecam-frame', bytes); },
  clearFrame() { ipcRenderer.send('phonecam-clear-frame'); },
  gpuVideoDecodeStatus() { return ipcRenderer.invoke('phonecam-gpu-status'); },
  setAlwaysOnTop(enabled) { ipcRenderer.send('phonecam-always-on-top', Boolean(enabled)); },
  openFeedWindow() { ipcRenderer.send('phonecam-open-feed-window'); },
  toggleFullscreen() { ipcRenderer.send('phonecam-toggle-fullscreen'); },
  onFullscreenChange(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('phonecam-fullscreen-state', (_event, enabled) => callback(Boolean(enabled)));
  },
  onFeedFrame(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('phonecam-feed-frame', (_event, bytes) => callback(bytes));
  },
  onShortcut(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('phonecam-shortcut', (_event, action) => callback(action));
  }
});
