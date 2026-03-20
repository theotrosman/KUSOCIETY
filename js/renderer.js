// ── Renderer ──────────────────────────────────────────────────────────────────
// Handles camera, zoom, and compositing all layers onto the main canvas

const cam = {
  x: 0, y: 0,   // world-space pixel offset
  zoom: 1,
  minZoom: 0.18,
  maxZoom: 5,
};

let _canvas = null;
let _ctx    = null;

function rendererInit(canvas) {
  _canvas = canvas;
  _ctx    = canvas.getContext('2d');
  _ctx.imageSmoothingEnabled = false;
}

function rendererResize() {
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
  _ctx.imageSmoothingEnabled = false;
}

function clampCamera() {
  const ww = WORLD_W * TILE * cam.zoom;
  const wh = WORLD_H * TILE * cam.zoom;
  const pad = 80;
  cam.x = Math.min(pad, Math.max(_canvas.width  - ww - pad, cam.x));
  cam.y = Math.min(pad, Math.max(_canvas.height - wh - pad, cam.y));
}

function centerCamera() {
  const ww = WORLD_W * TILE * cam.zoom;
  const wh = WORLD_H * TILE * cam.zoom;
  cam.x = (_canvas.width  - ww) / 2;
  cam.y = (_canvas.height - wh) / 2;
}

function zoomAt(mx, my, factor) {
  const prevZoom = cam.zoom;
  cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * factor));
  const scale = cam.zoom / prevZoom;
  cam.x = mx - (mx - cam.x) * scale;
  cam.y = my - (my - cam.y) * scale;
  clampCamera();
}

// ── Water animation ───────────────────────────────────────────────────────────
let _waterPhase = 0;

function renderFrame(dt) {
  _waterPhase += dt * 0.0008;

  _ctx.fillStyle = '#0a0e18';
  _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

  _ctx.save();
  _ctx.translate(cam.x, cam.y);
  _ctx.scale(cam.zoom, cam.zoom);

  // 1. Terrain base
  if (terrainCanvas) _ctx.drawImage(terrainCanvas, 0, 0);

  // 2. Water shimmer overlay (only visible at higher zoom)
  if (cam.zoom > 0.6) _drawWaterShimmer();

  // 3. Resources
  if (resourceCanvas && cam.zoom > 0.4) {
    _ctx.globalAlpha = Math.min(1, (cam.zoom - 0.4) / 0.3);
    _ctx.drawImage(resourceCanvas, 0, 0);
    _ctx.globalAlpha = 1;
  }

  _ctx.restore();
}

// Pre-built list of water tile positions for fast shimmer
let _waterTiles = null;

function buildWaterTileList() {
  _waterTiles = [];
  for (let ty = 0; ty < WORLD_H; ty++) {
    for (let tx = 0; tx < WORLD_W; tx++) {
      const cell = getCell(tx, ty);
      if (cell && (cell.biome === 'sea' || cell.biome === 'deep_sea')) {
        _waterTiles.push({ tx, ty, phase: (tx + ty) * 0.15 });
      }
    }
  }
}

function _drawWaterShimmer() {
  if (!_waterTiles) return;

  // Viewport culling: only draw tiles visible on screen
  const x0 = Math.floor(-cam.x / cam.zoom / TILE) - 1;
  const y0 = Math.floor(-cam.y / cam.zoom / TILE) - 1;
  const x1 = x0 + Math.ceil(_canvas.width  / cam.zoom / TILE) + 2;
  const y1 = y0 + Math.ceil(_canvas.height / cam.zoom / TILE) + 2;

  _ctx.fillStyle = 'rgba(120,180,240,0.07)';
  for (const w of _waterTiles) {
    if (w.tx < x0 || w.tx > x1 || w.ty < y0 || w.ty > y1) continue;
    if (Math.sin(_waterPhase + w.phase) > 0.55) {
      _ctx.fillRect(w.tx * TILE + 1, w.ty * TILE + TILE * 0.4, TILE - 2, 2);
    }
  }
}
