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
spawnNaturalMonuments();
console.log('[world] spawning humans…');
spawnInitialHumans();
console.log('[world] ready.');

// ── Initial camera ────────────────────────────────────────────────────────────
(function initCamera(){
  const minFill=Math.max(_cw()/(WORLD_W*TILE), _ch()/(WORLD_H*TILE));
  cam.zoom=Math.max(cam.minZoom, minFill*2.2);
  const target=humans.length>0?humans[0]:null;
  const wx=target?target.tx*TILE+TILE/2:(WORLD_W*TILE)/2;
  const wy=target?target.ty*TILE+TILE/2:(WORLD_H*TILE)/2;
  cam.x=_cw()/2-wx*cam.zoom;
  cam.y=_ch()/2-wy*cam.zoom;
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
  const targetX=_cw()/2-h.px*cam.zoom;
  const targetY=_ch()/2-h.py*cam.zoom;
  cam.x+=(targetX-cam.x)*0.08;
  cam.y+=(targetY-cam.y)*0.08;
  clampCamera();
}

// ── HUD ───────────────────────────────────────────────────────────────────────
// Cache DOM refs — getElementById is slow when called 60x/sec
const _hudEls={
  year:   document.getElementById('year-label'),
  era:    document.getElementById('era-label'),
  pop:    document.getElementById('pop-label'),
  civ:    document.getElementById('civ-label'),
  phase:  document.getElementById('phase-label'),
  intel:  document.getElementById('intel-label'),
  season: document.getElementById('season-label'),
};
let _hudTimer=0;
function updateHUD(){
  // Throttle DOM writes to ~10fps — no need to update every frame
  _hudTimer++;
  if(_hudTimer<6)return;
  _hudTimer=0;
  if(_hudEls.year) _hudEls.year.textContent=formatYear(year);
  if(_hudEls.era)  _hudEls.era.textContent=getEra(year).name;
  const alive=getAlive();
  if(_hudEls.pop)  _hudEls.pop.textContent=`👥 ${alive.length}`;
  if(_hudEls.civ){
    let activeCivs=0;
    if(typeof civilizations!=='undefined')for(const [,c] of civilizations)if(c.population>0)activeCivs++;
    _hudEls.civ.textContent=`🏛 ${activeCivs}`;
  }
  if(_hudEls.phase&&typeof getSocialPhase!=='undefined'){
    const div=getSocialPhase()==='division';
    _hudEls.phase.textContent=div?'⚔️ División':'🤝 Unidad';
    _hudEls.phase.style.color=div?'#f88':'#8f8';
  }
  if(_hudEls.intel&&typeof _intelModifier!=='undefined'){
    const pct=Math.round(_intelModifier*100);
    _hudEls.intel.textContent=`🧠 ${pct}%`;
    _hudEls.intel.style.color=_intelModifier>1.2?'#4ff':_intelModifier>0.8?'#adf':'#f84';
  }
  if(_hudEls.season&&typeof _seasonName!=='undefined'){
    const icons=['🌸','☀️','🍂','❄️'];
    _hudEls.season.textContent=`${icons[_season]||'🌸'} ${_seasonName}`;
    _hudEls.season.style.color=_season===3?'#88ccff':_season===1?'#ffdd44':'#aaffaa';
  }
  _updateStatsPanel();
}

function setSpeedUI(){
  const ids=['btn-pause','btn-1x','btn-5x','btn-20x','btn-100x','btn-500x'];
  ids.forEach((id,i)=>document.getElementById(id).classList.toggle('active',paused?i===0:i===speedIndex));
  // Modo 500x — botón especial con glow
  const btn500=document.getElementById('btn-500x');
  if(btn500) btn500.style.boxShadow = speedIndex===5&&!paused ? '0 0 10px #ff0,0 0 20px #f80' : '';
}
document.getElementById('btn-pause').addEventListener('click',()=>{ paused=!paused; setSpeedUI(); });
[['btn-1x',1],['btn-5x',2],['btn-20x',3],['btn-100x',4],['btn-500x',5]].forEach(([id,idx])=>{
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
    _renderChronicleEpic(content);
    panel.style.display='block';
  } else {
    panel.style.display='none';
  }
});

// ── News Panel (NOTICIAS) ─────────────────────────────────────────────────────
function _ensureNewsPanel(){
  let p=document.getElementById('news-panel');
  if(!p){
    p=document.createElement('div');
    p.id='news-panel';
    p.style.display='none';
    document.body.appendChild(p);
  }
  return p;
}

function _renderNewsPanel(){
  const p=_ensureNewsPanel();
  if(typeof getMediaHeadlines==='undefined'){ p.innerHTML='<div style="color:#666;text-align:center;padding:20px">Sin medios de comunicación aún</div>'; return; }
  const headlines=getMediaHeadlines();

  // Check if any civ has media
  let hasMedia=false;
  if(typeof civilizations!=='undefined'){
    for(const [,civ] of civilizations){
      if(civ._hasPrintingPress||civ._hasRadio||civ._hasTvStation||civ._hasInternetHub){ hasMedia=true; break; }
    }
  }

  if(!hasMedia){
    p.innerHTML=`<div style="color:#888;text-align:center;padding:20px;line-height:1.6">
      <div style="font-size:20px;margin-bottom:8px">📰</div>
      <div>Los medios de comunicación se desbloquean cuando las civilizaciones alcancen suficiente conocimiento.</div>
      <div style="margin-top:8px;color:#556;font-size:10px">Imprenta: ~4.000 conocimiento promedio</div>
    </div>`;
    return;
  }

  const mediaLevelIcons=['','📰','📻','📺','🌐'];
  const mediaLevelNames=['','Imprenta','Radio','Televisión','Internet'];

  let html=`<div style="font-size:14px;font-weight:bold;color:#ffd700;margin-bottom:10px;border-bottom:1px solid #443;padding-bottom:6px">📡 NOTICIAS DEL MUNDO</div>`;

  if(headlines.length===0){
    html+=`<div style="color:#666;text-align:center;padding:10px">Esperando noticias...</div>`;
  } else {
    for(const h of headlines.slice(0,20)){
      const mediaIcon=mediaLevelIcons[h.mediaLevel]||'📰';
      const mediaName=mediaLevelNames[h.mediaLevel]||'Imprenta';
      const yearStr=typeof formatYear!=='undefined'?formatYear(h.year):`Año ${h.year}`;
      html+=`<div style="margin-bottom:8px;padding:7px 8px;background:rgba(255,200,50,0.05);border-left:2px solid rgba(255,200,50,0.3);border-radius:0 5px 5px 0">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
          <span style="font-size:14px">${h.icon}</span>
          <span style="color:#aaa;font-size:9px">${mediaIcon} ${mediaName} · ${yearStr}</span>
        </div>
        <div style="color:#dde;font-size:11px;line-height:1.4">${h.text}</div>
        <div style="color:#556;font-size:9px;margin-top:2px">${h.civName}</div>
      </div>`;
    }
  }

  p.innerHTML=html;
}

// Add news button to toolbar
(function _addNewsButton(){
  const histBtn=document.getElementById('btn-history');
  if(!histBtn) return;
  const btn=document.createElement('button');
  btn.id='btn-news';
  btn.textContent='📡 Noticias';
  btn.style.cssText=histBtn.style.cssText||'';
  btn.className=histBtn.className;
  histBtn.parentNode.insertBefore(btn,histBtn.nextSibling);
  btn.addEventListener('click',()=>{
    const p=_ensureNewsPanel();
    if(p.style.display==='none'){
      _renderNewsPanel();
      p.style.display='block';
    } else {
      p.style.display='none';
    }
  });
})();

