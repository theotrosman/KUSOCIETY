// ── Human names ───────────────────────────────────────────────────────────────
const FIRST_NAMES_M = ['Arek','Bren','Cael','Dorn','Eron','Fael','Gorn','Hael',
  'Ivar','Jorn','Kael','Lorn','Morn','Nael','Orin','Pael','Rael','Sorn',
  'Tael','Uran','Vorn','Wren','Xael','Yorn','Zael','Bael','Cren','Dael'];
const FIRST_NAMES_F = ['Aira','Bora','Cira','Duna','Elra','Fira','Gira','Hira',
  'Iren','Jora','Kira','Lira','Mira','Nara','Oira','Pira','Rira','Sora',
  'Tira','Ura','Vira','Wira','Xira','Yora','Zira','Asha','Bira','Cora'];
const LAST_NAMES = ['del Bosque','de Piedra','del Río','de la Montaña','del Valle',
  'de la Costa','del Norte','del Sur','del Este','del Oeste','de la Llanura',
  'del Fuego','del Hielo','de la Selva','del Desierto'];

function randomName(rng, gender) {
  const pool = gender === 'F' ? FIRST_NAMES_F : FIRST_NAMES_M;
  return pool[Math.floor(rng()*pool.length)] + ' ' + LAST_NAMES[Math.floor(rng()*LAST_NAMES.length)];
}

// ── Actions ───────────────────────────────────────────────────────────────────
const ACTIONS = {
  IDLE:'Descansando', WANDER:'Explorando', GATHER:'Recolectando',
  HUNT:'Cazando', SLEEP:'Durmiendo', BUILD:'Construyendo',
  SOCIALIZE:'Socializando', FISH:'Pescando', MINE:'Minando',
  REPRODUCE:'Reproduciéndose', FARM:'Cultivando', CRAFT:'Fabricando',
};

// ── World structures (placed by humans) ──────────────────────────────────────
// Each entry: { tx, ty, type, hp, builtBy }
const STRUCTURE_TYPES = {
  hut:    { icon:'🏠', color:'#c8a060', label:'Cabaña',   cost:{wood:4,stone:2}, hp:50 },
  farm:   { icon:'🌾', color:'#90c040', label:'Cultivo',  cost:{wood:1,stone:0}, hp:30 },
  camp:   { icon:'🔥', color:'#ff8030', label:'Campamento',cost:{wood:2,stone:0},hp:20 },
  quarry: { icon:'⛏', color:'#a09080', label:'Cantera',  cost:{wood:2,stone:3}, hp:40 },
};
let structures = [];
let structureGrid = null; // [ty][tx] → structure or null

function initStructureGrid() {
  structureGrid = Array.from({length:WORLD_H}, () => new Array(WORLD_W).fill(null));
}

function placeStructure(tx, ty, type, builder) {
  if(structureGrid[ty][tx]) return false; // occupied
  const def = STRUCTURE_TYPES[type];
  const s = { tx, ty, type, hp: def.hp, builtBy: builder.name, icon: def.icon, color: def.color };
  structures.push(s);
  structureGrid[ty][tx] = s;
  return true;
}

function getStructureAt(tx, ty) {
  if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) return null;
  return structureGrid[ty][tx];
}

// ── Neural Brain ──────────────────────────────────────────────────────────────
// Inputs(10): hunger,energy,health,nearFood,nearHuman,nearStructure,knowledge_norm,social,reproReady,danger
// Hidden: 8  Outputs(9): seekFood,sleep,wander,socialize,gather,build,reproduce,farm,craft
class NeuralBrain {
  constructor(rng) {
    this.iSize = 10; this.hSize = 8; this.oSize = 9;
    this.wIH = Array.from({length:this.iSize*this.hSize}, ()=>rng()*2-1);
    this.wHO = Array.from({length:this.hSize*this.oSize}, ()=>rng()*2-1);
    this.bH  = Array.from({length:this.hSize}, ()=>rng()*0.1);
    this.bO  = Array.from({length:this.oSize}, ()=>rng()*0.1);
    this.learningRate = 0.08;
    // Experience memory: last 8 (input,action,reward) tuples for batch learning
    this.memory = [];
  }

