// ── Bootstrap ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('world');
rendererInit(canvas);

window.addEventListener('resize', () => { rendererResize(); clampCamera(); });
rendererResize();

// ── World generation ──────────────────────────────────────────────────────────
console.log('[world] generating terrain…');
generateTerrain();
console.log('[world] spawning resources…');
spawnResources();
buildResourceCanvas();
buildWaterTileList();
console.log('[world] ready.');

// Initial camera: fit world on screen
cam.zoom = Math.min(
  canvas.width  / (WORLD_W * TILE),
  canvas.height / (WORLD_H * TILE)
) * 0.92;
centerCamera();

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('year-label').textContent = formatYear(year);
  document.getElementById('era-label').textContent  = getEra(year).name;
}

function setSpeedUI() {
  const ids = ['btn-pause','btn-1x','btn-5x','btn-20x','btn-100x'];
  ids.forEach((id, i) => {
    document.getElementById(id).classList.toggle('active',
      paused ? i === 0 : i === speedIndex
    );
  });
}

document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused; setSpeedUI();
});
[['btn-1x',1],['btn-5x',2],['btn-20x',3],['btn-100x',4]].forEach(([id,idx]) => {
  document.getElementById(id).addEventListener('click', () => {
    speedIndex = idx; paused = false; setSpeedUI();
  });
});
setSpeedUI();

// ── Input ─────────────────────────────────────────────────────────────────────
let drag = { on:false, sx:0, sy:0, cx:0, cy:0 };

canvas.addEventListener('mousedown', e => {
  drag = { on:true, sx:e.clientX, sy:e.clientY, cx:cam.x, cy:cam.y };
});
canvas.addEventListener('mousemove', e => {
  if (!drag.on) return;
  cam.x = drag.cx + (e.clientX - drag.sx);
  cam.y = drag.cy + (e.clientY - drag.sy);
  clampCamera();
});
canvas.addEventListener('mouseup',    () => drag.on = false);
canvas.addEventListener('mouseleave', () => drag.on = false);

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
}, { passive:false });

// Touch
let lastPinch = null;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1)
    drag = { on:true, sx:e.touches[0].clientX, sy:e.touches[0].clientY, cx:cam.x, cy:cam.y };
});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && drag.on) {
    cam.x = drag.cx + (e.touches[0].clientX - drag.sx);
    cam.y = drag.cy + (e.touches[0].clientY - drag.sy);
    clampCamera();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const d  = Math.hypot(dx, dy);
    if (lastPinch) zoomAt(
      (e.touches[0].clientX + e.touches[1].clientX) / 2,
      (e.touches[0].clientY + e.touches[1].clientY) / 2,
      d / lastPinch
    );
    lastPinch = d;
  }
}, { passive:false });
canvas.addEventListener('touchend', () => { drag.on = false; lastPinch = null; });

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTs = null;
function loop(ts) {
  const dt = lastTs ? ts - lastTs : 16;
  lastTs = ts;

  tickTime(dt);
  updateHUD();
  renderFrame(dt);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