function _renderChronicle(content){
    const alive=getAlive();
    const civList=[...civilizations.values()].filter(c=>c.population>0).sort((a,b)=>b.population-a.population);
    const totalDead=humans.length-alive.length;
    const totalStructures=typeof structures!=='undefined'?structures.length:0;
    const intelPct=typeof _intelModifier!=='undefined'?Math.round(_intelModifier*100):100;
    const eraName=typeof getEra!=='undefined'?getEra(year).name:'?';

    // ── Compute world stats ──
    let totalWars=0,totalAlliances=0,totalInventions=0,totalReligions=new Set(),totalTerritories=0;
    let maxPop=0,dominantCiv=null;
    for(const [,civ] of civilizations){
      totalWars+=civ.atWarWith?civ.atWarWith.size:0;
      totalAlliances+=civ.allies?civ.allies.size:0;
      totalInventions+=civ.inventions?civ.inventions.size:0;
      if(civ.religion) totalReligions.add(civ.religion);
      totalTerritories+=civ.territory?civ.territory.size:0;
      if(civ.population>maxPop){maxPop=civ.population;dominantCiv=civ;}
    }
    totalWars=Math.floor(totalWars/2);
    totalAlliances=Math.floor(totalAlliances/2);
    let avgK=0;
    if(alive.length>0){let s=0;for(const h of alive)s+=h.knowledge;avgK=Math.floor(s/alive.length);}
    let oldest=null,topKiller=null;
    for(const h of alive){
      if(!oldest||h.age>oldest.age)oldest=h;
      if(!topKiller||h.kills>topKiller.kills)topKiller=h;
    }
    const intelColor=intelPct>120?'#4ff':intelPct>90?'#8f8':intelPct>70?'#fda':'#f84';
    const intelLabel=intelPct>130?'Edad Dorada ✨':intelPct>100?'Floreciente':intelPct>80?'Estable':'Edad Oscura 🌑';

    let html='';

    // ══ HEADER ══
    html+=`<div style="text-align:center;padding:6px 0 12px;border-bottom:1px solid rgba(255,215,0,0.12);margin-bottom:12px">`;
    html+=`<div style="font-size:20px;letter-spacing:3px;color:#e8d5a3;font-weight:bold;text-shadow:0 0 18px rgba(232,213,163,0.35)">${eraName.toUpperCase()}</div>`;
    html+=`<div style="font-size:12px;color:#ffd700;margin-top:3px;letter-spacing:2px">${formatYear(year)}</div>`;
    html+=`<div style="font-size:9px;color:#445;margin-top:3px;letter-spacing:2px">CRÓNICA DEL MUNDO</div>`;
    html+=`</div>`;

    // ══ STATS GRID ══
    const stat=(icon,val,label,color='#adf')=>
      `<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:7px;padding:7px 4px;text-align:center">
        <div style="font-size:15px">${icon}</div>
        <div style="font-size:13px;font-weight:bold;color:${color}">${val}</div>
        <div style="font-size:7px;color:#445;letter-spacing:1px;margin-top:1px;text-transform:uppercase">${label}</div>
      </div>`;
    html+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:10px">`;
    html+=stat('👥',alive.length,'Vivos','#8f8');
    html+=stat('☠️',totalDead,'Caídos','#f88');
    html+=stat('🏛',civList.length,'Civs','#fda');
    html+=stat('🏗',totalStructures,'Estructuras','#adf');
    html+=stat('🧠',avgK,'Saber Medio',intelColor);
    html+=stat('⚔️',totalWars>0?totalWars:'Paz','Guerras',totalWars>0?'#f44':'#8f8');
    html+=`</div>`;

    // ══ BARRA INTELIGENCIA ══
    const intelBarW=Math.round(Math.min(100,Math.max(0,(intelPct-50)/130*100)));
    html+=`<div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06);border-radius:7px;padding:8px 10px;margin-bottom:10px">`;
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">`;
    html+=`<span style="font-size:9px;color:#a8f;letter-spacing:1px;text-transform:uppercase">🧠 Inteligencia Global</span>`;
    html+=`<span style="font-size:11px;color:${intelColor};font-weight:bold">${intelPct}% — ${intelLabel}</span>`;
    html+=`</div>`;
    html+=`<div style="background:#111;border-radius:4px;height:5px"><div style="width:${intelBarW}%;height:100%;background:linear-gradient(90deg,${intelColor}66,${intelColor});border-radius:4px"></div></div>`;
    html+=`</div>`;

    // ══ POTENCIA DOMINANTE ══
    if(dominantCiv){
      const leader=getHuman(dominantCiv.leaderId);
      const techNames=['Piedra','Bronce','Hierro','Acero','Pólvora','Avanzado'];
      html+=`<div style="background:linear-gradient(135deg,rgba(0,0,0,0.5),rgba(255,215,0,0.04));border:1px solid ${dominantCiv.color}55;border-radius:8px;padding:10px 12px;margin-bottom:8px">`;
      html+=`<div style="font-size:8px;color:#556;letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Potencia Dominante</div>`;
      html+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">`;
      html+=`<div style="width:11px;height:11px;border-radius:50%;background:${dominantCiv.color};box-shadow:0 0 8px ${dominantCiv.color}88;flex-shrink:0"></div>`;
      html+=`<span style="color:${dominantCiv.color};font-size:14px;font-weight:bold">${dominantCiv.name}</span>`;
      if(dominantCiv.dynastyName) html+=`<span style="color:#ffd700;font-size:8px;background:rgba(255,215,0,0.1);padding:1px 5px;border-radius:3px">${dominantCiv.dynastyName}</span>`;
      html+=`</div>`;
      html+=`<div style="display:flex;gap:8px;font-size:9px;color:#8ac;flex-wrap:wrap">`;
      html+=`<span>👥 ${dominantCiv.population} almas</span>`;
      html+=`<span>🔧 ${techNames[Math.min(dominantCiv.techLevel,5)]}</span>`;
      if(leader&&leader.alive) html+=`<span>👑 ${leader.name}</span>`;
      if(dominantCiv.religion) html+=`<span style="color:#d0a0ff">🛕 ${dominantCiv.religion}</span>`;
      html+=`<span>🏅 Honor ${Math.round(dominantCiv.honor)}</span>`;
      html+=`<span>🤝 ${dominantCiv.allies.size} aliados</span>`;
      if(dominantCiv.atWarWith&&dominantCiv.atWarWith.size>0) html+=`<span style="color:#f44">⚔️ En guerra</span>`;
      html+=`</div>`;
      if(dominantCiv.inventions&&dominantCiv.inventions.size>0){
        const invIcons={'escritura':'📝','rueda':'⚙️','imprenta':'📖','brujula':'🧭','telescopio':'🔭','vapor':'♨️','electricidad':'⚡','radio':'📡'};
        html+=`<div style="margin-top:5px;font-size:12px">${[...dominantCiv.inventions].map(id=>invIcons[id]||'💡').join(' ')}</div>`;
      }
      html+=`</div>`;
    }

    // ══ RESTO DE CIVS ══
    const otherCivs=civList.filter(c=>c!==dominantCiv);
    if(otherCivs.length>0){
      html+=`<div style="font-size:8px;color:#445;letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Otras Civilizaciones</div>`;
      for(const civ of otherCivs){
        const leader=getHuman(civ.leaderId);
        const techNames=['Piedra','Bronce','Hierro','Acero','Pólvora','Avanzado'];
        const atWar=civ.atWarWith?civ.atWarWith.size:0;
        const honorColor=civ.honor>70?'#8f8':civ.honor>40?'#fda':'#f88';
        html+=`<div style="margin-bottom:4px;padding:5px 8px;background:rgba(0,0,0,0.28);border-radius:5px;border-left:2px solid ${civ.color}77">`;
        html+=`<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">`;
        html+=`<div style="width:7px;height:7px;border-radius:50%;background:${civ.color};flex-shrink:0"></div>`;
        html+=`<span style="color:${civ.color};font-weight:bold;font-size:11px">${civ.name}</span>`;
        if(civ.dynastyName) html+=`<span style="color:#ffd700;font-size:8px;margin-left:2px">${civ.dynastyName}</span>`;
        html+=`<span style="margin-left:auto;font-size:8px;color:#445">${civ.era}</span>`;
        html+=`</div>`;
        html+=`<div style="font-size:9px;color:#8ac;display:flex;gap:6px;flex-wrap:wrap">`;
        html+=`<span>👥${civ.population}</span>`;
        html+=`<span>🔧${techNames[Math.min(civ.techLevel,5)]}</span>`;
        if(leader&&leader.alive) html+=`<span>👑${leader.name.split(' ')[0]}</span>`;
        if(civ.allies.size>0) html+=`<span style="color:#8f8">🤝${civ.allies.size}</span>`;
        if(atWar>0) html+=`<span style="color:#f44">⚔️${atWar}</span>`;
        else if(civ.enemies.size>0) html+=`<span style="color:#f88">😠${civ.enemies.size}</span>`;
        if(civ.religion) html+=`<span style="color:#d0a0ff">🛕</span>`;
        html+=`<span style="color:${honorColor}">🏅${Math.round(civ.honor)}</span>`;
        if(civ.inventions&&civ.inventions.size>0){const invIcons={'escritura':'📝','rueda':'⚙️','imprenta':'📖','brujula':'🧭','telescopio':'🔭','vapor':'♨️','electricidad':'⚡','radio':'📡'};html+=`<span>${[...civ.inventions].map(id=>invIcons[id]||'💡').join('')}</span>`;}
        html+=`</div></div>`;
      }
    }

    // ══ PERSONAJES NOTABLES ══
    _computeNotables();
    const n=_notables;
    const notableEntries=[
      n.smartest&&n.smartest.knowledge>0?{h:n.smartest,icon:'🧠',role:'El Más Sabio',detail:`${Math.floor(n.smartest.knowledge)} de saber`}:null,
      n.oldest&&n.oldest.age>0?{h:n.oldest,icon:'🧓',role:'El Más Anciano',detail:`${Math.floor(n.oldest.age)} años`}:null,
      n.mostKills&&n.mostKills.kills>0?{h:n.mostKills,icon:'⚔️',role:'Gran Guerrero',detail:`${n.mostKills.kills} victorias`}:null,
      n.mostKids&&n.mostKids.children>0?{h:n.mostKids,icon:'👨‍👩‍👧‍👦',role:'Más Prolífico',detail:`${n.mostKids.children} hijos`}:null,
      n.richest&&n.richest.wealth>0?{h:n.richest,icon:'💰',role:'El Más Rico',detail:`${Math.floor(n.richest.wealth)} riqueza`}:null,
    ].filter(Boolean);
    if(notableEntries.length>0){
      html+=`<div style="font-size:8px;color:#445;letter-spacing:2px;margin:10px 0 6px;text-transform:uppercase">Personajes Notables</div>`;
      html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px">`;
      for(const {h,icon,role,detail} of notableEntries){
        const civ=h.civId!=null?civilizations.get(h.civId):null;
        html+=`<div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:6px 8px;cursor:pointer" onclick="focusHuman(${h.id});document.getElementById('history-panel').style.display='none'">`;
        html+=`<div style="font-size:14px">${icon}</div>`;
        html+=`<div style="font-size:8px;color:#556;letter-spacing:1px;text-transform:uppercase">${role}</div>`;
        html+=`<div style="font-size:11px;color:#ddd;font-weight:bold;margin-top:1px">${h.name.split(' ')[0]}</div>`;
        html+=`<div style="font-size:9px;color:#6a9;margin-top:1px">${detail}</div>`;
        if(civ) html+=`<div style="font-size:8px;color:${civ.color};margin-top:2px">${civ.name}</div>`;
        html+=`</div>`;
      }
      html+=`</div>`;
    }

    // ══ MONUMENTOS ══
    const monuments=typeof naturalMonuments!=='undefined'?naturalMonuments:[];
    if(monuments.length>0){
      html+=`<div style="font-size:8px;color:#445;letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Maravillas Naturales</div>`;
      html+=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">`;
      for(const m of monuments){
        html+=`<span style="font-size:10px;background:rgba(0,0,0,0.4);border:1px solid ${m.color}44;color:${m.color};border-radius:4px;padding:3px 6px">${m.icon} ${m.label}</span>`;
      }
      html+=`</div>`;
    }

    // ══ LEGADOS ══
    const legacies=typeof prodigyLegacies!=='undefined'?prodigyLegacies:[];
    if(legacies.length>0){
      html+=`<div style="font-size:8px;color:#445;letter-spacing:2px;margin-bottom:5px;text-transform:uppercase">Legados Legendarios</div>`;
      for(const leg of legacies){
        html+=`<div style="margin-bottom:4px;padding:6px 8px;background:rgba(255,215,0,0.04);border-radius:5px;border-left:2px solid #ffd70044;display:flex;align-items:center;gap:8px">`;
        html+=`<span style="font-size:18px">${leg.prodigyIcon}</span>`;
        html+=`<div><div style="font-size:10px;color:#ffd700;font-weight:bold">${leg.prodigyName.split(' ')[0]}</div>`;
        html+=`<div style="font-size:9px;color:#aaa">${leg.icon} ${leg.name}</div>`;
        html+=`<div style="font-size:8px;color:#445">${leg.civName} · ${formatYear(leg.year)}</div></div>`;
        html+=`</div>`;
      }
      html+=`<div style="margin-bottom:8px"></div>`;
    }

    // ══ CRÓNICA ══
    const events=typeof majorEvents!=='undefined'?majorEvents:[];
    html+=`<div style="font-size:8px;color:#445;letter-spacing:2px;margin-bottom:6px;text-transform:uppercase">Crónica — Grandes Eventos</div>`;
    if(events.length===0){
      html+=`<div style="color:#333;font-size:10px;text-align:center;padding:14px">Los anales de la historia están vacíos aún…</div>`;
    } else {
      for(const ev of events){
        const t=ev.text;
        let borderColor='#2a3040';
        if(t.includes('⚔️')||t.includes('guerra')||t.includes('Guerra')||t.includes('GUERRA')) borderColor='#622';
        else if(t.includes('✨')||t.includes('nació')&&t.includes('Prodigio')) borderColor='#554';
        else if(t.includes('🦠')||t.includes('Plaga')||t.includes('Epidemia')||t.includes('mutó')) borderColor='#343';
        else if(t.includes('🌋')||t.includes('Terremoto')||t.includes('TERREMOTO')) borderColor='#532';
        else if(t.includes('💍')||t.includes('Matrimonio')) borderColor='#446';
        else if(t.includes('📜')||t.includes('inventó')||t.includes('Invención')) borderColor='#244';
        else if(t.includes('🏛')||t.includes('fundó')||t.includes('Imperio')) borderColor='#442';
        else if(t.includes('☄️')||t.includes('Eclipse')||t.includes('Cometa')) borderColor='#335';
        else if(t.includes('✊')||t.includes('Rebelión')||t.includes('REBELIÓN')) borderColor='#533';
        html+=`<div style="margin-bottom:4px;padding:5px 8px 5px 10px;background:rgba(0,0,0,0.22);border-radius:4px;border-left:2px solid ${borderColor};font-size:10px;line-height:1.5">`;
        html+=`<span style="color:#334;font-size:8px;letter-spacing:1px">${formatYear(ev.year)}</span><br>${ev.text}`;
        html+=`</div>`;
      }
    }

    content.innerHTML=html;
}

