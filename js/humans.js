// ═══════════════════════════════════════════════════════════════════════════════
// HUMANS.JS — Civilización, supervivencia, ciudades, exploración
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
};

// ── Structures ────────────────────────────────────────────────────────────────
const STRUCTURE_TYPES={
  camp:  {icon:'🔥',color:'#ff8030',label:'Campamento',cost:{wood:2,stone:0}, hp:25, decay:true,  decayRate:2},
  hut:   {icon:'🏠',color:'#c8a060',label:'Cabaña',    cost:{wood:4,stone:2}, hp:100,decay:false, decayRate:0},
  farm:  {icon:'🌾',color:'#90c040',label:'Cultivo',   cost:{wood:1,stone:0}, hp:80, decay:false, decayRate:0},
  mine:  {icon:'⛏', color:'#a09080',label:'Mina',      cost:{wood:2,stone:3}, hp:100,decay:false, decayRate:0},
  market:{icon:'�',color:'#f0c040',label:'Mercado',   cost:{wood:6,stone:4}, hp:120,decay:false, decayRate:0},
  temple:{icon:'�', color:'#d0a0ff',label:'Templo',   cost:{wood:8,stone:8}, hp:150,decay:false, decayRate:0},
};
let structures=[],structureGrid=null;
function initStructureGrid(){structureGrid=Array.from({length:WORLD_H},()=>new Array(WORLD_W).fill(null));}
function placeStructure(tx,ty,type,builder){
  if(!structureGrid||structureGrid[ty]?.[tx])return false;
  const def=STRUCTURE_TYPES[type];
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
  }
  addMember(h){this.members.add(h.id);this.population=this.members.size;}
  removeMember(id){this.members.delete(id);this.population=this.members.size;}
}
const CIV_PREFIXES=['Imperio','Reino','Tribu','Clan','Nación','Confederación','República'];
const CIV_ROOTS=['Akar','Boral','Ceth','Dorn','Elvar','Forn','Gael','Hira','Ixal','Jorn','Kael','Lorn'];
function _genCivName(rng){return CIV_PREFIXES[Math.floor(rng()*CIV_PREFIXES.length)]+' '+CIV_ROOTS[Math.floor(rng()*CIV_ROOTS.length)];}
function getOrCreateCiv(founder){
  const civ=new Civilization(founder);
  civilizations.set(civ.id,civ);
  founder.civId=civ.id;
  return civ;
}

// ── Social phases ─────────────────────────────────────────────────────────────
// Before year 1000: unified survival. After: division, conflict, classism.
function getSocialPhase(){ return year>=1000?'division':'survival'; }

// ── Terrain modification ───────────────────────────────────────────────────────
// Humans can clear forest tiles and irrigate near farms
const modifiedTiles=new Map(); // key="tx,ty" → {original, modified}
function modifyTerrain(tx,ty,newBiome){
  const cell=getCell(tx,ty);
  if(!cell||!isLand(tx,ty))return false;
  const key=`${tx},${ty}`;
  if(!modifiedTiles.has(key))modifiedTiles.set(key,{original:cell.biome});
  cell.biome=newBiome;
  return true;
}

// ── Diseases ──────────────────────────────────────────────────────────────────
const DISEASE_TYPES=[
  {name:'Fiebre',    damage:0.8,spread:0.15,duration:8,  cure:10},
  {name:'Plaga',     damage:1.5,spread:0.2, duration:14, cure:20},
  {name:'Pestilencia',damage:1.2,spread:0.18,duration:12,cure:16},
];
let activeOutbreaks=[];
function tickDiseases(yearsElapsed){
  const rng=mulberry32(WORLD_SEED^year^0xDEAD);
  const alive=humans.filter(h=>h.alive);
  // Only trigger disease when population is large enough to survive it
  if(rng()<0.0015*yearsElapsed&&alive.length>25){
    const host=alive[Math.floor(rng()*alive.length)];
    const dtype=DISEASE_TYPES[Math.floor(rng()*DISEASE_TYPES.length)];
    activeOutbreaks.push({type:dtype,tx:host.tx,ty:host.ty,radius:6,yearsLeft:dtype.duration});
    addWorldEvent(`🦠 Brote de ${dtype.name}`);
  }
  activeOutbreaks=activeOutbreaks.filter(o=>{o.yearsLeft-=yearsElapsed;return o.yearsLeft>0;});
}

