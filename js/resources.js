// ── Resource definitions ──────────────────────────────────────────────────────
const RESOURCE_DEFS = {
  tree_oak   :{biomes:["grass","dense_grass","dry_grass"],                    density:0.28, icon:"🌳", label:"Roble",       food:0, wood:8,  stone:0},
  tree_pine  :{biomes:["forest","highland","taiga"],                          density:0.30, icon:"🌲", label:"Pino",        food:0, wood:10, stone:0},
  tree_palm  :{biomes:["shore","savanna","mangrove"],                         density:0.16, icon:"🌴", label:"Palma",       food:3, wood:5,  stone:0},
  tree_jungle:{biomes:["rainforest","bamboo_forest"],                         density:0.32, icon:"🌿", label:"Selva",       food:2, wood:7,  stone:0},
  tree_sakura:{biomes:["sakura_forest","forest","dense_grass"],               density:0.30, icon:"🌸", label:"Sakura",      food:1, wood:6,  stone:0},
  bush       :{biomes:["shrubland","savanna","dry_grass","tundra"],           density:0.18, icon:"🌿", label:"Arbusto",     food:2, wood:2,  stone:0},
  cactus     :{biomes:["desert","mesa"],                                      density:0.10, icon:"🌵", label:"Cactus",      food:2, wood:1,  stone:0},
  rock       :{biomes:["mountain","highland","shore","volcanic"],             density:0.20, icon:"🪨", label:"Roca",        food:0, wood:0,  stone:10},
  iron_ore   :{biomes:["mountain","highland","volcanic"],                     density:0.10, icon:"⛏",  label:"Hierro",      food:0, wood:0,  stone:5},
  gold_ore   :{biomes:["mountain","mesa"],                                    density:0.04, icon:"✦",  label:"Oro",         food:0, wood:0,  stone:0},
  coal       :{biomes:["highland","mountain","taiga"],                        density:0.08, icon:"◆",  label:"Carbón",      food:0, wood:0,  stone:0},
  fish       :{biomes:["sea","shore","coral_reef","mangrove"],                density:0.14, icon:"🐟", label:"Peces",       food:12,wood:0,  stone:0},
  wheat_wild :{biomes:["dry_grass","savanna","grass"],                        density:0.18, icon:"🌾", label:"Trigo",       food:8, wood:0,  stone:0},
  berries    :{biomes:["forest","dense_grass","rainforest","grass","taiga"],  density:0.14, icon:"🍒", label:"Bayas",       food:5, wood:0,  stone:0},
  mushroom   :{biomes:["swamp","forest","bamboo_forest"],                     density:0.10, icon:"🍄", label:"Hongos",      food:4, wood:0,  stone:0},
  clay       :{biomes:["swamp","shore","mangrove"],                           density:0.12, icon:"◉",  label:"Arcilla",     food:0, wood:0,  stone:3},
  animal     :{biomes:["grass","savanna","dry_grass","forest","tundra"],      density:0.10, icon:"🐗", label:"Animal",      food:15,wood:0,  stone:0},
  herb       :{biomes:["grass","dense_grass","forest","shrubland"],           density:0.10, icon:"🌿", label:"Hierba",      food:3, wood:0,  stone:0},
  bamboo     :{biomes:["bamboo_forest"],                                      density:0.35, icon:"🎋", label:"Bambú",       food:1, wood:12, stone:0},
  mammoth    :{biomes:["tundra","glacier"],                                   density:0.06, icon:"🦣", label:"Mamut",       food:25,wood:0,  stone:0},
  reindeer   :{biomes:["tundra","taiga"],                                     density:0.10, icon:"🦌", label:"Reno",        food:12,wood:0,  stone:0},
  obsidian   :{biomes:["volcanic"],                                           density:0.14, icon:"🔷", label:"Obsidiana",   food:0, wood:0,  stone:8},
  sulfur     :{biomes:["volcanic"],                                           density:0.08, icon:"💛", label:"Azufre",      food:0, wood:0,  stone:3},
  coral      :{biomes:["coral_reef"],                                         density:0.20, icon:"🪸", label:"Coral",       food:4, wood:0,  stone:2},
  mesa_rock  :{biomes:["mesa"],                                               density:0.22, icon:"🟫", label:"Arenisca",    food:0, wood:0,  stone:8},
  ice_block  :{biomes:["glacier"],                                            density:0.15, icon:"🧊", label:"Hielo",       food:0, wood:0,  stone:1},
  taiga_fur  :{biomes:["taiga"],                                              density:0.08, icon:"🐺", label:"Piel",        food:5, wood:0,  stone:0},
  mangrove_w :{biomes:["mangrove"],                                           density:0.25, icon:"🌱", label:"Mangle",      food:2, wood:6,  stone:0},
};

let resources = [];

// Flat typed grid: Int32Array index into resources[] (-1 = empty)
// Replaces 2D array of JS objects — saves ~7MB of object overhead
let _resourceGridFlat = null;

function _rgIdx(tx, ty) { return ty * WORLD_W + tx; }

