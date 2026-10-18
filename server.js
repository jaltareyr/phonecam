import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Bonjour } from 'bonjour-service';
import QRCode from 'qrcode';
import { ensureCertificates, localIPv4 } from './certificates.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const certDir = process.env.PHONECAM_CERT_DIR || path.join(root, 'certs');
const { keyPath, certPath } = await ensureCertificates(certDir);
const rooms = new Map();
const clients = new Map();
const limits = new Map();
const signalingServers = [];
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const roomLifetime = 5 * 60_000;
const reconnectLifetime = 2 * 60_000;
let bonjour;
let shuttingDown = false;

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sameToken(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function localViewer(request) {
  return !request.socket.encrypted && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
}

function validRequest(request) {
  try {
    const protocol = request.socket.encrypted ? 'https:' : 'http:';
    const url = new URL(`${protocol}//${request.headers.host}`);
    const hosts = request.socket.encrypted ? ['localhost', '127.0.0.1', '[::1]', ...localIPv4()] : ['localhost', '127.0.0.1', '[::1]'];
    if (!hosts.includes(url.hostname) || Number(url.port || (request.socket.encrypted ? 443 : 80)) !== request.socket.localPort) return false;
    // Reject cross-site browser requests and DNS rebinding to localhost.
    return !request.headers.origin || request.headers.origin === url.origin;
  } catch { return false; }
}

function allow(key, maximum, duration = 60_000) {
  const now = Date.now();
  let window = limits.get(key);
  if (!window || window.until <= now) {
    if (limits.size >= 4096 && !window) return false;
    window = { until: now + duration, count: 0 };
    limits.set(key, window);
  }
  return ++window.count <= maximum;
}

function destroyRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  for (const socket of [room.viewer, room.phone]) {
    if (!socket) continue;
    clients.delete(socket);
    send(socket, { type: 'error', message: reason });
    socket.close(1000, 'Session ended');
  }
}

function leave(socket) {
  const client = clients.get(socket);
  if (!client) return;
  clients.delete(socket);
  const room = rooms.get(client.code);
  if (!room || room[client.role] !== socket) return;
  room[client.role] = null;
  send(room[client.role === 'viewer' ? 'phone' : 'viewer'], { type: 'peer-left' });
  if (!room.viewer && !room.phone) rooms.delete(client.code);
  else if (room.paired) room.expiresAt = Date.now() + reconnectLifetime;
}

function pair(room) {
  room.approved = true;
  room.paired = true;
  room.expiresAt = Infinity;
  room.phoneToken ||= crypto.randomBytes(32).toString('hex');
  send(room.viewer, { type: 'paired' });
  send(room.phone, { type: 'paired', resumeToken: room.phoneToken });
}

