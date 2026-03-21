// ── Renderer ──────────────────────────────────────────────────────────────────
const cam = {
  x:0, y:0, zoom:1,
  minZoom:0.5, maxZoom:6,
};

let _canvas=null, _ctx=null;

function rendererInit(canvas){
  _canvas=canvas;
  _ctx=canvas.getContext('2d');
  _ctx.imageSmoothingEnabled=false;
}
function rendererResize(){
  _canvas.width=window.innerWidth;
  _canvas.height=window.innerHeight;
  _ctx.imageSmoothingEnabled=false;
}
function clampCamera(){
  const ww=WORLD_W*TILE*cam.zoom, wh=WORLD_H*TILE*cam.zoom;
  cam.x=Math.min(0,Math.max(_canvas.width-ww,cam.x));
  cam.y=Math.min(0,Math.max(_canvas.height-wh,cam.y));
}
function centerCamera(){
  const ww=WORLD_W*TILE*cam.zoom, wh=WORLD_H*TILE*cam.zoom;
  cam.x=(_canvas.width-ww)/2; cam.y=(_canvas.height-wh)/2;
}
function zoomAt(mx,my,factor){
  const prev=cam.zoom;
  cam.zoom=Math.max(cam.minZoom,Math.min(cam.maxZoom,cam.zoom*factor));
  const s=cam.zoom/prev;
  cam.x=mx-(mx-cam.x)*s; cam.y=my-(my-cam.y)*s;
  clampCamera();
}
function centerOn(tx, ty) {
  const wx=tx*TILE+TILE/2, wy=ty*TILE+TILE/2;
  cam.x=_canvas.width/2-wx*cam.zoom;
  cam.y=_canvas.height/2-wy*cam.zoom;
  clampCamera();
}

let _waterPhase=0;

// ── Epic Battle Effects ───────────────────────────────────────────────────────
// Each entry: {wx,wy, timer, maxTimer, type, text, color}
const _battleFX = [];
const _floatingTexts = [];

function spawnBattleFX(wx, wy, type){
  // Hard cap — at high speed these pile up faster than they expire
  if(_battleFX.length >= 30) return;
  // Clash burst
  _battleFX.push({wx, wy, timer:0, maxTimer:0.8, type});
  // Floating text
  if(_floatingTexts.length >= 40) return;
  const texts = {
    clash:  ['⚔️','💥','🗡️'],
    death:  ['☠️','💀','🩸'],
    war:    ['⚔️ GUERRA','🔥 BATALLA','💣'],
    siege:  ['🏹','🔥','💣'],
  };
  const pool = texts[type] || texts.clash;
  _floatingTexts.push({
    wx, wy,
    text: pool[Math.floor(Math.random()*pool.length)],
    vy: -0.8 - Math.random()*0.5,
    vx: (Math.random()-0.5)*0.6,
    timer: 0,
    maxTimer: 1.2,
    color: type==='death'?'#f44':type==='war'?'#ff8800':'#fff',
    size: type==='war'?14:11,
  });
}

// Called from humans.js _doConflict
function registerCombat(tx, ty, killed){
  const wx = tx*TILE+TILE/2, wy = ty*TILE+TILE/2;
  spawnBattleFX(wx, wy, killed ? 'death' : 'clash');
}

