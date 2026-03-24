// ── Renderer ──────────────────────────────────────────────────────────────────
const cam = {
  x:0, y:0, zoom:1,
  minZoom:0.5, maxZoom:6,
};

let _canvas=null, _ctx=null;
// Device Pixel Ratio — fixes blurry canvas on retina/HiDPI screens
let _dpr = 1;

function rendererInit(canvas){
  _canvas=canvas;
  _dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x to save memory
  _ctx=canvas.getContext('2d');
  _applyDPR();
}
function _applyDPR(){
  const logW = window.innerWidth, logH = window.innerHeight;
  _canvas.width  = Math.round(logW  * _dpr);
  _canvas.height = Math.round(logH * _dpr);
  _canvas.style.width  = logW  + 'px';
  _canvas.style.height = logH + 'px';
  _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  _ctx.imageSmoothingEnabled = true;
  _ctx.imageSmoothingQuality = 'high';
}
function rendererResize(){
  _dpr = Math.min(window.devicePixelRatio || 1, 2);
  _applyDPR();
}
// Logical canvas size (what the rest of the code sees)
function _cw(){ return _canvas.width  / _dpr; }
function _ch(){ return _canvas.height / _dpr; }

function clampCamera(){
  const ww=WORLD_W*TILE*cam.zoom, wh=WORLD_H*TILE*cam.zoom;
  const cw=_cw(), ch=_ch();
  if(ww <= cw)  cam.x = (cw  - ww) / 2;
  else cam.x = Math.min(0, Math.max(cw  - ww, cam.x));
  if(wh <= ch) cam.y = (ch - wh) / 2;
  else cam.y = Math.min(0, Math.max(ch - wh, cam.y));
}
function centerCamera(){
  const ww=WORLD_W*TILE*cam.zoom, wh=WORLD_H*TILE*cam.zoom;
  cam.x=(_cw()-ww)/2; cam.y=(_ch()-wh)/2;
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
  cam.x=_cw()/2-wx*cam.zoom;
  cam.y=_ch()/2-wy*cam.zoom;
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

// ── Colosseum Battle System ───────────────────────────────────────────────────
// Tracks active colosseum battles for epic spectator rendering
let _colosseumBattle = null; // {structureTx, structureTy, nameA, nameB, timer, maxTimer, killed, civColorA, civColorB}
let _colosseumCooldown = 0;  // prevent spam

function triggerColosseumBattle(attacker, defender, killed){
  if(typeof structures === 'undefined') return;
  // Only trigger if there's a colosseum or stadium nearby
  const SEARCH_R = 12;
  let arena = null;
  for(const s of structures){
    if(s.type !== 'colosseum' && s.type !== 'stadium' && s.type !== 'amphitheater') continue;
    if(Math.hypot(s.tx - attacker.tx, s.ty - attacker.ty) < SEARCH_R){
      arena = s; break;
    }
  }
  if(!arena) return;
  // Cooldown — don't spam
  if(_colosseumCooldown > 0){ _colosseumCooldown--; return; }
  _colosseumCooldown = 80;

  const civA = attacker.civId != null && typeof civilizations !== 'undefined' ? civilizations.get(attacker.civId) : null;
  const civB = defender.civId != null && typeof civilizations !== 'undefined' ? civilizations.get(defender.civId) : null;

  _colosseumBattle = {
    structureTx: arena.tx,
    structureTy: arena.ty,
    nameA: attacker.name.split(' ')[0],
    nameB: defender.name.split(' ')[0],
    civColorA: civA ? civA.color : '#ff4444',
    civColorB: civB ? civB.color : '#4488ff',
    killed,
    timer: 0,
    maxTimer: 8.0,
    phase: 0, // 0=intro, 1=fight, 2=result
  };

  // Event feed notification with "go to" button
  const icon = killed ? '💀' : '⚔️';
  const text = killed
    ? `${attacker.name.split(' ')[0]} venció a ${defender.name.split(' ')[0]} en el Coliseo`
    : `${attacker.name.split(' ')[0]} vs ${defender.name.split(' ')[0]} — Batalla en el Coliseo`;
  pushEventNotif(icon, text, '#ffd700', arena.tx, arena.ty);

  // Auto-center camera on arena if not following someone
  if(typeof _autoFollowMode !== 'undefined' && !_autoFollowMode && typeof centerOn !== 'undefined'){
    centerOn(arena.tx, arena.ty);
    if(cam.zoom < 2.5) cam.zoom = 2.5;
    clampCamera();
  }
}

// ── Colosseum Battle Rendering ────────────────────────────────────────────────
function _drawColosseumBattleOverlay(dtSec){
  if(!_colosseumBattle) return;
  const b = _colosseumBattle;
  b.timer += dtSec;
  if(b.timer >= b.maxTimer){ _colosseumBattle = null; return; }

  const t = _waterPhase;
  const progress = b.timer / b.maxTimer;
  const ctx = _ctx;

  // Find arena screen position
  const arenaWx = b.structureTx * TILE + TILE/2;
  const arenaWy = b.structureTy * TILE + TILE/2;

  // Phase transitions
  if(b.timer < 1.5) b.phase = 0;       // intro
  else if(b.timer < b.maxTimer - 1.5) b.phase = 1; // fight
  else b.phase = 2;                      // result

  const fadeIn  = Math.min(1, b.timer / 0.4);
  const fadeOut = progress > 0.82 ? 1-(progress-0.82)/0.18 : 1;
  const alpha   = fadeIn * fadeOut;

  ctx.save();

  // ── Crowd roar rings expanding from arena ─────────────────────────────────
  if(b.phase >= 0){
    for(let ring=0; ring<3; ring++){
      const rPhase = (t*1.8 + ring*0.7) % 2;
      const rRadius = (TILE*2 + rPhase * TILE*5);
      const rAlpha  = (1 - rPhase/2) * 0.25 * alpha;
      ctx.globalAlpha = rAlpha;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = Math.max(1, 3*(1-rPhase/2));
      ctx.beginPath();
      ctx.arc(arenaWx, arenaWy, rRadius, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // ── Fighter A (attacker) — red ────────────────────────────────────────────
  if(b.phase >= 1){
    const fightT = (b.timer - 1.5);
    const orbitR = TILE * 1.2;
    const speed  = 2.5;
    const ax = arenaWx + Math.cos(fightT * speed) * orbitR;
    const ay = arenaWy + Math.sin(fightT * speed) * orbitR * 0.6;
    const bx = arenaWx + Math.cos(fightT * speed + Math.PI) * orbitR;
    const by = arenaWy + Math.sin(fightT * speed + Math.PI) * orbitR * 0.6;

    // Fighter trails
    ctx.globalAlpha = 0.3 * alpha;
    ctx.strokeStyle = b.civColorA;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(arenaWx, arenaWy, orbitR, fightT*speed - 0.8, fightT*speed);
    ctx.stroke();
    ctx.strokeStyle = b.civColorB;
    ctx.beginPath();
    ctx.arc(arenaWx, arenaWy, orbitR, fightT*speed + Math.PI - 0.8, fightT*speed + Math.PI);
    ctx.stroke();

    // Fighter A dot
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.civColorA;
    ctx.beginPath();
    ctx.arc(ax, ay, Math.max(3, TILE*0.35), 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fighter B dot
    ctx.fillStyle = b.civColorB;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(3, TILE*0.35), 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Clash sparks when fighters are close
    const dist = Math.hypot(ax-bx, ay-by);
    if(dist < TILE * 0.8){
      const sparkCount = 6;
      for(let sp=0; sp<sparkCount; sp++){
        const sa = (sp/sparkCount)*Math.PI*2 + t*12;
        const sr = TILE * (0.2 + Math.random()*0.4);
        const sx = (ax+bx)/2 + Math.cos(sa)*sr;
        const sy = (ay+by)/2 + Math.sin(sa)*sr;
        ctx.globalAlpha = (0.6 + Math.random()*0.4) * alpha;
        ctx.fillStyle = Math.random()>0.5 ? '#ffffff' : '#ffdd00';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, TILE*0.08), 0, Math.PI*2);
        ctx.fill();
      }
      // Central flash
      ctx.globalAlpha = 0.7 * alpha * (0.5+Math.sin(t*15)*0.5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc((ax+bx)/2, (ay+by)/2, TILE*0.25, 0, Math.PI*2);
      ctx.fill();
    }

    // Fighter name labels
    if(cam.zoom > 1.0){
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.max(7, Math.round(TILE*0.55))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(b.nameA, ax, ay - TILE*0.5);
      ctx.fillStyle = b.civColorA;
      ctx.fillText(b.nameA, ax, ay - TILE*0.5);
      ctx.strokeText(b.nameB, bx, by - TILE*0.5);
      ctx.fillStyle = b.civColorB;
      ctx.fillText(b.nameB, bx, by - TILE*0.5);
    }
  }

  // ── Result phase — death or victory ──────────────────────────────────────
  if(b.phase === 2 && b.killed){
    const resultAlpha = Math.min(1, (b.timer - (b.maxTimer-1.5)) / 0.5) * fadeOut;
    ctx.globalAlpha = resultAlpha;
    // Victory burst
    for(let i=0; i<8; i++){
      const a2 = (i/8)*Math.PI*2;
      const len = TILE * (1.5 + Math.sin(t*6+i)*0.5);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arenaWx, arenaWy);
      ctx.lineTo(arenaWx + Math.cos(a2)*len, arenaWy + Math.sin(a2)*len);
      ctx.stroke();
    }
    // ☠️ death icon
    ctx.font = `${Math.round(TILE*1.2)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☠️', arenaWx, arenaWy - TILE*2);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
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

function _drawNuclearExplosions(){
  if(typeof getNuclearExplosions==='undefined') return;
  const explosions = getNuclearExplosions();
  if(explosions.length===0) return;
  const ctx = _ctx;
  const radiationTiles = typeof getRadiationTiles!=='undefined' ? getRadiationTiles() : null;

  // Draw radiation tiles first (persistent glow)
  if(radiationTiles && radiationTiles.size > 0 && cam.zoom > 0.3){
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#88ff00';
    for(const key of radiationTiles){
      const [rtx, rty] = key.split(',').map(Number);
      const px = rtx * TILE, py = rty * TILE;
      ctx.fillRect(px, py, TILE, TILE);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Draw active explosions
  for(const e of explosions){
    const px = e.tx * TILE + TILE/2;
    const py = e.ty * TILE + TILE/2;
    const progress = e.age / e.maxAge; // 0→1
    const alpha = progress < 0.3 ? progress/0.3 : 1 - (progress-0.3)/0.7;

    ctx.save();

    // Outer shockwave ring
    const shockR = e.radius * (1 + progress * 0.5);
    const shockGrad = ctx.createRadialGradient(px, py, shockR*0.7, px, py, shockR);
    shockGrad.addColorStop(0, `rgba(255,200,50,${alpha*0.3})`);
    shockGrad.addColorStop(1, `rgba(255,100,0,0)`);
    ctx.beginPath();
    ctx.arc(px, py, shockR, 0, Math.PI*2);
    ctx.fillStyle = shockGrad;
    ctx.fill();

    // Main fireball
    const fireR = e.radius * Math.min(1, progress * 3);
    const fireGrad = ctx.createRadialGradient(px, py, 0, px, py, fireR);
    fireGrad.addColorStop(0, `rgba(255,255,200,${alpha})`);
    fireGrad.addColorStop(0.3, `rgba(255,180,0,${alpha*0.9})`);
    fireGrad.addColorStop(0.7, `rgba(255,60,0,${alpha*0.6})`);
    fireGrad.addColorStop(1, `rgba(80,0,0,0)`);
    ctx.beginPath();
    ctx.arc(px, py, fireR, 0, Math.PI*2);
    ctx.fillStyle = fireGrad;
    ctx.fill();

    // Mushroom cloud stem (vertical rectangle)
    if(progress > 0.15 && progress < 0.8){
      const stemH = e.radius * progress * 1.5;
      const stemW = e.radius * 0.15;
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = `rgba(180,120,60,${alpha*0.4})`;
      ctx.fillRect(px - stemW/2, py - stemH, stemW, stemH);
    }

    // Mushroom cap
    if(progress > 0.2){
      const capR = e.radius * Math.min(0.8, (progress-0.2) * 2);
      const capY = py - e.radius * progress * 1.2;
      const capGrad = ctx.createRadialGradient(px, capY, 0, px, capY, capR);
      capGrad.addColorStop(0, `rgba(200,150,80,${alpha*0.7})`);
      capGrad.addColorStop(0.6, `rgba(120,80,40,${alpha*0.5})`);
      capGrad.addColorStop(1, `rgba(60,40,20,0)`);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px, capY, capR, 0, Math.PI*2);
      ctx.fillStyle = capGrad;
      ctx.fill();
    }

    // ☢️ label
    if(cam.zoom > 0.5 && progress < 0.6){
      ctx.globalAlpha = alpha;
      ctx.font = `${Math.round(14/cam.zoom)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('☢️', px, py - e.radius - 8/cam.zoom);
    }

    ctx.restore();
  }
}

function _drawMetropolisEffects(dtSec){
  if(typeof structures === 'undefined' || cam.zoom < 0.6) return;
  // Skip entirely at very high structure count — too expensive
  if(structures.length > 800 && cam.zoom < 1.0) return;
  const ctx = _ctx;
  const t = _waterPhase;

  // Rebuild structure type cache once per second
  _tickStructCache(dtSec);

  // ── Road network lines connecting road/highway tiles ──────────────────────
  if(cam.zoom > 0.7){
    ctx.save();
    // Only draw lines between road tiles within viewport — skip O(n²) global scan
    const vx0=Math.floor(-cam.x/cam.zoom/TILE)-2, vy0=Math.floor(-cam.y/cam.zoom/TILE)-2;
    const vx1=vx0+Math.ceil(_cw()/cam.zoom/TILE)+4;
    const vy1=vy0+Math.ceil(_ch()/cam.zoom/TILE)+4;
    const visRoads = _getStructsByTypes(['road','highway','railway','subway']).filter(s =>
      s.tx>=vx0 && s.tx<=vx1 && s.ty>=vy0 && s.ty<=vy1
    );
    // Only connect if within 10 tiles — use grid proximity check
    const MAX_ROAD_LINES = structures.length > 600 ? 80 : 200; // cap draw calls
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

// ── Per-frame LOD counters ────────────────────────────────────────────────────
let _frameCount = 0;
let _lastFrameMs = 0;
let _fps = 60;
let _fpsSmooth = 60;

function renderFrame(dt){
  _frameCount++;
  const now = performance.now();
  if(_lastFrameMs > 0){
    const rawFps = 1000 / (now - _lastFrameMs);
    _fpsSmooth = _fpsSmooth * 0.92 + rawFps * 0.08;
    _fps = _fpsSmooth;
  }
  _lastFrameMs = now;

  const dtSec = dt/1000;
  _waterPhase+=dt*0.0008;

  // LOD: reduce expensive effects when fps drops below 45
  const lowPerf = _fps < 45;
  const veryLowPerf = _fps < 30;

  const cw = _cw(), ch = _ch();

  _ctx.fillStyle='#0f2a4a';
  _ctx.fillRect(0,0,cw,ch);

  _ctx.save();
  _ctx.translate(cam.x,cam.y);
  _ctx.scale(cam.zoom,cam.zoom);

  if(terrainCanvas) _ctx.drawImage(terrainCanvas,0,0);
  if(cam.zoom>0.5 && !veryLowPerf) _drawWaterShimmer();
  _drawMapVignette();

  if(resourceCanvas&&cam.zoom>0.4){
    _ctx.globalAlpha=Math.min(1,(cam.zoom-0.4)/0.3);
    _ctx.drawImage(resourceCanvas,0,0);
    _ctx.globalAlpha=1;
  }

  if(typeof structures!=='undefined') _drawCityGlows();
  if(typeof civilizations!=='undefined') _drawTerritories();
  if(typeof structures!=='undefined') _drawStructures();
  if(typeof naturalMonuments!=='undefined'&&naturalMonuments.length>0) _drawMonuments();
  if(typeof getTouristSites!=='undefined') _drawTouristSites();

  _drawEpicOverlays();
  // Biome effects: skip every other frame at low perf, skip 2/3 at very low
  if(!veryLowPerf && (!lowPerf || (_frameCount&1)===0)) _drawBiomeEffects();

  // Update movement trails for followed/selected humans
  if(typeof humans!=='undefined'&&typeof _cachedAlive!=='undefined'){
    const followedId = (typeof _autoFollowId !== 'undefined') ? _autoFollowId : null;
    const selId = (typeof _selectedHumanId !== 'undefined') ? _selectedHumanId : null;
    for(const h of _cachedAlive){
      if(h.id===followedId||h.id===selId) _updateHumanTrail(h, dtSec);
    }
  }

  if(typeof humans!=='undefined') _drawHumans();

  if(!lowPerf) _drawTradeRoutes();
  _drawArmyFormations();

  if(typeof getMediaHeadlines !== 'undefined' && !veryLowPerf) _drawMediaStructures();

  _drawBattleFX(dtSec);
  _drawColosseumBattleOverlay(dtSec);

  if(typeof getNuclearExplosions!=='undefined') _drawNuclearExplosions();

  if(!veryLowPerf) _drawMetropolisEffects(dtSec);

  _ctx.restore();

  // Season tint overlay
  if(typeof _season!=='undefined'){
    const tints=[null,'rgba(255,220,100,0.04)','rgba(200,120,40,0.05)','rgba(80,140,255,0.08)'];
    const tint=tints[_season];
    if(tint){
      _ctx.fillStyle=tint;
      _ctx.fillRect(0,0,cw,ch);
    }
  }

  // Day/night overlay
  if(typeof getDayNightPhase !== 'undefined'){
    const phase = getDayNightPhase();
    const nightAlpha = Math.max(0, -Math.cos(phase * Math.PI * 2)) * 0.45;
    if(nightAlpha > 0.01){
      _ctx.fillStyle = `rgba(10,10,40,${nightAlpha.toFixed(2)})`;
      _ctx.fillRect(0,0,cw,ch);
    }
  }

  // Pollution tint overlay
  if(typeof getPollutionAt !== 'undefined' && cam.zoom > 0.3 && !veryLowPerf){
    _ctx.save();
    _ctx.translate(cam.x, cam.y);
    _ctx.scale(cam.zoom, cam.zoom);
    const vx0=Math.floor(-cam.x/cam.zoom/TILE)-1, vy0=Math.floor(-cam.y/cam.zoom/TILE)-1;
    const vx1=Math.ceil((cw-cam.x)/cam.zoom/TILE)+1;
    const vy1=Math.ceil((ch-cam.y)/cam.zoom/TILE)+1;
    for(let ty=Math.max(0,vy0);ty<Math.min(WORLD_H,vy1);ty+=2){
      for(let tx=Math.max(0,vx0);tx<Math.min(WORLD_W,vx1);tx+=2){
        const p = getPollutionAt(tx,ty);
        if(p < 10) continue;
        const alpha = Math.min(0.5, p/200);
        _ctx.fillStyle = `rgba(80,60,20,${alpha.toFixed(2)})`;
        _ctx.fillRect(tx*TILE, ty*TILE, TILE*2, TILE*2);
      }
    }
    _ctx.restore();
  }

  _drawLegend();
  _drawIntelligenceCurve();
  _drawPandemicHUD();
  _drawClimateHUD();
  _drawAIPlagueHUD();
  _drawGlobalizationHUD();
  _drawNuclearHUD();
  _drawClock();
  _checkWorldEventNotifs();
  if(!lowPerf) _drawFPSCounter();
}

// ── Event Feed — DOM notifications bottom-right, left of human panel ─────────
// Each entry: {id, icon, text, color, tx, ty, timestamp}
let _eventFeedItems = [];
let _eventFeedEl = null;
let _eventFeedLastEventCount = 0;
let _eventFeedLastPopMilestone = 0;
let _eventFeedLastWarCount = 0;
let _eventFeedIdCounter = 0;

function _ensureEventFeed(){
  if(_eventFeedEl) return _eventFeedEl;
  _eventFeedEl = document.createElement('div');
  _eventFeedEl.id = 'event-feed';
  _eventFeedEl.style.cssText = [
    'position:fixed',
    'bottom:10px',
    'right:225px',   // left of the human panel (215px wide + 10px gap)
    'width:260px',
    'max-height:320px',
    'overflow:hidden',
    'display:flex',
    'flex-direction:column-reverse',
    'gap:5px',
    'z-index:90',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(_eventFeedEl);
  return _eventFeedEl;
}

function pushEventNotif(icon, text, color, tx, ty){
  // Deduplicate — same text within 4s
  const now = Date.now();
  if(_eventFeedItems.some(n => n.text === text && now - n.timestamp < 4000)) return;

  const id = ++_eventFeedIdCounter;
  _eventFeedItems.push({id, icon, text, color: color||'#ffd700', tx, ty, timestamp: now});
  // Keep max 6 items
  if(_eventFeedItems.length > 6) _eventFeedItems.shift();
  _renderEventFeed();
}

function _renderEventFeed(){
  const el = _ensureEventFeed();
  el.innerHTML = '';
  // Render newest first (column-reverse shows bottom = newest)
  for(const item of _eventFeedItems){
    const card = document.createElement('div');
    card.style.cssText = [
      'background:rgba(4,10,22,0.94)',
      `border-left:3px solid ${item.color}`,
      'border-radius:0 8px 8px 0',
      'padding:7px 8px 7px 10px',
      'font-family:\'Courier New\',monospace',
      'font-size:11px',
      'color:#dde',
      'display:flex',
      'align-items:center',
      'gap:7px',
      'box-shadow:0 2px 12px rgba(0,0,0,0.6)',
      'pointer-events:auto',
      'cursor:default',
      'animation:efSlideIn 0.25s ease',
      'border-top:1px solid rgba(255,255,255,0.06)',
      'border-right:1px solid rgba(255,255,255,0.06)',
      'border-bottom:1px solid rgba(255,255,255,0.06)',
    ].join(';');

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size:16px;flex-shrink:0;';
    iconSpan.textContent = item.icon;

    const textSpan = document.createElement('span');
    textSpan.style.cssText = `flex:1;color:${item.color};font-size:10px;line-height:1.35;`;
    textSpan.textContent = item.text;

    card.appendChild(iconSpan);
    card.appendChild(textSpan);

    // "Ir" button only if we have coordinates
    if(item.tx != null && item.ty != null){
      const btn = document.createElement('button');
      btn.textContent = '→';
      btn.title = 'Ir al lugar';
      btn.style.cssText = [
        'background:rgba(255,255,255,0.08)',
        `border:1px solid ${item.color}55`,
        `color:${item.color}`,
        'border-radius:5px',
        'padding:2px 7px',
        'cursor:pointer',
        'font-family:\'Courier New\',monospace',
        'font-size:11px',
        'flex-shrink:0',
        'transition:background 0.1s',
      ].join(';');
      const capTx = item.tx, capTy = item.ty;
      btn.addEventListener('mouseenter', ()=>{ btn.style.background='rgba(255,255,255,0.18)'; });
      btn.addEventListener('mouseleave', ()=>{ btn.style.background='rgba(255,255,255,0.08)'; });
      btn.addEventListener('click', ()=>{
        if(typeof centerOn !== 'undefined') centerOn(capTx, capTy);
        if(cam.zoom < 2.5) cam.zoom = 2.5;
        if(typeof clampCamera !== 'undefined') clampCamera();
      });
      card.appendChild(btn);
    }

    el.appendChild(card);
  }
}

// Auto-expire old items every 8s
setInterval(()=>{
  const now = Date.now();
  const before = _eventFeedItems.length;
  _eventFeedItems = _eventFeedItems.filter(n => now - n.timestamp < 8000);
  if(_eventFeedItems.length !== before) _renderEventFeed();
}, 1000);

// Hook into worldEvents + simulation state
function _checkWorldEventNotifs(){
  if(typeof worldEvents === 'undefined') return;

  // ── Population milestones ──────────────────────────────────────────────────
  if(typeof humans !== 'undefined'){
    const pop = typeof _cachedAlive !== 'undefined' ? _cachedAlive.length : humans.filter(h=>h.alive).length;
    const milestones = [50,100,250,500,1000,2000,5000,10000];
    for(const m of milestones){
      if(pop >= m && _eventFeedLastPopMilestone < m){
        _eventFeedLastPopMilestone = m;
        pushEventNotif('👥', `${m} almas en el mundo`, '#8ff', null, null);
      }
    }
  }

  // ── Active war count changes ───────────────────────────────────────────────
  if(typeof civilizations !== 'undefined'){
    let warCount = 0;
    for(const [,c] of civilizations) warCount += c.atWarWith ? c.atWarWith.size : 0;
    warCount = Math.floor(warCount / 2);
    if(warCount > _eventFeedLastWarCount && warCount > 0){
      // Find a war location
      let warTx = null, warTy = null;
      for(const [,c] of civilizations){
        if(c.atWarWith && c.atWarWith.size > 0 && c.leaderId != null){
          const leader = typeof _humanById !== 'undefined' ? _humanById.get(c.leaderId) : null;
          if(leader){ warTx = leader.tx; warTy = leader.ty; break; }
        }
      }
      pushEventNotif('⚔️', `${warCount} guerra${warCount>1?'s':''} activa${warCount>1?'s':''}`, '#f66', warTx, warTy);
    }
    _eventFeedLastWarCount = warCount;
  }

  // ── World events ───────────────────────────────────────────────────────────
  if(worldEvents.length <= _eventFeedLastEventCount){ return; }
  const newEvents = worldEvents.slice(0, worldEvents.length - _eventFeedLastEventCount);
  _eventFeedLastEventCount = worldEvents.length;
  for(const ev of newEvents.slice(0, 3)){
    const txt = ev.text||'';
    let icon='📜', color='#adf';
    if(txt.includes('guerra')||txt.includes('Guerra')||txt.includes('⚔️')){ icon='⚔️'; color='#f88'; }
    else if(txt.includes('pandemia')||txt.includes('🦠')){ icon='🦠'; color='#4f8'; }
    else if(txt.includes('nuclear')||txt.includes('☢️')){ icon='☢️'; color='#f60'; }
    else if(txt.includes('invento')||txt.includes('✨')||txt.includes('Oro')){ icon='✨'; color='#ffd700'; }
    else if(txt.includes('volcán')||txt.includes('terremoto')||txt.includes('🌋')){ icon='🌋'; color='#f84'; }
    else if(txt.includes('IA')||txt.includes('🤖')){ icon='🤖'; color='#a4f'; }
    else if(txt.includes('fundó')||txt.includes('Imperio')||txt.includes('🏛')){ icon='🏛'; color='#fda'; }
    else if(txt.includes('murió')||txt.includes('Rey')||txt.includes('👑')){ icon='💀'; color='#f88'; }
    else if(txt.includes('alianza')||txt.includes('paz')||txt.includes('🤝')){ icon='🤝'; color='#8f8'; }
    if(txt.length < 90) pushEventNotif(icon, txt.slice(0,70), color, ev.tx??null, ev.ty??null);
  }
}

// ── FPS counter (debug/perf indicator) ───────────────────────────────────────
function _drawFPSCounter(){
  const cw=_cw(), ch=_ch();
  _ctx.save();
  _ctx.font='bold 10px monospace';
  _ctx.textAlign='right';
  _ctx.textBaseline='top';
  const fps=Math.round(_fps);
  _ctx.fillStyle=fps>50?'rgba(100,255,100,0.5)':fps>30?'rgba(255,200,50,0.5)':'rgba(255,80,80,0.7)';
  _ctx.fillText(`${fps}fps`,cw-8,54);
  _ctx.restore();
}

// ── Clock HUD ────────────────────────────────────────────────────────────────
function _drawClock(){
  if(typeof getDayNightPhase === 'undefined' || typeof year === 'undefined') return;
  const phase = getDayNightPhase();
  const totalHours = phase * 24;
  const hh = Math.floor(totalHours) % 24;
  const mm = Math.floor((totalHours % 1) * 60);
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const mes  = typeof getSimMonth === 'function' ? MESES[getSimMonth()] : MESES[0];
  const dom  = typeof getSimDayOfMonth === 'function' ? getSimDayOfMonth() : 1;
  const timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  const dateStr = `${dom} ${mes} ${Math.floor(year)}`;

  const cw=_cw(), ch=_ch();
  _ctx.save();
  _ctx.font = 'bold 11px monospace';
  const tw = Math.max(_ctx.measureText(timeStr).width, _ctx.measureText(dateStr).width);
  const pw = tw + 14, ph = 30;
  const px = cw / 2 - pw / 2;
  const py = ch - ph - 6;
  _ctx.fillStyle = 'rgba(0,0,0,0.55)';
  _ctx.beginPath();
  _ctx.roundRect(px, py, pw, ph, 5);
  _ctx.fill();
  _ctx.fillStyle = '#e8e8ff';
  _ctx.textAlign = 'center';
  _ctx.fillText(timeStr, cw / 2, py + 12);
  _ctx.fillStyle = '#aaaacc';
  _ctx.font = '9px monospace';
  _ctx.fillText(dateStr, cw / 2, py + 24);
  _ctx.restore();
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
  // Rebuild less often at high pop — every 360 frames (~6s) instead of 180
  const rebuildInterval = (typeof _cachedAlive !== 'undefined' && _cachedAlive.length > 200) ? 360 : 180;
  if(_territoryDirty||_territoryFrame>=rebuildInterval){
    _territoryFrame=0;
    _rebuildTerritoryCanvas();
  }
  if(!_territoryCanvas)return;
  const alpha=Math.min(0.9,(cam.zoom-0.3)*0.7);
  _ctx.globalAlpha=alpha;
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
    'stadium','pyramid','great_wall','lighthouse','amphitheater','ziggurat','obelisk','theme_park']);
  const CELL=20;
  const cellMap=new Map();
  for(const s of structures){
    const ck=(Math.floor(s.tx/CELL))|(Math.floor(s.ty/CELL)<<12); // integer key — no string alloc
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
    // Size scales with structure count and tier — bigger halos for more drama
    const baseR=Math.min(420, c.count*18+80+c.maxTier*28);
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
  // Rebuild less often at high structure count
  const rebuildInterval = structures && structures.length > 500 ? 600 : 300;
  if(_cityGlowDirty||_cityGlowFrame>=rebuildInterval){
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
    if(screenX<-sr-200||screenX>_cw()+sr+200||screenY<-sr-200||screenY>_ch()+sr+200)continue;

    const pulse=0.7+Math.sin(t*1.5+g.cx*0.003)*0.3;

    // ── Outer soft halo — visible even at full zoom-out ───────────────────
    const grad=ctx.createRadialGradient(g.cx,g.cy,0,g.cx,g.cy,g.r);
    const baseAlpha=g.epic?0.38:0.24;
    grad.addColorStop(0,  _alphaColor(g.color, baseAlpha*pulse*1.6));
    grad.addColorStop(0.35,_alphaColor(g.color, baseAlpha*pulse*0.9));
    grad.addColorStop(0.7, _alphaColor(g.color, baseAlpha*pulse*0.3));
    grad.addColorStop(1,  _alphaColor(g.color, 0));
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.arc(g.cx,g.cy,g.r,0,Math.PI*2);
    ctx.fill();

    // ── Bright core dot — always visible from any zoom ────────────────────
    const coreR=Math.max(TILE*2, g.r*0.14);
    const coreGrad=ctx.createRadialGradient(g.cx,g.cy,0,g.cx,g.cy,coreR);
    const coreAlpha=g.epic?0.95:0.65;
    coreGrad.addColorStop(0,  _alphaColor('#ffffff', coreAlpha*pulse));
    coreGrad.addColorStop(0.25,_alphaColor(g.color,  coreAlpha*pulse));
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
      // Double ring — outer slow, inner fast
      const ringR1=g.r*0.38*(0.88+Math.sin(t*1.8+g.cx*0.005)*0.12);
      const ringR2=g.r*0.22*(0.85+Math.sin(t*3.2+g.cx*0.008)*0.15);
      ctx.save();
      ctx.globalAlpha=0.45*pulse;
      ctx.strokeStyle=g.color;
      ctx.lineWidth=Math.max(2, 4/cam.zoom);
      ctx.beginPath();
      ctx.arc(g.cx,g.cy,ringR1,0,Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha=0.25*pulse;
      ctx.lineWidth=Math.max(1, 2/cam.zoom);
      ctx.beginPath();
      ctx.arc(g.cx,g.cy,ringR2,0,Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Helper: convert any CSS color to rgba string with given alpha
// Also caches parsed r,g,b on the color string to avoid repeated parsing
const _colorRGBCache=new Map();
function _colorToRGB(color){
  if(_colorRGBCache.has(color))return _colorRGBCache.get(color);
  let rgb;
  if(color.startsWith('hsl(')){
    // Keep as-is for hsla conversion
    rgb=null;
  } else if(color.startsWith('#')&&color.length===7){
    rgb=[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];
  } else {
    rgb=null;
  }
  _colorRGBCache.set(color,rgb);
  return rgb;
}
function _alphaColor(color, alpha){
  if(color.startsWith('hsl(')){
    return color.replace('hsl(','hsla(').replace(')',`,${alpha})`);
  }
  const rgb=_colorToRGB(color);
  if(rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
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
  stadium:6,pyramid:8,great_wall:5,lighthouse:9,amphitheater:5,ziggurat:7,obelisk:6,theme_park:5,
};

function _drawStructures(){
  if(!structures||structures.length===0) return;
  const ctx=_ctx;
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-3, vy0=Math.floor(-cam.y/cam.zoom/TILE)-3;
  const vx1=vx0+Math.ceil(_cw()/cam.zoom/TILE)+6;
  const vy1=vy0+Math.ceil(_ch()/cam.zoom/TILE)+6;
  const showShadow=cam.zoom>0.8;
  const showHP=cam.zoom>0.8;
  const t=_waterPhase;
  const megaTypes=new Set(['stadium','pyramid','great_wall','lighthouse','amphitheater','ziggurat','obelisk','theme_park','colosseum']);
  const roadTypes=new Set(['road','highway','bridge','aqueduct','railway','subway']);

  // Count visible non-road structures — suppress labels/windows when city is dense
  let _visibleStructCount=0;
  for(const s of structures){
    if(roadTypes.has(s.type))continue;
    if(s.tx>=vx0&&s.tx<=vx1&&s.ty>=vy0&&s.ty<=vy1)_visibleStructCount++;
  }
  // Dense = many buildings on screen → skip expensive per-building text/windows
  const _densityHigh = _visibleStructCount > 80;
  const _densityMed  = _visibleStructCount > 40;

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

      // Nuclear silo — special pulsing red glow
      if(s.type==='nuclear_silo'){
        const pulse = 0.5 + Math.sin(_waterPhase*3 + s.tx)*0.5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, TILE*1.2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,60,0,${0.15*pulse})`;
        ctx.fill();
        ctx.restore();
      }

      const tier=s.type==='hut'||s.type==='camp'?(s.housingLevel||0):(STRUCTURE_HEIGHT[s.type]||0);
      const k = civ ? Math.min(99999, (civ.knowledge||0)) : 0;

      // Advanced civs get real geometry buildings
      if(k > 2000 && cam.zoom > 0.3){
        _drawAdvancedBuilding(ctx, s, px, py, civ, tier, t, showShadow, showHP, _densityHigh, _densityMed);
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
        // Emoji icon only at medium zoom AND low density
        if(cam.zoom>0.7 && !_densityMed){
          const iconScale=tier>=4?1.15:tier>=2?1.0:0.88;
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
function _drawAdvancedBuilding(ctx, s, px, py, civ, tier, t, showShadow, showHP, densityHigh, densityMed){
  const S=TILE;
  const civColor=civ?civ.color:'#aaaaff';
  const k=civ?(civ.knowledge||0):0;
  const pulse=0.7+Math.sin(t*1.8+s.tx*0.09+s.ty*0.07)*0.3;

  ctx.save();

  // Building footprint — significantly larger so buildings dwarf humans (r=TILE*0.9)
  // Tier 0 = 1.1 tiles wide, tier 8 = 2.1 tiles wide
  const hw=S*(0.55+Math.min(tier,8)*0.12);

  // Shadow — offset to give 3D feel
  if(showShadow&&tier>=1){
    ctx.globalAlpha=0.22;
    ctx.fillStyle='rgba(0,0,0,0.7)';
    const shadowOff=Math.min(tier*1.8, 10);
    ctx.fillRect(px-hw+shadowOff, py-hw+shadowOff, hw*2, hw*2);
  }

  // Base color by type
  let baseColor='#445566', roofColor='#334455', accentColor=civColor, windowColor=accentColor;
  switch(s.type){
    case 'palace':    baseColor='#7a5018'; roofColor='#c8a020'; accentColor='#ffd700'; windowColor='#ffe080'; break;
    case 'cathedral': baseColor='#b0b0c8'; roofColor='#6060a0'; accentColor='#d0c0ff'; windowColor='#c0a0ff'; break;
    case 'citadel':   baseColor='#505050'; roofColor='#303030'; accentColor='#aaaaaa'; windowColor='#cccccc'; break;
    case 'university':baseColor='#b07030'; roofColor='#703010'; accentColor='#ffa040'; windowColor='#ffcc80'; break;
    case 'observatory':baseColor='#203050';roofColor='#102030';accentColor='#60a0ff'; windowColor='#80c0ff'; break;
    case 'factory':   baseColor='#484848'; roofColor='#282828'; accentColor='#ff8800'; windowColor='#ffaa44'; break;
    case 'skyscraper':baseColor='#2a3a4a';roofColor='#1a2a3a';accentColor=civColor;   windowColor='#88ccff'; break;
    case 'megacity_core':baseColor='#1a2a3a';roofColor='#0a1a2a';accentColor='#00ffff';windowColor='#44ffff'; break;
    case 'arcology':  baseColor='#1e3a1e'; roofColor='#0e2a0e'; accentColor='#44ff88'; windowColor='#88ffaa'; break;
    case 'neural_hub':baseColor='#1e0e3a';roofColor='#0e0028';accentColor='#aa44ff';  windowColor='#cc88ff'; break;
    case 'market':    baseColor='#705010'; roofColor='#503000'; accentColor='#ffcc00'; windowColor='#ffe080'; break;
    case 'barracks':  baseColor='#501818'; roofColor='#380808'; accentColor='#ff4444'; windowColor='#ff8888'; break;
    case 'temple':    baseColor='#503060'; roofColor='#301840'; accentColor='#cc88ff'; windowColor='#ddaaff'; break;
    case 'granary':   baseColor='#705030'; roofColor='#503010'; accentColor='#ffcc80'; windowColor='#ffe0a0'; break;
    case 'harbor':    baseColor='#183050'; roofColor='#0a1830'; accentColor='#4488ff'; windowColor='#88aaff'; break;
    case 'powerplant':baseColor='#383818';roofColor='#282808';accentColor='#ffff00';  windowColor='#ffff88'; break;
    case 'airport':   baseColor='#383848'; roofColor='#282838'; accentColor='#88aaff'; windowColor='#aaccff'; break;
    case 'library':   baseColor='#604020'; roofColor='#402010'; accentColor='#ffaa44'; windowColor='#ffcc88'; break;
    case 'forge':     baseColor='#402020'; roofColor='#280808'; accentColor='#ff6600'; windowColor='#ff9944'; break;
    case 'academy':   baseColor='#204040'; roofColor='#102828'; accentColor='#44ffcc'; windowColor='#88ffdd'; break;
    case 'workshop':  baseColor='#503828'; roofColor='#382010'; accentColor='#cc8844'; windowColor='#ddaa66'; break;
    case 'colosseum': baseColor='#806030'; roofColor='#604010'; accentColor='#ffd060'; windowColor='#ffe090'; break;
    default: baseColor='#445566'; roofColor='#334455'; accentColor=civColor; windowColor=civColor;
  }

  // ── Main building body ────────────────────────────────────────────────────
  ctx.globalAlpha=0.95;

  // Outer wall (slightly larger, darker)
  ctx.fillStyle=roofColor;
  ctx.fillRect(px-hw, py-hw, hw*2, hw*2);

  // Inner body (main color, inset)
  const inset=Math.max(1.5, hw*0.12);
  ctx.fillStyle=baseColor;
  ctx.fillRect(px-hw+inset, py-hw+inset, (hw-inset)*2, (hw-inset)*2);

  // ── Roof structure — varies by building type ──────────────────────────────
  if(tier >= 2){
    const roofInset=hw*0.22;
    ctx.fillStyle=roofColor;
    ctx.fillRect(px-hw+roofInset, py-hw+roofInset, (hw-roofInset)*2, (hw-roofInset)*2);

    // Roof center detail (dome/flat top)
    if(s.type==='cathedral'||s.type==='temple'||s.type==='observatory'){
      // Dome — circle on top
      ctx.globalAlpha=0.9;
      ctx.fillStyle=accentColor;
      ctx.beginPath();
      ctx.arc(px, py, hw*0.38, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha=0.4;
      ctx.strokeStyle='rgba(255,255,255,0.5)';
      ctx.lineWidth=Math.max(0.5, S*0.04);
      ctx.stroke();
    } else if(s.type==='palace'||s.type==='citadel'){
      // Corner towers
      ctx.globalAlpha=0.9;
      ctx.fillStyle=roofColor;
      const towerR=hw*0.22;
      for(const [ox,oy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        ctx.fillRect(px+ox*(hw-towerR)-towerR, py+oy*(hw-towerR)-towerR, towerR*2, towerR*2);
        ctx.fillStyle=accentColor;
        ctx.globalAlpha=0.6;
        ctx.fillRect(px+ox*(hw-towerR)-towerR*0.5, py+oy*(hw-towerR)-towerR*0.5, towerR, towerR);
        ctx.fillStyle=roofColor;
        ctx.globalAlpha=0.9;
      }
    } else if(s.type==='factory'||s.type==='powerplant'){
      // Chimney stacks
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#333';
      const cw2=hw*0.18, ch2=hw*0.55;
      ctx.fillRect(px-hw*0.5-cw2/2, py-hw-ch2+inset, cw2, ch2);
      ctx.fillRect(px+hw*0.5-cw2/2, py-hw-ch2+inset, cw2, ch2);
    } else if(s.type==='skyscraper'||s.type==='megacity_core'||s.type==='arcology'||s.type==='neural_hub'){
      // Stepped top floors
      ctx.globalAlpha=0.85;
      ctx.fillStyle=baseColor;
      const step2=hw*0.28;
      ctx.fillRect(px-hw+step2, py-hw+step2, (hw-step2)*2, (hw-step2)*2);
      ctx.fillStyle=accentColor;
      ctx.globalAlpha=0.5;
      ctx.fillRect(px-hw*0.25, py-hw*0.25, hw*0.5, hw*0.5);
    }
  }

  // ── Windows grid — only at medium+ zoom, skip when very dense ────────────
  if(tier>=2 && cam.zoom>0.5 && !densityHigh){
    const cols=Math.max(2, Math.floor((hw*1.5)/(S*0.22)));
    const rows=Math.max(2, Math.floor((hw*1.5)/(S*0.22)));
    const ww=(hw*1.6/cols)*0.42, wh=(hw*1.6/rows)*0.42;
    const gridX=px-hw*0.8, gridY=py-hw*0.8;
    for(let row=0;row<rows;row++){
      for(let col=0;col<cols;col++){
        const wx=gridX+(col+0.5)*(hw*1.6/cols);
        const wy=gridY+(row+0.5)*(hw*1.6/rows);
        const lit=Math.sin(s.tx*7.3+s.ty*3.1+row*2.7+col*1.9+t*0.5)>0.05;
        ctx.globalAlpha=lit?0.88:0.18;
        ctx.fillStyle=lit?windowColor:'#0a0a14';
        ctx.fillRect(wx-ww/2, wy-wh/2, ww, wh);
      }
    }
  }

  // ── Accent border / outline ───────────────────────────────────────────────
  ctx.globalAlpha=0.75;
  ctx.strokeStyle=accentColor;
  ctx.lineWidth=Math.max(0.8, S*0.07);
  ctx.strokeRect(px-hw, py-hw, hw*2, hw*2);

  // ── Neon/energy glow for ultra-advanced structures ────────────────────────
  if(k>50000 && !densityHigh){
    ctx.globalAlpha=0.18*pulse;
    const grd=ctx.createRadialGradient(px,py,hw*0.5,px,py,hw*3.5);
    grd.addColorStop(0,accentColor);
    grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd;
    ctx.beginPath();ctx.arc(px,py,hw*3.5,0,Math.PI*2);ctx.fill();
  }

  // ── Spire/antenna for tall buildings ─────────────────────────────────────
  if(tier>=4 && cam.zoom>0.35 && !densityMed){
    ctx.globalAlpha=0.92;
    ctx.strokeStyle=accentColor;
    ctx.lineWidth=Math.max(0.8, S*0.06);
    const spireH=S*(0.5+tier*0.12);
    ctx.beginPath();
    ctx.moveTo(px, py-hw);
    ctx.lineTo(px, py-hw-spireH);
    ctx.stroke();
    // Blinking beacon
    const blink=(Math.sin(t*3.5+s.tx)>0)?0.95:0.15;
    ctx.globalAlpha=blink;
    ctx.fillStyle='#ff3333';
    ctx.beginPath();ctx.arc(px, py-hw-spireH, Math.max(1.2, S*0.09), 0, Math.PI*2);ctx.fill();
  }

  // ── HP bar ────────────────────────────────────────────────────────────────
  if(showHP && s.hp<s.maxHp){
    ctx.globalAlpha=1;
    const bw=hw*2;
    ctx.fillStyle='#300';ctx.fillRect(px-hw, py+hw+1, bw, 2.5);
    ctx.fillStyle='#f44';ctx.fillRect(px-hw, py+hw+1, bw*(s.hp/s.maxHp), 2.5);
  }

  ctx.globalAlpha=1;
  ctx.restore();

  // ── Label — only at close zoom, low density ───────────────────────────────
  if(cam.zoom>1.2 && cam.zoom<3.5 && s.label && !densityMed){
    ctx.save();
    ctx.globalAlpha=0.85;
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    const fs=Math.round(Math.max(7, Math.min(11, 9/cam.zoom)));
    ctx.font=`${fs}px sans-serif`;
    ctx.strokeStyle='rgba(0,0,0,0.9)';
    ctx.lineWidth=2.5/cam.zoom;
    ctx.strokeText(s.label, px, py-hw-3);
    ctx.fillStyle=accentColor;
    ctx.fillText(s.label, px, py-hw-3);
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
      // Live battle effects inside colosseum/stadium
      if(typeof _colosseumBattle !== 'undefined' && _colosseumBattle && _colosseumBattle.structureTx === s.tx && _colosseumBattle.structureTy === s.ty){
        const b = _colosseumBattle;
        const bpulse = 0.5 + Math.sin(t*8)*0.5;
        // Crowd roar ring
        ctx.globalAlpha = 0.18 * bpulse;
        ctx.strokeStyle = '#ffdd00';
        ctx.lineWidth = Math.max(2, S*0.15);
        ctx.beginPath(); ctx.ellipse(px,py,rx*0.95,ry*0.95,0,0,Math.PI*2); ctx.stroke();
        // Fighter A (red dot)
        const ax = px + Math.cos(t*2.1) * rx*0.35;
        const ay = py + Math.sin(t*2.1) * ry*0.35;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ff4444';
        ctx.beginPath(); ctx.arc(ax, ay, Math.max(2, S*0.18), 0, Math.PI*2); ctx.fill();
        // Fighter B (blue dot)
        const bx = px + Math.cos(t*2.1 + Math.PI) * rx*0.35;
        const by = py + Math.sin(t*2.1 + Math.PI) * ry*0.35;
        ctx.fillStyle = '#4488ff';
        ctx.beginPath(); ctx.arc(bx, by, Math.max(2, S*0.18), 0, Math.PI*2); ctx.fill();
        // Clash spark when close
        const dist = Math.hypot(ax-bx, ay-by);
        if(dist < S*0.5){
          ctx.globalAlpha = bpulse;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc((ax+bx)/2,(ay+by)/2, Math.max(1,S*0.12),0,Math.PI*2); ctx.fill();
        }
        // Battle label
        if(cam.zoom > 0.8 && b.nameA && b.nameB){
          ctx.globalAlpha = 0.9;
          ctx.font = `bold ${Math.max(7, Math.round(S*0.28))}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffdd00';
          ctx.fillText(`⚔️ ${b.nameA} vs ${b.nameB}`, px, py - ry*1.35);
        }
      }
      break;
    }

    case 'theme_park':{
      // Colorful park — ferris wheel + paths + attractions
      const r2 = S*1.6;
      // Ground (grass)
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#44bb44';
      ctx.beginPath(); ctx.ellipse(px,py,r2,r2*0.75,0,0,Math.PI*2); ctx.fill();
      // Paths (cross)
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#eecc88';
      ctx.lineWidth = Math.max(1.5, S*0.12);
      ctx.beginPath(); ctx.moveTo(px-r2*0.8,py); ctx.lineTo(px+r2*0.8,py); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px,py-r2*0.6); ctx.lineTo(px,py+r2*0.6); ctx.stroke();
      // Ferris wheel (spinning circle)
      const fwR = S*0.55;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff88cc';
      ctx.lineWidth = Math.max(1.5, S*0.1);
      ctx.beginPath(); ctx.arc(px, py-S*0.3, fwR, 0, Math.PI*2); ctx.stroke();
      // Spokes (rotating)
      const spokeAngle = t * 0.8;
      ctx.lineWidth = Math.max(1, S*0.06);
      ctx.strokeStyle = '#ffaadd';
      for(let i=0;i<6;i++){
        const a = spokeAngle + i*Math.PI/3;
        ctx.beginPath();
        ctx.moveTo(px, py-S*0.3);
        ctx.lineTo(px + Math.cos(a)*fwR, py-S*0.3 + Math.sin(a)*fwR);
        ctx.stroke();
      }
      // Gondolas on ferris wheel
      ctx.globalAlpha = 0.95;
      for(let i=0;i<6;i++){
        const a = spokeAngle + i*Math.PI/3;
        const gx = px + Math.cos(a)*fwR;
        const gy = py-S*0.3 + Math.sin(a)*fwR;
        const colors=['#ff4488','#44aaff','#ffdd00','#44ff88','#ff8844','#aa44ff'];
        ctx.fillStyle = colors[i];
        ctx.beginPath(); ctx.arc(gx,gy,Math.max(1.5,S*0.1),0,Math.PI*2); ctx.fill();
      }
      // Colorful tents
      const tentColors=['#ff4444','#4488ff','#ffdd00','#44cc44'];
      const tentPos=[[-0.55,-0.35],[0.55,-0.35],[-0.55,0.35],[0.55,0.35]];
      for(let i=0;i<4;i++){
        const tx2=px+tentPos[i][0]*r2*0.7, ty2=py+tentPos[i][1]*r2*0.55;
        ctx.globalAlpha=0.85;
        ctx.fillStyle=tentColors[i];
        ctx.beginPath();
        ctx.moveTo(tx2,ty2-S*0.28);
        ctx.lineTo(tx2-S*0.22,ty2+S*0.18);
        ctx.lineTo(tx2+S*0.22,ty2+S*0.18);
        ctx.closePath(); ctx.fill();
      }
      // Pulsing happy glow
      ctx.globalAlpha = 0.15 * pulse;
      ctx.fillStyle = '#ffaaff';
      ctx.beginPath(); ctx.ellipse(px,py,r2*1.3,r2,0,0,Math.PI*2); ctx.fill();
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

    case 'colosseum':{
      // Oval colosseum — Roman architecture top-down view
      const rx=S*2.2, ry=S*1.5;
      // Outer stone wall (thick)
      ctx.globalAlpha=0.95;
      ctx.strokeStyle='#c8a060';
      ctx.lineWidth=Math.max(3, S*0.32);
      ctx.beginPath();
      ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2);
      ctx.stroke();
      // Second inner wall
      ctx.strokeStyle='#a08040';
      ctx.lineWidth=Math.max(2, S*0.18);
      ctx.beginPath();
      ctx.ellipse(px,py,rx*0.72,ry*0.72,0,0,Math.PI*2);
      ctx.stroke();
      // Arena floor (sand)
      ctx.globalAlpha=0.9;
      ctx.fillStyle='#d4a84a';
      ctx.beginPath();
      ctx.ellipse(px,py,rx*0.48,ry*0.48,0,0,Math.PI*2);
      ctx.fill();
      // Arena cross lines
      ctx.globalAlpha=0.35;
      ctx.strokeStyle='#a07830';
      ctx.lineWidth=Math.max(0.5, S*0.05);
      ctx.beginPath();ctx.moveTo(px-rx*0.44,py);ctx.lineTo(px+rx*0.44,py);ctx.stroke();
      ctx.beginPath();ctx.moveTo(px,py-ry*0.44);ctx.lineTo(px,py+ry*0.44);ctx.stroke();
      // Seating rows (arcs between walls)
      ctx.globalAlpha=0.3;
      ctx.strokeStyle='#b09050';
      ctx.lineWidth=Math.max(0.5, S*0.04);
      for(let row=0; row<4; row++){
        const f=0.52+row*0.055;
        ctx.beginPath();
        ctx.ellipse(px,py,rx*f,ry*f,0,0,Math.PI*2);
        ctx.stroke();
      }
      // Entrance gates (4 openings)
      ctx.globalAlpha=0.7;
      ctx.fillStyle='#1a1008';
      const gateW=S*0.22, gateH=S*0.18;
      ctx.fillRect(px-gateW/2, py-ry-gateH/2, gateW, gateH); // top
      ctx.fillRect(px-gateW/2, py+ry-gateH/2, gateW, gateH); // bottom
      ctx.fillRect(px-rx-gateH/2, py-gateW/2, gateH, gateW); // left
      ctx.fillRect(px+rx-gateH/2, py-gateW/2, gateH, gateW); // right
      // Civ color tint on stands
      ctx.globalAlpha=0.18*pulse;
      ctx.fillStyle=civColor;
      ctx.beginPath();
      ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2);
      ctx.fill();
      // Active battle glow
      const isActive = _colosseumBattle && _colosseumBattle.structureTx===s.tx && _colosseumBattle.structureTy===s.ty;
      if(isActive){
        ctx.globalAlpha=0.35*(0.5+Math.sin(_waterPhase*8)*0.5);
        ctx.strokeStyle='#ffd700';
        ctx.lineWidth=Math.max(2, S*0.2);
        ctx.beginPath();
        ctx.ellipse(px,py,rx*1.08,ry*1.08,0,0,Math.PI*2);
        ctx.stroke();
      }
      // Outer glow
      ctx.globalAlpha=0.15*pulse;
      ctx.fillStyle='#ffd060';
      ctx.beginPath();
      ctx.ellipse(px,py,rx*1.4,ry*1.4,0,0,Math.PI*2);
      ctx.fill();
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
  const vx1=vx0+Math.ceil(_cw()/cam.zoom/TILE)+4;
  const vy1=vy0+Math.ceil(_ch()/cam.zoom/TILE)+4;
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
  const vx1=vx0+Math.ceil(_cw()/cam.zoom/TILE)+4;
  const vy1=vy0+Math.ceil(_ch()/cam.zoom/TILE)+4;
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
// ── Human action icon map ─────────────────────────────────────────────────────
const ACTION_ICONS = {
  'Descansando':'😴','Explorando':'🗺️','Recolectando':'🌿','Cazando':'🏹',
  'Durmiendo':'💤','Construyendo':'🔨','Socializando':'💬','Pescando':'🎣',
  'Minando':'⛏️','Reproduciéndose':'💕','Cultivando':'🌾','Fabricando':'⚙️',
  'Curando':'💊','Liderando':'📣','Migrando':'🚶','Enfermo':'🤒',
  'Destruyendo':'🔥','Fortificando':'🛡️','Patrullando':'👁️','Reparando':'🔧',
};

// ── Human movement trail (for followed/selected human) ────────────────────────
const _humanTrail = new Map(); // humanId → [{px,py,age}]
const TRAIL_MAX = 18;
const TRAIL_FADE_SEC = 2.2;

function _updateHumanTrail(h, dtSec){
  if(!h || !h.alive) return;
  let trail = _humanTrail.get(h.id);
  if(!trail){ trail = []; _humanTrail.set(h.id, trail); }
  const last = trail[trail.length-1];
  if(!last || Math.hypot(h.px-last.px, h.py-last.py) > TILE*0.4){
    trail.push({px:h.px, py:h.py, age:0});
    if(trail.length > TRAIL_MAX) trail.shift();
  }
  for(const p of trail) p.age += dtSec;
  while(trail.length > 0 && trail[0].age > TRAIL_FADE_SEC) trail.shift();
}

function _drawHumans(){
  const r=Math.max(2.5, TILE*0.45); // humans smaller relative to buildings
  _ctx.textAlign='center';

  const vx0=(-cam.x/cam.zoom)-r*3, vy0=(-cam.y/cam.zoom)-r*3;
  const vx1=vx0+_cw()/cam.zoom+r*6, vy1=vy0+_ch()/cam.zoom+r*6;
  const showBars=cam.zoom>0.9;
  const showWeapon=cam.zoom>1.5;
  const showRings=cam.zoom>0.7;
  const showActionBubble=cam.zoom>1.2;
  const showName=cam.zoom>1.8;
  const dotOnly=cam.zoom<0.5;
  const minimalMode=cam.zoom<0.8;

  const drawList = (typeof _cachedAlive !== 'undefined' && _cachedAlive.length > 0) ? _cachedAlive : humans;

  let _visibleHumanCount=0;
  for(const h of drawList){ if(h.alive&&h.px>=vx0&&h.px<=vx1&&h.py>=vy0&&h.py<=vy1)_visibleHumanCount++; }
  const _humanDense = _visibleHumanCount > 120;
  const _humanVeryDense = _visibleHumanCount > 300;

  const followedId = (typeof _autoFollowId !== 'undefined') ? _autoFollowId : null;

  for(const h of drawList){
    if(!h.alive)continue;
    const px=h.px, py=h.py;
    if(px<vx0||px>vx1||py<vy0||py>vy1)continue;

    if(dotOnly){
      _ctx.beginPath();
      _ctx.arc(px,py,Math.max(1.5,r*0.5),0,Math.PI*2);
      _ctx.fillStyle=h.color;
      _ctx.fill();
      continue;
    }

    const civ=typeof civilizations!=='undefined'&&h.civId!=null?civilizations.get(h.civId):null;

    // Movement trail for followed/selected human
    if((h.id===followedId||h.selected)&&!_humanVeryDense){
      const trail=_humanTrail.get(h.id);
      if(trail&&trail.length>1){
        _ctx.save();
        for(let i=1;i<trail.length;i++){
          const t0=trail[i-1], t1=trail[i];
          const prog=i/trail.length;
          const alpha=prog*0.55*(1-t1.age/TRAIL_FADE_SEC);
          _ctx.globalAlpha=Math.max(0,alpha);
          _ctx.strokeStyle=h.color;
          _ctx.lineWidth=Math.max(1,(r*0.5)*prog);
          _ctx.lineCap='round';
          _ctx.beginPath();
          _ctx.moveTo(t0.px,t0.py);
          _ctx.lineTo(t1.px,t1.py);
          _ctx.stroke();
        }
        _ctx.globalAlpha=1;
        _ctx.restore();
      }
    }

    // Civ ring
    if(showRings&&!_humanVeryDense&&civ){
      _ctx.beginPath();
      _ctx.arc(px,py,r+2,0,Math.PI*2);
      _ctx.strokeStyle=civ.color;
      _ctx.lineWidth=1.5;
      _ctx.stroke();
    }

    // Prodigy aura
    if(h.isProdigy&&!minimalMode&&!_humanVeryDense){
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

    // Selected glow — pulsing
    if(h.selected){
      const pulse=0.6+Math.sin(_waterPhase*5+h.id)*0.4;
      _ctx.beginPath();
      _ctx.arc(px,py,r+7,0,Math.PI*2);
      _ctx.fillStyle=`rgba(255,255,255,${0.15*pulse})`;
      _ctx.fill();
      _ctx.beginPath();
      _ctx.arc(px,py,r+5,0,Math.PI*2);
      _ctx.strokeStyle=`rgba(255,255,255,${0.7*pulse})`;
      _ctx.lineWidth=2;
      _ctx.stroke();
    }

    // Body
    _ctx.beginPath();
    _ctx.arc(px,py,r,0,Math.PI*2);
    _ctx.fillStyle=h.color;
    _ctx.fill();
    // Outline for contrast
    _ctx.beginPath();
    _ctx.arc(px,py,r,0,Math.PI*2);
    _ctx.strokeStyle='rgba(0,0,0,0.4)';
    _ctx.lineWidth=1;
    _ctx.stroke();

    if(!minimalMode){
      _ctx.beginPath();
      _ctx.arc(px,py,r*0.38,0,Math.PI*2);
      _ctx.fillStyle=h.gender==='F'?'#ffaacc':'#aaccff';
      _ctx.fill();
    }

    // War flash
    if(h._warFlash>0){
      h._warFlash--;
      _ctx.beginPath();
      _ctx.arc(px,py,r+4,0,Math.PI*2);
      _ctx.strokeStyle='rgba(255,50,50,0.85)';
      _ctx.lineWidth=2.5;
      _ctx.stroke();
    }

    // Health + hunger bars
    if(showBars){
      const bw=TILE*1.6, bx=px-bw/2, by=py-r-8;
      _ctx.fillStyle='rgba(0,0,0,0.6)';
      _ctx.fillRect(bx-1,by-1,bw+2,5);
      _ctx.fillStyle=h.health>60?'#3d3':h.health>30?'#fa0':'#f44';
      _ctx.fillRect(bx,by,bw*(h.health/100),3);
      if(h.hunger>40){
        _ctx.fillStyle='rgba(0,0,0,0.5)';
        _ctx.fillRect(bx-1,by+4,bw+2,4);
        _ctx.fillStyle=`rgba(255,${Math.round(140*(1-h.hunger/100))},0,0.85)`;
        _ctx.fillRect(bx,by+5,bw*(h.hunger/100),2);
      }
    }

    // Status icons above head
    if(showRings&&!_humanDense){
      let iconY=py-r-4;
      if(h.isProdigy&&h.prodigyType){
        _ctx.font=`${Math.round(r*1.3)}px serif`;
        _ctx.fillText(h.prodigyType.icon,px,iconY);
        iconY-=r*1.4;
      } else if(h.isLeader){
        _ctx.font=`${Math.round(r*1.1)}px serif`;
        _ctx.fillText('👑',px,iconY);
        iconY-=r*1.2;
      }
      if(h.sick){
        _ctx.font=`${Math.round(r*0.9)}px serif`;
        _ctx.fillText('🤒',px+r+1,py-r);
      }
    }

    if(showWeapon&&h.weaponTier>0&&!_humanDense){
      const wi=typeof WEAPON_ICONS!=='undefined'?WEAPON_ICONS:['','🗡️','🪓','⚔️','🔱','🛡️','💣'];
      const icon=wi[Math.min(h.weaponTier,wi.length-1)]||'⚔️';
      _ctx.font=`${Math.round(r*0.85)}px serif`;
      _ctx.fillText(icon,px-r-2,py-r);
    }

    // Soldier formation ring
    if(h.isSoldier&&showRings){
      if(civ&&civ.atWarWith&&civ.atWarWith.size>0){
        _ctx.strokeStyle='rgba(255,80,80,0.7)';
        _ctx.lineWidth=1.5;
        _ctx.strokeRect(px-r-2,py-r-2,(r+2)*2,(r+2)*2);
      }
    }

    // Veteran glow
    if(h._veteranLevel>=2&&showRings&&!minimalMode){
      const pulse=0.5+Math.sin(_waterPhase*3+h.id*0.7)*0.5;
      _ctx.beginPath();
      _ctx.arc(px,py,r+6+pulse*3,0,Math.PI*2);
      _ctx.strokeStyle='rgba(255,215,0,0.6)';
      _ctx.lineWidth=2;
      _ctx.globalAlpha=0.6+pulse*0.3;
      _ctx.stroke();
      _ctx.globalAlpha=1;
    }

    // Golden age shimmer
    if(typeof _goldenAgeCivs!=='undefined'&&h.civId!=null&&_goldenAgeCivs.has(h.civId)&&showRings&&!minimalMode){
      const pulse=0.4+Math.sin(_waterPhase*2+h.id*0.3)*0.4;
      _ctx.beginPath();
      _ctx.arc(px,py,r+4,0,Math.PI*2);
      _ctx.strokeStyle=`rgba(255,215,0,${0.3+pulse*0.3})`;
      _ctx.lineWidth=1;
      _ctx.stroke();
    }

    // Transport icon
    if(showWeapon&&h.transportTier>=1&&!_humanDense){
      const ti=['','⛵','🐎','🚂','🚗','✈️','🚁','🚀','🛸','🌌'];
      const icon=ti[Math.min(h.transportTier,9)];
      if(icon){
        _ctx.font=`${Math.round(r*0.85)}px serif`;
        _ctx.fillText(icon,px+r+2,py-r);
      }
    }

    // Water ripple
    if(h._onWater&&showRings&&!minimalMode){
      _ctx.beginPath();
      _ctx.arc(px,py,r+3+Math.sin(_waterPhase*5+h.id)*2,0,Math.PI*2);
      _ctx.strokeStyle='rgba(80,160,255,0.5)';
      _ctx.lineWidth=1.5;
      _ctx.stroke();
    }

    // Action bubble — what is this human doing right now
    if(showActionBubble&&!_humanDense&&h.action){
      const actionIcon=ACTION_ICONS[h.action]||'❓';
      const bubbleX=px+r+3, bubbleY=py+r+3;
      _ctx.save();
      _ctx.font=`${Math.round(r*1.05)}px serif`;
      _ctx.textAlign='center';
      _ctx.textBaseline='middle';
      _ctx.fillStyle='rgba(0,0,0,0.55)';
      _ctx.beginPath();
      _ctx.arc(bubbleX,bubbleY,r*0.75,0,Math.PI*2);
      _ctx.fill();
      _ctx.fillText(actionIcon,bubbleX,bubbleY);
      _ctx.restore();
    }

    // Name label
    if(showName&&!_humanDense){
      const firstName=h.name.split(' ')[0];
      _ctx.save();
      _ctx.font=`bold ${Math.round(r*0.85)}px monospace`;
      _ctx.textAlign='center';
      _ctx.textBaseline='bottom';
      const tw=_ctx.measureText(firstName).width;
      const lx=px, ly=py-r-(showBars?12:5);
      _ctx.fillStyle='rgba(0,0,0,0.65)';
      _ctx.beginPath();
      _ctx.roundRect(lx-tw/2-3,ly-r*0.9,tw+6,r*0.95,3);
      _ctx.fill();
      _ctx.fillStyle=civ?civ.color:'#e8d5a3';
      _ctx.fillText(firstName,lx,ly);
      _ctx.restore();
    } else if(h.selected&&!showName){
      // Always show name for selected human even at lower zoom
      const firstName=h.name.split(' ')[0];
      _ctx.save();
      _ctx.font=`bold ${Math.round(r*0.9)}px monospace`;
      _ctx.textAlign='center';
      _ctx.textBaseline='bottom';
      const tw=_ctx.measureText(firstName).width;
      const lx=px, ly=py-r-(showBars?12:5);
      _ctx.fillStyle='rgba(0,0,0,0.7)';
      _ctx.beginPath();
      _ctx.roundRect(lx-tw/2-3,ly-r*0.95,tw+6,r,3);
      _ctx.fill();
      _ctx.fillStyle='#fff';
      _ctx.fillText(firstName,lx,ly);
      _ctx.restore();
    }
  }
}

// ── Intelligence curve graph ──────────────────────────────────────────────────
let _intelHistory=[];
let _intelHistoryTimer=0;
let _intelLastSampleYear=-999;

function _drawIntelligenceCurve(){
  if(typeof _intelModifier==='undefined')return;
  // Sample based on year intervals (every 50 years) — speed-independent history
  if(typeof year!=='undefined'){
    const sampleYear=Math.floor(year/50)*50;
    if(sampleYear!==_intelLastSampleYear){
      _intelLastSampleYear=sampleYear;
      _intelHistory.push(_intelModifier);
      if(_intelHistory.length>80)_intelHistory.shift();
    }
  }
  if(_intelHistory.length<2)return;

  const ctx=_ctx;
  const gw=160,gh=50;
  // Bottom-right corner, above the world events panel (events panel is ~7*18+20 = 146px tall)
  const gx=_cw()-gw-18;
  const gy=_ch()-gh-60-20; // bottom-right corner, above clock
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
      position:fixed;bottom:10px;left:210px;width:180px;max-height:280px;
      background:rgba(4,10,22,0.92);border:1px solid rgba(255,255,255,0.1);
      border-radius:8px;z-index:25;display:flex;flex-direction:column;
      font-family:'Courier New',monospace;font-size:10px;color:#ddd;
      backdrop-filter:blur(6px);overflow:hidden;
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
    ['🌸','Bosque Sakura'],['🌴','Selva Tropical'],['🏔','Montaña'],['🌋','Volcánico'],
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
  const maxShow=6;
  const events=worldEvents.slice(0,maxShow);
  const lh=20, pad=10, bw=320;
  const bh=events.length*lh+pad*2+14;
  const x=_cw()-bw-14, y=_ch()-14;

  ctx.save();

  // Background
  ctx.fillStyle='rgba(3,8,20,0.88)';
  _roundRect(ctx,x,y-bh,bw,bh,9);
  ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.07)';
  ctx.lineWidth=1;
  _roundRect(ctx,x,y-bh,bw,bh,9);
  ctx.stroke();

  // Title bar
  ctx.fillStyle='rgba(255,255,255,0.04)';
  ctx.fillRect(x,y-bh,bw,18);
  ctx.font='bold 9px monospace';
  ctx.fillStyle='#445';
  ctx.textAlign='left';
  ctx.textBaseline='middle';
  ctx.fillText('EVENTOS RECIENTES',x+pad,y-bh+9);

  // Events
  ctx.font='11px sans-serif';
  events.forEach((ev,i)=>{
    const ly=y-bh+18+pad+(i+0.75)*lh;
    const age=i/maxShow;
    const alpha=1-age*0.55;
    ctx.globalAlpha=alpha;

    let color='#adf';
    const txt=ev.text||'';
    if(txt.includes('guerra')||txt.includes('Guerra')||txt.includes('batalla')) color='#f88';
    else if(txt.includes('pandemia')||txt.includes('Epidemia')||txt.includes('Fiebre')||txt.includes('Cólera')) color='#8f8';
    else if(txt.includes('terremoto')||txt.includes('tsunami')||txt.includes('volcán')||txt.includes('Volcán')) color='#f84';
    else if(txt.includes('Oro')||txt.includes('invento')||txt.includes('Invento')||txt.includes('descubrimiento')) color='#ffd700';
    else if(txt.includes('nuclear')||txt.includes('Nuclear')) color='#ff4400';
    else if(txt.includes('IA')||txt.includes('Singularidad')) color='#aa44ff';
    else if(txt.includes('hambruna')||txt.includes('Hambruna')) color='#cc8800';
    else if(txt.includes('alianza')||txt.includes('paz')||txt.includes('Alianza')) color='#4af';
    else if(txt.includes('líder')||txt.includes('Líder')||txt.includes('rey')||txt.includes('Rey')) color='#ffd700';

    // Year badge
    ctx.fillStyle='rgba(255,255,255,0.06)';
    ctx.fillRect(x+pad,ly-8,40,14);
    ctx.fillStyle='#556';
    ctx.font='8px monospace';
    ctx.textAlign='left';
    ctx.fillText(String(ev.year||'?'),x+pad+2,ly+1);

    // Event text
    ctx.fillStyle=color;
    ctx.font='11px sans-serif';
    ctx.textAlign='left';
    let displayText=txt;
    const maxW=bw-pad*2-48;
    while(ctx.measureText(displayText).width>maxW&&displayText.length>10){
      displayText=displayText.slice(0,-2)+'…';
    }
    ctx.fillText(displayText,x+pad+46,ly+1);
  });

  ctx.globalAlpha=1;
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
// Biome IDs for fast lookup (avoid getCell() proxy allocation per tile)
const _BID_GLACIER      = BIOME_NAMES.indexOf('glacier');
const _BID_TUNDRA       = BIOME_NAMES.indexOf('tundra');
const _BID_CORAL        = BIOME_NAMES.indexOf('coral_reef');
const _BID_VOLCANIC     = BIOME_NAMES.indexOf('volcanic');
const _BID_MANGROVE     = BIOME_NAMES.indexOf('mangrove');
const _BID_BAMBOO       = BIOME_NAMES.indexOf('bamboo_forest');
const _BID_SAKURA       = BIOME_NAMES.indexOf('sakura_forest');

function _drawBiomeEffects(){
  if(cam.zoom < 0.5) return;
  if(!_tBiomeId) return; // terrain not generated yet
  const ctx = _ctx;
  const t = _waterPhase;
  const vx0=Math.max(0,Math.floor(-cam.x/cam.zoom/TILE)-1);
  const vy0=Math.max(0,Math.floor(-cam.y/cam.zoom/TILE)-1);
  const vx1=Math.min(WORLD_W-1, vx0+Math.ceil(_cw()/cam.zoom/TILE)+2);
  const vy1=Math.min(WORLD_H-1, vy0+Math.ceil(_ch()/cam.zoom/TILE)+2);

  // Adaptive step: more tiles = bigger step
  const visW = vx1-vx0, visH = vy1-vy0;
  const step = (visW*visH > 8000) ? 4 : (visW*visH > 3000) ? 3 : cam.zoom > 1.5 ? 1 : 2;

  ctx.save();
  for(let ty=vy0; ty<=vy1; ty+=step){
    for(let tx=vx0; tx<=vx1; tx+=step){
      const bid = _tBiomeId[ty*WORLD_W+tx];
      if(bid === undefined) continue;
      const px = tx*TILE+TILE/2, py = ty*TILE+TILE/2;
      const tileW = TILE*step, tileH = TILE*step;

      if(bid === _BID_GLACIER){
        const g = 0.05 + Math.sin(t*1.5 + tx*0.3 + ty*0.2)*0.04;
        ctx.globalAlpha = g;
        ctx.fillStyle = '#aaddff';
        ctx.fillRect(tx*TILE, ty*TILE, tileW, tileH);
      } else if(bid === _BID_TUNDRA){
        if(Math.sin(t*2 + tx*0.7 + ty*0.5) > 0.85){
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px + Math.sin(t+tx)*3, py + ((t*20 + tx*7) % TILE) - TILE/2, 1.2, 0, Math.PI*2);
          ctx.fill();
        }
      } else if(bid === _BID_CORAL){
        const pulse = 0.06 + Math.sin(t*2.5 + tx*0.4 + ty*0.6)*0.04;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#00ffcc';
        ctx.fillRect(tx*TILE, ty*TILE, tileW, tileH);
      } else if(bid === _BID_VOLCANIC){
        if(Math.sin(t*3 + tx*0.9 + ty*1.1) > 0.7){
          ctx.globalAlpha = 0.12 + Math.random()*0.08;
          ctx.fillStyle = '#ff4400';
          ctx.fillRect(tx*TILE, ty*TILE, tileW, tileH);
        }
      } else if(bid === _BID_MANGROVE){
        const r = 0.04 + Math.sin(t*1.8 + tx*0.5)*0.03;
        ctx.globalAlpha = r;
        ctx.fillStyle = '#44aa44';
        ctx.fillRect(tx*TILE, ty*TILE, tileW, tileH);
      } else if(bid === _BID_BAMBOO){
        if(Math.sin(t + tx*0.3) > 0.6){
          ctx.globalAlpha = 0.06;
          ctx.fillStyle = '#aaff44';
          ctx.fillRect(tx*TILE, ty*TILE, tileW, tileH);
        }
      } else if(bid === _BID_SAKURA){
        // Tinte rosado suave
        ctx.globalAlpha = 0.07 + Math.sin(t*1.5+tx*0.2)*0.03;
        ctx.fillStyle = '#ffaacc';
        ctx.fillRect(tx*TILE, ty*TILE, tileW, tileH);
        // Pétalos flotantes (solo a zoom cercano)
        if(cam.zoom > 0.8 && Math.sin(t*1.2 + tx*0.4 + ty*0.3) > 0.3){
          const pp = (t*1.2 + tx*0.4 + ty*0.3) % (Math.PI*2);
          const ox = Math.sin(pp*2.1)*TILE*0.6;
          const oy = ((t*15 + tx*5) % (TILE*2)) - TILE;
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#ffb8d0';
          ctx.beginPath();
          ctx.arc(px+ox, py+oy, TILE*0.14, 0, Math.PI*2);
          ctx.fill();
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
    const vx1=vx0+Math.ceil(_cw()/cam.zoom/TILE)+4;
    const vy1=vy0+Math.ceil(_ch()/cam.zoom/TILE)+4;
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
      const northH = _ch() * gl * 0.4;
      const gradN = ctx.createLinearGradient(0,0,0,northH);
      gradN.addColorStop(0, `rgba(200,230,255,${iceAlpha})`);
      gradN.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = gradN;
      ctx.fillRect(0, 0, _cw(), northH);
      // polo sur
      const gradS = ctx.createLinearGradient(0,_ch(),0,_ch() - northH);
      gradS.addColorStop(0, `rgba(200,230,255,${iceAlpha})`);
      gradS.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = gradS;
      ctx.fillRect(0, _ch() - northH, _cw(), northH);
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
      const wx1 = wx0 + _cw()/cam.zoom, wy1 = wy0 + _ch()/cam.zoom;
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
  const x = _cw()/2, y = 108;
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
  const x = _cw()/2, y = 128;
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
  const x = _cw()/2, y = 148;
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
  const x = _cw()/2, y = 168;
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

// ── Nuclear HUD indicator ─────────────────────────────────────────────────────
function _drawNuclearHUD(){
  if(typeof structures === 'undefined') return;
  const silos = structures.filter(s => s.type === 'nuclear_silo');
  if(silos.length === 0) return;
  const ctx = _ctx;
  const x = _cw()/2, y = 188;
  const pulse = 0.7 + Math.sin(_waterPhase * 4) * 0.3;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 12px monospace';
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 3;
  const txt = `☢️ ${silos.length} Silo${silos.length>1?'s':''} Nuclear${silos.length>1?'es':''} activo${silos.length>1?'s':''}`;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = `rgba(255,${Math.floor(80*pulse)},0,${0.7+pulse*0.3})`;
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
      _waterTiles.push({tx,ty,phase:(tx+ty)*0.15,deep:cell.biome==='deep_sea'});
  }
}

function _drawWaterShimmer(){
  if(!_waterTiles) return;
  const x0=Math.floor(-cam.x/cam.zoom/TILE)-1, y0=Math.floor(-cam.y/cam.zoom/TILE)-1;
  const x1=x0+Math.ceil(_cw()/cam.zoom/TILE)+2;
  const y1=y0+Math.ceil(_ch()/cam.zoom/TILE)+2;
  const t=_waterPhase;

  // Layer 1 — bright shimmer lines
  _ctx.fillStyle='rgba(120,185,255,0.10)';
  for(const w of _waterTiles){
    if(w.tx<x0||w.tx>x1||w.ty<y0||w.ty>y1) continue;
    const s=Math.sin(t*1.4+w.phase);
    if(s>0.45){
      const width=Math.round((s-0.45)*TILE*1.8);
      _ctx.fillRect(w.tx*TILE+1, w.ty*TILE+TILE*0.3, Math.min(TILE-2,width), 2);
    }
  }
  // Layer 2 — secondary shimmer
  _ctx.fillStyle='rgba(200,235,255,0.07)';
  for(const w of _waterTiles){
    if(w.tx<x0||w.tx>x1||w.ty<y0||w.ty>y1) continue;
    const s=Math.sin(t*0.9+w.phase+1.8);
    if(s>0.55){
      _ctx.fillRect(w.tx*TILE+2, w.ty*TILE+TILE*0.65, TILE-4, 1);
    }
  }
  // Layer 3 — deep water tint for deep_sea tiles
  if(cam.zoom>0.6){
    _ctx.fillStyle='rgba(0,20,60,0.08)';
    for(const w of _waterTiles){
      if(!w.deep) continue;
      if(w.tx<x0||w.tx>x1||w.ty<y0||w.ty>y1) continue;
      _ctx.fillRect(w.tx*TILE, w.ty*TILE, TILE, TILE);
    }
  }
}

// Atmospheric vignette at map edges — makes the world feel bounded and epic
function _drawMapVignette(){
  const W=WORLD_W*TILE, H=WORLD_H*TILE;
  const ctx=_ctx;
  const edgeW=Math.min(W,H)*0.09;
  ctx.save();
  // Top edge
  const gt=ctx.createLinearGradient(0,0,0,edgeW);
  gt.addColorStop(0,'rgba(0,0,0,0.72)'); gt.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gt; ctx.fillRect(0,0,W,edgeW);
  // Bottom edge
  const gb=ctx.createLinearGradient(0,H-edgeW,0,H);
  gb.addColorStop(0,'rgba(0,0,0,0)'); gb.addColorStop(1,'rgba(0,0,0,0.72)');
  ctx.fillStyle=gb; ctx.fillRect(0,H-edgeW,W,edgeW);
  // Left edge
  const gl=ctx.createLinearGradient(0,0,edgeW,0);
  gl.addColorStop(0,'rgba(0,0,0,0.72)'); gl.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gl; ctx.fillRect(0,0,edgeW,H);
  // Right edge
  const gr=ctx.createLinearGradient(W-edgeW,0,W,0);
  gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(0,0,0,0.72)');
  ctx.fillStyle=gr; ctx.fillRect(W-edgeW,0,edgeW,H);
  ctx.restore();
}

// ── Trade Routes ──────────────────────────────────────────────────────────────
function _drawTradeRoutes(){
  if(cam.zoom < 0.4) return;
  if(typeof getActiveTradeRoutes === 'undefined') return;
  const routes = getActiveTradeRoutes();
  if(!routes || routes.length === 0) return;
  const ctx = _ctx;
  ctx.save();
  // Find leader positions for each civ as route endpoints
  const civPos = new Map();
  if(typeof civilizations !== 'undefined'){
    for(const [,civ] of civilizations){
      if(civ.population === 0) continue;
      const leader = typeof _hById !== 'undefined' ? _hById(civ.leaderId) : null;
      if(leader && leader.alive){
        civPos.set(civ.id, {px: leader.px, py: leader.py, color: civ.color});
      }
    }
  }
  const t = _waterPhase;
  for(const route of routes){
    const posA = civPos.get(route.civA);
    const posB = civPos.get(route.civB);
    if(!posA || !posB) continue;
    const dx = posB.px - posA.px, dy = posB.py - posA.py;
    const dist = Math.hypot(dx, dy);
    if(dist < 2 || dist > WORLD_W * TILE * 0.6) continue;
    // Animated dashed line
    const alpha = 0.25 + Math.sin(t * 2) * 0.1;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = route.good ? '#f0c040' : '#40c0f0';
    ctx.lineWidth = Math.max(0.5, 1.5 / cam.zoom);
    ctx.setLineDash([TILE * 0.8, TILE * 0.5]);
    ctx.lineDashOffset = -t * TILE * 3;
    ctx.beginPath();
    ctx.moveTo(posA.px, posA.py);
    ctx.lineTo(posB.px, posB.py);
    ctx.stroke();
    ctx.setLineDash([]);
    // Trade good icon at midpoint
    if(cam.zoom > 0.8 && route.good){
      const mx = (posA.px + posB.px) / 2, my = (posA.py + posB.py) / 2;
      ctx.globalAlpha = 0.9;
      ctx.font = `${Math.round(TILE * 0.9)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(route.good.icon, mx, my);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Army Formations ───────────────────────────────────────────────────────────
function _drawArmyFormations(){
  if(cam.zoom < 0.5) return;
  if(typeof _armyRallyPoints === 'undefined') return;
  const ctx = _ctx;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for(const [civId, rally] of _armyRallyPoints){
    const civ = typeof civilizations !== 'undefined' ? civilizations.get(civId) : null;
    if(!civ || civ.atWarWith.size === 0) continue;
    const px = rally.tx * TILE + TILE / 2;
    const py = rally.ty * TILE + TILE / 2;
    // Rally point marker
    const pulse = 0.5 + Math.sin(_waterPhase * 4 + civId) * 0.5;
    ctx.globalAlpha = 0.4 + pulse * 0.3;
    ctx.strokeStyle = civ.color;
    ctx.lineWidth = Math.max(1, 2 / cam.zoom);
    ctx.beginPath();
    ctx.arc(px, py, TILE * 1.5 + pulse * TILE * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    // Formation name
    if(cam.zoom > 1.0 && typeof _getFormationType !== 'undefined'){
      const formation = _getFormationType(rally.techLevel);
      ctx.globalAlpha = 0.8;
      ctx.font = `bold ${Math.round(TILE * 0.55)}px sans-serif`;
      ctx.fillStyle = civ.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 2 / cam.zoom;
      ctx.strokeText(formation.icon + ' ' + formation.name, px, py - TILE * 2);
      ctx.fillText(formation.icon + ' ' + formation.name, px, py - TILE * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Media Structures (printing press, radio, TV, internet) ───────────────────
function _drawMediaStructures(){
  if(typeof civilizations === 'undefined') return;
  if(cam.zoom < 0.5) return;
  const ctx = _ctx;
  const t = _waterPhase;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-2, vy0=Math.floor(-cam.y/cam.zoom/TILE)-2;
  const vx1=vx0+Math.ceil(_cw()/cam.zoom/TILE)+4;
  const vy1=vy0+Math.ceil(_ch()/cam.zoom/TILE)+4;

  for(const [,civ] of civilizations){
    if(!civ._hasPrintingPress && !civ._hasRadio && !civ._hasTvStation && !civ._hasInternetHub) continue;
    // Find a representative structure for this civ to anchor the media icon
    let anchor = null;
    for(const s of structures){
      if(s.civId === civ.id && ['palace','citadel','university','academy','library','megacity_core','neural_hub'].includes(s.type)){
        anchor = s; break;
      }
    }
    if(!anchor) continue;
    if(anchor.tx<vx0||anchor.tx>vx1||anchor.ty<vy0||anchor.ty>vy1) continue;

    const px = anchor.tx * TILE + TILE / 2;
    const py = anchor.ty * TILE + TILE / 2;

    // Determine media icon and signal color
    let mediaIcon, sigColor, sigRings;
    if(civ._hasInternetHub){ mediaIcon='🌐'; sigColor='#44ffff'; sigRings=4; }
    else if(civ._hasTvStation){ mediaIcon='📺'; sigColor='#ff8844'; sigRings=3; }
    else if(civ._hasRadio){ mediaIcon='📻'; sigColor='#88ff44'; sigRings=2; }
    else { mediaIcon='📰'; sigColor='#ffdd44'; sigRings=1; }

    // Animated signal waves
    for(let ring=0; ring<sigRings; ring++){
      const phase = (t * 1.5 + ring * 0.6) % 2;
      const ringR = TILE * (1.5 + phase * 3);
      const alpha = (1 - phase / 2) * 0.35;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = sigColor;
      ctx.lineWidth = Math.max(0.5, 1.5 / cam.zoom);
      ctx.beginPath();
      ctx.arc(px, py - TILE * 1.5, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Media icon above structure
    if(cam.zoom > 0.7){
      ctx.globalAlpha = 0.9;
      ctx.font = `${Math.round(TILE * 0.9)}px serif`;
      ctx.fillText(mediaIcon, px, py - TILE * 2.2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
