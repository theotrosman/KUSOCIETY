// ── Resource definitions ──────────────────────────────────────────────────────
const RESOURCE_DEFS = {
  // ── Existing biomes ───────────────────────────────────────────────────────
  tree_oak   :{biomes:['grass','dense_grass','dry_grass'],                    density:0.28, icon:'🌳', label:'Roble',       food:0, wood:8,  stone:0},
  tree_pine  :{biomes:['forest','highland','taiga'],                          density:0.30, icon:'🌲', label:'Pino',        food:0, wood:10, stone:0},
  tree_palm  :{biomes:['shore','savanna','mangrove'],                         density:0.16, icon:'🌴', label:'Palma',       food:3, wood:5,  stone:0},
  tree_jungle:{biomes:['rainforest','bamboo_forest'],                         density:0.32, icon:'🌿', label:'Selva',       food:2, wood:7,  stone:0},
  bush       :{biomes:['shrubland','savanna','dry_grass','tundra'],           density:0.18, icon:'🌿', label:'Arbusto',     food:2, wood:2,  stone:0},
  cactus     :{biomes:['desert','mesa'],                                      density:0.10, icon:'🌵', label:'Cactus',      food:2, wood:1,  stone:0},
  rock       :{biomes:['mountain','highland','shore','volcanic'],             density:0.20, icon:'🪨', label:'Roca',        food:0, wood:0,  stone:10},
  iron_ore   :{biomes:['mountain','highland','volcanic'],                     density:0.10, icon:'⛏',  label:'Hierro',      food:0, wood:0,  stone:5},
  gold_ore   :{biomes:['mountain','mesa'],                                    density:0.04, icon:'✦',  label:'Oro',         food:0, wood:0,  stone:0},
  coal       :{biomes:['highland','mountain','taiga'],                        density:0.08, icon:'◆',  label:'Carbón',      food:0, wood:0,  stone:0},
  fish       :{biomes:['sea','shore','coral_reef','mangrove'],                density:0.14, icon:'🐟', label:'Peces',       food:12,wood:0,  stone:0},
  wheat_wild :{biomes:['dry_grass','savanna','grass'],                        density:0.18, icon:'🌾', label:'Trigo',       food:8, wood:0,  stone:0},
  berries    :{biomes:['forest','dense_grass','rainforest','grass','taiga'],  density:0.14, icon:'🍒', label:'Bayas',       food:5, wood:0,  stone:0},
  mushroom   :{biomes:['swamp','forest','bamboo_forest'],                     density:0.10, icon:'🍄', label:'Hongos',      food:4, wood:0,  stone:0},
  clay       :{biomes:['swamp','shore','mangrove'],                           density:0.12, icon:'◉',  label:'Arcilla',     food:0, wood:0,  stone:3},
  animal     :{biomes:['grass','savanna','dry_grass','forest','tundra'],      density:0.10, icon:'🐗', label:'Animal',      food:15,wood:0,  stone:0},
  herb       :{biomes:['grass','dense_grass','forest','shrubland'],           density:0.10, icon:'🌿', label:'Hierba',      food:3, wood:0,  stone:0},
  // ── New biome resources ───────────────────────────────────────────────────
  bamboo     :{biomes:['bamboo_forest'],                                      density:0.35, icon:'🎋', label:'Bambú',       food:1, wood:12, stone:0},
  mammoth    :{biomes:['tundra','glacier'],                                   density:0.06, icon:'🦣', label:'Mamut',       food:25,wood:0,  stone:0},
  reindeer   :{biomes:['tundra','taiga'],                                     density:0.10, icon:'🦌', label:'Reno',        food:12,wood:0,  stone:0},
  obsidian   :{biomes:['volcanic'],                                           density:0.14, icon:'🔷', label:'Obsidiana',   food:0, wood:0,  stone:8},
  sulfur     :{biomes:['volcanic'],                                           density:0.08, icon:'💛', label:'Azufre',      food:0, wood:0,  stone:3},
  coral      :{biomes:['coral_reef'],                                         density:0.20, icon:'🪸', label:'Coral',       food:4, wood:0,  stone:2},
  mesa_rock  :{biomes:['mesa'],                                               density:0.22, icon:'🟫', label:'Arenisca',    food:0, wood:0,  stone:8},
  ice_block  :{biomes:['glacier'],                                            density:0.15, icon:'🧊', label:'Hielo',       food:0, wood:0,  stone:1},
  taiga_fur  :{biomes:['taiga'],                                              density:0.08, icon:'🐺', label:'Piel',        food:5, wood:0,  stone:0},
  mangrove_w :{biomes:['mangrove'],                                           density:0.25, icon:'🌱', label:'Mangle',      food:2, wood:6,  stone:0},
};

