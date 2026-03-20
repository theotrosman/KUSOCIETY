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
  const civEl=document.getElementById('civ-label');
  if(civEl){
    const activeCivs=typeof civilizations!=='undefined'?[...civilizations.values()].filter(c=>c.population>0).length:0;
    civEl.textContent=`🏛 ${activeCivs}`;
  }
  // Social phase indicator
  const phaseEl=document.getElementById('phase-label');
  if(phaseEl){
    if(typeof getSocialPhase!=='undefined'){
      phaseEl.textContent=getSocialPhase()==='division'?'⚔️ División':'🤝 Unidad';
      phaseEl.style.color=getSocialPhase()==='division'?'#f88':'#8f8';
    }
  }
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

document.getElementById('btn-history').addEventListener('click',()=>{
  const panel=document.getElementById('history-panel');
  const content=document.getElementById('history-content');
  if(panel.style.display==='none'){
    // Build chronicle
    const alive=humans.filter(h=>h.alive).length;
    const dead=humans.filter(h=>!h.alive).length;
    const civList=[...civilizations.values()].filter(c=>c.population>0);
    let html=`<div style="color:#8ac;margin-bottom:10px">`;
    html+=`👥 Vivos: <b>${alive}</b> · ☠️ Fallecidos: <b>${dead}</b> · 🏛 Civilizaciones: <b>${civList.length}</b><br>`;
    html+=`🌍 Año actual: <b>${formatYear(year)}</b> · Era: <b>${getEra(year).name}</b>`;
    html+=`</div>`;
    if(civList.length>0){
      html+=`<div style="color:#fda;margin-bottom:8px;font-weight:bold">Civilizaciones activas:</div>`;
      for(const civ of civList){
        const leader=humans.find(x=>x.id===civ.leaderId&&x.alive);
        html+=`<div style="margin-bottom:4px;padding:4px 6px;background:rgba(255,255,255,0.04);border-radius:4px">`;
        html+=`<span style="color:${civ.color}">●</span> <b>${civ.name}</b> · ${civ.population} miembros · Era: ${civ.era}`;
        if(leader)html+=` · Líder: ${leader.name.split(' ')[0]}`;
        html+=`</div>`;
      }
    }
    html+=`<div style="color:#fda;margin:10px 0 6px;font-weight:bold">Eventos recientes:</div>`;
    if(worldEvents.length===0){html+='<div style="color:#666">Ningún evento aún.</div>';}
    else{
      for(const ev of worldEvents){
        html+=`<div style="margin-bottom:3px"><span style="color:#668;font-size:10px">Año ${ev.year}</span> ${ev.text}</div>`;
      }
    }
    content.innerHTML=html;
    panel.style.display='block';
  } else {
    panel.style.display='none';
  }
});

// ── Input ─────────────────────────────────────────────────────────────────────
let drag={on:false,sx:0,sy:0,cx:0,cy:0};
// Stop tracking when user drags
canvas.addEventListener('mousedown',e=>{ drag={on:true,sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y}; });
canvas.addEventListener('mousemove',e=>{
  if(!drag.on)return;
  cam.x=drag.cx+(e.clientX-drag.sx);
  cam.y=drag.cy+(e.clientY-drag.sy);
  clampCamera();
  // If user dragged more than 5px, stop tracking
  if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5) _trackedHumanId=null;
});
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

// Click to select human (also stops tracking)
canvas.addEventListener('click',e=>{
  if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5) return;
  const wx=(e.clientX-cam.x)/cam.zoom/TILE, wy=(e.clientY-cam.y)/cam.zoom/TILE;
  let found=null;
  for(const h of humans){ if(!h.alive) continue; if(Math.hypot(h.tx-wx,h.ty-wy)<1.5){found=h;break;} }
  humans.forEach(h=>h.selected=false);
  if(found){
    found.selected=true;
    _selectedHumanId=found.id;
    _trackedHumanId=found.id; // start tracking clicked human
    _updateHumanList();
    _updateDetailPanel();
  } else {
    _trackedHumanId=null;
    _selectHuman(null);
  }
});