// ── World events ──────────────────────────────────────────────────────────────
const worldEvents=[];
function addWorldEvent(text){worldEvents.unshift({year,text});if(worldEvents.length>100)worldEvents.pop();}

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
// Simple but effective: biased initial weights toward survival actions
class NeuralBrain{
  constructor(rng){
    this.iSize=10;this.hSize=8;this.oSize=8;
    // Outputs: 0=seekFood 1=sleep 2=wander 3=socialize 4=gather 5=build 6=reproduce 7=farm
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

// ── Human class ───────────────────────────────────────────────────────────────
let humanIdCounter=0;
const POP_SOFT_CAP=150;
const POP_HARD_CAP=300;

// Food types for immediate eating
const FOOD_TYPES=['berries','wheat_wild','mushroom','animal','fish','tree_palm','cactus','bush','herb'];
const WOOD_TYPES=['tree_oak','tree_pine','tree_palm','tree_jungle','bush'];
const STONE_TYPES=['rock','iron_ore','clay'];

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
    // Start with enough food to survive early game
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
    // Everyone can reproduce — survival of the species
    this._canReproduce=true;
    this._wanderAngle=rng()*Math.PI*2;
    this._wanderDrift=0;
    this._settleTx=tx;this._settleTy=ty;
    this._settleScore=0;
    this._groupTimer=0;
    // Drives: each human has personal urgency weights that evolve
    // These are separate from the neural net — hardwired survival imperatives
    this._reproUrge=0;   // builds up over time, forces reproduction
    this._exploreUrge=0; // builds up when settled, forces exploration
    this._buildUrge=0;   // builds up over time, forces construction

    // Social division system (post year 1000)
    this.ideology=parentA?(parentA.ideology+(parentB?parentB.ideology:parentA.ideology))/2+(rng()*0.2-0.1):rng();
    this.wealth=0;       // computed each tick from inventory
    this.aggression=parentA?Math.max(0,Math.min(1,(parentA.aggression+(parentB?parentB.aggression:parentA.aggression))/2+(rng()*0.1-0.05))):rng()*0.3;
    this._warTimer=0;    // cooldown between attacks
    this._terrainModTimer=0; // cooldown for terrain modification
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

    // Lifespan — realistic: 30-80 base, knowledge/intellect extend life
    // knowledge is unbounded but lifespan caps at ~120 naturally
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

    // Stat decay — slow enough that survival is very achievable
    this.hunger=Math.max(0,this.hunger-yearsElapsed*4);
    this.energy=Math.max(0,this.energy-yearsElapsed*3);
    this.social=Math.max(0,this.social-yearsElapsed*2);
    if(this.reproTimer>0)this.reproTimer-=yearsElapsed;

    // Auto-eat from inventory — proactive, not reactive
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

    // Build up biological drives over time
    if(this._canReproduce&&this.age>=16&&this.age<=50&&this.reproTimer<=0){
      this._reproUrge=Math.min(1,this._reproUrge+yearsElapsed*0.35);
    }
    // Explore urge builds when staying in same area
    this._exploreUrge=Math.min(1,this._exploreUrge+yearsElapsed*0.08);
    // Build urge: always want to construct and improve
    this._buildUrge=Math.min(1,this._buildUrge+yearsElapsed*0.2);

    this.leaderScore=this.traits.charisma*0.4+this.traits.intellect*0.3+this.knowledge*0.2+this.children*3+this.age*0.05;
    // Knowledge is unbounded — neural net inputs clamp it but growth never stops
    this.brain.epsilon=Math.max(0.04,0.38-Math.min(this.knowledge,200)*0.0015);

    // Compute wealth (drives classism)
    this.wealth=this.inventory.food+this.inventory.wood*2+this.inventory.stone*1.5;

    // Ideology drifts slowly — creates cultural divergence
    if(getSocialPhase()==='division'){
      this.ideology=Math.max(0,Math.min(1,this.ideology+(this._rng()*0.04-0.02)));
    }

    // Aggression grows with inequality and war experience
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

    // Biological imperative: reproduction urge overrides neural net
    if(this._reproUrge>0.65&&this.hunger>40&&this.energy>35&&!this.sick){
      this._tryReproduce(nearby);
      return;
    }
    // Build urge: humans always want to construct things
    if(this._buildUrge>0.6&&this.hunger>50&&this.energy>40&&
       (this.inventory.wood>=2||this.inventory.stone>=2)){
      this._buildUrge=0;
      this._doBuild();
      return;
    }
    // Explore urge: push humans to spread out and discover
    if(this._exploreUrge>0.75&&crowding<3&&this.hunger>40){
      this._exploreUrge=0;
      this._doWander();
      return;
    }

    // Neural net for everything else
    const nearFood=this._findNearbyResource(FOOD_TYPES,25)?1:0;
    const nearHuman=nearby.length>0?1:0;
    const reproReady=(this.age>=16&&this.age<=45&&this.reproTimer<=0&&this.hunger>50&&this.energy>40&&this._canReproduce)?1:0;

    const inputs=[
      this.hunger/100, this.energy/100, this.health/100,
      nearFood, nearHuman, this.homeBase?1:0,
      Math.min(1,this.knowledge/200), this.social/100,
      reproReady, Math.min(1,crowding/5),
    ];

    const chosen=this.brain.choose(inputs,this._rng);
    this._executeAction(chosen,nearby);

    // Post year 1000: social conflict, classism, racism
    if(getSocialPhase()==='division'){
      this._doSocialDivision(nearby);
    }

    // Terrain modification: clear forest, irrigate
    this._terrainModTimer-=yearsElapsed;
    if(this._terrainModTimer<=0&&this.knowledge>30&&this.hunger>60){
      this._modifyTerrain();
      this._terrainModTimer=5+Math.floor(this._rng()*10);
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
      default:this._seekFoodNow();break;
    }
  }