function attachSignaling(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  signalingServers.push(wss);
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/signal' || !validRequest(request) || wss.clients.size >= 64 ||
        !allow(`connect:${request.socket.remoteAddress}`, 60)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client, request));
  });
  wss.on('connection', (socket, request) => {
    socket.alive = true;
    socket.id = crypto.randomUUID();
    socket.on('pong', () => { socket.alive = true; });
    const joinTimer = setTimeout(() => { if (!clients.has(socket)) socket.close(1008, 'Pairing timed out'); }, 30_000);
    joinTimer.unref();
    socket.on('message', raw => {
      if (!allow(`messages:${socket.id}`, 300, 10_000)) { socket.close(1008, 'Too many messages'); return; }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { send(socket, { type: 'error', message: 'Invalid message' }); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.type === 'join') {
        if (clients.has(socket)) return;
        const role = message.role;
        const code = String(message.code || '').toUpperCase();
        if (!allow(`join:${request.socket.remoteAddress}`, 20)) {
          send(socket, { type: 'error', message: 'Too many pairing attempts. Wait one minute.' });
          socket.close(1008, 'Pairing rate limit'); return;
        }
        const room = codePattern.test(code) ? rooms.get(code) : null;
        if (!['viewer', 'phone'].includes(role) || !room || room.expiresAt <= Date.now() || room[role] ||
            (role === 'viewer' && (!localViewer(request) || !sameToken(message.viewerToken, room.viewerToken)))) {
          send(socket, { type: 'error', message: 'Pairing code unavailable or already in use' }); return;
        }
        clearTimeout(joinTimer);
        room[role] = socket;
        clients.set(socket, { role, code });
        if (role === 'phone') room.approved = sameToken(message.resumeToken, room.phoneToken);
        send(socket, { type: 'joined', role, code });
        if (room.viewer && room.phone) {
          if (room.approved) pair(room);
          else send(room.viewer, { type: 'pair-request' });
        }
        return;
      }
      const client = clients.get(socket);
      const room = client && rooms.get(client.code);
      if (!room) return;
      if (message.type === 'end-session' && client.role === 'viewer') {
        destroyRoom(client.code, 'Session ended on PC. Scan a new pairing code.'); return;
      }
      if (message.type === 'pair-decision' && client.role === 'viewer' && typeof message.approve === 'boolean' && room.phone) {
        if (message.approve) pair(room);
        else {
          const rejected = room.phone;
          clients.delete(rejected);
          room.phone = null;
          room.approved = false;
          room.phoneToken = null;
          send(rejected, { type: 'error', message: 'Connection declined on PC. Scan a new pairing code.' });
          rejected.close(1008, 'Connection declined');
        }
        return;
      }
      if (!room.approved || !room.viewer || !room.phone) return;
      if (message.type === 'offer' || message.type === 'answer') {
        if (message.type !== (client.role === 'phone' ? 'offer' : 'answer') ||
            message.sdp?.type !== message.type || typeof message.sdp.sdp !== 'string') return;
      } else if (message.type === 'candidate') {
        if (!message.candidate || typeof message.candidate !== 'object' || typeof message.candidate.candidate !== 'string') return;
      } else if (message.type === 'camera-state') {
        if (client.role !== 'phone') return;
      } else if (message.type === 'control') {
        if (client.role !== 'viewer' || !['pause', 'switch-camera', 'reduce-quality', 'zoom', 'focus'].includes(message.action) ||
            (message.action === 'pause' && typeof message.enabled !== 'boolean') ||
            (message.action === 'zoom' && (!Number.isFinite(message.value) || message.value < 0.1 || message.value > 100)) ||
            (message.action === 'focus' && (!Number.isFinite(message.x) || !Number.isFinite(message.y) ||
              message.x < 0 || message.x > 1 || message.y < 0 || message.y > 1))) return;
      } else return;
      send(room[client.role === 'viewer' ? 'phone' : 'viewer'], message);
    });
    socket.on('close', () => { clearTimeout(joinTimer); limits.delete(`messages:${socket.id}`); leave(socket); });
    socket.on('error', () => leave(socket));
  });
}

function reply(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(message);
}

function handleRequest(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (!validRequest(req)) { reply(res, 403, 'Use the PhoneCam address shown on this PC.'); return; }
  const url = new URL(req.url, 'http://localhost');
  const desktopRoute = ['/','/viewer','/feed','/api/room','/api/connectivity','/api/qr'].includes(url.pathname);
  if (desktopRoute && !localViewer(req)) { reply(res, 403, 'Desktop controls are available only on this PC.'); return; }
  if (url.pathname === '/api/room' && req.method === 'POST') {
    if (req.headers['x-phonecam-client'] !== 'viewer') { reply(res, 403, 'Open the PhoneCam desktop viewer.'); return; }
    if (rooms.size >= 32 || !allow(`rooms:${req.socket.remoteAddress}`, 30)) {
      res.setHeader('Retry-After', '60'); reply(res, 429, 'Too many pairing rooms. Wait one minute.'); return;
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do { code = [...crypto.randomBytes(6)].map(byte => alphabet[byte % alphabet.length]).join(''); } while (rooms.has(code));
    const viewerToken = crypto.randomBytes(32).toString('hex');
    rooms.set(code, { viewer: null, phone: null, viewerToken, approved: false, paired: false, expiresAt: Date.now() + roomLifetime });
    res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code, viewerToken })); return;
  }
  if (url.pathname === '/api/qr' && req.method === 'GET') {
    const address = url.searchParams.get('address');
    const code = url.searchParams.get('code');
    const room = rooms.get(code);
    if (!localIPv4().includes(address) || !room || room.expiresAt <= Date.now()) { reply(res, 404, 'Pairing code unavailable'); return; }
    QRCode.toString(`https://${address}:${httpsServer.address().port}/phone?code=${code}`,
      { type: 'svg', margin: 1, width: 192, errorCorrectionLevel: 'M' }).then(svg => {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' }); res.end(svg);
    }).catch(() => reply(res, 500, 'QR generation failed'));
    return;
  }
  if (url.pathname === '/api/connectivity' && req.method === 'GET') {
    const certificate = new crypto.X509Certificate(fs.readFileSync(certPath));
    const wifi = localIPv4().map(address => ({ address, url: `https://${address}:${httpsServer.address().port}/phone`,
      certificateMatches: Boolean(certificate.subjectAltName?.includes(`IP Address:${address}`)) }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ wifi, tlsReady: true, usbUrl: `http://localhost:${httpServer.address().port}/phone`,
      certificateAvailable: fs.existsSync(path.join(certDir, 'phonecam-ca.crt')) })); return;
  }
  if (url.pathname === '/phonecam-ca.crt' && req.method === 'GET' && fs.existsSync(path.join(certDir, 'phonecam-ca.crt'))) {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="phonecam-ca.crt"' });
    fs.createReadStream(path.join(certDir, 'phonecam-ca.crt')).pipe(res); return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, app: 'phonecam', protocol: 2 })); return;
  }
  const routes = { '/': 'viewer.html', '/viewer': 'viewer.html', '/phone': 'phone.html', '/feed': 'feed.html', '/viewer.js': 'viewer.js', '/phone.js': 'phone.js', '/feed.js': 'feed.js', '/stream-quality.js': 'stream-quality.js', '/style.css': 'style.css' };
  const name = routes[url.pathname];
  if (!name || req.method !== 'GET') { reply(res, 404, 'Not found'); return; }
  res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
  fs.createReadStream(path.join(publicDir, name)).pipe(res);
}

