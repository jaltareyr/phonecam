const fs = require('node:fs');
const path = require('node:path');

const WIDTH = 1280;
const HEIGHT = 720;
const PIXEL_BYTES = WIDTH * HEIGHT * 4;

function openFrameStore(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, 'frame.bin');
  // A camera consumer may keep this file mapped after a previous app run.
  // Opening with w+ truncates immediately and fails on Windows in that case.
  const fd = fs.openSync(filePath, fs.existsSync(filePath) ? 'r+' : 'w+');
  fs.ftruncateSync(fd, 16 + PIXEL_BYTES);
  let sequence = 0;
  let closed = false;

  function writeAt(buffer, position) {
    let offset = 0;
    while (offset < buffer.length) {
      const written = fs.writeSync(fd, buffer, offset, buffer.length - offset, position + offset);
      if (written === 0) throw new Error('Could not write camera frame');
      offset += written;
    }
  }

  function writeFrame(data) {
    if (closed) return false;
    const pixels = data ? Buffer.from(data) : null;
    if (pixels && pixels.length !== PIXEL_BYTES) return false;
    const marker = Buffer.alloc(4);
    marker.writeUInt32LE((sequence + 1) >>> 0);
    writeAt(marker, 0);
    if (pixels) writeAt(pixels, 16);
    const metadata = Buffer.alloc(12);
    metadata.writeUInt32LE(pixels ? WIDTH : 0, 0);
    metadata.writeUInt32LE(pixels ? HEIGHT : 0, 4);
    metadata.writeUInt32LE(Date.now() >>> 0, 8);
    writeAt(metadata, 4);
    sequence = (sequence + 2) >>> 0;
    marker.writeUInt32LE(sequence);
    writeAt(marker, 0);
    return true;
  }

  writeFrame(null);
  return {
    path: filePath,
    writeFrame,
    clear: () => writeFrame(null),
    close() {
      if (closed) return;
      writeFrame(null);
      closed = true;
      fs.closeSync(fd);
    }
  };
}

module.exports = { openFrameStore, WIDTH, HEIGHT, PIXEL_BYTES };
