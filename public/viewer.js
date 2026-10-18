import { videoStats } from './stream-quality.js';

const grid = document.getElementById('streams');
const cameras = new Set();
let selectedCamera = null;
const menu = document.getElementById('studio-menu');
const scrim = document.getElementById('panel-scrim');
const toolbarSnapshot = document.getElementById('toolbar-snapshot');
const toolbarRecord = document.getElementById('toolbar-record');
const toolbarSettings = document.getElementById('toolbar-settings');
const toolbarMenu = document.getElementById('toolbar-menu');
window.phoneCamSelectedPreview = () => selectedCamera
  ? (processedOutput(selectedCamera) ? selectedCamera.preview : selectedCamera.source) : null;

function closePanels() {
  document.body.classList.remove('connect-open', 'settings-open');
  menu.hidden = true;
  scrim.hidden = true;
  toolbarMenu.setAttribute('aria-expanded', 'false');
  toolbarSettings.setAttribute('aria-expanded', 'false');
}

function openPanel(name) {
  const wasOpen = document.body.classList.contains(`${name}-open`);
  closePanels();
  if (wasOpen) return;
  document.body.classList.add(`${name}-open`);
  scrim.hidden = false;
  if (name === 'settings') toolbarSettings.setAttribute('aria-expanded', 'true');
}

function updateToolbar() {
  const camera = selectedCamera;
  const statusText = camera?.status.textContent || 'Waiting for phone';
  document.querySelector('.toolbar-status-text').textContent = statusText;
  const connected = Boolean(camera?.stream);
  toolbarSnapshot.disabled = !connected;
  toolbarRecord.disabled = !connected;
  const recording = camera?.recorder?.state === 'recording';
  toolbarRecord.classList.toggle('is-recording', recording);
  toolbarRecord.title = recording ? 'Stop recording' : 'Start recording';
  toolbarRecord.setAttribute('aria-label', toolbarRecord.title);
  document.getElementById('camera-count').textContent = `(${cameras.size})`;
}

function processedOutput(camera) {
  return camera.mirrored || camera.rotation !== 0 || camera.effect.value !== 'none' ||
    camera.overlayImage || [...camera.colorInputs].some(input => Number(input.value) !== Number(input.dataset.default));
}

function videoFilter(camera) {
  const value = name => Number(camera.card.querySelector(`[data-color="${name}"]`).value);
  const parts = [
    `brightness(${value('brightness')}%)`, `contrast(${value('contrast')}%)`,
    `saturate(${value('saturation')}%)`, `hue-rotate(${value('hue')}deg)`
  ];
  if (camera.effect.value === 'mono') parts.push('grayscale(1)');
  if (camera.effect.value === 'warm') parts.push('sepia(.55)', 'saturate(1.25)');
  if (camera.effect.value === 'soft') parts.push('blur(3px)');
  return parts.join(' ');
}

function signal(camera, message) {
  if (camera.socket?.readyState === WebSocket.OPEN) camera.socket.send(JSON.stringify(message));
}

function status(camera, message) {
  camera.status.textContent = message;
  if (selectedCamera === camera) document.querySelector('.connection-label').lastChild.textContent = ` ${message}`;
  if (selectedCamera === camera) updateToolbar();
}

function selectCamera(camera) {
  if (selectedCamera === camera) return;
  for (const item of cameras) item.card.classList.toggle('selected', item === camera);
  selectedCamera = camera;
  document.querySelector('.connection-label').lastChild.textContent = ` ${camera.status.textContent}`;
  window.phoneCamDesktop?.clearFrame();
  updateToolbar();
}

function stopPeer(camera) {
  camera.card.querySelector('.pair-request').hidden = true;
  clearInterval(camera.statsTimer);
  camera.previousStats = null;
  camera.stalledSamples = 0;
  camera.recoveryRequested = false;
  if (camera.recorder?.state === 'recording') camera.recorder.stop();
  camera.peer?.close();
  camera.peer = null;
  camera.pendingCandidates = [];
  camera.source.srcObject = null;
  camera.audio.srcObject = null;
  camera.stream = null;
  if (selectedCamera === camera) window.phoneCamDesktop?.clearFrame();
  camera.card.classList.remove('connected');
  camera.paused = false;
  camera.pauseButton.textContent = 'Pause';
  camera.recordButton.disabled = true;
  camera.snapshotButton.disabled = true;
  camera.audioButton.disabled = true;
  camera.pauseButton.disabled = true;
  camera.switchButton.disabled = true;
  camera.zoomInput.disabled = true;
  camera.zoomValue.textContent = 'Unavailable';
  camera.focusSupported = false;
  camera.focusHint.textContent = 'Tap focus unavailable on this phone';
  camera.preview.width = 1;
  camera.preview.height = 1;
  camera.details.textContent = 'Waiting for video';
  camera.diagnostics.textContent = 'Waiting for phone video…';
  updateToolbar();
}

