const path = require('node:path');

function viewerWindowOptions() {
  return {
    width: 1060, height: 850, minWidth: 700, minHeight: 580,
    title: 'PhoneCam', backgroundColor: '#091519', autoHideMenuBar: true,
    // Camera export must keep running when the desktop window is hidden.
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') }
  };
}
module.exports = { viewerWindowOptions };
