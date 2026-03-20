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

// ── Initial camera ────────────────────────────────────────────────────────────
(function initCamera(){
  const minFill=Math.max(canvas.width/(WORLD_W*TILE), canvas.height/(WORLD_H*TILE));
  cam.zoom=Math.max(cam.minZoom, minFill*2.2);
  const target=humans.length>0?humans[0]:null;
  const wx=target?target.tx*TILE+TILE/2:(WORLD_W*TILE)/2;
  const wy=target?target.ty*TILE+TILE/2:(WORLD_H*TILE)/2;
  cam.x=canvas.width/2-wx*cam.zoom;
  cam.y=canvas.height/2-wy*cam.zoom;
  clampCamera();
})();

// ── Cached alive set — updated only when population changes ───────────────────
let _aliveCache=[];
let _aliveDirty=true;
let _humanMap=new Map(); // id → human, O(1) lookup

function _rebuildAliveCache(){
  // tickHumans already rebuilds _humanById — just sync _aliveCache from _cachedAlive
  if(typeof _cachedAlive!=='undefined'&&_cachedAlive.length>0){
    _aliveCache=_cachedAlive;
  } else {
    _aliveCache=humans.filter(h=>h.alive);
  }
  _aliveDirty=false;
}
function getAlive(){
  // Prefer the already-built _cachedAlive from tickHumans
  if(typeof _cachedAlive!=='undefined'&&!_aliveDirty)return _cachedAlive;
  if(_aliveDirty)_rebuildAliveCache();
  return _aliveCache;
}
function getHuman(id){ return typeof _humanById!=='undefined'?(_humanById.get(id)||null):(_humanMap.get(id)||null); }

// ── Auto-follow mode ──────────────────────────────────────────────────────────
let _autoFollowMode = false;
let _autoFollowId   = null;

function _pickNextFollowTarget(){
  const alive=getAlive();
  if(alive.length===0){_autoFollowId=null;return;}
  const interesting=alive.filter(h=>h.isLeader||h.isSoldier||h.kills>2||h.children>3);
  const pool=interesting.length>0?interesting:alive;
  const h=pool[Math.floor(Math.random()*pool.length)];
  _autoFollowId=h.id;
  h.selected=true;
  _selectedHumanId=h.id;
}