  _relu(x){ return x>0?x:x*0.05; } // leaky relu — avoids dead neurons

  forward(inputs) {
    const hidden = [];
    for(let h=0;h<this.hSize;h++){
      let s=this.bH[h];
      for(let i=0;i<this.iSize;i++) s+=inputs[i]*this.wIH[i*this.hSize+h];
      hidden.push(this._relu(s));
    }
    const raw = [];
    for(let o=0;o<this.oSize;o++){
      let s=this.bO[o];
      for(let h=0;h<this.hSize;h++) s+=hidden[h]*this.wHO[h*this.oSize+o];
      raw.push(s);
    }
    // softmax
    const max=Math.max(...raw);
    const exps=raw.map(x=>Math.exp(x-max));
    const sum=exps.reduce((a,b)=>a+b,0);
    return exps.map(x=>x/sum);
  }

  // Reinforce with speed-scaled learning — faster time = faster learning
  reinforce(inputs, actionIdx, reward, speedMult) {
    const lr = this.learningRate * Math.max(1, speedMult * 0.5);
    this.memory.push({inputs:[...inputs], actionIdx, reward});
    if(this.memory.length > 12) this.memory.shift();

    // Learn from recent memory (experience replay)
    for(const exp of this.memory) {
      const probs = this.forward(exp.inputs);
      const eff = lr * exp.reward;
      if(Math.abs(eff) < 0.0001) continue;
      for(let h=0;h<this.hSize;h++){
        const grad = (exp.actionIdx===h ? 1-probs[h] : -probs[h]) * eff;
        this.wHO[h*this.oSize+exp.actionIdx] += grad;
      }
    }
  }
}

// ── Brain inheritance ─────────────────────────────────────────────────────────
function _inheritBrain(brainA, brainB, rng) {
  const child = new NeuralBrain(rng);
  const mutRate = 0.10; const mutStr = 0.25;
  const mix = (a,b) => a.map((v,i)=>{
    const base = brainB ? (rng()<0.5?v:b[i]) : v;
    return rng()<mutRate ? base+(rng()*2-1)*mutStr : base;
  });
  child.wIH = mix(brainA.wIH, brainB?.wIH);
  child.wHO = mix(brainA.wHO, brainB?.wHO);
  child.bH  = mix(brainA.bH,  brainB?.bH);
  child.bO  = mix(brainA.bO,  brainB?.bO);
  return child;
}

function _blendColor(cA, cB, rng) {
  const p = c => { const m=c.match(/hsl\((\d+),(\d+)%,(\d+)%\)/); return m?[+m[1],+m[2],+m[3]]:[180,70,65]; };
  const a=p(cA), b=p(cB||cA), t=rng();
  return `hsl(${(Math.round(a[0]*(1-t)+b[0]*t+(rng()*20-10))+360)%360},${Math.round(Math.max(40,Math.min(90,a[1]*(1-t)+b[1]*t)))}%,${Math.round(Math.max(40,Math.min(80,a[2]*(1-t)+b[2]*t)))}%)`;
}

// ── Human class ───────────────────────────────────────────────────────────────
let humanIdCounter = 0;

class Human {
  constructor(tx, ty, rng, gender, parentA, parentB) {
    this.id       = humanIdCounter++;
    this.gender   = gender || (rng()<0.5?'M':'F');
    this.name     = randomName(rng, this.gender);
    this.tx = tx; this.ty = ty;
    this.age      = parentA ? 0 : 18+Math.floor(rng()*8);
    this.health   = 100;
    this.hunger   = 85;
    this.energy   = 100;
    this.alive    = true;
    this.action   = ACTIONS.IDLE;
    this.target   = null;
    this.inventory = {food:8, wood:2, stone:1};
    this.color    = parentA ? _blendColor(parentA.color, parentB?.color, rng) : `hsl(${Math.floor(rng()*360)},70%,65%)`;
    this.selected = false;
    this.log      = [];
    this._rng     = rng;
    this.brain    = (parentA?.brain) ? _inheritBrain(parentA.brain, parentB?.brain, rng) : new NeuralBrain(rng);
    this.partner      = null;
    this.reproTimer   = 0;
    this.children     = 0;
    this.knowledge    = parentA ? Math.floor((parentA.knowledge+(parentB?.knowledge||0))*0.3) : 0;
    this.social       = 60;
    this.homeBase     = null; // {tx,ty} of their hut/camp
    this._prevHealth  = 100;
    this._prevHunger  = 85;
    this._moveQueue   = []; // path steps
  }

