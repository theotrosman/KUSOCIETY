// ── World dimensions ──────────────────────────────────────────────────────────
const TILE    = 8;   // 8px per tile — better visual resolution
const WORLD_W = 1280;
const WORLD_H = 720;
const _N = WORLD_W * WORLD_H;

// Height thresholds
const T = {
  DEEP_SEA:0.28, SEA:0.40, SHORE:0.44,
  LOWLAND:0.50, GRASSLAND:0.62, HIGHLAND:0.73,
  MOUNTAIN:0.83, PEAK:0.91,
};
const M = { DRY:0.32, NORMAL:0.58, WET:0.76 };

// ── Compact terrain storage — TypedArrays instead of JS objects ───────────────
// ~10MB total vs ~300MB for object array
let _tH    = null; // Float32Array — height [0..1]
let _tBiomeId = null; // Uint8Array  — biome index
let _tBr   = null; // Uint8Array  — base red   (only needed for redrawTiles)
let _tBg   = null; // Uint8Array  — base green
let _tBb   = null; // Uint8Array  — base blue
let _tShade= null; // Int8Array   — shade offset
let _tMicro= null; // Int8Array   — micro noise

// Biome name ↔ id mapping
const BIOME_NAMES = [
  'deep_sea','sea','shore','desert','mesa','savanna','swamp','mangrove',
  'dry_grass','grass','dense_grass','shrubland','bamboo_forest','forest',
  'rainforest','taiga','tundra','highland','mountain','volcanic','glacier',
  'coral_reef','snow','sakura_forest',
];
const BIOME_ID = {};
BIOME_NAMES.forEach((b,i)=>{ BIOME_ID[b]=i; });

// Legacy getCell — returns a lightweight proxy object for compatibility
// Only allocates when called; hot paths should use _tH[idx] / BIOME_NAMES[_tBiomeId[idx]] directly
function getCell(x,y){
  if(x<0||y<0||x>=WORLD_W||y>=WORLD_H) return null;
  const idx=y*WORLD_W+x;
  if(!_tH) return null;
  return {
    get h(){ return _tH[idx]; },
    set h(v){ _tH[idx]=v; },
    get biome(){ return BIOME_NAMES[_tBiomeId[idx]]; },
    set biome(v){ _tBiomeId[idx]=BIOME_ID[v]||0; if(_tBr)_applyBiomeColor(idx,v); },
    get br(){ return _tBr?_tBr[idx]:0; },
    get bg(){ return _tBg?_tBg[idx]:0; },
    get bb(){ return _tBb?_tBb[idx]:0; },
    get shade(){ return _tShade?_tShade[idx]:0; },
    get micro(){ return _tMicro?_tMicro[idx]:0; },
  };
}

function _applyBiomeColor(idx, biome){
  const rgb = BIOME_RGB[biome]||[100,100,100];
  _tBr[idx]=rgb[0]; _tBg[idx]=rgb[1]; _tBb[idx]=rgb[2];
}

function isLand(x,y){
  if(x<0||y<0||x>=WORLD_W||y>=WORLD_H) return false;
  if(!_tH) return false;
  const idx=y*WORLD_W+x;
  const bid=_tBiomeId[idx];
  if(bid===BIOME_ID['coral_reef']) return false;
  return _tH[idx]>=T.SHORE;
}

function _latBand(ny) {
  return Math.min(ny, 1 - ny) * 2;
}

const BIOME_RGB = {
  deep_sea      :[ 8,  22,  58],
  sea           :[14,  52, 105],
  shore         :[210,188, 120],
  desert        :[218,185,  72],
  mesa          :[188, 95,  42],
  savanna       :[172,155,  55],
  swamp         :[ 44,  68,  36],
  mangrove      :[ 30,  78,  48],
  dry_grass     :[128,152,  52],
  grass         :[ 58,138,  44],
  dense_grass   :[ 36,118,  40],
  shrubland     :[ 82,112,  52],
  bamboo_forest :[ 44,128,  42],
  forest        :[ 22,  88,  28],
  rainforest    :[ 12,  72,  22],
  taiga         :[ 42,  95,  65],
  tundra        :[148,158, 135],
  highland      :[ 105, 95,  78],
  mountain      :[128,118, 108],
  volcanic      :[ 95,  28,  12],
  glacier       :[205,225, 245],
  coral_reef    :[ 18, 138, 165],
  snow          :[220,232, 242],
  sakura_forest :[210, 148, 168],
};

