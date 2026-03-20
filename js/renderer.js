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

function renderFrame(dt){
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

  // Territory outlines (drawn before structures)
  if(typeof civilizations!=='undefined') _drawTerritories();

  // City glow halos (drawn under structures for epic feel)
  if(typeof structures!=='undefined'&&cam.zoom>0.6) _drawCityGlows();

  // Structures
  if(typeof structures!=='undefined') _drawStructures();

  // Humans
  if(typeof humans!=='undefined') _drawHumans();

  _ctx.restore();

  // UI overlays (screen-space)
  _drawLegend();
  _drawWorldEvents();
  _drawIntelligenceCurve();
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
  const W=WORLD_W*TILE, H=WORLD_H*TILE;
  if(!_territoryCanvas){
    _territoryCanvas=document.createElement('canvas');
    _territoryCanvas.width=W;_territoryCanvas.height=H;
    _territoryCtx=_territoryCanvas.getContext('2d');
  }
  const ctx=_territoryCtx;
  ctx.clearRect(0,0,W,H);

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

  // One pass per civ: batch fill rects, then batch border rects
  for(const [,civ] of civilizations){
    if(civ.population===0||civ.territory.size===0)continue;
    ctx.fillStyle=civ.color;
    // Fill interior tiles
    ctx.globalAlpha=0.15;
    for(const key of civ.territory){
      const comma=key.indexOf(',');
      const tx=+key.slice(0,comma), ty=+key.slice(comma+1);
      if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H)continue;
      ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);
    }
    // Border tiles — only at higher zoom
    if(showBorders){
      ctx.globalAlpha=0.55;
      for(const key of civ.territory){
        const comma=key.indexOf(',');
        const tx=+key.slice(0,comma), ty=+key.slice(comma+1);
        if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H)continue;
        const isBorder=grid[(ty-1)*WORLD_W+tx]!==civ.id||grid[(ty+1)*WORLD_W+tx]!==civ.id||
                       grid[ty*WORLD_W+(tx-1)]!==civ.id||grid[ty*WORLD_W+(tx+1)]!==civ.id;
        if(isBorder)ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);
      }
    }
  }
  ctx.globalAlpha=1;
  _territoryDirty=false;
}

function _drawTerritories(){
  if(cam.zoom<0.4)return;
  // Rebuild at most every 90 frames or when dirty
  _territoryFrame++;
  if(_territoryDirty||_territoryFrame>=90){
    _territoryFrame=0;
    _rebuildTerritoryCanvas();
  }
  if(!_territoryCanvas)return;
  const alpha=Math.min(0.9,(cam.zoom-0.3)*0.7);
  _ctx.globalAlpha=alpha;
  _ctx.drawImage(_territoryCanvas,0,0);
  _ctx.globalAlpha=1;
}

// ── City glow halos ───────────────────────────────────────────────────────────
let _cityGlowCache=[];
let _cityGlowDirty=true;

function markCityGlowDirty(){ _cityGlowDirty=true; }

function _rebuildCityGlows(){
  _cityGlowDirty=false;
  _cityGlowCache=[];
  if(!structures||structures.length===0)return;
  const epicTypes=new Set(['citadel','palace','cathedral','colosseum','university','observatory','academy']);
  // Use a grid to cluster — O(n) instead of O(n²)
  const CELL=20;
  const cellMap=new Map();
  for(const s of structures){
    const ck=`${Math.floor(s.tx/CELL)},${Math.floor(s.ty/CELL)}`;
    if(!cellMap.has(ck))cellMap.set(ck,{count:0,sumX:0,sumY:0,hasEpic:false,civId:s.civId});
    const c=cellMap.get(ck);
    c.count++;c.sumX+=s.tx;c.sumY+=s.ty;
    if(epicTypes.has(s.type))c.hasEpic=true;
  }
  for(const [,c] of cellMap){
    if(c.count<5)continue;
    const civ=c.civId!=null&&typeof civilizations!=='undefined'?civilizations.get(c.civId):null;
    _cityGlowCache.push({
      cx:(c.sumX/c.count)*TILE+TILE/2,
      cy:(c.sumY/c.count)*TILE+TILE/2,
      r:Math.min(180,c.count*10+40),
      color:civ?civ.color:'#ffd700',
      epic:c.hasEpic,
    });
  }
}