  addLog(msg) {
    this.log.unshift(`Año ${year}: ${msg}`);
    if(this.log.length>15) this.log.pop();
  }

  // ── Main tick ────────────────────────────────────────────────────────────
  tick(yearsElapsed, speedMult) {
    if(!this.alive) return;
    this.age += yearsElapsed;

    const maxAge = 50 + Math.floor(this._rng()*20) + Math.floor(this.knowledge*0.4);
    if(this.age > maxAge){ this._die('vejez'); return; }

    // Stat decay — slower decay so they survive longer
    this.hunger = Math.max(0, this.hunger - yearsElapsed*3);
    this.energy = Math.max(0, this.energy - yearsElapsed*2);
    this.social = Math.max(0, this.social - yearsElapsed*1);
    if(this.reproTimer>0) this.reproTimer -= yearsElapsed;

    // Starvation
    if(this.hunger<=0){
      this.health = Math.max(0, this.health - yearsElapsed*4);
      if(this.health<=0){ this._die('hambre'); return; }
    } else {
      this.health = Math.min(100, this.health + yearsElapsed*1.2);
    }

    // Auto-eat aggressively
    if(this.hunger < 50 && this.inventory.food>0){
      const eat = Math.min(this.inventory.food, Math.ceil(4*(1-this.hunger/50)));
      this.inventory.food -= eat;
      this.hunger = Math.min(100, this.hunger + eat*15);
    }

    // Neural inputs
    const nearFood   = this._findNearbyResource(['berries','wheat_wild','mushroom','animal','fish','tree_palm','cactus','bush'],18)?1:0;
    const nearHuman  = this._findNearbyHuman(10)?1:0;
    const nearStruct = this.homeBase?1:0;
    const reproReady = (this.age>=16&&this.age<=45&&this.reproTimer<=0&&this.hunger>50&&this.energy>40)?1:0;
    const danger     = this.hunger<25||this.health<30?1:0;

    const inputs = [
      this.hunger/100, this.energy/100, this.health/100,
      nearFood, nearHuman, nearStruct,
      Math.min(1,this.knowledge/100), this.social/100,
      reproReady, danger,
    ];

    const probs = this.brain.forward(inputs);
    // 0=seekFood,1=sleep,2=wander,3=socialize,4=gather,5=build,6=reproduce,7=farm,8=craft
    let chosen;
    if(this.hunger<15 || this.health<20) chosen=0;       // critical: eat
    else if(this.energy<10)              chosen=1;       // critical: sleep
    else {
      chosen=0; let maxP=-1;
      for(let i=0;i<probs.length;i++) if(probs[i]>maxP){maxP=probs[i];chosen=i;}
    }

    this._executeAction(chosen);

    // Reward: improvement in survival stats
    const reward = ((this.health-this._prevHealth)*0.5 + (this.hunger-this._prevHunger)*0.5) / 100;
    this.brain.reinforce(inputs, chosen, reward, speedMult);
    this._prevHealth=this.health; this._prevHunger=this.hunger;
  }

  _executeAction(idx) {
    switch(idx){
      case 0: this._seekFood();      break;
      case 1: this._doSleep();       break;
      case 2: this._wander();        break;
      case 3: this._doSocialize();   break;
      case 4: this._gatherResources();break;
      case 5: this._doBuild();       break;
      case 6: this._tryReproduce();  break;
      case 7: this._doFarm();        break;
      case 8: this._doCraft();       break;
    }
  }

  _doSleep() {
    this.action = ACTIONS.SLEEP;
    this.energy = Math.min(100, this.energy+40);
  }

