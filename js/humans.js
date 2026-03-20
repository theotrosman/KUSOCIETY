// ═══════════════════════════════════════════════════════════════════════════════
// HUMANS.JS — Civilización, supervivencia, ciudades, exploración, armamentos
// ═══════════════════════════════════════════════════════════════════════════════

const FIRST_NAMES_M=['Arek','Bren','Cael','Dorn','Eron','Fael','Gorn','Hael','Ivar','Jorn','Kael','Lorn','Morn','Nael','Orin','Rael','Sorn','Tael','Uran','Vorn','Wren','Zael','Aldor','Bram','Crix','Davan','Edric','Feron'];
const FIRST_NAMES_F=['Aira','Bora','Cira','Duna','Elra','Fira','Gira','Hira','Iren','Jora','Kira','Lira','Mira','Nara','Oira','Rira','Sora','Tira','Vira','Xira','Yora','Zira','Alva','Bryn','Cela','Deva','Elia','Fawn'];
const LAST_NAMES=['del Bosque','de Piedra','del Río','de la Montaña','del Valle','de la Costa','del Norte','del Sur','del Fuego','del Hielo','de la Selva','del Desierto','de la Llanura','del Mar'];
function randomName(rng,g){const p=g==='F'?FIRST_NAMES_F:FIRST_NAMES_M;return p[Math.floor(rng()*p.length)]+' '+LAST_NAMES[Math.floor(rng()*LAST_NAMES.length)];}

const ACTIONS={
  IDLE:'Descansando',WANDER:'Explorando',GATHER:'Recolectando',
  HUNT:'Cazando',SLEEP:'Durmiendo',BUILD:'Construyendo',
  SOCIALIZE:'Socializando',FISH:'Pescando',MINE:'Minando',
  REPRODUCE:'Reproduciéndose',FARM:'Cultivando',CRAFT:'Fabricando',
  HEAL:'Curando',LEAD:'Liderando',MIGRATE:'Migrando',SICK:'Enfermo',
  RAZE:'Destruyendo',FORTIFY:'Fortificando',PATROL:'Patrullando',
};

// ── Structures ────────────────────────────────────────────────────────────────
const STRUCTURE_TYPES={
  camp:       {icon:'🔥',color:'#ff8030',label:'Campamento',   cost:{wood:2,stone:0},  hp:25,  decay:true,  decayRate:2},
  hut:        {icon:'🏠',color:'#c8a060',label:'Cabaña',       cost:{wood:4,stone:2},  hp:100, decay:false, decayRate:0},
  farm:       {icon:'🌾',color:'#90c040',label:'Cultivo',      cost:{wood:1,stone:0},  hp:80,  decay:false, decayRate:0},
  mine:       {icon:'⛏', color:'#a09080',label:'Mina',         cost:{wood:2,stone:3},  hp:100, decay:false, decayRate:0},
  market:     {icon:'🏪',color:'#f0c040',label:'Mercado',      cost:{wood:6,stone:4},  hp:120, decay:false, decayRate:0},
  temple:     {icon:'🛕', color:'#d0a0ff',label:'Templo',      cost:{wood:8,stone:8},  hp:150, decay:false, decayRate:0},
  palisade:   {icon:'🪵',color:'#8B5E3C',label:'Empalizada',   cost:{wood:6,stone:0},  hp:200, decay:false, decayRate:0},
  barracks:   {icon:'⚔️', color:'#cc4444',label:'Cuartel',     cost:{wood:8,stone:6},  hp:180, decay:false, decayRate:0},
  granary:    {icon:'🌽',color:'#d4a017',label:'Granero',      cost:{wood:6,stone:4},  hp:150, decay:false, decayRate:0},
  watchtower: {icon:'🗼',color:'#aaaaaa',label:'Torre Vigía',  cost:{wood:5,stone:8},  hp:200, decay:false, decayRate:0},
  harbor:     {icon:'⚓',color:'#3080ff',label:'Puerto',       cost:{wood:10,stone:6}, hp:200, decay:false, decayRate:0},
  aqueduct:   {icon:'🌊',color:'#40c0ff',label:'Acueducto',    cost:{wood:4,stone:12}, hp:250, decay:false, decayRate:0},
  citadel:    {icon:'🏰',color:'#888888',label:'Ciudadela',    cost:{wood:15,stone:25},hp:500, decay:false, decayRate:0},
  cathedral:  {icon:'⛪',color:'#e8d0ff',label:'Catedral',     cost:{wood:20,stone:20},hp:400, decay:false, decayRate:0},
  palace:     {icon:'🏯',color:'#ffd700',label:'Palacio',      cost:{wood:25,stone:30},hp:600, decay:false, decayRate:0},
};
let structures=[],structureGrid=null;
function initStructureGrid(){structureGrid=Array.from({length:WORLD_H},()=>new Array(WORLD_W).fill(null));}
const MAX_STRUCTURES=1500; // scales with era — more structures = bigger cities
function placeStructure(tx,ty,type,builder){
  if(structures.length>=MAX_STRUCTURES)return false;
  if(!structureGrid||structureGrid[ty]?.[tx])return false;
  const def=STRUCTURE_TYPES[type];
  if(!def)return false;
  const s={tx,ty,type,hp:def.hp,maxHp:def.hp,builtBy:builder.name,civId:builder.civId,
           icon:def.icon,color:def.color,label:def.label,decay:def.decay,decayRate:def.decayRate};
  structures.push(s);structureGrid[ty][tx]=s;return true;
}
function getStructureAt(tx,ty){
  if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H)return null;
  return structureGrid[ty][tx];
}
function tickStructures(yearsElapsed){
  for(let i=structures.length-1;i>=0;i--){
    const s=structures[i];
    if(s.decay&&s.decayRate>0){
      s.hp-=yearsElapsed*s.decayRate;
      if(s.hp<=0){structureGrid[s.ty][s.tx]=null;structures.splice(i,1);}
    }
  }
}

// ── Civilizations ─────────────────────────────────────────────────────────────
let civIdCounter=0;
const civilizations=new Map();
class Civilization{
  constructor(founder){
    this.id=civIdCounter++;
    this.name=_genCivName(founder._rng);
    this.color=founder.color;
    this.leaderId=founder.id;
    this.members=new Set([founder.id]);
    this.founded=year;
    this.allies=new Set();
    this.enemies=new Set();
    this.era='primitiva';
    this.population=1;
    this.territory=new Set(); // tile keys "tx,ty"
    this.militaryPower=0;
    this.techLevel=0; // 0=stone 1=bronze 2=iron 3=steel 4=gunpowder
  }
  addMember(h){this.members.add(h.id);this.population=this.members.size;}
  removeMember(id){this.members.delete(id);this.population=this.members.size;}
  claimTile(tx,ty){this.territory.add(`${tx},${ty}`);}
  unclaimTile(tx,ty){this.territory.delete(`${tx},${ty}`);}
}
const CIV_PREFIXES=['Imperio','Reino','Tribu','Clan','Nación','Confederación','República','Sultanato','Ducado','Liga'];
const CIV_ROOTS=['Akar','Boral','Ceth','Dorn','Elvar','Forn','Gael','Hira','Ixal','Jorn','Kael','Lorn','Mira','Neth','Orak','Phal','Quen','Rael','Sorn','Thal'];
function _genCivName(rng){return CIV_PREFIXES[Math.floor(rng()*CIV_PREFIXES.length)]+' '+CIV_ROOTS[Math.floor(rng()*CIV_ROOTS.length)];}
function getOrCreateCiv(founder){
  const civ=new Civilization(founder);
  civilizations.set(civ.id,civ);
  founder.civId=civ.id;
  return civ;
}

// ── Social phases ─────────────────────────────────────────────────────────────
function getSocialPhase(){ return year>=600?'division':'survival'; }

// ── Territory claiming ────────────────────────────────────────────────────────
function _updateCivTerritories(){
  for(const [,civ] of civilizations) civ.territory.clear();
  for(const s of structures){
    if(s.civId==null)continue;
    const civ=civilizations.get(s.civId);
    if(!civ)continue;
    const radius=Math.min(_getTerritoryRadius(s.type),6); // tighter cap for perf
    const r2=radius*radius;
    for(let dy=-radius;dy<=radius;dy++){
      for(let dx=-radius;dx<=radius;dx++){
        if(dx*dx+dy*dy<=r2){
          const tx=s.tx+dx,ty=s.ty+dy;
          if(tx>=0&&tx<WORLD_W&&ty>=0&&ty<WORLD_H)
            civ.claimTile(tx,ty);
        }
      }
    }
  }
  // Cap territory size per civ to prevent unbounded growth
  for(const [,civ] of civilizations){
    if(civ.territory.size>2000){
      const arr=[...civ.territory];
      civ.territory=new Set(arr.slice(arr.length-2000));
    }
  }
}
function _getTerritoryRadius(type){
  const radii={camp:2,hut:3,farm:2,mine:2,market:5,temple:6,palisade:4,barracks:5,
               granary:4,watchtower:7,harbor:5,aqueduct:4,citadel:10,cathedral:8,palace:12,
               well:3,workshop:4,library:6,forge:5,academy:7,colosseum:8,university:8,observatory:7};
  return radii[type]||3;
}

// ── Terrain modification ───────────────────────────────────────────────────────
const modifiedTiles=new Map();
function modifyTerrain(tx,ty,newBiome){
  const cell=getCell(tx,ty);
  if(!cell)return false;
  const key=`${tx},${ty}`;
  if(!modifiedTiles.has(key))modifiedTiles.set(key,{original:cell.biome});
  cell.biome=newBiome;
  // Update terrain canvas pixel
  const rgb=BIOME_RGB[newBiome]||[100,100,100];
  cell.br=rgb[0];cell.bg=rgb[1];cell.bb=rgb[2];
  redrawTiles([{tx,ty}]);
  return true;
}
// Flatten terrain (level hills for city building)
function flattenTerrain(tx,ty){
  const cell=getCell(tx,ty);
  if(!cell||!isLand(tx,ty))return false;
  if(['highland','mountain','snow'].includes(cell.biome)){
    modifyTerrain(tx,ty,'grass');
    return true;
  }
  return false;
}
// Fill water/shore tiles near a city center — makes land for dense building
function reclaimLand(tx,ty){
  const cell=getCell(tx,ty);
  if(!cell)return false;
  if(['sea','deep_sea'].includes(cell.biome))return false; // deep water stays
  if(['shore','swamp'].includes(cell.biome)){
    // Raise height so isLand() returns true
    cell.h=T.SHORE+0.02;
    modifyTerrain(tx,ty,'grass');
    return true;
  }
  return false;
}

// ── Diseases (expanded) ───────────────────────────────────────────────────────
const DISEASE_TYPES=[
  {name:'Fiebre',      damage:0.8, spread:0.15,duration:8,  cure:10},
  {name:'Plaga',       damage:1.5, spread:0.2, duration:14, cure:20},
  {name:'Pestilencia', damage:1.2, spread:0.18,duration:12, cure:16},
  {name:'Cólera',      damage:1.8, spread:0.25,duration:10, cure:25},
  {name:'Viruela',     damage:2.0, spread:0.3, duration:16, cure:30},
  {name:'Tifus',       damage:1.0, spread:0.22,duration:12, cure:18},
  {name:'Malaria',     damage:0.9, spread:0.12,duration:20, cure:15},
];
let activeOutbreaks=[];

function tickDiseases(yearsElapsed, alive){
  const rng=mulberry32(WORLD_SEED^year^0xDEAD);
  const n=alive.length;
  const base=0.0015;
  const pressure=base*Math.max(1,n/50);
  if(rng()<pressure*yearsElapsed&&n>15){
    const host=alive[Math.floor(rng()*n)];
    const vulnerable=DISEASE_TYPES.filter(d=>!host.immunity||!host.immunity.has(d.name));
    const dtype=vulnerable.length>0?vulnerable[Math.floor(rng()*vulnerable.length)]:DISEASE_TYPES[Math.floor(rng()*DISEASE_TYPES.length)];
    const radius=4+Math.floor(rng()*6);
    activeOutbreaks.push({type:dtype,tx:host.tx,ty:host.ty,radius,yearsLeft:dtype.duration});
    addWorldEvent(`🦠 Brote de ${dtype.name} (radio ${radius})`);
  }
  activeOutbreaks=activeOutbreaks.filter(o=>{o.yearsLeft-=yearsElapsed;return o.yearsLeft>0;});
}