function getBiome(h, m, ny) {
  const lat = _latBand(ny);
  if(h<T.DEEP_SEA) return 'deep_sea';
  if(h<T.SEA){
    if(lat > 0.65 && m > M.NORMAL && h > T.SEA - 0.06) return 'coral_reef';
    return 'sea';
  }
  if(h<T.SHORE){
    if(lat > 0.6 && m > M.WET) return 'mangrove';
    return 'shore';
  }
  if(lat < 0.18){
    if(h > T.HIGHLAND) return 'glacier';
    return 'tundra';
  }
  if(lat < 0.32 && h >= T.LOWLAND && h < T.HIGHLAND) return 'taiga';
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
    if(m<M.NORMAL && h > T.GRASSLAND + 0.04) return 'mesa';
    if(m<M.WET)  return 'forest';
    if(lat > 0.55 && m > M.WET) return 'bamboo_forest';
    if(lat > 0.38 && lat < 0.62 && m > M.NORMAL && m < M.WET) return 'sakura_forest';
    return 'rainforest';
  }
  if(h<T.MOUNTAIN){
    if(m < M.DRY - 0.05) return 'volcanic';
    return 'highland';
  }
  if(h<T.PEAK) return 'mountain';
  return 'snow';
}

// Legacy terrainData reference — null after canvas is built (freed)
let terrainData   = null;
let terrainCanvas = null;

function generateTerrain() {
  const n1 = makeNoise2D(WORLD_SEED);
  const n2 = makeNoise2D(WORLD_SEED + 1111);
  const n3 = makeNoise2D(WORLD_SEED + 2222);

  // Allocate compact TypedArrays
  _tH      = new Float32Array(_N);
  _tBiomeId= new Uint8Array(_N);
  _tBr     = new Uint8Array(_N);
  _tBg     = new Uint8Array(_N);
  _tBb     = new Uint8Array(_N);
  _tShade  = new Int8Array(_N);
  _tMicro  = new Int8Array(_N);

  const islandRng = mulberry32(WORLD_SEED ^ 0xABCD);
  const NUM_ISLANDS = 11 + Math.floor(islandRng() * 6);
  const islands = [];
  islands.push({ cx:0.5, cy:0.5, r:0.18, strength:1.0 });
  islands.push({ cx:0.3, cy:0.05, r:0.22, strength:0.85 });
  islands.push({ cx:0.7, cy:0.95, r:0.20, strength:0.80 });
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
      const nx = x/WORLD_W, ny = y/WORLD_H;
      const wx = fbm(n1, nx+0.1, ny+0.1, 4, 2.0, 0.5) * 0.4;
      const wy = fbm(n2, nx+5.2, ny+1.3, 4, 2.0, 0.5) * 0.4;
      let h = fbm(n1, nx+wx, ny+wy, 8, 2.1, 0.46);
      h = (h+1)/2;
      let islandMask = 0;
      for(const isl of islands){
        const dx = (nx - isl.cx) * (WORLD_W / WORLD_H);
        const dy = ny - isl.cy;
        const d2 = dx*dx + dy*dy;
        islandMask = Math.max(islandMask, Math.exp(-d2/(isl.r*isl.r*2)) * isl.strength);
      }
      h = Math.max(0, Math.min(1, h * 0.30 + islandMask * 0.90 - 0.10));
      let m = fbm(n3, nx*1.8+10, ny*1.8+10, 4, 2.0, 0.5);
      m = (m+1)/2;
      const lat = _latBand(ny);
      m = m * 0.65 + lat * 0.35;
      if(h<T.SEA)      m = Math.min(1, m+0.3);
      if(h>T.HIGHLAND) m = Math.max(0, m-0.25);
      const biome = getBiome(h, m, ny);
      const rgb = BIOME_RGB[biome] || [100,100,100];
      const micro = Math.round((fbm(n2, nx*14, ny*14, 2, 2, 0.5)*0.5+0.5)*10-5);
      const idx = y*WORLD_W+x;
      _tH[idx] = h;
      _tBiomeId[idx] = BIOME_ID[biome]||0;
      _tBr[idx] = rgb[0]; _tBg[idx] = rgb[1]; _tBb[idx] = rgb[2];
      _tMicro[idx] = Math.max(-128, Math.min(127, micro));
    }
  }

  // Slope shading
  for(let y=1;y<WORLD_H-1;y++){
    for(let x=1;x<WORLD_W-1;x++){
      const idx=y*WORLD_W+x;
      const hC=_tH[idx], hW=_tH[idx-1], hN=_tH[idx-WORLD_W], hE=_tH[idx+1], hS=_tH[idx+WORLD_W];
      const dot = (hC-hW)*1.2 + (hC-hN)*1.2 + (hE-hC)*0.4 + (hS-hC)*0.4;
      _tShade[idx] = Math.max(-128, Math.min(127, Math.round(dot * 180)));
    }
  }

  // Build legacy terrainData proxy array for any code that still uses it directly
  // This is a thin wrapper — no extra memory for the data itself
  terrainData = new Proxy([], {
    get(_, prop){
      const i = +prop;
      if(!isNaN(i)) return getCell(i%WORLD_W, Math.floor(i/WORLD_W));
      return undefined;
    }
  });

  terrainCanvas = _buildTerrainCanvas();

  // Free color/shade arrays after canvas is built — not needed at runtime
  // Keep _tH and _tBiomeId — needed for isLand/getCell/modifyTerrain
  _tBr = null; _tBg = null; _tBb = null;
  _tShade = null; _tMicro = null;
  terrainData = null; // free proxy too
}

