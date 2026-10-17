const grid = document.getElementById('streams');
const cameras = new Set();
let selectedCamera = null;

function signal(camera, message) {
  if (camera.socket?.readyState === WebSocket.OPEN) camera.socket.send(JSON.stringify(message));
}

function status(camera, message) { camera.status.textContent = message; }

function selectCamera(camera) {
  for (const item of cameras) item.card.classList.toggle('selected', item === camera);
  selectedCamera = camera;
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

function addCamera() {
  const card = document.createElement('section');
  card.className = 'card camera-card';
  card.innerHTML = `<div class="camera-head"><div><div class="label">Pairing code</div><div class="code">······</div></div><button class="danger remove" type="button">Remove</button></div><div class="preview-shell"><video class="source-video" autoplay muted playsinline></video><canvas class="preview"></canvas><div class="empty-state"><div class="connection-art" aria-hidden="true"><span class="phone-art"></span><span class="connection-waves">◌ ◌</span><span class="monitor-art"></span></div><strong>Waiting for phone</strong><span>Open PhoneCam on Android and enter the code above</span></div></div><div class="camera-state"><span class="state-dot"></span><span class="status">Creating room…</span><span class="details small"></span></div><audio autoplay muted></audio><div class="toolbar"><button class="snapshot secondary" disabled>Snapshot</button><button class="record secondary" disabled>Record</button><button class="pause secondary" disabled>Pause</button><button class="switch-camera secondary" disabled>Switch camera</button><button class="audio-button secondary" disabled>Unmute</button><button class="mirror secondary">Mirror</button><button class="rotate secondary">Rotate 90°</button><button class="new-code secondary">New code</button></div><div class="effect-row"><label class="label">Effect</label><select class="effect"><option value="none">None</option><option value="mono">Monochrome</option><option value="warm">Warm</option><option value="soft">Soft focus</option><option value="pixel">Mosaic</option></select></div>`;
  const camera = {
    card, codeElement: card.querySelector('.code'), status: card.querySelector('.status'),
    details: card.querySelector('.details'), source: card.querySelector('video'),
    preview: card.querySelector('canvas'), audio: card.querySelector('audio'),
    recordButton: card.querySelector('.record'), snapshotButton: card.querySelector('.snapshot'),
    pauseButton: card.querySelector('.pause'), audioButton: card.querySelector('.audio-button'),
    switchButton: card.querySelector('.switch-camera'),
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
  camera.snapshotButton.onclick = () => snapshot(camera);
  camera.recordButton.onclick = () => toggleRecording(camera);
  camera.pauseButton.onclick = () => togglePause(camera);
  camera.switchButton.onclick = () => signal(camera, { type: 'control', action: 'switch-camera' });
  camera.audioButton.onclick = () => {
    camera.audio.muted = !camera.audio.muted;
    camera.audioButton.textContent = camera.audio.muted ? 'Unmute' : 'Mute';
    if (!camera.audio.muted) camera.audio.play().catch(() => {});
  };
  card.querySelector('.mirror').onclick = () => { camera.mirrored = !camera.mirrored; };
  card.querySelector('.rotate').onclick = () => { camera.rotation = (camera.rotation + 90) % 360; };
  card.querySelector('.new-code').onclick = () => newCode(camera).catch(error => status(camera, error.message));
  card.querySelector('.remove').onclick = () => {
    camera.recorder?.state === 'recording' && camera.recorder.stop();
    camera.socket?.close();
    stopPeer(camera);
    cameras.delete(camera);
    cancelAnimationFrame(camera.frameRequest);
    card.remove();
    if (selectedCamera === camera) selectCamera(cameras.values().next().value || null);
  };
  newCode(camera).catch(error => status(camera, error.message));
}

document.getElementById('add-camera').onclick = addCamera;
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