  // ── SURVIVAL: Seek and immediately eat food ───────────────────────────────
  _seekFoodNow(){
    // 1. Eat from inventory first
    if(this.inventory.food>0){
      const eat=Math.min(this.inventory.food,4);
      this.inventory.food-=eat;
      this.hunger=Math.min(100,this.hunger+eat*20);
      if(this.hunger>65){this.action=ACTIONS.IDLE;return;}
    }

    // 2. Eat from a farm nearby
    const farm=this._findNearbyStructure('farm',16);
    if(farm&&Math.hypot(farm.tx-this.tx,farm.ty-this.ty)<=2){
      this._harvestFarm(farm);this.action=ACTIONS.FARM;return;
    }
    if(farm){this._setDest(farm.tx,farm.ty);this.action=ACTIONS.FARM;return;}

    // 3. Find and immediately harvest a food resource
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

    // 4. No food nearby — wander toward unexplored area
    this._wanderAngle+=this._rng()*0.5-0.25;
    const dist=15+Math.floor(this._rng()*20);
    this._navigateTo(
      Math.round(this.tx+Math.cos(this._wanderAngle)*dist),
      Math.round(this.ty+Math.sin(this._wanderAngle)*dist)
    );
    this.action=ACTIONS.WANDER;
  }

  // Harvest a resource tile immediately (no travel needed)
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
    this.knowledge=Math.min(9999,this.knowledge+0.5);
    if(res.amount<=0)removeResource(res.tx,res.ty);
    this.target=null;
    this.action=ACTIONS.GATHER;
  }

  _doSleep(){
    this.action=ACTIONS.SLEEP;
    this.energy=Math.min(100,this.energy+55);
    // Sleep near home if possible
    if(this.homeBase&&Math.hypot(this.homeBase.tx-this.tx,this.homeBase.ty-this.ty)>8){
      this._setDest(this.homeBase.tx,this.homeBase.ty);
    }
  }

  _doSocialize(nearby){
    // Pick someone not too close (avoid clustering)
    const candidates=nearby.filter(h=>Math.hypot(h.tx-this.tx,h.ty-this.ty)>3);
    const other=candidates.length>0?candidates[Math.floor(this._rng()*candidates.length)]:
                nearby.length>0?nearby[Math.floor(this._rng()*nearby.length)]:null;
    if(other){
      this.action=ACTIONS.SOCIALIZE;
      this.social=Math.min(100,this.social+30);
      // Knowledge transfer
      if(other.knowledge>this.knowledge)
        this.knowledge=Math.min(9999,this.knowledge+(other.knowledge-this.knowledge)*0.15);
      // Civ joining
      if(!this.civId&&other.civId&&this._rng()<0.3)this._joinCiv(other.civId);
      // Alliance
      if(this.civId&&other.civId&&this.civId!==other.civId){
        const myCiv=civilizations.get(this.civId);
        const theirCiv=civilizations.get(other.civId);
        if(myCiv&&theirCiv&&!myCiv.enemies.has(other.civId)&&this._rng()<0.02){
          myCiv.allies.add(other.civId);theirCiv.allies.add(this.civId);
          addWorldEvent(`🤝 Alianza: ${myCiv.name} ↔ ${theirCiv.name}`);
        }
      }
      // Move toward them only if far
      const d=Math.hypot(other.tx-this.tx,other.ty-this.ty);
      if(d>8)this._setDest(other.tx+Math.round(this._rng()*4-2),other.ty+Math.round(this._rng()*4-2));
    } else {
      this._doWander();
    }
  }

  _doHeal(){
    this.action=ACTIONS.HEAL;
    if(this.inventory.food>0){
      this.inventory.food--;
      this.health=Math.min(100,this.health+15);
    }
    if(this.sick&&this.knowledge>12&&this._rng()<this.knowledge/this.sickType.cure){
      this.sick=false;this.immunity.add(this.sickType.name);
      this.addLog(`Se curó de ${this.sickType.name}`);
      this.sickType=null;
      this.knowledge=Math.min(9999,this.knowledge+4);
    }
    // Heal nearby sick
    if(this.knowledge>25){
      const nearby=_spatialQuery(this.tx,this.ty,8,this.id);
      for(const h of nearby){
        if(!h.sick)continue;
        if(this._rng()<this.knowledge/80){
          h.sick=false;h.immunity.add(h.sickType.name);
          h.addLog(`Curado por ${this.name.split(' ')[0]}`);h.sickType=null;
          this.knowledge=Math.min(9999,this.knowledge+2);break;
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
    this.knowledge=Math.min(9999,this.knowledge+0.5);
    // Update settle score based on local resources
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

  // Disperse away from crowd — each human picks a different direction
  _disperseFrom(nearby){
    this.action=ACTIONS.WANDER;
    // Average position of crowd
    let ax=0,ay=0;
    for(const h of nearby){ax+=h.tx;ay+=h.ty;}
    ax/=nearby.length;ay/=nearby.length;
    // Move away from average
    const awayAngle=Math.atan2(this.ty-ay,this.tx-ax)+(this._rng()-0.5)*0.8;
    const dist=10+Math.floor(this._rng()*15);
    this._navigateTo(
      Math.round(this.tx+Math.cos(awayAngle)*dist),
      Math.round(this.ty+Math.sin(awayAngle)*dist)
    );
    this._wanderAngle=awayAngle;
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

      // Classism: rich humans exploit poor ones in same civ
      if(sameCiv&&wealthDiff>30&&this._rng()<0.05){
        const steal=Math.min(other.inventory.food,Math.floor(wealthDiff*0.1));
        if(steal>0){
          other.inventory.food-=steal;
          this.inventory.food+=steal;
          this.aggression=Math.min(1,this.aggression+0.01);
          other.aggression=Math.min(1,other.aggression+0.02);
        }
      }

      // Racism/xenophobia: distrust different-colored civs
      if(!sameCiv&&myCiv&&other.civId!=null){
        const theirCiv=civilizations.get(other.civId);
        if(theirCiv&&myCiv.enemies.has(other.civId)){
          // War: attack enemy civ members
          this._doConflict(other);
          return;
        }
        // Ideological divergence creates new enemies
        if(ideoDiff>0.6&&this._rng()<0.005&&!myCiv.allies.has(other.civId)){
          myCiv.enemies.add(other.civId);
          theirCiv.enemies.add(this.civId);
          myCiv.allies.delete(other.civId);
          theirCiv.allies.delete(this.civId);
          addWorldEvent(`⚔️ Guerra declarada: ${myCiv.name} vs ${theirCiv.name}`);
        }
      }

      // Knowledge sharing within same ideology group (even across civs)
      if(ideoDiff<0.2&&other.knowledge>this.knowledge){
        this.knowledge+=Math.min(2,(other.knowledge-this.knowledge)*0.1);
      }
    }
  }

  _doConflict(enemy){
    if(this._warTimer>0||!enemy.alive)return;
    if(this.health<30||this.hunger<20)return; // too weak to fight
    const myPower=this.traits.strength*0.6+this.knowledge*0.2+this.aggression*20;
    const theirPower=enemy.traits.strength*0.6+enemy.knowledge*0.2+enemy.aggression*20;
    const win=myPower*(0.8+this._rng()*0.4)>theirPower*(0.8+this._rng()*0.4);
    if(win){
      const dmg=5+Math.floor(this._rng()*10);
      enemy.health=Math.max(0,enemy.health-dmg);
      // Loot
      const loot=Math.min(enemy.inventory.food,Math.floor(this._rng()*5));
      enemy.inventory.food-=loot;this.inventory.food+=loot;
      this.aggression=Math.min(1,this.aggression+0.02);
      enemy.aggression=Math.min(1,enemy.aggression+0.03);
      enemy._warFlash=3; // visual flash
      if(enemy.health<=0)enemy._die('combate');
    } else {
      const dmg=3+Math.floor(this._rng()*6);
      this.health=Math.max(0,this.health-dmg);
      this._warFlash=3;
    }
    this._warTimer=3+Math.floor(this._rng()*4);
    this.action=ACTIONS.LEAD; // repurpose as "fighting"
  }

  _modifyTerrain(){
    // Clear forest near settle point to make room for farms
    const r=4;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const tx=this._settleTx+dx,ty=this._settleTy+dy;
      const cell=getCell(tx,ty);
      if(!cell||!isLand(tx,ty))continue;
      if(['forest','dense_forest','jungle','rainforest'].includes(cell.biome)){
        if(this._rng()<0.15){
          modifyTerrain(tx,ty,'grass');
          // Clearing forest yields wood
          this.inventory.wood+=2;
          this.knowledge=Math.min(this.knowledge+0.3,9999);
          return; // one tile per action
        }
      }
      // Irrigate dry land near farms
      if(['dry_grass','desert','savanna'].includes(cell.biome)){
        const nearFarm=this._findNearbyStructure('farm',6);
        if(nearFarm&&this._rng()<0.1){
          modifyTerrain(tx,ty,'grass');
          this.knowledge=Math.min(this.knowledge+0.2,9999);
          return;
        }
      }
    }
  }

  _doBuild(){
    if(this.hunger<35||this.energy<25){this._seekFoodNow();return;}
    // Gather resources first if needed
    const needsWood=this.inventory.wood<2;
    const needsStone=this.inventory.stone<2;
    if(needsWood&&needsStone){this._gatherResources();return;}

    // Pick best structure available based on knowledge and unlocks
    let type='camp';
    if(_unlockedTypes.has('observatory')&&this.knowledge>280&&this.inventory.wood>=15&&this.inventory.stone>=25)type='observatory';
    else if(_unlockedTypes.has('university')&&this.knowledge>200&&this.inventory.wood>=20&&this.inventory.stone>=20)type='university';
    else if(_unlockedTypes.has('colosseum')&&this.knowledge>150&&this.inventory.wood>=15&&this.inventory.stone>=20)type='colosseum';
    else if(_unlockedTypes.has('academy')&&this.knowledge>100&&this.inventory.wood>=10&&this.inventory.stone>=10)type='academy';
    else if(_unlockedTypes.has('forge')&&this.knowledge>75&&this.inventory.wood>=6&&this.inventory.stone>=8)type='forge';
    else if(_unlockedTypes.has('library')&&this.knowledge>50&&this.inventory.wood>=8&&this.inventory.stone>=6)type='library';
    else if(_unlockedTypes.has('workshop')&&this.knowledge>28&&this.inventory.wood>=5&&this.inventory.stone>=3)type='workshop';
    else if(_unlockedTypes.has('well')&&this.knowledge>12&&this.inventory.wood>=2&&this.inventory.stone>=4)type='well';
    else if(this.knowledge>65&&this.inventory.wood>=8&&this.inventory.stone>=8)type='temple';
    else if(this.knowledge>45&&this.inventory.wood>=6&&this.inventory.stone>=4)type='market';
    else if(this.inventory.wood>=4&&this.inventory.stone>=2)type='hut';
    else if(this.inventory.wood>=2&&this.inventory.stone>=3)type='mine';
    else if(this.inventory.wood>=2)type='camp'; // always can build a camp
    const def=STRUCTURE_TYPES[type];
    if(!def){this._gatherResources();return;}
    const cost=def.cost;
    if(this.inventory.wood<cost.wood||this.inventory.stone<cost.stone){
      this._gatherResources();return;
    }
    for(let r=2;r<=12;r++){
      for(let a=0;a<16;a++){
        const angle=(a/16)*Math.PI*2+this._wanderAngle;
        const bx=Math.round(this._settleTx+Math.cos(angle)*r);
        const by=Math.round(this._settleTy+Math.sin(angle)*r);
        if(!isLand(bx,by)||getStructureAt(bx,by)||getResourceAt(bx,by))continue;
        let tooClose=false;
        for(const s of structures){
          if(s.type===type&&Math.hypot(s.tx-bx,s.ty-by)<3){tooClose=true;break;}
        }
        if(tooClose)continue;
        if(placeStructure(bx,by,type,this)){
          this.inventory.wood-=cost.wood;this.inventory.stone-=cost.stone;
          this.knowledge=Math.min(9999,this.knowledge+4);
          this.homeBase={tx:bx,ty:by};
          this._settleTx=bx;this._settleTy=by;
          this.action=ACTIONS.BUILD;
          this.addLog(`Construyó ${def.label}`);
          // Special effects per building type
          if(type==='library'){
            const near=_spatialQuery(bx,by,20,-1);
            for(const h of near)h.knowledge=Math.min(9999,h.knowledge+5);
            addWorldEvent(`📚 ${this.name.split(' ')[0]} construyó Biblioteca — conocimiento compartido`);
          } else if(type==='academy'){
            const near=_spatialQuery(bx,by,30,-1);
            for(const h of near)h.knowledge=Math.min(9999,h.knowledge+10);
            addWorldEvent(`� ${this.name.split(' ')[0]} fundó una Academia`);
          } else if(type==='forge'){
            addWorldEvent(`⚒️ ${this.name.split(' ')[0]} construyó una Forja — era del metal`);
          } else if(type==='colosseum'){
            addWorldEvent(`🏟 ${this.name.split(' ')[0]} construyó un Coliseo`);
          } else if(type==='university'){
            addWorldEvent(`🏫 ${this.name.split(' ')[0]} fundó una Universidad`);
          } else if(type==='observatory'){
            addWorldEvent(`🔭 ${this.name.split(' ')[0]} construyó un Observatorio`);
          } else if(type==='temple'||type==='market'){
            addWorldEvent(`🏛 ${this.name.split(' ')[0]} construyó ${def.label}`);
          }
          return;
        }
      }
    }
    this._gatherResources();
  }

  _doFarm(){
    if(this.hunger<45||this.inventory.wood<1){this._seekFoodNow();return;}
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
            this.knowledge=Math.min(9999,this.knowledge+2);
            this.action=ACTIONS.FARM;
            this.addLog('Plantó un cultivo');
            return;
          }
        }
      }
    }
    this._seekFoodNow();
  }

  _gatherResources(){
    // Prioritize wood for building
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
    // If well stocked, try to build
    if(this.inventory.wood>=4){
      this._doBuild();return;
    }
    this._doWander();
  }

  _tryReproduce(nearby){
    if(!this._canReproduce||this.age<15||this.age>50||this.reproTimer>0){
      this._doSocialize(nearby);return;
    }
    if(this.hunger<35||this.energy<25||this.sick){this._seekFoodNow();return;}
    const aliveCount=humans.filter(h=>h.alive).length;
    if(aliveCount>=POP_SOFT_CAP&&this._rng()<(aliveCount-POP_SOFT_CAP)/(POP_HARD_CAP-POP_SOFT_CAP)){
      this._doSocialize(nearby);return;
    }
    if(aliveCount>=POP_HARD_CAP){this._doSocialize(nearby);return;}

    let partner=null;
    // Search nearby first, then wider
    const searchRadius=nearby.length>0?16:80;
    const candidates=searchRadius===16?nearby:_spatialQuery(this.tx,this.ty,80,this.id);
    for(const h of candidates){
      if(h.gender===this.gender||h.age<15||h.age>50||h.reproTimer>0)continue;
      if(h.hunger<30||h.energy<20||h.sick)continue;
      if(Math.hypot(h.tx-this.tx,h.ty-this.ty)<=8){partner=h;break;}
    }
    if(partner){
      this.action=ACTIONS.REPRODUCE;partner.action=ACTIONS.REPRODUCE;
      // Cooldown: 1-3 years (realistic)
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
      if(this.civId){const civ=civilizations.get(this.civId);if(civ)civ.addMember(child);}
      this.children++;partner.children++;
      this.addLog(`Tuvo ${childGender==='F'?'una hija':'un hijo'}: ${child.name.split(' ')[0]}`);
      partner.addLog(`Tuvo ${childGender==='F'?'una hija':'un hijo'}: ${child.name.split(' ')[0]}`);
      if(this.children===1||partner.children===1)
        addWorldEvent(`👶 ${child.name.split(' ')[0]} nació (${childGender==='F'?'♀':'♂'})`);
    } else {
      // Seek partner — look very wide
      const far=_spatialQuery(this.tx,this.ty,100,this.id);
      let closest=null,bestD=Infinity;
      for(const h of far){
        if(h.gender===this.gender||h.age<15||h.age>50||!h._canReproduce)continue;
        const d=Math.hypot(h.tx-this.tx,h.ty-this.ty);
        if(d<bestD){bestD=d;closest=h;}
      }
      if(closest)this._setDest(closest.tx,closest.ty);
      else this._doWander();
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
    // Try direct step
    const dx=ntx-this.tx,dy=nty-this.ty;
    const sx=this.tx+(dx>0?1:dx<0?-1:0);
    const sy=this.ty+(dy>0?1:dy<0?-1:0);
    if(isLand(sx,sy)){this._setDest(sx,sy);return;}
    if(isLand(sx,this.ty)){this._setDest(sx,this.ty);return;}
    if(isLand(this.tx,sy)){this._setDest(this.tx,sy);return;}
    // Try all 8 directions
    for(let a=0;a<8;a++){
      const rx=this.tx+Math.round(Math.cos(a/8*Math.PI*2));
      const ry=this.ty+Math.round(Math.sin(a/8*Math.PI*2));
      if(isLand(rx,ry)){this._setDest(rx,ry);return;}
    }
  }
  _setDest(tx,ty){this.destPx=tx*TILE+TILE/2;this.destPy=ty*TILE+TILE/2;}

  _findNearbyResource(types,radius){
    let best=null,bestDist=Infinity;
    const x0=Math.max(0,this.tx-radius),x1=Math.min(WORLD_W-1,this.tx+radius);
    const y0=Math.max(0,this.ty-radius),y1=Math.min(WORLD_H-1,this.ty+radius);
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
      const res=getResourceAt(tx,ty);
      if(!res||!types.includes(res.type))continue;
      const d=Math.hypot(tx-this.tx,ty-this.ty);
      if(d<bestDist){bestDist=d;best=res;}
    }
    return best;
  }
  _findNearbyStructure(type,radius){
    let best=null,bestD=Infinity;
    for(const s of structures){
      if(type&&s.type!==type)continue;
      const d=Math.hypot(s.tx-this.tx,s.ty-this.ty);
      if(d<=radius&&d<bestD){bestD=d;best=s;}
    }
    return best;
  }

  _harvestFarm(farm){
    this.inventory.food+=20;this.hunger=Math.min(100,this.hunger+40);
    farm.hp-=2; // farms last longer now
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
    // Only log notable deaths
    if(this.children>0||this.isLeader)
      addWorldEvent(`💀 ${this.name.split(' ')[0]} murió de ${cause} (${Math.floor(this.age)}a, ${this.children} hijos)`);
  }
}