// ── Human selection & panel ───────────────────────────────────────────────────
let _selectedHumanId = null;
let _trackedHumanId  = null;

function _selectHuman(h) {
  _selectedHumanId = h ? h.id : null;
  if(!h) _trackedHumanId = null;
  _updateHumanList();
  _updateDetailPanel();
}

// ── Camera tracking ───────────────────────────────────────────────────────────
function focusHuman(id) {
  humans.forEach(h=>h.selected=false);
  const h=humans.find(x=>x.id===id&&x.alive);
  if(!h) return;
  h.selected=true;
  _selectedHumanId=id;
  _trackedHumanId=id;   // start tracking
  cam.zoom=Math.max(3, cam.zoom);
  centerOn(h.tx, h.ty);
  _updateHumanList();
  _updateDetailPanel();
}

// ── Human list panel — incremental DOM updates ────────────────────────────────
let _listDirty=true; // full rebuild needed
let _listHumanIds=[]; // track order to detect changes

function _updateHumanList(){
  const list=document.getElementById('human-list');
  if(!list) return;

  const alive=humans.filter(h=>h.alive).sort((a,b)=>b.age-a.age);
  const currentIds=alive.map(h=>h.id).join(',');

  // Full rebuild only when population changes
  if(currentIds!==_listHumanIds||_listDirty){
    _listHumanIds=currentIds;
    _listDirty=false;
    list.innerHTML='';
    for(const h of alive){
      const card=document.createElement('div');
      card.className='human-card'+(h.id===_selectedHumanId?' selected':'');
      card.dataset.hid=h.id;
      card.innerHTML=`
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;border-radius:50%;background:${h.color};display:inline-block;flex-shrink:0"></span>
          <span class="human-name">${h.name.split(' ')[0]} <span style="color:#888;font-weight:normal">${h.gender==='M'?'♂':'♀'}</span></span>
          <span style="margin-left:auto;color:#888;font-size:0.65rem" data-age>${Math.floor(h.age)}a</span>
        </div>
        <div class="human-action" data-action>${h.action}</div>
        <div class="stat-bar-wrap">
          <span style="font-size:0.6rem;color:#888;width:14px">❤</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" data-hp style="width:${h.health}%;background:${h.health>60?'#4f4':h.health>30?'#fa0':'#f44'}"></div></div>
          <span style="font-size:0.6rem;color:#888;width:14px">🍖</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" data-hunger style="width:${h.hunger}%;background:#f90"></div></div>
        </div>
        <div style="font-size:0.62rem;color:#6a9;margin-top:2px" data-info>🧠 ${Math.floor(h.knowledge)} · 👶 ${h.children}</div>
      `;
      card.addEventListener('click',()=>focusHuman(h.id));
      list.appendChild(card);
    }
  } else {
    // Incremental update — just patch the values in existing cards
    for(const card of list.querySelectorAll('.human-card[data-hid]')){
      const h=humans.find(x=>x.id===+card.dataset.hid&&x.alive);
      if(!h) continue;
      card.className='human-card'+(h.id===_selectedHumanId?' selected':'');
      const ageEl=card.querySelector('[data-age]');
      if(ageEl) ageEl.textContent=`${Math.floor(h.age)}a`;
      const actEl=card.querySelector('[data-action]');
      if(actEl) actEl.textContent=h.action;
      const hpEl=card.querySelector('[data-hp]');
      if(hpEl){ hpEl.style.width=`${h.health}%`; hpEl.style.background=h.health>60?'#4f4':h.health>30?'#fa0':'#f44'; }
      const hunEl=card.querySelector('[data-hunger]');
      if(hunEl) hunEl.style.width=`${h.hunger}%`;
      const infoEl=card.querySelector('[data-info]');
      if(infoEl) infoEl.textContent=`🧠 ${Math.floor(h.knowledge)} · 👶 ${h.children}`;
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

  const civ=typeof civilizations!=='undefined'&&h.civId!=null?civilizations.get(h.civId):null;
  const civLine=civ?`<div style="color:#fda;font-size:11px;margin-bottom:4px">🏛 ${civ.name} <span style="color:#888">(${civ.era})</span>${h.isLeader?' 👑 Líder':''}</div>`:'<div style="color:#666;font-size:11px;margin-bottom:4px">Sin civilización</div>';
  const diseaseLine=h.sick?`<div style="color:#f88;font-size:11px;margin-bottom:4px">🦠 ${h.sickType?.name||'Enfermo'} (${Math.ceil(h.sickTimer)} años restantes)</div>`:'';
  const traitsLine=`<div style="color:#8ac;font-size:10px;margin-bottom:4px">💪${h.traits.strength} 🗣${h.traits.charisma} 🧠${h.traits.intellect} 🌱${h.traits.fertility}</div>`;

  panel.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="width:14px;height:14px;border-radius:50%;background:${h.color};display:inline-block;${civ?`box-shadow:0 0 0 2px ${civ.color}`:''};"></span>
      <b style="color:#adf;font-size:13px">${h.name}</b>
      <span style="color:#888;margin-left:auto">${h.gender==='M'?'♂':'♀'} ${Math.floor(h.age)}a</span>
    </div>
    ${civLine}${diseaseLine}${traitsLine}
    <div style="color:#8c8;font-style:italic;margin-bottom:6px;font-size:11px">${h.action}</div>
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

// ── Extinction dialog ─────────────────────────────────────────────────────────
function _showExtinctionDialog(){
  paused=true;
  let overlay=document.getElementById('extinction-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='extinction-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;color:#dde;font-family:monospace;text-align:center;';
    overlay.innerHTML=`
      <div style="font-size:3rem;margin-bottom:16px">💀</div>
      <div style="font-size:1.4rem;font-weight:bold;color:#f88;margin-bottom:10px">La humanidad se extinguió</div>
      <div style="font-size:1rem;color:#aaa;margin-bottom:24px">en el <b style="color:#fda">${formatYear(year)}</b></div>
      <div style="font-size:0.85rem;color:#888;margin-bottom:28px;max-width:340px">
        ${worldEvents.slice(0,3).map(e=>`<div style="margin-bottom:4px">${e.text}</div>`).join('')}
      </div>
      <button onclick="location.reload()" style="background:#c03030;border:none;color:#fff;padding:12px 32px;border-radius:8px;font-size:1rem;cursor:pointer;font-family:monospace;letter-spacing:1px">🔄 Reiniciar simulación</button>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display='flex';
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTs=null;
function loop(ts){
  const dt=lastTs?Math.min(ts-lastTs,100):16;
  lastTs=ts;
  const dtSec=dt/1000;
  const speedMult=SPEED_VALUES[speedIndex]||1;

  const yearsElapsed=tickTime(dt);

  // Movement: runs every frame, speed scales visually with sim speed
  updateHumanMovement(dtSec, speedMult);

  // AI: runs once per in-game year, learning rate is constant (verosímil)
  if(yearsElapsed>0){
    const prevCount=humans.filter(h=>h.alive).length;
    tickHumans(yearsElapsed);
    tickResourceGrowth(yearsElapsed);
    const newCount=humans.filter(h=>h.alive).length;
    if(newCount!==prevCount) _listDirty=true;
    // Extinction check
    if(newCount===0&&prevCount>0) _showExtinctionDialog();
  }

  // Camera tracking: smoothly follow selected human
  if(_trackedHumanId!==null){
    const h=humans.find(x=>x.id===_trackedHumanId&&x.alive);
    if(h){
      const targetX=canvas.width/2-h.px*cam.zoom;
      const targetY=canvas.height/2-h.py*cam.zoom;
      cam.x+=(targetX-cam.x)*0.08;
      cam.y+=(targetY-cam.y)*0.08;
      clampCamera();
    } else {
      _trackedHumanId=null;
    }
  }

  updateHUD();
  if(Math.floor(ts/200)!==Math.floor((ts-dt)/200)){
    _updateHumanList();
    _updateDetailPanel();
  }

  renderFrame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
