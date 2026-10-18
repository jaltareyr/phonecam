export const captureModes = [
  [3840, 2160], [2560, 1440], [1920, 1080], [1280, 720], [640, 480]
];

export function captureCandidates(width, height, frameRate, camera) {
  const modes = captureModes.filter(([w, h]) => w <= width && h <= height);
  const chosen = modes.length ? modes : [[width, height]];
  const rates = [...new Set([frameRate, Math.min(frameRate, 30), 15])];
  const candidates = [];
  for (const [index, [w, h]] of chosen.entries()) {
    for (const rate of rates) {
      candidates.push({ ...camera, width: { exact: w }, height: { exact: h }, frameRate: { ideal: rate, max: rate } });
      if (w !== h) candidates.push({ ...camera, width: { exact: h }, height: { exact: w }, frameRate: { ideal: rate, max: rate } });
    }
    if (index === 0) candidates.push({ ...camera, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: Math.min(frameRate, 30) } });
  }
  // Some Android camera HALs expose a mode only through ideal constraints.
  return candidates;
}

export function preferVideoCodec(transceiver, supported) {
  if (!transceiver?.setCodecPreferences || !supported?.length) return false;
  const priority = ['video/H264', 'video/VP9', 'video/VP8', 'video/AV1', 'video/H265'];
  const sorted = [...supported].sort((a, b) => {
    const rank = codec => {
      const index = priority.indexOf(codec.mimeType?.toUpperCase().replace('VIDEO/', 'video/'));
      return index < 0 ? priority.length : index;
    };
    return rank(a) - rank(b);
  });
  try { transceiver.setCodecPreferences(sorted); return true; } catch { return false; }
}

export function bitrateCeiling(width, height, frameRate) {
  const pixels = width * height;
  const base = pixels >= 3840 * 2160 ? 24_000_000 : pixels >= 2560 * 1440 ? 14_000_000
    : pixels >= 1920 * 1080 ? 8_000_000 : pixels >= 1280 * 720 ? 4_000_000 : 2_000_000;
  return Math.round(base * Math.max(0.5, Math.min(frameRate / 30, 2)));
}

export function videoStats(report, direction) {
  const kind = direction === 'outbound' ? 'outbound-rtp' : 'inbound-rtp';
  const row = [...report.values()].find(item => item.type === kind && (item.kind || item.mediaType) === 'video');
  if (!row) return null;
  const codec = report.get(row.codecId);
  return {
    width: row.frameWidth || 0, height: row.frameHeight || 0,
    fps: Math.round(row.framesPerSecond || 0),
    bytes: direction === 'outbound' ? row.bytesSent || 0 : row.bytesReceived || 0,
    frames: direction === 'outbound' ? row.framesEncoded ?? null : row.framesDecoded ?? null,
    codec: codec?.mimeType?.replace('video/', '') || 'unknown',
    qualityLimit: row.qualityLimitationReason || '',
    packetsLost: row.packetsLost ?? null,
    framesDropped: row.framesDropped ?? null,
    timestamp: row.timestamp
  };
}
