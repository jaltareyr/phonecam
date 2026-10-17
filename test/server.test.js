import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function messages(socket) {
  const queue = [];
  const waiters = [];
  socket.on('message', data => {
    const message = JSON.parse(data.toString());
    if (waiters.length) waiters.shift()(message);
    else queue.push(message);
  });
  return () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve));
}

test('pairs two peers and relays signaling', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PHONECAM_HTTP_PORT: String(port), PHONECAM_HTTPS_PORT: '0' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  const sockets = [];
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { const health = await (await fetch(`${base}/health`)).json(); ready = health.ok && health.app === 'phonecam'; if (ready) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, 'server started');
    const roomResponse = await fetch(`${base}/api/room`, { method: 'POST' });
    assert.equal(roomResponse.status, 201);
    const { code } = await roomResponse.json();
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    const viewer = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    sockets.push(viewer);
    const nextViewer = messages(viewer);
    await once(viewer, 'open');
    viewer.send(JSON.stringify({ type: 'join', role: 'viewer', code }));
    assert.equal((await nextViewer()).type, 'joined');
    const phone = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    sockets.push(phone);
    const nextPhone = messages(phone);
    await once(phone, 'open');
    phone.send(JSON.stringify({ type: 'join', role: 'phone', code }));
    assert.equal((await nextPhone()).type, 'joined');
    assert.equal((await nextViewer()).type, 'paired');
    assert.equal((await nextPhone()).type, 'paired');
    const offer = { type: 'offer', sdp: { type: 'offer', sdp: 'test' } };
    phone.send(JSON.stringify(offer));
    assert.deepEqual(await nextViewer(), offer);
    viewer.send(JSON.stringify({ type: 'control', action: 'pause', enabled: true }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'pause', enabled: true });
    viewer.send(JSON.stringify({ type: 'control', action: 'switch-camera' }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'switch-camera' });
    const cameraState = { type: 'camera-state', zoom: { min: 1, max: 5, step: 0.1, value: 2 }, focusSupported: true };
    phone.send(JSON.stringify(cameraState));
    assert.deepEqual(await nextViewer(), cameraState);
    viewer.send(JSON.stringify({ type: 'control', action: 'zoom', value: 2.5 }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'zoom', value: 2.5 });
    viewer.send(JSON.stringify({ type: 'control', action: 'zoom', value: 0.7 }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'zoom', value: 0.7 });
    viewer.send(JSON.stringify({ type: 'control', action: 'focus', x: 0.3, y: 0.7 }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'focus', x: 0.3, y: 0.7 });
    viewer.close();
    await once(viewer, 'close');
    assert.equal((await nextPhone()).type, 'peer-left');
    const returningViewer = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    sockets.push(returningViewer);
    const nextReturningViewer = messages(returningViewer);
    await once(returningViewer, 'open');
    returningViewer.send(JSON.stringify({ type: 'join', role: 'viewer', code }));
    assert.equal((await nextReturningViewer()).type, 'joined');
    assert.equal((await nextReturningViewer()).type, 'paired');
    assert.equal((await nextPhone()).type, 'paired');
    const secondRoom = await fetch(`${base}/api/room`, { method: 'POST' });
    const { code: secondCode } = await secondRoom.json();
    assert.notEqual(secondCode, code);
    const secondViewer = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    sockets.push(secondViewer);
    const nextSecondViewer = messages(secondViewer);
    await once(secondViewer, 'open');
    secondViewer.send(JSON.stringify({ type: 'join', role: 'viewer', code: secondCode }));
    assert.equal((await nextSecondViewer()).type, 'joined');
    const secondPhone = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    sockets.push(secondPhone);
    const nextSecondPhone = messages(secondPhone);
    await once(secondPhone, 'open');
    secondPhone.send(JSON.stringify({ type: 'join', role: 'phone', code: secondCode }));
    assert.equal((await nextSecondPhone()).type, 'joined');
    assert.equal((await nextSecondViewer()).type, 'paired');
    assert.equal((await nextSecondPhone()).type, 'paired');
    secondPhone.send(JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'second-room' } }));
    assert.equal((await nextSecondViewer()).sdp.sdp, 'second-room');
    assert.equal((await fetch(`${base}/viewer.js`)).status, 200);
    assert.equal((await fetch(`${base}/feed`)).status, 200);
    assert.equal((await fetch(`${base}/feed.js`)).status, 200);
    assert.equal((await fetch(`${base}/phone.js`)).status, 200);
  } finally {
    for (const socket of sockets) socket.terminate();
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
});
