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
  deep_sea      :[12,  32,  68],
  sea           :[18,  58, 108],
  shore         :[186,168, 108],
  desert        :[200,172,  78],
  mesa          :[175, 98,  48],
  savanna       :[158,145,  62],
  swamp         :[ 52,  75,  44],
  mangrove      :[ 38,  82,  54],
  dry_grass     :[118,140,  58],
  grass         :[ 64,125,  48],
  dense_grass   :[ 42,105,  44],
  shrubland     :[ 88,108,  58],
  bamboo_forest :[ 52,118,  48],
  forest        :[ 28,  80,  30],
  rainforest    :[ 18,  65,  26],
  taiga         :[ 48,  88,  68],
  tundra        :[138,148, 128],
  highland      :[ 98,  90,  75],
  mountain      :[118,110, 100],
  volcanic      :[ 88,  34,  16],
  glacier       :[195,215, 235],
  coral_reef    :[ 24, 128, 152],
  snow          :[212,222, 230],
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

      // Domain-warped height — stronger warp for more organic coastlines
      const wx = fbm(n1, nx+0.1, ny+0.1, 4, 2.0, 0.5) * 0.4;
      const wy = fbm(n2, nx+5.2, ny+1.3, 4, 2.0, 0.5) * 0.4;
      let h = fbm(n1, nx+wx, ny+wy, 8, 2.1, 0.46);
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

      h = h * 0.30 + islandMask * 0.90 - 0.10;
      h = Math.max(0, Math.min(1, h));

      // Moisture — add latitudinal gradient (wetter near equator)
      let m = fbm(n3, nx*1.8+10, ny*1.8+10, 4, 2.0, 0.5);
      m = (m+1)/2;
      const lat = _latBand(ny);
      m = m * 0.65 + lat * 0.35; // equator wetter, poles drier
      if(h<T.SEA)      m = Math.min(1, m+0.3);
      if(h>T.HIGHLAND) m = Math.max(0, m-0.25);

      const biome = getBiome(h, m, ny);
      const rgb = BIOME_RGB[biome] || [100,100,100];
      const [br,bg,bb] = rgb;
      // Reduced micro noise — less speckle, smoother look
      const micro = (fbm(n2, nx*14, ny*14, 2, 2, 0.5)*0.5+0.5)*10-5;

      terrainData[y*WORLD_W+x] = {h, m, biome, br, bg, bb, micro, shade:0};
    }
  }

  // Slope shading — NW light, stronger for more dramatic terrain
  for(let y=1;y<WORLD_H-1;y++){
    for(let x=1;x<WORLD_W-1;x++){
      const hC = terrainData[ y   *WORLD_W+x  ].h;
      const hW = terrainData[ y   *WORLD_W+x-1].h;
      const hN = terrainData[(y-1)*WORLD_W+x  ].h;
      const hE = terrainData[ y   *WORLD_W+x+1].h;
      const hS = terrainData[(y+1)*WORLD_W+x  ].h;
      // Sobel-like normal estimation for smoother shading
      const dot = (hC-hW)*1.2 + (hC-hN)*1.2 + (hE-hC)*0.4 + (hS-hC)*0.4;
      terrainData[y*WORLD_W+x].shade = dot * 180;
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

  // Pre-compute blended colors per tile — mix with 4 neighbors for smooth transitions
  const blended = new Uint8Array(WORLD_W * WORLD_H * 3);
  for(let ty=0; ty<WORLD_H; ty++){
    for(let tx=0; tx<WORLD_W; tx++){
      const c = terrainData[ty*WORLD_W+tx];
      // Gather neighbor colors (clamp to edges)
      const n = terrainData[Math.max(0,ty-1)*WORLD_W+tx];
      const s2= terrainData[Math.min(WORLD_H-1,ty+1)*WORLD_W+tx];
      const ww= terrainData[ty*WORLD_W+Math.max(0,tx-1)];
      const e = terrainData[ty*WORLD_W+Math.min(WORLD_W-1,tx+1)];
      // Diagonal neighbors for smoother blending
      const nw= terrainData[Math.max(0,ty-1)*WORLD_W+Math.max(0,tx-1)];
      const ne= terrainData[Math.max(0,ty-1)*WORLD_W+Math.min(WORLD_W-1,tx+1)];
      const sw= terrainData[Math.min(WORLD_H-1,ty+1)*WORLD_W+Math.max(0,tx-1)];
      const se= terrainData[Math.min(WORLD_H-1,ty+1)*WORLD_W+Math.min(WORLD_W-1,tx+1)];
      // Weighted average: center=4, cardinal=2, diagonal=1 (total weight=16)
      const idx = (ty*WORLD_W+tx)*3;
      blended[idx  ] = Math.round((c.br*4 + n.br*2 + s2.br*2 + ww.br*2 + e.br*2 + nw.br + ne.br + sw.br + se.br) / 16);
      blended[idx+1] = Math.round((c.bg*4 + n.bg*2 + s2.bg*2 + ww.bg*2 + e.bg*2 + nw.bg + ne.bg + sw.bg + se.bg) / 16);
      blended[idx+2] = Math.round((c.bb*4 + n.bb*2 + s2.bb*2 + ww.bb*2 + e.bb*2 + nw.bb + ne.bb + sw.bb + se.bb) / 16);
    }
  }

  for(let ty=0;ty<WORLD_H;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const c = terrainData[ty*WORLD_W+tx];
      const s = c.shade + c.micro;
      const bi = (ty*WORLD_W+tx)*3;
      let r = Math.max(0,Math.min(255, blended[bi  ]+s));
      let g = Math.max(0,Math.min(255, blended[bi+1]+s));
      let b = Math.max(0,Math.min(255, blended[bi+2]+s));

      if(c.biome==='sea'||c.biome==='deep_sea'){
        const depth = 1 - c.h/T.SEA;
        r=Math.max(0,r-depth*20); g=Math.max(0,g-depth*8); b=Math.min(255,b+depth*16);
        // Deeper water gets darker blue-green
        if(c.biome==='deep_sea'){
          r=Math.max(0,r-8); g=Math.max(0,g-4); b=Math.min(255,b+8);
        }
      }
      if(c.biome==='coral_reef'){
        b=Math.min(255,b+18); g=Math.min(255,g+12);
      }
      if(c.biome==='glacier'){
        b=Math.min(255,b+20); r=Math.max(0,r-8);
      }
      if(c.biome==='volcanic'){
        r=Math.min(255,r+Math.floor(Math.random()*12));
      }

      for(let py=0;py<TILE;py++){
        for(let px=0;px<TILE;px++){
          const i=((ty*TILE+py)*WORLD_W*TILE+(tx*TILE+px))*4;
          // Sub-tile micro variation for texture
          const mv = (px^py)&1 ? 2 : -1;
          d[i  ]=Math.max(0,Math.min(255,r+mv));
          d[i+1]=Math.max(0,Math.min(255,g+mv));
          d[i+2]=Math.max(0,Math.min(255,b));
          d[i+3]=255;
        }
      }
    }
  }
  ctx.putImageData(img,0,0);

  // Elevation edge shadows — softer, more natural depth
  for(let ty=0;ty<WORLD_H-1;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const c = terrainData[ty*WORLD_W+tx];
      const n = terrainData[(ty+1)*WORLD_W+tx];
      const diff = c.h - n.h;
      if(diff>0.025 && c.h>=T.SHORE){
        const a = Math.min(0.65, diff*8);
        ctx.fillStyle=`rgba(0,0,0,${a.toFixed(2)})`;
        ctx.fillRect(tx*TILE,(ty+1)*TILE,TILE,Math.ceil(TILE*0.45));
        ctx.fillStyle=`rgba(255,255,255,${Math.min(0.28,diff*3.5).toFixed(2)})`;
        ctx.fillRect(tx*TILE,ty*TILE,TILE,Math.ceil(TILE*0.18));
      }
    }
  }
  // Horizontal shadows too
  for(let ty=0;ty<WORLD_H;ty++){
    for(let tx=0;tx<WORLD_W-1;tx++){
      const c = terrainData[ty*WORLD_W+tx];
      const e = terrainData[ty*WORLD_W+tx+1];
      const diff = c.h - e.h;
      if(diff>0.03 && c.h>=T.SHORE){
        const a = Math.min(0.45, diff*6);
        ctx.fillStyle=`rgba(0,0,0,${a.toFixed(2)})`;
        ctx.fillRect((tx+1)*TILE,ty*TILE,Math.ceil(TILE*0.3),TILE);
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