// ── World events ──────────────────────────────────────────────────────────────
const worldEvents=[];
function addWorldEvent(text){worldEvents.unshift({year,text});if(worldEvents.length>120)worldEvents.pop();}

// ── Spatial grid ──────────────────────────────────────────────────────────────
const SPATIAL_CELL=16;
let spatialGrid=null;
function _spatialKey(tx,ty){return(Math.floor(tx/SPATIAL_CELL))|((Math.floor(ty/SPATIAL_CELL))<<16);}
function initSpatialGrid(){spatialGrid=new Map();}
function _spatialAdd(h){const k=_spatialKey(h.tx,h.ty);if(!spatialGrid.has(k))spatialGrid.set(k,new Set());spatialGrid.get(k).add(h);h._spatialKey=k;}
function _spatialRemove(h){if(h._spatialKey===undefined)return;const s=spatialGrid.get(h._spatialKey);if(s)s.delete(h);}
function _spatialUpdate(h){const k=_spatialKey(h.tx,h.ty);if(k===h._spatialKey)return;_spatialRemove(h);_spatialAdd(h);}
function _spatialQuery(tx,ty,radius,excludeId){
  const results=[];
  const r2=radius*radius;
  const cx0=Math.floor((tx-radius)/SPATIAL_CELL),cx1=Math.floor((tx+radius)/SPATIAL_CELL);
  const cy0=Math.floor((ty-radius)/SPATIAL_CELL),cy1=Math.floor((ty+radius)/SPATIAL_CELL);
  for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){
    const cell=spatialGrid.get(cx|(cy<<16));
    if(!cell)continue;
    for(const h of cell){
      if(h.id===excludeId||!h.alive)continue;
      const dx=h.tx-tx,dy=h.ty-ty;
      if(dx*dx+dy*dy<=r2)results.push(h);
    }
  }
  return results;
}

// ── Neural Brain ──────────────────────────────────────────────────────────────
class NeuralBrain{
  constructor(rng){
    this.iSize=12;this.hSize=10;this.oSize=10;
    // Outputs: 0=seekFood 1=sleep 2=wander 3=socialize 4=gather 5=build 6=reproduce 7=farm 8=fight 9=raze
    this.wIH=Array.from({length:this.iSize*this.hSize},()=>rng()*2-1);
    this.wHO=Array.from({length:this.hSize*this.oSize},()=>rng()*2-1);
    this.bH=new Float32Array(this.hSize);
    this.bO=new Float32Array(this.oSize);
    this.lr=0.10;
    this.memory=[];
    this.epsilon=0.35;
  }
  _relu(x){return x>0?x:x*0.05;}
  forward(inp){
    const h=new Float32Array(this.hSize);
    for(let i=0;i<this.hSize;i++){
      let s=this.bH[i];
      for(let j=0;j<this.iSize;j++)s+=inp[j]*this.wIH[j*this.hSize+i];
      h[i]=this._relu(s);
    }
    const raw=new Float32Array(this.oSize);
    for(let o=0;o<this.oSize;o++){
      let s=this.bO[o];
      for(let i=0;i<this.hSize;i++)s+=h[i]*this.wHO[i*this.oSize+o];
      raw[o]=s;
    }
    let mx=raw[0];for(let i=1;i<this.oSize;i++)if(raw[i]>mx)mx=raw[i];
    let sm=0;const ex=new Float32Array(this.oSize);
    for(let i=0;i<this.oSize;i++){ex[i]=Math.exp(raw[i]-mx);sm+=ex[i];}
    for(let i=0;i<this.oSize;i++)ex[i]/=sm;
    return ex;
  }
  choose(inp,rng){
    if(rng()<this.epsilon)return Math.floor(rng()*this.oSize);
    const p=this.forward(inp);
    let best=0;for(let i=1;i<p.length;i++)if(p[i]>p[best])best=i;
    return best;
  }
  reinforce(inp,actionIdx,reward){
    this.memory.push({inp:Float32Array.from(inp),actionIdx,reward});
    if(this.memory.length>16)this.memory.shift();
    for(const e of this.memory){
      const p=this.forward(e.inp);
      const eff=this.lr*e.reward;
      if(Math.abs(eff)<0.00005)continue;
      for(let h=0;h<this.hSize;h++)
        this.wHO[h*this.oSize+e.actionIdx]+=(e.actionIdx===h?1-p[h]:-p[h])*eff;
    }
  }
}

function _inheritBrain(bA,bB,rng){
  const c=new NeuralBrain(rng);
  const mutR=0.08,mutS=0.15;
  const mix=(a,b)=>Array.from(a,(v,i)=>{
    const base=bB?(rng()<0.5?v:b[i]):v;
    return rng()<mutR?base+(rng()*2-1)*mutS:base;
  });
  c.wIH=mix(bA.wIH,bB?.wIH);c.wHO=mix(bA.wHO,bB?.wHO);
  c.bH=Array.from(mix(bA.bH,bB?.bH));c.bO=Array.from(mix(bA.bO,bB?.bO));
  c.epsilon=Math.max(0.04,Math.min(0.40,(bA.epsilon+(bB?.epsilon||bA.epsilon))/2+(rng()*0.04-0.02)));
  return c;
}

function _blendColor(cA,cB,rng){
  const p=c=>{const m=c.match(/hsl\((\d+),(\d+)%,(\d+)%\)/);return m?[+m[1],+m[2],+m[3]]:[180,70,65];};
  const a=p(cA),b=p(cB||cA),t=rng();
  return `hsl(${(Math.round(a[0]*(1-t)+b[0]*t+(rng()*20-10))+360)%360},`+
         `${Math.round(Math.max(40,Math.min(90,a[1]*(1-t)+b[1]*t)))}%,`+
         `${Math.round(Math.max(40,Math.min(80,a[2]*(1-t)+b[2]*t)))}%)`;
}
function _inheritTrait(a,b,rng){
  const base=b!==undefined?(rng()<0.5?a:b):a;
  return Math.max(1,Math.min(100,Math.round(base+(rng()*14-7))));
}

// ── Intelligence curve (rises and falls naturally) ────────────────────────────
// Global intelligence modifier — oscillates to create dark ages and renaissances
let _intelPhase=0;
let _intelModifier=1.0; // 0.5 to 1.5
function _tickIntelligenceCurve(yearsElapsed){
  _intelPhase+=yearsElapsed*0.0008;
  // Slow sine wave with noise — creates golden ages and dark ages
  const base=Math.sin(_intelPhase)*0.3+Math.sin(_intelPhase*2.3)*0.1+Math.sin(_intelPhase*0.7)*0.15;
  _intelModifier=Math.max(0.4,Math.min(1.6,1.0+base));
}

// ── Population control ────────────────────────────────────────────────────────
// Dynamic caps based on available resources — scale exponentially with era
let _popCapsCache={soft:60,hard:140};
let _popCapsYear=-99;
function _getPopCaps(){
  if(year-_popCapsYear<5)return _popCapsCache;
  _popCapsYear=year;
  let farmCount=0,granaryCount=0,aqueductCount=0,marketCount=0,harborCount=0,palaceCount=0,universityCount=0;
  for(const s of structures){
    if(s.type==='farm')farmCount++;
    else if(s.type==='granary')granaryCount++;
    else if(s.type==='aqueduct')aqueductCount++;
    else if(s.type==='market')marketCount++;
    else if(s.type==='harbor')harborCount++;
    else if(s.type==='palace')palaceCount++;
    else if(s.type==='university')universityCount++;
  }
  // Base grows with infrastructure — no hard ceiling, scales with what they build
  const infraBonus=farmCount*5+granaryCount*15+aqueductCount*25+marketCount*8+harborCount*20+palaceCount*60+universityCount*40;
  // Era multiplier — civilizations at higher eras support exponentially more people
  const eraName=getEra(year).name;
  const eraMult={
    'Era Primitiva':1,'Era de Piedra':1.5,'Era del Bronce':2.5,'Era del Hierro':4,
    'Era Clásica':7,'Era Medieval':12,'Renacimiento':20,'Era Industrial':40,
    'Era Moderna':80,'Era Espacial':160,
  }[eraName]||1;
  const soft=Math.floor((80+infraBonus)*eraMult);
  const hard=Math.floor(soft*1.6);
  _popCapsCache={soft,hard};
  return _popCapsCache;
}

// ── Human class ───────────────────────────────────────────────────────────────
let humanIdCounter=0;
const POP_SOFT_CAP=120;
const POP_HARD_CAP=250;

const FOOD_TYPES=['berries','wheat_wild','mushroom','animal','fish','tree_palm','cactus','bush','herb'];
const WOOD_TYPES=['tree_oak','tree_pine','tree_palm','tree_jungle','bush'];
const STONE_TYPES=['rock','iron_ore','clay'];

// Weapon tiers — unlocked by tech level
const WEAPON_TIERS=['Puños','Lanza de Madera','Hacha de Piedra','Espada de Bronce','Espada de Hierro','Acero','Pólvora'];

class Human{
  constructor(tx,ty,rng,gender,parentA,parentB){
    this.id=humanIdCounter++;
    this.gender=gender||(rng()<0.5?'F':'M');
    this.name=randomName(rng,this.gender);
    this.tx=tx;this.ty=ty;
    this.px=tx*TILE+TILE/2;this.py=ty*TILE+TILE/2;
    this.destPx=this.px;this.destPy=this.py;
    this.tilesPerYear=6;

    this.age=parentA?0:18+Math.floor(rng()*8);
    this.health=100;this.hunger=95;this.energy=100;
    this.alive=true;this.action=ACTIONS.IDLE;
    this.target=null;
    this.inventory={food:parentA?12:20,wood:parentA?2:8,stone:parentA?1:4};
    this.color=parentA?_blendColor(parentA.color,parentB?.color,rng):`hsl(${Math.floor(rng()*360)},70%,65%)`;
    this.selected=false;this.log=[];
    this._rng=rng;
    this.brain=parentA?.brain?_inheritBrain(parentA.brain,parentB?.brain,rng):new NeuralBrain(rng);

    this.traits={
      strength:  parentA?_inheritTrait(parentA.traits.strength, parentB?.traits.strength,rng):40+Math.floor(rng()*30),
      charisma:  parentA?_inheritTrait(parentA.traits.charisma, parentB?.traits.charisma,rng):40+Math.floor(rng()*30),
      intellect: parentA?_inheritTrait(parentA.traits.intellect,parentB?.traits.intellect,rng):40+Math.floor(rng()*30),
      fertility: parentA?_inheritTrait(parentA.traits.fertility,parentB?.traits.fertility,rng):40+Math.floor(rng()*30),
    };

    // Intelligence fluctuates — not everyone is equally smart
    this._intelVariance=rng()*0.6+0.7; // 0.7 to 1.3 personal multiplier
    this.knowledge=parentA?Math.floor((parentA.knowledge+(parentB?.knowledge||0))*0.35)+8:20;
    this.partner=null;this.reproTimer=0;this.children=0;
    this.social=70;this.homeBase=null;
    this._prevHealth=100;this._prevHunger=95;
    this._spatialKey=undefined;
    this.civId=parentA?.civId||null;
    this.sick=false;this.sickType=null;this.sickTimer=0;
    this.immunity=new Set();
    this.leaderScore=0;
    this.isLeader=false;
    this._canReproduce=true;
    this._wanderAngle=rng()*Math.PI*2;
    this._wanderDrift=0;
    this._settleTx=tx;this._settleTy=ty;
    this._settleScore=0;
    this._groupTimer=0;
    this._reproUrge=0;
    this._exploreUrge=0;
    this._buildUrge=0;
    this._flattenUrge=0; // urge to flatten terrain for city building
    this._razeUrge=0;    // urge to destroy enemy structures

    this.ideology=parentA?(parentA.ideology+(parentB?parentB.ideology:parentA.ideology))/2+(rng()*0.2-0.1):rng();
    this.wealth=0;
    this.aggression=parentA?Math.max(0,Math.min(1,(parentA.aggression+(parentB?parentB.aggression:parentA.aggression))/2+(rng()*0.1-0.05))):rng()*0.3;
    this._warTimer=0;
    this._terrainModTimer=0;
    this.weaponTier=0; // starts with fists
    this.kills=0;
    this.isSoldier=false; // assigned by civ leader
  }