const httpServer = http.createServer(handleRequest);
const httpsServer = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handleRequest);
for (const server of [httpServer, httpsServer]) {
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  attachSignaling(server);
}
function listen(server, port, host) {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
}
await Promise.all([
  listen(httpServer, Number(process.env.PHONECAM_HTTP_PORT ?? 8080), '127.0.0.1'),
  listen(httpsServer, Number(process.env.PHONECAM_HTTPS_PORT ?? 8443), '0.0.0.0')
]);
console.log(`PC viewer: http://localhost:${httpServer.address().port}/viewer`);
console.log(`Android USB: adb reverse tcp:${httpServer.address().port} tcp:${httpServer.address().port}, then open http://localhost:${httpServer.address().port}/phone`);
for (const address of localIPv4()) console.log(`Wi-Fi phone: https://${address}:${httpsServer.address().port}/phone`);
if (process.env.PHONECAM_MDNS !== '0') {
  try {
    bonjour = new Bonjour({}, error => console.warn(`mDNS discovery unavailable: ${error.message}`));
    bonjour.publish({ name: `PhoneCam-${crypto.randomBytes(3).toString('hex')}`, type: 'phonecam', port: httpsServer.address().port,
      txt: { path: '/phone', tls: '1', version: '2' } });
  } catch (error) { console.warn(`mDNS discovery unavailable: ${error.message}`); }
}
process.send?.({ type: 'ready', httpPort: httpServer.address().port, httpsPort: httpsServer.address().port });
const maintenance = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (room.expiresAt <= now) destroyRoom(code, 'Pairing code unavailable. Scan a new code on the PC.');
  for (const [key, window] of limits) if (window.until <= now) limits.delete(key);
  for (const wss of signalingServers) for (const socket of wss.clients) {
    if (!socket.alive) { socket.terminate(); continue; }
    socket.alive = false; socket.ping();
  }
}, 15_000);
maintenance.unref();
let certificateModified = fs.statSync(certPath).mtimeMs;
let refreshing = false;
const refreshTimer = setInterval(async () => {
  if (refreshing) return;
  refreshing = true;
  try {
    await ensureCertificates(certDir);
    const modified = fs.statSync(certPath).mtimeMs;
    if (modified !== certificateModified) {
      httpsServer.setSecureContext({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) });
      certificateModified = modified;
    }
  } catch (error) { console.error(`Could not refresh Wi-Fi certificate: ${error.message}`); }
  finally { refreshing = false; }
}, 60_000);
refreshTimer.unref();
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(maintenance); clearInterval(refreshTimer);
  for (const wss of signalingServers) { for (const socket of wss.clients) socket.terminate(); wss.close(); }
  bonjour?.destroy();
  for (const server of [httpServer, httpsServer]) { server.close(); server.closeAllConnections(); }
  setTimeout(() => process.exit(0), 250).unref();
  if (process.connected) process.disconnect();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('message', message => { if (message?.type === 'shutdown') shutdown(); });
