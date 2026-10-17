const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phoneCamDesktop', {
  onShortcut(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('phonecam-shortcut', (_event, action) => callback(action));
  }
});
