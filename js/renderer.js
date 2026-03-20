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

// Center camera on a world tile position
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

  // Structures
  if(typeof structures!=='undefined') _drawStructures();

  // Humans
  if(typeof humans!=='undefined') _drawHumans();

  _ctx.restore();

  // UI overlays (screen-space)
  _drawLegend();
  _drawWorldEvents();
}

// ── Structures ────────────────────────────────────────────────────────────────
function _drawStructures(){
  if(!structures||structures.length===0) return;
  _ctx.textAlign='center';
  _ctx.textBaseline='middle';
  for(const s of structures){
    const px=s.tx*TILE+TILE/2, py=s.ty*TILE+TILE/2;
    // Background square
    _ctx.fillStyle=s.color+'88';
    _ctx.fillRect(s.tx*TILE,s.ty*TILE,TILE,TILE);
    // Icon
    if(cam.zoom>0.8){
      _ctx.font=`${Math.round(TILE*0.85)}px serif`;
      _ctx.fillText(s.icon,px,py);
    }
  }
  _ctx.textBaseline='alphabetic';
}

// ── Humans ────────────────────────────────────────────────────────────────────
function _drawHumans(){
  const r=Math.max(3,TILE*0.75);
  _ctx.textAlign='center';
  for(const h of humans){
    if(!h.alive) continue;
    const px=h.px, py=h.py;

    // Civ color ring
    if(h.civId!==null&&h.civId!==undefined){
      const civ=typeof civilizations!=='undefined'?civilizations.get(h.civId):null;
      if(civ){
        _ctx.beginPath();
        _ctx.arc(px,py,r+3,0,Math.PI*2);
        _ctx.strokeStyle=civ.color;
        _ctx.lineWidth=2;
        _ctx.stroke();
      }
    }

    // Leader crown indicator
    if(h.isLeader&&cam.zoom>1){
      _ctx.font=`${Math.round(r*1.2)}px serif`;
      _ctx.fillText('👑',px,py-r-4);
    }

    // Outer glow for selected
    if(h.selected){
      _ctx.beginPath();
      _ctx.arc(px,py,r+5,0,Math.PI*2);
      _ctx.fillStyle='rgba(255,255,255,0.25)';
      _ctx.fill();
    }

    // Body
    _ctx.beginPath();
    _ctx.arc(px,py,r,0,Math.PI*2);
    _ctx.fillStyle=h.color;
    _ctx.fill();

    // Gender dot
    _ctx.beginPath();
    _ctx.arc(px,py,r*0.4,0,Math.PI*2);
    _ctx.fillStyle=h.gender==='F'?'#ffaacc':'#aaccff';
    _ctx.fill();

    // Disease indicator
    if(h.sick&&cam.zoom>0.7){
      _ctx.font=`${Math.round(r*1.1)}px serif`;
      _ctx.fillText('🦠',px+r,py-r);
    }

    // War flash (attacked)
    if(h._warFlash>0){
      h._warFlash--;
      _ctx.beginPath();
      _ctx.arc(px,py,r+4,0,Math.PI*2);
      _ctx.strokeStyle='rgba(255,50,50,0.85)';
      _ctx.lineWidth=3;
      _ctx.stroke();
    }

    // Health bar
    if(cam.zoom>0.9){
      const bw=TILE*1.5, bx=px-bw/2, by=py-r-6;
      _ctx.fillStyle='#111';
      _ctx.fillRect(bx,by,bw,3);
      _ctx.fillStyle=h.health>60?'#4f4':h.health>30?'#fa0':'#f44';
      _ctx.fillRect(bx,by,bw*(h.health/100),3);
      _ctx.fillStyle='#111';
      _ctx.fillRect(bx,by+4,bw,2);
      _ctx.fillStyle='#f90';
      _ctx.fillRect(bx,by+4,bw*(h.hunger/100),2);
    }

    // Name at high zoom
    if(cam.zoom>2){
      _ctx.font='8px sans-serif';
      _ctx.fillStyle='rgba(255,255,255,0.95)';
      _ctx.fillText(h.name.split(' ')[0],px,py-r-10);
    }
  }
}

// ── Legend overlay (screen-space) ─────────────────────────────────────────────
let _legendVisible = true;
function toggleLegend(){ _legendVisible=!_legendVisible; }

function _drawLegend(){
  if(!_legendVisible) return;
  const ctx=_ctx;
  const x=14, y=_canvas.height-14;
  const baseItems=[
    ['⚪','Humano (anillo = civilización)'],
    ['👑','Líder'],['🦠','Enfermo'],
    ['🏠','Cabaña'],['🌾','Cultivo'],['🔥','Campamento'],
    ['⛏','Mina'],['🏪','Mercado'],['🏛','Templo'],
  ];
  // Add unlocked structures dynamically
  const extraItems=[];
  if(typeof _unlockedTypes!=='undefined'){
    if(_unlockedTypes.has('well'))        extraItems.push(['💧','Pozo']);
    if(_unlockedTypes.has('workshop'))    extraItems.push(['🔨','Taller']);
    if(_unlockedTypes.has('library'))     extraItems.push(['📚','Biblioteca']);
    if(_unlockedTypes.has('forge'))       extraItems.push(['⚒️','Forja']);
    if(_unlockedTypes.has('academy'))     extraItems.push(['🎓','Academia']);
    if(_unlockedTypes.has('colosseum'))   extraItems.push(['🏟','Coliseo']);
    if(_unlockedTypes.has('university'))  extraItems.push(['🏫','Universidad']);
    if(_unlockedTypes.has('observatory')) extraItems.push(['🔭','Observatorio']);
  }
  const items=[...baseItems,...extraItems];
  const lh=17, pad=10;
  const bh=items.length*lh+pad*2;
  const bw=220;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)';
  _roundRect(ctx,x,y-bh,bw,bh,8);
  ctx.fill();
  ctx.font='11px sans-serif';
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
  const maxShow=6;
  const events=worldEvents.slice(0,maxShow);
  const lh=18, pad=10, bw=280;
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
