// ── World dimensions ──────────────────────────────────────────────────────────
const TILE    = 8;
const WORLD_W = 1280;  // 25% wider — more room for civilizations and biomes
const WORLD_H = 720;

// Height thresholds
const T = {
  DEEP_SEA:0.28, SEA:0.40, SHORE:0.44,
  LOWLAND:0.50, GRASSLAND:0.62, HIGHLAND:0.73,
  MOUNTAIN:0.83, PEAK:0.91,
};
const M = { DRY:0.32, NORMAL:0.58, WET:0.76 };

// Latitude bands (0=north pole, 1=south pole) for polar biomes
// Used in getBiome to assign tundra/glacier near poles
function _latBand(ny) {
  // ny is normalized y (0..1). Poles at 0 and 1.
  return Math.min(ny, 1 - ny) * 2; // 0 at poles, 1 at equator
}

const BIOME_RGB = {
  deep_sea      :[15,  38,  72],
  sea           :[22,  65, 115],
  shore         :[194,178, 118],
  desert        :[214,185,  88],
  mesa          :[188,110,  55],   // NEW: red rock plateau
  savanna       :[172,158,  72],
  swamp         :[ 62,  85,  50],
  mangrove      :[ 45,  90,  60],  // NEW: coastal wetland
  dry_grass     :[128,152,  65],
  grass         :[ 74,138,  55],
  dense_grass   :[ 50,115,  50],
  shrubland     :[ 98,118,  65],
  bamboo_forest :[ 60,130,  55],   // NEW: dense bamboo
  forest        :[ 36,  90,  36],
  rainforest    :[ 22,  75,  30],
  taiga         :[ 55,  95,  75],  // NEW: boreal forest
  tundra        :[148,158, 138],   // NEW: cold flat plains
  highland      :[108,  98,  82],
  mountain      :[128,118, 108],
  volcanic      :[100,  40,  20],  // NEW: volcanic rock
  glacier       :[200,220, 240],   // NEW: permanent ice
  coral_reef    :[ 30, 140, 160],  // NEW: shallow tropical water
  snow          :[218,228, 234],
};

function getBiome(h, m, ny) {
  const lat = _latBand(ny); // 0=pole, 1=equator

  if(h<T.DEEP_SEA) return 'deep_sea';
  if(h<T.SEA){
    // Coral reef: warm shallow water near equator
    if(lat > 0.65 && m > M.NORMAL && h > T.SEA - 0.06) return 'coral_reef';
    return 'sea';
  }
  if(h<T.SHORE){
    // Mangrove: tropical coast with high moisture
    if(lat > 0.6 && m > M.WET) return 'mangrove';
    return 'shore';
  }

  // Polar regions → tundra or glacier
  if(lat < 0.18){
    if(h > T.HIGHLAND) return 'glacier';
    return 'tundra';
  }
  // Sub-polar → taiga
  if(lat < 0.32 && h >= T.LOWLAND && h < T.HIGHLAND){
    return 'taiga';
  }

  if(h<T.LOWLAND){
    if(m<M.DRY)  return 'desert';
    if(m<M.WET)  return 'savanna';
    return 'swamp';
  }
  if(h<T.GRASSLAND){
    if(m<M.DRY)  return 'dry_grass';
    if(m<M.WET)  return 'grass';
    return 'dense_grass';
  }
  if(h<T.HIGHLAND){
    if(m<M.DRY)  return 'shrubland';
    // Mesa: dry elevated terrain
    if(m<M.NORMAL && h > T.GRASSLAND + 0.04) return 'mesa';
    if(m<M.WET)  return 'forest';
    // Bamboo: wet tropical mid-elevation
    if(lat > 0.55 && m > M.WET) return 'bamboo_forest';
    return 'rainforest';
  }
  if(h<T.MOUNTAIN){
    // Volcanic: rare hot spots
    if(m < M.DRY - 0.05) return 'volcanic';
    return 'highland';
  }
  if(h<T.PEAK) return 'mountain';
  return 'snow';
}

let terrainData   = null;
let terrainCanvas = null;

