const role = document.body.dataset.role;
const status = document.getElementById('status');
let socket;
let peer;
let stream;
let code;
let pendingCandidates = [];

function setStatus(message) { status.textContent = message; }
function signal(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function closePeer() { if (peer) { peer.close(); peer = null; } pendingCandidates = []; }
async function applyPendingCandidates() {
  while (pendingCandidates.length && peer?.remoteDescription) await peer.addIceCandidate(pendingCandidates.shift());
}
function makePeer() {
  closePeer();
  peer = new RTCPeerConnection({ iceServers: [] });
  peer.onicecandidate = event => { if (event.candidate) signal({ type: 'candidate', candidate: event.candidate }); };
  peer.onconnectionstatechange = () => {
    if (peer?.connectionState === 'connected') setStatus('Connected');
    if (peer && ['failed', 'disconnected'].includes(peer.connectionState)) setStatus('Connection lost. Create a new code and reconnect.');
  };
  if (role === 'viewer') peer.ontrack = event => { document.getElementById('remote-video').srcObject = event.streams[0]; };
  else for (const track of stream.getTracks()) peer.addTrack(track, stream);
  return peer;
}
function connect() {
  socket?.close();
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`);
  socket.onopen = () => signal({ type: 'join', role, code });
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    try {
      if (message.type === 'error') { setStatus(message.message); return; }
      if (message.type === 'joined') { setStatus(role === 'viewer' ? 'Waiting for phone…' : 'Waiting for PC…'); return; }
      if (message.type === 'paired') {
        setStatus('Pairing…');
        if (role === 'phone') { const pc = makePeer(); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); signal({ type: 'offer', sdp: pc.localDescription }); }
        return;
      }
      if (message.type === 'offer' && role === 'viewer') {
        const pc = makePeer(); await pc.setRemoteDescription(message.sdp); await applyPendingCandidates();
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); signal({ type: 'answer', sdp: pc.localDescription }); return;
      }
      if (message.type === 'answer' && role === 'phone' && peer) { await peer.setRemoteDescription(message.sdp); await applyPendingCandidates(); return; }
      if (message.type === 'candidate') { if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate); else pendingCandidates.push(message.candidate); return; }
      if (message.type === 'peer-left') { closePeer(); setStatus('Other device disconnected'); }
    } catch (error) { setStatus(`Connection error: ${error.message}`); }
  };
  socket.onerror = () => setStatus('Signaling connection error');
  socket.onclose = () => { if (!peer || peer.connectionState !== 'connected') setStatus('Server connection closed'); };
}
async function newRoom() {
  closePeer();
  const response = await fetch('/api/room', { method: 'POST' });
  if (!response.ok) throw new Error('Could not create pairing room');
  code = (await response.json()).code;
  document.getElementById('code').textContent = code;
  connect();
}
if (role === 'viewer') {
  document.getElementById('new-room').onclick = () => newRoom().catch(error => setStatus(error.message));
  newRoom().catch(error => setStatus(error.message));
} else {
  document.getElementById('pair-form').onsubmit = async event => {
    event.preventDefault();
    code = document.getElementById('pair-code').value.toUpperCase().trim();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) { setStatus('Enter the six-character code on your PC'); return; }
    try {
      stream?.getTracks().forEach(track => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: document.getElementById('camera-select').value, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      document.getElementById('local-video').srcObject = stream;
      connect();
    } catch (error) { setStatus(`Camera error: ${error.message}`); }
  };
}
