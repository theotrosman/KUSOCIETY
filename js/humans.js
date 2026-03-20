// ── Human names ───────────────────────────────────────────────────────────────
const FIRST_NAMES = ['Arek','Bora','Cael','Duna','Eron','Fira','Gael','Hira',
  'Ivar','Jora','Kael','Lira','Morn','Nara','Orin','Pira','Rael','Sora',
  'Tael','Uran','Vira','Wren','Xael','Yora','Zael','Asha','Bren','Cira',
  'Dael','Elra','Forn','Gira','Hael','Iren','Jael','Kira','Lorn','Mael'];

const LAST_NAMES  = ['del Bosque','de Piedra','del Río','de la Montaña','del Valle',
  'de la Costa','del Norte','del Sur','del Este','del Oeste','de la Llanura',
  'del Fuego','del Hielo','de la Selva','del Desierto'];

function randomName(rng) {
  const f = FIRST_NAMES[Math.floor(rng()*FIRST_NAMES.length)];
  const l = LAST_NAMES [Math.floor(rng()*LAST_NAMES.length)];
  return `${f} ${l}`;
}

// ── Actions ───────────────────────────────────────────────────────────────────
const ACTIONS = {
  IDLE      :'Descansando',
  WANDER    :'Explorando',
  GATHER    :'Recolectando',
  HUNT      :'Cazando',
  DRINK     :'Bebiendo agua',
  SLEEP     :'Durmiendo',
  BUILD     :'Construyendo refugio',
  SOCIALIZE :'Socializando',
  FISH      :'Pescando',
  MINE      :'Minando',
};

// ── Human class ───────────────────────────────────────────────────────────────
let humanIdCounter = 0;

class Human {
  constructor(tx, ty, rng) {
    this.id       = humanIdCounter++;
    this.name     = randomName(rng);
    this.tx       = tx;   // tile position (float for smooth movement)
    this.ty       = ty;
    this.px       = tx;   // pixel-space (for rendering interpolation)
    this.py       = ty;
    this.age      = 18 + Math.floor(rng()*10);
    this.health   = 100;
    this.hunger   = 80;   // 0=starving 100=full
    this.energy   = 100;
    this.alive    = true;
    this.action   = ACTIONS.IDLE;
    this.actionTimer = 0;
    this.target   = null; // {tx,ty}
    this.moveProgress = 0;
    this.inventory = {food:5, wood:0, stone:0};
    this.color    = `hsl(${Math.floor(rng()*360)},70%,65%)`;
    this.selected = false;
    this.log      = [];   // recent events
    this._rng     = rng;
    this._stepCooldown = 0;
  }

  addLog(msg) {
    this.log.unshift(`Año ${year}: ${msg}`);
    if(this.log.length>12) this.log.pop();
  }

  // ── AI tick (called once per year) ────────────────────────────────────────
  tick(yearsElapsed) {
    if(!this.alive) return;

    this.age += yearsElapsed;

    // Natural death
    if(this.age > 60 + Math.floor(this._rng()*30)){
      this._die('vejez'); return;
    }

    // Hunger decay
    this.hunger = Math.max(0, this.hunger - yearsElapsed*3);
    this.energy = Math.max(0, this.energy - yearsElapsed*2);

    if(this.hunger<=0){
      this.health = Math.max(0, this.health - yearsElapsed*5);
      if(this.health<=0){ this._die('hambre'); return; }
    } else {
      this.health = Math.min(100, this.health + yearsElapsed*1);
    }

    // Eat from inventory
    if(this.hunger<40 && this.inventory.food>0){
      const eat = Math.min(this.inventory.food, 3);
      this.inventory.food -= eat;
      this.hunger = Math.min(100, this.hunger + eat*12);
      this.action = ACTIONS.IDLE;
    }

    // Decide next action
    this._decide();
  }

  _decide() {
    // Priority: survival first
    if(this.hunger < 30){
      this._seekFood(); return;
    }
    if(this.energy < 20){
      this.action = ACTIONS.SLEEP;
      this.energy = Math.min(100, this.energy+30);
      return;
    }

    // Random behavior weighted by needs
    const r = this._rng();
    if(r < 0.25)      this._wander();
    else if(r < 0.50) this._seekFood();
    else if(r < 0.65) this._gatherWood();
    else if(r < 0.75) this._gatherStone();
    else if(r < 0.85) this.action = ACTIONS.SOCIALIZE;
    else               this.action = ACTIONS.IDLE;
  }

  _wander() {
    this.action = ACTIONS.WANDER;
    const dx = Math.floor(this._rng()*7)-3;
    const dy = Math.floor(this._rng()*7)-3;
    this._moveTo(this.tx+dx, this.ty+dy);
  }