function _buildTerrainCanvas() {
  const off = document.createElement('canvas');
  off.width  = WORLD_W*TILE;
  off.height = WORLD_H*TILE;
  const ctx  = off.getContext('2d');
  const img  = ctx.createImageData(WORLD_W*TILE, WORLD_H*TILE);
  const d    = img.data;

  // Pre-compute blended colors
  const blended = new Uint8Array(_N * 3);
  for(let ty=0; ty<WORLD_H; ty++){
    for(let tx=0; tx<WORLD_W; tx++){
      const idx=ty*WORLD_W+tx;
      const n  = Math.max(0,ty-1)*WORLD_W+tx;
      const s2 = Math.min(WORLD_H-1,ty+1)*WORLD_W+tx;
      const ww = ty*WORLD_W+Math.max(0,tx-1);
      const e  = ty*WORLD_W+Math.min(WORLD_W-1,tx+1);
      const nw = Math.max(0,ty-1)*WORLD_W+Math.max(0,tx-1);
      const ne = Math.max(0,ty-1)*WORLD_W+Math.min(WORLD_W-1,tx+1);
      const sw = Math.min(WORLD_H-1,ty+1)*WORLD_W+Math.max(0,tx-1);
      const se = Math.min(WORLD_H-1,ty+1)*WORLD_W+Math.min(WORLD_W-1,tx+1);
      const bi = idx*3;
      blended[bi  ] = Math.round((_tBr[idx]*4+_tBr[n]*2+_tBr[s2]*2+_tBr[ww]*2+_tBr[e]*2+_tBr[nw]+_tBr[ne]+_tBr[sw]+_tBr[se])/16);
      blended[bi+1] = Math.round((_tBg[idx]*4+_tBg[n]*2+_tBg[s2]*2+_tBg[ww]*2+_tBg[e]*2+_tBg[nw]+_tBg[ne]+_tBg[sw]+_tBg[se])/16);
      blended[bi+2] = Math.round((_tBb[idx]*4+_tBb[n]*2+_tBb[s2]*2+_tBb[ww]*2+_tBb[e]*2+_tBb[nw]+_tBb[ne]+_tBb[sw]+_tBb[se])/16);
    }
  }

  for(let ty=0;ty<WORLD_H;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const idx=ty*WORLD_W+tx;
      const s = _tShade[idx] + _tMicro[idx];
      const bi = idx*3;
      let r = Math.max(0,Math.min(255, blended[bi  ]+s));
      let g = Math.max(0,Math.min(255, blended[bi+1]+s));
      let b = Math.max(0,Math.min(255, blended[bi+2]+s));
      const biome = BIOME_NAMES[_tBiomeId[idx]];
      const h = _tH[idx];
      if(biome==='sea'||biome==='deep_sea'){
        const depth = 1 - h/T.SEA;
        r=Math.max(0,r-depth*22); g=Math.max(0,g-depth*10); b=Math.min(255,b+depth*20);
        if(biome==='deep_sea'){ r=Math.max(0,r-10); g=Math.max(0,g-5); b=Math.min(255,b+12); }
      }
      if(biome==='coral_reef'){ b=Math.min(255,b+22); g=Math.min(255,g+15); }
      if(biome==='glacier')   { b=Math.min(255,b+25); r=Math.max(0,r-10); g=Math.min(255,g+5); }
      if(biome==='volcanic')  { r=Math.min(255,r+Math.floor(Math.random()*14)); g=Math.max(0,g-5); }
      if(biome==='sakura_forest'){ r=Math.min(255,r+8); b=Math.min(255,b+12); g=Math.max(0,g-5); }
      for(let py=0;py<TILE;py++){
        for(let px=0;px<TILE;px++){
          const i=((ty*TILE+py)*WORLD_W*TILE+(tx*TILE+px))*4;
          // Smooth sub-tile variation using a soft gradient instead of checkerboard
          const edgeFade = (px===0||px===TILE-1||py===0||py===TILE-1) ? -1 : 0;
          const centerBoost = (px===Math.floor(TILE/2)&&py===Math.floor(TILE/2)) ? 1 : 0;
          const mv = edgeFade + centerBoost;
          d[i  ]=Math.max(0,Math.min(255,r+mv));
          d[i+1]=Math.max(0,Math.min(255,g+mv));
          d[i+2]=Math.max(0,Math.min(255,b));
          d[i+3]=255;
        }
      }
    }
  }
  ctx.putImageData(img,0,0);

  // Elevation edge shadows
  for(let ty=0;ty<WORLD_H-1;ty++){
    for(let tx=0;tx<WORLD_W;tx++){
      const idx=ty*WORLD_W+tx;
      const diff = _tH[idx] - _tH[idx+WORLD_W];
      if(diff>0.025 && _tH[idx]>=T.SHORE){
        const a = Math.min(0.65, diff*8);
        ctx.fillStyle=`rgba(0,0,0,${a.toFixed(2)})`;
        ctx.fillRect(tx*TILE,(ty+1)*TILE,TILE,Math.ceil(TILE*0.45));
        ctx.fillStyle=`rgba(255,255,255,${Math.min(0.28,diff*3.5).toFixed(2)})`;
        ctx.fillRect(tx*TILE,ty*TILE,TILE,Math.ceil(TILE*0.18));
      }
    }
  }
  for(let ty=0;ty<WORLD_H;ty++){
    for(let tx=0;tx<WORLD_W-1;tx++){
      const idx=ty*WORLD_W+tx;
      const diff = _tH[idx] - _tH[idx+1];
      if(diff>0.03 && _tH[idx]>=T.SHORE){
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
    const idx=ty*WORLD_W+tx;
    const biome=BIOME_NAMES[_tBiomeId[idx]];
    const rgb=BIOME_RGB[biome]||[100,100,100];
    ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);
  }
}