// ── Emergent knowledge: unlocks new structure types as civilization advances ──
// This is the "evolving code" — the simulation expands its own possibility space
const KNOWLEDGE_UNLOCKS=[
  {avgK:15,  type:'well',    icon:'💧',color:'#60a0ff',label:'Pozo',     cost:{wood:2,stone:4}, hp:120,decay:false,decayRate:0, msg:'💧 Primer pozo construido — agua garantizada'},
  {avgK:30,  type:'workshop',icon:'🔨',color:'#c08040',label:'Taller',   cost:{wood:5,stone:3}, hp:120,decay:false,decayRate:0, msg:'🔨 Taller desbloqueado — producción avanzada'},
  {avgK:55,  type:'library', icon:'📚',color:'#80c0ff',label:'Biblioteca',cost:{wood:8,stone:6}, hp:150,decay:false,decayRate:0, msg:'📚 Biblioteca desbloqueada — conocimiento compartido'},
  {avgK:80,  type:'forge',   icon:'⚒️', color:'#ff8040',label:'Forja',    cost:{wood:6,stone:8}, hp:150,decay:false,decayRate:0, msg:'⚒️ Forja desbloqueada — era del metal'},
  {avgK:110, type:'academy', icon:'🎓',color:'#ffd700',label:'Academia',  cost:{wood:10,stone:10},hp:200,decay:false,decayRate:0, msg:'🎓 Academia desbloqueada — era del conocimiento'},
  {avgK:160, type:'colosseum',icon:'🏟',color:'#e0a040',label:'Coliseo',  cost:{wood:15,stone:20},hp:300,decay:false,decayRate:0, msg:'🏟 Coliseo desbloqueado — era de los espectáculos'},
  {avgK:220, type:'university',icon:'🏫',color:'#a0d0ff',label:'Universidad',cost:{wood:20,stone:20},hp:300,decay:false,decayRate:0, msg:'🏫 Universidad desbloqueada — ciencia avanzada'},
  {avgK:300, type:'observatory',icon:'🔭',color:'#c0a0ff',label:'Observatorio',cost:{wood:15,stone:25},hp:300,decay:false,decayRate:0, msg:'🔭 Observatorio desbloqueado — era de la ciencia'},
];
const _unlockedTypes=new Set(['camp','hut','farm','mine','market','temple']);

