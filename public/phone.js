const form = document.getElementById('pair-form');
const statusElement = document.getElementById('status');
const actualSettings = document.getElementById('actual-settings');
const cameraSelect = document.getElementById('camera-select');
const preview = document.getElementById('local-video');
const controls = document.getElementById('camera-controls');
const zoom = document.getElementById('zoom');
const zoomValue = document.getElementById('zoom-value');
const focusLock = document.getElementById('focus-lock');
const exposureLock = document.getElementById('exposure-lock');
const exposure = document.getElementById('exposure');
const exposureValue = document.getElementById('exposure-value');
const torch = document.getElementById('torch');
const linkCode = new URLSearchParams(location.search).get('code');
if (linkCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(linkCode)) document.getElementById('pair-code').value = linkCode.toUpperCase();
if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  statusElement.textContent = 'Camera access requires a trusted HTTPS connection. Use USB mode or trust the local Wi-Fi certificate on Android.';
  if (location.protocol === 'https:') document.getElementById('certificate-help').hidden = false;
}
let socket;
let peer;
let stream;
let code;
let pendingCandidates = [];
let preferredFacing = 'environment';
let reconnectTimer;
let retryDelay = 1000;
let reconnectBlocked = false;

function status(message) { statusElement.textContent = message; }
function signal(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function closePeer() { peer?.close(); peer = null; pendingCandidates = []; }
function videoTrack() { return stream?.getVideoTracks()[0]; }
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function cameraErrorMessage(error) {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
    return 'Camera permission is blocked. Allow Camera for Chrome in Android Settings, then reload this page.';
  if (error.name === 'SecurityError' || !window.isSecureContext)
    return 'Camera access needs a trusted HTTPS connection. Install this PC’s PhoneCam certificate on Android, then reopen the page.';
  if (['NotReadableError', 'AbortError'].includes(error.name))
    return `Android could not start the camera. Check the Camera access toggle, close other camera tabs, and restart Chrome. ${error.message}`;
  if (error.name === 'NotFoundError')
    return 'Android could not find a usable camera. Try the other lens or restart Chrome.';
  return `${error.name || 'Camera error'}: ${error.message}`;
}

function sendCameraState() {
  const track = videoTrack();
  if (!track) return;
  const caps = track.getCapabilities?.() || {};
  const settings = track.getSettings();
  signal({ type: 'camera-state', zoom: caps.zoom ? {
    min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1,
    value: settings.zoom || caps.zoom.min
  } : null, focusSupported: Boolean(caps.pointsOfInterest) });
}

function retryConnection() {
  if (!stream || reconnectTimer || reconnectBlocked) return;
  closePeer();
  const delay = retryDelay;
  status(`Reconnecting to PC in ${Math.round(delay / 1000)}s…`);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  retryDelay = Math.min(delay * 2, 10_000);
}

async function applyCandidates() {
  while (pendingCandidates.length && peer?.remoteDescription) await peer.addIceCandidate(pendingCandidates.shift());
}

function makePeer() {
  closePeer();
  const connection = new RTCPeerConnection({ iceServers: [] });
  peer = connection;
  connection.onicecandidate = event => { if (event.candidate) signal({ type: 'candidate', candidate: event.candidate }); };
  connection.onconnectionstatechange = () => {
    if (peer !== connection) return;
    if (connection.connectionState === 'connected') status('Connected to PC');
    if (connection.connectionState === 'failed') socket?.close();
    if (connection.connectionState === 'disconnected') {
      status('Connection interrupted');
      setTimeout(() => { if (peer === connection && connection.connectionState === 'disconnected') socket?.close(); }, 5000);
    }
  };
  for (const track of stream.getTracks()) connection.addTrack(track, stream);
  return connection;
}

function connect() {
  const current = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`);
  socket = current;
  current.onopen = () => { retryDelay = 1000; signal({ type: 'join', role: 'phone', code }); };
  current.onmessage = async event => {
    const message = JSON.parse(event.data);
    try {
      if (message.type === 'error') {
        status(message.message);
        if (message.message.includes('Pairing code unavailable')) { reconnectBlocked = true; current.close(); }
        return;
      }
      if (message.type === 'joined') { status('Waiting for PC…'); return; }
      if (message.type === 'paired') {
        status('Pairing…');
        sendCameraState();
        const pc = makePeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal({ type: 'offer', sdp: pc.localDescription });
        return;
      }
      if (message.type === 'answer' && peer) { await peer.setRemoteDescription(message.sdp); await applyCandidates(); return; }
      if (message.type === 'candidate') {
        if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate);
        else pendingCandidates.push(message.candidate);
        return;
      }
      if (message.type === 'control' && message.action === 'pause' && typeof message.enabled === 'boolean') {
        for (const track of stream?.getTracks() || []) track.enabled = !message.enabled;
        status(message.enabled ? 'Paused from PC' : 'Streaming to PC');
        return;
      }
      if (message.type === 'control' && message.action === 'switch-camera') { await switchCamera(); return; }
      if (message.type === 'control' && message.action === 'zoom') {
        const caps = videoTrack()?.getCapabilities?.();
        if (caps?.zoom && message.value >= caps.zoom.min && message.value <= caps.zoom.max) {
          await videoTrack().applyConstraints({ advanced: [{ zoom: message.value }] });
          showCapabilities();
          sendCameraState();
        }
        return;
      }
      if (message.type === 'control' && message.action === 'focus') {
        if (videoTrack()?.getCapabilities?.().pointsOfInterest) {
          await videoTrack().applyConstraints({ advanced: [{ pointsOfInterest: [{ x: message.x, y: message.y }], focusMode: 'single-shot' }] });
        }
        return;
      }
      if (message.type === 'peer-left') { closePeer(); status('PC disconnected'); }
    } catch (error) { status(`Connection error: ${error.message}`); }
  };
  current.onerror = () => status('Signaling error');
  current.onclose = () => { if (socket === current) retryConnection(); };
}

async function listCameras() {
  const selected = cameraSelect.value;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter(device => device.kind === 'videoinput');
  if (!cameras.length) return;
  cameraSelect.replaceChildren();
  for (const [index, device] of cameras.entries()) {
    const option = document.createElement('option');
    option.value = `device:${device.deviceId}`;
    option.textContent = device.label || `Camera ${index + 1}`;
    cameraSelect.append(option);
  }
  const current = videoTrack()?.getSettings()?.deviceId;
  const preferred = selected.startsWith('device:') ? selected : `device:${current}`;
  if ([...cameraSelect.options].some(option => option.value === preferred)) cameraSelect.value = preferred;
}

function showCapabilities() {
  const track = videoTrack();
  if (!track) return;
  const settings = track.getSettings();
  actualSettings.textContent = `Actual: ${settings.width || '?'} × ${settings.height || '?'} at ${Math.round(settings.frameRate || 0)} fps`;
  const caps = track.getCapabilities?.() || {};
  controls.hidden = false;
  zoom.disabled = !caps.zoom;
  if (caps.zoom) {
    zoom.min = String(caps.zoom.min);
    zoom.max = String(caps.zoom.max);
    zoom.step = String(caps.zoom.step || 0.1);
    zoom.value = String(settings.zoom || caps.zoom.min);
    zoomValue.textContent = `${Number(zoom.value).toFixed(1)}×`;
  } else zoomValue.textContent = 'Unavailable';
  focusLock.disabled = !caps.focusMode?.includes('manual');
  focusLock.checked = settings.focusMode === 'manual';
  exposureLock.disabled = !caps.exposureMode?.includes('manual');
  exposureLock.checked = settings.exposureMode === 'manual';
  exposure.disabled = !caps.exposureCompensation;
  if (caps.exposureCompensation) {
    exposure.min = String(caps.exposureCompensation.min);
    exposure.max = String(caps.exposureCompensation.max);
    exposure.step = String(caps.exposureCompensation.step || 0.1);
    exposure.value = String(settings.exposureCompensation || 0);
    exposureValue.textContent = Number(exposure.value).toFixed(1);
  } else exposureValue.textContent = 'Unavailable';
  torch.disabled = !caps.torch;
  torch.checked = Boolean(settings.torch);
}

async function restartCapture() {
  const value = cameraSelect.value;
  const [width, height] = document.getElementById('resolution').value.split('x').map(Number);
  const frameRate = Number(document.getElementById('frame-rate').value);
  const video = {
    width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate }
  };
  if (value.startsWith('device:')) video.deviceId = { exact: value.slice(7) };
  else { video.facingMode = value.slice(7); preferredFacing = value.slice(7); }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    preview.srcObject = null;
    await wait(300);
  }
  const alternateFacing = preferredFacing === 'user' ? 'environment' : 'user';
  const lowQuality = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } };
  const attempts = [video, { ...lowQuality, facingMode: { ideal: preferredFacing } },
    { ...lowQuality, facingMode: { ideal: alternateFacing } }, lowQuality];
  let lastError;
  for (const [index, constraints] of attempts.entries()) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      if (index) status(`Camera started with fallback settings (${index + 1}/${attempts.length})`);
      break;
    } catch (error) {
      lastError = error;
      if (!['NotReadableError', 'AbortError', 'NotFoundError', 'OverconstrainedError'].includes(error.name)) break;
      if (index < attempts.length - 1) {
        status(`Camera did not start; trying another mode (${index + 2}/${attempts.length})…`);
        await wait(300);
      }
    }
  }
  if (!stream) throw lastError;
  if (document.getElementById('send-audio').checked) {
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      for (const track of audio.getAudioTracks()) stream.addTrack(track);
    } catch (error) { status(`Microphone unavailable: ${error.message}. Video will continue.`); }
  }
  preview.srcObject = stream;
  await preview.play();
  showCapabilities();
  preferredFacing = videoTrack()?.getSettings().facingMode || preferredFacing;
  await listCameras();
}

async function switchCamera() {
  const nextFacing = preferredFacing === 'user' ? 'environment' : 'user';
  const [width, height] = document.getElementById('resolution').value.split('x').map(Number);
  const frameRate = Number(document.getElementById('frame-rate').value);
  let replacement;
  try {
    const capture = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: nextFacing }, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
      audio: false
    });
    replacement = capture.getVideoTracks()[0];
    const sender = peer?.getSenders().find(item => item.track?.kind === 'video');
    if (sender) await sender.replaceTrack(replacement);
    const previous = videoTrack();
    stream.removeTrack(previous);
    stream.addTrack(replacement);
    previous.stop();
    preview.srcObject = stream;
    await preview.play();
    preferredFacing = nextFacing;
    showCapabilities();
    sendCameraState();
    await listCameras();
    status(`Switched to ${nextFacing === 'user' ? 'front' : 'rear'} camera`);
  } catch (error) {
    replacement?.stop();
    status(`Could not switch camera: ${error.message}`);
  }
}

form.onsubmit = async event => {
  event.preventDefault();
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  retryDelay = 1000;
  reconnectBlocked = false;
  code = document.getElementById('pair-code').value.toUpperCase().trim();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) { status('Enter the six-character code on your PC'); return; }
  try {
    if (socket && socket.readyState < WebSocket.CLOSING) {
      const previous = socket;
      const closed = new Promise(resolve => previous.addEventListener('close', resolve, { once: true }));
      previous.close();
      await closed;
    }
    closePeer();
    await restartCapture();
    connect();
  } catch (error) { status(cameraErrorMessage(error)); }
};

zoom.oninput = async () => {
  zoomValue.textContent = `${Number(zoom.value).toFixed(1)}×`;
  try { await videoTrack().applyConstraints({ advanced: [{ zoom: Number(zoom.value) }] }); }
  catch (error) { status(`Zoom unavailable: ${error.message}`); }
  sendCameraState();
};
focusLock.onchange = async () => {
  try { await videoTrack().applyConstraints({ advanced: [{ focusMode: focusLock.checked ? 'manual' : 'continuous' }] }); }
  catch (error) { status(`Focus control unavailable: ${error.message}`); }
};
exposureLock.onchange = async () => {
  try { await videoTrack().applyConstraints({ advanced: [{ exposureMode: exposureLock.checked ? 'manual' : 'continuous' }] }); }
  catch (error) { exposureLock.checked = !exposureLock.checked; status(`Exposure control unavailable: ${error.message}`); }
};
exposure.oninput = async () => {
  exposureValue.textContent = Number(exposure.value).toFixed(1);
  try { await videoTrack().applyConstraints({ advanced: [{ exposureCompensation: Number(exposure.value) }] }); }
  catch (error) { status(`Exposure adjustment unavailable: ${error.message}`); }
};
torch.onchange = async () => {
  try { await videoTrack().applyConstraints({ advanced: [{ torch: torch.checked }] }); }
  catch (error) { status(`Flashlight unavailable: ${error.message}`); }
};
preview.onclick = async event => {
  const track = videoTrack();
  if (!track?.getCapabilities?.().pointsOfInterest) return;
  const bounds = preview.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  try { await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }] }); }
  catch (error) { status(`Tap focus unavailable: ${error.message}`); }
};