  addLog(msg){this.log.unshift(`Año ${year}: ${msg}`);if(this.log.length>15)this.log.pop();}

  // ── Frame movement ────────────────────────────────────────────────────────
  updateMovement(dtSec,speedMult){
    if(!this.alive)return;
    const dx=this.destPx-this.px,dy=this.destPy-this.py;
    const dist=Math.hypot(dx,dy);
    if(dist<0.5){this.px=this.destPx;this.py=this.destPy;return;}
    const pxPerSec=this.tilesPerYear*TILE*(speedMult/3);
    const step=Math.min(pxPerSec*dtSec,dist);
    this.px+=dx/dist*step;this.py+=dy/dist*step;
    this.tx=Math.max(0,Math.min(WORLD_W-1,Math.round((this.px-TILE/2)/TILE)));
    this.ty=Math.max(0,Math.min(WORLD_H-1,Math.round((this.py-TILE/2)/TILE)));
    _spatialUpdate(this);
  }

  // ── Annual tick ───────────────────────────────────────────────────────────
  tick(yearsElapsed){
    if(!this.alive)return;
    this.age+=yearsElapsed;

    // Lifespan — knowledge/intellect extend life
    const maxAge=30+Math.floor(this._rng()*50)
      +Math.min(40,Math.floor(this.knowledge*0.15))
      +Math.floor(this.traits.intellect*0.15);
    if(this.age>maxAge){this._die('vejez');return;}

    // Disease
    if(this.sick){
      this.sickTimer-=yearsElapsed;
      this.health=Math.max(0,this.health-this.sickType.damage*yearsElapsed);
      if(this.sickTimer<=0||this.health<=0){
        if(this.health<=0){this._die(this.sickType.name);return;}
        this.sick=false;this.immunity.add(this.sickType.name);
        this.addLog(`Se recuperó de ${this.sickType.name}`);this.sickType=null;
      }
    } else {
      for(const o of activeOutbreaks){
        if(this.immunity.has(o.type.name))continue;
        const d=Math.hypot(this.tx-o.tx,this.ty-o.ty);
        if(d<=o.radius&&this._rng()<o.type.spread*0.03*yearsElapsed){
          this.sick=true;this.sickType=o.type;
          this.sickTimer=o.type.duration*(0.8+this._rng()*0.4);
          this.addLog(`Contrajo ${o.type.name}`);break;
        }
      }
    }

    // Stat decay
    this.hunger=Math.max(0,this.hunger-yearsElapsed*4);
    this.energy=Math.max(0,this.energy-yearsElapsed*3);
    this.social=Math.max(0,this.social-yearsElapsed*2);
    if(this.reproTimer>0)this.reproTimer-=yearsElapsed;

    // Auto-eat from inventory
    if(this.hunger<80&&this.inventory.food>0){
      const need=Math.ceil((80-this.hunger)/20);
      const eat=Math.min(this.inventory.food,need);
      this.inventory.food-=eat;
      this.hunger=Math.min(100,this.hunger+eat*20);
    }

    if(this.hunger<=0){
      this.health=Math.max(0,this.health-yearsElapsed*5);
      if(this.health<=0){this._die('hambre');return;}
    } else if(!this.sick){
      this.health=Math.min(100,this.health+yearsElapsed*6);
    }

    // Build up drives — faster with more knowledge
    if(this._canReproduce&&this.age>=16&&this.age<=50&&this.reproTimer<=0){
      this._reproUrge=Math.min(1,this._reproUrge+yearsElapsed*0.35);
    }
    this._exploreUrge=Math.min(1,this._exploreUrge+yearsElapsed*0.08);
    // Build urge scales with knowledge — advanced civs build constantly
    const buildRate=0.15+Math.min(0.4,this.knowledge*0.001);
    this._buildUrge=Math.min(1,this._buildUrge+yearsElapsed*buildRate);
    // Flatten urge also scales with knowledge
    const flattenRate=0.04+Math.min(0.15,this.knowledge*0.0005);
    this._flattenUrge=Math.min(1,this._flattenUrge+yearsElapsed*flattenRate);
    if(getSocialPhase()==='division')
      this._razeUrge=Math.min(1,this._razeUrge+yearsElapsed*0.04);

    this.leaderScore=this.traits.charisma*0.4+this.traits.intellect*0.3+this.knowledge*0.2+this.children*3+this.age*0.05+this.kills*2;

    // Intelligence curve affects knowledge growth
    const intelMult=_intelModifier*this._intelVariance;
    this.brain.epsilon=Math.max(0.04,0.38-Math.min(this.knowledge,2000)*0.00015/intelMult);

    // Knowledge grows exponentially — slow at first, explosive at high levels
    // Base rate scales with intellect, then multiplied by a curve that accelerates with existing knowledge
    const kGrowthBase=0.06+this.traits.intellect*0.004;
    const kCurve=1+Math.pow(Math.min(this.knowledge,5000)/500,1.6)*0.4; // exponential acceleration
    this.knowledge=Math.min(99999,this.knowledge+yearsElapsed*kGrowthBase*intelMult*kCurve);

    this.wealth=this.inventory.food+this.inventory.wood*2+this.inventory.stone*1.5;

    if(getSocialPhase()==='division'){
      this.ideology=Math.max(0,Math.min(1,this.ideology+(this._rng()*0.04-0.02)));
    }
    if(getSocialPhase()==='division'&&this._warTimer>0)this._warTimer-=yearsElapsed;

    // Hard survival overrides
    if(this.sick&&this.health<35){this._doHeal();return;}
    if(this.hunger<10||this.health<8){this._seekFoodNow();return;}
    if(this.energy<5){this._doSleep();return;}

    const nearby=_spatialQuery(this.tx,this.ty,16,this.id);
    const crowding=nearby.filter(h=>Math.hypot(h.tx-this.tx,h.ty-this.ty)<6).length;

    if(this.hunger<25){this._seekFoodNow();return;}
    if(this.energy<15){this._doSleep();return;}
    if(crowding>=5){this._disperseFrom(nearby);return;}

    // Biological imperatives
    if(this._reproUrge>0.65&&this.hunger>40&&this.energy>35&&!this.sick){
      this._tryReproduce(nearby);return;
    }
    if(this._buildUrge>0.45&&this.hunger>45&&this.energy>35&&
       (this.inventory.wood>=2||this.inventory.stone>=2)){
      this._buildUrge=0;this._doBuild();return;
    }
    // Flatten terrain for city building
    if(this._flattenUrge>0.6&&this.knowledge>80&&this.hunger>50){
      this._flattenUrge=0;this._doFlattenTerrain();return;
    }
    // Raze enemy structures
    if(this._razeUrge>0.7&&this.aggression>0.4&&getSocialPhase()==='division'){
      this._razeUrge=0;this._doRaze();return;
    }
    if(this._exploreUrge>0.75&&crowding<3&&this.hunger>40){
      this._exploreUrge=0;this._doWander();return;
    }

    // Neural net
    const nearFood=this._findNearbyResource(FOOD_TYPES,25)?1:0;
    const nearHuman=nearby.length>0?1:0;
    const reproReady=(this.age>=16&&this.age<=45&&this.reproTimer<=0&&this.hunger>50&&this.energy>40&&this._canReproduce)?1:0;
    const nearEnemy=this._findNearbyEnemy(nearby)?1:0;

    const inputs=[
      this.hunger/100, this.energy/100, this.health/100,
      nearFood, nearHuman, this.homeBase?1:0,
      Math.min(1,this.knowledge/2000)*intelMult, this.social/100,
      reproReady, Math.min(1,crowding/5),
      nearEnemy, this.aggression,
    ];

    const chosen=this.brain.choose(inputs,this._rng);
    this._executeAction(chosen,nearby);

    if(getSocialPhase()==='division'){
      this._doSocialDivision(nearby);
    }

    this._terrainModTimer-=yearsElapsed;
    if(this._terrainModTimer<=0&&this.knowledge>50&&this.hunger>55){
      this._modifyTerrain();
      this._terrainModTimer=3+Math.floor(this._rng()*6);
    }

    const reward=((this.health-this._prevHealth)*0.3+(this.hunger-this._prevHunger)*0.7)/100;
    this.brain.reinforce(inputs,chosen,reward);
    this._prevHealth=this.health;this._prevHunger=this.hunger;
  }

  _executeAction(idx,nearby){
    switch(idx){
      case 0:this._seekFoodNow();break;
      case 1:this._doSleep();break;
      case 2:this._doWander();break;
      case 3:this._doSocialize(nearby);break;
      case 4:this._gatherResources();break;
      case 5:this._doBuild();break;
      case 6:this._tryReproduce(nearby);break;
      case 7:this._doFarm();break;
      case 8:this._doFight(nearby);break;
      case 9:this._doRaze();break;
      default:this._seekFoodNow();break;
    }
  }

  // ── SURVIVAL ──────────────────────────────────────────────────────────────
  _seekFoodNow(){
    if(this.inventory.food>0){
      const eat=Math.min(this.inventory.food,4);
      this.inventory.food-=eat;
      this.hunger=Math.min(100,this.hunger+eat*20);
      if(this.hunger>65){this.action=ACTIONS.IDLE;return;}
    }
    const farm=this._findNearbyStructure('farm',16);
    if(farm&&Math.hypot(farm.tx-this.tx,farm.ty-this.ty)<=2){
      this._harvestFarm(farm);this.action=ACTIONS.FARM;return;
    }
    if(farm){this._setDest(farm.tx,farm.ty);this.action=ACTIONS.FARM;return;}
    // Check granary
    const granary=this._findNearbyStructure('granary',12);
    if(granary&&granary.civId===this.civId&&Math.hypot(granary.tx-this.tx,granary.ty-this.ty)<=2){
      this.inventory.food+=15;this.hunger=Math.min(100,this.hunger+30);
      this.action=ACTIONS.GATHER;return;
    }
    const res=this._findNearbyResource(FOOD_TYPES,40);
    if(res){
      if(Math.hypot(res.tx-this.tx,res.ty-this.ty)<=1.5){
        this._harvestResourceNow(res);
      } else {
        this._setDest(res.tx,res.ty);
        this.action=res.type==='animal'?ACTIONS.HUNT:res.type==='fish'?ACTIONS.FISH:ACTIONS.GATHER;
        this.target=res;
      }
      return;
    }
    this._wanderAngle+=this._rng()*0.5-0.25;
    const dist=15+Math.floor(this._rng()*20);
    this._navigateTo(
      Math.round(this.tx+Math.cos(this._wanderAngle)*dist),
      Math.round(this.ty+Math.sin(this._wanderAngle)*dist)
    );
    this.action=ACTIONS.WANDER;
  }

  _harvestResourceNow(res){
    if(!res)return;
    const def=RESOURCE_DEFS[res.type];
    const harvest=Math.min(res.amount,12);
    res.amount-=harvest;
    if(def.food>0){
      const foodGain=def.food*harvest;
      this.hunger=Math.min(100,this.hunger+foodGain*0.8);
      this.inventory.food+=Math.floor(foodGain*0.5);
    }
    if(def.wood>0)this.inventory.wood+=Math.floor(harvest*1.0);
    if(def.stone>0)this.inventory.stone+=Math.floor(harvest*1.0);
    this.knowledge=Math.min(99999,this.knowledge+0.5*_intelModifier*this._intelVariance);
    if(res.amount<=0)removeResource(res.tx,res.ty);
    this.target=null;
    this.action=ACTIONS.GATHER;
  }