function _checkKnowledgeUnlocks(){
  const alive=humans.filter(h=>h.alive);
  if(alive.length===0)return;
  const avgK=alive.reduce((s,h)=>s+h.knowledge,0)/alive.length;
  for(const u of KNOWLEDGE_UNLOCKS){
    if(avgK>=u.avgK&&!_unlockedTypes.has(u.type)){
      _unlockedTypes.add(u.type);
      STRUCTURE_TYPES[u.type]={icon:u.icon,color:u.color,label:u.label,cost:u.cost,hp:u.hp,decay:u.decay,decayRate:u.decayRate};
      addWorldEvent(u.msg);
      // Boost all humans' knowledge slightly on unlock
      for(const h of alive)h.knowledge=Math.min(9999,h.knowledge+3);
    }
  }
}

// ── Leader election ───────────────────────────────────────────────────────────
function _electNewLeader(civ){
  let best=null,bestScore=-1;
  for(const id of civ.members){
    const h=humans.find(x=>x.id===id&&x.alive);
    if(!h)continue;
    if(h.leaderScore>bestScore){bestScore=h.leaderScore;best=h;}
  }
  if(best){
    const old=humans.find(x=>x.id===civ.leaderId);
    if(old)old.isLeader=false;
    civ.leaderId=best.id;best.isLeader=true;
    best.addLog(`Elegido líder de ${civ.name}`);
    addWorldEvent(`👑 ${best.name.split(' ')[0]} elegido líder de ${civ.name}`);
  }
}

