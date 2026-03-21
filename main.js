// Main entry point: canvas setup, render loop, camera, controls

const canvas = document.getElementById('world');
const ctx    = canvas.getContext('2d');

// Camera state
const cam = { x: 0, y: 0, zoom: 1 };
let drag = { active: false, sx: 0, sy: 0, cx: 0, cy: 0 };

// World data
let terrainMap    = null;
let terrainCanvas = null;

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

function clampCamera() {
  const worldPx = WORLD_W * TILE * cam.zoom;
  const worldPy = WORLD_H * TILE * cam.zoom;
  const margin  = 100;
  cam.x = Math.min(margin, Math.max(canvas.width  - worldPx - margin, cam.x));
  cam.y = Math.min(margin, Math.max(canvas.height - worldPy - margin, cam.y));
}

function centerCamera() {
  const worldPx = WORLD_W * TILE * cam.zoom;
  const worldPy = WORLD_H * TILE * cam.zoom;
  cam.x = (canvas.width  - worldPx) / 2;
  cam.y = (canvas.height - worldPy) / 2;
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!terrainCanvas) return;

  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);

  // Draw terrain
  ctx.drawImage(terrainCanvas, 0, 0);

  ctx.restore();
}

// ── HUD update ────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('year-label').textContent = formatYear(year);
  document.getElementById('era-label').textContent  = getEra(year).name;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  if (!lastTime) lastTime = ts;
  const delta = ts - lastTime;
  lastTime = ts;

  tickTime(delta);
  updateHUD();
  render();

  requestAnimationFrame(loop);
}

// ── Speed controls ────────────────────────────────────────────────────────────
function setSpeedUI() {
  const labels = ['⏸', '1x', '5x', '20x', '100x'];
  const ids     = ['btn-pause', 'btn-1x', 'btn-5x', 'btn-20x', 'btn-100x'];
  ids.forEach((id, i) => {
    const btn = document.getElementById(id);
    btn.classList.toggle('active',
      paused ? i === 0 : (!paused && i === speedIndex)
    );
  });
}

document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused;
  setSpeedUI();
});

[['btn-1x', 1], ['btn-5x', 2], ['btn-20x', 3], ['btn-100x', 4]].forEach(([id, idx]) => {
  document.getElementById(id).addEventListener('click', () => {
    speedIndex = idx;
    paused = false;
    setSpeedUI();
  });
});

// ── Mouse drag ────────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  drag = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
});
canvas.addEventListener('mousemove', e => {
  if (!drag.active) return;
  cam.x = drag.cx + (e.clientX - drag.sx);
  cam.y = drag.cy + (e.clientY - drag.sy);
  clampCamera();
});
canvas.addEventListener('mouseup',   () => { drag.active = false; });
canvas.addEventListener('mouseleave',() => { drag.active = false; });

// ── Zoom ──────────────────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const mx = e.clientX - cam.x;
  const my = e.clientY - cam.y;
  cam.zoom = Math.max(0.2, Math.min(4, cam.zoom * factor));
  cam.x = e.clientX - mx * factor * (e.deltaY < 0 ? 1 : 1);
  // Zoom toward mouse pointer
  cam.x = e.clientX - (mx / (cam.zoom / factor)) * cam.zoom;
  cam.y = e.clientY - (my / (cam.zoom / factor)) * cam.zoom;
  clampCamera();
}, { passive: false });

// ── Touch support ─────────────────────────────────────────────────────────────
let lastTouchDist = null;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    drag = { active: true, sx: e.touches[0].clientX, sy: e.touches[0].clientY, cx: cam.x, cy: cam.y };
  }
});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && drag.active) {
    cam.x = drag.cx + (e.touches[0].clientX - drag.sx);
    cam.y = drag.cy + (e.touches[0].clientY - drag.sy);
    clampCamera();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (lastTouchDist) {
      const factor = dist / lastTouchDist;
      cam.zoom = Math.max(0.2, Math.min(4, cam.zoom * factor));
      clampCamera();
    }
    lastTouchDist = dist;
  }
}, { passive: false });
canvas.addEventListener('touchend', () => { drag.active = false; lastTouchDist = null; });

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { resize(); clampCamera(); });
resize();

// Generate world
terrainMap    = generateTerrain();
terrainCanvas = buildTerrainCanvas(terrainMap);

// Start zoomed out to see the whole world
cam.zoom = Math.min(
  canvas.width  / (WORLD_W * TILE),
  canvas.height / (WORLD_H * TILE)
) * 0.95;
centerCamera();

setSpeedUI();
requestAnimationFrame(loop);