  _doSleep(){
    this.action=ACTIONS.SLEEP;
    this.energy=Math.min(100,this.energy+55);
    if(this.homeBase&&Math.hypot(this.homeBase.tx-this.tx,this.homeBase.ty-this.ty)>8){
      this._setDest(this.homeBase.tx,this.homeBase.ty);
    }
  }

  _doSocialize(nearby){
    const candidates=nearby.filter(h=>Math.hypot(h.tx-this.tx,h.ty-this.ty)>3);
    const other=candidates.length>0?candidates[Math.floor(this._rng()*candidates.length)]:
                nearby.length>0?nearby[Math.floor(this._rng()*nearby.length)]:null;
    if(other){
      this.action=ACTIONS.SOCIALIZE;
      this.social=Math.min(100,this.social+30);
      if(other.knowledge>this.knowledge)
        this.knowledge=Math.min(99999,this.knowledge+(other.knowledge-this.knowledge)*0.15*_intelModifier);
      if(!this.civId&&other.civId&&this._rng()<0.3)this._joinCiv(other.civId);
      if(this.civId&&other.civId&&this.civId!==other.civId){
        const myCiv=civilizations.get(this.civId);
        const theirCiv=civilizations.get(other.civId);
        if(myCiv&&theirCiv&&!myCiv.enemies.has(other.civId)&&this._rng()<0.02){
          myCiv.allies.add(other.civId);theirCiv.allies.add(this.civId);
          addWorldEvent(`🤝 Alianza: ${myCiv.name} ↔ ${theirCiv.name}`);
        }
      }
      const d=Math.hypot(other.tx-this.tx,other.ty-this.ty);
      if(d>8)this._setDest(other.tx+Math.round(this._rng()*4-2),other.ty+Math.round(this._rng()*4-2));
    } else {
      this.action=ACTIONS.WANDER;
      this._wanderAngle+=(this._rng()-0.5)*1.2;
    }
  }

  _doHeal(){
    this.action=ACTIONS.HEAL;
    if(this.inventory.food>0){
      this.inventory.food--;
      this.health=Math.min(100,this.health+15);
    }
    if(this.sick&&this.knowledge>30&&this._rng()<this.knowledge/Math.max(this.sickType.cure*50,1)){
      this.sick=false;this.immunity.add(this.sickType.name);
      this.addLog(`Se curó de ${this.sickType.name}`);
      this.sickType=null;
      this.knowledge=Math.min(99999,this.knowledge+4);
    }
    if(this.knowledge>60){
      const nearby=_spatialQuery(this.tx,this.ty,8,this.id);
      for(const h of nearby){
        if(!h.sick)continue;
        if(this._rng()<this.knowledge/80){
          h.sick=false;h.immunity.add(h.sickType.name);
          h.addLog(`Curado por ${this.name.split(' ')[0]}`);h.sickType=null;
          this.knowledge=Math.min(99999,this.knowledge+2);break;
        }
      }
    }
  }

  _doWander(){
    this.action=ACTIONS.WANDER;
    this._wanderDrift++;
    if(this._wanderDrift>4){
      this._wanderAngle+=(this._rng()-0.5)*1.2;
      this._wanderDrift=0;
    }
    const dist=12+Math.floor(this._rng()*18);
    this._navigateTo(
      Math.round(this.tx+Math.cos(this._wanderAngle)*dist),
      Math.round(this.ty+Math.sin(this._wanderAngle)*dist)
    );
    this.knowledge=Math.min(99999,this.knowledge+0.5*_intelModifier*this._intelVariance);
    const localFood=this._findNearbyResource(FOOD_TYPES,8);
    const localWood=this._findNearbyResource(WOOD_TYPES,8);
    if(localFood&&localWood){
      this._settleScore++;
      if(this._settleScore>3){
        this._settleTx=this.tx;this._settleTy=this.ty;
        this._settleScore=0;
      }
    }
  }

  _disperseFrom(nearby){
    this.action=ACTIONS.WANDER;
    let ax=0,ay=0;
    for(const h of nearby){ax+=h.tx;ay+=h.ty;}
    ax/=nearby.length;ay/=nearby.length;
    const awayAngle=Math.atan2(this.ty-ay,this.tx-ax)+(this._rng()-0.5)*0.8;
    const dist=10+Math.floor(this._rng()*15);
    this._navigateTo(
      Math.round(this.tx+Math.cos(awayAngle)*dist),
      Math.round(this.ty+Math.sin(awayAngle)*dist)
    );
    this._wanderAngle=awayAngle;
  }

