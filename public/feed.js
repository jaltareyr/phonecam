const stage = document.getElementById('feed-stage');
const canvas = document.getElementById('feed-canvas');
const context = canvas.getContext('2d', { alpha: false });
const hint = document.getElementById('feed-hint');

function showFrame(bytes) {
  if (!bytes) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    hint.hidden = false;
    return;
  }
  if (bytes.length !== 1280 * 720 * 4) return;
  if (canvas.width !== 1280 || canvas.height !== 720) {
    canvas.width = 1280;
    canvas.height = 720;
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(bytes), 1280, 720), 0, 0);
  hint.hidden = true;
}

if (window.phoneCamDesktop?.onFeedFrame) {
  window.phoneCamDesktop.onFeedFrame(showFrame);
} else {
  const drawFromOpener = () => {
    try {
      const source = window.opener?.phoneCamSelectedPreview?.();
      if (source && source.width > 1 && source.height > 1) {
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width;
          canvas.height = source.height;
        }
        context.drawImage(source, 0, 0);
        hint.hidden = true;
      } else hint.hidden = false;
    } catch { hint.textContent = 'The PhoneCam preview is unavailable. Open this feed from the main PhoneCam tab.'; }
    requestAnimationFrame(drawFromOpener);
  };
  drawFromOpener();
}

document.getElementById('feed-fit').onclick = event => {
  const fill = stage.classList.toggle('cover');
  event.currentTarget.textContent = fill ? 'Fit whole feed' : 'Fill screen';
};
document.getElementById('feed-fullscreen').onclick = () => {
  if (window.phoneCamDesktop?.toggleFullscreen) window.phoneCamDesktop.toggleFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen().catch(() => {});
};
window.phoneCamDesktop?.onFullscreenChange(enabled => {
  document.body.classList.toggle('desktop-fullscreen', enabled);
  document.getElementById('feed-fullscreen').textContent = enabled ? 'Exit fullscreen' : 'Fullscreen';
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('desktop-fullscreen')) window.phoneCamDesktop.toggleFullscreen();
});
document.addEventListener('fullscreenchange', () => {
  document.getElementById('feed-fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});
document.getElementById('feed-close').onclick = () => window.close();