function _tickAutoFollow(){
  if(!_autoFollowMode)return;
  if(_autoFollowId===null){_pickNextFollowTarget();return;}
  const h=getHuman(_autoFollowId);
  if(!h||!h.alive){
    humans.forEach(x=>x.selected=false);
    _pickNextFollowTarget();
    return;
  }
  const targetX=canvas.width/2-h.px*cam.zoom;
  const targetY=canvas.height/2-h.py*cam.zoom;
  cam.x+=(targetX-cam.x)*0.08;
  cam.y+=(targetY-cam.y)*0.08;
  clampCamera();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD(){
  document.getElementById('year-label').textContent=formatYear(year);
  document.getElementById('era-label').textContent=getEra(year).name;
  const alive=getAlive();
  const popEl=document.getElementById('pop-label');
  if(popEl) popEl.textContent=`👥 ${alive.length}`;
  const civEl=document.getElementById('civ-label');
  if(civEl){
    const activeCivs=typeof civilizations!=='undefined'?[...civilizations.values()].filter(c=>c.population>0).length:0;
    civEl.textContent=`🏛 ${activeCivs}`;
  }
  const phaseEl=document.getElementById('phase-label');
  if(phaseEl&&typeof getSocialPhase!=='undefined'){
    phaseEl.textContent=getSocialPhase()==='division'?'⚔️ División':'🤝 Unidad';
    phaseEl.style.color=getSocialPhase()==='division'?'#f88':'#8f8';
  }
  const intelEl=document.getElementById('intel-label');
  if(intelEl&&typeof _intelModifier!=='undefined'){
    const pct=Math.round(_intelModifier*100);
    intelEl.textContent=`🧠 ${pct}%`;
    intelEl.style.color=_intelModifier>1.2?'#4ff':_intelModifier>0.8?'#adf':'#f84';
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

document.getElementById('btn-follow').addEventListener('click',()=>{
  _autoFollowMode=!_autoFollowMode;
  const btn=document.getElementById('btn-follow');
  if(_autoFollowMode){
    btn.classList.add('active');
    btn.textContent='👁 Siguiendo';
    _pickNextFollowTarget();
    cam.zoom=Math.max(3,cam.zoom);
  } else {
    btn.classList.remove('active');
    btn.textContent='👁 Seguir';
    _autoFollowId=null;
    _trackedHumanId=null;
  }
});

document.getElementById('btn-history').addEventListener('click',()=>{
  const panel=document.getElementById('history-panel');
  const content=document.getElementById('history-content');
  if(panel.style.display==='none'){
    const alive=getAlive();
    const civList=[...civilizations.values()].filter(c=>c.population>0);
    let html=`<div style="color:#8ac;margin-bottom:10px">`;
    html+=`👥 Vivos: <b>${alive.length}</b> · ☠️ Fallecidos: <b>${humans.length-alive.length}</b> · 🏛 Civs: <b>${civList.length}</b><br>`;
    html+=`🌍 <b>${formatYear(year)}</b> · Era: <b>${getEra(year).name}</b> · 🧠 Intel: <b>${Math.round(_intelModifier*100)}%</b>`;
    html+=`</div>`;
    if(civList.length>0){
      html+=`<div style="color:#fda;margin-bottom:8px;font-weight:bold">Civilizaciones activas:</div>`;
      for(const civ of civList){
        const leader=getHuman(civ.leaderId);
        const soldiers=alive.filter(x=>x.civId===civ.id&&x.isSoldier).length;
        html+=`<div style="margin-bottom:4px;padding:4px 6px;background:rgba(255,255,255,0.04);border-radius:4px">`;
        html+=`<span style="color:${civ.color}">●</span> <b>${civ.name}</b> · ${civ.population} miembros · ${civ.era} · ⚔️${soldiers}`;
        if(leader&&leader.alive)html+=` · 👑${leader.name.split(' ')[0]}`;
        html+=`</div>`;
      }
    }
    html+=`<div style="color:#fda;margin:10px 0 6px;font-weight:bold">Eventos recientes:</div>`;
    if(worldEvents.length===0){html+='<div style="color:#666">Ningún evento aún.</div>';}
    else for(const ev of worldEvents)
      html+=`<div style="margin-bottom:3px"><span style="color:#668;font-size:10px">Año ${ev.year}</span> ${ev.text}</div>`;
    content.innerHTML=html;
    panel.style.display='block';
  } else {
    panel.style.display='none';
  }
});

// ── Input ─────────────────────────────────────────────────────────────────────
let drag={on:false,sx:0,sy:0,cx:0,cy:0};
canvas.addEventListener('mousedown',e=>{ drag={on:true,sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y}; });
canvas.addEventListener('mousemove',e=>{
  if(!drag.on)return;
  cam.x=drag.cx+(e.clientX-drag.sx);
  cam.y=drag.cy+(e.clientY-drag.sy);
  clampCamera();
  if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5){
    _trackedHumanId=null;
    if(_autoFollowMode){
      _autoFollowMode=false;
      const btn=document.getElementById('btn-follow');
      if(btn){btn.classList.remove('active');btn.textContent='👁 Seguir';}
    }
  }
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

canvas.addEventListener('click',e=>{
  if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5) return;
  const wx=(e.clientX-cam.x)/cam.zoom/TILE, wy=(e.clientY-cam.y)/cam.zoom/TILE;
  let found=null;
  for(const h of getAlive()){ if(Math.hypot(h.tx-wx,h.ty-wy)<1.5){found=h;break;} }
  for(const h of getAlive()) h.selected=false;
  if(found){
    found.selected=true;
    _selectedHumanId=found.id;
    _trackedHumanId=found.id;
    if(_autoFollowMode) _autoFollowId=found.id;
    _scheduleUIUpdate();
  } else {
    _trackedHumanId=null;
    _selectedHumanId=null;
    _scheduleUIUpdate();
  }
});

// ── Human selection ───────────────────────────────────────────────────────────
let _selectedHumanId = null;
let _trackedHumanId  = null;

function focusHuman(id) {
  for(const h of getAlive()) h.selected=false;
  const h=getHuman(id);
  if(!h||!h.alive) return;
  h.selected=true;
  _selectedHumanId=id;
  _trackedHumanId=id;
  if(_autoFollowMode) _autoFollowId=id;
  cam.zoom=Math.max(3, cam.zoom);
  centerOn(h.tx, h.ty);
  _scheduleUIUpdate();
}

// ── UI update throttle ────────────────────────────────────────────────────────
// Panel updates are expensive — throttle to max 2/sec, never during fast sim
let _uiUpdatePending=false;
let _lastUIUpdate=0;
const UI_UPDATE_INTERVAL=500; // ms

function _scheduleUIUpdate(){ _uiUpdatePending=true; }

function _maybeUpdateUI(ts){
  if(!_uiUpdatePending&&ts-_lastUIUpdate<UI_UPDATE_INTERVAL)return;
  _uiUpdatePending=false;
  _lastUIUpdate=ts;
  _updateHumanPanel();
  _updateDetailPanel();
}

// ── Compute notable humans (cached, recomputed every ~2s) ─────────────────────
let _notables={};
let _notablesTs=0;

function _computeNotables(){
  const alive=getAlive();
  if(alive.length===0){_notables={};return;}
  let smartest=null,strongest=null,oldest=null,mostKids=null,mostKills=null,richest=null;
  for(const h of alive){
    if(!smartest||h.knowledge>smartest.knowledge) smartest=h;
    if(!strongest||h.traits.strength>strongest.traits.strength) strongest=h;
    if(!oldest||h.age>oldest.age) oldest=h;
    if(!mostKids||h.children>mostKids.children) mostKids=h;
    if(!mostKills||h.kills>mostKills.kills) mostKills=h;
    if(!richest||h.wealth>richest.wealth) richest=h;
  }
  _notables={smartest,strongest,oldest,mostKids,mostKills,richest};
}

function _getHumanBadges(h){
  const badges=[];
  if(h.isProdigy&&h.prodigyType) badges.push({icon:h.prodigyType.icon,label:h.prodigyType.name,color:h.prodigyType.color});
  if(h.isLeader) badges.push({icon:'👑',label:'Rey',color:'#ffd700'});
  if(_notables.smartest&&h.id===_notables.smartest.id) badges.push({icon:'🧠',label:'Más sabio',color:'#a8f'});
  if(_notables.strongest&&h.id===_notables.strongest.id) badges.push({icon:'💪',label:'Más fuerte',color:'#f88'});
  if(_notables.oldest&&h.id===_notables.oldest.id) badges.push({icon:'🧓',label:'Más viejo',color:'#aaa'});
  if(_notables.mostKids&&h.id===_notables.mostKids.id&&h.children>2) badges.push({icon:'👨‍👩‍👧‍👦',label:'Más hijos',color:'#8f8'});
  if(_notables.mostKills&&h.id===_notables.mostKills.id&&h.kills>0) badges.push({icon:'⚔️',label:'Guerrero',color:'#f44'});
  if(_notables.richest&&h.id===_notables.richest.id&&h.wealth>50) badges.push({icon:'💰',label:'Más rico',color:'#fd0'});
  if(h.isSoldier) badges.push({icon:'🛡️',label:'Soldado',color:'#c88'});
  if(h.sick) badges.push({icon:'🦠',label:'Enfermo',color:'#f84'});
  return badges;
}

function _getHumanScore(h){
  // Score for "interestingness"
  return h.knowledge*0.3+h.kills*8+h.children*4+(h.isLeader?50:0)+h.age*0.2+h.wealth*0.1+(h.isSoldier?10:0);
}

// ── Human panel (left side, replaces old list) ────────────────────────────────
let _listDirty=true;
let _lastListIds='';
let _panelTab='featured'; // 'featured' | 'all'

function _updateHumanPanel(){
  const list=document.getElementById('human-list');
  if(!list) return;

  const alive=getAlive();
  const currentIds=alive.length+'_'+year; // cheap change detection

  // Recompute notables every update
  _computeNotables();

  // Tab header
  let tabHtml=`<div style="display:flex;gap:4px;padding:4px 8px 6px;border-bottom:1px solid rgba(255,255,255,0.06)">
    <button onclick="_setPanelTab('featured')" id="tab-featured" style="flex:1;padding:3px;border-radius:5px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:10px;font-family:monospace;${_panelTab==='featured'?'background:rgba(232,213,163,0.2);color:#e8d5a3':'background:rgba(0,0,0,0.3);color:#888'}">⭐ Destacados</button>
    <button onclick="_setPanelTab('all')" id="tab-all" style="flex:1;padding:3px;border-radius:5px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:10px;font-family:monospace;${_panelTab==='all'?'background:rgba(232,213,163,0.2);color:#e8d5a3':'background:rgba(0,0,0,0.3);color:#888'}">👥 Todos (${alive.length})</button>
  </div>`;

  let cardsHtml='';

  if(_panelTab==='featured'){
    // Show top ~12 most interesting humans
    const sorted=[...alive].sort((a,b)=>_getHumanScore(b)-_getHumanScore(a)).slice(0,12);
    for(const h of sorted) cardsHtml+=_buildCard(h);
  } else {
    // All humans, sorted by age desc, max 60 shown for perf
    const sorted=[...alive].sort((a,b)=>b.age-a.age).slice(0,60);
    for(const h of sorted) cardsHtml+=_buildCard(h);
    if(alive.length>60) cardsHtml+=`<div style="color:#666;font-size:10px;text-align:center;padding:6px">... y ${alive.length-60} más</div>`;
  }

  list.innerHTML=tabHtml+cardsHtml;

  // Re-attach click listeners
  for(const card of list.querySelectorAll('.human-card[data-hid]')){
    card.addEventListener('click',()=>focusHuman(+card.dataset.hid));
  }
}

function _setPanelTab(tab){
  _panelTab=tab;
  _scheduleUIUpdate();
  _uiUpdatePending=true;
}

function _buildCard(h){
  const civ=typeof civilizations!=='undefined'&&h.civId!=null?civilizations.get(h.civId):null;
  const badges=_getHumanBadges(h);
  const isSelected=h.id===_selectedHumanId;
  const hpColor=h.health>60?'#4f4':h.health>30?'#fa0':'#f44';
  const badgeHtml=badges.slice(0,3).map(b=>`<span style="font-size:9px;background:rgba(0,0,0,0.4);border:1px solid ${b.color}44;color:${b.color};border-radius:3px;padding:0 3px">${b.icon}${b.label}</span>`).join('');
  const civDot=civ?`<span style="width:6px;height:6px;border-radius:50%;background:${civ.color};display:inline-block;flex-shrink:0;margin-right:2px"></span>`:'';

  return `<div class="human-card${isSelected?' selected':''}" data-hid="${h.id}">
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
      <span style="width:9px;height:9px;border-radius:50%;background:${h.color};display:inline-block;flex-shrink:0;${civ?`box-shadow:0 0 0 1.5px ${civ.color}`:''}"></span>
      ${civDot}
      <span class="human-name" style="font-size:0.75rem">${h.name.split(' ')[0]}</span>
      <span style="color:#666;font-size:0.6rem">${h.gender==='M'?'♂':'♀'}</span>
      <span style="margin-left:auto;color:#777;font-size:0.6rem">${Math.floor(h.age)}a</span>
    </div>
    ${badgeHtml?`<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:2px">${badgeHtml}</div>`:''}
    <div style="display:flex;gap:3px;align-items:center;margin-bottom:2px">
      <div style="flex:1;height:3px;background:#111;border-radius:2px"><div style="width:${h.health}%;height:100%;background:${hpColor};border-radius:2px"></div></div>
      <div style="flex:1;height:3px;background:#111;border-radius:2px"><div style="width:${h.hunger}%;height:100%;background:#f90;border-radius:2px"></div></div>
      <div style="flex:1;height:3px;background:#111;border-radius:2px"><div style="width:${Math.min(100,h.knowledge/200)}%;height:100%;background:#a8f;border-radius:2px"></div></div>
    </div>
    <div style="font-size:0.6rem;color:#6a9;display:flex;gap:6px">
      <span>🧠${Math.floor(h.knowledge)}</span>
      <span>👶${h.children}</span>
      <span>⚔️${h.kills}</span>
      <span style="color:#888;margin-left:auto;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px">${h.action}</span>
    </div>
  </div>`;
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function _ensureDetailPanel() {
  let p=document.getElementById('human-panel');
  if(!p){
    p=document.createElement('div');
    p.id='human-panel';
    p.style.cssText='position:fixed;bottom:14px;right:234px;width:240px;background:rgba(8,16,32,0.93);color:#dde;border-radius:10px;padding:12px 14px;font-size:12px;font-family:monospace;border:1px solid rgba(100,160,255,0.25);z-index:100;display:none;';
    document.body.appendChild(p);
  }
  return p;
}

function _updateDetailPanel() {
  const panel=_ensureDetailPanel();
  if(_selectedHumanId===null){ panel.style.display='none'; return; }
  const h=getHuman(_selectedHumanId);
  if(!h){ panel.style.display='none'; return; }
  panel.style.display='block';

  const bar=(v,col='#4f4')=>`<div style="background:#1a2030;border-radius:3px;height:5px;margin:2px 0 4px"><div style="width:${Math.round(Math.max(0,Math.min(100,v)))}%;height:100%;background:${col};border-radius:3px"></div></div>`;
  const civ=typeof civilizations!=='undefined'&&h.civId!=null?civilizations.get(h.civId):null;
  const badges=_getHumanBadges(h);
  const badgeHtml=badges.map(b=>`<span style="font-size:9px;background:rgba(0,0,0,0.5);border:1px solid ${b.color}55;color:${b.color};border-radius:3px;padding:1px 4px;margin-right:2px">${b.icon} ${b.label}</span>`).join('');
  const weaponName=typeof WEAPON_TIERS!=='undefined'?WEAPON_TIERS[Math.min(h.weaponTier,WEAPON_TIERS.length-1)]:'?';
  const civLine=civ?`<div style="color:${civ.color};font-size:11px;margin-bottom:4px">🏛 ${civ.name} <span style="color:#888">(${civ.era})</span> · Tech ${civ.techLevel}</div>`:'<div style="color:#666;font-size:11px;margin-bottom:4px">Sin civilización</div>';
  const diseaseLine=h.sick?`<div style="color:#f88;font-size:11px;margin-bottom:4px">🦠 ${h.sickType?.name||'Enfermo'} (${Math.ceil(h.sickTimer)}a)</div>`:'';

  panel.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <span style="width:13px;height:13px;border-radius:50%;background:${h.color};display:inline-block;${civ?`box-shadow:0 0 0 2px ${civ.color}`:''}"></span>
      <b style="color:#adf;font-size:13px">${h.name}</b>
      <span style="color:#888;margin-left:auto">${h.gender==='M'?'♂':'♀'} ${Math.floor(h.age)}a</span>
    </div>
    ${badges.length?`<div style="margin-bottom:5px;flex-wrap:wrap;display:flex;gap:2px">${badgeHtml}</div>`:''}
    ${civLine}${diseaseLine}
    <div style="color:#8ac;font-size:10px;margin-bottom:4px">💪${h.traits.strength} 🗣${h.traits.charisma} 🧠${h.traits.intellect} 🌱${h.traits.fertility}</div>
    <div style="color:#8c8;font-style:italic;margin-bottom:5px;font-size:11px">${h.action}</div>
    ❤️ Salud ${bar(h.health, h.health>60?'#4f4':h.health>30?'#fa0':'#f44')}
    🍖 Hambre ${bar(h.hunger,'#f90')}
    ⚡ Energía ${bar(h.energy,'#48f')}
    🧠 Conocimiento: <b style="color:#a8f">${Math.floor(h.knowledge)}</b>
    <div style="color:#aaa;margin:5px 0 2px;font-size:11px">🎒 Comida:<b>${h.inventory.food}</b> Madera:<b>${h.inventory.wood}</b> Piedra:<b>${h.inventory.stone}</b></div>
    <div style="color:#8ac;font-size:11px;margin-bottom:4px">👶 ${h.children} hijos · ⚔️ ${h.kills} victorias · 🗡️ ${weaponName}</div>
    <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:5px;color:#777;font-size:10px;line-height:1.5">
      ${h.log.slice(0,5).join('<br>')||'Sin eventos aún'}
    </div>
    <button onclick="focusHuman(${h.id})" style="margin-top:7px;width:100%;background:rgba(100,160,255,0.15);border:1px solid rgba(100,160,255,0.3);color:#adf;border-radius:5px;padding:4px;cursor:pointer;font-size:11px">📍 Centrar cámara</button>
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
      <button onclick="location.reload()" style="background:#c03030;border:none;color:#fff;padding:12px 32px;border-radius:8px;font-size:1rem;cursor:pointer;font-family:monospace;letter-spacing:1px">🔄 Reiniciar</button>
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

  // Cap yearsElapsed per frame to prevent single-frame freezes at 100x
  const rawYears=tickTime(dt);
  const yearsElapsed=Math.min(rawYears, 8); // never process more than 8 years per frame

  updateHumanMovement(dtSec, speedMult);

  if(yearsElapsed>0){
    const prevCount=getAlive().length;
    tickHumans(yearsElapsed);
    tickResourceGrowth(yearsElapsed);
    // Invalidate alive cache after tick
    _aliveDirty=true;
    const newCount=getAlive().length;
    if(newCount!==prevCount){
      _listDirty=true;
      _scheduleUIUpdate();
    }
    if(newCount===0&&prevCount>0) _showExtinctionDialog();
  }

  _tickAutoFollow();

  if(!_autoFollowMode&&_trackedHumanId!==null){
    const h=getHuman(_trackedHumanId);
    if(h&&h.alive){
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
  _maybeUpdateUI(ts);

  renderFrame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