  // ── Flatten terrain for city building ─────────────────────────────────────
  _doFlattenTerrain(){
    if(this.knowledge<80||this.hunger<45)return;
    const r=Math.min(12, 4+Math.floor(this.knowledge/300)); // bigger radius as knowledge grows
    const changed=[];
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(dx*dx+dy*dy>r*r)continue;
      const tx=this._settleTx+dx,ty=this._settleTy+dy;
      // Flatten hills
      if(flattenTerrain(tx,ty)){
        changed.push({tx,ty});
        this.knowledge=Math.min(99999,this.knowledge+0.3);
        this.action=ACTIONS.BUILD;
        if(changed.length>=3)break;
      }
      // Reclaim shore/swamp for city expansion (requires more knowledge)
      if(this.knowledge>300&&reclaimLand(tx,ty)){
        changed.push({tx,ty});
        this.knowledge=Math.min(99999,this.knowledge+0.5);
        this.action=ACTIONS.BUILD;
        if(changed.length>=3)break;
      }
    }
    if(changed.length>0&&typeof markTerritoryDirty!=='undefined')markTerritoryDirty();
  }

  // ── Raze enemy structures ─────────────────────────────────────────────────
  _doRaze(){
    if(this.hunger<30||this.health<30)return;
    const myCiv=this.civId!=null?civilizations.get(this.civId):null;
    if(!myCiv)return;
    // Find nearby enemy structure using grid — O(radius²) not O(all structures)
    let target=null,bestD=Infinity;
    const r=20;
    const x0=Math.max(0,this.tx-r),x1=Math.min(WORLD_W-1,this.tx+r);
    const y0=Math.max(0,this.ty-r),y1=Math.min(WORLD_H-1,this.ty+r);
    for(let ty=y0;ty<=y1&&!target;ty++)for(let tx=x0;tx<=x1&&!target;tx++){
      const s=structureGrid[ty][tx];
      if(!s||s.civId==null||s.civId===this.civId)continue;
      if(!myCiv.enemies.has(s.civId))continue;
      const d=Math.hypot(tx-this.tx,ty-this.ty);
      if(d<bestD){bestD=d;target=s;}
    }
    if(!target){this.action=ACTIONS.WANDER;return;}
    if(bestD>2){this._setDest(target.tx,target.ty);this.action=ACTIONS.RAZE;return;}
    // Damage the structure
    const dmg=5+this.traits.strength*0.2+this.weaponTier*3;
    target.hp-=dmg;
    this.action=ACTIONS.RAZE;
    this.addLog(`Atacó ${target.label}`);
    if(target.hp<=0){
      const idx=structures.indexOf(target);
      if(idx>=0){structures.splice(idx,1);structureGrid[target.ty][target.tx]=null;}
      addWorldEvent(`💥 ${this.name.split(' ')[0]} destruyó ${target.label} de ${civilizations.get(target.civId)?.name||'?'}`);
    }
  }

  // ── Fight nearby enemies ──────────────────────────────────────────────────
  _doFight(nearby){
    const enemy=this._findNearbyEnemy(nearby);
    if(enemy)this._doConflict(enemy);
    else this.action=ACTIONS.WANDER;
  }

  _findNearbyEnemy(nearby){
    if(!this.civId)return null;
    const myCiv=civilizations.get(this.civId);
    if(!myCiv)return null;
    for(const h of nearby){
      if(!h.alive||h.civId===this.civId)continue;
      if(h.civId!=null&&myCiv.enemies.has(h.civId))return h;
    }
    return null;
  }

  // ── Social division (post year 1000) ─────────────────────────────────────
  _doSocialDivision(nearby){
    if(!nearby.length)return;
    const myCiv=this.civId!=null?civilizations.get(this.civId):null;
    for(const other of nearby){
      if(!other.alive||other.id===this.id)continue;
      const sameCiv=this.civId!=null&&this.civId===other.civId;
      const ideoDiff=Math.abs(this.ideology-other.ideology);
      const wealthDiff=this.wealth-other.wealth;
      if(sameCiv&&wealthDiff>30&&this._rng()<0.05){
        const steal=Math.min(other.inventory.food,Math.floor(wealthDiff*0.1));
        if(steal>0){
          other.inventory.food-=steal;this.inventory.food+=steal;
          this.aggression=Math.min(1,this.aggression+0.01);
          other.aggression=Math.min(1,other.aggression+0.02);
        }
      }
      if(!sameCiv&&myCiv&&other.civId!=null){
        const theirCiv=civilizations.get(other.civId);
        if(theirCiv&&myCiv.enemies.has(other.civId)){
          this._doConflict(other);return;
        }
        if(ideoDiff>0.6&&this._rng()<0.005&&!myCiv.allies.has(other.civId)){
          myCiv.enemies.add(other.civId);
          theirCiv.enemies.add(this.civId);
          myCiv.allies.delete(other.civId);
          theirCiv.allies.delete(this.civId);
          addWorldEvent(`⚔️ Guerra: ${myCiv.name} vs ${theirCiv.name}`);
        }
      }
      if(ideoDiff<0.2&&other.knowledge>this.knowledge){
        this.knowledge+=Math.min(2,(other.knowledge-this.knowledge)*0.1*_intelModifier);
      }
    }
  }

  _doConflict(enemy){
    if(this._warTimer>0||!enemy.alive)return;
    if(this.health<30||this.hunger<20)return;
    const myPower=(this.traits.strength*0.6+this.knowledge*0.2+this.aggression*20)*(1+this.weaponTier*0.3);
    const theirPower=(enemy.traits.strength*0.6+enemy.knowledge*0.2+enemy.aggression*20)*(1+enemy.weaponTier*0.3);
    const win=myPower*(0.8+this._rng()*0.4)>theirPower*(0.8+this._rng()*0.4);
    if(win){
      const dmg=5+Math.floor(this._rng()*10)+this.weaponTier*3;
      enemy.health=Math.max(0,enemy.health-dmg);
      const loot=Math.min(enemy.inventory.food,Math.floor(this._rng()*5));
      enemy.inventory.food-=loot;this.inventory.food+=loot;
      this.aggression=Math.min(1,this.aggression+0.02);
      enemy.aggression=Math.min(1,enemy.aggression+0.03);
      enemy._warFlash=3;
      if(enemy.health<=0){this.kills++;enemy._die('combate');}
    } else {
      const dmg=3+Math.floor(this._rng()*6);
      this.health=Math.max(0,this.health-dmg);
      this._warFlash=3;
    }
    this._warTimer=3+Math.floor(this._rng()*4);
    this.action=ACTIONS.LEAD;
  }

  _modifyTerrain(){
    const r=Math.min(8, 3+Math.floor(this.knowledge/500));
    const changed=[];
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const tx=this._settleTx+dx,ty=this._settleTy+dy;
      const cell=getCell(tx,ty);
      if(!cell)continue;
      // Deforest for farmland
      if(isLand(tx,ty)&&['forest','dense_forest','jungle','rainforest'].includes(cell.biome)){
        if(this._rng()<0.12){
          modifyTerrain(tx,ty,'grass');
          this.inventory.wood+=3;
          this.knowledge=Math.min(this.knowledge+0.3,9999);
          changed.push({tx,ty});
          if(changed.length>=2)break;
        }
      }
      // Irrigate dry land near farms
      if(isLand(tx,ty)&&['dry_grass','desert','savanna'].includes(cell.biome)){
        const nearFarm=this._findNearbyStructure('farm',6);
        if(nearFarm&&this._rng()<0.1){
          modifyTerrain(tx,ty,'grass');
          this.knowledge=Math.min(this.knowledge+0.2,9999);
          changed.push({tx,ty});
        }
      }
      // Reclaim shore/swamp near existing structures (city expansion into water)
      if(this.knowledge>200&&['shore','swamp'].includes(cell.biome)){
        // Direct grid check — no full structure scan
        let hasNearStruct=false;
        for(let sy2=Math.max(0,ty-4);sy2<=Math.min(WORLD_H-1,ty+4)&&!hasNearStruct;sy2++){
          for(let sx2=Math.max(0,tx-4);sx2<=Math.min(WORLD_W-1,tx+4)&&!hasNearStruct;sx2++){
            const ns=structureGrid[sy2][sx2];
            if(ns&&ns.civId===this.civId)hasNearStruct=true;
          }
        }
        if(hasNearStruct&&this._rng()<0.08){
          reclaimLand(tx,ty);
          changed.push({tx,ty});
        }
      }
    }
    if(changed.length>0&&typeof markTerritoryDirty!=='undefined')markTerritoryDirty();
  }

  _doBuild(){
    if(this.hunger<35||this.energy<25){this.action=ACTIONS.IDLE;return;}
    const needsWood=this.inventory.wood<2;
    const needsStone=this.inventory.stone<2;
    if(needsWood&&needsStone){this.action=ACTIONS.GATHER;return;}

    // Pick best structure based on knowledge, unlocks, and civ needs
    let type='camp';
    const civ=this.civId!=null?civilizations.get(this.civId):null;

    if(_unlockedTypes.has('palace')&&this.knowledge>15000&&this.inventory.wood>=25&&this.inventory.stone>=30&&this.isLeader)type='palace';
    else if(_unlockedTypes.has('cathedral')&&this.knowledge>10000&&this.inventory.wood>=20&&this.inventory.stone>=20)type='cathedral';
    else if(_unlockedTypes.has('citadel')&&this.knowledge>7000&&this.inventory.wood>=15&&this.inventory.stone>=25)type='citadel';
    else if(_unlockedTypes.has('observatory')&&this.knowledge>5000&&this.inventory.wood>=15&&this.inventory.stone>=25)type='observatory';
    else if(_unlockedTypes.has('university')&&this.knowledge>3500&&this.inventory.wood>=20&&this.inventory.stone>=20)type='university';
    else if(_unlockedTypes.has('aqueduct')&&this.knowledge>2500&&this.inventory.wood>=4&&this.inventory.stone>=12)type='aqueduct';
    else if(_unlockedTypes.has('harbor')&&this.knowledge>1800&&this.inventory.wood>=10&&this.inventory.stone>=6&&this._nearWater())type='harbor';
    else if(_unlockedTypes.has('colosseum')&&this.knowledge>1300&&this.inventory.wood>=15&&this.inventory.stone>=20)type='colosseum';
    else if(_unlockedTypes.has('barracks')&&this.knowledge>900&&this.inventory.wood>=8&&this.inventory.stone>=6&&getSocialPhase()==='division')type='barracks';
    else if(_unlockedTypes.has('academy')&&this.knowledge>650&&this.inventory.wood>=10&&this.inventory.stone>=10)type='academy';
    else if(_unlockedTypes.has('watchtower')&&this.knowledge>450&&this.inventory.wood>=5&&this.inventory.stone>=8&&getSocialPhase()==='division')type='watchtower';
    else if(_unlockedTypes.has('granary')&&this.knowledge>220&&this.inventory.wood>=6&&this.inventory.stone>=4)type='granary';
    else if(_unlockedTypes.has('forge')&&this.knowledge>320&&this.inventory.wood>=6&&this.inventory.stone>=8)type='forge';
    else if(_unlockedTypes.has('library')&&this.knowledge>140&&this.inventory.wood>=8&&this.inventory.stone>=6)type='library';
    else if(_unlockedTypes.has('palisade')&&this.knowledge>80&&this.inventory.wood>=6&&getSocialPhase()==='division')type='palisade';
    else if(_unlockedTypes.has('workshop')&&this.knowledge>40&&this.inventory.wood>=5&&this.inventory.stone>=3)type='workshop';
    else if(_unlockedTypes.has('well')&&this.knowledge>15&&this.inventory.wood>=2&&this.inventory.stone>=4)type='well';
    else if(this.knowledge>200&&this.inventory.wood>=8&&this.inventory.stone>=8)type='temple';
    else if(this.knowledge>100&&this.inventory.wood>=6&&this.inventory.stone>=4)type='market';
    else if(this.inventory.wood>=4&&this.inventory.stone>=2)type='hut';
    else if(this.inventory.wood>=2&&this.inventory.stone>=3)type='mine';
    else if(this.inventory.wood>=2)type='camp';

    const def=STRUCTURE_TYPES[type];
    if(!def){this.action=ACTIONS.GATHER;return;}
    const cost=def.cost;
    if(this.inventory.wood<cost.wood||this.inventory.stone<cost.stone){
      this.action=ACTIONS.GATHER;return;
    }

    // Try to build densely — prefer tiles close to existing structures of same civ
    // Also allow building on reclaimed land (shore/swamp that was converted)
    const minSpacing=type==='hut'||type==='camp'?2:3;
    for(let r=1;r<=14;r++){
      for(let a=0;a<20;a++){
        const angle=(a/20)*Math.PI*2+this._wanderAngle;
        const bx=Math.round(this._settleTx+Math.cos(angle)*r);
        const by=Math.round(this._settleTy+Math.sin(angle)*r);
        if(!isLand(bx,by)||getStructureAt(bx,by)||getResourceAt(bx,by))continue;
        // Check spacing using grid — O(minSpacing²) not O(structures)
        let tooClose=false;
        for(let sy2=Math.max(0,by-minSpacing);sy2<=Math.min(WORLD_H-1,by+minSpacing)&&!tooClose;sy2++){
          for(let sx2=Math.max(0,bx-minSpacing);sx2<=Math.min(WORLD_W-1,bx+minSpacing)&&!tooClose;sx2++){
            const ns=structureGrid[sy2][sx2];
            if(ns&&ns.type===type)tooClose=true;
          }
        }
        if(tooClose)continue;
        if(placeStructure(bx,by,type,this)){
          this.inventory.wood-=cost.wood;this.inventory.stone-=cost.stone;
          this.knowledge=Math.min(99999,this.knowledge+6*_intelModifier*this._intelVariance);
          this.homeBase={tx:bx,ty:by};
          this._settleTx=bx;this._settleTy=by;
          this.action=ACTIONS.BUILD;
          this.addLog(`Construyó ${def.label}`);
          this._onBuildComplete(type,bx,by);
          return;
        }
      }
    }
    this.action=ACTIONS.GATHER; // couldn't place — go gather more
  }

  _nearWater(){
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
      const cell=getCell(this._settleTx+dx,this._settleTy+dy);
      if(cell&&(cell.biome==='sea'||cell.biome==='shore'))return true;
    }
    return false;
  }

  _onBuildComplete(type,bx,by){
    const near=_spatialQuery(bx,by,25,-1);
    if(typeof markCityGlowDirty!=='undefined')markCityGlowDirty();
    switch(type){
      case 'library':
        for(const h of near)h.knowledge=Math.min(99999,h.knowledge+5);
        addWorldEvent(`📚 ${this.name.split(' ')[0]} construyó Biblioteca`);break;
      case 'academy':
        for(const h of near)h.knowledge=Math.min(99999,h.knowledge+10);
        addWorldEvent(`🎓 ${this.name.split(' ')[0]} fundó Academia`);break;
      case 'forge':
        if(this.civId){const c=civilizations.get(this.civId);if(c&&c.techLevel<2)c.techLevel=2;}
        addWorldEvent(`⚒️ ${this.name.split(' ')[0]} construyó Forja — era del metal`);break;
      case 'barracks':
        // Assign nearby civ members as soldiers
        for(const h of near.slice(0,3)){if(h.civId===this.civId){h.isSoldier=true;h.weaponTier=Math.max(h.weaponTier,1);}}
        addWorldEvent(`⚔️ ${this.name.split(' ')[0]} construyó Cuartel`);break;
      case 'watchtower':
        addWorldEvent(`🗼 ${this.name.split(' ')[0]} construyó Torre Vigía`);break;
      case 'palisade':
        addWorldEvent(`🪵 ${this.name.split(' ')[0]} construyó Empalizada`);break;
      case 'granary':
        for(const h of near)h.inventory.food=Math.min(h.inventory.food+10,50);
        addWorldEvent(`🌽 ${this.name.split(' ')[0]} construyó Granero`);break;
      case 'harbor':
        addWorldEvent(`⚓ ${this.name.split(' ')[0]} construyó Puerto — comercio marítimo`);break;
      case 'aqueduct':
        for(const h of near)h.health=Math.min(100,h.health+20);
        addWorldEvent(`🌊 ${this.name.split(' ')[0]} construyó Acueducto`);break;
      case 'citadel':
        addWorldEvent(`🏰 ${this.name.split(' ')[0]} construyó Ciudadela — fortaleza inexpugnable`);break;
      case 'cathedral':
        for(const h of near){h.social=Math.min(100,h.social+20);h.ideology=Math.max(0,Math.min(1,h.ideology*0.9+0.05));}
        addWorldEvent(`⛪ ${this.name.split(' ')[0]} construyó Catedral`);break;
      case 'palace':
        if(this.civId){const c=civilizations.get(this.civId);if(c)c.militaryPower+=50;}
        addWorldEvent(`🏯 ${this.name.split(' ')[0]} construyó Palacio — capital del Imperio`);break;
      case 'colosseum':
        addWorldEvent(`🏟 ${this.name.split(' ')[0]} construyó Coliseo`);break;
      case 'university':
        addWorldEvent(`🏫 ${this.name.split(' ')[0]} fundó Universidad`);break;
      case 'observatory':
        if(this.civId){const c=civilizations.get(this.civId);if(c&&c.techLevel<4)c.techLevel=4;}
        addWorldEvent(`🔭 ${this.name.split(' ')[0]} construyó Observatorio`);break;
      case 'temple':case 'market':
        addWorldEvent(`🏛 ${this.name.split(' ')[0]} construyó ${STRUCTURE_TYPES[type].label}`);break;
    }
  }

  _doFarm(){
    if(this.hunger<45||this.inventory.wood<1){this.action=ACTIONS.IDLE;return;}
    for(let r=2;r<=8;r++){
      for(let a=0;a<12;a++){
        const angle=(a/12)*Math.PI*2+this._wanderAngle;
        const bx=Math.round(this._settleTx+Math.cos(angle)*r);
        const by=Math.round(this._settleTy+Math.sin(angle)*r);
        const cell=getCell(bx,by);
        if(!cell||!isLand(bx,by)||getStructureAt(bx,by)||getResourceAt(bx,by))continue;
        if(['grass','dense_grass','dry_grass','savanna','shrubland','grassland'].includes(cell.biome)){
          if(placeStructure(bx,by,'farm',this)){
            this.inventory.wood--;
            this.knowledge=Math.min(99999,this.knowledge+2);
            this.action=ACTIONS.FARM;
            this.addLog('Plantó un cultivo');
            return;
          }
        }
      }
    }
    this.action=ACTIONS.IDLE; // couldn't place farm — idle next tick
  }

  _gatherResources(){
    if(this.inventory.wood<15){
      const res=this._findNearbyResource(WOOD_TYPES,30);
      if(res){
        if(Math.hypot(res.tx-this.tx,res.ty-this.ty)<=1.5){
          this._harvestResourceNow(res);
        } else {
          this._setDest(res.tx,res.ty);this.action=ACTIONS.GATHER;this.target=res;
        }
        return;
      }
    }
    if(this.inventory.stone<12){
      const res=this._findNearbyResource(STONE_TYPES,30);
      if(res){
        if(Math.hypot(res.tx-this.tx,res.ty-this.ty)<=1.5){
          this._harvestResourceNow(res);
        } else {
          this._setDest(res.tx,res.ty);this.action=ACTIONS.MINE;this.target=res;
        }
        return;
      }
    }
    // Have enough resources — signal to build next tick via urge
    if(this.inventory.wood>=4)this._buildUrge=1;
    this._doWander();
  }

  _tryReproduce(nearby){
    if(!this._canReproduce||this.age<15||this.age>50||this.reproTimer>0){
      this.action=ACTIONS.SOCIALIZE;return;
    }
    if(this.hunger<35||this.energy<25||this.sick){this.action=ACTIONS.IDLE;return;}
    const {soft,hard}=_getPopCaps();
    const aliveCount=_cachedAliveCount;
    if(aliveCount>=hard){this.action=ACTIONS.SOCIALIZE;return;}
    if(aliveCount>=soft&&this._rng()<(aliveCount-soft)/(hard-soft)){
      this.action=ACTIONS.SOCIALIZE;return;
    }

    let partner=null;
    const searchRadius=nearby.length>0?16:80;
    const candidates=searchRadius===16?nearby:_spatialQuery(this.tx,this.ty,80,this.id);
    for(const h of candidates){
      if(h.gender===this.gender||h.age<15||h.age>50||h.reproTimer>0)continue;
      if(h.hunger<30||h.energy<20||h.sick)continue;
      if(Math.hypot(h.tx-this.tx,h.ty-this.ty)<=8){partner=h;break;}
    }
    if(partner){
      this.action=ACTIONS.REPRODUCE;partner.action=ACTIONS.REPRODUCE;
      this.reproTimer=1+Math.floor(this._rng()*3);
      partner.reproTimer=1+Math.floor(partner._rng()*3);
      this._reproUrge=0;partner._reproUrge=0;
      const cRng=mulberry32(WORLD_SEED^(this.id*0x1337)^(year*0x7F)^(partner.id*0x31));
      const childGender=cRng()<0.5?'F':'M';
      const child=new Human(this.tx,this.ty,cRng,childGender,this,partner);
      child.hunger=95;child.energy=98;child.health=100;
      if(this.civId)child.civId=this.civId;
      child._settleTx=this._settleTx+Math.round(cRng()*6-3);
      child._settleTy=this._settleTy+Math.round(cRng()*6-3);
      child._wanderAngle=cRng()*Math.PI*2;
      humans.push(child);_spatialAdd(child);
      _humanById.set(child.id,child);
      if(this.civId){const civ=civilizations.get(this.civId);if(civ)civ.addMember(child);}
      this.children++;partner.children++;
      this.addLog(`Tuvo ${childGender==='F'?'una hija':'un hijo'}: ${child.name.split(' ')[0]}`);
      partner.addLog(`Tuvo ${childGender==='F'?'una hija':'un hijo'}: ${child.name.split(' ')[0]}`);
      if(this.children===1||partner.children===1)
        addWorldEvent(`👶 ${child.name.split(' ')[0]} nació (${childGender==='F'?'♀':'♂'})`);
    } else {
      // Don't do expensive wide search — just wander toward a random direction
      this._doWander();
    }
  }

  _joinCiv(civId){
    if(this.civId===civId)return;
    if(this.civId){const old=civilizations.get(this.civId);if(old)old.removeMember(this.id);}
    this.civId=civId;
    const civ=civilizations.get(civId);
    if(civ){civ.addMember(this);this.addLog(`Se unió a ${civ.name}`);}
  }

  _navigateTo(tx,ty){
    const ntx=Math.max(0,Math.min(WORLD_W-1,Math.round(tx)));
    const nty=Math.max(0,Math.min(WORLD_H-1,Math.round(ty)));
    if(ntx===this.tx&&nty===this.ty)return;
    const dx=ntx-this.tx,dy=nty-this.ty;
    const sx=this.tx+(dx>0?1:dx<0?-1:0);
    const sy=this.ty+(dy>0?1:dy<0?-1:0);
    if(isLand(sx,sy)){this._setDest(sx,sy);return;}
    if(isLand(sx,this.ty)){this._setDest(sx,this.ty);return;}
    if(isLand(this.tx,sy)){this._setDest(this.tx,sy);return;}
    for(let a=0;a<8;a++){
      const rx=this.tx+Math.round(Math.cos(a/8*Math.PI*2));
      const ry=this.ty+Math.round(Math.sin(a/8*Math.PI*2));
      if(isLand(rx,ry)){this._setDest(rx,ry);return;}
    }
  }
  _setDest(tx,ty){this.destPx=tx*TILE+TILE/2;this.destPy=ty*TILE+TILE/2;}

  _findNearbyResource(types,radius){
    let best=null,bestDist=Infinity;
    // Use a spiral-like scan but cap at radius — resourceGrid is O(1) per tile
    const r2=radius*radius;
    const x0=Math.max(0,this.tx-radius),x1=Math.min(WORLD_W-1,this.tx+radius);
    const y0=Math.max(0,this.ty-radius),y1=Math.min(WORLD_H-1,this.ty+radius);
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
      const res=resourceGrid[ty][tx];
      if(!res||!types.includes(res.type))continue;
      const dx=tx-this.tx,dy=ty-this.ty;
      const d2=dx*dx+dy*dy;
      if(d2<bestDist&&d2<=r2){bestDist=d2;best=res;}
    }
    return best;
  }
  _findNearbyStructure(type,radius){
    let best=null,bestD=Infinity;
    const r2=radius*radius;
    // Scan structureGrid directly — O(radius²) instead of O(all structures)
    const x0=Math.max(0,this.tx-radius),x1=Math.min(WORLD_W-1,this.tx+radius);
    const y0=Math.max(0,this.ty-radius),y1=Math.min(WORLD_H-1,this.ty+radius);
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
      const s=structureGrid[ty][tx];
      if(!s)continue;
      if(type&&s.type!==type)continue;
      const dx=tx-this.tx,dy=ty-this.ty;
      const d2=dx*dx+dy*dy;
      if(d2<=r2&&d2<bestD){bestD=d2;best=s;}
    }
    return best;
  }

  _harvestFarm(farm){
    this.inventory.food+=20;this.hunger=Math.min(100,this.hunger+40);
    farm.hp-=2;
    if(farm.hp<=0){
      const idx=structures.indexOf(farm);
      if(idx>=0)structures.splice(idx,1);
      structureGrid[farm.ty][farm.tx]=null;
    }
  }

  _die(cause){
    this.alive=false;this.action=`Murió (${cause})`;
    this.addLog(`Murió de ${cause} a los ${Math.floor(this.age)} años`);
    _spatialRemove(this);
    if(this.civId){
      const civ=civilizations.get(this.civId);
      if(civ){civ.removeMember(this.id);if(civ.leaderId===this.id)_electNewLeader(civ);}
    }
    if(this.children>0||this.isLeader||this.kills>2)
      addWorldEvent(`💀 ${this.name.split(' ')[0]} murió de ${cause} (${Math.floor(this.age)}a, ${this.children} hijos, ${this.kills} victorias)`);
  }
}

