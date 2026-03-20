// ── World dimensions ──────────────────────────────────────────────────────────
const TILE    = 8;
const WORLD_W = 512;   // wider than tall → horizontal feel
const WORLD_H = 288;

// Height thresholds
const T = {
  DEEP_SEA:0.28, SEA:0.40, SHORE:0.44,
  LOWLAND:0.50, GRASSLAND:0.62, HIGHLAND:0.73,
  MOUNTAIN:0.83, PEAK:0.91,
};
const M = { DRY:0.32, NORMAL:0.58, WET:0.76 };

const BIOME_RGB = {
  deep_sea   :[15, 38, 72],
  sea        :[22, 65,115],
  shore      :[194,178,118],
  desert     :[214,185, 88],
  savanna    :[172,158, 72],
  swamp      :[ 62, 85, 50],
  dry_grass  :[128,152, 65],
  grass      :[ 74,138, 55],
  dense_grass:[ 50,115, 50],
  shrubland  :[ 98,118, 65],
  forest     :[ 36, 90, 36],
  rainforest :[ 22, 75, 30],
  highland   :[108, 98, 82],
  mountain   :[128,118,108],
  snow       :[218,228,234],
};

function getBiome(h, m) {
  if(h<T.DEEP_SEA)  return 'deep_sea';
  if(h<T.SEA)       return 'sea';
  if(h<T.SHORE)     return 'shore';
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
    if(m<M.WET)  return 'forest';
    return 'rainforest';
  }
  if(h<T.MOUNTAIN) return 'highland';
  if(h<T.PEAK)     return 'mountain';
  return 'snow';
}

let terrainData   = null;
let terrainCanvas = null;

function generateTerrain() {
  // Each noise layer gets a different seed offset for variety
  const n1 = makeNoise2D(WORLD_SEED);
  const n2 = makeNoise2D(WORLD_SEED + 1111);
  const n3 = makeNoise2D(WORLD_SEED + 2222);

  terrainData = new Array(WORLD_W * WORLD_H);

  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++){
      const nx = x/WORLD_W;
      const ny = y/WORLD_H;

      // Domain-warped height
      const wx = fbm(n1, nx+0.1, ny+0.1, 3, 2.0, 0.5) * 0.35;
      const wy = fbm(n2, nx+5.2, ny+1.3, 3, 2.0, 0.5) * 0.35;
      let h = fbm(n1, nx+wx, ny+wy, 7, 2.1, 0.48);
      h = (h+1)/2;

      // Horizontal-biased falloff: strong on left/right edges, gentle top/bottom
      const dx = (nx-0.5)*2.2;
      const dy = (ny-0.5)*1.4;
      h -= (dx*dx*0.5 + dy*dy*0.2);
      h = Math.max(0, Math.min(1, h));

      // Moisture
      let m = fbm(n3, nx*2.8+10, ny*2.8+10, 5, 2.0, 0.5);
      m = (m+1)/2;
      if(h<T.SEA)      m = Math.min(1, m+0.3);
      if(h>T.HIGHLAND) m = Math.max(0, m-0.2);

      const biome = getBiome(h, m);
      const [br,bg,bb] = BIOME_RGB[biome];
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

// Dirty region: redraw only changed tiles
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
  return terrainData[y*WORLD_W+x].h>=T.SHORE;
}
function getCell(x,y){
  if(x<0||y<0||x>=WORLD_W||y>=WORLD_H) return null;
  return terrainData[y*WORLD_W+x];
}