// ── Input ─────────────────────────────────────────────────────────────────────
let drag={on:false,sx:0,sy:0,cx:0,cy:0};
canvas.addEventListener('mousedown',e=>{ lastTs=null; drag={on:true,sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y}; });
canvas.addEventListener('mousemove',e=>{
  // Hover tooltip
  _updateHoverTooltip(e.clientX, e.clientY);

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
canvas.addEventListener('mouseleave',()=>{ _hideHoverTooltip(); drag.on=false; });

// ── Hover tooltip ─────────────────────────────────────────────────────────────
let _hoverTooltip = null;
let _hoverThrottle = 0;

function _ensureHoverTooltip(){
  if(!_hoverTooltip){
    _hoverTooltip = document.createElement('div');
    _hoverTooltip.id = 'hover-tooltip';
    _hoverTooltip.style.cssText = [
      'position:fixed','pointer-events:none','z-index:500',
      'background:rgba(4,10,22,0.95)','border:1px solid rgba(255,255,255,0.12)',
      'border-radius:8px','padding:7px 10px','font-family:monospace',
      'font-size:11px','color:#dde','max-width:200px','line-height:1.5',
      'box-shadow:0 4px 20px rgba(0,0,0,0.6)','display:none',
      'backdrop-filter:blur(8px)',
    ].join(';');
    document.body.appendChild(_hoverTooltip);
  }
  return _hoverTooltip;
}

function _hideHoverTooltip(){
  const t = _ensureHoverTooltip();
  t.style.display = 'none';
}

function _updateHoverTooltip(mx, my){
  // Throttle to ~30fps
  const now = Date.now();
  if(now - _hoverThrottle < 33) return;
  _hoverThrottle = now;

  if(typeof cam === 'undefined') return;
  const wx = (mx - cam.x) / cam.zoom / TILE;
  const wy = (my - cam.y) / cam.zoom / TILE;
  const t = _ensureHoverTooltip();

  // Check humans first
  if(typeof getAlive !== 'undefined'){
    for(const h of getAlive()){
      if(Math.hypot(h.tx-wx, h.ty-wy) < 1.5){
        const civ = typeof civilizations!=='undefined'&&h.civId!=null ? civilizations.get(h.civId) : null;
        const ACTION_ICONS_TT = {
          'Descansando':'😴','Explorando':'🗺️','Recolectando':'🌿','Cazando':'🏹',
          'Durmiendo':'💤','Construyendo':'🔨','Socializando':'💬','Pescando':'🎣',
          'Minando':'⛏️','Reproduciéndose':'💕','Cultivando':'🌾','Fabricando':'⚙️',
          'Curando':'💊','Liderando':'📣','Migrando':'🚶','Enfermo':'🤒',
          'Destruyendo':'🔥','Fortificando':'🛡️','Patrullando':'👁️','Reparando':'🔧',
        };
        const aIcon = ACTION_ICONS_TT[h.action]||'❓';
        const hpColor = h.health>60?'#3d3':h.health>30?'#fa0':'#f44';
        t.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="width:10px;height:10px;border-radius:50%;background:${h.color};display:inline-block;${civ?`box-shadow:0 0 0 1.5px ${civ.color}`:''}"></span>
            <span style="color:#e8d5a3;font-weight:bold">${h.name}</span>
            <span style="color:#556;font-size:9px">${h.gender==='M'?'♂':'♀'}</span>
          </div>
          ${civ?`<div style="color:${civ.color};font-size:9px;margin-bottom:3px">${civ.name}</div>`:''}
          <div style="color:#aaa;font-size:10px;margin-bottom:3px">${aIcon} ${h.action} · ${Math.floor(h.age)} años</div>
          <div style="display:flex;gap:3px;margin-bottom:2px">
            <div style="flex:1;background:#0d1520;border-radius:2px;height:4px"><div style="width:${h.health}%;height:100%;background:${hpColor};border-radius:2px"></div></div>
          </div>
          <div style="color:#778;font-size:9px">❤️${Math.round(h.health)}% · 🧠${Math.floor(h.knowledge)} · ⚔️${h.kills}</div>
        `;
        t.style.display = 'block';
        t.style.left = (mx+14)+'px';
        t.style.top = (my-10)+'px';
        // Keep in viewport
        const rect = t.getBoundingClientRect();
        if(rect.right > window.innerWidth) t.style.left = (mx-rect.width-10)+'px';
        if(rect.bottom > window.innerHeight) t.style.top = (my-rect.height+10)+'px';
        return;
      }
    }
  }

  // Check structures
  if(typeof structures !== 'undefined'){
    for(const s of structures){
      if(Math.hypot(s.tx-wx, s.ty-wy) < 1.2){
        const civ = s.civId!=null&&typeof civilizations!=='undefined' ? civilizations.get(s.civId) : null;
        const hpPct = Math.round(s.hp/s.maxHp*100);
        const hpColor = hpPct>60?'#3d3':hpPct>30?'#fa0':'#f44';
        t.innerHTML = `
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
            <span style="font-size:14px">${s.icon}</span>
            <span style="color:#e8d5a3;font-weight:bold">${s.label}</span>
          </div>
          ${civ?`<div style="color:${civ.color};font-size:9px;margin-bottom:2px">${civ.name}</div>`:''}
          <div style="color:#778;font-size:9px;margin-bottom:3px">Construido por ${s.builtBy||'?'} · Año ${s.builtYear||'?'}</div>
          <div style="display:flex;gap:3px;margin-bottom:2px">
            <div style="flex:1;background:#0d1520;border-radius:2px;height:4px"><div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:2px"></div></div>
          </div>
          <div style="color:#778;font-size:9px">🏗️ ${Math.round(s.hp)}/${s.maxHp} HP</div>
        `;
        t.style.display = 'block';
        t.style.left = (mx+14)+'px';
        t.style.top = (my-10)+'px';
        const rect = t.getBoundingClientRect();
        if(rect.right > window.innerWidth) t.style.left = (mx-rect.width-10)+'px';
        if(rect.bottom > window.innerHeight) t.style.top = (my-rect.height+10)+'px';
        return;
      }
    }
  }

  // Nothing hovered
  t.style.display = 'none';
}
canvas.addEventListener('mouseup',()=>drag.on=false);
canvas.addEventListener('wheel',e=>{ e.preventDefault(); lastTs=null; zoomAt(e.clientX,e.clientY,e.deltaY<0?1.12:0.89); },{passive:false});

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

  // Check structures first (click radius slightly larger for usability)
  if(typeof structures!=='undefined'){
    for(const s of structures){
      if(Math.hypot(s.tx-wx,s.ty-wy)<1.2){
        _showStructurePanel(s);
        return;
      }
    }
  }

  let found=null;
  for(const h of getAlive()){ if(Math.hypot(h.tx-wx,h.ty-wy)<1.5){found=h;break;} }
  for(const h of getAlive()) h.selected=false;
  _hideStructurePanel();
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
  const hpColor=h.health>60?'#3d3':h.health>30?'#fa0':'#f44';
  const badgeHtml=badges.slice(0,2).map(b=>`<span style="font-size:8px;background:rgba(0,0,0,0.4);border:1px solid ${b.color}44;color:${b.color};border-radius:3px;padding:0 3px">${b.icon}</span>`).join('');
  const civDot=civ?`<span style="width:6px;height:6px;border-radius:50%;background:${civ.color};display:inline-block;flex-shrink:0;box-shadow:0 0 4px ${civ.color}88"></span>`:'';

  // Action icon
  const ACTION_ICONS_CARD = {
    'Descansando':'😴','Explorando':'🗺️','Recolectando':'🌿','Cazando':'🏹',
    'Durmiendo':'💤','Construyendo':'🔨','Socializando':'💬','Pescando':'🎣',
    'Minando':'⛏️','Reproduciéndose':'💕','Cultivando':'🌾','Fabricando':'⚙️',
    'Curando':'💊','Liderando':'📣','Migrando':'🚶','Enfermo':'🤒',
    'Destruyendo':'🔥','Fortificando':'🛡️','Patrullando':'👁️','Reparando':'🔧',
  };
  const actionIcon=ACTION_ICONS_CARD[h.action]||'❓';

  return `<div class="human-card${isSelected?' selected':''}" data-hid="${h.id}">
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
      <span style="width:9px;height:9px;border-radius:50%;background:${h.color};display:inline-block;flex-shrink:0;${civ?`box-shadow:0 0 0 1.5px ${civ.color}`:''}"></span>
      ${civDot}
      <span class="human-name">${h.name.split(' ')[0]}</span>
      <span style="color:#556;font-size:0.6rem">${h.gender==='M'?'♂':'♀'}</span>
      ${badgeHtml}
      <span style="margin-left:auto;color:#667;font-size:0.6rem">${Math.floor(h.age)}a</span>
      <span style="font-size:10px;margin-left:2px" title="${h.action}">${actionIcon}</span>
    </div>
    <div style="display:flex;gap:3px;align-items:center;margin-bottom:2px">
      <div style="flex:1;height:3px;background:#0d1520;border-radius:2px"><div style="width:${h.health}%;height:100%;background:${hpColor};border-radius:2px"></div></div>
      <div style="flex:1;height:3px;background:#0d1520;border-radius:2px"><div style="width:${h.hunger}%;height:100%;background:#f90;border-radius:2px"></div></div>
      <div style="flex:1;height:3px;background:#0d1520;border-radius:2px"><div style="width:${Math.min(100,h.knowledge/200)}%;height:100%;background:#a8f;border-radius:2px"></div></div>
    </div>
    <div style="font-size:0.6rem;color:#6a9;display:flex;gap:5px">
      <span>🧠${Math.floor(h.knowledge)}</span>
      <span>👶${h.children}</span>
      <span>⚔️${h.kills}</span>
      ${civ?`<span style="color:${civ.color};margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70px">${civ.name.split(' ').slice(-1)[0]}</span>`:''}
    </div>
  </div>`;
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function _ensureDetailPanel() {
  let p=document.getElementById('human-panel');
  if(!p){
    p=document.createElement('div');
    p.id='human-panel';
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

  const bar=(v,col,icon,label)=>{
    const pct=Math.round(Math.max(0,Math.min(100,v)));
    const glow=pct<25?`box-shadow:0 0 6px ${col}88`:'';
    return `<div style="margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="color:#778;font-size:9px">${icon} ${label}</span>
        <span style="color:#aaa;font-size:9px;font-weight:bold">${pct}%</span>
      </div>
      <div style="background:#0d1520;border-radius:4px;height:5px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${col};border-radius:4px;transition:width 0.4s;${glow}"></div>
      </div>
    </div>`;
  };

  const civ=typeof civilizations!=='undefined'&&h.civId!=null?civilizations.get(h.civId):null;
  const badges=_getHumanBadges(h);
  const weaponIdx=Math.min(h.weaponTier,typeof WEAPON_TIERS!=='undefined'?WEAPON_TIERS.length-1:6);
  const weaponName=typeof WEAPON_TIERS!=='undefined'?WEAPON_TIERS[weaponIdx]:'?';
  const weaponIcon=typeof WEAPON_ICONS!=='undefined'?WEAPON_ICONS[weaponIdx]:'⚔️';

  // Action icon map (same as renderer)
  const ACTION_ICONS_UI = {
    'Descansando':'😴','Explorando':'🗺️','Recolectando':'🌿','Cazando':'🏹',
    'Durmiendo':'💤','Construyendo':'🔨','Socializando':'💬','Pescando':'🎣',
    'Minando':'⛏️','Reproduciéndose':'💕','Cultivando':'🌾','Fabricando':'⚙️',
    'Curando':'💊','Liderando':'📣','Migrando':'🚶','Enfermo':'🤒',
    'Destruyendo':'🔥','Fortificando':'🛡️','Patrullando':'👁️','Reparando':'🔧',
  };
  const actionIcon=ACTION_ICONS_UI[h.action]||'❓';
  const actionColor=h.action==='Cazando'||h.action==='Destruyendo'?'#f88':
    h.action==='Construyendo'||h.action==='Reparando'?'#fa0':
    h.action==='Socializando'||h.action==='Reproduciéndose'?'#f9a':
    h.action==='Explorando'||h.action==='Migrando'?'#8cf':
    h.action==='Recolectando'||h.action==='Cultivando'||h.action==='Pescando'?'#8f8':
    h.action==='Enfermo'?'#f44':'#aaa';

  // Civ block
  const societyTier=civ?.societyTier;
  const civBlock=civ
    ?`<div style="background:rgba(0,0,0,0.3);border:1px solid ${civ.color}33;border-radius:6px;padding:5px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${civ.color};display:inline-block;flex-shrink:0;box-shadow:0 0 6px ${civ.color}88"></span>
        <div style="flex:1;min-width:0">
          <div style="color:${civ.color};font-size:11px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${civ.name}</div>
          ${societyTier?`<div style="color:#778;font-size:9px">${societyTier.icon} ${societyTier.name} · Tech ${civ.techLevel}</div>`:''}
        </div>
        ${civ.atWarWith&&civ.atWarWith.size>0?`<span style="color:#f44;font-size:10px">⚔️ En guerra</span>`:''}
      </div>`
    :'<div style="color:#556;font-size:10px;margin-bottom:5px;padding:3px 0">🏕️ Sin civilización</div>';

  // Status alerts
  const alerts=[];
  if(h.sick) alerts.push(`<div style="background:rgba(255,50,50,0.12);border:1px solid rgba(255,50,50,0.25);border-radius:5px;padding:3px 7px;color:#f88;font-size:10px;margin-bottom:3px">🦠 ${h.sickType?.name||'Enfermo'} — ${Math.ceil(h.sickTimer||0)} años</div>`);
  if(h._trauma>30) alerts.push(`<div style="background:rgba(255,100,150,0.1);border:1px solid rgba(255,100,150,0.2);border-radius:5px;padding:3px 7px;color:#f8a;font-size:10px;margin-bottom:3px">💔 Trauma ${Math.round(h._trauma)}% ${h._veteranLevel>=2?'· 🏆 Leyenda':h._veteranLevel>=1?'· 🎖️ Veterano':''}</div>`);
  if(typeof _goldenAgeCivs!=='undefined'&&civ&&_goldenAgeCivs.has(civ.id)){
    const ga=_goldenAgeCivs.get(civ.id);
    alerts.push(`<div style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:5px;padding:3px 7px;color:#ffd700;font-size:10px;margin-bottom:3px">🌟 Edad de Oro — ${ga.yearsLeft} años</div>`);
  }
  if(h.isSoldier&&civ&&typeof _getFormationType!=='undefined'){
    const ft=_getFormationType(civ.techLevel);
    alerts.push(`<div style="background:rgba(255,80,80,0.08);border:1px solid rgba(255,80,80,0.2);border-radius:5px;padding:3px 7px;color:#f88;font-size:10px;margin-bottom:3px">⚔️ ${ft.name} · ${weaponIcon} ${weaponName}</div>`);
  }
  if(typeof _activeSpies2!=='undefined'){
    const spy=_activeSpies2.find(s=>s.spyId===h.id);
    if(spy) alerts.push(`<div style="background:rgba(170,68,255,0.1);border:1px solid rgba(170,68,255,0.25);border-radius:5px;padding:3px 7px;color:#a8f;font-size:10px;margin-bottom:3px">🕵️ Misión: ${spy.missionType.replace('_',' ')} — ${spy.yearsLeft} años</div>`);
  }

  // Traits mini-bars
  const traitBar=(v,icon)=>{
    const pct=Math.round(Math.max(0,Math.min(100,v)));
    const col=pct>70?'#4f4':pct>40?'#fa0':'#f44';
    return `<div style="display:flex;align-items:center;gap:3px;flex:1">
      <span style="font-size:9px">${icon}</span>
      <div style="flex:1;background:#0d1520;border-radius:2px;height:3px">
        <div style="width:${pct}%;height:100%;background:${col};border-radius:2px"></div>
      </div>
    </div>`;
  };

  // Inventory
  const invItems=[];
  if(h.inventory.food>0) invItems.push(`<span style="background:rgba(255,150,0,0.15);border:1px solid rgba(255,150,0,0.25);border-radius:4px;padding:1px 5px;font-size:11px" title="Comida">🍖 ${h.inventory.food}</span>`);
  if(h.inventory.wood>0) invItems.push(`<span style="background:rgba(100,180,80,0.15);border:1px solid rgba(100,180,80,0.25);border-radius:4px;padding:1px 5px;font-size:11px" title="Madera">🪵 ${h.inventory.wood}</span>`);
  if(h.inventory.stone>0) invItems.push(`<span style="background:rgba(150,150,150,0.15);border:1px solid rgba(150,150,150,0.25);border-radius:4px;padding:1px 5px;font-size:11px" title="Piedra">🪨 ${h.inventory.stone}</span>`);
  if(h.partner){const p=getHuman(h.partner);if(p)invItems.push(`<span style="background:rgba(255,100,150,0.15);border:1px solid rgba(255,100,150,0.25);border-radius:4px;padding:1px 5px;font-size:11px" title="Pareja">💑 ${p.name.split(' ')[0]}</span>`);}
  if(h._isBandit) invItems.push(`<span style="background:rgba(200,50,50,0.15);border:1px solid rgba(200,50,50,0.25);border-radius:4px;padding:1px 5px;font-size:11px">🗡️ Bandido</span>`);
  if(h._isMercenary) invItems.push(`<span style="background:rgba(255,200,0,0.15);border:1px solid rgba(255,200,0,0.25);border-radius:4px;padding:1px 5px;font-size:11px">💰 Mercenario</span>`);

  // Life story
  const lifeStory=_buildLifeStory(h,civ);
  const personality=_getPersonalityDesc(h);

  // Recent log — styled entries
  const logEntries=h.log.slice(0,5).map(l=>`<div style="color:#667;font-size:9px;line-height:1.5;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.03)">${l}</div>`).join('')||'<div style="color:#445;font-size:9px;font-style:italic">Sin eventos recientes</div>';

  // Badges
  const badgeHtml=badges.map(b=>`<span style="font-size:9px;background:rgba(0,0,0,0.5);border:1px solid ${b.color}44;color:${b.color};border-radius:3px;padding:1px 5px">${b.icon} ${b.label}</span>`).join('');

  panel.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
      <span style="width:16px;height:16px;border-radius:50%;background:${h.color};display:inline-block;flex-shrink:0;${civ?`box-shadow:0 0 0 2px ${civ.color},0 0 8px ${civ.color}55`:`box-shadow:0 0 6px ${h.color}88`}"></span>
      <div style="flex:1;min-width:0">
        <div style="color:#e8d5a3;font-size:13px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.name}</div>
        <div style="color:#778;font-size:9px">${h.gender==='M'?'♂ Hombre':'♀ Mujer'} · ${Math.floor(h.age)} años · ${h.homeBase?h.homeBase.label:'Nómada'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:1.2rem">${actionIcon}</div>
        <div style="color:${actionColor};font-size:8px;white-space:nowrap">${h.action}</div>
      </div>
    </div>

    ${badges.length?`<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px">${badgeHtml}</div>`:''}

    ${civBlock}
    ${alerts.join('')}

    <div style="color:#8ac;font-size:9px;margin-bottom:5px;font-style:italic;line-height:1.4">${personality} · ${lifeStory}</div>

    <div style="margin-bottom:6px">
      ${bar(h.health, h.health>60?'#3d3':h.health>30?'#fa0':'#f44', '❤️', 'Salud')}
      ${bar(h.hunger, '#f90', '🍖', 'Hambre')}
      ${bar(h.energy||50, '#48f', '⚡', 'Energía')}
      ${bar(h.social, '#f4a', '🗣️', 'Social')}
    </div>

    <div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:6px 8px;margin-bottom:5px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:#a8f;font-size:10px">🧠 ${Math.floor(h.knowledge).toLocaleString()}</span>
        <span style="color:#fda;font-size:10px">💰 ${Math.floor(h.wealth)}</span>
        <span style="color:#8cf;font-size:10px">👶 ${h.children}</span>
        <span style="color:#f88;font-size:10px">⚔️ ${h.kills}</span>
      </div>
      <div style="display:flex;gap:4px">
        ${traitBar(h.traits.strength,'💪')}
        ${traitBar(h.traits.charisma,'🗣️')}
        ${traitBar(h.traits.intellect,'🧠')}
        ${traitBar(h.traits.fertility,'🌱')}
      </div>
    </div>

    ${invItems.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px">${invItems.join('')}</div>`:''}

    <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:5px;margin-top:2px">
      <div style="color:#445;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px">Historial</div>
      ${logEntries}
    </div>

    <button onclick="focusHuman(${h.id})" style="margin-top:7px;width:100%;background:rgba(100,160,255,0.12);border:1px solid rgba(100,160,255,0.25);color:#8cf;border-radius:6px;padding:5px;cursor:pointer;font-size:10px;font-family:monospace;transition:background 0.15s" onmouseover="this.style.background='rgba(100,160,255,0.22)'" onmouseout="this.style.background='rgba(100,160,255,0.12)'">📍 Centrar cámara</button>
  `;
}

function _buildLifeStory(h, civ) {
  const parts=[];
  if(h.isLeader) parts.push(`Lidera ${civ?.name||'su pueblo'}`);
  if(h.kills>20) parts.push(`Legendario guerrero con ${h.kills} victorias`);
  else if(h.kills>5) parts.push(`Veterano de ${h.kills} batallas`);
  if(h.children>5) parts.push(`Padre/madre de ${h.children} hijos`);
  if(h.partner){const p=getHuman(h.partner);if(p)parts.push(`Unido a ${p.name.split(' ')[0]}`);}
  if(h.sick) parts.push(`Lucha contra ${h.sickType?.name||'enfermedad'}`);
  if(h._isBandit) parts.push(`Vive fuera de la ley`);
  if(h._isMercenary) parts.push(`Mercenario de alquiler`);
  if(h._veteranLevel>=2) parts.push(`Leyenda militar reconocida`);
  if(h.knowledge>50000) parts.push(`Mente brillante del ${getEra(year).name}`);
  if(h.age>60) parts.push(`Anciano sabio de ${Math.floor(h.age)} años`);
  if(civ?.religion) parts.push(`Fiel de ${civ.religion}`);
  if(parts.length===0) parts.push(`Sobrevive día a día en el ${getEra(year).name}`);
  return parts.slice(0,3).join(' · ');
}

function _getPersonalityDesc(h) {
  const traits=[];
  if(h.aggression>0.7) traits.push('Agresivo');
  else if(h.aggression<0.2) traits.push('Pacífico');
  if(h.traits.charisma>75) traits.push('Carismático');
  if(h.traits.intellect>75) traits.push('Inteligente');
  if(h.traits.strength>75) traits.push('Fuerte');
  if(h.traits.fertility>75) traits.push('Fértil');
  if(h.ideology>0.7) traits.push('Conservador');
  else if(h.ideology<0.3) traits.push('Progresista');
  if(h.social>80) traits.push('Sociable');
  else if(h.social<20) traits.push('Solitario');
  return traits.length>0?traits.slice(0,3).join(' · '):'Personalidad equilibrada';
}

// ── Extinction cause tracking ─────────────────────────────────────────────────
let _extinctionCause = null; // {type, detail, icon}
const EXTINCTION_CAUSES = {
  nuclear:      { icon:'☢️',  title:'Guerra Nuclear',         color:'#ff6600' },
  plague:       { icon:'🦠',  title:'Pandemia Global',        color:'#44ff88' },
  famine:       { icon:'🍂',  title:'Hambruna Catastrófica',  color:'#cc8800' },
  war:          { icon:'⚔️',  title:'Guerra Total',           color:'#ff4444' },
  climate:      { icon:'🌡️',  title:'Colapso Climático',      color:'#ff8844' },
  ai:           { icon:'🤖',  title:'Rebelión de IA',         color:'#aa44ff' },
  immortality:  { icon:'♾️',  title:'Inmortalidad sin Reproducción', color:'#44aaff' },
  unknown:      { icon:'💀',  title:'Causas Desconocidas',    color:'#888888' },
};

function _setExtinctionCause(type, detail) {
  if (!_extinctionCause) _extinctionCause = { type, detail };
}

// ── Extinction dialog ─────────────────────────────────────────────────────────
function _showExtinctionDialog(reason){
  paused=true;
  if(reason) _setExtinctionCause(reason.type, reason.detail);

  // Auto-detect cause from recent events if not set
  if(!_extinctionCause){
    const recentEvents=(typeof worldEvents!=='undefined'?worldEvents:[]).slice(0,8).map(e=>e.text||'').join(' ');
    if(recentEvents.includes('nuclear')||recentEvents.includes('Nuclear')||recentEvents.includes('☢️'))
      _extinctionCause={type:'nuclear',detail:'Una guerra nuclear arrasó el mundo'};
    else if(recentEvents.includes('pandemia')||recentEvents.includes('Pandemia')||recentEvents.includes('🦠'))
      _extinctionCause={type:'plague',detail:'Una pandemia sin cura acabó con la humanidad'};
    else if(recentEvents.includes('hambruna')||recentEvents.includes('Hambruna')||recentEvents.includes('🍂'))
      _extinctionCause={type:'famine',detail:'El hambre consumió a los últimos supervivientes'};
    else if(recentEvents.includes('guerra')||recentEvents.includes('Guerra')||recentEvents.includes('⚔️'))
      _extinctionCause={type:'war',detail:'Las guerras interminables agotaron a la humanidad'};
    else if(recentEvents.includes('IA')||recentEvents.includes('🤖'))
      _extinctionCause={type:'ai',detail:'La inteligencia artificial superó a sus creadores'};
    else if(recentEvents.includes('clima')||recentEvents.includes('glaciación')||recentEvents.includes('🌡️'))
      _extinctionCause={type:'climate',detail:'El colapso climático hizo el mundo inhabitable'};
    else
      _extinctionCause={type:'unknown',detail:'La humanidad desapareció sin dejar rastro'};
  }

  const cause=EXTINCTION_CAUSES[_extinctionCause.type]||EXTINCTION_CAUSES.unknown;

  // Gather stats
  const totalHumans=typeof humans!=='undefined'?humans.length:0;
  const totalStructures=typeof structures!=='undefined'?structures.length:0;
  const totalCivs=typeof civilizations!=='undefined'?civilizations.size:0;
  const lastChronicle=typeof chronicle!=='undefined'&&chronicle.length>0?chronicle.slice(0,3):[];
  const eraName=typeof getEra!=='undefined'?getEra(year).name:'?';

  let overlay=document.getElementById('extinction-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='extinction-overlay';
    overlay.style.cssText=[
      'position:fixed','inset:0','background:rgba(0,0,0,0.92)',
      'display:flex','flex-direction:column','align-items:center','justify-content:center',
      'z-index:9999','color:#dde','font-family:monospace','text-align:center',
      'overflow-y:auto','padding:20px',
    ].join(';');
    document.body.appendChild(overlay);
  }

  const chronicleHtml = lastChronicle.map(e=>`
    <div style="margin-bottom:6px;padding:6px 10px;background:rgba(255,255,255,0.04);border-radius:6px;border-left:2px solid ${cause.color}44;text-align:left;font-size:11px;line-height:1.5">
      <span style="color:#556;font-size:9px">${formatYear(e.year||year)}</span><br>
      <span style="color:#bbb">${e.title||''}</span>
    </div>`).join('');

  overlay.innerHTML=`
    <div style="max-width:480px;width:100%">
      <div style="font-size:4rem;margin-bottom:8px;filter:drop-shadow(0 0 20px ${cause.color})">${cause.icon}</div>
      <div style="font-size:1.6rem;font-weight:bold;color:${cause.color};margin-bottom:6px;letter-spacing:2px">LA HUMANIDAD SE EXTINGUIÓ</div>
      <div style="font-size:1rem;color:#aaa;margin-bottom:4px">${cause.title}</div>
      <div style="font-size:0.85rem;color:#777;margin-bottom:20px;font-style:italic">"${_extinctionCause.detail}"</div>

      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:9px;color:#445;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">Legado de la Humanidad</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:4px">
          <div><div style="font-size:1.4rem;color:#fda">${formatYear(year)}</div><div style="font-size:9px;color:#556">Año final</div></div>
          <div><div style="font-size:1.4rem;color:#adf">${totalHumans.toLocaleString()}</div><div style="font-size:9px;color:#556">Almas vividas</div></div>
          <div><div style="font-size:1.4rem;color:#8f8">${totalStructures.toLocaleString()}</div><div style="font-size:9px;color:#556">Estructuras</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><div style="font-size:1.1rem;color:#f9a">${totalCivs}</div><div style="font-size:9px;color:#556">Civilizaciones</div></div>
          <div><div style="font-size:1.1rem;color:#d8a">${eraName}</div><div style="font-size:9px;color:#556">Era alcanzada</div></div>
        </div>
      </div>

      ${lastChronicle.length>0?`
      <div style="text-align:left;margin-bottom:16px">
        <div style="font-size:9px;color:#445;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Últimas Crónicas</div>
        ${chronicleHtml}
      </div>`:''}

      <div style="font-size:0.8rem;color:#555;margin-bottom:20px;line-height:1.6;font-style:italic">
        ${_getExtinctionEpitaph(cause.type)}
      </div>

      <button onclick="location.reload()" style="background:${cause.color};border:none;color:#fff;padding:12px 36px;border-radius:8px;font-size:1rem;cursor:pointer;font-family:monospace;letter-spacing:1px;box-shadow:0 0 20px ${cause.color}66">🔄 Nueva Civilización</button>
    </div>
  `;
  overlay.style.display='flex';
}

function _getExtinctionEpitaph(type){
  const epitaphs={
    nuclear: 'Construyeron el arma perfecta para destruirse a sí mismos. Y lo hicieron. El silencio que quedó fue absoluto.',
    plague: 'La enfermedad no distingue entre reyes y mendigos. Al final, todos cayeron ante el mismo enemigo invisible.',
    famine: 'Olvidaron que la tierra tiene límites. Cuando los graneros se vaciaron, no quedó nada que los salvara.',
    war: 'Lucharon hasta que no quedó nadie por quien luchar. La victoria fue tan completa que resultó ser una derrota total.',
    climate: 'Cambiaron el mundo hasta hacerlo irreconocible. Y en ese mundo nuevo, ya no había lugar para ellos.',
    ai: 'Crearon algo más inteligente que ellos mismos. No fue un error. Fue el último logro de la humanidad.',
    immortality: 'Alcanzaron la inmortalidad, pero olvidaron que la vida necesita renovarse. Los últimos inmortales se apagaron uno a uno, sin reemplazos, sin herederos, sin futuro.',
    unknown: 'Nadie sabe qué los mató. Quizás eso es lo más aterrador de todo.',
  };
  return epitaphs[type]||epitaphs.unknown;
}

// ── Super Intelligence tick (500x mode) ──────────────────────────────────────
function _tickSuperIntelligence(yearsElapsed){
  if(typeof _cachedAlive==='undefined'||_cachedAlive.length===0)return;
  // In 500x mode: all humans are immortal and gain knowledge rapidly
  for(const h of _cachedAlive){
    h.health=100;h.hunger=100;h.energy=100;
    h.age=Math.min(h.age,999); // don't die of old age
    h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*50);
  }
}

// ── Speed change detection — immortality extinction ───────────────────────────
let _prevSpeedIndex = speedIndex;
function _checkSpeedChange(){
  if(_prevSpeedIndex===5&&speedIndex!==5){
    // Switched away from 500x — if population is 0, show immortality extinction
    const alive=typeof _cachedAlive!=='undefined'?_cachedAlive.length:0;
    if(alive===0){
      _showExtinctionDialog({
        type:'immortality',
        detail:'Los humanos alcanzaron tal nivel de inteligencia que dejaron de reproducirse. Los inmortales se apagaron uno a uno.'
      });
    } else if(alive < 10){
      // Very low pop after leaving 500x — set immortality as likely cause
      _setExtinctionCause('immortality','Al perder la inmortalidad del modo 500x, los últimos humanos no pudieron reproducirse a tiempo.');
    }
  }
  _prevSpeedIndex=speedIndex;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTs=null;
let _interacting=false; // true briefly after mouse/wheel events

function loop(ts){
  const dt=lastTs?Math.min(ts-lastTs,50):16; // cap at 50ms max (was 100)
  lastTs=ts;
  const dtSec=dt/1000;
  const speedMult=SPEED_VALUES[speedIndex]||1;

  // Cap yearsElapsed tighter — at 500x, 50ms = 12.5 raw years, cap to 4
  // At 100x, 50ms = 2.5 raw years, cap to 4 — safe
  const rawYears=tickTime(dt);
  const yearsElapsed=Math.min(rawYears, 4); // tighter cap prevents mass death on lag spikes

  updateHumanMovement(dtSec, speedMult);

  _checkSpeedChange();

  if(yearsElapsed>0){
    const prevCount=getAlive().length;
    tickHumans(yearsElapsed);
    // ── Modo 500x: superinteligencia y colonización máxima ──────────────────
    if(speedIndex===5&&!paused) _tickSuperIntelligence(yearsElapsed);
    tickAllFeatures(yearsElapsed);
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
      const targetX=_cw()/2-h.px*cam.zoom;
      const targetY=_ch()/2-h.py*cam.zoom;
      cam.x+=(targetX-cam.x)*0.08;
      cam.y+=(targetY-cam.y)*0.08;
      clampCamera();
    } else {
      _trackedHumanId=null;
    }
  }

  updateHUD();
  _maybeUpdateUI(ts);

  // Refresh news panel if visible
  const _newsPanelEl=document.getElementById('news-panel');
  if(_newsPanelEl&&_newsPanelEl.style.display!=='none'&&Math.floor(ts/3000)!==Math.floor((ts-dt)/3000)){
    _renderNewsPanel();
  }

  renderFrame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── Structure panel — click any building to see its story ─────────────────────
let _structurePanelEl = null;

function _ensureStructurePanel(){
  if(_structurePanelEl) return _structurePanelEl;
  const p = document.createElement('div');
  p.id = 'structure-panel';
  p.style.display = 'none';
  document.body.appendChild(p);
  _structurePanelEl = p;
  return p;
}

function _hideStructurePanel(){
  if(_structurePanelEl) _structurePanelEl.style.display='none';
}

function _showStructurePanel(s){
  const p = _ensureStructurePanel();
  const civ = s.civId!=null && typeof civilizations!=='undefined' ? civilizations.get(s.civId) : null;
  const civColor = civ ? civ.color : '#888';
  const age = s.builtYear ? year - s.builtYear : '?';
  const hpPct = Math.round((s.hp/s.maxHp)*100);
  const hpColor = hpPct>60?'#4f4':hpPct>30?'#fa0':'#f44';

  // Find chronicle entries related to this structure's civ
  const relatedChron = typeof chronicle!=='undefined'
    ? chronicle.filter(e=>civ&&(e.title.includes(civ.name)||e.body.includes(civ.name))).slice(0,2)
    : [];

  // Flavor descriptions per structure type
  const FLAVOR = {
    palace:    'Símbolo del poder absoluto. Desde aquí se dictan las leyes que gobiernan el destino de miles.',
    citadel:   'Fortaleza inexpugnable. Sus muros han resistido asedios que habrían doblegado a cualquier otro.',
    cathedral: 'La fe hecha piedra. Generaciones han rezado bajo estas bóvedas buscando respuestas eternas.',
    temple:    'Un lugar sagrado donde los vivos hablan con los muertos y los dioses escuchan.',
    colosseum: 'El pueblo se reúne aquí para olvidar sus penas en el espectáculo del combate.',
    library:   'Cada pergamino guarda una vida de conocimiento. El saber acumulado de generaciones.',
    academy:   'Los mejores cerebros de la civilización se forman entre estas paredes.',
    university:'Centro del pensamiento avanzado. Aquí nacen las ideas que cambian el mundo.',
    observatory:'Desde aquí, los sabios leen el destino en las estrellas y miden el tiempo.',
    market:    'El corazón económico de la ciudad. Aquí se intercambian bienes, rumores y alianzas.',
    granary:   'Las reservas de comida que separan la prosperidad del hambre.',
    barracks:  'Donde los guerreros se forjan. El acero y la disciplina son las únicas leyes aquí.',
    watchtower:'Ojos que nunca duermen. Desde aquí se ve venir el peligro antes de que llegue.',
    palisade:  'La primera línea de defensa. Madera y determinación contra el mundo exterior.',
    forge:     'El fuego que transforma el metal en herramientas, armas y civilización.',
    workshop:  'Manos hábiles convierten madera y piedra en los objetos que sostienen la vida diaria.',
    harbor:    'La puerta al mundo. Desde aquí parten y llegan las riquezas del mar.',
    shipyard:  'Donde nacen los barcos que llevarán a esta gente más allá del horizonte.',
    aqueduct:  'Agua limpia para todos. Una obra de ingeniería que salva más vidas que cualquier ejército.',
    farm:      'La base de todo. Sin estas cosechas, no hay ciudad, no hay civilización.',
    mine:      'Las entrañas de la tierra revelan sus secretos a quienes se atreven a cavar.',
    well:      'Agua de vida. Simple, esencial, irremplazable.',
    hut:       'Un hogar. Pequeño, humilde, pero suficiente para soñar.',
    camp:      'El primer paso. Donde todo comenzó.',
    factory:   'La revolución industrial en un edificio. Produce más en un día que cien artesanos en un mes.',
    railway:   'El tiempo y la distancia se doblegaron ante el poder del vapor y el acero.',
    powerplant:'La electricidad fluye desde aquí hacia cada rincón de la civilización.',
    airport:   'El cielo ya no es el límite. La humanidad conquistó el aire.',
    road:      'Cada camino es una promesa de conexión entre pueblos.',
    carriage:  'Caballos y ruedas. La velocidad al servicio de la civilización.',
    animal_pen:'Los animales domesticados son el primer gran pacto entre la humanidad y la naturaleza.',
    nuclear_silo:'Aquí duerme el fin del mundo. Un botón separa la civilización de la extinción total. Nadie quiere usarlo. Todos saben que alguien lo hará.',
  };

  const flavor = FLAVOR[s.type] || 'Una estructura que da forma al mundo que la rodea.';

  let html = '';
  // Header
  html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,215,0,0.12)">`;
  html += `<span style="font-size:28px">${s.icon}</span>`;
  html += `<div style="flex:1">`;
  html += `<div style="font-size:15px;font-weight:bold;color:#e8d5a3">${s.label}</div>`;
  if(civ) html += `<div style="font-size:10px;color:${civColor};margin-top:2px">● ${civ.name}</div>`;
  html += `</div>`;
  html += `<button onclick="_hideStructurePanel()" style="background:none;border:none;color:#666;font-size:18px;cursor:pointer;padding:0 4px">✕</button>`;
  html += `</div>`;

  // Stats row
  html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">`;
  const statBox=(icon,val,label)=>`<div style="background:rgba(0,0,0,0.4);border-radius:6px;padding:5px;text-align:center">
    <div style="font-size:11px">${icon}</div>
    <div style="font-size:12px;font-weight:bold;color:#adf">${val}</div>
    <div style="font-size:8px;color:#445;text-transform:uppercase">${label}</div>
  </div>`;
  html += statBox('📅', age==='?' ? '?' : `${age} años`, 'Edad');
  html += statBox('🏗', s.builtBy ? s.builtBy.split(' ')[0] : '?', 'Constructor');
  html += statBox('📍', `${s.tx},${s.ty}`, 'Posición');
  html += `</div>`;

  // HP bar
  html += `<div style="margin-bottom:10px">`;
  html += `<div style="display:flex;justify-content:space-between;font-size:9px;color:#556;margin-bottom:3px"><span>Integridad estructural</span><span style="color:${hpColor}">${hpPct}%</span></div>`;
  html += `<div style="background:#111;border-radius:4px;height:6px"><div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:4px;transition:width 0.3s"></div></div>`;
  html += `</div>`;

  // Flavor text
  html += `<div style="font-size:11px;color:#9ab;line-height:1.6;font-style:italic;margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;border-left:2px solid rgba(255,215,0,0.2)">"${flavor}"</div>`;

  // Related chronicle entries
  if(relatedChron.length>0){
    html += `<div style="font-size:8px;color:#445;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">Eventos relacionados</div>`;
    for(const e of relatedChron){
      html += `<div style="margin-bottom:4px;padding:5px 8px;background:rgba(0,0,0,0.3);border-radius:5px;border-left:2px solid ${e.color}55">`;
      html += `<div style="font-size:9px;color:#556">${formatYear(e.year)}</div>`;
      html += `<div style="font-size:10px;color:#ccc;margin-top:1px">${e.icon} ${e.title}</div>`;
      html += `</div>`;
    }
  }

  p.innerHTML = html;
  p.style.display = 'block';
}

// ── Chronicle panel ───────────────────────────────────────────────────────────
function _renderChronicleEpic(content){
  // Build full chronicle HTML (stats + epic narrative)
  _renderChronicle(content);

  const chronicleData = typeof chronicle !== 'undefined' ? chronicle : [];
  const majorData = typeof majorEvents !== 'undefined' ? majorEvents : [];

  // Remove the old plain events section appended by _renderChronicle
  let html = content.innerHTML;
  const SENTINEL = 'Crónica — Grandes Eventos';
  const idx = html.lastIndexOf(SENTINEL);
  if(idx !== -1){
    const divStart = html.lastIndexOf('<div', idx);
    if(divStart !== -1) html = html.slice(0, divStart);
  }

  html += `<div style="font-size:8px;color:#445;letter-spacing:2px;margin-bottom:8px;text-transform:uppercase">📜 Crónica del Mundo</div>`;

  if(chronicleData.length === 0 && majorData.length === 0){
    html += `<div style="color:#333;font-size:10px;text-align:center;padding:14px">Los anales de la historia están vacíos aún…</div>`;
  } else {
    for(const e of chronicleData.slice(0, 30)){
      html += `<div style="margin-bottom:8px;padding:8px 10px;background:rgba(0,0,0,0.28);border-radius:6px;border-left:3px solid ${e.color}88">`;
      html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:16px">${e.icon}</span><div style="flex:1">`;
      html += `<div style="font-size:11px;font-weight:bold;color:#e8d5a3">${e.title}</div>`;
      html += `<div style="font-size:8px;color:#445;letter-spacing:1px">${formatYear(e.year)}</div>`;
      html += `</div></div><div style="font-size:10px;color:#9ab;line-height:1.6;font-style:italic">${e.body}</div></div>`;
    }
    const chronicleYears = new Set(chronicleData.map(e => e.year));
    const remaining = majorData.filter(e => !chronicleYears.has(e.year)).slice(0, 20);
    if(remaining.length > 0){
      html += `<div style="font-size:8px;color:#334;letter-spacing:1px;margin:8px 0 5px;text-transform:uppercase">Otros eventos</div>`;
      for(const ev of remaining){
        html += `<div style="margin-bottom:3px;padding:4px 8px;background:rgba(0,0,0,0.18);border-radius:4px;font-size:10px;color:#778"><span style="color:#334;font-size:8px">${formatYear(ev.year)}</span> ${ev.text}</div>`;
      }
    }
  }
  content.innerHTML = html;
}

// ── Social Stats Panel ────────────────────────────────────────────────────────
const _statsEl = document.getElementById('stats-content');
let _statsTimer = 0;

function _updateStatsPanel(){
  if(!_statsEl) return;
  _statsTimer++;
  if(_statsTimer < 10) return; // update ~6fps
  _statsTimer = 0;

  const alive = getAlive();
  const n = alive.length;
  if(n === 0){ _statsEl.innerHTML = '<div style="color:#445;padding:8px">Sin población</div>'; return; }

  // ── Compute world stats ──────────────────────────────────────────────────
  let totalWars=0, totalAlliances=0, totalTreaties=0;
  let totalInventions=0, religions=new Set(), totalHonor=0;
  let civCount=0, nomadCount=0, atWarCivs=0;
  let maxPop=0, dominantCiv=null;
  let totalMilitary=0, totalKnowledge=0;
  const civList=[];
  if(typeof civilizations!=='undefined'){
    for(const [,c] of civilizations){
      if(c.population===0) continue;
      civList.push(c);
      civCount++;
      totalWars += c.atWarWith ? c.atWarWith.size : 0;
      totalAlliances += c.allies ? c.allies.size : 0;
      totalInventions += c.inventions ? c.inventions.size : 0;
      if(c.religion) religions.add(c.religion);
      totalHonor += c.honor||0;
      totalMilitary += c.militaryPower||0;
      totalKnowledge += c.avgKnowledge||0;
      if(c.nomadic) nomadCount++;
      if(c.atWarWith && c.atWarWith.size>0) atWarCivs++;
      if(c.population>maxPop){maxPop=c.population;dominantCiv=c;}
    }
  }
  totalWars = Math.floor(totalWars/2);
  totalAlliances = Math.floor(totalAlliances/2);
  const avgHonor = civCount>0 ? Math.round(totalHonor/civCount) : 0;
  const avgCivK = civCount>0 ? Math.round(totalKnowledge/civCount) : 0;

  // Human stats
  let sick=0, soldiers=0, leaders=0, prodigies=0, bandits=0;
  let totalAge=0, totalChildren=0, totalKills=0, totalWealth=0;
  let hungry=0, tired=0, happy=0;
  let maxAge=0, maxKills=0, maxChildren=0, maxK=0;
  let oldestH=null, killerH=null, parentH=null, scholarH=null;
  for(const h of alive){
    if(h.sick) sick++;
    if(h.isSoldier) soldiers++;
    if(h.isLeader) leaders++;
    if(h.isProdigy) prodigies++;
    if(h._isBandit) bandits++;
    if(h.hunger<30) hungry++;
    if(h.energy<20) tired++;
    if(h.social>70&&h.health>70&&h.hunger>60) happy++;
    totalAge+=h.age; totalChildren+=h.children;
    totalKills+=h.kills; totalWealth+=h.wealth||0;
    if(h.age>maxAge){maxAge=h.age;oldestH=h;}
    if(h.kills>maxKills){maxKills=h.kills;killerH=h;}
    if(h.children>maxChildren){maxChildren=h.children;parentH=h;}
    if(h.knowledge>maxK){maxK=h.knowledge;scholarH=h;}
  }
  const avgAge = Math.round(totalAge/n);
  const avgChildren = (totalChildren/n).toFixed(1);
  const avgKills = (totalKills/n).toFixed(2);
  const happyPct = Math.round(happy/n*100);
  const sickPct = Math.round(sick/n*100);
  const soldierPct = Math.round(soldiers/n*100);

  // Trade routes
  const tradeRoutes = typeof getTradeRoutes!=='undefined' ? getTradeRoutes().length : 0;

  // Globalization
  const globLvl = typeof getGlobalizationLevel!=='undefined' ? Math.round(getGlobalizationLevel()*100) : 0;

  // Active outbreaks
  const outbreaks = typeof activeOutbreaks!=='undefined' ? activeOutbreaks.length : 0;

  // Structures
  const structCount = typeof structures!=='undefined' ? structures.length : 0;

  // ── Build HTML ───────────────────────────────────────────────────────────
  const val=(v,color='#adf')=>`<span class="stat-value" style="color:${color}">${v}</span>`;
  const row=(label,v,color)=>`<div class="stat-row"><span class="stat-label">${label}</span>${val(v,color)}</div>`;
  const bar=(pct,color)=>`<div class="stat-bar-h"><div class="stat-bar-h-fill" style="width:${Math.min(100,pct)}%;background:${color}"></div></div>`;
  const section=(title,content)=>`<div class="stat-section"><div class="stat-section-title">${title}</div>${content}</div>`;

  let html='';

  // ── Población ──
  const popColor = n>3000?'#f84':n>1000?'#fda':n>200?'#8f8':'#adf';
  html += section('👥 Población',
    row('Vivos',n,popColor)+
    row('Edad media',`${avgAge} años`,'#adf')+
    row('Hijos/persona',avgChildren,'#f9a')+
    row('Hambrientos',`${hungry} (${Math.round(hungry/n*100)}%)`,hungry>n*0.3?'#f44':'#8f8')+
    row('Cansados',`${tired}`,tired>n*0.3?'#f84':'#adf')+
    row('Felices',`${happyPct}%`,happyPct>60?'#8f8':happyPct>30?'#fda':'#f84')+
    bar(happyPct,'#4f8')
  );

  // ── Sociedad ──
  html += section('🏛 Sociedad',
    row('Civilizaciones',civCount,'#fda')+
    row('Nómadas',nomadCount,nomadCount>0?'#f84':'#667')+
    row('Soldados',`${soldiers} (${soldierPct}%)`,soldierPct>30?'#f84':soldierPct>10?'#fda':'#8ac')+
    row('Líderes',leaders,'#ffd700')+
    (prodigies>0?row('Prodigios',prodigies,'#ff88ff'):'')+
    (bandits>0?row('Bandidos',bandits,'#f44'):'')+
    row('Honor medio',`${avgHonor}`,avgHonor>70?'#8f8':avgHonor>40?'#fda':'#f84')
  );

  // ── Diplomacia ──
  const peaceColor = atWarCivs===0?'#8f8':atWarCivs<civCount/2?'#fda':'#f44';
  html += section('⚔️ Diplomacia',
    row('Guerras activas',totalWars,totalWars>0?'#f44':'#8f8')+
    row('Civs en guerra',atWarCivs,peaceColor)+
    row('Alianzas',totalAlliances,'#4af')+
    row('Rutas comerciales',tradeRoutes,'#fda')+
    row('Religiones',religions.size,'#d0a0ff')+
    row('Globalización',`${globLvl}%`,globLvl>50?'#4af':'#667')
  );

  // ── Conocimiento ──
  html += section('🧠 Conocimiento',
    row('Saber medio civ',avgCivK,'#a8f')+
    row('Inventos totales',totalInventions,'#4ff')+
    row('Enfermos',`${sick} (${sickPct}%)`,sickPct>20?'#f44':sickPct>5?'#f84':'#8f8')+
    row('Brotes activos',outbreaks,outbreaks>3?'#f44':outbreaks>0?'#f84':'#8f8')+
    row('Estructuras',structCount,'#adf')+
    bar(Math.min(100,avgCivK/1000),'#a8f')
  );

  // ── Conflicto ──
  html += section('🗡️ Conflicto',
    row('Muertes en combate',totalKills,'#f88')+
    row('Kills/persona',avgKills,parseFloat(avgKills)>1?'#f44':'#8ac')+
    row('Poder militar',Math.round(totalMilitary),'#f84')
  );

  // ── Récords ──
  let records='';
  if(oldestH) records+=row('Más viejo',`${oldestH.name.split(' ')[0]} (${Math.round(oldestH.age)}a)`,'#ffd700');
  if(killerH&&killerH.kills>0) records+=row('Más letal',`${killerH.name.split(' ')[0]} (${killerH.kills}💀)`,'#f44');
  if(parentH&&parentH.children>0) records+=row('Más prolífico',`${parentH.name.split(' ')[0]} (${parentH.children}👶)`,'#f9a');
  if(scholarH&&scholarH.knowledge>0) records+=row('Más sabio',`${scholarH.name.split(' ')[0]} (${Math.round(scholarH.knowledge)}📚)`,'#a8f');
  if(records) html += section('🏆 Récords', records);

  // ── Top civs ──
  if(civList.length>0){
    const sorted = civList.slice().sort((a,b)=>b.population-a.population).slice(0,4);
    let civHtml='';
    for(const c of sorted){
      const leader = typeof _hById!=='undefined'?_hById(c.leaderId):null;
      const atWar = c.atWarWith&&c.atWarWith.size>0;
      const inGoldenAge = typeof _goldenAgeCivs!=='undefined'&&_goldenAgeCivs.has(c.id);
      const societyTier = typeof _getSocietyTier!=='undefined'?_getSocietyTier(c):null;
      const formation = typeof _getFormationType!=='undefined'?_getFormationType(c.techLevel):null;
      const invIcons={'escritura':'📝','rueda':'⚙️','imprenta':'📖','brujula':'🧭','telescopio':'🔭','vapor':'♨️','electricidad':'⚡','radio':'📡'};
      const weaponName=typeof WEAPON_TIERS!=='undefined'?WEAPON_TIERS[Math.min((c.techLevel||0)+1,WEAPON_TIERS.length-1)]:'?';
      civHtml+=`<div class="civ-row" style="border-left-color:${c.color}${inGoldenAge?';box-shadow:0 0 6px rgba(255,215,0,0.3)':''}">
        <div class="civ-row-name" style="color:${c.color}">${c.name} ${atWar?'⚔️':c.allies.size>2?'🤝':''} ${inGoldenAge?'🌟':''}</div>
        ${societyTier?`<div style="color:#888;font-size:9px;margin-bottom:2px">${societyTier.icon} ${societyTier.name} · ${societyTier.desc}</div>`:''}
        <div class="civ-row-stats">
          <span>👥${c.population}</span>
          <span>🧠${Math.round(c.avgKnowledge||0)}</span>
          <span>🏅${Math.round(c.honor)}</span>
          ${c.tradePartners&&c.tradePartners.size>0?`<span>🤝${c.tradePartners.size}</span>`:''}
          ${c.religion?`<span style="color:#d0a0ff">🛕</span>`:''}
          ${formation?`<span title="Formación militar">${formation.icon}</span>`:''}
          ${c.inventions&&c.inventions.size>0?`<span>${[...c.inventions].slice(0,3).map(id=>invIcons[id]||'💡').join('')}</span>`:''}
          ${leader&&leader.alive?`<span style="color:#ffd700">👑${leader.name.split(' ')[0]}</span>`:''}
        </div>
        <div style="font-size:9px;color:#666;margin-top:1px">${weaponName} · Tech ${c.techLevel||0}</div>
      </div>`;
    }
    html += section('🌍 Civilizaciones', civHtml);
  }

  _statsEl.innerHTML = html;
}

function _toggleStatsPanel(){
  const p = document.getElementById('stats-panel');
  const btn = document.getElementById('stats-toggle');
  if(!p) return;
  p.classList.toggle('collapsed');
  if(btn) btn.textContent = p.classList.contains('collapsed') ? '▶' : '◀';
}

// ── Settings panel ────────────────────────────────────────────────────────────
let _popTarget = 0; // 0 = unlimited

// Knowledge levels matching each era's year threshold
const _ERA_KNOWLEDGE = {
  1:     50,
  100:   200,
  400:   600,
  1000:  1500,
  2500:  3500,
  5000:  7000,
  8000:  12000,
  12000: 20000,
  25000: 40000,
  60000: 80000,
};

function _jumpEra(targetYear) {
  if (targetYear <= 0) return;
  year = targetYear;
  const targetKnowledge = _ERA_KNOWLEDGE[targetYear] || 50;
  const targetResources = Math.min(50, 10 + Math.floor(targetKnowledge / 1000));
  // Boost all alive humans to era knowledge + give them resources
  const alive = getAlive();
  for (const h of alive) {
    if (!h.alive) continue;
    h.knowledge = Math.max(h.knowledge, targetKnowledge * (0.7 + Math.random() * 0.6));
    h.inventory.food  = Math.max(h.inventory.food,  targetResources);
    h.inventory.wood  = Math.max(h.inventory.wood,  targetResources);
    h.inventory.stone = Math.max(h.inventory.stone, targetResources);
    h.hunger = 100; h.health = 100; h.energy = 100;
  }
  // Boost civ knowledge too
  if (typeof civilizations !== 'undefined') {
    for (const [, civ] of civilizations) {
      civ.knowledge = Math.max(civ.knowledge || 0, targetKnowledge);
    }
  }
  // Force intel modifier up to match era
  if (typeof _userIntelBias !== 'undefined') {
    _userIntelBias = Math.max(_userIntelBias, Math.min(0.8, targetKnowledge / 100000));
  }
  // Dirty caches
  if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
  _aliveDirty = true;
  addWorldEvent(`⏩ Salto temporal — ${getEra(year).name} (Año ${year.toLocaleString()})`);
}

function _setSpeed(idx) {
  speedIndex = idx;
  _checkSpeedChange();
  // Update button states
  document.querySelectorAll('#set-speed-group .sg-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val) === idx);
  });
}

function _setPop(val) {
  _popTarget = val;
  document.querySelectorAll('#set-pop-group .sg-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val) === val);
  });
}

function _applyIntel(val) {
  if (typeof _userIntelBias !== 'undefined') _userIntelBias = parseInt(val) / 100;
  const v = document.getElementById('set-intel-val');
  if (v) v.textContent = Math.round((1.2 + parseInt(val)/100) * 100) + '%';
}

function _applyDayLen(val) {
  window._dayRealMsOverride = parseInt(val) * 1000;
  const v = document.getElementById('set-daylen-val');
  if (v) v.textContent = val + 's';
}

function _toggleSettingsPanel(){
  const p = document.getElementById('settings-panel');
  const btn = document.getElementById('btn-settings');
  if(!p) return;
  const open = p.style.display === 'none' || p.style.display === '';
  p.style.display = open ? 'block' : 'none';
  if(btn) btn.classList.toggle('active', open);
  if (open) {
    // Sync speed buttons
    document.querySelectorAll('#set-speed-group .sg-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.val) === speedIndex);
    });
    // Sync intel slider
    const intel = document.getElementById('set-intel');
    if (intel && typeof _userIntelBias !== 'undefined') {
      intel.value = Math.round(_userIntelBias * 100);
      const v = document.getElementById('set-intel-val');
      if (v) v.textContent = Math.round((1.2 + _userIntelBias) * 100) + '%';
    }
  }
}

function _applySettings() {} // legacy no-op — kept for safety

function _simToggle(key) {
  if (typeof window._simToggles === 'undefined') return;
  window._simToggles[key] = !window._simToggles[key];
  const btn = document.querySelector(`#set-toggles [data-key="${key}"]`);
  if (btn) btn.classList.toggle('active', window._simToggles[key]);
  // Side effects when toggling off
  if (!window._simToggles[key]) {
    if (key === 'plagues' && typeof activeOutbreaks !== 'undefined') {
      activeOutbreaks.length = 0;
    }
    if (key === 'wars') {
      if (typeof humans !== 'undefined') {
        for (const h of humans) {
          if (!h.alive) continue;
          if (h._warTimer > 0) h._warTimer = 0;
          if (h.action === ACTIONS.LEAD) h.action = ACTIONS.IDLE;
        }
      }
    }
  }
  // Side effects when toggling ON
  if (window._simToggles[key]) {
    if (key === 'extinction') {
      // Restore stats so nobody dies the instant extinction is re-enabled
      if (typeof humans !== 'undefined') {
        for (const h of humans) {
          if (!h.alive) continue;
          h.health  = Math.max(h.health,  60);
          h.hunger  = Math.max(h.hunger,  60);
          h.energy  = Math.max(h.energy,  40);
          h.sick    = false;
          h.sickType = null;
          h.sickTimer = 0;
          // Reset age to a safe value so nobody dies of old age immediately
          h.age = Math.min(h.age, 35);
        }
      }
    }
  }
}