  _doSocialize() {
    const other = this._findNearbyHuman(8);
    if(other){
      this.action = ACTIONS.SOCIALIZE;
      this.social = Math.min(100, this.social+25);
      // Knowledge transfer — both learn from each other
      if(other.knowledge > this.knowledge){
        const gain = (other.knowledge-this.knowledge)*0.08;
        this.knowledge = Math.min(100, this.knowledge+gain);
      }
      // Move toward them
      this._stepToward(other.tx, other.ty);
    } else {
      this._wander();
    }
  }

  _doBuild() {
    const def = STRUCTURE_TYPES;
    // Pick what to build based on needs
    let type = 'camp';
    if(this.inventory.wood>=4 && this.inventory.stone>=2) type='hut';
    else if(this.inventory.wood>=2 && this.inventory.stone>=3) type='quarry';
    else if(this.inventory.wood>=1) type='camp';

    const cost = def[type].cost;
    if(this.inventory.wood>=cost.wood && this.inventory.stone>=cost.stone){
      // Find nearby empty land tile
      for(let r=1;r<=3;r++){
        for(let a=0;a<8;a++){
          const angle=(a/8)*Math.PI*2;
          const bx=Math.round(this.tx+Math.cos(angle)*r);
          const by=Math.round(this.ty+Math.sin(angle)*r);
          if(!isLand(bx,by)||getStructureAt(bx,by)) continue;
          if(placeStructure(bx,by,type,this)){
            this.inventory.wood  -= cost.wood;
            this.inventory.stone -= cost.stone;
            this.knowledge = Math.min(100, this.knowledge+3);
            this.homeBase = {tx:bx,ty:by};
            this.action = ACTIONS.BUILD;
            this.addLog(`Construyó ${def[type].label}`);
            return;
          }
        }
      }
    }
    this._gatherResources();
  }

  _doFarm() {
    // Plant a farm near home or current position
    const cost = STRUCTURE_TYPES.farm.cost;
    if(this.inventory.wood>=cost.wood){
      for(let r=1;r<=4;r++){
        for(let a=0;a<8;a++){
          const angle=(a/8)*Math.PI*2;
          const bx=Math.round(this.tx+Math.cos(angle)*r);
          const by=Math.round(this.ty+Math.sin(angle)*r);
          const cell=getCell(bx,by);
          if(!cell||!isLand(bx,by)||getStructureAt(bx,by)) continue;
          if(['grass','dense_grass','dry_grass','savanna'].includes(cell.biome)){
            if(placeStructure(bx,by,'farm',this)){
              this.inventory.wood -= cost.wood;
              this.knowledge = Math.min(100, this.knowledge+2);
              this.action = ACTIONS.FARM;
              this.addLog('Plantó un cultivo');
              return;
            }
          }
        }
      }
    }
    this._seekFood();
  }

  _doCraft() {
    if(this.inventory.wood>=2 && this.inventory.stone>=1){
      this.inventory.wood  -= 2;
      this.inventory.stone -= 1;
      this.inventory.food  += 5; // crafted tools → better hunting yield
      this.knowledge = Math.min(100, this.knowledge+1.5);
      this.action = ACTIONS.CRAFT;
      this.addLog('Fabricó herramientas');
    } else {
      this._gatherResources();
    }
  }