function retryConnection(camera) {
  if (!cameras.has(camera) || camera.retryTimer || camera.reconnectBlocked) return;
  stopPeer(camera);
  const delay = camera.retryDelay || 1000;
  status(camera, `Reconnecting in ${Math.round(delay / 1000)}s…`);
  camera.retryTimer = setTimeout(() => {
    camera.retryTimer = null;
    if (cameras.has(camera)) connect(camera);
  }, delay);
  camera.retryDelay = Math.min(delay * 2, 10_000);
}

function renderFrame(camera) {
  if (!cameras.has(camera)) return;
  const video = camera.source;
  const canvas = camera.preview;
  const needsProcessing = processedOutput(camera);
  camera.card.classList.toggle('direct-preview', !needsProcessing);
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const rotated = camera.rotation % 180 !== 0;
    const outputWidth = rotated ? video.videoHeight : video.videoWidth;
    const outputHeight = rotated ? video.videoWidth : video.videoHeight;
    const processingScale = Math.min(1, 1920 / Math.max(outputWidth, outputHeight));
    const processedWidth = Math.round(outputWidth * processingScale);
    const processedHeight = Math.round(outputHeight * processingScale);
    if (needsProcessing && (canvas.width !== processedWidth || canvas.height !== processedHeight)) {
      canvas.width = processedWidth;
      canvas.height = processedHeight;
      canvas.style.aspectRatio = `${outputWidth} / ${outputHeight}`;
    }
    if (needsProcessing) {
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.save();
      ctx.scale(processingScale, processingScale);
      if (camera.mirrored) { ctx.translate(outputWidth, 0); ctx.scale(-1, 1); }
      if (camera.rotation === 90) { ctx.translate(outputWidth, 0); ctx.rotate(Math.PI / 2); }
      else if (camera.rotation === 180) { ctx.translate(outputWidth, outputHeight); ctx.rotate(Math.PI); }
      else if (camera.rotation === 270) { ctx.translate(0, outputHeight); ctx.rotate(-Math.PI / 2); }
      const filter = camera.effect.value;
      ctx.filter = videoFilter(camera);
      if (filter === 'pixel') {
        const small = camera.pixelCanvas;
        small.width = Math.max(1, Math.round(video.videoWidth / 24));
        small.height = Math.max(1, Math.round(video.videoHeight / 24));
        small.getContext('2d').drawImage(video, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, video.videoWidth, video.videoHeight);
      } else ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      ctx.restore();
      if (camera.overlayImage) ctx.drawImage(camera.overlayImage, 0, 0, canvas.width, canvas.height);
    }
    if (camera === selectedCamera && window.phoneCamDesktop?.sendFrame &&
        performance.now() - (camera.lastExport || 0) >= 33) {
      camera.lastExport = performance.now();
      const bridge = camera.bridgeCanvas;
      const bridgeContext = bridge.getContext('2d', { alpha: false, willReadFrequently: true });
      bridgeContext.fillStyle = '#000';
      bridgeContext.fillRect(0, 0, bridge.width, bridge.height);
      const source = needsProcessing ? canvas : video;
      const sourceWidth = needsProcessing ? canvas.width : video.videoWidth;
      const sourceHeight = needsProcessing ? canvas.height : video.videoHeight;
      const scale = Math.min(bridge.width / sourceWidth, bridge.height / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      bridgeContext.drawImage(source, (bridge.width - width) / 2, (bridge.height - height) / 2, width, height);
      window.phoneCamDesktop.sendFrame(bridgeContext.getImageData(0, 0, bridge.width, bridge.height).data);
    }
  }
  // Camera consumers need frames even when Windows stops painting our window.
  // requestAnimationFrame can stop with the compositor when minimized/occluded.
  camera.frameTimer = setTimeout(() => renderFrame(camera), 33);
}