let resources    = [];
let resourceGrid = null;

function spawnResources() {
  resources    = [];
  resourceGrid = Array.from({length:WORLD_H}, ()=>new Array(WORLD_W).fill(null));
  const rng    = mulberry32(WORLD_SEED ^ 0xABCD1234);

  for(let ty=0;ty<WORLD_H;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const cell = getCell(tx,ty);
      if(!cell) continue;
      for(const [type,def] of Object.entries(RESOURCE_DEFS)){
        if(!def.biomes.includes(cell.biome)) continue;
        if(rng()>def.density) continue;
        const res = {type, tx, ty, amount:40+Math.floor(rng()*60), maxAmount:100};
        resources.push(res);
        resourceGrid[ty][tx] = res;
        break;
      }
    }
  }
}

let resourceCanvas = null;

function buildResourceCanvas() {
  resourceCanvas = document.createElement('canvas');
  resourceCanvas.width  = WORLD_W*TILE;
  resourceCanvas.height = WORLD_H*TILE;
  _redrawAllResources();
}

function _redrawAllResources() {
  const ctx = resourceCanvas.getContext('2d');
  ctx.clearRect(0,0,resourceCanvas.width,resourceCanvas.height);
  ctx.textAlign='center'; ctx.textBaseline='middle';

  for(const res of resources){
    _drawResource(ctx, res);
  }
}

function _drawResource(ctx, res) {
  const def = RESOURCE_DEFS[res.type];
  const px  = res.tx*TILE + TILE/2;
  const py  = res.ty*TILE + TILE/2;
  const sz  = TILE*0.82;
  ctx.font  = `${sz}px serif`;
  // Drop shadow for depth
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.fillText(def.icon, px+1, py+2);
  ctx.fillStyle='#fff';
  ctx.fillText(def.icon, px, py);
}

function removeResource(tx, ty) {
  const res = resourceGrid[ty][tx];
  if(!res) return;
  resourceGrid[ty][tx] = null;
  const idx = resources.indexOf(res);
  if(idx>=0) resources.splice(idx,1);
  // Clear that tile on resource canvas
  const ctx = resourceCanvas.getContext('2d');
  ctx.clearRect(tx*TILE, ty*TILE, TILE, TILE);
}

function getResourceAt(tx, ty) {
  if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) return null;
  return resourceGrid[ty][tx];
}

// Regrow resources over time — only sample random tiles instead of full scan
function tickResourceGrowth(yearsElapsed) {
  if(yearsElapsed<=0) return;
  const rng = mulberry32(WORLD_SEED ^ year ^ 0x5555);
  const ctx = resourceCanvas.getContext('2d');

  // Regrow existing resources
  for(const res of resources){
    if(res.amount < res.maxAmount){
      res.amount = Math.min(res.maxAmount, res.amount + yearsElapsed*1.5);
    }
  }

  // Spawn new resources — sample random tiles instead of full world scan
  if(resources.length < (typeof MAX_RESOURCES !== 'undefined' ? MAX_RESOURCES : 8000)){
  const attempts=Math.ceil(yearsElapsed*8);
  for(let i=0;i<attempts;i++){
    const tx=Math.floor(rng()*WORLD_W);
    const ty=Math.floor(rng()*WORLD_H);
    if(resourceGrid[ty][tx])continue;
    const cell=getCell(tx,ty);
    if(!cell||cell.h<T.SHORE)continue;
    for(const [type,def] of Object.entries(RESOURCE_DEFS)){
      if(!def.biomes.includes(cell.biome))continue;
      if(rng()>def.density)continue;
      const res2={type,tx,ty,amount:20,maxAmount:100};
      resources.push(res2);
      resourceGrid[ty][tx]=res2;
      _drawResource(ctx,res2);
      break;
    }
  }
  }
}