  _tryReproduce() {
    if(this.age<16||this.age>45||this.reproTimer>0){ this._doSocialize(); return; }
    if(this.hunger<40||this.energy<30){ this._seekFood(); return; }

    const partner = this._findReproductionPartner();
    if(partner){
      this.action = ACTIONS.REPRODUCE;
      partner.action = ACTIONS.REPRODUCE;
      this.reproTimer  = 2+Math.floor(this._rng()*2);
      partner.reproTimer = 2+Math.floor(partner._rng()*2);
      this.partner = partner.id; partner.partner = this.id;

      const cRng = mulberry32(WORLD_SEED^(this.id*0x1337)^(year*0x7F)^(partner.id*0x31));
      const child = new Human(this.tx, this.ty, cRng, cRng()<0.5?'M':'F', this, partner);
      child.hunger=75; child.energy=90;
      humans.push(child);
      this.children++; partner.children++;
      this.addLog(`Tuvo un hijo: ${child.name.split(' ')[0]}`);
      partner.addLog(`Tuvo un hijo: ${child.name.split(' ')[0]}`);
    } else {
      // Move toward nearest opposite-gender human
      let closest=null, bestD=Infinity;
      for(const h of humans){
        if(h===this||!h.alive||h.gender===this.gender) continue;
        const d=Math.hypot(h.tx-this.tx,h.ty-this.ty);
        if(d<bestD){bestD=d;closest=h;}
      }
      if(closest) this._stepToward(closest.tx, closest.ty);
      else this._wander();
    }
  }

  _wander() {
    this.action = ACTIONS.WANDER;
    // Bigger steps — move 3-8 tiles at once
    const dist = 3+Math.floor(this._rng()*6);
    const angle = this._rng()*Math.PI*2;
    this._stepToward(this.tx+Math.cos(angle)*dist, this.ty+Math.sin(angle)*dist);
    this.knowledge = Math.min(100, this.knowledge+0.2);
  }

  _seekFood() {
    const res = this._findNearbyResource(['berries','wheat_wild','mushroom','animal','fish','tree_palm','cactus','bush'],20);
    if(res){
      this.action = res.type==='animal'?ACTIONS.HUNT:res.type==='fish'?ACTIONS.FISH:ACTIONS.GATHER;
      this._stepToward(res.tx, res.ty);
      this.target = res;
    } else {
      // Check nearby farms
      const farm = this._findNearbyStructure('farm', 15);
      if(farm){ this._stepToward(farm.tx,farm.ty); this.action=ACTIONS.GATHER; }
      else this._wander();
    }
  }

  _gatherResources() {
    if(this.inventory.wood<10){
      const res=this._findNearbyResource(['tree_oak','tree_pine','tree_palm','tree_jungle'],15);
      if(res){ this.action=ACTIONS.GATHER; this._stepToward(res.tx,res.ty); this.target=res; return; }
    }
    if(this.inventory.stone<8){
      const res=this._findNearbyResource(['rock','iron_ore','clay'],15);
      if(res){ this.action=ACTIONS.MINE; this._stepToward(res.tx,res.ty); this.target=res; return; }
    }
    this._wander();
  }

  // Move multiple steps toward target in one tick (faster movement)
  _stepToward(tx, ty) {
    const steps = 3; // move up to 3 tiles per year
    let cx=this.tx, cy=this.ty;
    for(let s=0;s<steps;s++){
      const dx=tx-cx, dy=ty-cy;
      if(Math.abs(dx)<0.5&&Math.abs(dy)<0.5) break;
      const nx=Math.round(cx+(dx>0?1:dx<0?-1:0));
      const ny=Math.round(cy+(dy>0?1:dy<0?-1:0));
      if(isLand(nx,ny)){ cx=nx; cy=ny; }
      else {
        // Try diagonal alternatives
        const alt=[[nx,cy],[cx,ny]];
        let moved=false;
        for(const [ax,ay] of alt){ if(isLand(ax,ay)){cx=ax;cy=ay;moved=true;break;} }
        if(!moved) break;
      }
    }
    this.tx=cx; this.ty=cy;
  }