// ── Civ splitting: ideological divergence creates new civilizations ───────────
function _checkCivSplits(){
  for(const [civId,civ] of civilizations){
    if(civ.population<15)continue;
    const members=[];
    for(const id of civ.members){
      const h=humans.find(x=>x.id===id&&x.alive);
      if(h)members.push(h);
    }
    if(members.length<15)continue;
    // Find ideological outliers
    const avgIdeology=members.reduce((s,h)=>s+h.ideology,0)/members.length;
    const splinters=members.filter(h=>Math.abs(h.ideology-avgIdeology)>0.45);
    if(splinters.length<4)continue;
    // Form new civ from splinters
    const founder=splinters[0];
    const newCiv=new Civilization(founder);
    newCiv.color=`hsl(${Math.floor(founder._rng()*360)},70%,65%)`;
    civilizations.set(newCiv.id,newCiv);
    for(const h of splinters){
      civ.removeMember(h.id);
      h.civId=newCiv.id;
      h.color=newCiv.color; // adopt new civ color
      newCiv.addMember(h);
    }
    // New civ starts as enemy of parent
    newCiv.enemies.add(civId);
    civ.enemies.add(newCiv.id);
    addWorldEvent(`✊ Escisión: ${newCiv.name} se separó de ${civ.name} (${splinters.length} disidentes)`);
  }
}