function _drawBattleFX(dtSec){
  if(_battleFX.length===0 && _floatingTexts.length===0) return;
  const ctx = _ctx;

  // Clash bursts (world-space)
  for(let i=_battleFX.length-1; i>=0; i--){
    const fx = _battleFX[i];
    fx.timer += dtSec;
    const t = fx.timer / fx.maxTimer; // 0→1
    if(t >= 1){ _battleFX.splice(i,1); continue; }

    const r = (8 + t*20) * TILE * 0.12;
    const alpha = (1-t) * 0.85;
    ctx.save();
    ctx.globalAlpha = alpha;

    if(fx.type === 'death'){
      // Red expanding ring
      ctx.strokeStyle = '#ff2200';
      ctx.lineWidth = Math.max(1, 3*(1-t));
      ctx.beginPath();
      ctx.arc(fx.wx, fx.wy, r, 0, Math.PI*2);
      ctx.stroke();
      // Inner splatter dots
      for(let d=0; d<6; d++){
        const angle = (d/6)*Math.PI*2 + t*3;
        const dr = r*0.6;
        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.arc(fx.wx+Math.cos(angle)*dr, fx.wy+Math.sin(angle)*dr, 2*(1-t)*TILE*0.1, 0, Math.PI*2);
        ctx.fill();
      }
    } else {
      // Yellow/white clash burst
      ctx.strokeStyle = t < 0.3 ? '#ffff00' : '#ff8800';
      ctx.lineWidth = Math.max(1, 2.5*(1-t));
      // Starburst lines
      for(let d=0; d<8; d++){
        const angle = (d/8)*Math.PI*2;
        const len = r * (0.4 + 0.6*t);
        ctx.beginPath();
        ctx.moveTo(fx.wx, fx.wy);
        ctx.lineTo(fx.wx+Math.cos(angle)*len, fx.wy+Math.sin(angle)*len);
        ctx.stroke();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx.wx, fx.wy, r*0.3, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Floating texts (world-space)
  for(let i=_floatingTexts.length-1; i>=0; i--){
    const ft = _floatingTexts[i];
    ft.timer += dtSec;
    if(ft.timer >= ft.maxTimer){ _floatingTexts.splice(i,1); continue; }
    ft.wy += ft.vy * TILE * 0.08;
    ft.wx += ft.vx * TILE * 0.08;
    const alpha = ft.timer < ft.maxTimer*0.6 ? 1 : 1-(ft.timer-ft.maxTimer*0.6)/(ft.maxTimer*0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `bold ${Math.round(ft.size/cam.zoom*TILE*0.18)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ft.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2/cam.zoom;
    ctx.strokeText(ft.text, ft.wx, ft.wy);
    ctx.fillText(ft.text, ft.wx, ft.wy);
    ctx.restore();
  }
}

// ── Metropolis Effects ────────────────────────────────────────────────────────
// Vehicles moving along roads, factory smoke, city lights
const _vehicles = []; // {wx,wy, destWx,destWy, speed, icon, timer}
let _vehicleSpawnTimer = 0;

// ── Structure type cache — rebuilt once per second to avoid per-frame filter() ──
let _structsByType = new Map(); // type → structure[]
let _structCacheTimer = 0;
let _structCacheVersion = -1; // track structures.length changes

function _rebuildStructCache(){
  _structsByType.clear();
  if(typeof structures === 'undefined') return;
  for(const s of structures){
    let arr = _structsByType.get(s.type);
    if(!arr){ arr = []; _structsByType.set(s.type, arr); }
    arr.push(s);
  }
}

function _getStructsByTypes(types){
  // Returns flat array of structures matching any of the given types
  const out = [];
  for(const t of types){
    const arr = _structsByType.get(t);
    if(arr) for(const s of arr) out.push(s);
  }
  return out;
}

function _tickStructCache(dtSec){
  _structCacheTimer += dtSec;
  if(_structCacheTimer > 1.0 || (typeof structures !== 'undefined' && structures.length !== _structCacheVersion)){
    _structCacheTimer = 0;
    _structCacheVersion = typeof structures !== 'undefined' ? structures.length : 0;
    _rebuildStructCache();
  }
}

function _tickVehicles(dtSec){
  _vehicleSpawnTimer += dtSec;
  if(_vehicleSpawnTimer > 3 && typeof structures !== 'undefined'){
    _vehicleSpawnTimer = 0;
    const advTypes = ['road','highway','railway','airport','factory','powerplant','subway','neon_district','neural_hub','spaceport','excavator','mining_complex','drill_rig','bulldozer','crane'];
    const advStructs = _getStructsByTypes(advTypes);
    if(_vehicles.length < 25 && advStructs.length > 0){
      const s = advStructs[Math.floor(Math.random()*advStructs.length)];
      if(!s) return;
      const dest = advStructs[Math.floor(Math.random()*advStructs.length)];
      if(!dest || (dest.tx === s.tx && dest.ty === s.ty)) return;
      const icons =
        s.type==='railway'?['🚂','🚃']:
        s.type==='airport'||s.type==='spaceport'?['✈️','🛸']:
        s.type==='subway'?['🚇']:
        s.type==='neural_hub'||s.type==='neon_district'?['🏍️','🚁','🤖','🚗']:
        s.type==='highway'?['🚗','🚕','🚙','🚛','🏎️']:
        s.type==='excavator'||s.type==='bulldozer'?['🚜','🚧']:
        s.type==='mining_complex'||s.type==='drill_rig'||s.type==='crane'?['🚛','🏗️']:
        ['🚗','🚕','🚙'];
      const icon = icons[Math.floor(Math.random()*icons.length)];
      _vehicles.push({
        wx: s.tx*TILE+TILE/2, wy: s.ty*TILE+TILE/2,
        destWx: dest.tx*TILE+TILE/2, destWy: dest.ty*TILE+TILE/2,
        speed: (s.type==='airport'||s.type==='spaceport'?8:s.type==='railway'?5:s.type==='highway'?4:2)*TILE,
        icon, timer: 0, maxTimer: 8,
      });
    }
  }
  for(let i=_vehicles.length-1; i>=0; i--){
    const v = _vehicles[i];
    v.timer += dtSec;
    if(v.timer >= v.maxTimer){ _vehicles.splice(i,1); continue; }
    const dx = v.destWx-v.wx, dy = v.destWy-v.wy;
    const dist = Math.hypot(dx,dy);
    if(dist < 2){ _vehicles.splice(i,1); continue; }
    const step = Math.min(v.speed*dtSec, dist);
    v.wx += dx/dist*step; v.wy += dy/dist*step;
  }
}

function _drawMetropolisEffects(dtSec){
  if(typeof structures === 'undefined' || cam.zoom < 0.6) return;
  const ctx = _ctx;
  const t = _waterPhase;

  // Rebuild structure type cache once per second
  _tickStructCache(dtSec);

  // ── Road network lines connecting road/highway tiles ──────────────────────
  if(cam.zoom > 0.7){
    ctx.save();
    // Only draw lines between road tiles within viewport — skip O(n²) global scan
    const vx0=Math.floor(-cam.x/cam.zoom/TILE)-2, vy0=Math.floor(-cam.y/cam.zoom/TILE)-2;
    const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+4;
    const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+4;
    const visRoads = _getStructsByTypes(['road','highway','railway','subway']).filter(s =>
      s.tx>=vx0 && s.tx<=vx1 && s.ty>=vy0 && s.ty<=vy1
    );
    // Only connect if within 10 tiles — use grid proximity check
    const MAX_ROAD_LINES = 200; // cap draw calls
    let lineCount = 0;
    ctx.lineWidth = Math.max(0.5, 1.5/cam.zoom);
    for(let i=0; i<visRoads.length && lineCount<MAX_ROAD_LINES; i++){
      const a = visRoads[i];
      for(let j=i+1; j<visRoads.length && lineCount<MAX_ROAD_LINES; j++){
        const b = visRoads[j];
        const d = Math.hypot(a.tx-b.tx, a.ty-b.ty);
        if(d > 10) continue;
        const ax=a.tx*TILE+TILE/2, ay=a.ty*TILE+TILE/2;
        const bx=b.tx*TILE+TILE/2, by=b.ty*TILE+TILE/2;
        ctx.globalAlpha = a.type==='highway'||b.type==='highway' ? 0.45 : 0.22;
        ctx.strokeStyle = a.type==='railway'||b.type==='railway' ? '#888' :
                          a.type==='subway'||b.type==='subway' ? '#4466aa' :
                          a.type==='highway'||b.type==='highway' ? '#aaaacc' : '#888888';
        ctx.beginPath();
        ctx.moveTo(ax,ay);
        ctx.lineTo(bx,by);
        ctx.stroke();
        lineCount++;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Neon glow effects on cyberpunk structures ─────────────────────────────
  if(cam.zoom > 0.8){
    ctx.save();
    const neonTypes = {
      neon_district: '#ff44aa',
      neural_hub:    '#aa44ff',
      megacity_core: '#ff8800',
      skyscraper:    '#44aaff',
      arcology:      '#44ffaa',
      spaceport:     '#aaddff',
    };
    const neonStructs = _getStructsByTypes(['neon_district','neural_hub','megacity_core','skyscraper','arcology','spaceport']);
    for(const s of neonStructs){
      const neonColor = neonTypes[s.type];
      if(!neonColor) continue;
      const px = s.tx*TILE+TILE/2, py = s.ty*TILE+TILE/2;
      const pulse = 0.5 + Math.sin(t*3 + s.tx*0.5 + s.ty*0.3)*0.5;
      const glowR = (TILE*0.8 + pulse*TILE*0.4) * Math.max(1, STRUCTURE_HEIGHT[s.type]||1) * 0.3;
      ctx.globalAlpha = 0.12 + pulse*0.12;
      ctx.fillStyle = neonColor;
      ctx.beginPath();
      ctx.arc(px, py, glowR, 0, Math.PI*2);
      ctx.fill();
      // Pulsing outline
      ctx.globalAlpha = 0.4 + pulse*0.3;
      ctx.strokeStyle = neonColor;
      ctx.lineWidth = Math.max(1, 1.5/cam.zoom);
      ctx.strokeRect(s.tx*TILE+1, s.ty*TILE+1, TILE-2, TILE-2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Holographic billboard flicker on neon_district / neural_hub ──────────
  if(cam.zoom > 1.5){
    ctx.save();
    const billboardTexts = ['◈ DATA','◉ NET','▲ SYS','◆ AI','⬡ HUB','◈ LINK'];
    const billboardStructs = _getStructsByTypes(['neon_district','neural_hub','megacity_core']);
    for(const s of billboardStructs){
      const px = s.tx*TILE+TILE/2, py = s.ty*TILE;
      const flicker = Math.sin(t*8 + s.tx*1.3) > 0.3 ? 1 : 0.4;
      ctx.globalAlpha = flicker * 0.7;
      ctx.font = `bold ${Math.round(TILE*0.22)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const colors = {neon_district:'#ff44aa',neural_hub:'#aa44ff',megacity_core:'#ff8800'};
      ctx.fillStyle = colors[s.type]||'#ffffff';
      const txt = billboardTexts[Math.abs(s.tx+s.ty)%billboardTexts.length];
      ctx.fillText(txt, px, py);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Factory smoke particles (static, animated via phase)
  if(cam.zoom > 0.8){
    ctx.save();
    const smokeStructs = _getStructsByTypes(['factory','powerplant']);
    for(const s of smokeStructs){
      const px = s.tx*TILE+TILE/2, py = s.ty*TILE;
      for(let p=0; p<3; p++){
        const phase = t*1.5 + p*2.1 + s.tx*0.3;
        const rise = (phase % 2) / 2; // 0→1 loop
        const ox = Math.sin(phase*2)*4*TILE*0.08;
        const oy = -rise * 12 * TILE * 0.08;
        const r = (2+rise*4)*TILE*0.06;
        const alpha = (1-rise)*0.35;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.type==='powerplant'?'#88aaff':'#888888';
        ctx.beginPath();
        ctx.arc(px+ox, py+oy, r, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Glowing screens / billboards on advanced structures
  if(cam.zoom > 1.2){
    ctx.save();
    const screenStructs = _getStructsByTypes(['factory','powerplant','university','observatory','airport']);
    for(const s of screenStructs){
      const px = s.tx*TILE, py = s.ty*TILE;
      const pulse = 0.5 + Math.sin(t*3 + s.tx*0.7)*0.5;
      const colors = {factory:'#00ffcc',powerplant:'#ffff00',university:'#88aaff',observatory:'#ff88ff',airport:'#00aaff'};
      ctx.globalAlpha = 0.25 + pulse*0.2;
      ctx.fillStyle = colors[s.type]||'#ffffff';
      const sw = TILE*0.35, sh = TILE*0.2;
      ctx.fillRect(px+TILE*0.1, py+TILE*0.05, sw, sh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ── Heavy machinery: dust clouds + digging animation ─────────────────────
  if(cam.zoom > 0.6){
    ctx.save();
    const heavyStructs = _getStructsByTypes(['excavator','mining_complex','drill_rig','ore_processor','bulldozer','crane','tree_nursery','greenhouse']);
    for(const s of heavyStructs){
      const px = s.tx*TILE+TILE/2, py = s.ty*TILE+TILE/2;
      const phase = t*2.5 + s.tx*0.4 + s.ty*0.3;
      // Dust cloud particles
      const dustCount = s.type==='mining_complex'?4:s.type==='drill_rig'?3:2;
      for(let d=0; d<dustCount; d++){
        const dp = (phase + d*1.1) % 2.5;
        const rise = dp/2.5;
        const ox = Math.sin(phase+d*2)*3*TILE*0.1;
        const oy = -rise*8*TILE*0.1;
        const r2 = (1.5+rise*3)*TILE*0.07;
        const alpha = (1-rise)*0.4;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.type==='drill_rig'||s.type==='ore_processor'?'#cc8844':'#aaa';
        ctx.beginPath();
        ctx.arc(px+ox, py+oy, r2, 0, Math.PI*2);
        ctx.fill();
      }
      // Digging vibration: slight offset on icon (handled by icon draw, just add ground crack)
      if(s.type==='excavator'||s.type==='bulldozer'){
        const shake = Math.sin(phase*8)*1.5;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#8B5E3C';
        ctx.lineWidth = Math.max(1, 1.5/cam.zoom);
        ctx.beginPath();
        ctx.moveTo(s.tx*TILE+2, s.ty*TILE+TILE-2+shake);
        ctx.lineTo(s.tx*TILE+TILE-2, s.ty*TILE+TILE-2-shake);
        ctx.stroke();
      }
      // Drill rig: vertical beam
      if(s.type==='drill_rig'){
        const beamAlpha = 0.4+Math.sin(phase*6)*0.2;
        ctx.globalAlpha = beamAlpha;
        ctx.strokeStyle = '#ffaa44';
        ctx.lineWidth = Math.max(1, 2/cam.zoom);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py+TILE*0.6);
        ctx.stroke();
      }
      // Tree nursery: green sparkles
      if(s.type==='tree_nursery'||s.type==='greenhouse'){
        for(let sp=0; sp<3; sp++){
          const sp2 = (phase*1.5+sp*2.1)%3;
          const sx = px + Math.cos(phase+sp*2.1)*TILE*0.4;
          const sy = py - sp2*TILE*0.3;
          ctx.globalAlpha = (1-sp2/3)*0.6;
          ctx.fillStyle = s.type==='greenhouse'?'#88ff44':'#44ff88';
          ctx.beginPath();
          ctx.arc(sx, sy, TILE*0.06, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Vehicles
  _tickVehicles(dtSec);
  if(_vehicles.length > 0 && cam.zoom > 0.7){
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for(const v of _vehicles){
      ctx.font = `${Math.round(TILE*0.7)}px serif`;
      ctx.fillText(v.icon, v.wx, v.wy);
    }
    ctx.restore();
  }

  // City lights — small colored dots near dense structures at night (winter/dark season)
  if(cam.zoom > 1.0 && typeof _season !== 'undefined' && (_season === 3 || _season === 2)){
    ctx.save();
    ctx.globalAlpha = 0.5;
    const lightStructs = _getStructsByTypes(['palace','citadel','cathedral','factory','powerplant','university','airport','skyscraper','megacity_core','arcology','neon_district','neural_hub']);
    for(const s of lightStructs){
      const px = s.tx*TILE+TILE/2, py = s.ty*TILE+TILE/2;
      const pulse = 0.6 + Math.sin(t*4+s.tx)*0.4;
      ctx.globalAlpha = 0.3*pulse;
      // Cyberpunk structures get colored lights
      const neonTypes2 = {neon_district:'#ff44aa',neural_hub:'#aa44ff',megacity_core:'#ff8800',skyscraper:'#44aaff',arcology:'#44ffaa'};
      ctx.fillStyle = neonTypes2[s.type]||'#ffffaa';
      ctx.beginPath();
      ctx.arc(px, py, TILE*0.15, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function renderFrame(dt){
  const dtSec = dt/1000;
  _waterPhase+=dt*0.0008;
  _ctx.fillStyle='#0f2a4a';
  _ctx.fillRect(0,0,_canvas.width,_canvas.height);

  _ctx.save();
  _ctx.translate(cam.x,cam.y);
  _ctx.scale(cam.zoom,cam.zoom);

  if(terrainCanvas) _ctx.drawImage(terrainCanvas,0,0);
  if(cam.zoom>0.6) _drawWaterShimmer();

  if(resourceCanvas&&cam.zoom>0.4){
    _ctx.globalAlpha=Math.min(1,(cam.zoom-0.4)/0.3);
    _ctx.drawImage(resourceCanvas,0,0);
    _ctx.globalAlpha=1;
  }

  // City glow halos — visible at ALL zoom levels, drawn first for epic feel
  if(typeof structures!=='undefined') _drawCityGlows();

  // Territory outlines (drawn before structures)
  if(typeof civilizations!=='undefined') _drawTerritories();

  // Structures
  if(typeof structures!=='undefined') _drawStructures();

  // Natural monuments
  if(typeof naturalMonuments!=='undefined'&&naturalMonuments.length>0) _drawMonuments();
  if(typeof getTouristSites!=='undefined') _drawTouristSites();

  // Epic overlays: battlefields, wonders, dark age, pandemic
  _drawEpicOverlays();
  _drawBiomeEffects();

  // Humans
  if(typeof humans!=='undefined') _drawHumans();

  // Epic battle effects (world-space, drawn on top of humans)
  _drawBattleFX(dtSec);

  // Metropolis effects (smoke, vehicles, screens)
  _drawMetropolisEffects(dtSec);

  _ctx.restore();

  // Season tint overlay
  if(typeof _season!=='undefined'){
    const tints=[null,'rgba(255,220,100,0.04)','rgba(200,120,40,0.05)','rgba(80,140,255,0.08)'];
    const tint=tints[_season];
    if(tint){
      _ctx.fillStyle=tint;
      _ctx.fillRect(0,0,_canvas.width,_canvas.height);
    }
  }

  // UI overlays (screen-space)
  _drawLegend();
  _drawWorldEvents();
  _drawIntelligenceCurve();
  _drawPandemicHUD();
  _drawClimateHUD();
  _drawAIPlagueHUD();
  _drawGlobalizationHUD();
}

// ── Trade Routes ─────────────────────────────────────────────────────────────
function _drawTradeRoutes(){
  if(cam.zoom<0.5)return;
  const routes=getTradeRoutes();
  if(!routes||routes.length===0)return;
  _ctx.save();
  _ctx.lineCap='round';
  for(const r of routes){
    const civA=civilizations.get(r.civA), civB=civilizations.get(r.civB);
    if(!civA||!civB)continue;
    const ax=r.ax*TILE+TILE/2, ay=r.ay*TILE+TILE/2;
    const bx=r.bx*TILE+TILE/2, by=r.by*TILE+TILE/2;
    // Animated dashed line — phase shifts over time using _waterPhase
    const pulse=0.4+Math.sin(_waterPhase*2+(r.phase||0))*0.3;
    _ctx.globalAlpha=pulse*0.7;
    _ctx.strokeStyle=civA.color;
    _ctx.lineWidth=Math.max(1,1.5/cam.zoom);
    _ctx.setLineDash([6/cam.zoom,4/cam.zoom]);
    _ctx.lineDashOffset=-_waterPhase*40;
    _ctx.beginPath();
    _ctx.moveTo(ax,ay);
    _ctx.lineTo(bx,by);
    _ctx.stroke();
    // Midpoint icon
    if(cam.zoom>0.8){
      const mx=(ax+bx)/2, my=(ay+by)/2;
      _ctx.globalAlpha=pulse;
      _ctx.font=`${Math.round(TILE*0.9)}px serif`;
      _ctx.textAlign='center';_ctx.textBaseline='middle';
      _ctx.fillText('💰',mx,my);
    }
    _ctx.globalAlpha=1;
    _ctx.setLineDash([]);
  }
  _ctx.restore();
}

// ── Territory outlines — offscreen canvas cache ───────────────────────────────
let _territoryCanvas=null;
let _territoryCtx=null;
let _territoryDirty=true;
let _territoryFrame=0;

function markTerritoryDirty(){ _territoryDirty=true; }

function _civColorToRgba(color,alpha){
  if(color.startsWith('hsl(')){
    return color.replace('hsl(','hsla(').replace(')',`,${alpha})`);
  }
  return color;
}

function _rebuildTerritoryCanvas(){
  // Use half-resolution canvas to save RAM (WORLD_W*WORLD_H*4 bytes at full res is huge)
  const SCALE = 0.5;
  const W=Math.ceil(WORLD_W*TILE*SCALE), H=Math.ceil(WORLD_H*TILE*SCALE);
  if(!_territoryCanvas){
    _territoryCanvas=document.createElement('canvas');
    _territoryCanvas.width=W;_territoryCanvas.height=H;
    _territoryCtx=_territoryCanvas.getContext('2d');
  } else if(_territoryCanvas.width!==W){
    _territoryCanvas.width=W;_territoryCanvas.height=H;
  }
  const ctx=_territoryCtx;
  ctx.clearRect(0,0,W,H);
  const TS=TILE*SCALE;

  // Build flat grid once for border detection
  const grid=new Int16Array(WORLD_W*WORLD_H).fill(-1);
  for(const [,civ] of civilizations){
    if(civ.population===0)continue;
    for(const key of civ.territory){
      const comma=key.indexOf(',');
      const tx=+key.slice(0,comma), ty=+key.slice(comma+1);
      if(tx>=0&&tx<WORLD_W&&ty>=0&&ty<WORLD_H)
        grid[ty*WORLD_W+tx]=civ.id;
    }
  }

  const showBorders=cam.zoom>0.6;

  for(const [,civ] of civilizations){
    if(civ.population===0||civ.territory.size===0)continue;
    ctx.fillStyle=civ.color;
    ctx.globalAlpha=0.15;
    for(const key of civ.territory){
      const comma=key.indexOf(',');
      const tx=+key.slice(0,comma), ty=+key.slice(comma+1);
      if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H)continue;
      ctx.fillRect(tx*TS,ty*TS,TS,TS);
    }
    if(showBorders){
      ctx.globalAlpha=0.55;
      for(const key of civ.territory){
        const comma=key.indexOf(',');
        const tx=+key.slice(0,comma), ty=+key.slice(comma+1);
        if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H)continue;
        const isBorder=grid[(ty-1)*WORLD_W+tx]!==civ.id||grid[(ty+1)*WORLD_W+tx]!==civ.id||
                       grid[ty*WORLD_W+(tx-1)]!==civ.id||grid[ty*WORLD_W+(tx+1)]!==civ.id;
        if(isBorder)ctx.fillRect(tx*TS,ty*TS,TS,TS);
      }
    }
  }
  ctx.globalAlpha=1;
  _territoryDirty=false;
}

function _drawTerritories(){
  if(cam.zoom<0.4)return;
  _territoryFrame++;
  if(_territoryDirty||_territoryFrame>=180){
    _territoryFrame=0;
    _rebuildTerritoryCanvas();
  }
  if(!_territoryCanvas)return;
  const alpha=Math.min(0.9,(cam.zoom-0.3)*0.7);
  _ctx.globalAlpha=alpha;
  // Draw scaled up from half-res canvas
  _ctx.drawImage(_territoryCanvas,0,0,WORLD_W*TILE,WORLD_H*TILE);
  _ctx.globalAlpha=1;
}

// ── City glow halos ───────────────────────────────────────────────────────────
let _cityGlowCache=[];
let _cityGlowDirty=true;
let _cityGlowFrame=0;

function markCityGlowDirty(){ _cityGlowDirty=true; }

function _rebuildCityGlows(){
  _cityGlowDirty=false;
  _cityGlowCache=[];
  if(!structures||structures.length===0)return;
  const epicTypes=new Set(['citadel','palace','cathedral','colosseum','university','observatory','academy',
    'megacity_core','arcology','neural_hub','skyscraper','neon_district','spaceport',
    'stadium','pyramid','great_wall','lighthouse','amphitheater','ziggurat','obelisk']);
  const CELL=20;
  const cellMap=new Map();
  for(const s of structures){
    const ck=`${Math.floor(s.tx/CELL)},${Math.floor(s.ty/CELL)}`;
    if(!cellMap.has(ck))cellMap.set(ck,{count:0,sumX:0,sumY:0,hasEpic:false,civId:s.civId,maxTier:0});
    const c=cellMap.get(ck);
    c.count++;c.sumX+=s.tx;c.sumY+=s.ty;
    if(epicTypes.has(s.type)){c.hasEpic=true;}
    const tier=STRUCTURE_HEIGHT[s.type]||0;
    if(tier>c.maxTier)c.maxTier=tier;
  }
  for(const [,c] of cellMap){
    if(c.count<3)continue; // lower threshold — show even small settlements
    const civ=c.civId!=null&&typeof civilizations!=='undefined'?civilizations.get(c.civId):null;
    // Size scales with structure count and tier
    const baseR=Math.min(300,c.count*14+60+c.maxTier*20);
    _cityGlowCache.push({
      cx:(c.sumX/c.count)*TILE+TILE/2,
      cy:(c.sumY/c.count)*TILE+TILE/2,
      r:baseR,
      color:civ?civ.color:'#ffd700',
      epic:c.hasEpic,
      count:c.count,
      maxTier:c.maxTier,
      civName:civ?civ.name:null,
    });
  }
}

function _drawCityGlows(){
  _cityGlowFrame++;
  // Rebuild at most every 120 frames (~2s at 60fps), or when dirty
  if(_cityGlowDirty||_cityGlowFrame>=120){
    _cityGlowFrame=0;
    _rebuildCityGlows();
  }
  if(_cityGlowCache.length===0)return;
  const ctx=_ctx;
  const t=_waterPhase;

  for(const g of _cityGlowCache){
    const screenX=g.cx*cam.zoom+cam.x;
    const screenY=g.cy*cam.zoom+cam.y;
    const sr=g.r*cam.zoom;
    if(screenX<-sr-200||screenX>_canvas.width+sr+200||screenY<-sr-200||screenY>_canvas.height+sr+200)continue;

    const pulse=0.7+Math.sin(t*1.5+g.cx*0.003)*0.3;

    // ── Outer soft halo — visible even at full zoom-out ───────────────────
    const grad=ctx.createRadialGradient(g.cx,g.cy,0,g.cx,g.cy,g.r);
    const baseAlpha=g.epic?0.28:0.18;
    grad.addColorStop(0,  _alphaColor(g.color, baseAlpha*pulse*1.4));
    grad.addColorStop(0.4,_alphaColor(g.color, baseAlpha*pulse*0.8));
    grad.addColorStop(1,  _alphaColor(g.color, 0));
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.arc(g.cx,g.cy,g.r,0,Math.PI*2);
    ctx.fill();

    // ── Bright core dot — always visible from any zoom ────────────────────
    const coreR=Math.max(TILE*1.5, g.r*0.12);
    const coreGrad=ctx.createRadialGradient(g.cx,g.cy,0,g.cx,g.cy,coreR);
    const coreAlpha=g.epic?0.85:0.55;
    coreGrad.addColorStop(0,  _alphaColor('#ffffff', coreAlpha*pulse));
    coreGrad.addColorStop(0.3,_alphaColor(g.color,   coreAlpha*pulse*0.9));
    coreGrad.addColorStop(1,  _alphaColor(g.color,   0));
    ctx.fillStyle=coreGrad;
    ctx.beginPath();
    ctx.arc(g.cx,g.cy,coreR,0,Math.PI*2);
    ctx.fill();

    // ── City name tag — visible at low zoom (zoomed out) ─────────────────
    if(g.civName && cam.zoom < 1.2){
      const tagAlpha=Math.min(1,(1.2-cam.zoom)/0.7);
      ctx.save();
      ctx.globalAlpha=tagAlpha*0.9;
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      // Scale font so it's always readable regardless of zoom
      const fontSize=Math.round(Math.max(11, Math.min(18, 14/cam.zoom)));
      ctx.font=`bold ${fontSize}px sans-serif`;
      // Shadow for readability
      ctx.strokeStyle='rgba(0,0,0,0.85)';
      ctx.lineWidth=3/cam.zoom;
      ctx.strokeText(g.civName, g.cx, g.cy-coreR*1.6);
      ctx.fillStyle='#ffffff';
      ctx.fillText(g.civName, g.cx, g.cy-coreR*1.6);
      // Structure count badge
      if(cam.zoom<0.8){
        const badge=`${g.count} edif.`;
        ctx.font=`${Math.round(Math.max(9,11/cam.zoom))}px sans-serif`;
        ctx.strokeText(badge, g.cx, g.cy-coreR*1.6+fontSize*1.3/cam.zoom);
        ctx.fillStyle='#adf';
        ctx.fillText(badge, g.cx, g.cy-coreR*1.6+fontSize*1.3/cam.zoom);
      }
      ctx.restore();
    }

    // ── Pulsing ring for epic cities ──────────────────────────────────────
    if(g.epic){
      const ringR=g.r*0.35*(0.85+Math.sin(t*2+g.cx*0.005)*0.15);
      ctx.save();
      ctx.globalAlpha=0.35*pulse;
      ctx.strokeStyle=g.color;
      ctx.lineWidth=Math.max(1.5, 3/cam.zoom);
      ctx.beginPath();
      ctx.arc(g.cx,g.cy,ringR,0,Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Helper: convert any CSS color to rgba string with given alpha
function _alphaColor(color, alpha){
  if(color.startsWith('hsl(')){
    return color.replace('hsl(','hsla(').replace(')',`,${alpha})`);
  }
  if(color.startsWith('#')){
    const r=parseInt(color.slice(1,3),16),g2=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);
    return `rgba(${r},${g2},${b},${alpha})`;
  }
  return color;
}
const STRUCTURE_HEIGHT={
  camp:0,hut:1,farm:0,animal_pen:1,mine:1,market:2,temple:3,well:1,workshop:1,
  palisade:2,barracks:2,granary:2,watchtower:4,library:2,forge:2,
  harbor:2,aqueduct:3,academy:3,colosseum:4,
  citadel:5,cathedral:5,palace:6,university:4,observatory:4,
  shipyard:3,road:0,bridge:1,carriage:2,factory:4,railway:3,powerplant:5,airport:4,
  // Cyberpunk era
  highway:1,subway:0,skyscraper:8,megacity_core:7,arcology:9,
  neon_district:5,neural_hub:7,spaceport:6,
  // Heavy machinery & replanting
  excavator:2,mining_complex:3,drill_rig:4,ore_processor:3,bulldozer:1,crane:5,
  tree_nursery:0,greenhouse:1,
  // Mega structures
  stadium:6,pyramid:8,great_wall:5,lighthouse:9,amphitheater:5,ziggurat:7,obelisk:6,
};

function _drawStructures(){
  if(!structures||structures.length===0) return;
  const ctx=_ctx;
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-3, vy0=Math.floor(-cam.y/cam.zoom/TILE)-3;
  const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+6;
  const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+6;
  const showShadow=cam.zoom>0.8;
  const showHP=cam.zoom>0.8;
  const t=_waterPhase;
  const megaTypes=new Set(['stadium','pyramid','great_wall','lighthouse','amphitheater','ziggurat','obelisk']);
  const roadTypes=new Set(['road','highway','bridge','aqueduct','railway','subway']);

  // ── Pass 0: roads & infrastructure (drawn as real lines) ─────────────────
  if(cam.zoom > 0.4){
    ctx.save();
    for(const s of structures){
      if(!roadTypes.has(s.type)) continue;
      if(s.tx<vx0||s.tx>vx1||s.ty<vy0||s.ty>vy1) continue;
      _drawRoadStructure(s, t);
    }
    ctx.restore();
  }

  // ── Pass 1: regular buildings ─────────────────────────────────────────────
  // At low zoom, skip the mega pass (they're tiny anyway) to save iterations
  const maxPass = cam.zoom < 0.4 ? 0 : 1;
  for(let pass=0;pass<=maxPass;pass++){
    for(const s of structures){
      if(roadTypes.has(s.type)) continue;
      const isMega=megaTypes.has(s.type);
      if(pass===0&&isMega) continue;
      if(pass===1&&!isMega) continue;
      if(s.tx<vx0||s.tx>vx1||s.ty<vy0||s.ty>vy1) continue;
      const px=s.tx*TILE+TILE/2, py=s.ty*TILE+TILE/2;
      const civ=s.civId!=null&&typeof civilizations!=='undefined'?civilizations.get(s.civId):null;

      if(isMega){ _drawMegaStructure(s,px,py,civ,t,showShadow); continue; }

      const tier=s.type==='hut'||s.type==='camp'?(s.housingLevel||0):(STRUCTURE_HEIGHT[s.type]||0);
      const k = civ ? Math.min(99999, (civ.knowledge||0)) : 0;

      // Advanced civs get real geometry buildings
      if(k > 2000 && cam.zoom > 0.3){
        _drawAdvancedBuilding(ctx, s, px, py, civ, tier, t, showShadow, showHP);
      } else {
        // Legacy emoji rendering for primitive civs
        ctx.globalAlpha=0.3+tier*0.07;
        ctx.fillStyle=civ?civ.color:s.color;
        ctx.fillRect(s.tx*TILE,s.ty*TILE,TILE,TILE);
        ctx.globalAlpha=1;
        if(tier>=2&&showShadow){
          ctx.fillStyle=`rgba(0,0,0,${Math.min(0.45,tier*0.07)})`;
          ctx.fillRect(s.tx*TILE+2,s.ty*TILE+TILE-(tier*2),TILE-2,tier*2);
        }
        if(showHP&&s.hp<s.maxHp){
          ctx.fillStyle='#300';ctx.fillRect(s.tx*TILE,s.ty*TILE+TILE-2,TILE,2);
          ctx.fillStyle='#f44';ctx.fillRect(s.tx*TILE,s.ty*TILE+TILE-2,TILE*(s.hp/s.maxHp),2);
        }
        if(cam.zoom>1.2){
          const iconScale=tier>=4?1.05:tier>=2?0.92:0.82;
          ctx.font=`${Math.round(TILE*iconScale)}px serif`;
          ctx.fillText(s.icon,px,py);
        }
      }
    }
  }
  ctx.textBaseline='alphabetic';
}

// ── Road/highway/rail rendering ───────────────────────────────────────────────
function _drawRoadStructure(s, t){
  const ctx=_ctx;
  const px=s.tx*TILE+TILE/2, py=s.ty*TILE+TILE/2;
  const S=TILE;

  // Find connected road neighbors to draw continuous lines
  const neighbors=[];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dy] of dirs){
    const nx=s.tx+dx, ny=s.ty+dy;
    const ns=typeof getStructureAt!=='undefined'?getStructureAt(nx,ny):null;
    if(ns&&(ns.type===s.type||
      (s.type==='road'&&ns.type==='highway')||
      (s.type==='highway'&&ns.type==='road'))) neighbors.push({nx,ny,ns});
  }

  if(s.type==='highway'){
    // Wide multi-lane highway
    const w=Math.max(3, S*0.55);
    ctx.lineWidth=w;
    ctx.strokeStyle='#555566';
    ctx.lineCap='square';
    for(const {nx,ny} of neighbors){
      ctx.beginPath();
      ctx.moveTo(px,py);
      ctx.lineTo(nx*S+S/2, ny*S+S/2);
      ctx.stroke();
    }
    // Lane markings
    ctx.lineWidth=Math.max(0.5, S*0.05);
    ctx.strokeStyle='rgba(255,255,180,0.7)';
    ctx.setLineDash([S*0.3, S*0.2]);
    for(const {nx,ny} of neighbors){
      ctx.beginPath();
      ctx.moveTo(px,py);
      ctx.lineTo(nx*S+S/2, ny*S+S/2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Intersection node
    if(neighbors.length>=2){
      ctx.fillStyle='#666677';
      ctx.beginPath();ctx.arc(px,py,w*0.6,0,Math.PI*2);ctx.fill();
    }
    // Neon edge glow for advanced civs
    const civ=s.civId!=null&&typeof civilizations!=='undefined'?civilizations.get(s.civId):null;
    if(civ&&(civ.knowledge||0)>20000){
      ctx.globalAlpha=0.25+Math.sin(t*2+s.tx*0.1)*0.1;
      ctx.lineWidth=w*1.6;
      ctx.strokeStyle=civ.color;
      for(const {nx,ny} of neighbors){
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
      }
      ctx.globalAlpha=1;
    }

  } else if(s.type==='road'){
    // Standard road — cobblestone/asphalt look
    const w=Math.max(2, S*0.32);
    ctx.lineWidth=w;
    ctx.strokeStyle='#7a7060';
    ctx.lineCap='square';
    for(const {nx,ny} of neighbors){
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
    }
    // Center line
    ctx.lineWidth=Math.max(0.5,S*0.04);
    ctx.strokeStyle='rgba(255,255,200,0.4)';
    for(const {nx,ny} of neighbors){
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
    }

  } else if(s.type==='railway'){
    // Rail tracks — two parallel lines with sleepers
    const w=Math.max(1.5, S*0.22);
    const off=w*0.35;
    for(const {nx,ny} of neighbors){
      const ex=nx*S+S/2, ey=ny*S+S/2;
      const ang=Math.atan2(ey-py,ex-px);
      const perpX=Math.sin(ang)*off, perpY=-Math.cos(ang)*off;
      // Rails
      ctx.lineWidth=Math.max(1,S*0.07);
      ctx.strokeStyle='#888';
      ctx.beginPath();ctx.moveTo(px+perpX,py+perpY);ctx.lineTo(ex+perpX,ey+perpY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px-perpX,py-perpY);ctx.lineTo(ex-perpX,ey-perpY);ctx.stroke();
      // Sleepers
      ctx.strokeStyle='#6a4820';
      ctx.lineWidth=Math.max(0.5,S*0.05);
      const dist=Math.hypot(ex-px,ey-py);
      const steps=Math.floor(dist/(S*0.4));
      for(let i=1;i<steps;i++){
        const f=i/steps;
        const sx=px+(ex-px)*f, sy=py+(ey-py)*f;
        ctx.beginPath();
        ctx.moveTo(sx+perpX*1.5,sy+perpY*1.5);
        ctx.lineTo(sx-perpX*1.5,sy-perpY*1.5);
        ctx.stroke();
      }
    }

  } else if(s.type==='bridge'){
    // Bridge — thick line with side rails
    const w=Math.max(2,S*0.38);
    ctx.lineWidth=w;
    ctx.strokeStyle='#a09060';
    for(const {nx,ny} of neighbors){
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
    }
    ctx.lineWidth=Math.max(0.5,S*0.06);
    ctx.strokeStyle='#c0a070';
    for(const {nx,ny} of neighbors){
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
    }

  } else if(s.type==='aqueduct'){
    // Aqueduct — blue channel
    const w=Math.max(2,S*0.3);
    ctx.lineWidth=w;
    ctx.strokeStyle='#3060a0';
    for(const {nx,ny} of neighbors){
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
    }
    ctx.lineWidth=Math.max(0.5,S*0.1);
    ctx.strokeStyle=`rgba(80,160,255,${0.5+Math.sin(t*3+s.tx*0.2)*0.2})`;
    for(const {nx,ny} of neighbors){
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx*S+S/2,ny*S+S/2);ctx.stroke();
    }
  }
}

// ── Advanced building geometry for evolved civs ───────────────────────────────
function _drawAdvancedBuilding(ctx, s, px, py, civ, tier, t, showShadow, showHP){
  const S=TILE;
  const civColor=civ?civ.color:'#aaaaff';
  const k=civ?(civ.knowledge||0):0;
  const pulse=0.7+Math.sin(t*1.8+s.tx*0.09+s.ty*0.07)*0.3;

  ctx.save();

  // Building footprint size scales with tier
  const hw=S*(0.28+Math.min(tier,8)*0.06);

  // Shadow
  if(showShadow&&tier>=1){
    ctx.globalAlpha=0.3;
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(px-hw+tier*1.5, py-hw+tier*1.5, hw*2, hw*2);
  }

  // Base color by type
  let baseColor='#445566', roofColor='#334455', accentColor=civColor;
  switch(s.type){
    case 'palace':   baseColor='#8a6020'; roofColor='#ffd700'; accentColor='#ffd700'; break;
    case 'cathedral':baseColor='#c0c0d0'; roofColor='#8080c0'; accentColor='#e0d0ff'; break;
    case 'citadel':  baseColor='#606060'; roofColor='#404040'; accentColor='#888'; break;
    case 'university':baseColor='#c08040';roofColor='#804020'; accentColor='#ffa040'; break;
    case 'observatory':baseColor='#304060';roofColor='#203050';accentColor='#80c0ff'; break;
    case 'factory':  baseColor='#505050'; roofColor='#303030'; accentColor='#ff8800'; break;
    case 'skyscraper':baseColor='#334455';roofColor='#223344';accentColor=civColor; break;
    case 'megacity_core':baseColor='#223344';roofColor='#112233';accentColor='#00ffff'; break;
    case 'arcology': baseColor='#2a4a2a'; roofColor='#1a3a1a'; accentColor='#44ff88'; break;
    case 'neural_hub':baseColor='#2a1a4a';roofColor='#1a0a3a';accentColor='#aa44ff'; break;
    case 'market':   baseColor='#806020'; roofColor='#604010'; accentColor='#ffcc00'; break;
    case 'barracks': baseColor='#602020'; roofColor='#401010'; accentColor='#ff4444'; break;
    case 'temple':   baseColor='#604080'; roofColor='#402060'; accentColor='#cc88ff'; break;
    case 'granary':  baseColor='#806040'; roofColor='#604020'; accentColor='#ffcc80'; break;
    case 'harbor':   baseColor='#204060'; roofColor='#102040'; accentColor='#4488ff'; break;
    case 'powerplant':baseColor='#404020';roofColor='#303010';accentColor='#ffff00'; break;
    case 'airport':  baseColor='#404050'; roofColor='#303040'; accentColor='#88aaff'; break;
    default: baseColor='#445566'; roofColor='#334455'; accentColor=civColor;
  }

  // Main building body
  ctx.globalAlpha=0.92;
  ctx.fillStyle=baseColor;
  ctx.fillRect(px-hw, py-hw, hw*2, hw*2);

  // Roof / top detail
  const roofInset=hw*0.15;
  ctx.fillStyle=roofColor;
  ctx.fillRect(px-hw+roofInset, py-hw+roofInset, (hw-roofInset)*2, (hw-roofInset)*2);

  // Windows grid for tall buildings
  if(tier>=3&&cam.zoom>0.6){
    const cols=Math.max(2,Math.floor(hw*2/(S*0.22)));
    const rows=Math.max(2,Math.floor(hw*2/(S*0.22)));
    const ww=(hw*2/cols)*0.45, wh=(hw*2/rows)*0.45;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const wx=px-hw+(c+0.5)*(hw*2/cols);
        const wy=py-hw+(r+0.5)*(hw*2/rows);
        const lit=Math.sin(s.tx*7.3+s.ty*3.1+r*2.7+c*1.9+t*0.5)>0.1;
        ctx.globalAlpha=lit?0.85:0.2;
        ctx.fillStyle=lit?accentColor:'#111';
        ctx.fillRect(wx-ww/2, wy-wh/2, ww, wh);
      }
    }
  }

  // Accent border / outline
  ctx.globalAlpha=0.7;
  ctx.strokeStyle=accentColor;
  ctx.lineWidth=Math.max(0.5, S*0.05);
  ctx.strokeRect(px-hw, py-hw, hw*2, hw*2);

  // Special effects for ultra-advanced structures
  if(k>50000){
    // Neon glow
    ctx.globalAlpha=0.2*pulse;
    const grd=ctx.createRadialGradient(px,py,0,px,py,hw*2.5);
    grd.addColorStop(0,accentColor);
    grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd;
    ctx.beginPath();ctx.arc(px,py,hw*2.5,0,Math.PI*2);ctx.fill();
  }

  // Spire/antenna for tall buildings
  if(tier>=5&&cam.zoom>0.4){
    ctx.globalAlpha=0.9;
    ctx.strokeStyle=accentColor;
    ctx.lineWidth=Math.max(0.5,S*0.04);
    ctx.beginPath();
    ctx.moveTo(px,py-hw);
    ctx.lineTo(px,py-hw-S*(0.3+tier*0.08));
    ctx.stroke();
    // Blinking light at top
    ctx.globalAlpha=(Math.sin(t*3+s.tx)>0)?0.9:0.2;
    ctx.fillStyle='#ff4444';
    ctx.beginPath();ctx.arc(px,py-hw-S*(0.3+tier*0.08),Math.max(1,S*0.07),0,Math.PI*2);ctx.fill();
  }

  // HP bar
  if(showHP&&s.hp<s.maxHp){
    ctx.globalAlpha=1;
    ctx.fillStyle='#300';ctx.fillRect(s.tx*TILE,s.ty*TILE+TILE-2,TILE,2);
    ctx.fillStyle='#f44';ctx.fillRect(s.tx*TILE,s.ty*TILE+TILE-2,TILE*(s.hp/s.maxHp),2);
  }

  ctx.globalAlpha=1;
  ctx.restore();

  // Label — only at close zoom, never when zoomed out
  if(cam.zoom>1.5&&cam.zoom<3.5&&s.label){
    const lbl=s.label;
    ctx.save();
    ctx.globalAlpha=0.8;
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    const fs=Math.round(Math.max(7,Math.min(11,9/cam.zoom)));
    ctx.font=`${fs}px sans-serif`;
    ctx.strokeStyle='rgba(0,0,0,0.9)';
    ctx.lineWidth=2/cam.zoom;
    ctx.strokeText(lbl,px,py-hw-2);
    ctx.fillStyle=accentColor;
    ctx.fillText(lbl,px,py-hw-2);
    ctx.restore();
  }
}

// ── Epic canvas rendering for mega structures ─────────────────────────────────
// These are drawn with real geometry so they're visible and impressive from zoom-out
function _drawMegaStructure(s, px, py, civ, t, showShadow){
  const ctx=_ctx;
  const S=TILE; // tile size shorthand
  const pulse=0.7+Math.sin(t*1.5+s.tx*0.07)*0.3;
  const civColor=civ?civ.color:'#ffd700';

  ctx.save();

  switch(s.type){

    case 'stadium':{
      // Oval stadium — visible from far away
      const rx=S*1.8, ry=S*1.2;
      // Outer wall
      ctx.globalAlpha=0.9;
      ctx.strokeStyle='#c8a020';
      ctx.lineWidth=Math.max(2,S*0.18);
      ctx.beginPath();
      ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2);
      ctx.stroke();
      // Inner field (green)
      ctx.globalAlpha=0.85;
      ctx.fillStyle='#2d8a2d';
      ctx.beginPath();
      ctx.ellipse(px,py,rx*0.65,ry*0.65,0,0,Math.PI*2);
      ctx.fill();
      // Field lines
      ctx.globalAlpha=0.5;
      ctx.strokeStyle='#ffffff';
      ctx.lineWidth=Math.max(0.5,S*0.04);
      ctx.beginPath();ctx.ellipse(px,py,rx*0.45,ry*0.45,0,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px-rx*0.6,py);ctx.lineTo(px+rx*0.6,py);ctx.stroke();
      // Stands tint (civ color)
      ctx.globalAlpha=0.25*pulse;
      ctx.fillStyle=civColor;
      ctx.beginPath();
      ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2);
      ctx.fill();
      // Glow ring
      ctx.globalAlpha=0.3*pulse;
      ctx.strokeStyle='#ffe040';
      ctx.lineWidth=Math.max(1,S*0.08);
      ctx.beginPath();
      ctx.ellipse(px,py,rx*1.15,ry*1.15,0,0,Math.PI*2);
      ctx.stroke();
      break;
    }

    case 'pyramid':{
      // Top-down view: concentric squares getting smaller toward center
      const layers=5;
      for(let i=layers;i>=0;i--){
        const f=(i/layers);
        const hw=S*(0.3+f*1.1);
        const shade=Math.floor(80+f*120);
        ctx.globalAlpha=0.9;
        ctx.fillStyle=`rgb(${shade+40},${shade+20},${Math.floor(shade*0.5)})`;
        ctx.fillRect(px-hw,py-hw,hw*2,hw*2);
        // Edge lines
        ctx.globalAlpha=0.4;
        ctx.strokeStyle='rgba(0,0,0,0.5)';
        ctx.lineWidth=Math.max(0.5,S*0.03);
        ctx.strokeRect(px-hw,py-hw,hw*2,hw*2);
      }
      // Capstone glow
      ctx.globalAlpha=0.8*pulse;
      const capGrad=ctx.createRadialGradient(px,py,0,px,py,S*0.35);
      capGrad.addColorStop(0,'rgba(255,220,80,0.9)');
      capGrad.addColorStop(1,'rgba(255,180,0,0)');
      ctx.fillStyle=capGrad;
      ctx.beginPath();ctx.arc(px,py,S*0.35,0,Math.PI*2);ctx.fill();
      // Outer glow
      ctx.globalAlpha=0.2*pulse;
      ctx.fillStyle='#ffd700';
      ctx.beginPath();ctx.arc(px,py,S*2,0,Math.PI*2);ctx.fill();
      break;
    }

    case 'ziggurat':{
      // Top-down: stepped square tiers, offset shadow
      const layers=4;
      for(let i=layers;i>=0;i--){
        const f=i/layers;
        const hw=S*(0.25+f*1.0);
        const r=Math.floor(160+f*60), g2=Math.floor(100+f*40), b=Math.floor(20+f*20);
        ctx.globalAlpha=0.92;
        ctx.fillStyle=`rgb(${r},${g2},${b})`;
        // Slight offset per layer for 3D feel
        ctx.fillRect(px-hw+(layers-i)*1.5,py-hw+(layers-i)*1.5,hw*2,hw*2);
        ctx.globalAlpha=0.3;
        ctx.strokeStyle='rgba(0,0,0,0.6)';
        ctx.lineWidth=Math.max(0.5,S*0.04);
        ctx.strokeRect(px-hw+(layers-i)*1.5,py-hw+(layers-i)*1.5,hw*2,hw*2);
      }
      // Top altar glow
      ctx.globalAlpha=0.7*pulse;
      ctx.fillStyle='#ff8800';
      ctx.beginPath();ctx.arc(px+layers*1.5,py+layers*1.5,S*0.2,0,Math.PI*2);ctx.fill();
      // Aura
      ctx.globalAlpha=0.15*pulse;
      ctx.fillStyle='#ff6600';
      ctx.beginPath();ctx.arc(px,py,S*2.2,0,Math.PI*2);ctx.fill();
      break;
    }

    case 'great_wall':{
      // Long wall segment — draw as thick line with towers at ends
      const wallLen=S*2.5;
      const wallW=Math.max(3,S*0.28);
      ctx.globalAlpha=0.95;
      ctx.strokeStyle='#8a6840';
      ctx.lineWidth=wallW;
      ctx.lineCap='square';
      // Horizontal wall
      ctx.beginPath();ctx.moveTo(px-wallLen,py);ctx.lineTo(px+wallLen,py);ctx.stroke();
      // Battlements (top)
      ctx.strokeStyle='#6a4820';
      ctx.lineWidth=Math.max(1,S*0.1);
      for(let i=-4;i<=4;i++){
        const bx=px+i*(wallLen/4.5);
        ctx.beginPath();ctx.moveTo(bx,py-wallW*0.5);ctx.lineTo(bx,py-wallW*1.2);ctx.stroke();
      }
      // Towers at ends
      const towerR=S*0.4;
      for(const tx2 of [px-wallLen,px+wallLen]){
        ctx.globalAlpha=0.95;
        ctx.fillStyle='#7a5830';
        ctx.fillRect(tx2-towerR,py-towerR,towerR*2,towerR*2);
        ctx.globalAlpha=0.5;
        ctx.strokeStyle='#4a3010';
        ctx.lineWidth=Math.max(1,S*0.06);
        ctx.strokeRect(tx2-towerR,py-towerR,towerR*2,towerR*2);
      }
      // Civ color tint
      ctx.globalAlpha=0.15*pulse;
      ctx.fillStyle=civColor;
      ctx.fillRect(px-wallLen-towerR,py-wallW,wallLen*2+towerR*2,wallW*2);
      break;
    }

    case 'lighthouse':{
      // Tall tower with rotating light beam
      const baseR=S*0.55;
      const topR=S*0.22;
      // Base
      ctx.globalAlpha=0.95;
      ctx.fillStyle='#e8e0c0';
      ctx.beginPath();ctx.arc(px,py,baseR,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#a09060';
      ctx.lineWidth=Math.max(1,S*0.08);
      ctx.stroke();
      // Tower body (vertical stripe)
      ctx.fillStyle='#d0c8a0';
      ctx.fillRect(px-topR,py-baseR*1.5,topR*2,baseR*1.5);
      // Red/white stripes
      ctx.globalAlpha=0.6;
      ctx.fillStyle='#cc2200';
      for(let i=0;i<3;i++){
        ctx.fillRect(px-topR,py-baseR*1.5+i*(baseR*0.5),topR*2,baseR*0.25);
      }
      // Light beacon
      ctx.globalAlpha=0.9*pulse;
      const beaconGrad=ctx.createRadialGradient(px,py-baseR*1.5,0,px,py-baseR*1.5,S*1.8);
      beaconGrad.addColorStop(0,'rgba(255,255,180,0.95)');
      beaconGrad.addColorStop(1,'rgba(255,255,100,0)');
      ctx.fillStyle=beaconGrad;
      ctx.beginPath();ctx.arc(px,py-baseR*1.5,S*1.8,0,Math.PI*2);ctx.fill();
      // Rotating beam
      const beamAngle=t*2;
      ctx.globalAlpha=0.35*pulse;
      ctx.fillStyle='rgba(255,255,150,0.6)';
      ctx.beginPath();
      ctx.moveTo(px,py-baseR*1.5);
      ctx.arc(px,py-baseR*1.5,S*4,beamAngle,beamAngle+0.35);
      ctx.closePath();ctx.fill();
      break;
    }

    case 'amphitheater':{
      // Semicircular theater — top-down view
      const outerR=S*1.7, innerR=S*0.5;
      // Outer seating (stone)
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#c8b890';
      ctx.beginPath();
      ctx.arc(px,py,outerR,Math.PI,Math.PI*2);
      ctx.lineTo(px+outerR,py);ctx.lineTo(px-outerR,py);
      ctx.closePath();ctx.fill();
      // Seating rows
      ctx.globalAlpha=0.4;
      ctx.strokeStyle='#a09060';
      ctx.lineWidth=Math.max(0.5,S*0.05);
      for(let r2=innerR+S*0.3;r2<outerR;r2+=S*0.35){
        ctx.beginPath();ctx.arc(px,py,r2,Math.PI,Math.PI*2);ctx.stroke();
      }
      // Stage (flat area)
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#e8d8a0';
      ctx.beginPath();ctx.arc(px,py,innerR,0,Math.PI*2);ctx.fill();
      // Stage curtain color
      ctx.globalAlpha=0.6;
      ctx.fillStyle='#8844aa';
      ctx.beginPath();ctx.arc(px,py,innerR*0.6,0,Math.PI*2);ctx.fill();
      // Civ glow
      ctx.globalAlpha=0.2*pulse;
      ctx.fillStyle=civColor;
      ctx.beginPath();ctx.arc(px,py,outerR*1.1,0,Math.PI*2);ctx.fill();
      break;
    }

    case 'obelisk':{
      // Tall thin needle — top-down: small square with cross shadow
      const hw=S*0.18;
      // Shadow cross
      ctx.globalAlpha=0.25;
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.fillRect(px-hw*0.5,py-S*1.5,hw,S*3);
      ctx.fillRect(px-S*1.5,py-hw*0.5,S*3,hw);
      // Stone body
      ctx.globalAlpha=0.95;
      ctx.fillStyle='#e8d060';
      ctx.fillRect(px-hw,py-hw,hw*2,hw*2);
      ctx.strokeStyle='#c0a020';
      ctx.lineWidth=Math.max(1,S*0.06);
      ctx.strokeRect(px-hw,py-hw,hw*2,hw*2);
      // Gold tip glow
      ctx.globalAlpha=0.8*pulse;
      const tipGrad=ctx.createRadialGradient(px,py,0,px,py,S*0.5);
      tipGrad.addColorStop(0,'rgba(255,230,80,0.9)');
      tipGrad.addColorStop(1,'rgba(255,200,0,0)');
      ctx.fillStyle=tipGrad;
      ctx.beginPath();ctx.arc(px,py,S*0.5,0,Math.PI*2);ctx.fill();
      break;
    }
  }

  ctx.globalAlpha=1;
  ctx.restore();

  // Name label — only at close zoom to avoid text avalanche
  if(cam.zoom>0.9&&cam.zoom<3){
    const lbl = s.label || '';
    if(!lbl) return;
    const labelAlpha=Math.min(1,Math.max(0,(2.5-cam.zoom)/1.6+0.2));
    ctx.save();
    ctx.globalAlpha=labelAlpha*0.95;
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    const fontSize=Math.round(Math.max(9,Math.min(14,11/cam.zoom)));
    ctx.font=`bold ${fontSize}px sans-serif`;
    ctx.strokeStyle='rgba(0,0,0,0.9)';
    ctx.lineWidth=3/cam.zoom;
    ctx.strokeText(lbl,px,py-TILE*1.4);
    ctx.fillStyle='#ffe080';
    ctx.fillText(lbl,px,py-TILE*1.4);
    ctx.restore();
  }
}

// ── Tourist Sites ─────────────────────────────────────────────────────────────
function _drawTouristSites(){
  const sites = getTouristSites();
  if(!sites||sites.length===0) return;
  if(cam.zoom < 0.6) return; // solo visible con zoom medio/alto
  _ctx.textAlign='center';_ctx.textBaseline='middle';
  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-2, vy0=Math.floor(-cam.y/cam.zoom/TILE)-2;
  const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+4;
  const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+4;
  for(const s of sites){
    if(s.tx<vx0||s.tx>vx1||s.ty<vy0||s.ty>vy1) continue;
    const px=s.tx*TILE+TILE/2, py=s.ty*TILE+TILE/2;
    // Aura dorada pulsante
    _ctx.globalAlpha=0.15+Math.sin(_waterPhase*2+s.tx)*0.08;
    _ctx.fillStyle='#ffd700';
    _ctx.beginPath();
    _ctx.arc(px,py,TILE*2.5,0,Math.PI*2);
    _ctx.fill();
    _ctx.globalAlpha=1;
    // Icono
    _ctx.font=`${Math.round(TILE*1.1)}px serif`;
    _ctx.fillText('🗺️',px,py-TILE*0.5);
    // Nombre a zoom alto
    if(cam.zoom>1.2){
      _ctx.font=`bold ${Math.round(TILE*0.55)}px sans-serif`;
      _ctx.strokeStyle='rgba(0,0,0,0.8)';_ctx.lineWidth=2;
      _ctx.strokeText(s.name,px,py+TILE*0.8);
      _ctx.fillStyle='#ffd700';
      _ctx.fillText(s.name,px,py+TILE*0.8);
    }
  }
  _ctx.textBaseline='alphabetic';
}

// ── Natural Monuments ────────────────────────────────────────────────────────
function _drawMonuments(){
  if(!naturalMonuments||naturalMonuments.length===0)return;
  _ctx.textAlign='center';_ctx.textBaseline='middle';
  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-2, vy0=Math.floor(-cam.y/cam.zoom/TILE)-2;
  const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+4;
  const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+4;
  for(const m of naturalMonuments){
    if(m.tx<vx0||m.tx>vx1||m.ty<vy0||m.ty>vy1)continue;
    const px=m.tx*TILE+TILE/2, py=m.ty*TILE+TILE/2;
    // Glow aura — use _waterPhase (already updated each frame) instead of Date.now()
    if(cam.zoom>0.5){
      _ctx.globalAlpha=0.18+Math.sin(_waterPhase*3+m.tx)*0.06;
      _ctx.fillStyle=m.color;
      _ctx.beginPath();
      _ctx.arc(px,py,m.radius*TILE*0.4,0,Math.PI*2);
      _ctx.fill();
      _ctx.globalAlpha=1;
    }
    // Icon
    _ctx.font=`${Math.round(TILE*1.3)}px serif`;
    _ctx.fillText(m.icon,px,py);
    // Label at higher zoom — removed to reduce clutter
    // if(cam.zoom>1.5){ ... }
  }
  _ctx.textBaseline='alphabetic';
}

// ── Humans ────────────────────────────────────────────────────────────────────
function _drawHumans(){
  const r=Math.max(3,TILE*0.75);
  _ctx.textAlign='center';

  const vx0=(-cam.x/cam.zoom)-r*3, vy0=(-cam.y/cam.zoom)-r*3;
  const vx1=vx0+_canvas.width/cam.zoom+r*6, vy1=vy0+_canvas.height/cam.zoom+r*6;
  const showBars=cam.zoom>0.9;
  const showName=false; // names removed — too cluttered at zoom
  const showWeapon=cam.zoom>1.5;
  const showRings=cam.zoom>0.7;

  // Use _cachedAlive (already filtered to alive) to avoid iterating dead humans
  const drawList = (typeof _cachedAlive !== 'undefined' && _cachedAlive.length > 0) ? _cachedAlive : humans;

  for(const h of drawList){
    if(!h.alive)continue;
    const px=h.px, py=h.py;
    if(px<vx0||px>vx1||py<vy0||py>vy1)continue;

    // Civ ring — only at reasonable zoom
    if(showRings&&h.civId!=null){
      const civ=typeof civilizations!=='undefined'?civilizations.get(h.civId):null;
      if(civ){
        _ctx.beginPath();
        _ctx.arc(px,py,r+2,0,Math.PI*2);
        _ctx.strokeStyle=civ.color;
        _ctx.lineWidth=1.5;
        _ctx.stroke();
      }
    }

    // Prodigy aura — pulsing glow
    if(h.isProdigy){
      const pulse=0.55+Math.sin(_waterPhase*4+h.id)*0.45;
      _ctx.beginPath();
      _ctx.arc(px,py,r+7+pulse*4,0,Math.PI*2);
      _ctx.strokeStyle=h.color;
      _ctx.lineWidth=2.5;
      _ctx.globalAlpha=0.7*pulse;
      _ctx.stroke();
      _ctx.globalAlpha=1;
      _ctx.beginPath();
      _ctx.arc(px,py,r+3,0,Math.PI*2);
      _ctx.fillStyle=h.color;
      _ctx.globalAlpha=0.18;
      _ctx.fill();
      _ctx.globalAlpha=1;
    }

    // Selected glow
    if(h.selected){
      _ctx.beginPath();
      _ctx.arc(px,py,r+5,0,Math.PI*2);
      _ctx.fillStyle='rgba(255,255,255,0.22)';
      _ctx.fill();
    }

    // Body
    _ctx.beginPath();
    _ctx.arc(px,py,r,0,Math.PI*2);
    _ctx.fillStyle=h.color;
    _ctx.fill();

    // Gender dot
    _ctx.beginPath();
    _ctx.arc(px,py,r*0.38,0,Math.PI*2);
    _ctx.fillStyle=h.gender==='F'?'#ffaacc':'#aaccff';
    _ctx.fill();

    // War flash
    if(h._warFlash>0){
      h._warFlash--;
      _ctx.beginPath();
      _ctx.arc(px,py,r+4,0,Math.PI*2);
      _ctx.strokeStyle='rgba(255,50,50,0.85)';
      _ctx.lineWidth=2.5;
      _ctx.stroke();
    }

    // Health bar only
    if(showBars){
      const bw=TILE*1.4, bx=px-bw/2, by=py-r-5;
      _ctx.fillStyle='#111';
      _ctx.fillRect(bx,by,bw,3);
      _ctx.fillStyle=h.health>60?'#4f4':h.health>30?'#fa0':'#f44';
      _ctx.fillRect(bx,by,bw*(h.health/100),3);
    }

    // Icons — only at higher zoom to save draw calls
    if(showRings){
      if(h.isProdigy&&h.prodigyType){
        _ctx.font=`${Math.round(r*1.3)}px serif`;
        _ctx.fillText(h.prodigyType.icon,px,py-r-4);
      } else if(h.isLeader){
        _ctx.font=`${Math.round(r*1.1)}px serif`;
        _ctx.fillText('👑',px,py-r-3);
      } else if(h.sick){
        _ctx.font=`${Math.round(r)}px serif`;
        _ctx.fillText('🦠',px+r,py-r);
      }
    }

    if(showWeapon&&h.weaponTier>0){
      const wi=['','🗡️','🪓','⚔️','🔱','🛡️','💣'];
      _ctx.font=`${Math.round(r*0.85)}px serif`;
      _ctx.fillText(wi[Math.min(h.weaponTier,6)]||'⚔️',px-r-1,py-r);
    }

    // Transport icon — show when on water or high tier
    if(showWeapon&&h.transportTier>=1){
      const ti=['','⛵','🐎','🚂','🚗','✈️','🚁','🚀','🛸','🌌'];
      const icon=ti[Math.min(h.transportTier,9)];
      if(icon){
        _ctx.font=`${Math.round(r*0.85)}px serif`;
        _ctx.fillText(icon,px+r+1,py-r);
      }
    }

    // Water ripple effect when sailing
    if(h._onWater&&showRings){
      _ctx.beginPath();
      _ctx.arc(px,py,r+3+Math.sin(_waterPhase*5+h.id)*2,0,Math.PI*2);
      _ctx.strokeStyle='rgba(80,160,255,0.5)';
      _ctx.lineWidth=1.5;
      _ctx.stroke();
    }

    if(showName){
      _ctx.font='8px sans-serif';
      _ctx.fillStyle='rgba(255,255,255,0.9)';
      _ctx.fillText(h.name.split(' ')[0],px,py-r-9);
    }
  }
}

// ── Intelligence curve graph ──────────────────────────────────────────────────
let _intelHistory=[];
let _intelHistoryTimer=0;

function _drawIntelligenceCurve(){
  if(typeof _intelModifier==='undefined')return;
  _intelHistoryTimer++;
  if(_intelHistoryTimer>30){
    _intelHistoryTimer=0;
    _intelHistory.push(_intelModifier);
    if(_intelHistory.length>80)_intelHistory.shift();
  }
  if(_intelHistory.length<2)return;

  const ctx=_ctx;
  const gw=160,gh=50;
  // Bottom-right corner, above the world events panel (events panel is ~7*18+20 = 146px tall)
  const gx=_canvas.width-gw-18;
  const gy=_canvas.height-gh-60-160; // 160px above bottom to clear events panel
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.60)';
  _roundRect(ctx,gx-4,gy-4,gw+8,gh+22,6);
  ctx.fill();

  ctx.font='9px sans-serif';
  ctx.fillStyle='#adf';
  ctx.textAlign='center';
  ctx.fillText(`🧠 Inteligencia: ${(_intelModifier*100).toFixed(0)}%`,gx+gw/2,gy+gh+14);

  ctx.beginPath();
  for(let i=0;i<_intelHistory.length;i++){
    const x=gx+i*(gw/(_intelHistory.length-1));
    const y=gy+gh-((_intelHistory[i]-0.4)/1.2)*gh;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  const v=_intelModifier;
  ctx.strokeStyle=v>1.2?'#4ff':v>0.8?'#4f4':'#f84';
  ctx.lineWidth=2;
  ctx.stroke();

  const lastX=gx+gw;
  const lastY=gy+gh-((v-0.4)/1.2)*gh;
  ctx.beginPath();
  ctx.arc(lastX,lastY,3,0,Math.PI*2);
  ctx.fillStyle=v>1.2?'#4ff':v>0.8?'#4f4':'#f84';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(gx,gy+gh*0.5);ctx.lineTo(gx+gw,gy+gh*0.5);
  ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;ctx.stroke();
  ctx.restore();
}

// ── Legend overlay ────────────────────────────────────────────────────────────
let _legendVisible = true;
function toggleLegend(){ _legendVisible=!_legendVisible; _syncLegendDOM(); }

function _syncLegendDOM(){
  const el = document.getElementById('legend-panel');
  if(!el) return;
  el.style.display = _legendVisible ? 'flex' : 'none';
}

function _buildLegendDOM(){
  let el = document.getElementById('legend-panel');
  if(!el){
    el = document.createElement('div');
    el.id = 'legend-panel';
    el.style.cssText = `
      position:fixed;bottom:60px;left:14px;width:190px;max-height:calc(100vh - 120px);
      background:rgba(0,0,0,0.72);border:1px solid rgba(255,255,255,0.1);
      border-radius:8px;z-index:25;display:flex;flex-direction:column;
      font-family:'Courier New',monospace;font-size:10px;color:#ddd;
      backdrop-filter:blur(4px);overflow:hidden;
    `;
    document.body.appendChild(el);
  }
  const baseItems=[
    ['⚪','Humano'],['👑','Líder'],['🦠','Enfermo'],['⚔️','Soldado'],
    ['🔥','Campamento'],['🏠','Cabaña'],['🌾','Cultivo'],['🐄','Corral'],
    ['⛏','Mina'],['🏪','Mercado'],['🛕','Templo'],
    ['🪵','Empalizada'],['⚔️','Cuartel'],['🌽','Granero'],
    ['🗼','Torre Vigía'],['⚓','Puerto'],
  ];
  const extraItems=[];
  if(typeof _unlockedTypes!=='undefined'){
    if(_unlockedTypes.has('well'))         extraItems.push(['💧','Pozo']);
    if(_unlockedTypes.has('workshop'))     extraItems.push(['🔨','Taller']);
    if(_unlockedTypes.has('library'))      extraItems.push(['📚','Biblioteca']);
    if(_unlockedTypes.has('forge'))        extraItems.push(['⚒️','Forja']);
    if(_unlockedTypes.has('shipyard'))     extraItems.push(['⛵','Astillero']);
    if(_unlockedTypes.has('road'))         extraItems.push(['🛤️','Camino']);
    if(_unlockedTypes.has('carriage'))     extraItems.push(['🐎','Establo']);
    if(_unlockedTypes.has('academy'))      extraItems.push(['🎓','Academia']);
    if(_unlockedTypes.has('colosseum'))    extraItems.push(['🏟','Coliseo']);
    if(_unlockedTypes.has('aqueduct'))     extraItems.push(['🌊','Acueducto']);
    if(_unlockedTypes.has('university'))   extraItems.push(['🏫','Universidad']);
    if(_unlockedTypes.has('observatory'))  extraItems.push(['🔭','Observatorio']);
    if(_unlockedTypes.has('factory'))      extraItems.push(['🏭','Fábrica']);
    if(_unlockedTypes.has('railway'))      extraItems.push(['🚂','Ferrocarril']);
    if(_unlockedTypes.has('powerplant'))   extraItems.push(['⚡','Central Eléc.']);
    if(_unlockedTypes.has('citadel'))      extraItems.push(['🏰','Ciudadela']);
    if(_unlockedTypes.has('cathedral'))    extraItems.push(['⛪','Catedral']);
    if(_unlockedTypes.has('palace'))       extraItems.push(['🏯','Palacio']);
    if(_unlockedTypes.has('airport'))      extraItems.push(['✈️','Aeropuerto']);
    if(_unlockedTypes.has('bridge'))       extraItems.push(['🌉','Puente']);
    if(_unlockedTypes.has('highway'))      extraItems.push(['🛣️','Autopista']);
    if(_unlockedTypes.has('subway'))       extraItems.push(['🚇','Metro']);
    if(_unlockedTypes.has('skyscraper'))   extraItems.push(['🏙️','Rascacielos']);
    if(_unlockedTypes.has('megacity_core'))extraItems.push(['🌆','Núcleo Urbano']);
    if(_unlockedTypes.has('neon_district'))extraItems.push(['🌃','Distrito Neón']);
    if(_unlockedTypes.has('arcology'))     extraItems.push(['🏗️','Arcología']);
    if(_unlockedTypes.has('neural_hub'))   extraItems.push(['🧠','Hub Neural']);
    if(_unlockedTypes.has('spaceport'))    extraItems.push(['🚀','Puerto Espacial']);
  }
  const biomeItems=[
    ['🟦','Mar / Océano'],['🟫','Playa / Costa'],['🌵','Desierto'],['🟧','Mesa'],
    ['🌾','Sabana'],['🌿','Pantano'],['🌱','Manglar'],['🟩','Pradera'],
    ['🌳','Bosque'],['🌲','Bosque Boreal'],['🎋','Bosque de Bambú'],
    ['🌴','Selva Tropical'],['🏔','Montaña'],['🌋','Volcánico'],
    ['❄️','Tundra'],['🧊','Glaciar'],['🪸','Arrecife de Coral'],['🏔','Nieve'],
  ];
  const items=[...baseItems,...extraItems,
    ['─','─────────────'],
    ...biomeItems,
  ];
  el.innerHTML=`
    <div style="padding:6px 10px;font-size:9px;color:#a89060;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;text-transform:uppercase">
      📋 Leyenda
    </div>
    <div style="overflow-y:auto;flex:1;padding:4px 0;">
      <style>#legend-panel div::-webkit-scrollbar{width:3px}#legend-panel div::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px}</style>
      ${items.map(([icon,label])=>`<div style="padding:2px 10px;line-height:1.6">${icon} ${label}</div>`).join('')}
    </div>
  `;
  el.style.display = _legendVisible ? 'flex' : 'none';
}

let _legendDOMBuilt = false;
function _drawLegend(){
  // Build DOM legend once, then keep it updated when unlocks change
  if(!_legendDOMBuilt){ _buildLegendDOM(); _legendDOMBuilt=true; return; }
  // Rebuild every ~300 frames to pick up new unlocks
  if(Math.random()<0.003) _buildLegendDOM();
}

// ── World events ticker ───────────────────────────────────────────────────────
function _drawWorldEvents(){
  if(typeof worldEvents==='undefined'||worldEvents.length===0) return;
  const ctx=_ctx;
  const maxShow=7;
  const events=worldEvents.slice(0,maxShow);
  const lh=18, pad=10, bw=300;
  const bh=events.length*lh+pad*2;
  const x=_canvas.width-bw-14, y=_canvas.height-14;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)';
  _roundRect(ctx,x,y-bh,bw,bh,8);
  ctx.fill();
  ctx.font='11px sans-serif';
  events.forEach((ev,i)=>{
    const ly=y-bh+pad+(i+0.75)*lh;
    ctx.fillStyle='#adf';
    ctx.fillText(`Año ${ev.year}: ${ev.text}`,x+pad,ly);
  });
  ctx.restore();
}

function _roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

// ── Biome special effects ─────────────────────────────────────────────────────
function _drawBiomeEffects(){
  if(cam.zoom < 0.5) return;
  const ctx = _ctx;
  const t = _waterPhase;
  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-1, vy0=Math.floor(-cam.y/cam.zoom/TILE)-1;
  const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+2;
  const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+2;

  // Sample every 3 tiles for performance
  const step = cam.zoom > 1.5 ? 1 : cam.zoom > 0.8 ? 2 : 3;

  ctx.save();
  for(let ty=Math.max(0,vy0);ty<=Math.min(WORLD_H-1,vy1);ty+=step){
    for(let tx=Math.max(0,vx0);tx<=Math.min(WORLD_W-1,vx1);tx+=step){
      const cell = getCell(tx,ty);
      if(!cell) continue;
      const px = tx*TILE+TILE/2, py = ty*TILE+TILE/2;

      switch(cell.biome){
        case 'glacier':{
          // Shimmer azul-blanco
          const g = 0.05 + Math.sin(t*1.5 + tx*0.3 + ty*0.2)*0.04;
          ctx.globalAlpha = g;
          ctx.fillStyle = '#aaddff';
          ctx.fillRect(tx*TILE, ty*TILE, TILE*step, TILE*step);
          break;
        }
        case 'tundra':{
          // Partículas de nieve ocasionales
          if(Math.sin(t*2 + tx*0.7 + ty*0.5) > 0.85){
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px + Math.sin(t+tx)*3, py + ((t*20 + tx*7) % TILE) - TILE/2, 1, 0, Math.PI*2);
            ctx.fill();
          }
          break;
        }
        case 'coral_reef':{
          // Brillo turquesa pulsante
          const pulse = 0.06 + Math.sin(t*2.5 + tx*0.4 + ty*0.6)*0.04;
          ctx.globalAlpha = pulse;
          ctx.fillStyle = '#00ffcc';
          ctx.fillRect(tx*TILE, ty*TILE, TILE*step, TILE*step);
          break;
        }
        case 'volcanic':{
          // Brillo naranja-rojo intermitente
          if(Math.sin(t*3 + tx*0.9 + ty*1.1) > 0.7){
            ctx.globalAlpha = 0.12 + Math.random()*0.08;
            ctx.fillStyle = '#ff4400';
            ctx.fillRect(tx*TILE, ty*TILE, TILE*step, TILE*step);
          }
          break;
        }
        case 'mangrove':{
          // Reflejo verde en el agua
          const r = 0.04 + Math.sin(t*1.8 + tx*0.5)*0.03;
          ctx.globalAlpha = r;
          ctx.fillStyle = '#44aa44';
          ctx.fillRect(tx*TILE, ty*TILE, TILE*step, TILE*step);
          break;
        }
        case 'bamboo_forest':{
          // Leve brillo verde-amarillo
          if(Math.sin(t + tx*0.3) > 0.6){
            ctx.globalAlpha = 0.06;
            ctx.fillStyle = '#aaff44';
            ctx.fillRect(tx*TILE, ty*TILE, TILE*step, TILE*step);
          }
          break;
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Battlefields, Wonders, Dark Age, Pandemic overlays ───────────────────────
function _drawEpicOverlays(){
  if(cam.zoom < 0.4) return;
  const ctx = _ctx;
  const t = _waterPhase;

  // ── Campos de batalla — cruces rojas pulsantes ────────────────────────────
  if(typeof _battlefields !== 'undefined' && _battlefields.length > 0){
    const vx0=Math.floor(-cam.x/cam.zoom/TILE)-2, vy0=Math.floor(-cam.y/cam.zoom/TILE)-2;
    const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+4;
    const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+4;
    ctx.save();
    for(const bf of _battlefields){
      if(bf.tx<vx0||bf.tx>vx1||bf.ty<vy0||bf.ty>vy1) continue;
      const px = bf.tx*TILE+TILE/2, py = bf.ty*TILE+TILE/2;
      const pulse = 0.5 + Math.sin(t*2 + bf.tx*0.1)*0.5;
      // Aura roja
      ctx.globalAlpha = 0.12 + pulse*0.1;
      ctx.fillStyle = '#cc2200';
      ctx.beginPath();
      ctx.arc(px, py, TILE*2.5, 0, Math.PI*2);
      ctx.fill();
      // Cruz de espadas
      if(cam.zoom > 0.5){
        ctx.globalAlpha = 0.7 + pulse*0.3;
        ctx.font = `${Math.round(TILE*1.1)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚔️', px, py);
      }
      // Nombre del campo de batalla a zoom medio
      if(cam.zoom > 0.9 && cam.zoom < 2.5){
        ctx.globalAlpha = 0.85;
        ctx.font = `bold ${Math.round(Math.max(8, 10/cam.zoom*TILE*0.12))}px sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth = 2.5/cam.zoom;
        ctx.strokeText(bf.name, px, py + TILE*1.2);
        ctx.fillStyle = '#ffaaaa';
        ctx.fillText(bf.name, px, py + TILE*1.2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Maravillas del mundo — aura dorada especial ───────────────────────────
  if(typeof structures !== 'undefined'){
    ctx.save();
    const megaGlowTypes=new Set(['stadium','pyramid','great_wall','lighthouse','amphitheater','ziggurat','obelisk']);
    for(const s of structures){
      const isWonder=s.isWonder;
      const isMega=megaGlowTypes.has(s.type);
      if(!isWonder&&!isMega) continue;
      const px = s.tx*TILE+TILE/2, py = s.ty*TILE+TILE/2;
      const pulse = 0.6 + Math.sin(t*1.8 + s.tx*0.05)*0.4;
      if(isWonder){
        // Aura dorada grande
        const grad = ctx.createRadialGradient(px,py,0,px,py,TILE*4);
        grad.addColorStop(0, `rgba(255,215,0,${0.35*pulse})`);
        grad.addColorStop(0.5, `rgba(255,165,0,${0.15*pulse})`);
        grad.addColorStop(1, 'rgba(255,165,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, TILE*4, 0, Math.PI*2);
        ctx.fill();
        // Anillo dorado pulsante
        ctx.globalAlpha = 0.6*pulse;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = Math.max(2, 3/cam.zoom);
        ctx.beginPath();
        ctx.arc(px, py, TILE*1.8*(0.9+Math.sin(t*3)*0.1), 0, Math.PI*2);
        ctx.stroke();
        // Etiqueta "MARAVILLA"
        if(cam.zoom > 1.4){
          ctx.globalAlpha = 0.95;
          ctx.font = `bold ${Math.round(Math.max(9, 11/cam.zoom*TILE*0.12))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.strokeStyle = 'rgba(0,0,0,0.9)';
          ctx.lineWidth = 3/cam.zoom;
          ctx.strokeText(`✨ ${s.label}`, px, py - TILE*1.2);
          ctx.fillStyle = '#ffd700';
          ctx.fillText(`✨ ${s.label}`, px, py - TILE*1.2);
        }
      } else if(isMega&&cam.zoom<1.5){
        // Subtle glow for mega structures visible from zoom-out
        const glowR=s.type==='great_wall'?TILE*3.5:s.type==='stadium'||s.type==='amphitheater'?TILE*2.5:TILE*2;
        const grad2=ctx.createRadialGradient(px,py,0,px,py,glowR);
        const col=s.type==='pyramid'||s.type==='ziggurat'?'255,200,50':
                  s.type==='lighthouse'?'255,255,150':
                  s.type==='stadium'?'200,220,50':
                  s.type==='great_wall'?'160,130,80':'200,160,255';
        grad2.addColorStop(0,`rgba(${col},${0.3*pulse})`);
        grad2.addColorStop(1,`rgba(${col},0)`);
        ctx.fillStyle=grad2;
        ctx.beginPath();ctx.arc(px,py,glowR,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Glaciación — velo de hielo sobre los polos ───────────────────────────
  if(typeof getGlaciationLevel === 'function'){
    const gl = getGlaciationLevel();
    if(gl > 0.05){
      ctx.save();
      const iceAlpha = gl * 0.45;
      // polo norte
      const northH = _canvas.height * gl * 0.4;
      const gradN = ctx.createLinearGradient(0,0,0,northH);
      gradN.addColorStop(0, `rgba(200,230,255,${iceAlpha})`);
      gradN.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = gradN;
      ctx.fillRect(0, 0, _canvas.width, northH);
      // polo sur
      const gradS = ctx.createLinearGradient(0,_canvas.height,0,_canvas.height - northH);
      gradS.addColorStop(0, `rgba(200,230,255,${iceAlpha})`);
      gradS.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = gradS;
      ctx.fillRect(0, _canvas.height - northH, _canvas.width, northH);
      ctx.restore();
    }
  }

  // ── Edad Oscura — velo oscuro sobre civs afectadas ────────────────────────
  if(typeof civilizations !== 'undefined' && typeof _darkAgeState !== 'undefined'){
    for(const [civId] of _darkAgeState){
      const civ = civilizations.get(civId);
      if(!civ || civ.territory.size === 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(t*0.8)*0.05;
      ctx.fillStyle = '#111133';
      for(const key of civ.territory){
        const comma = key.indexOf(',');
        const tx = +key.slice(0,comma), ty = +key.slice(comma+1);
        ctx.fillRect(tx*TILE, ty*TILE, TILE, TILE);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ── Plaga de IA — overlay de grilla digital sobre el mundo ───────────────
  if(typeof getAIPlagueState === 'function'){
    const aiState = getAIPlagueState();
    if(aiState.active && aiState.phase >= 2){
      ctx.save();
      const gridAlpha = Math.min(0.18, aiState.progress * 0.25) * (0.7 + Math.sin(t*2)*0.3);
      ctx.globalAlpha = gridAlpha;
      ctx.strokeStyle = '#44ffaa';
      ctx.lineWidth = 0.5 / cam.zoom;
      const gridSize = TILE * 4;
      const wx0 = -cam.x/cam.zoom, wy0 = -cam.y/cam.zoom;
      const wx1 = wx0 + _canvas.width/cam.zoom, wy1 = wy0 + _canvas.height/cam.zoom;
      const gx0 = Math.floor(wx0/gridSize)*gridSize;
      const gy0 = Math.floor(wy0/gridSize)*gridSize;
      for(let gx = gx0; gx < wx1; gx += gridSize){
        ctx.beginPath(); ctx.moveTo(gx, wy0); ctx.lineTo(gx, wy1); ctx.stroke();
      }
      for(let gy = gy0; gy < wy1; gy += gridSize){
        ctx.beginPath(); ctx.moveTo(wx0, gy); ctx.lineTo(wx1, gy); ctx.stroke();
      }
      // Fase 3: overlay más intenso con color púrpura
      if(aiState.phase === 3){
        ctx.globalAlpha = gridAlpha * 1.5;
        ctx.strokeStyle = '#aa44ff';
        ctx.lineWidth = 1 / cam.zoom;
        const gridSize2 = TILE * 8;
        const gx02 = Math.floor(wx0/gridSize2)*gridSize2;
        const gy02 = Math.floor(wy0/gridSize2)*gridSize2;
        for(let gx = gx02; gx < wx1; gx += gridSize2){
          ctx.beginPath(); ctx.moveTo(gx, wy0); ctx.lineTo(gx, wy1); ctx.stroke();
        }
        for(let gy = gy02; gy < wy1; gy += gridSize2){
          ctx.beginPath(); ctx.moveTo(wx0, gy); ctx.lineTo(wx1, gy); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}

// ── Pandemic HUD indicator ────────────────────────────────────────────────────
function _drawPandemicHUD(){
  if(typeof _activePandemics === 'undefined' || _activePandemics.length === 0) return;
  const p = _activePandemics[0];
  const ctx = _ctx;
  const x = _canvas.width/2, y = 108;
  const phaseColor = p.phase==='pico'?'#ff2200':p.phase==='incubacion'?'#ff8800':'#44aa44';
  const phaseLabel = p.phase==='pico'?'PICO':p.phase==='incubacion'?'INCUBACIÓN':'DECLIVE';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 13px sans-serif';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  const txt = `☠️ PANDEMIA: "${p.name}" — ${phaseLabel}`;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = phaseColor;
  ctx.fillText(txt, x, y);
  ctx.restore();
}

// ── Climate HUD indicator ─────────────────────────────────────────────────────
function _drawClimateHUD(){
  if(typeof _climatePhase === 'undefined' || _climatePhase === 'templado') return;
  const ctx = _ctx;
  const x = _canvas.width/2, y = 128;
  const icon = _climatePhase === 'calentamiento' ? '🌡️' : '🧊';
  const label = _climatePhase === 'calentamiento' ? 'CALENTAMIENTO GLOBAL' : 'ERA DE HIELO';
  const color = _climatePhase === 'calentamiento' ? '#ff8800' : '#88ccff';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 12px sans-serif';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  const txt = `${icon} ${label} (intensidad: ${Math.round((_climateIntensity||0)*100)}%)`;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
  ctx.restore();
}

// ── AI Plague HUD indicator ───────────────────────────────────────────────────
function _drawAIPlagueHUD(){
  if(typeof getAIPlagueState === 'undefined') return;
  const state = getAIPlagueState();
  if(!state.active) return;
  const ctx = _ctx;
  const x = _canvas.width/2, y = 148;
  const phaseLabels = ['','EXPANSIÓN','DOMINACIÓN','SINGULARIDAD'];
  const phaseColors = ['','#44ffaa','#ff8800','#aa44ff'];
  const label = phaseLabels[state.phase] || '';
  const color = phaseColors[state.phase] || '#ffffff';
  const pct = Math.round(state.progress * 100);
  const pulse = 0.7 + Math.sin(_waterPhase * 4) * 0.3;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 12px monospace';
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 3;
  const txt = `🤖 IA: ${label} — ${pct}%`;
  ctx.strokeText(txt, x, y);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Globalization HUD indicator ───────────────────────────────────────────────
function _drawGlobalizationHUD(){
  if(typeof getGlobalizationLevel === 'undefined') return;
  const lvl = getGlobalizationLevel();
  if(lvl < 0.1) return;
  const ctx = _ctx;
  const x = _canvas.width/2, y = 168;
  const pct = Math.round(lvl * 100);
  const phases = ['','Integración Temprana','Integración Media','Integración Avanzada','Aldea Global'];
  const phaseIdx = lvl >= 1 ? 4 : lvl >= 0.75 ? 3 : lvl >= 0.5 ? 2 : 1;
  const colors = ['','#88ddff','#44aaff','#2266ff','#ffffff'];
  const color = colors[phaseIdx];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 12px monospace';
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 3;
  const txt = `🌐 Globalización: ${phases[phaseIdx]} — ${pct}%`;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
  ctx.restore();
}

// ── Water shimmer ─────────────────────────────────────────────────────────────
let _waterTiles=null;

function buildWaterTileList(){
  _waterTiles=[];
  for(let ty=0;ty<WORLD_H;ty++) for(let tx=0;tx<WORLD_W;tx++){
    const cell=getCell(tx,ty);
    if(cell&&(cell.biome==='sea'||cell.biome==='deep_sea'))
      _waterTiles.push({tx,ty,phase:(tx+ty)*0.15});
  }
}

function _drawWaterShimmer(){
  if(!_waterTiles) return;
  const x0=Math.floor(-cam.x/cam.zoom/TILE)-1, y0=Math.floor(-cam.y/cam.zoom/TILE)-1;
  const x1=x0+Math.ceil(_canvas.width/cam.zoom/TILE)+2;
  const y1=y0+Math.ceil(_canvas.height/cam.zoom/TILE)+2;
  _ctx.fillStyle='rgba(120,180,240,0.07)';
  for(const w of _waterTiles){
    if(w.tx<x0||w.tx>x1||w.ty<y0||w.ty>y1) continue;
    if(Math.sin(_waterPhase+w.phase)>0.55)
      _ctx.fillRect(w.tx*TILE+1,w.ty*TILE+TILE*0.4,TILE-2,2);
  }
}
