// ── Bootstrap ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('world');
rendererInit(canvas);
window.addEventListener('resize', ()=>{ rendererResize(); clampCamera(); });
rendererResize();

console.log('[world] generating terrain…');
generateTerrain();
console.log('[world] spawning resources…');
spawnResources();
buildResourceCanvas();
buildWaterTileList();
console.log('[world] spawning humans…');
spawnInitialHumans();
console.log('[world] ready.');

// ── Initial camera: zoom in on humans, no void ────────────────────────────────
(function initCamera(){
  const minFill=Math.max(canvas.width/(WORLD_W*TILE), canvas.height/(WORLD_H*TILE));
  cam.zoom=Math.max(cam.minZoom, minFill*2.2); // zoom in nicely
  const target=humans.length>0?humans[0]:null;
  const wx=target?target.tx*TILE+TILE/2:(WORLD_W*TILE)/2;
  const wy=target?target.ty*TILE+TILE/2:(WORLD_H*TILE)/2;
  cam.x=canvas.width/2-wx*cam.zoom;
  cam.y=canvas.height/2-wy*cam.zoom;
  clampCamera();
})();

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD(){
  document.getElementById('year-label').textContent=formatYear(year);
  document.getElementById('era-label').textContent=getEra(year).name;
  const alive=humans.filter(h=>h.alive).length;
  const popEl=document.getElementById('pop-label');
  if(popEl) popEl.textContent=`👥 ${alive}`;
}

function setSpeedUI(){
  const ids=['btn-pause','btn-1x','btn-5x','btn-20x','btn-100x'];
  ids.forEach((id,i)=>document.getElementById(id).classList.toggle('active',paused?i===0:i===speedIndex));
}
document.getElementById('btn-pause').addEventListener('click',()=>{ paused=!paused; setSpeedUI(); });
[['btn-1x',1],['btn-5x',2],['btn-20x',3],['btn-100x',4]].forEach(([id,idx])=>{
  document.getElementById(id).addEventListener('click',()=>{ speedIndex=idx; paused=false; setSpeedUI(); });
});
setSpeedUI();

// ── Input ─────────────────────────────────────────────────────────────────────
let drag={on:false,sx:0,sy:0,cx:0,cy:0};
canvas.addEventListener('mousedown',e=>{ drag={on:true,sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y}; });
canvas.addEventListener('mousemove',e=>{ if(!drag.on)return; cam.x=drag.cx+(e.clientX-drag.sx); cam.y=drag.cy+(e.clientY-drag.sy); clampCamera(); });
canvas.addEventListener('mouseup',()=>drag.on=false);
canvas.addEventListener('mouseleave',()=>drag.on=false);
canvas.addEventListener('wheel',e=>{ e.preventDefault(); zoomAt(e.clientX,e.clientY,e.deltaY<0?1.12:0.89); },{passive:false});

let lastPinch=null;
canvas.addEventListener('touchstart',e=>{ if(e.touches.length===1) drag={on:true,sx:e.touches[0].clientX,sy:e.touches[0].clientY,cx:cam.x,cy:cam.y}; });
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===1&&drag.on){ cam.x=drag.cx+(e.touches[0].clientX-drag.sx); cam.y=drag.cy+(e.touches[0].clientY-drag.sy); clampCamera(); }
  else if(e.touches.length===2){
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    if(lastPinch) zoomAt((e.touches[0].clientX+e.touches[1].clientX)/2,(e.touches[0].clientY+e.touches[1].clientY)/2,d/lastPinch);
    lastPinch=d;
  }
},{passive:false});
canvas.addEventListener('touchend',()=>{ drag.on=false; lastPinch=null; });

// Click to select human
canvas.addEventListener('click',e=>{
  if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5) return;
  const wx=(e.clientX-cam.x)/cam.zoom/TILE, wy=(e.clientY-cam.y)/cam.zoom/TILE;
  let found=null;
  for(const h of humans){ if(!h.alive) continue; if(Math.hypot(h.tx-wx,h.ty-wy)<1.5){found=h;break;} }
  humans.forEach(h=>h.selected=false);
  if(found){ found.selected=true; _selectHuman(found); }
  else _selectHuman(null);
});

// ── Human selection & panel ───────────────────────────────────────────────────
let _selectedHumanId = null;

function _selectHuman(h) {
  _selectedHumanId = h ? h.id : null;
  _updateHumanList();
  _updateDetailPanel();
}

function focusHuman(id) {
  humans.forEach(h=>h.selected=false);
  const h=humans.find(x=>x.id===id&&x.alive);
  if(!h) return;
  h.selected=true;
  _selectedHumanId=id;
  // Zoom in and center
  cam.zoom=Math.max(2.5, cam.zoom);
  centerOn(h.tx, h.ty);
  _updateHumanList();
  _updateDetailPanel();
}