function _drawCityGlows(){
  if(_cityGlowDirty)_rebuildCityGlows();
  if(_cityGlowCache.length===0)return;
  for(const g of _cityGlowCache){
    const screenX=g.cx*cam.zoom+cam.x;
    const screenY=g.cy*cam.zoom+cam.y;
    const sr=g.r*cam.zoom;
    if(screenX<-sr||screenX>_canvas.width+sr||screenY<-sr||screenY>_canvas.height+sr)continue;
    const alpha=g.epic?0.10:0.06;
    // Use a simple color string — avoid expensive string replace every frame
    _ctx.globalAlpha=alpha;
    _ctx.fillStyle=g.color;
    _ctx.beginPath();
    _ctx.arc(g.cx,g.cy,g.r,0,Math.PI*2);
    _ctx.fill();
    _ctx.globalAlpha=1;
  }
}
const STRUCTURE_HEIGHT={
  camp:0,hut:1,farm:0,mine:1,market:2,temple:3,well:1,workshop:1,
  palisade:2,barracks:2,granary:2,watchtower:4,library:2,forge:2,
  harbor:2,aqueduct:3,academy:3,colosseum:4,barracks:2,
  citadel:5,cathedral:5,palace:6,university:4,observatory:4,
};

function _drawStructures(){
  if(!structures||structures.length===0) return;
  _ctx.textAlign='center';
  _ctx.textBaseline='middle';

  const vx0=Math.floor(-cam.x/cam.zoom/TILE)-1, vy0=Math.floor(-cam.y/cam.zoom/TILE)-1;
  const vx1=vx0+Math.ceil(_canvas.width/cam.zoom/TILE)+2;
  const vy1=vy0+Math.ceil(_canvas.height/cam.zoom/TILE)+2;
  const showIcons=cam.zoom>0.5;
  const showLabels=cam.zoom>2.5;
  const showShadow=cam.zoom>0.8;
  const showHP=cam.zoom>0.8;

  for(const s of structures){
    if(s.tx<vx0||s.tx>vx1||s.ty<vy0||s.ty>vy1)continue;
    const px=s.tx*TILE+TILE/2, py=s.ty*TILE+TILE/2;
    const tier=STRUCTURE_HEIGHT[s.type]||0;

    // Background tint
    const civ=s.civId!=null&&typeof civilizations!=='undefined'?civilizations.get(s.civId):null;
    _ctx.globalAlpha=0.3+tier*0.07;
    _ctx.fillStyle=civ?civ.color:s.color;
    _ctx.fillRect(s.tx*TILE,s.ty*TILE,TILE,TILE);
    _ctx.globalAlpha=1;

    // Shadow for tall buildings
    if(tier>=2&&showShadow){
      _ctx.fillStyle=`rgba(0,0,0,${Math.min(0.45,tier*0.07)})`;
      _ctx.fillRect(s.tx*TILE+2,s.ty*TILE+TILE-(tier*2),TILE-2,tier*2);
    }

    // HP bar
    if(showHP&&s.hp<s.maxHp){
      _ctx.fillStyle='#300';
      _ctx.fillRect(s.tx*TILE,s.ty*TILE+TILE-2,TILE,2);
      _ctx.fillStyle='#f44';
      _ctx.fillRect(s.tx*TILE,s.ty*TILE+TILE-2,TILE*(s.hp/s.maxHp),2);
    }

    // Icon
    if(showIcons){
      const iconScale=tier>=4?1.05:tier>=2?0.92:0.82;
      _ctx.font=`${Math.round(TILE*iconScale)}px serif`;
      _ctx.fillText(s.icon,px,py);
    }

    // Label
    if(showLabels){
      _ctx.font='6px sans-serif';
      _ctx.fillStyle='rgba(255,255,255,0.8)';
      _ctx.fillText(s.label,px,py+TILE*0.7);
    }
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
  const showName=cam.zoom>2;
  const showWeapon=cam.zoom>1.5;
  const showRings=cam.zoom>0.7;

  for(const h of humans){
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
      const pulse=0.55+Math.sin(Date.now()*0.003+h.id)*0.45;
      _ctx.beginPath();
      _ctx.arc(px,py,r+7+pulse*4,0,Math.PI*2);
      _ctx.strokeStyle=h.color;
      _ctx.lineWidth=2.5;
      _ctx.globalAlpha=0.7*pulse;
      _ctx.stroke();
      _ctx.globalAlpha=1;
      // Inner glow fill
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
  // Sample every ~50 years
  _intelHistoryTimer++;
  if(_intelHistoryTimer>30){
    _intelHistoryTimer=0;
    _intelHistory.push(_intelModifier);
    if(_intelHistory.length>80)_intelHistory.shift();
  }
  if(_intelHistory.length<2)return;

  const ctx=_ctx;
  const gw=160,gh=50,gx=_canvas.width/2-gw/2,gy=14;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.55)';
  _roundRect(ctx,gx-4,gy-4,gw+8,gh+20,6);
  ctx.fill();

  // Label
  ctx.font='9px sans-serif';
  ctx.fillStyle='#adf';
  ctx.textAlign='center';
  ctx.fillText(`🧠 Inteligencia Global: ${(_intelModifier*100).toFixed(0)}%`,gx+gw/2,gy+gh+12);

  // Graph line
  ctx.beginPath();
  for(let i=0;i<_intelHistory.length;i++){
    const x=gx+i*(gw/(_intelHistory.length-1));
    const y=gy+gh-((_intelHistory[i]-0.4)/1.2)*gh;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  // Color based on current value
  const v=_intelModifier;
  ctx.strokeStyle=v>1.2?'#4ff':v>0.8?'#4f4':'#f84';
  ctx.lineWidth=2;
  ctx.stroke();

  // Current value dot
  const lastX=gx+gw;
  const lastY=gy+gh-((v-0.4)/1.2)*gh;
  ctx.beginPath();
  ctx.arc(lastX,lastY,3,0,Math.PI*2);
  ctx.fillStyle=v>1.2?'#4ff':v>0.8?'#4f4':'#f84';
  ctx.fill();

  // Baseline
  ctx.beginPath();
  ctx.moveTo(gx,gy+gh*0.5);ctx.lineTo(gx+gw,gy+gh*0.5);
  ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;ctx.stroke();

  ctx.restore();
}

// ── Legend overlay ────────────────────────────────────────────────────────────
let _legendVisible = true;
function toggleLegend(){ _legendVisible=!_legendVisible; }

function _drawLegend(){
  if(!_legendVisible) return;
  const ctx=_ctx;
  const x=14, y=_canvas.height-14;
  const baseItems=[
    ['⚪','Humano (anillo = civilización)'],
    ['👑','Líder'],['🦠','Enfermo'],['⚔️','Soldado'],
    ['🔥','Campamento'],['🏠','Cabaña'],['🌾','Cultivo'],
    ['⛏','Mina'],['🏪','Mercado'],['🛕','Templo'],
    ['🪵','Empalizada'],['⚔️','Cuartel'],['🌽','Granero'],
    ['🗼','Torre Vigía'],['⚓','Puerto'],
  ];
  const extraItems=[];
  if(typeof _unlockedTypes!=='undefined'){
    if(_unlockedTypes.has('well'))        extraItems.push(['💧','Pozo']);
    if(_unlockedTypes.has('workshop'))    extraItems.push(['🔨','Taller']);
    if(_unlockedTypes.has('library'))     extraItems.push(['📚','Biblioteca']);
    if(_unlockedTypes.has('forge'))       extraItems.push(['⚒️','Forja']);
    if(_unlockedTypes.has('academy'))     extraItems.push(['🎓','Academia']);
    if(_unlockedTypes.has('colosseum'))   extraItems.push(['🏟','Coliseo']);
    if(_unlockedTypes.has('aqueduct'))    extraItems.push(['🌊','Acueducto']);
    if(_unlockedTypes.has('university'))  extraItems.push(['🏫','Universidad']);
    if(_unlockedTypes.has('observatory')) extraItems.push(['🔭','Observatorio']);
    if(_unlockedTypes.has('citadel'))     extraItems.push(['🏰','Ciudadela']);
    if(_unlockedTypes.has('cathedral'))   extraItems.push(['⛪','Catedral']);
    if(_unlockedTypes.has('palace'))      extraItems.push(['🏯','Palacio']);
  }
  const items=[...baseItems,...extraItems];
  const lh=16, pad=8;
  const bh=items.length*lh+pad*2;
  const bw=230;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)';
  _roundRect(ctx,x,y-bh,bw,bh,8);
  ctx.fill();
  ctx.font='10px sans-serif';
  items.forEach(([icon,label],i)=>{
    const ly=y-bh+pad+(i+0.75)*lh;
    ctx.fillStyle='#ddd';
    ctx.fillText(`${icon} ${label}`,x+pad,ly);
  });
  ctx.restore();
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