  _findNearbyResource(types, radius) {
    let best=null, bestDist=Infinity;
    const x0=Math.max(0,Math.floor(this.tx-radius)), x1=Math.min(WORLD_W-1,Math.floor(this.tx+radius));
    const y0=Math.max(0,Math.floor(this.ty-radius)), y1=Math.min(WORLD_H-1,Math.floor(this.ty+radius));
    for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++){
      const res=getResourceAt(tx,ty);
      if(!res||!types.includes(res.type)) continue;
      const d=Math.hypot(tx-this.tx,ty-this.ty);
      if(d<bestDist){bestDist=d;best=res;}
    }
    return best;
  }

  _findNearbyHuman(radius) {
    let best=null, bestDist=Infinity;
    for(const h of humans){
      if(h===this||!h.alive) continue;
      const d=Math.hypot(h.tx-this.tx,h.ty-this.ty);
      if(d<radius&&d<bestDist){bestDist=d;best=h;}
    }
    return best;
  }

  _findNearbyStructure(type, radius) {
    for(const s of structures){
      if(type&&s.type!==type) continue;
      if(Math.hypot(s.tx-this.tx,s.ty-this.ty)<=radius) return s;
    }
    return null;
  }

  _findReproductionPartner() {
    for(const h of humans){
      if(h===this||!h.alive||h.gender===this.gender) continue;
      if(h.age<16||h.age>45||h.reproTimer>0) continue;
      if(h.hunger<40||h.energy<30) continue;
      if(Math.hypot(h.tx-this.tx,h.ty-this.ty)<=5) return h;
    }
    return null;
  }

  _harvestTarget() {
    if(!this.target) return;
    const res=getResourceAt(this.target.tx,this.target.ty);
    if(!res){this.target=null;return;}
    const def=RESOURCE_DEFS[res.type];
    const harvest=Math.min(res.amount,6);
    res.amount-=harvest;
    if(def.food>0){ this.hunger=Math.min(100,this.hunger+def.food*harvest*0.7); this.inventory.food+=Math.floor(harvest*0.5); this.addLog(`Recolectó ${def.label}`); }
    if(def.wood>0){ this.inventory.wood+=Math.floor(harvest*0.6); this.addLog(`Taló ${def.label}`); }
    if(def.stone>0){ this.inventory.stone+=Math.floor(harvest*0.6); this.addLog(`Minó ${def.label}`); }
    this.knowledge=Math.min(100,this.knowledge+0.4);
    // Modify terrain: remove depleted resource visually
    if(res.amount<=0) removeResource(res.tx,res.ty);
    this.target=null;
  }

  // Harvest from a farm structure
  _harvestFarm(farm) {
    this.inventory.food += 8;
    this.hunger = Math.min(100, this.hunger+20);
    this.addLog('Cosechó cultivo');
    farm.hp -= 5;
    if(farm.hp<=0){
      structures.splice(structures.indexOf(farm),1);
      structureGrid[farm.ty][farm.tx]=null;
    }
  }

  _die(cause) {
    this.alive=false;
    this.action=`Murió (${cause})`;
    this.addLog(`Murió de ${cause} a los ${Math.floor(this.age)} años`);
  }
}

// ── Global humans list ────────────────────────────────────────────────────────
let humans = [];

function spawnInitialHumans() {
  humans = [];
  humanIdCounter = 0;
  initStructureGrid();
  structures = [];

  const cx=Math.floor(WORLD_W/2), cy=Math.floor(WORLD_H/2);
  let placed=0;
  const genders=['M','F'];

  for(let r=0;r<80&&placed<2;r++){
    for(let a=0;a<20&&placed<2;a++){
      const angle=(a/20)*Math.PI*2;
      const tx=Math.round(cx+Math.cos(angle)*r);
      const ty=Math.round(cy+Math.sin(angle)*r);
      if(!isLand(tx,ty)) continue;
      const cell=getCell(tx,ty);
      if(!cell||cell.h>T.MOUNTAIN) continue;
      const rng=mulberry32(WORLD_SEED^(placed*0x1234)^0xBEEF);
      const h=new Human(tx,ty,rng,genders[placed]);
      h.age=20+Math.floor(rng()*5);
      h.inventory={food:15,wood:4,stone:2}; // start with more resources
      humans.push(h);
      placed++;
    }
  }
}

function tickHumans(yearsElapsed, speedMult) {
  for(const h of humans){
    if(!h.alive) continue;
    h.tick(yearsElapsed, speedMult);
    // Harvest if at target resource
    if(h.target&&h.tx===h.target.tx&&h.ty===h.target.ty) h._harvestTarget();
    // Harvest nearby farm
    const farm=h._findNearbyStructure('farm',1);
    if(farm&&h.hunger<70) h._harvestFarm(farm);
  }
}