// ── Human list panel (right sidebar) ─────────────────────────────────────────
function _updateHumanList() {
  const list=document.getElementById('human-list');
  if(!list) return;
  list.innerHTML='';
  const alive=humans.filter(h=>h.alive).sort((a,b)=>b.age-a.age);
  const dead=humans.filter(h=>!h.alive).slice(-5); // last 5 dead

  for(const h of alive){
    const card=document.createElement('div');
    card.className='human-card'+(h.id===_selectedHumanId?' selected':'');
    card.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${h.color};display:inline-block;flex-shrink:0"></span>
        <span class="human-name">${h.name.split(' ')[0]} <span style="color:#888;font-weight:normal">${h.gender==='M'?'♂':'♀'}</span></span>
        <span style="margin-left:auto;color:#888;font-size:0.65rem">${Math.floor(h.age)}a</span>
      </div>
      <div class="human-action">${h.action}</div>
      <div class="stat-bar-wrap">
        <span style="font-size:0.6rem;color:#888;width:14px">❤</span>
        <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${h.health}%;background:${h.health>60?'#4f4':h.health>30?'#fa0':'#f44'}"></div></div>
        <span style="font-size:0.6rem;color:#888;width:14px">🍖</span>
        <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${h.hunger}%;background:#f90"></div></div>
      </div>
      <div style="font-size:0.62rem;color:#6a9;margin-top:2px">🧠 ${Math.floor(h.knowledge)} · 👶 ${h.children} hijos</div>
    `;
    card.addEventListener('click', ()=>focusHuman(h.id));
    list.appendChild(card);
  }

  if(dead.length>0){
    const sep=document.createElement('div');
    sep.style.cssText='padding:6px 12px;font-size:0.65rem;color:#555;border-top:1px solid rgba(255,255,255,0.06);margin-top:4px';
    sep.textContent='— Fallecidos —';
    list.appendChild(sep);
    for(const h of dead){
      const card=document.createElement('div');
      card.className='human-card human-dead';
      card.innerHTML=`<div class="human-name" style="color:#666">${h.name.split(' ')[0]}</div><div class="human-action">${h.action}</div>`;
      list.appendChild(card);
    }
  }
}

// ── Detail panel (bottom-right) ───────────────────────────────────────────────
function _ensureDetailPanel() {
  let p=document.getElementById('human-panel');
  if(!p){
    p=document.createElement('div');
    p.id='human-panel';
    p.style.cssText='position:fixed;bottom:14px;right:234px;width:230px;background:rgba(8,16,32,0.93);color:#dde;border-radius:10px;padding:12px 14px;font-size:12px;font-family:monospace;border:1px solid rgba(100,160,255,0.25);z-index:100;display:none;';
    document.body.appendChild(p);
  }
  return p;
}

function _updateDetailPanel() {
  const panel=_ensureDetailPanel();
  if(_selectedHumanId===null){ panel.style.display='none'; return; }
  const h=humans.find(x=>x.id===_selectedHumanId);
  if(!h){ panel.style.display='none'; return; }
  panel.style.display='block';

  const bar=(v,col='#4f4')=>`<div style="background:#1a2030;border-radius:3px;height:5px;margin:2px 0 4px"><div style="width:${Math.round(Math.max(0,Math.min(100,v)))}%;height:100%;background:${col};border-radius:3px"></div></div>`;
  panel.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="width:14px;height:14px;border-radius:50%;background:${h.color};display:inline-block"></span>
      <b style="color:#adf;font-size:13px">${h.name}</b>
      <span style="color:#888;margin-left:auto">${h.gender==='M'?'♂':'♀'} ${Math.floor(h.age)}a</span>
    </div>
    <div style="color:#8c8;font-style:italic;margin-bottom:8px;font-size:11px">${h.action}</div>
    ❤️ Salud ${bar(h.health, h.health>60?'#4f4':h.health>30?'#fa0':'#f44')}
    🍖 Hambre ${bar(h.hunger,'#f90')}
    ⚡ Energía ${bar(h.energy,'#48f')}
    🧠 Conocimiento ${bar(h.knowledge,'#a8f')}
    <div style="color:#aaa;margin:6px 0 2px;font-size:11px">🎒 Comida:<b>${h.inventory.food}</b> Madera:<b>${h.inventory.wood}</b> Piedra:<b>${h.inventory.stone}</b></div>
    <div style="color:#8ac;font-size:11px">👶 Hijos: ${h.children} · 📍 (${h.tx},${h.ty})</div>
    <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;color:#777;font-size:10px;line-height:1.5">
      ${h.log.slice(0,5).join('<br>')||'Sin eventos aún'}
    </div>
    <button onclick="focusHuman(${h.id})" style="margin-top:8px;width:100%;background:rgba(100,160,255,0.15);border:1px solid rgba(100,160,255,0.3);color:#adf;border-radius:5px;padding:4px;cursor:pointer;font-size:11px">📍 Centrar cámara</button>
  `;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTs=null;
function loop(ts){
  const dt=lastTs?Math.min(ts-lastTs,100):16;
  lastTs=ts;

  const speedMult=SPEED_VALUES[speedIndex]||1;
  const yearsElapsed=tickTime(dt);
  if(yearsElapsed>0) tickHumans(yearsElapsed, speedMult);

  updateHUD();

  // Update panels every ~10 frames for perf
  if(Math.floor(ts/160)!==Math.floor((ts-dt)/160)){
    _updateHumanList();
    _updateDetailPanel();
  }

  renderFrame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
