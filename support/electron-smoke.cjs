const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { viewerWindowOptions } = require('../desktop/window-options.cjs');

// Synthetic input only: this test never opens the user's real camera/microphone.
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const cleanup = [];
const windows = [];
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(100); }
  throw new Error(message);
}

app.whenReady().then(async () => {
  const { startTestServer } = await import('./server-fixture.js');
  const server = await startTestServer({ after: callback => cleanup.push(callback) });
  const viewer = new BrowserWindow({ ...viewerWindowOptions(), show: false, width: 960, height: 660 });
  const phone = new BrowserWindow({ show: false, width: 390, height: 844, useContentSize: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  windows.push(viewer, phone);
  for (const [label, window] of [['viewer', viewer], ['phone', phone]]) {
    window.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.log(`${label}: ${message}`); });
    window.webContents.on('render-process-gone', (_event, details) => console.error(`${label} renderer exited: ${details.reason}`));
  }
  cleanup.push(() => { phone.destroy(); viewer.destroy(); });
  let frames = 0;
  let nonblack = false;
  ipcMain.on('phonecam-frame', (event, pixels) => {
    if (event.sender !== viewer.webContents) return;
    assert.equal(pixels.byteLength, 1280 * 720 * 4);
    frames++;
    for (let i = 0; i < pixels.length; i += 4096) if (pixels[i] > 30) nonblack = true;
  });
  ipcMain.handle('phonecam-gpu-status', () => 'synthetic-test');
  await viewer.loadURL(`${server.base}/viewer`);
  await until(() => viewer.webContents.executeJavaScript("/^[A-HJ-NP-Z2-9]{6}$/.test(document.querySelector('.code')?.textContent)"), 'Viewer did not create a pairing room');
  const code = await viewer.webContents.executeJavaScript("document.querySelector('.code').textContent");
  await phone.loadURL(`${server.base}/phone?code=${code}`);
  // Keep CI independent of the runner's H.264 hardware encoder availability.
  await phone.webContents.executeJavaScript(`(() => {
    const capabilities = RTCRtpSender.getCapabilities.bind(RTCRtpSender);
    RTCRtpSender.getCapabilities = kind => {
      const result = capabilities(kind);
      return kind === 'video' ? { ...result, codecs: result.codecs.filter(codec => ['video/VP8','video/rtx','video/red','video/ulpfec'].includes(codec.mimeType)) } : result;
    };
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#123548'; ctx.fillRect(0,0,640,480);
      ctx.fillStyle = '#39b4df'; ctx.fillRect((Date.now()/8)%480,140,160,160);
      ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif';
      ctx.fillText('Synthetic camera test',24,50);
      ctx.fillText('No physical camera is used',24,85);
    };
    draw(); setInterval(draw, 33);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'synthetic', label: 'Synthetic camera' }];
    return true;
  })()`);
  await phone.webContents.executeJavaScript("document.getElementById('resolution').value='640x480'; document.getElementById('pair-form').requestSubmit();");
  await until(() => viewer.webContents.executeJavaScript("!document.querySelector('.pair-request').hidden"), 'Phone approval did not appear');
  assert.equal(frames, 0, 'No media export before approval');
  await viewer.webContents.executeJavaScript("document.querySelector('.pair-accept').click()");
  await until(() => frames >= 10 && nonblack, 'Synthetic video did not reach the desktop frame bridge');
  assert.equal(viewer.webContents.backgroundThrottling, false);
  const initial = frames;
  viewer.hide();
  await pause(6500);
  assert.ok(frames - initial >= 30, `Hidden desktop export stalled (${frames - initial} frames)`);
  await viewer.webContents.executeJavaScript("document.querySelector('.mirror').click(); document.querySelector('.rotate').click()");
  const processedStart = frames;
  await until(() => frames > processedStart + 5, 'Processed video did not reach the frame bridge');
  if (process.env.PHONECAM_SCREENSHOTS === '1') {
    await viewer.webContents.executeJavaScript("document.querySelector('.mirror').click(); for(let i=0;i<3;i++) document.querySelector('.rotate').click(); true");
    await pause(200);
    const directory = path.join(__dirname, '..', 'docs', 'images');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'desktop-preview.png'), (await viewer.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(directory, 'phone-preview.png'), (await phone.webContents.capturePage()).toPNG());
  }
  await phone.webContents.executeJavaScript("document.getElementById('phone-start').click()");
  await until(() => viewer.webContents.executeJavaScript("!document.querySelector('.camera-card').classList.contains('connected')"), 'Stopping the phone did not disconnect the desktop');
  console.log(`Desktop smoke test passed: approval, synthetic video, ${frames} exported frames, hidden operation, rotate/mirror, and stop.`);
}).then(async () => {
  for (const callback of cleanup.reverse()) await callback();
  app.exit(0);
}).catch(async error => {
  console.error(error.stack || error);
  for (const window of windows) if (!window.isDestroyed()) {
    try { console.error(await window.webContents.executeJavaScript("JSON.stringify({role:document.body.dataset.role,status:[...document.querySelectorAll('#status,.status,.stream-diagnostics,#stream-settings')].map(x=>x.textContent),videos:[...document.querySelectorAll('video')].map(x=>({ready:x.readyState,w:x.videoWidth,h:x.videoHeight,time:x.currentTime}))})")); } catch {}
  }
  for (const callback of cleanup.reverse()) { try { await callback(); } catch {} }
  app.exit(1);
});
