// Terrain generation using simplex noise
const TILE = 6; // px per tile
const WORLD_W = 512;
const WORLD_H = 512;

// Biome thresholds
const DEEP_WATER  = 0.30;
const WATER       = 0.42;
const SAND        = 0.46;
const GRASS       = 0.65;
const FOREST      = 0.75;
const MOUNTAIN    = 0.85;
// above = snow

const BIOME_COLORS = {
  deep_water : '#1a3a5c',
  water      : '#1e4d7a',
  sand       : '#c2a96e',
  grass      : '#4a7c3f',
  forest     : '#2d5a27',
  mountain   : '#7a6a5a',
  snow       : '#dde8ee',
};

function generateTerrain() {
  // simplex-noise v4 exports differently depending on bundle
  let noise2D;
  if (typeof SimplexNoise !== 'undefined') {
    const sn = new SimplexNoise();
    noise2D = (x, y) => sn.noise2D(x, y);
  } else if (typeof simplexNoise !== 'undefined') {
    noise2D = simplexNoise.createNoise2D();
  } else {
    // fallback: try window exports
    const mod = window.simplexNoise || window.SimplexNoise;
    if (mod && mod.createNoise2D) {
      noise2D = mod.createNoise2D();
    } else if (mod) {
      const sn = new mod();
      noise2D = (x, y) => sn.noise2D(x, y);
    }
  }

  const map = new Float32Array(WORLD_W * WORLD_H);

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const nx = x / WORLD_W;
      const ny = y / WORLD_H;

      // Layered octaves for detail
      let v = 0;
      v += 1.00 * noise2D(nx * 3,  ny * 3);
      v += 0.50 * noise2D(nx * 6,  ny * 6);
      v += 0.25 * noise2D(nx * 12, ny * 12);
      v += 0.13 * noise2D(nx * 24, ny * 24);
      v /= 1.88;

      // Normalize -1..1 → 0..1
      v = (v + 1) / 2;

      // Elliptical falloff so edges are ocean
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      v -= dist * 0.45;

      map[y * WORLD_W + x] = Math.max(0, Math.min(1, v));
    }
  }

  return map;
}

function getBiome(v) {
  if (v < DEEP_WATER)  return 'deep_water';
  if (v < WATER)       return 'water';
  if (v < SAND)        return 'sand';
  if (v < GRASS)       return 'grass';
  if (v < FOREST)      return 'forest';
  if (v < MOUNTAIN)    return 'mountain';
  return 'snow';
}

function isLand(v) {
  return v >= SAND;
}

// Pre-render terrain to an offscreen canvas for fast blitting
function buildTerrainCanvas(map) {
  const offscreen = document.createElement('canvas');
  offscreen.width  = WORLD_W * TILE;
  offscreen.height = WORLD_H * TILE;
  const ctx = offscreen.getContext('2d');

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const v = map[y * WORLD_W + x];
      ctx.fillStyle = BIOME_COLORS[getBiome(v)];
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  return offscreen;
}
