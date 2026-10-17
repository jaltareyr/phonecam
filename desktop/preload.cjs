const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phoneCamDesktop', {
  sendFrame(bytes) { ipcRenderer.send('phonecam-frame', bytes); },
  clearFrame() { ipcRenderer.send('phonecam-clear-frame'); },
  setAlwaysOnTop(enabled) { ipcRenderer.send('phonecam-always-on-top', Boolean(enabled)); },
  onShortcut(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('phonecam-shortcut', (_event, action) => callback(action));
  }
});