function generateTerrain() {
  const n1 = makeNoise2D(WORLD_SEED);
  const n2 = makeNoise2D(WORLD_SEED + 1111);
  const n3 = makeNoise2D(WORLD_SEED + 2222);

  terrainData = new Array(WORLD_W * WORLD_H);

  // Pre-generate island centers for archipelago layout
  const islandRng = mulberry32(WORLD_SEED ^ 0xABCD);
  const NUM_ISLANDS = 11 + Math.floor(islandRng() * 6); // 11-16 islands for bigger map
  const islands = [];
  // First island always near center — guaranteed large spawn area
  islands.push({ cx:0.5, cy:0.5, r:0.18, strength:1.0 });
  // Add polar landmasses
  islands.push({ cx:0.3, cy:0.05, r:0.22, strength:0.85 }); // north polar
  islands.push({ cx:0.7, cy:0.95, r:0.20, strength:0.80 }); // south polar
  for(let i = 3; i < NUM_ISLANDS; i++){
    islands.push({
      cx: 0.06 + islandRng() * 0.88,
      cy: 0.06 + islandRng() * 0.88,
      r:  0.08 + islandRng() * 0.18,
      strength: 0.65 + islandRng() * 0.45,
    });
  }

  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++){
      const nx = x/WORLD_W;
      const ny = y/WORLD_H;

      // Domain-warped height
      const wx = fbm(n1, nx+0.1, ny+0.1, 3, 2.0, 0.5) * 0.3;
      const wy = fbm(n2, nx+5.2, ny+1.3, 3, 2.0, 0.5) * 0.3;
      let h = fbm(n1, nx+wx, ny+wy, 7, 2.1, 0.48);
      h = (h+1)/2;

      // Island mask
      let islandMask = 0;
      for(const isl of islands){
        const dx = (nx - isl.cx) * (WORLD_W / WORLD_H);
        const dy = ny - isl.cy;
        const d2 = dx*dx + dy*dy;
        const falloff = Math.exp(-d2 / (isl.r * isl.r * 2));
        islandMask = Math.max(islandMask, falloff * isl.strength);
      }

      h = h * 0.35 + islandMask * 0.85 - 0.12;
      h = Math.max(0, Math.min(1, h));

      // Moisture — add latitudinal gradient (wetter near equator)
      let m = fbm(n3, nx*2.8+10, ny*2.8+10, 5, 2.0, 0.5);
      m = (m+1)/2;
      const lat = _latBand(ny);
      m = m * 0.7 + lat * 0.3; // equator wetter, poles drier
      if(h<T.SEA)      m = Math.min(1, m+0.3);
      if(h>T.HIGHLAND) m = Math.max(0, m-0.2);

      const biome = getBiome(h, m, ny);
      const rgb = BIOME_RGB[biome] || [100,100,100];
      const [br,bg,bb] = rgb;
      const micro = (fbm(n2, nx*22, ny*22, 2, 2, 0.5)*0.5+0.5)*16-8;

      terrainData[y*WORLD_W+x] = {h, m, biome, br, bg, bb, micro, shade:0};
    }
  }

  // Slope shading — NW light
  for(let y=1;y<WORLD_H-1;y++){
    for(let x=1;x<WORLD_W-1;x++){
      const hC = terrainData[ y   *WORLD_W+x  ].h;
      const hW = terrainData[ y   *WORLD_W+x-1].h;
      const hN = terrainData[(y-1)*WORLD_W+x  ].h;
      const dot = (hC-hW) + (hC-hN);
      terrainData[y*WORLD_W+x].shade = dot * 200;
    }
  }

  terrainCanvas = _buildTerrainCanvas();
}

function _buildTerrainCanvas() {
  const off = document.createElement('canvas');
  off.width  = WORLD_W*TILE;
  off.height = WORLD_H*TILE;
  const ctx  = off.getContext('2d');
  const img  = ctx.createImageData(WORLD_W*TILE, WORLD_H*TILE);
  const d    = img.data;

  for(let ty=0;ty<WORLD_H;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const c = terrainData[ty*WORLD_W+tx];
      const s = c.shade + c.micro;
      let r = Math.max(0,Math.min(255, c.br+s));
      let g = Math.max(0,Math.min(255, c.bg+s));
      let b = Math.max(0,Math.min(255, c.bb+s));

      if(c.biome==='sea'||c.biome==='deep_sea'){
        const depth = 1 - c.h/T.SEA;
        r=Math.max(0,r-depth*22); g=Math.max(0,g-depth*10); b=Math.min(255,b+depth*18);
      }
      // Coral reef: teal shimmer
      if(c.biome==='coral_reef'){
        b=Math.min(255,b+20); g=Math.min(255,g+15);
      }
      // Glacier: blue-white tint
      if(c.biome==='glacier'){
        b=Math.min(255,b+25); r=Math.max(0,r-10);
      }
      // Volcanic: dark red with orange tint
      if(c.biome==='volcanic'){
        r=Math.min(255,r+Math.floor(Math.random()*15));
      }

      for(let py=0;py<TILE;py++){
        for(let px=0;px<TILE;px++){
          const i=((ty*TILE+py)*WORLD_W*TILE+(tx*TILE+px))*4;
          d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255;
        }
      }
    }
  }
  ctx.putImageData(img,0,0);

  // Elevation edge shadows (fake 3D depth)
  for(let ty=0;ty<WORLD_H-1;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const c = terrainData[ty*WORLD_W+tx];
      const n = terrainData[(ty+1)*WORLD_W+tx];
      const diff = c.h - n.h;
      if(diff>0.035 && c.h>=T.SHORE){
        const a = Math.min(0.75, diff*9);
        ctx.fillStyle=`rgba(0,0,0,${a.toFixed(2)})`;
        ctx.fillRect(tx*TILE,(ty+1)*TILE,TILE,Math.ceil(TILE*0.38));
        ctx.fillStyle=`rgba(255,255,255,${Math.min(0.35,diff*4).toFixed(2)})`;
        ctx.fillRect(tx*TILE,ty*TILE,TILE,Math.ceil(TILE*0.2));
      }
    }
  }

  return off;
}

function redrawTiles(tiles) {
  const ctx = terrainCanvas.getContext('2d');
  for(const {tx,ty} of tiles){
    const c = terrainData[ty*WORLD_W+tx];
    const s = c.shade + c.micro;
    let r=Math.max(0,Math.min(255,c.br+s));
    let g=Math.max(0,Math.min(255,c.bg+s));
    let b=Math.max(0,Math.min(255,c.bb+s));
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);
  }
}

function isLand(x,y){
  if(x<0||y<0||x>=WORLD_W||y>=WORLD_H) return false;
  const cell = terrainData[y*WORLD_W+x];
  // coral_reef is water, mangrove is land
  if(!cell) return false;
  if(cell.biome === 'coral_reef') return false;
  return cell.h>=T.SHORE;
}
function getCell(x,y){
  if(x<0||y<0||x>=WORLD_W||y>=WORLD_H) return null;
  return terrainData[y*WORLD_W+x];
}