// ── Knowledge unlocks (expanded to 15+ structures) ────────────────────────────
const KNOWLEDGE_UNLOCKS=[
  {avgK:15,   type:'well',       icon:'💧',color:'#60a0ff',label:'Pozo',        cost:{wood:2,stone:4},  hp:120,decay:false,decayRate:0, msg:'💧 Pozo desbloqueado — agua garantizada'},
  {avgK:40,   type:'workshop',   icon:'🔨',color:'#c08040',label:'Taller',      cost:{wood:5,stone:3},  hp:120,decay:false,decayRate:0, msg:'🔨 Taller desbloqueado — producción avanzada'},
  {avgK:80,   type:'palisade',   icon:'🪵',color:'#8B5E3C',label:'Empalizada',  cost:{wood:6,stone:0},  hp:200,decay:false,decayRate:0, msg:'🪵 Empalizada desbloqueada — primeras defensas'},
  {avgK:140,  type:'library',    icon:'📚',color:'#80c0ff',label:'Biblioteca',  cost:{wood:8,stone:6},  hp:150,decay:false,decayRate:0, msg:'📚 Biblioteca desbloqueada — conocimiento compartido'},
  {avgK:220,  type:'granary',    icon:'🌽',color:'#d4a017',label:'Granero',     cost:{wood:6,stone:4},  hp:150,decay:false,decayRate:0, msg:'🌽 Granero desbloqueado — reservas de alimento'},
  {avgK:320,  type:'forge',      icon:'⚒️', color:'#ff8040',label:'Forja',       cost:{wood:6,stone:8},  hp:150,decay:false,decayRate:0, msg:'⚒️ Forja desbloqueada — era del metal'},
  {avgK:450,  type:'watchtower', icon:'🗼',color:'#aaaaaa',label:'Torre Vigía', cost:{wood:5,stone:8},  hp:200,decay:false,decayRate:0, msg:'🗼 Torre Vigía desbloqueada — vigilancia del territorio'},
  {avgK:650,  type:'academy',    icon:'🎓',color:'#ffd700',label:'Academia',    cost:{wood:10,stone:10},hp:200,decay:false,decayRate:0, msg:'🎓 Academia desbloqueada — era del conocimiento'},
  {avgK:900,  type:'barracks',   icon:'⚔️', color:'#cc4444',label:'Cuartel',    cost:{wood:8,stone:6},  hp:180,decay:false,decayRate:0, msg:'⚔️ Cuartel desbloqueado — ejércitos organizados'},
  {avgK:1300, type:'colosseum',  icon:'🏟',color:'#e0a040',label:'Coliseo',     cost:{wood:15,stone:20},hp:300,decay:false,decayRate:0, msg:'🏟 Coliseo desbloqueado — era de los espectáculos'},
  {avgK:1800, type:'harbor',     icon:'⚓',color:'#3080ff',label:'Puerto',      cost:{wood:10,stone:6}, hp:200,decay:false,decayRate:0, msg:'⚓ Puerto desbloqueado — comercio marítimo'},
  {avgK:2500, type:'aqueduct',   icon:'🌊',color:'#40c0ff',label:'Acueducto',   cost:{wood:4,stone:12}, hp:250,decay:false,decayRate:0, msg:'🌊 Acueducto desbloqueado — ingeniería hidráulica'},
  {avgK:3500, type:'university', icon:'🏫',color:'#a0d0ff',label:'Universidad', cost:{wood:20,stone:20},hp:300,decay:false,decayRate:0, msg:'🏫 Universidad desbloqueada — ciencia avanzada'},
  {avgK:5000, type:'observatory',icon:'🔭',color:'#c0a0ff',label:'Observatorio',cost:{wood:15,stone:25},hp:300,decay:false,decayRate:0, msg:'🔭 Observatorio desbloqueado — era de la ciencia'},
  {avgK:7000, type:'citadel',    icon:'🏰',color:'#888888',label:'Ciudadela',   cost:{wood:15,stone:25},hp:500,decay:false,decayRate:0, msg:'🏰 Ciudadela desbloqueada — fortaleza inexpugnable'},
  {avgK:10000,type:'cathedral',  icon:'⛪',color:'#e8d0ff',label:'Catedral',    cost:{wood:20,stone:20},hp:400,decay:false,decayRate:0, msg:'⛪ Catedral desbloqueada — era de la fe'},
  {avgK:15000,type:'palace',     icon:'🏯',color:'#ffd700',label:'Palacio',     cost:{wood:25,stone:30},hp:600,decay:false,decayRate:0, msg:'🏯 Palacio desbloqueado — era imperial'},
];
const _unlockedTypes=new Set(['camp','hut','farm','mine','market','temple']);

