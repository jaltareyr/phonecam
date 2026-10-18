import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import WebSocket from 'ws';
import { startTestServer } from '../support/server-fixture.js';

test('protects local controls, approval, session credentials, and pairing limits', { timeout: 30_000 }, async t => {
  const server = await startTestServer(t);
  const sockets = [];
  t.after(() => { for (const socket of sockets) socket.terminate(); });
  async function open(url = server.ws, options = {}) {
    const socket = new WebSocket(url, options);
    sockets.push(socket);
    const queue = [], waiters = [];
    socket.on('message', data => {
      const value = JSON.parse(data.toString());
      if (waiters.length) waiters.shift()(value); else queue.push(value);
    });
    await once(socket, 'open');
    return {
      socket,
      send: message => socket.send(JSON.stringify(message)),
      next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve))
    };
  }
  const create = () => fetch(`${server.base}/api/room`, { method: 'POST', headers: { 'X-PhoneCam-Client': 'viewer' } });

  await t.test('blocks LAN access to desktop pages and room credentials', async () => {
    for (const route of ['/viewer', '/feed', '/api/connectivity', '/api/room', '/api/qr?code=ABC234'])
      assert.equal((await server.tls(route, { method: route === '/api/room' ? 'POST' : 'GET' })).status, 403, route);
    assert.equal((await server.tls('/phone')).status, 200);
    assert.equal((await server.tls('/phonecam-ca.crt')).status, 200);
  });
  await t.test('rejects cross-site and rebound-host requests', async () => {
    assert.equal((await fetch(`${server.base}/api/room`, { method: 'POST' })).status, 403);
    assert.equal((await fetch(`${server.base}/api/room`, { method: 'POST', headers: {
      Origin: 'https://untrusted.example', 'X-PhoneCam-Client': 'viewer'
    } })).status, 403);
    const reboundStatus = await new Promise((resolve, reject) => {
      http.get(`${server.base}/health`, { headers: { Host: 'untrusted.example' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(reboundStatus, 403);
    const forbidden = new WebSocket(server.ws, { origin: 'https://untrusted.example' });
    sockets.push(forbidden);
    const [error] = await once(forbidden, 'error');
    assert.match(error.message, /403/);
    const page = await fetch(`${server.base}/phone`);
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  });
  const room = await (await create()).json();
  await t.test('a pairing code alone cannot claim the viewer role', async () => {
    const intruder = await open();
    intruder.send({ type: 'join', role: 'viewer', code: room.code, viewerToken: 'wrong' });
    assert.equal((await intruder.next()).type, 'error');
    const remote = await open(server.wss, { ca: server.ca });
    remote.send({ type: 'join', role: 'viewer', ...room });
    assert.equal((await remote.next()).type, 'error');
  });
  const viewer = await open();
  viewer.send({ type: 'join', role: 'viewer', ...room });
  assert.equal((await viewer.next()).type, 'joined');
  const phone = await open(server.wss, { ca: server.ca });
  phone.send({ type: 'join', role: 'phone', code: room.code });
  assert.equal((await phone.next()).type, 'joined');
  assert.equal((await viewer.next()).type, 'pair-request');
  let resumeToken;
  await t.test('does not relay a phone offer before desktop approval', async () => {
    phone.send({ type: 'offer', sdp: { type: 'offer', sdp: 'must-not-relay' } });
    viewer.send({ type: 'pair-decision', approve: true });
    assert.equal((await viewer.next()).type, 'paired');
    const approved = await phone.next();
    assert.equal(approved.type, 'paired');
    resumeToken = approved.resumeToken;
    assert.match(resumeToken, /^[a-f0-9]{64}$/);
    phone.send({ type: 'control', action: 'pause', enabled: true });
    phone.send({ type: 'camera-state', focusSupported: false });
    assert.equal((await viewer.next()).type, 'camera-state');
  });
  await t.test('resumes the approved phone using its private in-memory credential', async () => {
    phone.socket.close(); await once(phone.socket, 'close');
    assert.equal((await viewer.next()).type, 'peer-left');
    const returning = await open(server.wss, { ca: server.ca });
    returning.send({ type: 'join', role: 'phone', code: room.code, resumeToken });
    assert.equal((await returning.next()).type, 'joined');
    assert.equal((await viewer.next()).type, 'paired');
    assert.equal((await returning.next()).resumeToken, resumeToken);
    returning.socket.close(); await once(returning.socket, 'close');
    assert.equal((await viewer.next()).type, 'peer-left');
  });
  await t.test('requires fresh approval for another phone and honors decline', async () => {
    const stranger = await open(server.wss, { ca: server.ca });
    stranger.send({ type: 'join', role: 'phone', code: room.code, resumeToken: 'wrong' });
    assert.equal((await stranger.next()).type, 'joined');
    assert.equal((await viewer.next()).type, 'pair-request');
    const closed = once(stranger.socket, 'close');
    viewer.send({ type: 'pair-decision', approve: false });
    assert.match((await stranger.next()).message, /declined/);
    await closed;
    viewer.send({ type: 'end-session' });
    assert.match((await viewer.next()).message, /Session ended/);
  });
  await t.test('bounds room allocation and pairing attempts', async () => {
    let limited = false;
    for (let i = 0; i < 33; i++) if ((await create()).status === 429) { limited = true; break; }
    assert.equal(limited, true);
    const guesser = await open();
    for (let i = 0; i < 21; i++) {
      guesser.send({ type: 'join', role: 'phone', code: 'ZZZZZZ' });
      const result = await guesser.next();
      if (/Too many/.test(result.message)) { limited = true; break; }
      limited = false;
    }
    assert.equal(limited, true);
  });
});