function makePeer(camera) {
  stopPeer(camera);
  const peer = new RTCPeerConnection({ iceServers: [] });
  camera.peer = peer;
  peer.onicecandidate = event => { if (event.candidate) signal(camera, { type: 'candidate', candidate: event.candidate }); };
  peer.ontrack = event => {
    const incoming = event.streams[0];
    if (!incoming) return;
    camera.stream = incoming;
    camera.card.classList.add('connected');
    camera.source.srcObject = incoming;
    camera.source.play().catch(() => {});
    const updateAudio = () => {
      const tracks = incoming.getAudioTracks();
      camera.audio.srcObject = tracks.length ? new MediaStream(tracks) : null;
      camera.audioButton.disabled = tracks.length === 0;
    };
    updateAudio();
    incoming.addEventListener('addtrack', updateAudio);
    camera.recordButton.disabled = false;
    camera.snapshotButton.disabled = false;
    camera.pauseButton.disabled = false;
    camera.switchButton.disabled = false;
    camera.details.textContent = 'Live video';
    updateToolbar();
    const settings = incoming.getVideoTracks()[0]?.getSettings();
    if (settings?.width) camera.details.textContent = `${settings.width} × ${settings.height}${settings.frameRate ? ` · ${Math.round(settings.frameRate)} fps` : ''}`;
  };
  peer.onconnectionstatechange = () => {
    if (camera.peer !== peer) return;
    if (peer.connectionState === 'connected') status(camera, 'Connected');
    if (peer.connectionState === 'failed') camera.socket?.close();
    if (peer.connectionState === 'disconnected') {
      status(camera, 'Connection interrupted');
      setTimeout(() => {
        if (camera.peer === peer && peer.connectionState === 'disconnected') camera.socket?.close();
      }, 5000);
    }
  };
  camera.statsTimer = setInterval(async () => {
    if (camera.peer !== peer || peer.connectionState !== 'connected') return;
    try {
      const current = videoStats(await peer.getStats(), 'inbound');
      if (!current) return;
      const previous = camera.previousStats;
      const bitrate = previous && current.timestamp > previous.timestamp
        ? Math.max(0, 8 * (current.bytes - previous.bytes) / (current.timestamp - previous.timestamp) / 1000).toFixed(1) : '0.0';
      const dimensions = `${current.width || camera.source.videoWidth || '?'} × ${current.height || camera.source.videoHeight || '?'}`;
      const stalled = previous && current.frames !== null && previous.frames !== null && current.frames <= previous.frames;
      camera.diagnostics.textContent = `${dimensions} · ${current.fps} fps · ${current.codec} · ${bitrate} Mb/s${current.packetsLost ? ` · ${current.packetsLost} lost packets` : ''}${current.framesDropped ? ` · ${current.framesDropped} dropped frames` : ''}${stalled ? ' · video stalled' : ''}`;
      camera.details.textContent = camera.diagnostics.textContent;
      camera.previousStats = current;
      camera.stalledSamples = stalled && !camera.paused && !camera.source.videoWidth ? camera.stalledSamples + 1 : 0;
      if (camera.stalledSamples >= 3 && !camera.recoveryRequested) {
        camera.recoveryRequested = true;
        signal(camera, { type: 'control', action: 'reduce-quality' });
        status(camera, 'Video stalled · requesting a lower stream mode');
      }
      if (stalled && camera.stream) status(camera, 'Connected · waiting for video frames');
      else if (camera.status.textContent.includes('waiting for video frames')) status(camera, 'Connected');
    } catch { /* WebRTC stats may be unavailable on older browser versions. */ }
  }, 2000);
  return peer;
}

async function applyCandidates(camera) {
  while (camera.pendingCandidates.length && camera.peer?.remoteDescription) {
    await camera.peer.addIceCandidate(camera.pendingCandidates.shift());
  }
}