let _knowledgeUnlockTimer=0;
function _checkKnowledgeUnlocks(){
  // Throttle — only run every 10 years
  _knowledgeUnlockTimer+=1;
  if(_knowledgeUnlockTimer<10)return;
  _knowledgeUnlockTimer=0;
  // Use cached alive array from tickHumans
  const alive=_cachedAlive;
  if(alive.length===0)return;
  // Compute avg knowledge with a sample for large populations
  let sum=0,count=0;
  const step=alive.length>60?Math.ceil(alive.length/60):1;
  for(let i=0;i<alive.length;i+=step){sum+=alive[i].knowledge;count++;}
  const avgK=count>0?sum/count:0;
  for(const u of KNOWLEDGE_UNLOCKS){
    if(avgK>=u.avgK&&!_unlockedTypes.has(u.type)){
      _unlockedTypes.add(u.type);
      STRUCTURE_TYPES[u.type]={icon:u.icon,color:u.color,label:u.label,cost:u.cost,hp:u.hp,decay:u.decay,decayRate:u.decayRate};
      addWorldEvent(u.msg);
      for(const h of alive)h.knowledge=Math.min(99999,h.knowledge+3);
    }
  }
  // Upgrade weapon tiers — build per-civ knowledge map once
  const civKMap=new Map(); // civId → {total,count}
  for(const h of alive){
    if(h.civId==null)continue;
    let e=civKMap.get(h.civId);
    if(!e){e={total:0,count:0};civKMap.set(h.civId,e);}
    e.total+=h.knowledge;e.count++;
  }
  for(const [civId,e] of civKMap){
    const civ=civilizations.get(civId);
    if(!civ||e.count===0)continue;
    const avgCivK=e.total/e.count;
    const newTech=avgCivK>10000?5:avgCivK>3000?4:avgCivK>800?3:avgCivK>200?2:avgCivK>50?1:0;
    if(newTech>civ.techLevel){
      civ.techLevel=newTech;
      const weaponName=WEAPON_TIERS[newTech]||'Arma Avanzada';
      const techEvents=['🗡️','⚔️','🔱','🛡️','💣'];
      addWorldEvent(`${techEvents[newTech-1]||'⚔️'} ${civ.name} dominó: ${weaponName} — nueva era militar`);
      // Update all members
      for(const id of civ.members){
        const h=_hById(id);
        if(h&&h.alive&&h.weaponTier<newTech)h.weaponTier=newTech;
      }
    }
  }
}

// ── Leader election ───────────────────────────────────────────────────────────
function _electNewLeader(civ){
  let best=null,bestScore=-1;
  for(const id of civ.members){
    const h=_hById(id);
    if(!h||!h.alive)continue;
    if(h.leaderScore>bestScore){bestScore=h.leaderScore;best=h;}
  }
  if(best){
    const old=_hById(civ.leaderId);
    if(old)old.isLeader=false;
    civ.leaderId=best.id;best.isLeader=true;
    best.addLog(`Elegido líder de ${civ.name}`);
    addWorldEvent(`👑 ${best.name.split(' ')[0]} elegido líder de ${civ.name}`);
  }
}

// ── Civ splitting ─────────────────────────────────────────────────────────────
function _checkCivSplits(){
  for(const [civId,civ] of civilizations){
    if(civ.population<12)continue;
    const members=[];
    for(const id of civ.members){
      const h=_hById(id);
      if(h&&h.alive)members.push(h);
    }
    if(members.length<12)continue;
    // Quick ideology check — sample instead of full scan
    const sample=members.length>30?members.filter((_,i)=>i%2===0):members;
    let sumIde=0;
    for(const h of sample)sumIde+=h.ideology;
    const avgIdeology=sumIde/sample.length;
    const splinters=sample.filter(h=>Math.abs(h.ideology-avgIdeology)>0.45);
    if(splinters.length<3)continue;
    const founder=splinters[0];
    const newCiv=new Civilization(founder);
    newCiv.color=`hsl(${Math.floor(founder._rng()*360)},70%,65%)`;
    civilizations.set(newCiv.id,newCiv);
    for(const h of splinters){
      civ.removeMember(h.id);
      h.civId=newCiv.id;
      h.color=newCiv.color;
      newCiv.addMember(h);
    }
    newCiv.enemies.add(civId);
    civ.enemies.add(newCiv.id);
    addWorldEvent(`✊ Escisión: ${newCiv.name} se separó de ${civ.name} (${splinters.length} disidentes)`);
  }
}

// ── Prodigies ─────────────────────────────────────────────────────────────────
// Every 500 years a legendary figure is born with extreme stats and a unique gift
const PRODIGY_TYPES=[
  {
    name:'Arquitecto Legendario',icon:'🏛',color:'#ffd700',
    gift:'constructor',
    desc:'Construye estructuras épicas a velocidad sobrehumana',
    boost:{knowledge:300,strength:60,intellect:95,charisma:80},
    onSpawn(h){
      h.inventory={food:80,wood:60,stone:50};
      h._buildUrge=1;h._flattenUrge=1;
      addWorldEvent(`🏛✨ ${h.name} nació — Arquitecto Legendario. Las ciudades nunca serán iguales.`);
    },
    onTick(h,yearsElapsed){
      // Builds 3x faster, unlocks next structure tier immediately
      h._buildUrge=Math.min(1,h._buildUrge+yearsElapsed*1.5);
      h._flattenUrge=Math.min(1,h._flattenUrge+yearsElapsed*1.0);
      h.inventory.wood=Math.min(80,h.inventory.wood+Math.floor(yearsElapsed*3));
      h.inventory.stone=Math.min(60,h.inventory.stone+Math.floor(yearsElapsed*3));
      // Boost nearby humans' build urge
      const near=_spatialQuery(h.tx,h.ty,20,h.id);
      for(const n of near)n._buildUrge=Math.min(1,n._buildUrge+yearsElapsed*0.3);
    }
  },
  {
    name:'Filósofo Iluminado',icon:'📜',color:'#a8f0ff',
    gift:'sabio',
    desc:'Eleva el conocimiento de toda la civilización',
    boost:{knowledge:500,strength:30,intellect:99,charisma:90},
    onSpawn(h){
      addWorldEvent(`📜✨ ${h.name} nació — Filósofo Iluminado. Una nueva era del saber comienza.`);
    },
    onTick(h,yearsElapsed){
      // Radiates knowledge to everyone nearby
      const near=_spatialQuery(h.tx,h.ty,30,h.id);
      for(const n of near){
        n.knowledge=Math.min(99999,n.knowledge+yearsElapsed*8*_intelModifier);
      }
      h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*20*_intelModifier);
      // Occasionally triggers a knowledge unlock event
      if(h._rng()<0.002*yearsElapsed){
        _checkKnowledgeUnlocks();
        addWorldEvent(`💡 ${h.name.split(' ')[0]} tuvo una revelación — conocimiento avanzado`);
      }
    }
  },
  {
    name:'Gran Conquistador',icon:'⚔️',color:'#ff4444',
    gift:'guerrero',
    desc:'Unifica civilizaciones por la fuerza o la diplomacia',
    boost:{knowledge:150,strength:99,intellect:70,charisma:85},
    onSpawn(h){
      h.isSoldier=true;h.weaponTier=Math.min(6,h.weaponTier+2);
      h.aggression=0.85;
      addWorldEvent(`⚔️✨ ${h.name} nació — Gran Conquistador. Los imperios temblarán.`);
    },
    onTick(h,yearsElapsed){
      // Inspires nearby soldiers
      const near=_spatialQuery(h.tx,h.ty,25,h.id);
      for(const n of near){
        if(n.civId===h.civId){
          n.weaponTier=Math.max(n.weaponTier,h.weaponTier-1);
          if(!n.isSoldier&&h._rng()<0.02)n.isSoldier=true;
        }
      }
      // Absorbs enemy civs on contact
      if(h.civId!=null){
        const myCiv=civilizations.get(h.civId);
        if(myCiv){
          for(const n of near){
            if(n.civId!=null&&n.civId!==h.civId&&h._rng()<0.01*yearsElapsed){
              const theirCiv=civilizations.get(n.civId);
              if(theirCiv&&!myCiv.allies.has(n.civId)){
                myCiv.enemies.add(n.civId);theirCiv.enemies.add(h.civId);
              }
            }
          }
        }
      }
    }
  },
  {
    name:'Sanador Divino',icon:'✨',color:'#80ffaa',
    gift:'sanador',
    desc:'Erradica enfermedades y extiende la vida de todos',
    boost:{knowledge:250,strength:40,intellect:85,charisma:95},
    onSpawn(h){
      // Clear all active outbreaks
      activeOutbreaks.length=0;
      addWorldEvent(`✨🌿 ${h.name} nació — Sanador Divino. Las plagas retroceden.`);
    },
    onTick(h,yearsElapsed){
      // Heals everyone nearby and cures disease
      const near=_spatialQuery(h.tx,h.ty,25,h.id);
      for(const n of near){
        n.health=Math.min(100,n.health+yearsElapsed*5);
        if(n.sick&&h._rng()<0.15*yearsElapsed){
          n.sick=false;n.immunity.add(n.sickType?.name||'');n.sickType=null;
        }
      }
      // Suppress new outbreaks near them
      activeOutbreaks=activeOutbreaks.filter(o=>Math.hypot(o.tx-h.tx,o.ty-h.ty)>20);
    }
  },
  {
    name:'Inventor Visionario',icon:'⚙️',color:'#ffcc00',
    gift:'inventor',
    desc:'Acelera el avance tecnológico de su civilización',
    boost:{knowledge:400,strength:50,intellect:98,charisma:70},
    onSpawn(h){
      // Instantly unlock next 2 structure tiers
      if(h.civId!=null){
        const civ=civilizations.get(h.civId);
        if(civ&&civ.techLevel<5)civ.techLevel=Math.min(5,civ.techLevel+2);
      }
      addWorldEvent(`⚙️✨ ${h.name} nació — Inventor Visionario. La tecnología da un salto.`);
    },
    onTick(h,yearsElapsed){
      h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*15*_intelModifier);
      // Boost civ tech level over time
      if(h.civId!=null&&h._rng()<0.005*yearsElapsed){
        const civ=civilizations.get(h.civId);
        if(civ&&civ.techLevel<5){
          civ.techLevel++;
          addWorldEvent(`⚙️ ${h.name.split(' ')[0]} inventó algo revolucionario — ${WEAPON_TIERS[civ.techLevel]||'tecnología avanzada'}`);
        }
      }
      // Spread tech to nearby civ members
      const near=_spatialQuery(h.tx,h.ty,20,h.id);
      for(const n of near){
        if(n.civId===h.civId)n.knowledge=Math.min(99999,n.knowledge+yearsElapsed*4*_intelModifier);
      }
    }
  },
];

let _lastProdigyYear=0;
let _prodigyCount=0; // how many prodigies have been spawned total
const PRODIGY_INTERVAL=500;

function _spawnProdigy(){
  const alive=_cachedAlive;
  if(alive.length===0)return;

  // Pick a random civ that has living members — prefer larger civs
  const civList=[...civilizations.values()].filter(c=>c.population>0);
  if(civList.length===0)return;
  // Weight by population
  let totalPop=0;for(const c of civList)totalPop+=c.population;
  const rng=mulberry32(WORLD_SEED^year^0xCAFE);
  let pick=rng()*totalPop;
  let targetCiv=civList[0];
  for(const c of civList){pick-=c.population;if(pick<=0){targetCiv=c;break;}}

  // Find a living member of that civ to use as spawn location
  let spawnH=null;
  for(const id of targetCiv.members){
    const h=_hById(id);
    if(h&&h.alive){spawnH=h;break;}
  }
  if(!spawnH)spawnH=alive[Math.floor(rng()*alive.length)];

  // Pick prodigy type — cycle through them using spawn count
  const typeIdx=_prodigyCount%PRODIGY_TYPES.length;
  const ptype=PRODIGY_TYPES[typeIdx];

  // Create the prodigy as a new human with extreme stats
  const pRng=mulberry32(WORLD_SEED^year^0xF00D);
  const gender=pRng()<0.5?'M':'F';
  const prodigy=new Human(spawnH.tx,spawnH.ty,pRng,gender,null,null);

  // Override with legendary stats
  prodigy.knowledge=ptype.boost.knowledge;
  prodigy.traits.strength=ptype.boost.strength;
  prodigy.traits.intellect=ptype.boost.intellect;
  prodigy.traits.charisma=ptype.boost.charisma;
  prodigy.traits.fertility=20; // prodigies don't focus on reproduction
  prodigy.age=20;
  prodigy.health=100;prodigy.hunger=100;prodigy.energy=100;
  prodigy.civId=targetCiv.id;
  prodigy.color=ptype.color;
  prodigy._intelVariance=1.5;
  prodigy.isLeader=false;
  prodigy.isProdigy=true;
  prodigy.prodigyType=ptype;
  prodigy._prodigyGift=ptype.gift;
  prodigy.inventory={food:60,wood:40,stone:30};
  prodigy.leaderScore=9999;
  prodigy._buildUrge=0.8;
  prodigy._flattenUrge=0.8;
  prodigy.weaponTier=Math.min(6,targetCiv.techLevel+1);

  // Give them a legendary name
  const legendaryTitles=['el Grande','la Sabia','el Eterno','la Divina','el Forjador','la Visionaria','el Iluminado','la Conquistadora'];
  prodigy.name=prodigy.name.split(' ')[0]+' '+legendaryTitles[Math.floor(pRng()*legendaryTitles.length)];

  humans.push(prodigy);
  _spatialAdd(prodigy);
  _humanById.set(prodigy.id,prodigy);
  targetCiv.addMember(prodigy);

  // Run the prodigy's spawn effect
  ptype.onSpawn(prodigy);

  _prodigyCount++;

  // Make them leader if they're the best
  _electNewLeader(targetCiv);
}