// ── Spawn ─────────────────────────────────────────────────────────────────────
let humans=[];

function spawnInitialHumans(){
  initStructureGrid();
  initSpatialGrid();
  // Find a good land tile near center with food nearby
  const cx=Math.floor(WORLD_W/2),cy=Math.floor(WORLD_H/2);
  let sx=cx,sy=cy;
  outer:for(let r=0;r<60;r++)for(let a=0;a<20;a++){
    const tx=cx+Math.round(Math.cos(a/20*Math.PI*2)*r);
    const ty=cy+Math.round(Math.sin(a/20*Math.PI*2)*r);
    if(!isLand(tx,ty))continue;
    // Prefer tiles with food nearby
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
}

// ── Global movement (every frame) ────────────────────────────────────────────
function updateHumanMovement(dtSec,speedMult){
  for(const h of humans)h.updateMovement(dtSec,speedMult);
}

// ── Annual tick ───────────────────────────────────────────────────────────────
let _leaderElectTimer=0;

function tickHumans(yearsElapsed){
  tickDiseases(yearsElapsed);
  tickStructures(yearsElapsed);

  for(const h of humans){
    if(!h.alive)continue;
    h.tick(yearsElapsed);
    if(h.target){
      const d=Math.hypot(h.tx-h.target.tx,h.ty-h.target.ty);
      if(d<=1.5)h._harvestResourceNow(h.target);
    }
  }

  // Passive structure effects every tick
  for(const s of structures){
    if(s.type==='well'){
      // Well: nearby humans regenerate health faster
      const near=_spatialQuery(s.tx,s.ty,8,-1);
      for(const h of near)h.health=Math.min(100,h.health+yearsElapsed*2);
    } else if(s.type==='library'||s.type==='academy'){
      // Knowledge spreads passively from libraries
      const near=_spatialQuery(s.tx,s.ty,s.type==='academy'?25:15,-1);
      for(const h of near)h.knowledge=Math.min(9999,h.knowledge+yearsElapsed*(s.type==='academy'?1.5:0.8));
    } else if(s.type==='workshop'||s.type==='forge'){
      // Workshops boost resource gathering nearby
      const near=_spatialQuery(s.tx,s.ty,10,-1);
      for(const h of near){
        if(h.inventory.wood<20)h.inventory.wood+=Math.floor(yearsElapsed*0.5);
        if(h.inventory.stone<15)h.inventory.stone+=Math.floor(yearsElapsed*0.5);
      }
    } else if(s.type==='colosseum'){
      // Colosseum boosts aggression and social
      const near=_spatialQuery(s.tx,s.ty,20,-1);
      for(const h of near){h.social=Math.min(100,h.social+yearsElapsed*2);h.aggression=Math.min(1,h.aggression+yearsElapsed*0.01);}
    } else if(s.type==='university'||s.type==='observatory'){
      // University/Observatory: massive knowledge boost
      const near=_spatialQuery(s.tx,s.ty,30,-1);
      for(const h of near)h.knowledge=Math.min(9999,h.knowledge+yearsElapsed*(s.type==='observatory'?3:2));
    }
  }

  // Check for new knowledge unlocks
  _checkKnowledgeUnlocks();

  // Civ splitting: after year 1000, large civs with ideological divergence split
  if(year>=1000&&year%20===0){
    _checkCivSplits();
  }
  // Announce social division era
  if(year===1000){
    addWorldEvent('⚔️ Año 1000: Las sociedades comienzan a dividirse');
  }

  // Leader election every 5 years
  _leaderElectTimer+=yearsElapsed;
  if(_leaderElectTimer>=5){
    _leaderElectTimer=0;
    for(const [,civ] of civilizations){
      const leader=humans.find(x=>x.id===civ.leaderId&&x.alive);
      if(!leader)_electNewLeader(civ);
      let totalK=0,count=0;
      for(const id of civ.members){
        const h=humans.find(x=>x.id===id&&x.alive);
        if(h){totalK+=h.knowledge;count++;}
      }
      if(count>0){
        const avg=totalK/count;
        civ.era=avg>80?'moderna':avg>60?'industrial':avg>40?'medieval':avg>25?'antigua':'primitiva';
      }
    }
  }

  // Prune dead — keep last 20
  const dead=humans.filter(h=>!h.alive);
  if(dead.length>20){
    const keep=new Set(dead.slice(dead.length-20));
    humans=humans.filter(h=>h.alive||keep.has(h));
  }
}