  _seekFood() {
    // Look for food resource nearby
    const res = this._findNearbyResource(['berries','wheat_wild','mushroom','animal','fish','tree_palm','cactus'], 12);
    if(res){
      this.action = res.type==='animal' ? ACTIONS.HUNT :
                    res.type==='fish'   ? ACTIONS.FISH : ACTIONS.GATHER;
      this._moveTo(res.tx, res.ty);
      this.target = res;
    } else {
      this._wander();
    }
  }

  _gatherWood() {
    if(this.inventory.wood >= 10){ this.action=ACTIONS.IDLE; return; }
    const res = this._findNearbyResource(['tree_oak','tree_pine','tree_palm','tree_jungle'], 10);
    if(res){
      this.action = ACTIONS.GATHER;
      this._moveTo(res.tx, res.ty);
      this.target = res;
    }
  }

  _gatherStone() {
    if(this.inventory.stone >= 8){ this.action=ACTIONS.IDLE; return; }
    const res = this._findNearbyResource(['rock','iron_ore','clay'], 10);
    if(res){
      this.action = ACTIONS.MINE;
      this._moveTo(res.tx, res.ty);
      this.target = res;
    }
  }

  _findNearbyResource(types, radius) {
    let best=null, bestDist=Infinity;
    const x0=Math.max(0,this.tx-radius), x1=Math.min(WORLD_W-1,this.tx+radius);
    const y0=Math.max(0,this.ty-radius), y1=Math.min(WORLD_H-1,this.ty+radius);
    for(let ty=y0;ty<=y1;ty++){
      for(let tx=x0;tx<=x1;tx++){
        const res=getResourceAt(tx,ty);
        if(!res||!types.includes(res.type)) continue;
        const d=Math.hypot(tx-this.tx, ty-this.ty);
        if(d<bestDist){ bestDist=d; best=res; }
      }
    }
    return best;
  }

  _moveTo(tx, ty) {
    const ntx = Math.max(0, Math.min(WORLD_W-1, Math.round(tx)));
    const nty = Math.max(0, Math.min(WORLD_H-1, Math.round(ty)));
    if(!isLand(ntx,nty)) return;
    this.tx = ntx;
    this.ty = nty;
  }

  // Called when arriving at target resource
  _harvestTarget() {
    if(!this.target) return;
    const res = getResourceAt(this.target.tx, this.target.ty);
    if(!res) { this.target=null; return; }
    const def = RESOURCE_DEFS[res.type];
    const harvest = Math.min(res.amount, 5);
    res.amount -= harvest;

    if(def.food>0){
      this.hunger = Math.min(100, this.hunger + def.food*harvest*0.5);
      this.inventory.food += Math.floor(harvest*0.3);
      this.addLog(`Recolectó ${def.label}`);
    }
    if(def.wood>0){
      this.inventory.wood += Math.floor(harvest*0.4);
      this.addLog(`Taló ${def.label}`);
    }
    if(def.stone>0){
      this.inventory.stone += Math.floor(harvest*0.4);
      this.addLog(`Minó ${def.label}`);
    }

    if(res.amount<=0) removeResource(res.tx, res.ty);
    this.target=null;
  }

  _die(cause) {
    this.alive  = false;
    this.action = `Murió (${cause})`;
    this.addLog(`Murió de ${cause} a los ${this.age} años`);
  }
}

// ── Global humans list ────────────────────────────────────────────────────────
let humans = [];

function spawnInitialHumans() {
  humans = [];
  const rng = mulberry32(WORLD_SEED ^ 0xF00D);

  // Find 2 good land tiles near center
  const cx = Math.floor(WORLD_W/2);
  const cy = Math.floor(WORLD_H/2);
  let placed = 0;

  for(let r=0; r<60 && placed<2; r++){
    for(let a=0; a<16 && placed<2; a++){
      const angle = (a/16)*Math.PI*2;
      const tx = Math.round(cx + Math.cos(angle)*r);
      const ty = Math.round(cy + Math.sin(angle)*r);
      if(!isLand(tx,ty)) continue;
      const cell = getCell(tx,ty);
      if(!cell || cell.h > T.MOUNTAIN) continue;
      const h = new Human(tx, ty, mulberry32(WORLD_SEED ^ (placed*0x1234) ^ 0xBEEF));
      humans.push(h);
      placed++;
    }
  }
}

function tickHumans(yearsElapsed) {
  for(const h of humans){
    if(!h.alive) continue;
    h.tick(yearsElapsed);
    // If arrived at target, harvest
    if(h.target && h.tx===h.target.tx && h.ty===h.target.ty){
      h._harvestTarget();
    }
  }
}
