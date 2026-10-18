import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCandidates, preferVideoCodec, bitrateCeiling, videoStats } from '../public/stream-quality.js';

test('4K capture tries exact high modes before lower resolutions', () => {
  const attempts = captureCandidates(3840, 2160, 30, { facingMode: { ideal: 'environment' } });
  assert.deepEqual([attempts[0].width.exact, attempts[0].height.exact], [3840, 2160]);
  assert.deepEqual([attempts[1].width.exact, attempts[1].height.exact], [2160, 3840]);
  assert.ok(attempts.some(item => item.width.exact === 2560 && item.height.exact === 1440));
  assert.ok(attempts.some(item => item.width.exact === 1920 && item.height.exact === 1080));
  assert.ok(attempts.some(item => item.width.ideal === 3840));
  assert.ok(bitrateCeiling(3840, 2160, 30) > bitrateCeiling(1920, 1080, 30));
});

test('codec preference keeps repair codecs and prioritizes supported H264', () => {
  let selected;
  const supported = [{ mimeType: 'video/VP8' }, { mimeType: 'video/rtx' }, { mimeType: 'video/H264' }];
  assert.equal(preferVideoCodec({ setCodecPreferences(codecs) { selected = codecs; } }, supported), true);
  assert.equal(selected[0].mimeType, 'video/H264');
  assert.equal(selected.length, supported.length);
});

test('stats describe the encoded stream rather than requested capture settings', () => {
  const report = new Map([
    ['video', { type: 'inbound-rtp', kind: 'video', frameWidth: 1280, frameHeight: 720,
      framesPerSecond: 24.4, framesDecoded: 100, bytesReceived: 5000, timestamp: 2000, codecId: 'codec' }],
    ['codec', { type: 'codec', mimeType: 'video/H264' }]
  ]);
  assert.deepEqual(videoStats(report, 'inbound'), {
    width: 1280, height: 720, fps: 24, bytes: 5000, frames: 100,
    codec: 'H264', qualityLimit: '', packetsLost: null, framesDropped: null, timestamp: 2000
  });
});
