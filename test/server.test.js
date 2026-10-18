import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startTestServer } from '../support/server-fixture.js';

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

test('approves, pairs, reconnects, and isolates two camera sessions', { timeout: 30_000 }, async t => {
  const server = await startTestServer(t);
  const { base } = server;
  const options = { method: 'POST', headers: { 'X-PhoneCam-Client': 'viewer' } };
  const sockets = [];
  try {
    const roomResponse = await fetch(`${base}/api/room`, options);
    assert.equal(roomResponse.status, 201);
    const { code, viewerToken } = await roomResponse.json();
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    const viewer = new WebSocket(server.ws);
    sockets.push(viewer);
    const nextViewer = messages(viewer);
    await once(viewer, 'open');
    viewer.send(JSON.stringify({ type: 'join', role: 'viewer', code, viewerToken }));
    assert.equal((await nextViewer()).type, 'joined');
    const phone = new WebSocket(server.wss, { ca: server.ca });
    sockets.push(phone);
    const nextPhone = messages(phone);
    await once(phone, 'open');
    phone.send(JSON.stringify({ type: 'join', role: 'phone', code }));
    assert.equal((await nextPhone()).type, 'joined');
    assert.equal((await nextViewer()).type, 'pair-request');
    viewer.send(JSON.stringify({ type: 'pair-decision', approve: true }));
    assert.equal((await nextViewer()).type, 'paired');
    assert.equal((await nextPhone()).type, 'paired');
    const offer = { type: 'offer', sdp: { type: 'offer', sdp: 'test' } };
    phone.send(JSON.stringify(offer));
    assert.deepEqual(await nextViewer(), offer);
    viewer.send(JSON.stringify({ type: 'control', action: 'pause', enabled: true }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'pause', enabled: true });
    viewer.send(JSON.stringify({ type: 'control', action: 'switch-camera' }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'switch-camera' });
    viewer.send(JSON.stringify({ type: 'control', action: 'reduce-quality' }));
    assert.deepEqual(await nextPhone(), { type: 'control', action: 'reduce-quality' });
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
    const returningViewer = new WebSocket(server.ws);
    sockets.push(returningViewer);
    const nextReturningViewer = messages(returningViewer);
    await once(returningViewer, 'open');
    returningViewer.send(JSON.stringify({ type: 'join', role: 'viewer', code, viewerToken }));
    assert.equal((await nextReturningViewer()).type, 'joined');
    assert.equal((await nextReturningViewer()).type, 'paired');
    assert.equal((await nextPhone()).type, 'paired');
    const secondRoom = await fetch(`${base}/api/room`, options);
    const { code: secondCode, viewerToken: secondToken } = await secondRoom.json();
    assert.notEqual(secondCode, code);
    const secondViewer = new WebSocket(server.ws);
    sockets.push(secondViewer);
    const nextSecondViewer = messages(secondViewer);
    await once(secondViewer, 'open');
    secondViewer.send(JSON.stringify({ type: 'join', role: 'viewer', code: secondCode, viewerToken: secondToken }));
    assert.equal((await nextSecondViewer()).type, 'joined');
    const secondPhone = new WebSocket(server.wss, { ca: server.ca });
    sockets.push(secondPhone);
    const nextSecondPhone = messages(secondPhone);
    await once(secondPhone, 'open');
    secondPhone.send(JSON.stringify({ type: 'join', role: 'phone', code: secondCode }));
    assert.equal((await nextSecondPhone()).type, 'joined');
    assert.equal((await nextSecondViewer()).type, 'pair-request');
    secondViewer.send(JSON.stringify({ type: 'pair-decision', approve: true }));
    assert.equal((await nextSecondViewer()).type, 'paired');
    assert.equal((await nextSecondPhone()).type, 'paired');
    secondPhone.send(JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'second-room' } }));
    assert.equal((await nextSecondViewer()).sdp.sdp, 'second-room');
    assert.equal((await fetch(`${base}/viewer.js`)).status, 200);
    assert.equal((await fetch(`${base}/feed`)).status, 200);
    assert.equal((await fetch(`${base}/feed.js`)).status, 200);
    assert.equal((await fetch(`${base}/phone.js`)).status, 200);
    assert.equal((await fetch(`${base}/stream-quality.js`)).status, 200);
    const connectivity = await (await fetch(`${base}/api/connectivity`)).json();
    if (connectivity.wifi.length) {
      const qr = await fetch(`${base}/api/qr?address=${encodeURIComponent(connectivity.wifi[0].address)}&code=${code}`);
      assert.equal(qr.status, 200);
      assert.match(await qr.text(), /<svg/);
    }
  } finally {
    for (const socket of sockets) socket.terminate();
  }
});