function connect(camera) {
  camera.socket?.close();
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`);
  camera.socket = socket;
  socket.onopen = () => {
    camera.retryDelay = 1000;
    signal(camera, { type: 'join', role: 'viewer', code: camera.code, viewerToken: camera.viewerToken });
  };
  socket.onmessage = async event => {
    if (camera.socket !== socket) return;
    const message = JSON.parse(event.data);
    try {
      if (message.type === 'error') {
        status(camera, message.message);
        if (/Pairing code unavailable|Session ended|Too many pairing/.test(message.message)) {
          camera.reconnectBlocked = true;
          socket.close();
        }
        return;
      }
      if (message.type === 'joined') { status(camera, 'Waiting for phone…'); return; }
      if (message.type === 'pair-request') {
        camera.card.querySelector('.pair-request').hidden = false;
        status(camera, 'Approve the phone connection');
        return;
      }
      if (message.type === 'paired') {
        camera.card.querySelector('.pair-request').hidden = true;
        if (camera === selectedCamera) closePanels();
        status(camera, 'Pairing…'); return;
      }
      if (message.type === 'camera-state') {
        const zoom = message.zoom;
        if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) &&
            zoom.min >= 0.1 && zoom.max <= 100 && zoom.max > zoom.min) {
          camera.zoomInput.min = String(zoom.min);
          camera.zoomInput.max = String(zoom.max);
          camera.zoomInput.step = String(zoom.step || 0.1);
          camera.zoomInput.value = String(zoom.value || zoom.min);
          camera.zoomInput.disabled = false;
          camera.zoomValue.textContent = `${Number(camera.zoomInput.value).toFixed(1)}×`;
        } else { camera.zoomInput.disabled = true; camera.zoomValue.textContent = 'Unavailable'; }
        camera.focusSupported = Boolean(message.focusSupported);
        camera.focusHint.textContent = camera.focusSupported ? 'Click the video to focus' : 'Tap focus unavailable on this phone';
        return;
      }
      if (message.type === 'offer') {
        const peer = makePeer(camera);
        await peer.setRemoteDescription(message.sdp);
        await applyCandidates(camera);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        signal(camera, { type: 'answer', sdp: peer.localDescription });
        return;
      }
      if (message.type === 'candidate') {
        if (camera.peer?.remoteDescription) await camera.peer.addIceCandidate(message.candidate);
        else camera.pendingCandidates.push(message.candidate);
        return;
      }
      if (message.type === 'peer-left') { stopPeer(camera); status(camera, 'Phone disconnected'); }
    } catch (error) { status(camera, `Connection error: ${error.message}`); }
  };
  socket.onerror = () => { if (camera.socket === socket) status(camera, 'Signaling error'); };
  socket.onclose = () => { if (camera.socket === socket) retryConnection(camera); };
}

async function newCode(camera) {
  signal(camera, { type: 'end-session' });
  camera.socket?.close();
  camera.socket = null;
  clearTimeout(camera.retryTimer);
  camera.retryTimer = null;
  camera.retryDelay = 1000;
  camera.reconnectBlocked = false;
  stopPeer(camera);
  const response = await fetch('/api/room', { method: 'POST', headers: { 'X-PhoneCam-Client': 'viewer' } });
  if (!response.ok) throw new Error('Could not create a pairing code');
  const room = await response.json();
  camera.code = room.code;
  camera.viewerToken = room.viewerToken;
  camera.codeElement.textContent = camera.code;
  updatePairQr(camera);
  connect(camera);
}

function updatePairQr(camera) {
  camera.pairQr.hidden = !camera.wifiAddressValue || !camera.code;
  if (!camera.pairQr.hidden) camera.pairQr.src = `/api/qr?address=${encodeURIComponent(camera.wifiAddressValue)}&code=${camera.code}`;
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `PhoneCam-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function snapshot(camera) {
  if (!camera.stream || !camera.source.videoWidth) return;
  const source = processedOutput(camera) ? camera.preview : camera.source;
  const width = source.videoWidth || source.width;
  const height = source.videoHeight || source.height;
  const snapshotCanvas = document.createElement('canvas');
  snapshotCanvas.width = width;
  snapshotCanvas.height = height;
  snapshotCanvas.getContext('2d').drawImage(source, 0, 0, width, height);
  snapshotCanvas.toBlob(blob => { if (blob) download(blob, 'png'); }, 'image/png');
}

function toggleRecording(camera) {
  if (camera.recorder?.state === 'recording') { camera.recorder.stop(); return; }
  if (!camera.stream) return;
  try {
    if (!window.MediaRecorder) throw new Error('Recording is unavailable in this browser');
    const useProcessed = processedOutput(camera);
    const recordingStream = useProcessed ? camera.preview.captureStream(30) : camera.stream;
    if (useProcessed) for (const track of camera.stream.getAudioTracks()) recordingStream.addTrack(track);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find(type => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    const recorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined);
    camera.recorder = recorder;
    camera.discardRecording = false;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => status(camera, `Recording error: ${event.error?.message || 'unknown error'}`);
    recorder.onstop = () => {
      if (chunks.length && !camera.discardRecording) download(new Blob(chunks, { type: recorder.mimeType }), recorder.mimeType.includes('mp4') ? 'mp4' : 'webm');
      camera.recordButton.textContent = 'Record';
      camera.cancelButton.disabled = true;
      camera.recorder = null;
      updateToolbar();
      if (useProcessed) for (const track of recordingStream.getVideoTracks()) track.stop();
    };
    recorder.start(1000);
    camera.recordButton.textContent = 'Stop recording';
    camera.cancelButton.disabled = false;
    updateToolbar();
  } catch (error) { status(camera, `Recording error: ${error.message}`); }
}

function discardRecording(camera) {
  if (camera.recorder?.state !== 'recording') return;
  camera.discardRecording = true;
  camera.recorder.stop();
  status(camera, 'Recording discarded');
}

function togglePause(camera) {
  if (!camera.stream) return;
  camera.paused = !camera.paused;
  signal(camera, { type: 'control', action: 'pause', enabled: camera.paused });
  camera.pauseButton.textContent = camera.paused ? 'Resume' : 'Pause';
}

async function showConnection(camera) {
  try {
    const response = await fetch('/api/connectivity');
    if (!response.ok) throw new Error('Could not read network information');
    const info = await response.json();
    const preferred = info.wifi.find(item => item.certificateMatches) || info.wifi[0];
    camera.wifiAddressValue = preferred?.address || '';
    camera.wifiUrl = preferred?.url || '';
    updatePairQr(camera);
    camera.wifiAddress.textContent = preferred?.url || 'No Wi-Fi address found';
    camera.wifiNote.textContent = !info.tlsReady ? 'Wi-Fi setup needs a local HTTPS certificate.'
      : !preferred ? 'Connect this PC to Wi-Fi to show an address.'
      : !preferred.certificateMatches ? 'The PC address changed. PhoneCam is refreshing its Wi-Fi certificate; try again in a minute.'
      : 'Copy address includes the pairing code. Android must trust this PC’s local certificate for camera access.';
    if (preferred && info.certificateAvailable) {
      const link = document.createElement('a');
      link.href = preferred.url.replace(/\/phone$/, '/phonecam-ca.crt');
      link.textContent = 'Download Wi-Fi certificate on Android';
      camera.wifiNote.append(document.createElement('br'), link);
    }
    camera.copyButton.disabled = !preferred;
    camera.usbAddress.textContent = info.usbUrl;
  } catch (error) {
    camera.wifiAddressValue = '';
    updatePairQr(camera);
    camera.wifiAddress.textContent = 'Wi-Fi address unavailable';
    camera.wifiNote.textContent = error.message;
  }
}

function connectionMode(camera, mode) {
  camera.card.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  camera.card.querySelector('.wifi-instructions').hidden = mode !== 'wifi';
  camera.card.querySelector('.usb-instructions').hidden = mode !== 'usb';
}

function addCamera() {
  const card = document.createElement('section');
  card.className = 'card camera-card';
  card.innerHTML = `<div class="camera-layout"><div class="video-column"><div class="preview-heading"><div><strong>Live preview</strong><span class="details small">Waiting for video</span></div><div class="preview-actions"><button class="popout-feed secondary" type="button">Open feed window</button><button class="danger remove" type="button">Remove camera</button></div></div><div class="preview-shell"><video class="source-video" autoplay muted playsinline></video><canvas class="preview"></canvas><button class="exit-feed-fullscreen" type="button">Exit fullscreen</button><div class="empty-state"><div class="connection-art" aria-hidden="true"><span class="phone-art"></span><span class="connection-waves">◌ ◌</span><span class="monitor-art"></span></div><strong>Waiting for phone</strong><span>Use the connection button below to pair your phone</span></div></div><div class="camera-state"><span class="state-dot"></span><span class="status">Creating room…</span></div><audio autoplay muted></audio><div class="control-panel"><div class="panel-title">Camera controls</div><div class="control-grid"><button class="switch-camera secondary" disabled>⇄ <span>Switch camera</span></button><button class="mirror secondary" aria-pressed="false">⇋ <span>Mirror</span></button><button class="rotate secondary">⟳ <span>Rotate 90°</span></button><button class="pause secondary" disabled>⏸ <span>Pause</span></button><button class="audio-button secondary" disabled>♪ <span>Unmute</span></button></div><div class="effect-row"><label class="label">Video effect</label><select class="effect"><option value="none">None</option><option value="mono">Monochrome</option><option value="warm">Warm</option><option value="soft">Soft focus</option><option value="pixel">Mosaic</option></select></div></div><div class="capture-bar"><button class="snapshot secondary" disabled>◎ Snapshot</button><button class="record secondary" disabled>● Record</button></div></div><aside class="connect-panel"><div class="panel-title">Connect your phone</div><p class="connect-intro">Choose how your Android phone reaches this PC.</p><div class="mode-tabs" role="tablist" aria-label="Connection method"><button type="button" data-mode="wifi" class="active" role="tab" aria-selected="true">◉ Wi-Fi</button><button type="button" data-mode="usb" role="tab" aria-selected="false">⚡ USB</button></div><div class="wifi-instructions"><div class="step"><b>1</b><div><strong>Same Wi-Fi</strong><p>Connect your phone and this PC to the same network.</p></div></div><div class="step"><b>2</b><div><strong>Open on Android Chrome</strong><div class="address wifi-address">Finding PC address…</div><button type="button" class="copy-link secondary">Copy address</button><p class="wifi-note"></p></div></div></div><div class="usb-instructions" hidden><div class="step"><b>1</b><div><strong>Connect USB cable</strong><p>Enable USB debugging, then allow this PC on your phone.</p></div></div><div class="step"><b>2</b><div><strong>Open on Android Chrome</strong><div class="address usb-address">http://localhost:8080/phone</div><p>ADB reverse forwarding must be active on this PC.</p></div></div></div><div class="step code-step"><b>3</b><div><strong>Enter this pairing code</strong><div class="code">······</div><button class="new-code secondary" type="button">Get new code</button></div></div><p class="connect-footer">Allow camera access on your phone and tap <strong>Start camera</strong>. The live feed will appear here.</p></aside></div>`;
  card.querySelector('.video-column').insertAdjacentHTML('beforeend', '<section class="pair-request" role="alert" hidden><strong>Allow this phone to connect?</strong><p>Accept only if you just scanned this PC’s QR code or entered its pairing code on your phone.</p><div><button type="button" class="pair-accept">Accept phone</button><button type="button" class="pair-decline">Decline</button></div></section>');
  for (const [selector, approve] of [['.pair-accept', true], ['.pair-decline', false]]) {
    card.querySelector(selector).onclick = event => {
      event.stopPropagation();
      signal(camera, { type: 'pair-decision', approve });
      card.querySelector('.pair-request').hidden = true;
      if (!approve) status(camera, 'Phone connection declined');
    };
  }
  for (const panel of card.querySelectorAll('.control-panel,.connect-panel')) {
    panel.insertAdjacentHTML('afterbegin', '<button type="button" class="panel-close" aria-label="Close panel">×</button>');
    panel.querySelector('.panel-close').onclick = closePanels;
  }
  card.querySelector('.effect-row').insertAdjacentHTML('afterend', `<details class="color-panel"><summary>Color and overlay</summary><div class="color-grid"><label>Brightness <input data-color="brightness" data-default="100" type="range" min="0" max="200" value="100"></label><label>Contrast <input data-color="contrast" data-default="100" type="range" min="0" max="200" value="100"></label><label>Saturation <input data-color="saturation" data-default="100" type="range" min="0" max="200" value="100"></label><label>Hue <input data-color="hue" data-default="0" type="range" min="-180" max="180" value="0"></label></div><label class="overlay-label">Overlay image <input class="overlay-file" type="file" accept="image/*"></label><button type="button" class="remove-overlay secondary">Remove overlay</button><button type="button" class="reset-color secondary">Reset color</button></details>`);
  card.querySelector('.effect-row').insertAdjacentHTML('afterend', '<div class="pc-zoom"><label>Phone zoom <input class="pc-zoom-input" type="range" min="1" max="2" step="0.1" value="1" disabled></label><span class="pc-zoom-value">Unavailable</span></div><p class="focus-hint">Tap focus unavailable on this phone</p>');
  card.querySelector('.capture-bar').insertAdjacentHTML('beforeend', '<button class="cancel-recording secondary" disabled>Discard recording</button>');
  card.querySelector('.control-panel .panel-title').insertAdjacentHTML('afterend', '<p class="stream-diagnostics small">Waiting for phone video…</p>');
  card.querySelector('.stream-diagnostics').insertAdjacentHTML('afterend', '<p class="gpu-diagnostics small">GPU video decode: checking…</p>');
  card.querySelector('.wifi-address').insertAdjacentHTML('afterend', '<img class="pair-qr" alt="Scan with Android camera to open PhoneCam with this pairing code" hidden>');
  const camera = {
    card, codeElement: card.querySelector('.code'), status: card.querySelector('.status'),
    details: card.querySelector('.details'), diagnostics: card.querySelector('.stream-diagnostics'), source: card.querySelector('video'),
    preview: card.querySelector('canvas'), audio: card.querySelector('audio'),
    recordButton: card.querySelector('.record'), snapshotButton: card.querySelector('.snapshot'),
    cancelButton: card.querySelector('.cancel-recording'), colorInputs: card.querySelectorAll('[data-color]'),
    zoomInput: card.querySelector('.pc-zoom-input'), zoomValue: card.querySelector('.pc-zoom-value'),
    focusHint: card.querySelector('.focus-hint'), focusSupported: false,
    pauseButton: card.querySelector('.pause'), audioButton: card.querySelector('.audio-button'),
    switchButton: card.querySelector('.switch-camera'),
    wifiAddress: card.querySelector('.wifi-address'), wifiNote: card.querySelector('.wifi-note'), pairQr: card.querySelector('.pair-qr'),
    usbAddress: card.querySelector('.usb-address'), copyButton: card.querySelector('.copy-link'),
    effect: card.querySelector('.effect'), pixelCanvas: document.createElement('canvas'),
    bridgeCanvas: document.createElement('canvas'),
    pendingCandidates: [], mirrored: false, rotation: 0, paused: false
  };
  camera.bridgeCanvas.width = 1280;
  camera.bridgeCanvas.height = 720;
  cameras.add(camera);
  grid.append(card);
  if (window.phoneCamDesktop?.gpuVideoDecodeStatus) {
    let checks = 0;
    const checkGpu = () => window.phoneCamDesktop.gpuVideoDecodeStatus().then(value => {
      card.querySelector('.gpu-diagnostics').textContent = `GPU video decode: ${value} (system capability)`;
      if (value === 'checking' && checks++ < 5) setTimeout(checkGpu, 2000);
    }).catch(() => {});
    checkGpu();
  }
  selectCamera(camera);
  renderFrame(camera);
  card.onclick = () => selectCamera(camera);
  card.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => connectionMode(camera, button.dataset.mode));
  camera.copyButton.onclick = async () => {
    try { await navigator.clipboard.writeText(`${camera.wifiUrl}?code=${camera.code}`); camera.copyButton.textContent = 'Copied'; }
    catch { status(camera, 'Could not copy address. Select and copy the address above.'); }
  };
  camera.snapshotButton.onclick = () => snapshot(camera);
  card.querySelector('.popout-feed').onclick = () => {
    selectCamera(camera);
    if (window.phoneCamDesktop?.openFeedWindow) window.phoneCamDesktop.openFeedWindow();
    else if (!window.open('/feed', '_blank')) status(camera, 'Allow this site to open a feed tab.');
  };
  card.querySelector('.exit-feed-fullscreen').onclick = () => {
    if (window.phoneCamDesktop?.toggleFullscreen) window.phoneCamDesktop.toggleFullscreen();
    else document.exitFullscreen();
  };
  camera.recordButton.onclick = () => toggleRecording(camera);
  camera.cancelButton.onclick = () => discardRecording(camera);
  camera.zoomInput.oninput = () => {
    camera.zoomValue.textContent = `${Number(camera.zoomInput.value).toFixed(1)}×`;
    signal(camera, { type: 'control', action: 'zoom', value: Number(camera.zoomInput.value) });
  };
  card.querySelector('.preview-shell').onclick = event => {
    if (!camera.focusSupported) return;
    const bounds = (processedOutput(camera) ? camera.preview : camera.source).getBoundingClientRect();
    let u = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const v = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    if (camera.mirrored) u = 1 - u;
    const point = camera.rotation === 90 ? { x: v, y: 1 - u }
      : camera.rotation === 180 ? { x: 1 - u, y: 1 - v }
      : camera.rotation === 270 ? { x: 1 - v, y: u } : { x: u, y: v };
    signal(camera, { type: 'control', action: 'focus', ...point });
  };
  card.querySelector('.reset-color').onclick = () => camera.colorInputs.forEach(input => { input.value = input.dataset.default; });
  card.querySelector('.remove-overlay').onclick = () => {
    camera.overlayImage = null;
    card.querySelector('.overlay-file').value = '';
  };
  card.querySelector('.overlay-file').onchange = event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { camera.overlayImage = image; URL.revokeObjectURL(url); };
    image.onerror = () => { URL.revokeObjectURL(url); status(camera, 'Could not load overlay image'); };
    image.src = url;
  };
  camera.pauseButton.onclick = () => togglePause(camera);
  camera.switchButton.onclick = () => signal(camera, { type: 'control', action: 'switch-camera' });
  camera.audioButton.onclick = () => {
    camera.audio.muted = !camera.audio.muted;
    camera.audioButton.textContent = camera.audio.muted ? 'Unmute' : 'Mute';
    if (!camera.audio.muted) camera.audio.play().catch(() => {});
  };
  card.querySelector('.mirror').onclick = event => { camera.mirrored = !camera.mirrored; event.currentTarget.setAttribute('aria-pressed', String(camera.mirrored)); };
  card.querySelector('.rotate').onclick = () => { camera.rotation = (camera.rotation + 90) % 360; card.querySelector('.rotate span').textContent = `Rotate ${camera.rotation}°`; };
  card.querySelector('.new-code').onclick = () => newCode(camera).catch(error => status(camera, error.message));
  card.querySelector('.remove').onclick = () => {
    signal(camera, { type: 'end-session' });
    clearTimeout(camera.retryTimer);
    camera.reconnectBlocked = true;
    camera.recorder?.state === 'recording' && camera.recorder.stop();
    camera.socket?.close();
    stopPeer(camera);
    cameras.delete(camera);
    clearTimeout(camera.frameTimer);
    card.remove();
    if (selectedCamera === camera) {
      const next = cameras.values().next().value;
      if (next) selectCamera(next);
      else { selectedCamera = null; window.phoneCamDesktop?.clearFrame(); }
    }
    closePanels();
    updateToolbar();
  };
  newCode(camera).catch(error => status(camera, error.message));
  showConnection(camera);
}

