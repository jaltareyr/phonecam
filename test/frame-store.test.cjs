const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openFrameStore, WIDTH, HEIGHT, PIXEL_BYTES } = require('../desktop/frame-store.cjs');

test('published frame has valid dimensions, pixels, and an even sequence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phonecam-frame-'));
  const store = openFrameStore(directory);
  try {
    const pixels = Buffer.alloc(PIXEL_BYTES);
    pixels.set([10, 20, 30, 255], 0);
    assert.equal(store.writeFrame(pixels), true);
    assert.equal(store.writeFrame(Buffer.alloc(4)), false);
    const descriptor = fs.openSync(store.path, 'r');
    const header = Buffer.alloc(20);
    fs.readSync(descriptor, header, 0, header.length, 0);
    fs.closeSync(descriptor);
    assert.equal(header.readUInt32LE(0) % 2, 0);
    assert.equal(header.readUInt32LE(4), WIDTH);
    assert.equal(header.readUInt32LE(8), HEIGHT);
    assert.deepEqual([...header.subarray(16, 20)], [10, 20, 30, 255]);
    store.clear();
  } finally {
    store.close();
    const root = path.resolve(os.tmpdir()) + path.sep;
    if (path.resolve(directory).startsWith(root)) fs.rmSync(directory, { recursive: true, force: true });
  }
});
