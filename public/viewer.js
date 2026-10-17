const grid = document.getElementById('streams');
const cameras = new Set();
let selectedCamera = null;

function signal(camera, message) {
  if (camera.socket?.readyState === WebSocket.OPEN) camera.socket.send(JSON.stringify(message));
}

function status(camera, message) {
  camera.status.textContent = message;
  if (selectedCamera === camera) document.querySelector('.connection-label').lastChild.textContent = ` ${message}`;
}

function selectCamera(camera) {
  for (const item of cameras) item.card.classList.toggle('selected', item === camera);
  selectedCamera = camera;
  document.querySelector('.connection-label').lastChild.textContent = ` ${camera.status.textContent}`;
  window.phoneCamDesktop?.clearFrame();
}

function stopPeer(camera) {
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
  camera.preview.width = 1;
  camera.preview.height = 1;
}

function renderFrame(camera) {
  if (!cameras.has(camera)) return;
  const video = camera.source;
  const canvas = camera.preview;
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const rotated = camera.rotation % 180 !== 0;
    const outputWidth = rotated ? video.videoHeight : video.videoWidth;
    const outputHeight = rotated ? video.videoWidth : video.videoHeight;
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      canvas.style.aspectRatio = `${outputWidth} / ${outputHeight}`;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.save();
    if (camera.mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    if (camera.rotation === 90) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
    else if (camera.rotation === 180) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
    else if (camera.rotation === 270) { ctx.translate(0, canvas.height); ctx.rotate(-Math.PI / 2); }
    const filter = camera.effect.value;
    ctx.filter = filter === 'mono' ? 'grayscale(1)' : filter === 'warm' ? 'sepia(.55) saturate(1.25)' : filter === 'soft' ? 'blur(3px)' : 'none';
    if (filter === 'pixel') {
      const small = camera.pixelCanvas;
      small.width = Math.max(1, Math.round(video.videoWidth / 24));
      small.height = Math.max(1, Math.round(video.videoHeight / 24));
      small.getContext('2d').drawImage(video, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, video.videoWidth, video.videoHeight);
    } else ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    ctx.restore();
    if (camera === selectedCamera && window.phoneCamDesktop?.sendFrame &&
        performance.now() - (camera.lastExport || 0) >= 33) {
      camera.lastExport = performance.now();
      const bridge = camera.bridgeCanvas;
      const bridgeContext = bridge.getContext('2d', { alpha: false, willReadFrequently: true });
      bridgeContext.fillStyle = '#000';
      bridgeContext.fillRect(0, 0, bridge.width, bridge.height);
      const scale = Math.min(bridge.width / canvas.width, bridge.height / canvas.height);
      const width = canvas.width * scale;
      const height = canvas.height * scale;
      bridgeContext.drawImage(canvas, (bridge.width - width) / 2, (bridge.height - height) / 2, width, height);
      window.phoneCamDesktop.sendFrame(bridgeContext.getImageData(0, 0, bridge.width, bridge.height).data);
    }
  }
  camera.frameRequest = requestAnimationFrame(() => renderFrame(camera));
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
    const settings = incoming.getVideoTracks()[0]?.getSettings();
    if (settings?.width) camera.details.textContent = `${settings.width} × ${settings.height}${settings.frameRate ? ` · ${Math.round(settings.frameRate)} fps` : ''}`;
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'connected') status(camera, 'Connected');
    if (['failed', 'disconnected'].includes(peer.connectionState)) status(camera, 'Connection interrupted');
  };
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
  socket.onopen = () => signal(camera, { type: 'join', role: 'viewer', code: camera.code });
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    try {
      if (message.type === 'error') { status(camera, message.message); return; }
      if (message.type === 'joined') { status(camera, 'Waiting for phone…'); return; }
      if (message.type === 'paired') { status(camera, 'Pairing…'); return; }
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
  socket.onclose = () => { if (camera.socket === socket && cameras.has(camera) && !camera.peer) status(camera, 'Server connection closed'); };
}