// Hook prodigy tick into Human.tick — called from tickHumans
function _tickProdigies(yearsElapsed){
  for(const h of _cachedAlive){
    if(!h.isProdigy||!h.prodigyType)continue;
    h.prodigyType.onTick(h,yearsElapsed);
    // Prodigies live longer
    h.health=Math.min(100,h.health+yearsElapsed*2);
    h.hunger=Math.min(100,h.hunger+yearsElapsed*3);
    h.energy=Math.min(100,h.energy+yearsElapsed*3);
  }
}
let humans=[];
// Fast lookup map — kept in sync with humans array
const _humanById=new Map();
// Cached alive count — updated in tickHumans
let _cachedAliveCount=0;

function _hById(id){ return _humanById.get(id)||null; }

function spawnInitialHumans(){
  initStructureGrid();
  initSpatialGrid();
  const cx=Math.floor(WORLD_W/2),cy=Math.floor(WORLD_H/2);
  let sx=cx,sy=cy;
  outer:for(let r=0;r<60;r++)for(let a=0;a<20;a++){
    const tx=cx+Math.round(Math.cos(a/20*Math.PI*2)*r);
    const ty=cy+Math.round(Math.sin(a/20*Math.PI*2)*r);
    if(!isLand(tx,ty))continue;
    const cell=getCell(tx,ty);
    if(cell&&['grass','dense_grass','forest','savanna'].includes(cell.biome)){sx=tx;sy=ty;break outer;}
  }
  if(!isLand(sx,sy)){
    outer2:for(let r=0;r<60;r++)for(let a=0;a<20;a++){
      const tx=cx+Math.round(Math.cos(a/20*Math.PI*2)*r);
      const ty=cy+Math.round(Math.sin(a/20*Math.PI*2)*r);
      if(isLand(tx,ty)){sx=tx;sy=ty;break outer2;}
    }
  }

  const rngA=mulberry32(WORLD_SEED^0xABCD1234);
  const rngB=mulberry32(WORLD_SEED^0xDEADBEEF);

  const adam=new Human(sx,sy,rngA,'M',null,null);
  adam.knowledge=30;adam.inventory={food:40,wood:15,stone:8};
  adam.hunger=98;adam.energy=100;
  adam._wanderAngle=Math.PI*0.2;
  adam._settleTx=sx;adam._settleTy=sy;

  const ex=Math.max(0,Math.min(WORLD_W-1,sx+4));
  const ey=Math.max(0,Math.min(WORLD_H-1,sy+2));
  const spawnX=isLand(ex,ey)?ex:sx;
  const spawnY=isLand(ex,ey)?ey:sy;
  const eve=new Human(spawnX,spawnY,rngB,'F',null,null);
  eve.knowledge=30;eve.inventory={food:40,wood:15,stone:8};
  eve.hunger=98;eve.energy=100;
  eve._wanderAngle=Math.PI*1.2;
  eve._settleTx=spawnX;eve._settleTy=spawnY;

  const civ=getOrCreateCiv(adam);
  civ.addMember(eve);eve.civId=civ.id;
  adam.isLeader=true;

  humans.push(adam,eve);
  _spatialAdd(adam);_spatialAdd(eve);
  _humanById.set(adam.id,adam);
  _humanById.set(eve.id,eve);
  _cachedAliveCount=2;
}

// ── Global movement ───────────────────────────────────────────────────────────
function updateHumanMovement(dtSec,speedMult){
  for(const h of humans)h.updateMovement(dtSec,speedMult);
}

// ── Annual tick ───────────────────────────────────────────────────────────────
let _leaderElectTimer=0;
let _passiveEffectsTimer=0;
let _territoryTimer=0;
// Shared alive cache used throughout tickHumans — avoids repeated filter()
let _cachedAlive=[];

function tickHumans(yearsElapsed){
  // Rebuild alive cache once per tick — don't clear _humanById (it's kept in sync)
  _cachedAlive=[];
  for(const h of humans){
    if(h.alive)_cachedAlive.push(h);
  }
  _cachedAliveCount=_cachedAlive.length;

  _tickIntelligenceCurve(yearsElapsed);
  tickDiseases(yearsElapsed, _cachedAlive);
  tickStructures(yearsElapsed);
  _tickProdigies(yearsElapsed);

  // At high speed, skip AI for a fraction of humans each tick to spread load
  // yearsElapsed > 1 means we're running fast — process subset per tick
  const n=_cachedAlive.length;
  const skipFactor=yearsElapsed>4?4:yearsElapsed>2?2:1; // skip more at higher speeds
  const skipAI=skipFactor>1&&n>20;
  const tickOffset=Math.floor(year*7)%skipFactor;

  for(let i=0;i<n;i++){
    const h=_cachedAlive[i];
    // At high speed, only tick a fraction of humans per frame (round-robin)
    if(skipAI&&(i%skipFactor)!==tickOffset){
      // Still apply basic stat decay even when skipping full AI
      h.age+=yearsElapsed;
      h.hunger=Math.max(0,h.hunger-yearsElapsed*4);
      h.energy=Math.max(0,h.energy-yearsElapsed*3);
      if(h.hunger<=0){h.health=Math.max(0,h.health-yearsElapsed*5);if(h.health<=0)h._die('hambre');}
      else if(!h.sick)h.health=Math.min(100,h.health+yearsElapsed*3);
      continue;
    }
    h.tick(yearsElapsed);
    if(h.target&&h.alive){
      const d=Math.hypot(h.tx-h.target.tx,h.ty-h.target.ty);
      if(d<=1.5)h._harvestResourceNow(h.target);
    }
  }

  // Passive structure effects — throttled every 5 years with proper timer
  _passiveEffectsTimer+=yearsElapsed;
  if(_passiveEffectsTimer>=5&&structures.length>0){
    _passiveEffectsTimer=0;
    for(const h of _cachedAlive){
      // Each human checks structures within radius 12 using structureGrid scan
      const r=12,r2=r*r;
      const x0=Math.max(0,h.tx-r),x1=Math.min(WORLD_W-1,h.tx+r);
      const y0=Math.max(0,h.ty-r),y1=Math.min(WORLD_H-1,h.ty+r);
      for(let ty=y0;ty<=y1;ty+=2)for(let tx=x0;tx<=x1;tx+=2){ // step 2 for perf
        const s=structureGrid[ty]?.[tx];
        if(!s)continue;
        const dx=tx-h.tx,dy=ty-h.ty;
        if(dx*dx+dy*dy>r2)continue;
        switch(s.type){
          case 'well':      h.health=Math.min(100,h.health+yearsElapsed*2);break;
          case 'library':   h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*0.8*_intelModifier);break;
          case 'academy':   h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*1.5*_intelModifier);break;
          case 'university':h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*2*_intelModifier);break;
          case 'observatory':h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*3*_intelModifier);break;
          case 'workshop':case 'forge':
            if(h.inventory.wood<20)h.inventory.wood+=Math.floor(yearsElapsed*0.5);
            if(h.inventory.stone<15)h.inventory.stone+=Math.floor(yearsElapsed*0.5);break;
          case 'granary':
            if(h.civId===s.civId&&h.inventory.food<30)h.inventory.food+=Math.floor(yearsElapsed*2);break;
          case 'aqueduct':  h.health=Math.min(100,h.health+yearsElapsed*1.5);break;
          case 'harbor':
            if(h.civId===s.civId){h.inventory.food+=Math.floor(yearsElapsed);h.inventory.wood+=Math.floor(yearsElapsed*0.5);}break;
          case 'cathedral': h.social=Math.min(100,h.social+yearsElapsed*1.5);break;
          case 'palace':
            if(h.civId===s.civId){h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*0.5);h.social=Math.min(100,h.social+yearsElapsed);}break;
          case 'citadel':
            if(h.civId===s.civId)h.health=Math.min(100,h.health+yearsElapsed);break;
          case 'barracks':
            if(h.civId===s.civId&&!h.isSoldier&&h._rng()<0.01){h.isSoldier=true;h.weaponTier=Math.max(h.weaponTier,1);}break;
        }
      }
    }
  }

  _checkKnowledgeUnlocks();

  if(year>0&&year-_lastProdigyYear>=PRODIGY_INTERVAL&&_cachedAliveCount>0){
    _lastProdigyYear=year;
    _spawnProdigy();
  }

  if(year>=600&&year%15===0) _checkCivSplits();
  if(year===600)  addWorldEvent('⚔️ Año 600: Las primeras rivalidades entre tribus');
  if(year===1000) addWorldEvent('🏛 Año 1000: Nacen los primeros imperios');
  if(year===2500) addWorldEvent('⚔️ Año 2500: Era Clásica — grandes guerras de conquista');
  if(year===5000) addWorldEvent('🏰 Año 5000: Era Medieval — castillos y cruzadas');
  if(year===8000) addWorldEvent('🎨 Año 8000: Renacimiento — explosión del arte y la ciencia');
  if(year===12000)addWorldEvent('⚙️ Año 12000: Revolución Industrial — el mundo cambia para siempre');
  if(year===25000)addWorldEvent('🌍 Año 25000: Era Moderna — civilizaciones globales');
  if(year===60000)addWorldEvent('🚀 Año 60000: Era Espacial — los límites del mundo se rompen');

  // Update territory every 10 years
  _territoryTimer+=yearsElapsed;
  if(_territoryTimer>=10){
    _territoryTimer=0;
    _updateCivTerritories();
    if(typeof markTerritoryDirty!=='undefined') markTerritoryDirty();
  }

  _leaderElectTimer+=yearsElapsed;
  if(_leaderElectTimer>=5){
    _leaderElectTimer=0;
    // Count military structures per civ once — avoid filter per civ
    const civMilitary=new Map();
    for(const s of structures){
      if(s.civId==null)continue;
      if(['barracks','citadel','watchtower','palisade'].includes(s.type)){
        civMilitary.set(s.civId,(civMilitary.get(s.civId)||0)+10);
      }
    }
    for(const [,civ] of civilizations){
      const leader=_hById(civ.leaderId);
      if(!leader||!leader.alive)_electNewLeader(civ);
      let totalK=0,count=0;
      for(const id of civ.members){
        const h=_hById(id);
        if(h&&h.alive){totalK+=h.knowledge;count++;}
      }
      if(count>0){
        const avg=totalK/count;
        civ.era=avg>300?'imperial':avg>150?'moderna':avg>80?'industrial':avg>50?'medieval':avg>30?'antigua':'primitiva';
        civ.militaryPower=(civMilitary.get(civ.id)||0)+count*2;
      }
    }
  }

  // Prune dead humans aggressively — keep only last 8 for history
  if(humans.length>_cachedAliveCount+8){
    let pruned=0;
    for(let i=humans.length-1;i>=0&&humans.length>_cachedAliveCount+8;i--){
      if(!humans[i].alive){
        _humanById.delete(humans[i].id);
        humans.splice(i,1);
        pruned++;
        if(pruned>=20)break; // max 20 per tick to avoid spike
      }
    }
  }
}