// Legacy resourceGrid shim — accessed as resourceGrid[ty][tx]
let resourceGrid = null;
function _buildResourceGridShim() {
  resourceGrid = new Proxy([], {
    get(_, prop) {
      const ty = +prop;
      if (isNaN(ty)) return undefined;
      return new Proxy({}, {
        get(__, tx2) {
          const tx = +tx2;
          if (isNaN(tx)) return undefined;
          const ri = _resourceGridFlat[_rgIdx(tx, ty)];
          return ri >= 0 ? resources[ri] : null;
        },
        set(__, tx2, val) {
          const tx = +tx2;
          if (isNaN(tx)) return true;
          const idx = _rgIdx(tx, ty);
          if (val === null || val === undefined) {
            _resourceGridFlat[idx] = -1;
          } else {
            const ri = resources.indexOf(val);
            _resourceGridFlat[idx] = ri >= 0 ? ri : -1;
          }
          return true;
        }
      });
    }
  });
}

function spawnResources() {
  resources = [];
  _resourceGridFlat = new Int32Array(WORLD_W * WORLD_H).fill(-1);
  _buildResourceGridShim();
  const rng = mulberry32(WORLD_SEED ^ 0xABCD1234);
  for (let ty = 0; ty < WORLD_H; ty++) {
    for (let tx = 0; tx < WORLD_W; tx++) {
      const cell = getCell(tx, ty);
      if (!cell) continue;
      for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
        if (!def.biomes.includes(cell.biome)) continue;
        if (rng() > def.density) continue;
        const ri = resources.length;
        const res = { type, tx, ty, amount: 40 + Math.floor(rng() * 60), maxAmount: 100 };
        resources.push(res);
        _resourceGridFlat[_rgIdx(tx, ty)] = ri;
        break;
      }
    }
  }
}

// No separate resourceCanvas — resources drawn on-demand in renderFrame
// This saves ~59MB of canvas memory
let resourceCanvas = null;

function buildResourceCanvas() {
  resourceCanvas = null; // no-op
}

// Called by renderer to draw visible resources directly onto the main canvas
function drawResourcesDirect(ctx, cam, canvasW, canvasH) {
  if (cam.zoom < 0.4) return;
  const alpha = Math.min(1, (cam.zoom - 0.4) / 0.3);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const vx0 = Math.floor(-cam.x / cam.zoom / TILE) - 1;
  const vy0 = Math.floor(-cam.y / cam.zoom / TILE) - 1;
  const vx1 = Math.ceil((canvasW - cam.x) / cam.zoom / TILE) + 1;
  const vy1 = Math.ceil((canvasH - cam.y) / cam.zoom / TILE) + 1;

  const tx0 = Math.max(0, vx0), tx1 = Math.min(WORLD_W - 1, vx1);
  const ty0 = Math.max(0, vy0), ty1 = Math.min(WORLD_H - 1, vy1);

  const step = cam.zoom < 0.7 ? 2 : 1;
  const sz = Math.max(6, TILE * cam.zoom * 0.82);
  ctx.font = sz + "px serif";

  for (let ty = ty0; ty <= ty1; ty += step) {
    for (let tx = tx0; tx <= tx1; tx += step) {
      const ri = _resourceGridFlat[_rgIdx(tx, ty)];
      if (ri < 0) continue;
      const res = resources[ri];
      if (!res) continue;
      const def = RESOURCE_DEFS[res.type];
      if (!def) continue;
      const px = tx * TILE + TILE / 2;
      const py = ty * TILE + TILE / 2;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillText(def.icon, px + 1, py + 2);
      ctx.fillStyle = "#fff";
      ctx.fillText(def.icon, px, py);
    }
  }
  ctx.restore();
}

function _redrawAllResources() { /* no-op */ }
function _drawResource(ctx, res) { /* no-op */ }

function removeResource(tx, ty) {
  const idx = _rgIdx(tx, ty);
  const ri = _resourceGridFlat[idx];
  if (ri < 0) return;
  _resourceGridFlat[idx] = -1;
  // Swap-remove to avoid O(n) splice
  const last = resources.length - 1;
  if (ri !== last) {
    resources[ri] = resources[last];
    _resourceGridFlat[_rgIdx(resources[ri].tx, resources[ri].ty)] = ri;
  }
  resources.length = last;
}

function getResourceAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return null;
  const ri = _resourceGridFlat[_rgIdx(tx, ty)];
  return ri >= 0 ? resources[ri] : null;
}

function tickResourceGrowth(yearsElapsed) {
  if (yearsElapsed <= 0) return;
  const rng = mulberry32(WORLD_SEED ^ year ^ 0x5555);
  for (const res of resources) {
    if (res.amount < res.maxAmount) {
      res.amount = Math.min(res.maxAmount, res.amount + yearsElapsed * 1.5);
    }
  }
  const MAX_RES = typeof MAX_RESOURCES !== "undefined" ? MAX_RESOURCES : 5000;
  if (resources.length < MAX_RES) {
    const attempts = Math.ceil(yearsElapsed * 8);
    for (let i = 0; i < attempts; i++) {
      const tx = Math.floor(rng() * WORLD_W);
      const ty = Math.floor(rng() * WORLD_H);
      const idx = _rgIdx(tx, ty);
      if (_resourceGridFlat[idx] >= 0) continue;
      const cell = getCell(tx, ty);
      if (!cell || cell.h < T.SHORE) continue;
      for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
        if (!def.biomes.includes(cell.biome)) continue;
        if (rng() > def.density) continue;
        const ri = resources.length;
        const res2 = { type, tx, ty, amount: 20, maxAmount: 100 };
        resources.push(res2);
        _resourceGridFlat[idx] = ri;
        break;
      }
    }
  }
}