document.getElementById('add-camera').onclick = addCamera;
document.getElementById('connection-status').onclick = () => openPanel('connect');
toolbarSnapshot.onclick = () => { if (selectedCamera) snapshot(selectedCamera); };
toolbarRecord.onclick = () => { if (selectedCamera) toggleRecording(selectedCamera); };
toolbarSettings.onclick = () => openPanel('settings');
toolbarMenu.onclick = () => {
  const opening = menu.hidden;
  closePanels();
  if (opening) {
    menu.hidden = false;
    scrim.hidden = false;
    toolbarMenu.setAttribute('aria-expanded', 'true');
  }
};
scrim.onclick = closePanels;
menu.onclick = event => {
  const action = event.target.closest('button')?.dataset.action;
  if (!action) return;
  closePanels();
  if (action === 'connect') openPanel('connect');
  else if (action === 'settings') openPanel('settings');
  else if (action === 'new-camera') { addCamera(); openPanel('connect'); }
  else if (action === 'open-feed') selectedCamera?.card.querySelector('.popout-feed')?.click();
  else if (action === 'fullscreen') document.getElementById('fullscreen').click();
  else if (action === 'on-top') alwaysOnTopButton.click();
  else if (action === 'select-camera') {
    const list = [...cameras];
    if (list.length > 1) selectCamera(list[(list.indexOf(selectedCamera) + 1) % list.length]);
  }
};
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (document.body.classList.contains('desktop-fullscreen')) window.phoneCamDesktop?.toggleFullscreen();
  else closePanels();
});
const fullscreenButton = document.getElementById('fullscreen');
fullscreenButton.onclick = () => {
  if (window.phoneCamDesktop?.toggleFullscreen) window.phoneCamDesktop.toggleFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen();
  else selectedCamera?.card.querySelector('.preview-shell')?.requestFullscreen().catch(() => {});
};
window.phoneCamDesktop?.onFullscreenChange(enabled => {
  document.body.classList.toggle('desktop-fullscreen', enabled);
  fullscreenButton.textContent = enabled ? 'Exit fullscreen' : 'Fullscreen';
  closePanels();
});
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});
const alwaysOnTopButton = document.getElementById('always-on-top');
if (window.phoneCamDesktop?.setAlwaysOnTop) {
  alwaysOnTopButton.hidden = false;
  menu.querySelector('[data-action="on-top"]').hidden = false;
  alwaysOnTopButton.onclick = () => {
    const enabled = alwaysOnTopButton.getAttribute('aria-pressed') !== 'true';
    window.phoneCamDesktop.setAlwaysOnTop(enabled);
    alwaysOnTopButton.setAttribute('aria-pressed', String(enabled));
    alwaysOnTopButton.textContent = enabled ? 'On top ✓' : 'Stay on top';
  };
}
document.querySelectorAll('[data-section]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-section]').forEach(item => item.classList.toggle('rail-active', item === button));
  const target = button.dataset.section === 'connect' ? selectedCamera?.card.querySelector('.connect-panel')
    : button.dataset.section === 'settings' ? selectedCamera?.card.querySelector('.control-panel')
    : selectedCamera?.card.querySelector('.preview-shell');
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.addEventListener('keydown', event => {
  if (!event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (!['s', 'r', 'p', 'n', 'q', 'enter'].includes(key)) return;
  event.preventDefault();
  if (key === 'enter') fullscreenButton.click();
  else if (key === 'n') addCamera();
  else if (selectedCamera && key === 's') snapshot(selectedCamera);
  else if (selectedCamera && key === 'r') toggleRecording(selectedCamera);
  else if (selectedCamera && key === 'p') togglePause(selectedCamera);
  else if (selectedCamera && key === 'q') discardRecording(selectedCamera);
});
window.phoneCamDesktop?.onShortcut(action => {
  if (action === 'new-camera') addCamera();
  else if (selectedCamera && action === 'snapshot') snapshot(selectedCamera);
  else if (selectedCamera && action === 'record') toggleRecording(selectedCamera);
  else if (selectedCamera && action === 'pause') togglePause(selectedCamera);
  else if (selectedCamera && action === 'discard-recording') discardRecording(selectedCamera);
});
addCamera();
openPanel('connect');
