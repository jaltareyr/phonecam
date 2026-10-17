import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const httpPort = Number(process.env.PHONECAM_HTTP_PORT || 8080);
const httpsPort = Number(process.env.PHONECAM_HTTPS_PORT || 8443);
const certDir = process.env.PHONECAM_CERT_DIR || path.join(root, 'certs');
const rooms = new Map();
const clients = new Map();
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(6);
    const code = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate a room');
}

function leave(socket) {
  const client = clients.get(socket);
  if (!client) return;
  clients.delete(socket);
  const room = rooms.get(client.code);
  if (!room) return;
  if (room[client.role] === socket) room[client.role] = null;
  const other = room[client.role === 'viewer' ? 'phone' : 'viewer'];
  if (other) send(other, { type: 'peer-left' });
  if (!room.viewer && !room.phone) rooms.delete(client.code);
}

function attachSignaling(server) {
  const wss = new WebSocketServer({ server, path: '/signal', maxPayload: 64 * 1024 });
  wss.on('connection', socket => {
    socket.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { send(socket, { type: 'error', message: 'Invalid message' }); return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'join') {
        if (clients.has(socket)) return;
        const role = message.role;
        const code = String(message.code || '').toUpperCase();
        if (!['viewer', 'phone'].includes(role) || !codePattern.test(code)) {
          send(socket, { type: 'error', message: 'Invalid role or pairing code' }); return;
        }
        const room = rooms.get(code);
        if (!room || room[role]) {
          send(socket, { type: 'error', message: 'Pairing code unavailable or already in use' }); return;
        }
        room[role] = socket;
        clients.set(socket, { role, code });
        send(socket, { type: 'joined', role, code });
        if (room.viewer && room.phone) {
          send(room.viewer, { type: 'paired' });
          send(room.phone, { type: 'paired' });
        }
        return;
      }
      const client = clients.get(socket);
      if (!client || !['offer', 'answer', 'candidate', 'control'].includes(message.type)) return;
      if (message.type === 'control' && (client.role !== 'viewer' || !['pause', 'switch-camera'].includes(message.action) ||
          (message.action === 'pause' && typeof message.enabled !== 'boolean'))) return;
      if (JSON.stringify(message).length > 64 * 1024) return;
      const room = rooms.get(client.code);
      const peer = room?.[client.role === 'viewer' ? 'phone' : 'viewer'];
      if (peer) send(peer, message);
    });
    socket.on('close', () => leave(socket));
    socket.on('error', () => leave(socket));
  });
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/connectivity' && req.method === 'GET') {
    const addresses = Object.values(os.networkInterfaces()).flatMap(values => values || [])
      .filter(address => address.family === 'IPv4' && !address.internal &&
        !address.address.startsWith('169.254.') && !address.address.startsWith('172.29.'))
      .map(address => address.address);
    const tlsReady = fs.existsSync(keyPath) && fs.existsSync(certPath);
    const certificate = tlsReady ? new crypto.X509Certificate(fs.readFileSync(certPath)) : null;
    const wifi = addresses.map(address => ({
      address,
      url: `https://${address}:${httpsPort}/phone`,
      certificateMatches: Boolean(certificate?.subjectAltName?.includes(`IP Address:${address}`))
    }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ wifi, tlsReady, usbUrl: `http://localhost:${httpPort}/phone`, certificateAvailable: fs.existsSync(path.join(certDir, 'phonecam-ca.crt')) }));
    return;
  }
  if (url.pathname === '/phonecam-ca.crt' && req.method === 'GET' && fs.existsSync(path.join(certDir, 'phonecam-ca.crt'))) {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="phonecam-ca.crt"', 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(certDir, 'phonecam-ca.crt')).pipe(res);
    return;
  }
  if (url.pathname === '/api/room' && req.method === 'POST') {
    const code = roomCode();
    rooms.set(code, { viewer: null, phone: null });
    setTimeout(() => {
      const room = rooms.get(code);
      if (room && !room.viewer && !room.phone) rooms.delete(code);
    }, 5 * 60_000).unref();
    res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ code }));
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, app: 'phonecam' }));
    return;
  }
  const routes = { '/': 'viewer.html', '/viewer': 'viewer.html', '/phone': 'phone.html', '/viewer.js': 'viewer.js', '/phone.js': 'phone.js', '/style.css': 'style.css' };
  const name = routes[url.pathname];
  if (!name || req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return; }
  const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(path.join(publicDir, name)).pipe(res);
}

const httpServer = http.createServer(handleRequest);
attachSignaling(httpServer);
httpServer.listen(httpPort, '127.0.0.1', () => {
  console.log(`PC viewer: http://localhost:${httpPort}/viewer`);
  console.log(`Android USB: adb reverse tcp:${httpPort} tcp:${httpPort}, then open http://localhost:${httpPort}/phone on the phone`);
});

const keyPath = path.join(certDir, 'server-key.pem');
const certPath = path.join(certDir, 'server-cert.pem');
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const httpsServer = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, handleRequest);
  attachSignaling(httpsServer);
  httpsServer.listen(httpsPort, '0.0.0.0', () => {
    for (const values of Object.values(os.networkInterfaces())) {
      for (const address of values || []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`Wi-Fi phone: https://${address.address}:${httpsPort}/phone`);
      }
    }
  });
} else {
  console.log('Wi-Fi HTTPS disabled: run python scripts/make_cert.py to create a local certificate.');
}