async function newCode(camera) {
  stopPeer(camera);
  const response = await fetch('/api/room', { method: 'POST' });
  if (!response.ok) throw new Error('Could not create a pairing code');
  camera.code = (await response.json()).code;
  camera.codeElement.textContent = camera.code;
  connect(camera);
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
  if (!camera.stream || camera.preview.width <= 1) return;
  camera.preview.toBlob(blob => { if (blob) download(blob, 'png'); }, 'image/png');
}

function toggleRecording(camera) {
  if (camera.recorder?.state === 'recording') { camera.recorder.stop(); return; }
  if (!camera.stream) return;
  try {
    if (!window.MediaRecorder) throw new Error('Recording is unavailable in this browser');
    const useProcessed = camera.mirrored || camera.rotation !== 0 || camera.effect.value !== 'none';
    const recordingStream = useProcessed ? camera.preview.captureStream(30) : camera.stream;
    if (useProcessed) for (const track of camera.stream.getAudioTracks()) recordingStream.addTrack(track);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find(type => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    const recorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined);
    camera.recorder = recorder;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => status(camera, `Recording error: ${event.error?.message || 'unknown error'}`);
    recorder.onstop = () => {
      if (chunks.length) download(new Blob(chunks, { type: recorder.mimeType }), recorder.mimeType.includes('mp4') ? 'mp4' : 'webm');
      camera.recordButton.textContent = 'Record';
      if (useProcessed) for (const track of recordingStream.getVideoTracks()) track.stop();
    };
    recorder.start(1000);
    camera.recordButton.textContent = 'Stop recording';
  } catch (error) { status(camera, `Recording error: ${error.message}`); }
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
    camera.wifiUrl = preferred?.url || '';
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
  card.innerHTML = `<div class="camera-layout"><div class="video-column"><div class="preview-heading"><div><strong>Live preview</strong><span class="details small">Waiting for video</span></div><button class="danger remove" type="button">Remove camera</button></div><div class="preview-shell"><video class="source-video" autoplay muted playsinline></video><canvas class="preview"></canvas><div class="empty-state"><div class="connection-art" aria-hidden="true"><span class="phone-art"></span><span class="connection-waves">◌ ◌</span><span class="monitor-art"></span></div><strong>Waiting for phone</strong><span>Choose Wi-Fi or USB on the right to connect</span></div></div><div class="camera-state"><span class="state-dot"></span><span class="status">Creating room…</span></div><audio autoplay muted></audio><div class="control-panel"><div class="panel-title">Camera controls</div><div class="control-grid"><button class="switch-camera secondary" disabled>⇄ <span>Switch camera</span></button><button class="mirror secondary" aria-pressed="false">⇋ <span>Mirror</span></button><button class="rotate secondary">⟳ <span>Rotate 90°</span></button><button class="pause secondary" disabled>⏸ <span>Pause</span></button><button class="audio-button secondary" disabled>♪ <span>Unmute</span></button></div><div class="effect-row"><label class="label">Video effect</label><select class="effect"><option value="none">None</option><option value="mono">Monochrome</option><option value="warm">Warm</option><option value="soft">Soft focus</option><option value="pixel">Mosaic</option></select></div></div><div class="capture-bar"><button class="snapshot secondary" disabled>◎ Snapshot</button><button class="record secondary" disabled>● Record</button></div></div><aside class="connect-panel"><div class="panel-title">Connect your phone</div><p class="connect-intro">Choose how your Android phone reaches this PC.</p><div class="mode-tabs" role="tablist" aria-label="Connection method"><button type="button" data-mode="wifi" class="active" role="tab" aria-selected="true">◉ Wi-Fi</button><button type="button" data-mode="usb" role="tab" aria-selected="false">⚡ USB</button></div><div class="wifi-instructions"><div class="step"><b>1</b><div><strong>Same Wi-Fi</strong><p>Connect your phone and this PC to the same network.</p></div></div><div class="step"><b>2</b><div><strong>Open on Android Chrome</strong><div class="address wifi-address">Finding PC address…</div><button type="button" class="copy-link secondary">Copy address</button><p class="wifi-note"></p></div></div></div><div class="usb-instructions" hidden><div class="step"><b>1</b><div><strong>Connect USB cable</strong><p>Enable USB debugging, then allow this PC on your phone.</p></div></div><div class="step"><b>2</b><div><strong>Open on Android Chrome</strong><div class="address usb-address">http://localhost:8080/phone</div><p>ADB reverse forwarding must be active on this PC.</p></div></div></div><div class="step code-step"><b>3</b><div><strong>Enter this pairing code</strong><div class="code">······</div><button class="new-code secondary" type="button">Get new code</button></div></div><p class="connect-footer">Allow camera access on your phone and tap <strong>Start camera</strong>. The live feed will appear here.</p></aside></div>`;
  const camera = {
    card, codeElement: card.querySelector('.code'), status: card.querySelector('.status'),
    details: card.querySelector('.details'), source: card.querySelector('video'),
    preview: card.querySelector('canvas'), audio: card.querySelector('audio'),
    recordButton: card.querySelector('.record'), snapshotButton: card.querySelector('.snapshot'),
    pauseButton: card.querySelector('.pause'), audioButton: card.querySelector('.audio-button'),
    switchButton: card.querySelector('.switch-camera'),
    wifiAddress: card.querySelector('.wifi-address'), wifiNote: card.querySelector('.wifi-note'),
    usbAddress: card.querySelector('.usb-address'), copyButton: card.querySelector('.copy-link'),
    effect: card.querySelector('.effect'), pixelCanvas: document.createElement('canvas'),
    bridgeCanvas: document.createElement('canvas'),
    pendingCandidates: [], mirrored: false, rotation: 0, paused: false
  };
  camera.bridgeCanvas.width = 1280;
  camera.bridgeCanvas.height = 720;
  cameras.add(camera);
  grid.append(card);
  selectCamera(camera);
  renderFrame(camera);
  card.onclick = () => selectCamera(camera);
  card.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => connectionMode(camera, button.dataset.mode));
  camera.copyButton.onclick = async () => {
    try { await navigator.clipboard.writeText(`${camera.wifiUrl}?code=${camera.code}`); camera.copyButton.textContent = 'Copied'; }
    catch { status(camera, 'Could not copy address. Select and copy the address above.'); }
  };
  camera.snapshotButton.onclick = () => snapshot(camera);
  camera.recordButton.onclick = () => toggleRecording(camera);
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
    camera.recorder?.state === 'recording' && camera.recorder.stop();
    camera.socket?.close();
    stopPeer(camera);
    cameras.delete(camera);
    cancelAnimationFrame(camera.frameRequest);
    card.remove();
    if (selectedCamera === camera) {
      const next = cameras.values().next().value;
      if (next) selectCamera(next);
      else { selectedCamera = null; window.phoneCamDesktop?.clearFrame(); }
    }
  };
  newCode(camera).catch(error => status(camera, error.message));
  showConnection(camera);
}

document.getElementById('add-camera').onclick = addCamera;
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
  if (!['s', 'r', 'p', 'n'].includes(key)) return;
  event.preventDefault();
  if (key === 'n') addCamera();
  else if (selectedCamera && key === 's') snapshot(selectedCamera);
  else if (selectedCamera && key === 'r') toggleRecording(selectedCamera);
  else if (selectedCamera && key === 'p') togglePause(selectedCamera);
});
window.phoneCamDesktop?.onShortcut(action => {
  if (action === 'new-camera') addCamera();
  else if (selectedCamera && action === 'snapshot') snapshot(selectedCamera);
  else if (selectedCamera && action === 'record') toggleRecording(selectedCamera);
  else if (selectedCamera && action === 'pause') togglePause(selectedCamera);
});
addCamera();
