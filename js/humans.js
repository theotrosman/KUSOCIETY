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
  REPAIR:'Reparando',
};

// ── Structures ────────────────────────────────────────────────────────────────
const STRUCTURE_TYPES={
  camp:         {icon:'🔥',color:'#ff8030',label:'Campamento',        cost:{wood:2,stone:0},  hp:25,   decay:true, decayRate:2.0},
  hut:          {icon:'🏠',color:'#c8a060',label:'Cabaña',            cost:{wood:4,stone:2},  hp:100,  decay:true, decayRate:0.4},
  farm:         {icon:'🌾',color:'#90c040',label:'Cultivo',           cost:{wood:1,stone:0},  hp:60,   decay:true, decayRate:1.2},
  animal_pen:   {icon:'🐄',color:'#c8a040',label:'Corral',            cost:{wood:3,stone:1},  hp:80,   decay:true, decayRate:0.6},
  mine:         {icon:'⛏', color:'#a09080',label:'Mina',              cost:{wood:2,stone:3},  hp:100,  decay:true, decayRate:0.5},
  market:       {icon:'🏪',color:'#f0c040',label:'Mercado',           cost:{wood:6,stone:4},  hp:120,  decay:true, decayRate:0.3},
  temple:       {icon:'🛕', color:'#d0a0ff',label:'Templo',           cost:{wood:8,stone:8},  hp:200,  decay:true, decayRate:0.08},
  palisade:     {icon:'🪵',color:'#8B5E3C',label:'Empalizada',        cost:{wood:6,stone:0},  hp:200,  decay:true, decayRate:0.8},
  barracks:     {icon:'⚔️', color:'#cc4444',label:'Cuartel',          cost:{wood:8,stone:6},  hp:180,  decay:true, decayRate:0.3},
  granary:      {icon:'🌽',color:'#d4a017',label:'Granero',           cost:{wood:6,stone:4},  hp:150,  decay:true, decayRate:0.35},
  watchtower:   {icon:'🗼',color:'#aaaaaa',label:'Torre Vigía',       cost:{wood:5,stone:8},  hp:200,  decay:true, decayRate:0.25},
  harbor:       {icon:'⚓',color:'#3080ff',label:'Puerto',            cost:{wood:10,stone:6}, hp:200,  decay:true, decayRate:0.2},
  aqueduct:     {icon:'🌊',color:'#40c0ff',label:'Acueducto',         cost:{wood:4,stone:12}, hp:300,  decay:true, decayRate:0.06},
  citadel:      {icon:'🏰',color:'#888888',label:'Ciudadela',         cost:{wood:15,stone:25},hp:500,  decay:true, decayRate:0.04},
  cathedral:    {icon:'⛪',color:'#e8d0ff',label:'Catedral',          cost:{wood:20,stone:20},hp:400,  decay:true, decayRate:0.05},
  palace:       {icon:'🏯',color:'#ffd700',label:'Palacio',           cost:{wood:25,stone:30},hp:600,  decay:true, decayRate:0.03},
  // Transport & Industrial era
  shipyard:     {icon:'⛵',color:'#4080ff',label:'Astillero',         cost:{wood:15,stone:8}, hp:300,  decay:true, decayRate:0.15},
  road:         {icon:'🛤️', color:'#888888',label:'Camino',            cost:{wood:0,stone:4},  hp:500,  decay:true, decayRate:0.1},
  bridge:       {icon:'🌉',color:'#a08060',label:'Puente',            cost:{wood:8,stone:12}, hp:400,  decay:true, decayRate:0.12},
  carriage:     {icon:'🪄', color:'#c8a060',label:'Establo',           cost:{wood:10,stone:4}, hp:200,  decay:true, decayRate:0.25},
  factory:      {icon:'🏭',color:'#888888',label:'Fábrica',           cost:{wood:20,stone:30},hp:400,  decay:true, decayRate:0.1},
  railway:      {icon:'🚂',color:'#555555',label:'Ferrocarril',       cost:{wood:10,stone:20},hp:600,  decay:true, decayRate:0.05},
  powerplant:   {icon:'⚡',color:'#ffff00',label:'Central Eléc.',     cost:{wood:10,stone:30},hp:500,  decay:true, decayRate:0.06},
  airport:      {icon:'✈️', color:'#aaddff',label:'Aeropuerto',        cost:{wood:20,stone:40},hp:600,  decay:true, decayRate:0.04},
  // Cyberpunk / Megacity era
  highway:      {icon:'🛣️', color:'#666688',label:'Autopista',         cost:{wood:0,stone:15}, hp:800,  decay:true, decayRate:0.07},
  subway:       {icon:'🚇',color:'#4466aa',label:'Metro',             cost:{wood:5,stone:25}, hp:700,  decay:true, decayRate:0.05},
  skyscraper:   {icon:'🏙️', color:'#88aacc',label:'Rascacielos',       cost:{wood:10,stone:40},hp:800,  decay:true, decayRate:0.04},
  megacity_core:{icon:'🌆',color:'#cc8800',label:'Núcleo Urbano',     cost:{wood:20,stone:60},hp:1200, decay:true, decayRate:0.02},
  arcology:     {icon:'🏗️', color:'#44aa88',label:'Arcología',         cost:{wood:30,stone:80},hp:1500, decay:true, decayRate:0.015},
  neon_district:{icon:'🌃',color:'#ff44aa',label:'Distrito Neón',     cost:{wood:15,stone:50},hp:600,  decay:true, decayRate:0.06},
  neural_hub:   {icon:'🧠',color:'#aa44ff',label:'Hub Neural',        cost:{wood:20,stone:60},hp:800,  decay:true, decayRate:0.04},
  spaceport:    {icon:'🚀',color:'#aaddff',label:'Puerto Espacial',   cost:{wood:30,stone:80},hp:1000, decay:true, decayRate:0.02},
  // Nuclear
  nuclear_silo: {icon:'☢️', color:'#ff4400',label:'Silo Nuclear',       cost:{wood:20,stone:60},hp:800,  decay:true, decayRate:0.02},
  // Mega structures
  stadium:      {icon:'🏟',color:'#e8c840',label:'Estadio',           cost:{wood:20,stone:40},hp:800,  decay:true, decayRate:0.05},
  pyramid:      {icon:'△', color:'#d4a820',label:'Pirámide',          cost:{wood:10,stone:60},hp:2000, decay:true, decayRate:0.01},
  great_wall:   {icon:'🧱',color:'#a08060',label:'Gran Muralla',      cost:{wood:15,stone:50},hp:1500, decay:true, decayRate:0.02},
  lighthouse:   {icon:'🗼',color:'#f0e080',label:'Faro Colosal',      cost:{wood:20,stone:35},hp:600,  decay:true, decayRate:0.06},
  amphitheater: {icon:'🎭',color:'#c8a0e0',label:'Anfiteatro',        cost:{wood:18,stone:35},hp:700,  decay:true, decayRate:0.05},
  ziggurat:     {icon:'🏛', color:'#c8a040',label:'Zigurat',           cost:{wood:12,stone:55},hp:1800, decay:true, decayRate:0.012},
  obelisk:      {icon:'▲', color:'#f0d060',label:'Obelisco',          cost:{wood:5, stone:30},hp:500,  decay:true, decayRate:0.04},
  // Heavy machinery & excavation
  excavator:    {icon:'🚜',color:'#e8a020',label:'Excavadora',        cost:{wood:8,stone:12}, hp:300,  decay:true, decayRate:0.3},
  mining_complex:{icon:'⛏️',color:'#886644',label:'Complejo Minero',  cost:{wood:12,stone:20},hp:500,  decay:true, decayRate:0.12},
  drill_rig:    {icon:'🔩',color:'#cc8844',label:'Torre de Perforación',cost:{wood:10,stone:18},hp:400, decay:true, decayRate:0.18},
  ore_processor:{icon:'🏗',color:'#aa6633',label:'Procesadora de Mineral',cost:{wood:15,stone:25},hp:450,decay:true,decayRate:0.1},
  bulldozer:    {icon:'🚧',color:'#ffaa00',label:'Bulldozer',         cost:{wood:6,stone:10}, hp:250,  decay:true, decayRate:0.35},
  crane:        {icon:'🏗️', color:'#ddaa44',label:'Grúa',              cost:{wood:10,stone:15},hp:350,  decay:true, decayRate:0.2},
  tree_nursery: {icon:'🌱',color:'#44cc44',label:'Vivero',            cost:{wood:4,stone:2},  hp:120,  decay:true, decayRate:0.5},
  greenhouse:   {icon:'🏡',color:'#88ee44',label:'Invernadero',       cost:{wood:8,stone:6},  hp:200,  decay:true, decayRate:0.3},
};
let structures=[],structureGrid=null;

// ── Housing evolution — 15 levels ─────────────────────────────────────────────
// Each level has an icon, label, min avgK to upgrade, and height for rendering
const HOUSING_LEVELS=[
  {level:0, icon:'🔥',label:'Campamento',   minK:0,      color:'#ff8030', height:0},
  {level:1, icon:'🏠',label:'Cabaña',       minK:20,     color:'#c8a060', height:1},
  {level:2, icon:'🏡',label:'Casa de Barro',minK:80,     color:'#b89060', height:1},
  {level:3, icon:'🏘',label:'Aldea',        minK:200,    color:'#a07850', height:2},
  {level:4, icon:'🏛',label:'Casa de Piedra',minK:500,   color:'#909090', height:2},
  {level:5, icon:'🏰',label:'Mansión',      minK:1200,   color:'#aaaaaa', height:3},
  {level:6, icon:'🏯',label:'Casa Medieval',minK:3000,   color:'#888888', height:3},
  {level:7, icon:'🏢',label:'Edificio',     minK:8000,   color:'#7090b0', height:4},
  {level:8, icon:'🏬',label:'Bloque Urbano',minK:18000,  color:'#6080a0', height:5},
  {level:9, icon:'🏙️',label:'Rascacielos',  minK:35000,  color:'#88aacc', height:7},
  {level:10,icon:'🌆',label:'Torre Moderna',minK:55000,  color:'#aaccee', height:8},
  {level:11,icon:'🌃',label:'Torre Neón',   minK:75000,  color:'#ff44aa', height:8},
  {level:12,icon:'🏗️',label:'Megabloque',   minK:90000,  color:'#44ffaa', height:9},
  {level:13,icon:'🛸',label:'Torre IA',     minK:110000, color:'#aa44ff', height:9},
  {level:14,icon:'🌌',label:'Arcotorre',    minK:130000, color:'#44aaff', height:10},
];
// Map from housing level → STRUCTURE_HEIGHT entry (used by renderer)
function getHousingDef(level){ return HOUSING_LEVELS[Math.max(0,Math.min(14,level))]; }

// ── Transport levels — 10 tiers ───────────────────────────────────────────────
const TRANSPORT_TIERS=[
  {tier:0, icon:'🚶',label:'A pie',         speed:6,   minK:0},
  {tier:1, icon:'⛵',label:'Bote',          speed:10,  minK:500},
  {tier:2, icon:'🐎',label:'Carruaje',      speed:16,  minK:2000},
  {tier:3, icon:'🚂',label:'Tren',          speed:28,  minK:18000},
  {tier:4, icon:'🚗',label:'Automóvil',     speed:45,  minK:28000},
  {tier:5, icon:'✈️', label:'Avión',         speed:80,  minK:45000},
  {tier:6, icon:'🚁',label:'Helicóptero',   speed:65,  minK:65000},
  {tier:7, icon:'🚀',label:'Cohete',        speed:120, minK:90000},
  {tier:8, icon:'🛸',label:'Nave Orbital',  speed:180, minK:110000},
  {tier:9, icon:'🌌',label:'Teletransporte',speed:300, minK:130000},
];
// structureGrid: flat array [ty*WORLD_W+tx] → structure|null (faster than nested arrays)
function initStructureGrid(){structureGrid=new Array(WORLD_W*WORLD_H).fill(null);}
const MAX_STRUCTURES=3500;
function placeStructure(tx,ty,type,builder){
  if(structures.length>=MAX_STRUCTURES)return false;
  if(!structureGrid||structureGrid[ty*WORLD_W+tx])return false;
  const def=STRUCTURE_TYPES[type];
  if(!def)return false;
  const s={tx,ty,type,hp:def.hp,maxHp:def.hp,builtBy:builder.name,civId:builder.civId,
           icon:def.icon,color:def.color,label:def.label,decay:def.decay,decayRate:def.decayRate,
           builtYear:year};
  structures.push(s);structureGrid[ty*WORLD_W+tx]=s;return true;
}
function getStructureAt(tx,ty){
  if(!structureGrid||tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H)return null;
  return structureGrid[ty*WORLD_W+tx]||null;
}
let _structureDecayTimer = 0;
function tickStructures(yearsElapsed){
  if(!structureGrid) return;
  // Throttle: run every 5 sim-years to reduce per-frame cost
  _structureDecayTimer += yearsElapsed;
  if(_structureDecayTimer < 5) return;
  const dt = _structureDecayTimer;
  _structureDecayTimer = 0;

  // Season multiplier: winter degrades structures faster, summer slower
  const seasonMult = (typeof _season!=='undefined')
    ? [1.0, 0.7, 1.1, 1.8][_season]  // spring/summer/autumn/winter
    : 1.0;
  // Intelligence modifier: smarter civs maintain buildings better (less decay)
  const maintainMod = (typeof _intelModifier!=='undefined')
    ? Math.max(0.3, 1.5 - _intelModifier * 0.4)
    : 1.0;

  for(let i=structures.length-1;i>=0;i--){
    const s=structures[i];
    if(!s.decay||s.decayRate<=0)continue;
    s.hp -= dt * s.decayRate * seasonMult * maintainMod;
    if(s.hp<=0){
      structureGrid[s.ty*WORLD_W+s.tx]=null;
      structures.splice(i,1);
      if(typeof markCityGlowDirty!=='undefined')markCityGlowDirty();
    }
  }
}

// ── Housing upgrade — called from passive effects tick ────────────────────────
let _housingUpgradeTimer=0;
function _tickHousingUpgrades(yearsElapsed){
  _housingUpgradeTimer+=yearsElapsed;
  if(_housingUpgradeTimer<15)return;
  _housingUpgradeTimer=0;
  if(!_cachedAlive||_cachedAlive.length===0)return;
  // Compute avg knowledge once
  let sum=0,cnt=0;
  const step=_cachedAlive.length>80?Math.ceil(_cachedAlive.length/80):1;
  for(let i=0;i<_cachedAlive.length;i+=step){sum+=_cachedAlive[i].knowledge;cnt++;}
  const avgK=cnt>0?sum/cnt:0;
  // Find the target housing level for this knowledge level
  let targetLevel=0;
  for(const def of HOUSING_LEVELS){if(avgK>=def.minK)targetLevel=def.level;}
  if(targetLevel===0)return;
  // Upgrade huts that are below the target level
  let upgraded=0;
  for(const s of structures){
    if(s.type!=='hut'&&s.type!=='camp')continue;
    const currentLevel=s.housingLevel||0;
    if(currentLevel>=targetLevel)continue;
    const newLevel=Math.min(targetLevel,currentLevel+1);
    const def=getHousingDef(newLevel);
    s.housingLevel=newLevel;
    s.icon=def.icon;
    s.label=def.label;
    s.color=def.color;
    s.hp=Math.min(s.maxHp*1.5,s.hp+50);
    s.maxHp=100+newLevel*80;
    upgraded++;
    if(upgraded>=8)break; // cap per tick for perf
  }
  if(upgraded>0&&targetLevel>=7&&Math.random()<0.1){
    addWorldEvent(`🏗 Las viviendas evolucionan — nivel ${targetLevel}: ${getHousingDef(targetLevel).label}`);
    if(typeof markCityGlowDirty!=='undefined')markCityGlowDirty();
  }
}

// ── Replanting tick — tree nurseries plant trees when wood is scarce ──────────
const MAX_RESOURCES = 8000; // hard cap to prevent memory growth
let _replantTimer=0;
function _tickReplanting(yearsElapsed){
  _replantTimer+=yearsElapsed;
  if(_replantTimer<20)return;
  _replantTimer=0;
  if(resources.length>=MAX_RESOURCES)return; // don't grow unbounded
  // Iterate structures directly — avoid filter() allocation
  const ctx=resourceCanvas?resourceCanvas.getContext('2d'):null;
  for(const n of structures){
    if(n.type!=='tree_nursery'&&n.type!=='greenhouse')continue;
    // Check if wood is scarce nearby
    const WOOD_TYPES=['tree_oak','tree_pine','tree_palm','tree_jungle','bush'];
    let woodCount=0;
    const r=18;
    const x0=Math.max(0,n.tx-r),x1=Math.min(WORLD_W-1,n.tx+r);
    const y0=Math.max(0,n.ty-r),y1=Math.min(WORLD_H-1,n.ty+r);
    for(let ty=y0;ty<=y1;ty+=2)for(let tx=x0;tx<=x1;tx+=2){
      const res=resourceGrid[ty][tx];
      if(res&&WOOD_TYPES.includes(res.type)&&res.amount>5)woodCount++;
    }
    if(woodCount>=6)continue; // enough wood nearby
    // Plant a tree in a random empty land tile nearby
    for(let attempt=0;attempt<12;attempt++){
      const angle=Math.random()*Math.PI*2;
      const dist=4+Math.floor(Math.random()*12);
      const tx=Math.round(n.tx+Math.cos(angle)*dist);
      const ty=Math.round(n.ty+Math.sin(angle)*dist);
      if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H)continue;
      if(resourceGrid[ty][tx]||getStructureAt(tx,ty))continue;
      const cell=getCell(tx,ty);
      if(!cell||cell.h<0.18)continue;
      const treeType=n.type==='greenhouse'?'wheat_wild':'tree_oak';
      const res2={type:treeType,tx,ty,amount:30,maxAmount:100};
      resources.push(res2);
      resourceGrid[ty][tx]=res2;
      if(ctx){
        const def=RESOURCE_DEFS[treeType];
        const px=tx*TILE+TILE/2,py=ty*TILE+TILE/2;
        ctx.font=`${TILE*0.82}px serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillText(def.icon,px+1,py+2);
        ctx.fillStyle='#fff';ctx.fillText(def.icon,px,py);
      }
      break;
    }
  }
}

// ── Excavation tick — excavators/mining complexes generate stone/ore ──────────
let _excavationTimer=0;
function _tickExcavation(yearsElapsed){
  _excavationTimer+=yearsElapsed;
  if(_excavationTimer<25)return;
  _excavationTimer=0;
  if(resources.length>=MAX_RESOURCES)return; // don't grow unbounded
  const excavTypes=new Set(['excavator','mining_complex','drill_rig','ore_processor']);
  // Iterate structures directly — avoid filter() allocation
  const ctx=resourceCanvas?resourceCanvas.getContext('2d'):null;
  for(const e of structures){
    if(!excavTypes.has(e.type))continue;
    // Check if stone is scarce nearby
    const STONE_TYPES=['rock','iron_ore','gold_ore','coal','clay'];
    let stoneCount=0;
    const r=20;
    const x0=Math.max(0,e.tx-r),x1=Math.min(WORLD_W-1,e.tx+r);
    const y0=Math.max(0,e.ty-r),y1=Math.min(WORLD_H-1,e.ty+r);
    for(let ty=y0;ty<=y1;ty+=2)for(let tx=x0;tx<=x1;tx+=2){
      const res=resourceGrid[ty][tx];
      if(res&&STONE_TYPES.includes(res.type)&&res.amount>5)stoneCount++;
    }
    if(stoneCount>=5)continue; // enough stone nearby
    // Generate a mineral deposit nearby
    for(let attempt=0;attempt<15;attempt++){
      const angle=Math.random()*Math.PI*2;
      const dist=3+Math.floor(Math.random()*10);
      const tx=Math.round(e.tx+Math.cos(angle)*dist);
      const ty=Math.round(e.ty+Math.sin(angle)*dist);
      if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H)continue;
      if(resourceGrid[ty][tx]||getStructureAt(tx,ty))continue;
      const cell=getCell(tx,ty);
      if(!cell||cell.h<0.18)continue;
      const oreType=e.type==='drill_rig'||e.type==='ore_processor'?'iron_ore':'rock';
      const amount=e.type==='mining_complex'?60:e.type==='ore_processor'?80:40;
      const res2={type:oreType,tx,ty,amount,maxAmount:100};
      resources.push(res2);
      resourceGrid[ty][tx]=res2;
      if(ctx){
        const def=RESOURCE_DEFS[oreType];
        const px=tx*TILE+TILE/2,py=ty*TILE+TILE/2;
        ctx.font=`${TILE*0.82}px serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillText(def.icon,px+1,py+2);
        ctx.fillStyle='#fff';ctx.fillText(def.icon,px,py);
      }
      break;
    }
  }
}


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
    // New depth systems
    this.religion=null;       // religion name — shared faith prevents war
    this.honor=50;            // 0-100 — affects diplomacy
    this.dynastyName=null;    // set when first leader dies with heir
    this.tradePartners=new Set(); // civIds with active trade routes
    this.atWarWith=new Map();  // civId → {startYear, tributePaid}
    this.inventions=new Set(); // discovered inventions
    this.foodReserve=0;        // global food buffer — famine if hits 0
    this.season=0;             // shared season phase (synced to global)
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

// ── Seasons ───────────────────────────────────────────────────────────────────
let _season=0;        // 0=Primavera 1=Verano 2=Otoño 3=Invierno
let _seasonTimer=0;
let _seasonName='Primavera';
const SEASON_NAMES=['Primavera','Verano','Otoño','Invierno'];
const SEASON_ICONS=['🌸','☀️','🍂','❄️'];
const SEASON_FOOD_MOD=[1.0, 1.3, 0.9, 0.5];   // food gather multiplier
const SEASON_SPEED_MOD=[1.0, 1.1, 1.0, 0.75];  // movement speed multiplier
const SEASON_HEALTH_MOD=[0, 0.5, 0, -1.5];     // health delta per year

function tickSeasons(yearsElapsed){
  _seasonTimer+=yearsElapsed;
  if(_seasonTimer>=10){ // each season lasts 10 years
    _seasonTimer=0;
    _season=(_season+1)%4;
    _seasonName=SEASON_NAMES[_season];
    const icon=SEASON_ICONS[_season];
    addWorldEvent(`${icon} Llega el ${_seasonName}`);
  }
}

// ── Natural Monuments ─────────────────────────────────────────────────────────
const MONUMENT_TYPES=[
  {type:'volcano',   icon:'🌋',label:'Volcán',       color:'#ff4400', bonus:'knowledge', bonusAmt:5,  radius:15},
  {type:'waterfall', icon:'💦',label:'Cascada',      color:'#40c0ff', bonus:'health',    bonusAmt:3,  radius:12},
  {type:'ruins',     icon:'🏚',label:'Ruinas Antiguas',color:'#a08060',bonus:'knowledge',bonusAmt:8,  radius:10},
  {type:'sacred_grove',icon:'🌳',label:'Bosque Sagrado',color:'#40c040',bonus:'social',  bonusAmt:4,  radius:14},
  {type:'crystal_cave',icon:'💎',label:'Cueva de Cristal',color:'#88ffff',bonus:'knowledge',bonusAmt:12,radius:8},
];
let naturalMonuments=[]; // {tx,ty,type,icon,label,color,bonus,bonusAmt,radius}

function spawnNaturalMonuments(){
  naturalMonuments=[];
  const rng=mulberry32(WORLD_SEED^0xBEEF);
  const count=8+Math.floor(rng()*6); // 8-13 monuments
  for(let attempt=0;attempt<count*8&&naturalMonuments.length<count;attempt++){
    const tx=Math.floor(rng()*WORLD_W);
    const ty=Math.floor(rng()*WORLD_H);
    const cell=getCell(tx,ty);
    if(!cell||cell.h<0.18)continue; // must be on land
    // Don't overlap existing monuments
    const tooClose=naturalMonuments.some(m=>Math.hypot(m.tx-tx,m.ty-ty)<20);
    if(tooClose)continue;
    const mtype=MONUMENT_TYPES[Math.floor(rng()*MONUMENT_TYPES.length)];
    naturalMonuments.push({tx,ty,...mtype});
  }
}

function _tickMonumentBonuses(yearsElapsed){
  if(naturalMonuments.length===0)return;
  // Only run every 5 years
  if(Math.floor(year)%5!==0)return;
  for(const m of naturalMonuments){
    const r=m.radius,r2=r*r;
    const x0=Math.max(0,m.tx-r),x1=Math.min(WORLD_W-1,m.tx+r);
    const y0=Math.max(0,m.ty-r),y1=Math.min(WORLD_H-1,m.ty+r);
    for(const h of _cachedAlive){
      if(h.tx<x0||h.tx>x1||h.ty<y0||h.ty>y1)continue;
      const dx=h.tx-m.tx,dy=h.ty-m.ty;
      if(dx*dx+dy*dy>r2)continue;
      if(m.bonus==='knowledge') h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*m.bonusAmt*_intelModifier);
      else if(m.bonus==='health') h.health=Math.min(100,h.health+yearsElapsed*m.bonusAmt);
      else if(m.bonus==='social') h.social=Math.min(100,h.social+yearsElapsed*m.bonusAmt);
    }
  }
}

// ── Trade goods — what civs exchange ─────────────────────────────────────────
const TRADE_GOODS=[
  {name:'Grano',    icon:'🌾', foodBonus:8,  knowledgeBonus:5},
  {name:'Madera',   icon:'🪵', foodBonus:2,  knowledgeBonus:8},
  {name:'Piedra',   icon:'🪨', foodBonus:0,  knowledgeBonus:12},
  {name:'Especias', icon:'🌶️', foodBonus:5,  knowledgeBonus:20},
  {name:'Telas',    icon:'🧵', foodBonus:3,  knowledgeBonus:15},
  {name:'Metales',  icon:'⚙️', foodBonus:0,  knowledgeBonus:25},
  {name:'Joyas',    icon:'💎', foodBonus:0,  knowledgeBonus:40},
  {name:'Libros',   icon:'📚', foodBonus:0,  knowledgeBonus:60},
];

// ── Society tiers — based on population and structures ───────────────────────
const SOCIETY_TIERS=[
  {minPop:0,  minK:0,     name:'Banda Nómada',    icon:'🏕️', desc:'Pequeños grupos de cazadores-recolectores'},
  {minPop:5,  minK:50,    name:'Tribu',            icon:'🔥', desc:'Comunidad sedentaria con rituales compartidos'},
  {minPop:15, minK:200,   name:'Jefatura',         icon:'👑', desc:'Líder hereditario, especialización laboral'},
  {minPop:30, minK:800,   name:'Ciudad-Estado',    icon:'🏛️', desc:'Centro urbano con leyes y comercio'},
  {minPop:60, minK:3000,  name:'Imperio',          icon:'🏰', desc:'Dominio territorial extenso y ejército profesional'},
  {minPop:100,minK:10000, name:'Nación',           icon:'🗺️', desc:'Identidad nacional, instituciones formales'},
  {minPop:150,minK:30000, name:'Estado Industrial',icon:'🏭', desc:'Producción masiva, clase obrera'},
  {minPop:200,minK:60000, name:'Superpotencia',    icon:'🌐', desc:'Influencia global, tecnología avanzada'},
  {minPop:300,minK:100000,name:'Civilización IA',  icon:'🤖', desc:'Fusión humano-máquina, post-escasez'},
];
function _getSocietyTier(civ){
  const avgK=civ.avgKnowledge||0;
  let tier=SOCIETY_TIERS[0];
  for(const t of SOCIETY_TIERS){
    if(civ.population>=t.minPop&&avgK>=t.minK)tier=t;
  }
  return tier;
}

// ── Trade routes — visible connections between civs ───────────────────────────
const _activeTradeRoutes=[]; // {civA,civB,good,timer}
let _tradeTimer=0;
// Shared per-tick cache: civId → Set<structureType> — rebuilt in tickHumans
const _civStructureTypes=new Map();

function tickTrade(yearsElapsed){
  _tradeTimer+=yearsElapsed;
  if(_tradeTimer<15)return; // run every 15 years
  _tradeTimer=0;
  // Clean expired routes
  for(let i=_activeTradeRoutes.length-1;i>=0;i--){
    _activeTradeRoutes[i].timer-=15;
    if(_activeTradeRoutes[i].timer<=0)_activeTradeRoutes.splice(i,1);
  }
  for(const [,civ] of civilizations){
    if(civ.population===0)continue;
    const civTypes=_civStructureTypes.get(civ.id);
    const hasMarket=civTypes&&(civTypes.has('market')||civTypes.has('harbor'));
    if(!hasMarket)continue;
    // Update society tier
    civ.societyTier=_getSocietyTier(civ);
    for(const alliedId of civ.allies){
      const allied=civilizations.get(alliedId);
      if(!allied||allied.population===0)continue;
      const alliedTypes=_civStructureTypes.get(alliedId);
      const alliedHasMarket=alliedTypes&&(alliedTypes.has('market')||alliedTypes.has('harbor'));
      if(!alliedHasMarket)continue;
      civ.tradePartners.add(alliedId);
      allied.tradePartners.add(civ.id);
      // Pick a trade good based on tech level
      const goodIdx=Math.min(TRADE_GOODS.length-1,Math.floor((civ.techLevel+allied.techLevel)/2));
      const good=TRADE_GOODS[goodIdx];
      let civMembers=0,alliedMembers=0;
      for(const id of civ.members){const h=_hById(id);if(h&&h.alive){h.knowledge=Math.min(99999,h.knowledge+good.knowledgeBonus*_intelModifier);h.inventory.food=Math.min(50,h.inventory.food+good.foodBonus);civMembers++;}}
      for(const id of allied.members){const h=_hById(id);if(h&&h.alive){h.knowledge=Math.min(99999,h.knowledge+good.knowledgeBonus*_intelModifier);h.inventory.food=Math.min(50,h.inventory.food+good.foodBonus);alliedMembers++;}}
      // Register active trade route for rendering
      const existing=_activeTradeRoutes.find(r=>(r.civA===civ.id&&r.civB===alliedId)||(r.civA===alliedId&&r.civB===civ.id));
      if(existing){existing.timer=60;existing.good=good;}
      else _activeTradeRoutes.push({civA:civ.id,civB:alliedId,good,timer:60});
      if(civMembers>0&&alliedMembers>0&&Math.random()<0.12){
        addWorldEvent(`${good.icon} Comercio de ${good.name}: ${civ.name} ↔ ${allied.name}`);
      }
    }
  }
}

// ── Famine ────────────────────────────────────────────────────────────────────
// Full famine system is in features.js (tickFamine). This stub keeps the
// tickHumans call working — the real logic runs via tickAllFeatures.


// ── Inventions ────────────────────────────────────────────────────────────────
const INVENTION_LIST=[
  {id:'escritura',    name:'Escritura',       icon:'📝', knowledgeBoost:200,  minAvgK:100},
  {id:'rueda',        name:'La Rueda',        icon:'⚙️', knowledgeBoost:300,  minAvgK:200},
  {id:'imprenta',     name:'Imprenta',        icon:'📖', knowledgeBoost:800,  minAvgK:1000},
  {id:'brujula',      name:'Brújula',         icon:'🧭', knowledgeBoost:500,  minAvgK:600},
  {id:'telescopio',   name:'Telescopio',      icon:'🔭', knowledgeBoost:1200, minAvgK:3000},
  {id:'vapor',        name:'Máquina de Vapor',icon:'♨️', knowledgeBoost:2000, minAvgK:8000},
  {id:'electricidad', name:'Electricidad',    icon:'⚡', knowledgeBoost:5000, minAvgK:20000},
  {id:'radio',        name:'Radio',           icon:'📡', knowledgeBoost:8000, minAvgK:40000},
];
let _inventionTimer=0;
function tickInventions(yearsElapsed){
  _inventionTimer+=yearsElapsed;
  if(_inventionTimer<30)return; // check every 30 years
  _inventionTimer=0;
  for(const [,civ] of civilizations){
    if(civ.population===0)continue;
    const avgK=civ.avgKnowledge||0; // cached by leader elect loop
    if(avgK===0)continue;
    for(const inv of INVENTION_LIST){
      if(civ.inventions.has(inv.id))continue;
      if(avgK<inv.minAvgK)continue;
      // Chance proportional to how far above threshold
      const chance=Math.min(0.3,(avgK-inv.minAvgK)/inv.minAvgK*0.1);
      if(Math.random()>chance)continue;
      civ.inventions.add(inv.id);
      // Boost all members
      for(const id of civ.members){const h=_hById(id);if(h&&h.alive)h.knowledge=Math.min(99999,h.knowledge+inv.knowledgeBoost);}
      addMajorEvent(`${inv.icon} ${civ.name} inventó ${inv.name} — ¡un salto enorme para la humanidad!`);
      chronicleScience(civ.name, inv.name, `Este descubrimiento cambió para siempre la forma en que ${civ.name} entendía el mundo.`);
      civ.honor=Math.min(100,civ.honor+10);
    }
  }
}

// ── Religion ──────────────────────────────────────────────────────────────────
const RELIGION_NAMES=['Sol Eterno','La Gran Madre','El Camino','Fe del Fuego','Orden del Cosmos','Los Ancestros','La Luz Verdadera','El Espíritu del Mar'];
let _religionTimer=0;
function tickReligion(yearsElapsed){
  _religionTimer+=yearsElapsed;
  if(_religionTimer<25)return;
  _religionTimer=0;
  for(const [,civ] of civilizations){
    if(civ.population===0)continue;
    if(!civ.religion){
      const civTypes=_civStructureTypes.get(civ.id);
      const hasTemple=civTypes&&(civTypes.has('temple')||civTypes.has('cathedral'));
      if(hasTemple&&Math.random()<0.08){
        const rng=mulberry32(WORLD_SEED^civ.id^year);
        civ.religion=RELIGION_NAMES[Math.floor(rng()*RELIGION_NAMES.length)];
        addMajorEvent(`🛕 ${civ.name} fundó la religión "${civ.religion}" — la fe une al pueblo`);
        chronicleReligion(civ.name, civ.religion, `Los primeros fieles se reunieron en los templos y encontraron en la fe una razón para vivir juntos.`);
      }
      continue;
    }
    // Spread religion to allied civs
    for(const alliedId of civ.allies){
      const allied=civilizations.get(alliedId);
      if(!allied||allied.religion)continue;
      if(Math.random()<0.05){
        allied.religion=civ.religion;
        addWorldEvent(`🛕 La fe "${civ.religion}" se extendió a ${allied.name}`);
        // Same-faith civs become more peaceful
        allied.enemies.delete(civ.id);
        civ.enemies.delete(alliedId);
      }
    }
    // Same-faith civs don't attack each other — remove from enemies
    for(const [,other] of civilizations){
      if(other.id===civ.id||!other.religion)continue;
      if(other.religion===civ.religion){
        civ.enemies.delete(other.id);
        other.enemies.delete(civ.id);
        if(!civ.allies.has(other.id)&&Math.random()<0.02){
          civ.allies.add(other.id);
          other.allies.add(civ.id);
        }
      }
    }
    // Faith boosts social for members near temples
    for(const id of civ.members){
      const h=_hById(id);
      if(h&&h.alive)h.social=Math.min(100,h.social+yearsElapsed*0.5);
    }
  }
}

// ── Formal Wars ───────────────────────────────────────────────────────────────
let _warTimer=0;
function tickFormalWars(yearsElapsed){
  _warTimer+=yearsElapsed;
  if(_warTimer<20)return;
  _warTimer=0;
  for(const [,civ] of civilizations){
    if(civ.population===0)continue;
    // Declare war on enemies if strong enough
    for(const enemyId of [...civ.enemies]){
      const enemy=civilizations.get(enemyId);
      if(!enemy||enemy.population===0)continue;
      if(civ.atWarWith.has(enemyId))continue;
      // Same religion = no war
      if(civ.religion&&civ.religion===enemy.religion)continue;
      if(civ.militaryPower>enemy.militaryPower*0.7&&Math.random()<0.1){
        civ.atWarWith.set(enemyId,{startYear:year,tributePaid:false});
        enemy.atWarWith.set(civ.id,{startYear:year,tributePaid:false});
        civ.honor=Math.max(0,civ.honor-5);
        const reason=WAR_REASONS[Math.floor(Math.random()*WAR_REASONS.length)];
        addMajorEvent(`⚔️ ¡${civ.name} declaró guerra a ${enemy.name}! El conflicto comienza`);
        chronicleWar(civ.name, enemy.name, reason);
      }
    }
    // Peace after 100 years of war
    for(const [warId,warData] of [...civ.atWarWith]){
      if(year-warData.startYear>=100){
        const enemy=civilizations.get(warId);
        civ.atWarWith.delete(warId);
        if(enemy){
          enemy.atWarWith.delete(civ.id);
          // Loser pays tribute (weaker civ)
          if(civ.militaryPower>enemy.militaryPower){
            civ.honor=Math.min(100,civ.honor+15);
            addMajorEvent(`🕊️ ${civ.name} venció a ${enemy.name} — tratado de paz firmado`);
            chroniclePeace(civ.name, enemy.name, `${civ.name} impuso sus condiciones. ${enemy.name} aceptó, exhausto tras décadas de conflicto.`);
          } else {
            addMajorEvent(`🕊️ Paz entre ${civ.name} y ${enemy.name} tras 100 años de guerra`);
            chroniclePeace(civ.name, enemy.name, `Cien años de guerra dejaron a ambos pueblos agotados. Nadie ganó. Todos perdieron demasiado.`);
          }
          civ.enemies.delete(warId);
          enemy.enemies.delete(civ.id);
        }
      }
    }
  }
}

// ── Mass Migration ────────────────────────────────────────────────────────────
let _migrationTimer=0;
function tickMassiveMigration(yearsElapsed){
  _migrationTimer+=yearsElapsed;
  if(_migrationTimer<50)return; // check every 50 years
  _migrationTimer=0;
  for(const [,civ] of civilizations){
    if(civ.population<20)continue;
    // Check if civ has boats — use civStructureTypes cache
    const civTypes=_civStructureTypes.get(civ.id);
    const hasBoats=civTypes&&civTypes.has('shipyard');
    if(!hasBoats)continue;
    // Check density
    const density=civ.population/(Math.max(1,civ.territory.size));
    if(density<0.3)continue; // not overcrowded
    // Find a distant land tile to migrate to
    const rng=mulberry32(WORLD_SEED^civ.id^year);
    let destTx=-1,destTy=-1;
    for(let attempt=0;attempt<30;attempt++){
      const tx=Math.floor(rng()*WORLD_W);
      const ty=Math.floor(rng()*WORLD_H);
      const cell=getCell(tx,ty);
      if(!cell||cell.h<0.18)continue;
      // Must be far from current territory — sample flat grid
      let farEnough=true;
      if(_territoryGrid){
        const r=30;
        outer2:for(let dy=-r;dy<=r;dy+=5){
          for(let dx=-r;dx<=r;dx+=5){
            const nx2=Math.max(0,Math.min(WORLD_W-1,tx+dx));
            const ny2=Math.max(0,Math.min(WORLD_H-1,ty+dy));
            if(_territoryGrid[ny2*WORLD_W+nx2]===civ.id){farEnough=false;break outer2;}
          }
        }
      }
      if(!farEnough)continue;
      destTx=tx;destTy=ty;break;
    }
    if(destTx<0)continue;
    // Move 20% of population to new location
    const migrants=[];
    for(const id of civ.members){
      const h=_hById(id);
      if(h&&h.alive&&!h.isLeader&&migrants.length<Math.floor(civ.population*0.2)){
        migrants.push(h);
      }
    }
    if(migrants.length<3)continue;
    for(const h of migrants){
      h.tx=Math.max(0,Math.min(WORLD_W-1,destTx+Math.floor(rng()*8-4)));
      h.ty=Math.max(0,Math.min(WORLD_H-1,destTy+Math.floor(rng()*8-4)));
      h.px=h.tx*TILE+TILE/2;h.py=h.ty*TILE+TILE/2;
      h.action=ACTIONS.MIGRATE;
    }
    addMajorEvent(`🚢 ${civ.name} lanzó una migración masiva — ${migrants.length} personas buscan nuevas tierras`);
  }
}

// ── Dynasty / Heir ────────────────────────────────────────────────────────────
function _handleLeaderDeath(civ, deadLeader){
  // Look for a child of the dead leader
  let heir=null;
  for(const id of civ.members){
    const h=_hById(id);
    if(!h||!h.alive)continue;
    if(h.parentIds&&(h.parentIds[0]===deadLeader.id||h.parentIds[1]===deadLeader.id)){
      if(!heir||h.knowledge>heir.knowledge)heir=h;
    }
  }
  // Chronicle for notable leader deaths
  if(deadLeader.knowledge>500||deadLeader.kills>5||deadLeader.age>80){
    const deeds=[];
    if(deadLeader.kills>5) deeds.push(`guerrero temido con ${deadLeader.kills} victorias`);
    if(deadLeader.knowledge>500) deeds.push(`sabio de conocimiento ${Math.floor(deadLeader.knowledge)}`);
    if(deadLeader.age>80) deeds.push(`anciano de ${Math.floor(deadLeader.age)} años`);
    const deedStr=deeds.join(', ');
    addChronicle('culture',`Muere ${deadLeader.name.split(' ')[0]}, líder de ${civ.name}`,`${deadLeader.name}, ${deedStr}, cerró los ojos por última vez. ${civ.name} llora a su guía. El trono queda vacío y el futuro, incierto.`,'👑');
  }
  if(heir){
    const old=_hById(civ.leaderId);
    if(old)old.isLeader=false;
    civ.leaderId=heir.id;heir.isLeader=true;
    if(!civ.dynastyName){
      civ.dynastyName='Dinastía '+deadLeader.name.split(' ')[1];
    }
    heir.addLog(`Heredó el liderazgo de ${deadLeader.name.split(' ')[0]}`);
    addMajorEvent(`👑 ${heir.name.split(' ')[0]} heredó el trono de ${civ.name} — ${civ.dynastyName||'nueva dinastía'} continúa`);
  } else {
    _electNewLeader(civ);
    if(!civ.dynastyName&&Math.random()<0.3){
      civ.dynastyName='Casa '+deadLeader.name.split(' ')[1];
      addWorldEvent(`🏛 ${civ.name} establece la ${civ.dynastyName}`);
    }
    // Crisis de sucesión — puede haber conflicto entre candidatos
    if(typeof tickSuccessionCrisis!=='undefined') tickSuccessionCrisis(deadLeader, civ);
  }
}

// ── Territory claiming ────────────────────────────────────────────────────────
// Flat grid: civId per tile (-1 = unclaimed). Avoids string-keyed Set overhead.
let _territoryGrid=null; // Int32Array, WORLD_W*WORLD_H
function _initTerritoryGrid(){_territoryGrid=new Int32Array(WORLD_W*WORLD_H).fill(-1);}

function _updateCivTerritories(){
  if(!_territoryGrid)_initTerritoryGrid();
  _territoryGrid.fill(-1);
  for(const [,civ] of civilizations) civ.territory.clear();

  for(const s of structures){
    if(s.civId==null)continue;
    const civ=civilizations.get(s.civId);
    if(!civ)continue;
    const radius=Math.min(_getTerritoryRadius(s.type),6);
    const r2=radius*radius;
    const x0=Math.max(0,s.tx-radius),x1=Math.min(WORLD_W-1,s.tx+radius);
    const y0=Math.max(0,s.ty-radius),y1=Math.min(WORLD_H-1,s.ty+radius);
    for(let dy=y0;dy<=y1;dy++){
      for(let dx=x0;dx<=x1;dx++){
        const ddx=dx-s.tx,ddy=dy-s.ty;
        if(ddx*ddx+ddy*ddy>r2)continue;
        const idx=dy*WORLD_W+dx;
        // Last writer wins — larger structures overwrite smaller
        _territoryGrid[idx]=s.civId;
      }
    }
  }

  // Rebuild territory Sets from flat grid (capped at 2000 per civ)
  const civCounts=new Map();
  for(let i=0;i<_territoryGrid.length;i++){
    const civId=_territoryGrid[i];
    if(civId<0)continue;
    const civ=civilizations.get(civId);
    if(!civ)continue;
    const cnt=(civCounts.get(civId)||0)+1;
    if(cnt<=2000){
      const tx=i%WORLD_W,ty=Math.floor(i/WORLD_W);
      civ.territory.add(`${tx},${ty}`);
    }
    civCounts.set(civId,cnt);
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
  if(['highland','mountain','snow','tundra','glacier','volcanic'].includes(cell.biome)){
    modifyTerrain(tx,ty,'grass');
    return true;
  }
  return false;
}
// Fill water/shore tiles near a city center — makes land for dense building
function reclaimLand(tx,ty){
  const cell=getCell(tx,ty);
  if(!cell)return false;
  if(cell.biome==='deep_sea')return false; // deep ocean stays forever
  if(['sea','shore','swamp'].includes(cell.biome)){
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
  activeOutbreaks=activeOutbreaks.filter(o=>{
    // más población = curas más rápidas (escala logarítmica)
    const popFactor = 1 + Math.log10(Math.max(1, n / 10)) * 0.8;
    o.yearsLeft -= yearsElapsed * popFactor;
    return o.yearsLeft > 0;
  });
}

// ── World events ──────────────────────────────────────────────────────────────
const worldEvents=[];
function addWorldEvent(text){worldEvents.unshift({year,text});if(worldEvents.length>60)worldEvents.pop();}

// ── Chronicle — epic narrative entries ───────────────────────────────────────
// Each entry has: {year, category, title, body, icon, color}
const chronicle=[];
const CHRON_COLORS={
  war:'#c44',plague:'#4a4',disaster:'#c84',diplomacy:'#44c',
  culture:'#a4c',science:'#4ac',dynasty:'#ca4',famine:'#c84',
  espionage:'#888',trade:'#4c8',religion:'#a4a',rebellion:'#c64',
  wonder:'#cc4',default:'#68a',
};

function addChronicle(category, title, body, icon){
  const color=CHRON_COLORS[category]||CHRON_COLORS.default;
  chronicle.unshift({year, category, title, body, icon, color});
  if(chronicle.length>60) chronicle.pop();
  // Also push a short version to worldEvents feed
  addWorldEvent(`${icon} ${title}`);
}

// ── Major events — only truly important moments ───────────────────────────────
const majorEvents=[];
function addMajorEvent(text){
  majorEvents.unshift({year,text});
  if(majorEvents.length>40)majorEvents.pop();
  addWorldEvent(text);
}

// ── Narrative helpers — generate epic prose from raw data ─────────────────────
const _EPITHETS_WAR=['sangrienta','brutal','devastadora','épica','legendaria','feroz','implacable','despiadada','titánica','catastrófica','interminable','salvaje'];
const _EPITHETS_PEACE=['gloriosa','memorable','histórica','trascendental','sagrada','frágil','inesperada','duradera','amarga','necesaria'];
const _EPITHETS_CITY=['imponente','magnífica','colosal','majestuosa','legendaria','soberbia','monumental','deslumbrante','inexpugnable','eterna'];
const _rndOf=(arr)=>arr[Math.floor(Math.random()*arr.length)];

// ── War reasons pool — injected by tickFormalWars ─────────────────────────────
const WAR_REASONS=[
  'Las disputas por tierras fértiles llevaron años envenenando las relaciones.',
  'Un insulto al líder de una delegación diplomática fue la chispa que encendió el polvorín.',
  'El control de las rutas comerciales era demasiado valioso para compartirlo.',
  'Viejas deudas de sangre, nunca olvidadas, nunca perdonadas, reclamaron su precio.',
  'La ambición de un general convenció a su pueblo de que la guerra era inevitable.',
  'Los recursos escaseaban y solo quedaba una solución: tomar los del vecino.',
  'Una frontera mal trazada fue el pretexto que ambos bandos esperaban.',
  'El orgullo herido de un pueblo que se sentía menospreciado no encontró otra salida.',
  'La expansión territorial de uno amenazó la supervivencia del otro.',
  'Décadas de pequeñas escaramuzas culminaron en una guerra abierta.',
  'La muerte de un embajador en circunstancias oscuras rompió toda posibilidad de diálogo.',
  'El robo de ganado y cosechas se convirtió en un ciclo de represalias sin fin.',
  'Un matrimonio rechazado entre líderes fue tomado como afrenta imperdonable.',
  'La conquista de un templo sagrado desató la furia de todo un pueblo.',
  'Los espías descubiertos en la corte enemiga sellaron el destino de la paz.',
  'La sequía obligó a un pueblo a buscar agua en tierras ajenas, con las armas en la mano.',
  'Un eclipse fue interpretado como señal divina para atacar al enemigo.',
  'El asesinato del heredero al trono fue atribuido, con o sin pruebas, al pueblo vecino.',
  'La diferencia de fe entre ambos pueblos nunca fue un obstáculo para el comercio, hasta que lo fue.',
  'El descubrimiento de minas de metal en la frontera convirtió la disputa en guerra total.',
];

function _narrateWar(civA, civB, context=''){
  const ep=_rndOf(_EPITHETS_WAR);
  const openers=[
    `Los tambores de guerra resonaron cuando`,
    `La paz se rompió en mil pedazos cuando`,
    `El mundo tembló ante la noticia:`,
    `Ningún tratado pudo contener la furia cuando`,
    `Las fronteras que separaban a`,
    `Generaciones de tensión acumulada explotaron cuando`,
    `Los heraldos de guerra cabalgaron entre`,
    `El humo de las primeras aldeas quemadas anunció que`,
    `Nadie recuerda quién disparó primero, pero todos saben que`,
    `Los diplomáticos fracasaron y los generales tomaron el mando cuando`,
    `La sangre derramada en la frontera fue el inicio de algo mucho mayor:`,
    `Cuando los ejércitos de`,
    `El ultimátum fue ignorado. La guerra comenzó cuando`,
    `Madres, hijos, ancianos — todos supieron que algo había cambiado cuando`,
    `Los cuervos sobrevolaron el horizonte antes de que`,
  ];
  const closers=[
    `El mundo nunca volvería a ser el mismo.`,
    `Nadie ganó. Todos perdieron algo.`,
    `Los bardos cantarían esta historia durante generaciones.`,
    `La tierra quedó marcada para siempre.`,
    `Solo los muertos conocen el final de la guerra.`,
    `El odio sembrado ese día tardaría siglos en apagarse.`,
    `Los supervivientes juraron que nunca olvidarían.`,
    `La historia juzgaría a ambos con dureza.`,
  ];
  const opener=_rndOf(openers);
  const closer=_rndOf(closers);
  if(opener.endsWith('cuando')||opener.endsWith('que')||opener.endsWith('mando cuando')||opener.endsWith('mayor:')){
    return `${opener} ${civA} y ${civB} se enfrentaron en una ${ep} guerra. ${context} ${closer}`;
  }
  return `${opener} ${civA} y ${civB} cruzaron sus armas en una ${ep} guerra. ${context} ${closer}`;
}

function _narratePeace(civA, civB, context=''){
  const ep=_rndOf(_EPITHETS_PEACE);
  const templates=[
    `Tras años de conflicto, una ${ep} paz fue sellada entre ${civA} y ${civB}. ${context} Los anales recordarán este día.`,
    `Los negociadores de ${civA} y ${civB} se reunieron en terreno neutral. La ${ep} paz que firmaron costó más de lo que nadie admitirá jamás. ${context}`,
    `El silencio de los cañones llegó por fin. ${civA} y ${civB} acordaron una tregua ${ep}. ${context} Pero la desconfianza permanecería durante generaciones.`,
    `Exhaustos y desangrados, ${civA} y ${civB} eligieron la paz sobre el orgullo. ${context} Fue una decisión ${ep} que salvó a miles.`,
    `Los líderes de ${civA} y ${civB} se dieron la mano sobre las ruinas de lo que fue. ${context} Una paz ${ep}, construida sobre cenizas.`,
    `Cuando los últimos soldados depusieron las armas, ${civA} y ${civB} firmaron un acuerdo ${ep}. ${context} El mundo respiró aliviado.`,
  ];
  return _rndOf(templates);
}

function _narrateBuilding(builderName, structLabel, civName, context=''){
  const ep=_rndOf(_EPITHETS_CITY);
  const templates=[
    `Bajo el mando de ${builderName}, una ${ep} ${structLabel} emergió en el corazón de ${civName}. ${context}`,
    `${builderName} dedicó años de su vida a construir la ${ep} ${structLabel} que definiría a ${civName} para siempre. ${context}`,
    `Generaciones de artesanos trabajaron bajo la visión de ${builderName}. El resultado: una ${ep} ${structLabel} en ${civName} que desafía el tiempo. ${context}`,
    `Cuando la ${ep} ${structLabel} de ${civName} quedó terminada, ${builderName} miró su obra y supo que había cambiado el mundo. ${context}`,
  ];
  return _rndOf(templates);
}

function _narrateDisaster(type, place, victims, context=''){
  const openers={
    earthquake:[
      `La tierra se abrió bajo los pies de los habitantes de`,
      `El suelo tembló sin piedad en`,
      `Un rugido sordo precedió la catástrofe en`,
      `Sin previo aviso, el mundo se sacudió en`,
      `Las grietas se abrieron como heridas en la tierra de`,
    ],
    volcano:[
      `El cielo se tiñó de rojo cuando la montaña despertó cerca de`,
      `Las cenizas cubrieron el sol sobre`,
      `La montaña de fuego rugió y escupió su furia sobre`,
      `Nadie creyó que el volcán despertaría, hasta que lo hizo en`,
      `El fuego que dormía bajo la tierra reclamó su precio en`,
    ],
    plague:[
      `Una sombra invisible se extendió por`,
      `La muerte silenciosa llegó a`,
      `Nadie pudo escapar del azote que cayó sobre`,
      `Los enfermos llenaron las calles de`,
      `El miedo fue el primer síntoma que llegó a`,
    ],
    famine:[
      `El hambre desnudó su rostro en`,
      `Los campos se secaron y el hambre llegó a`,
      `La desesperación se instaló en`,
      `Los graneros vacíos anunciaron lo peor para`,
      `Cuando los niños empezaron a llorar de hambre en`,
    ],
    locusts:[
      `Una nube oscura devoró los campos de`,
      `Las langostas arrasaron las cosechas de`,
      `El zumbido ensordecedor llegó antes que la devastación a`,
    ],
  };
  const closers=[
    `${victims>0?`${victims} almas pagaron el precio.`:''} ${context} Quienes sobrevivieron nunca olvidaron.`,
    `${victims>0?`${victims} vidas se perdieron.`:''} ${context} La reconstrucción tardaría generaciones.`,
    `${context} El mundo siguió girando, indiferente al dolor.`,
    `${victims>0?`${victims} personas desaparecieron en un instante.`:''} ${context}`,
  ];
  const arr=openers[type]||openers.earthquake;
  return `${_rndOf(arr)} ${place}. ${_rndOf(closers)}`;
}

function _narrateDynasty(leaderName, civName, generation, context=''){
  const templates=[
    generation>=5
      ? `${civName} celebra ${generation} generaciones ininterrumpidas de liderazgo. ${leaderName} asciende al trono como heredero de una estirpe que ha moldeado el mundo. ${context}`
      : generation>=3
        ? `${leaderName} hereda el poder en ${civName}, continuando el linaje que su familia ha forjado con sangre y gloria. ${context}`
        : `Con la muerte del líder anterior, ${leaderName} toma las riendas de ${civName}. Una nueva era comienza. ${context}`,
    `El trono de ${civName} tiene un nuevo ocupante: ${leaderName}. Los que lo conocen dicen que es diferente. Los que no, pronto lo descubrirán. ${context}`,
    `${leaderName} no eligió ser líder de ${civName}. El destino lo eligió a él. ${context}`,
    `Cuando ${leaderName} tomó el poder en ${civName}, nadie sabía si sería recordado como héroe o como tirano. ${context}`,
  ];
  return _rndOf(templates);
}

function _narrateScience(civName, inventionName, context=''){
  const templates=[
    `Los sabios de ${civName} cambiaron el mundo para siempre al descubrir ${inventionName}. ${context} La humanidad nunca volvería a ser la misma.`,
    `Después de generaciones de estudio, ${civName} reveló al mundo ${inventionName}. ${context} Lo que parecía imposible se volvió inevitable.`,
    `Un destello de genialidad iluminó ${civName}: el descubrimiento de ${inventionName}. ${context} Los demás pueblos miraron con envidia y asombro.`,
    `Nadie en ${civName} sabía que ese día cambiaría la historia. Pero cuando descubrieron ${inventionName}, todo fue diferente. ${context}`,
    `${inventionName} nació en ${civName} de la mente de alguien que se negó a aceptar que las cosas no podían ser mejores. ${context}`,
    `El conocimiento acumulado durante siglos en ${civName} cristalizó en un solo momento: el nacimiento de ${inventionName}. ${context}`,
    `Cuando ${civName} presentó ${inventionName} al mundo, hubo quienes rieron. Luego hubo quienes copiaron. ${context}`,
  ];
  return _rndOf(templates);
}

function _narrateReligion(civName, religionName, context=''){
  const templates=[
    `En los templos de ${civName}, una nueva fe tomó forma: "${religionName}". Los fieles encontraron en ella respuestas a preguntas que habían atormentado a la humanidad desde sus orígenes. ${context}`,
    `"${religionName}" nació en ${civName} de la boca de un profeta que nadie escuchó al principio. Luego todos escucharon. ${context}`,
    `Los sacerdotes de ${civName} proclamaron "${religionName}" como la verdad que el mundo había estado esperando. ${context} La fe se extendió como fuego en paja seca.`,
    `En tiempos de incertidumbre, ${civName} encontró en "${religionName}" un ancla. ${context} La fe no da respuestas, pero da fuerza para seguir preguntando.`,
    `"${religionName}" no fue inventada en ${civName}. Fue descubierta. Al menos eso dicen sus fieles. ${context}`,
  ];
  return _rndOf(templates);
}

function _narrateRebellion(civName, rebelCount, context=''){
  const templates=[
    `La desigualdad acumulada durante generaciones estalló en ${civName}. ${rebelCount} almas oprimidas alzaron la voz y las armas, dispuestas a reescribir su destino. ${context}`,
    `${rebelCount} personas de ${civName} decidieron que ya era suficiente. El poder no se pide, se toma. ${context}`,
    `Los que nada tenían en ${civName} se levantaron contra los que todo tenían. ${rebelCount} rebeldes. Una sola causa. ${context}`,
    `La chispa de la rebelión llevaba años esperando en ${civName}. ${rebelCount} personas la encendieron. ${context} El fuego se extendió más rápido de lo que nadie esperaba.`,
    `"Basta" fue la palabra que unió a ${rebelCount} personas en ${civName}. Una palabra simple. Consecuencias enormes. ${context}`,
  ];
  return _rndOf(templates);
}

function _narrateEspionage(spyName, targetCiv, mission, success, context=''){
  if(!success){
    const failTemplates=[
      `${spyName} fue capturado en las sombras de ${targetCiv}. Su misión terminó en fracaso y humillación. ${context}`,
      `Las calles de ${targetCiv} guardaron el secreto de ${spyName} solo hasta que no pudieron más. Fue capturado. ${context}`,
      `${spyName} subestimó a los guardias de ${targetCiv}. Un error que le costaría todo. ${context}`,
    ];
    return _rndOf(failTemplates);
  }
  const missionText={robo_conocimiento:'robar los secretos más preciados',sabotaje:'destruir desde adentro',asesinato_lider:'eliminar al líder'};
  const successTemplates=[
    `En las sombras de ${targetCiv}, ${spyName} logró ${missionText[mission]||mission}. Nadie vio nada. Nadie supo nada. ${context}`,
    `${spyName} entró en ${targetCiv} como un fantasma y salió con lo que nadie debería haber podido obtener. ${context}`,
    `La misión de ${spyName} en ${targetCiv} fue perfecta. Demasiado perfecta para ser olvidada. ${context}`,
  ];
  return _rndOf(successTemplates);
}

function _narrateTrade(civA, civB, good, context=''){
  const templates=[
    `Las caravanas de ${civA} y ${civB} comenzaron a cruzar las tierras cargadas de ${good}. El comercio floreció y con él, la prosperidad de ambos pueblos. ${context}`,
    `${good} fue el puente que unió a ${civA} y ${civB}. Lo que empezó como intercambio se convirtió en amistad. ${context}`,
    `Los mercaderes de ${civA} llegaron a ${civB} con ${good} y se fueron con algo más valioso: confianza. ${context}`,
    `Cuando ${civA} y ${civB} abrieron sus rutas comerciales, el ${good} fue solo el comienzo. ${context} El mundo se hizo un poco más pequeño ese día.`,
  ];
  return _rndOf(templates);
}

// Public API — called from features.js and humans.js
function chronicleWar(civAName, civBName, context){
  addChronicle('war',`Guerra: ${civAName} vs ${civBName}`,_narrateWar(civAName,civBName,context||''),'⚔️');
}
function chroniclePeace(civAName, civBName, context){
  addChronicle('diplomacy',`Paz entre ${civAName} y ${civBName}`,_narratePeace(civAName,civBName,context||''),'🕊️');
}
function chronicleBuilding(builderName, structLabel, civName, context){
  addChronicle('wonder',`${structLabel} en ${civName}`,_narrateBuilding(builderName,structLabel,civName,context||''),'🏗');
}
function chronicleDisaster(type, place, victims, context){
  const icons={earthquake:'🌋',volcano:'🌋',plague:'🦠',famine:'🍂',locusts:'🦗'};
  const titles={earthquake:'Terremoto',volcano:'Erupción Volcánica',plague:'Epidemia',famine:'Hambruna',locusts:'Plaga de Langostas'};
  addChronicle('disaster',`${titles[type]||type} en ${place}`,_narrateDisaster(type,place,victims,context||''),icons[type]||'💥');
}
function chronicleDynasty(leaderName, civName, generation, context){
  addChronicle('dynasty',`${leaderName} lidera ${civName}`,_narrateDynasty(leaderName,civName,generation,context||''),'👑');
}
function chronicleScience(civName, inventionName, context){
  addChronicle('science',`${civName} descubre ${inventionName}`,_narrateScience(civName,inventionName,context||''),'🔭');
}
function chronicleReligion(civName, religionName, context){
  addChronicle('religion',`Nace "${religionName}" en ${civName}`,_narrateReligion(civName,religionName,context||''),'🛕');
}
function chronicleRebellion(civName, rebelCount, context){
  addChronicle('rebellion',`Rebelión en ${civName}`,_narrateRebellion(civName,rebelCount,context||''),'✊');
}
function chronicleEspionage(spyName, targetCiv, mission, success, context){
  addChronicle('espionage',`${success?'Espionaje exitoso':'Espía capturado'} en ${targetCiv}`,_narrateEspionage(spyName,targetCiv,mission,success,context||''),'🕵️');
}
function chronicleTrade(civAName, civBName, good, context){
  addChronicle('trade',`Ruta comercial: ${civAName} ↔ ${civBName}`,_narrateTrade(civAName,civBName,good,context||''),'🛤️');
}

// ── Spatial grid ──────────────────────────────────────────────────────────────
const SPATIAL_CELL=16;
let spatialGrid=null;
function _spatialKey(tx,ty){return(Math.floor(tx/SPATIAL_CELL))|((Math.floor(ty/SPATIAL_CELL))<<16);}
function initSpatialGrid(){spatialGrid=new Map();}
function _spatialAdd(h){const k=_spatialKey(h.tx,h.ty);if(!spatialGrid.has(k))spatialGrid.set(k,new Set());spatialGrid.get(k).add(h);h._spatialKey=k;}
function _spatialRemove(h){if(h._spatialKey===undefined)return;const s=spatialGrid.get(h._spatialKey);if(s)s.delete(h);}
function _spatialUpdate(h){const k=_spatialKey(h.tx,h.ty);if(k===h._spatialKey)return;_spatialRemove(h);_spatialAdd(h);}
// Reusable result buffer for _spatialQuery — avoids array allocation per call
const _sqResults=[];
function _spatialQuery(tx,ty,radius,excludeId){
  _sqResults.length=0;
  const r2=radius*radius;
  const cx0=Math.floor((tx-radius)/SPATIAL_CELL),cx1=Math.floor((tx+radius)/SPATIAL_CELL);
  const cy0=Math.floor((ty-radius)/SPATIAL_CELL),cy1=Math.floor((ty+radius)/SPATIAL_CELL);
  for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){
    const cell=spatialGrid.get(cx|(cy<<16));
    if(!cell)continue;
    for(const h of cell){
      if(h.id===excludeId||!h.alive)continue;
      const dx=h.tx-tx,dy=h.ty-ty;
      if(dx*dx+dy*dy<=r2)_sqResults.push(h);
    }
  }
  return _sqResults;
}

// ── Neural Brain ──────────────────────────────────────────────────────────────
class NeuralBrain{
  constructor(rng){
    this.iSize=12;this.hSize=6;this.oSize=10;
    this.wIH=new Float32Array(this.iSize*this.hSize).map(()=>rng()*2-1);
    this.wHO=new Float32Array(this.hSize*this.oSize).map(()=>rng()*2-1);
    this.bH=new Float32Array(this.hSize);
    this.bO=new Float32Array(this.oSize);
    this.lr=0.10;
    this.memory=[];
    this.epsilon=0.35;
    // Reusable buffers — avoid Float32Array allocation every forward()
    this._h=new Float32Array(this.hSize);
    this._raw=new Float32Array(this.oSize);
    this._ex=new Float32Array(this.oSize);
  }
  _relu(x){return x>0?x:x*0.05;}
  forward(inp){
    const h=this._h, raw=this._raw, ex=this._ex;
    for(let i=0;i<this.hSize;i++){
      let s=this.bH[i];
      for(let j=0;j<this.iSize;j++)s+=inp[j]*this.wIH[j*this.hSize+i];
      h[i]=s>0?s:s*0.05;
    }
    for(let o=0;o<this.oSize;o++){
      let s=this.bO[o];
      for(let i=0;i<this.hSize;i++)s+=h[i]*this.wHO[i*this.oSize+o];
      raw[o]=s;
    }
    let mx=raw[0];for(let i=1;i<this.oSize;i++)if(raw[i]>mx)mx=raw[i];
    let sm=0;
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
    // Skip trivial updates — saves CPU on large populations
    if(Math.abs(reward)<0.002)return;
    this.memory.push({inp:Float32Array.from(inp),actionIdx,reward});
    if(this.memory.length>4)this.memory.shift(); // 8→4 saves RAM
    // Only replay last 2 memories for speed
    const start=Math.max(0,this.memory.length-2);
    for(let m=start;m<this.memory.length;m++){
      const e=this.memory[m];
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
  const mix=(a,b)=>{
    const out=new Float32Array(a.length);
    for(let i=0;i<a.length;i++){
      const base=bB?(rng()<0.5?a[i]:b[i]):a[i];
      out[i]=rng()<mutR?base+(rng()*2-1)*mutS:base;
    }
    return out;
  };
  c.wIH=mix(bA.wIH,bB?.wIH);c.wHO=mix(bA.wHO,bB?.wHO);
  c.bH=mix(bA.bH,bB?.bH);c.bO=mix(bA.bO,bB?.bO);
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

// Lookup table for knowledge curve: kCurve = 1 + (k/500)^1.6 * 0.4, k in [0,5000]
// 101 entries covering k=0..5000 in steps of 50
const _kCurveLUT=(()=>{
  const t=new Float32Array(101);
  for(let i=0;i<=100;i++)t[i]=1+Math.pow(i*0.1,1.6)*0.4; // i*0.1 = k/500 (0..10 but capped at 10)
  return t;
})();
function _kCurve(k){
  const idx=Math.min(100,Math.floor(Math.min(k,5000)/50));
  return _kCurveLUT[idx];
}
// Global intelligence modifier — oscillates to create dark ages and renaissances
let _intelPhase=0;
let _intelModifier=1.2; // start higher — societies are more capable from the start
let _userIntelBias=0;   // user-controlled offset via slider (-0.8 to +0.8)
function _tickIntelligenceCurve(yearsElapsed){
  _intelPhase+=yearsElapsed*0.0008;
  // Slow sine wave with noise — creates golden ages and dark ages
  const base=Math.sin(_intelPhase)*0.3+Math.sin(_intelPhase*2.3)*0.1+Math.sin(_intelPhase*0.7)*0.15;
  // Floor raised to 0.85 — no more brutal dark ages that kill progress
  _intelModifier=Math.max(0.4,Math.min(2.5,1.2+base+_userIntelBias));
}

// ── Population control ────────────────────────────────────────────────────────
// Dynamic caps based on available resources — scale exponentially with era
let _popCapsCache={soft:60,hard:140};
let _popCapsYear=-99;
function _getPopCaps(){
  if(year-_popCapsYear<5)return _popCapsCache;
  _popCapsYear=year;
  let farmCount=0,granaryCount=0,aqueductCount=0,marketCount=0,harborCount=0,palaceCount=0,universityCount=0,factoryCount=0,railwayCount=0,powerplantCount=0;
  for(const s of structures){
    if(s.type==='farm')farmCount++;
    else if(s.type==='granary')granaryCount++;
    else if(s.type==='aqueduct')aqueductCount++;
    else if(s.type==='market')marketCount++;
    else if(s.type==='harbor')harborCount++;
    else if(s.type==='palace')palaceCount++;
    else if(s.type==='university')universityCount++;
    else if(s.type==='factory')factoryCount++;
    else if(s.type==='railway')railwayCount++;
    else if(s.type==='powerplant')powerplantCount++;
  }
  const infraBonus=farmCount*5+granaryCount*15+aqueductCount*25+marketCount*8+harborCount*20+palaceCount*60+universityCount*40+factoryCount*50+railwayCount*30+powerplantCount*80;
  const eraName=getEra(year).name;
  const eraMult={
    'Era Primitiva':1,'Era de Piedra':1.5,'Era del Bronce':2.5,'Era del Hierro':4,
    'Era Clásica':7,'Era Medieval':12,'Renacimiento':20,'Era Industrial':40,
    'Era Moderna':80,'Era Espacial':160,
  }[eraName]||1;
  // Cap duro por era — permite crecimiento natural sin explotar
  const eraHardCap={
    'Era Primitiva':60,'Era de Piedra':120,'Era del Bronce':220,'Era del Hierro':400,
    'Era Clásica':700,'Era Medieval':1100,'Renacimiento':1600,'Era Industrial':2500,
    'Era Moderna':3800,'Era Espacial':4500,
  }[eraName]||60;
  const soft=Math.min(eraHardCap, Math.floor((40+infraBonus)*eraMult));
  const hard=Math.min(4500, Math.min(eraHardCap, Math.floor(soft*1.5)));
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
// ── Weapon tiers — expanded with era-appropriate weapons ─────────────────────
const WEAPON_TIERS=['Puños','Lanza de Madera','Hacha de Piedra','Espada de Bronce','Espada de Hierro','Acero y Ballesta','Pólvora y Mosquete','Rifle y Artillería','Ametralladora','Misil Guiado','Arma Láser'];
const WEAPON_ICONS=['👊','🏹','🪓','⚔️','🗡️','🏹','💣','🔫','💥','🚀','⚡'];
const WEAPON_ERA_MIN_TECH=[0,0,0,1,2,3,4,5,6,7,8]; // min techLevel to use

// ── Army formation types by era ───────────────────────────────────────────────
// Formations define how soldiers position relative to their rally point
const FORMATION_TYPES={
  0:{name:'Horda',       icon:'👥', desc:'Sin orden, atacan en masa'},
  1:{name:'Falange',     icon:'🛡️', desc:'Línea compacta de escudos'},
  2:{name:'Legión',      icon:'⚔️', desc:'Cuadrícula romana disciplinada'},
  3:{name:'Caballería',  icon:'🐎', desc:'Flanqueo rápido a caballo'},
  4:{name:'Tercio',      icon:'🔫', desc:'Piqueros y arcabuceros'},
  5:{name:'Línea',       icon:'🎖️', desc:'Líneas de fusileros napoleónicas'},
  6:{name:'Trinchera',   icon:'🪖', desc:'Defensa en trincheras'},
  7:{name:'Blindado',    icon:'🚗', desc:'Avance mecanizado'},
  8:{name:'Drones',      icon:'🤖', desc:'Enjambre de drones autónomos'},
};
function _getFormationType(techLevel){
  if(techLevel>=8)return FORMATION_TYPES[8];
  if(techLevel>=7)return FORMATION_TYPES[7];
  if(techLevel>=6)return FORMATION_TYPES[6];
  if(techLevel>=5)return FORMATION_TYPES[5];
  if(techLevel>=4)return FORMATION_TYPES[4];
  if(techLevel>=3)return FORMATION_TYPES[3];
  if(techLevel>=2)return FORMATION_TYPES[2];
  if(techLevel>=1)return FORMATION_TYPES[1];
  return FORMATION_TYPES[0];
}

// ── Army rally points — per civ, soldiers converge here during war ────────────
const _armyRallyPoints=new Map(); // civId → {tx,ty,formationIdx}
let _armyFormationTimer=0;

function tickArmyFormations(yearsElapsed){
  _armyFormationTimer+=yearsElapsed;
  if(_armyFormationTimer<5)return;
  _armyFormationTimer=0;
  for(const [,civ] of civilizations){
    if(civ.population===0||civ.atWarWith.size===0)continue;
    // Find or update rally point near barracks/citadel or leader
    let rallyTx=-1,rallyTy=-1;
    // Prefer barracks location
    for(const s of structures){
      if((s.type==='barracks'||s.type==='citadel'||s.type==='watchtower')&&s.civId===civ.id){
        rallyTx=s.tx;rallyTy=s.ty;break;
      }
    }
    // Fallback: leader position
    if(rallyTx<0){
      const leader=_hById(civ.leaderId);
      if(leader&&leader.alive){rallyTx=leader.tx;rallyTy=leader.ty;}
    }
    if(rallyTx<0)continue;
    const techLevel=civ.techLevel||0;
    _armyRallyPoints.set(civ.id,{tx:rallyTx,ty:rallyTy,techLevel});
    // Position soldiers in formation around rally point
    const soldiers=[];
    for(const id of civ.members){
      const h=_hById(id);
      if(h&&h.alive&&h.isSoldier)soldiers.push(h);
    }
    if(soldiers.length===0)continue;
    // Upgrade weapon tier based on civ tech
    const weaponTier=Math.min(WEAPON_TIERS.length-1,techLevel+1);
    // Formation offsets — different patterns per era
    for(let i=0;i<soldiers.length;i++){
      const s=soldiers[i];
      if(s.weaponTier<weaponTier)s.weaponTier=weaponTier;
      // Only reposition if not actively fighting
      if(s._warTimer>0)continue;
      let offX=0,offY=0;
      if(techLevel<=1){
        // Horde: random cluster
        offX=Math.floor(Math.random()*10-5);
        offY=Math.floor(Math.random()*10-5);
      } else if(techLevel===2){
        // Phalanx: single line
        offX=i-Math.floor(soldiers.length/2);
        offY=0;
      } else if(techLevel===3){
        // Legion: grid
        offX=(i%4)-2;
        offY=Math.floor(i/4)-1;
      } else if(techLevel===4){
        // Cavalry: V-shape flanks
        const side=i%2===0?1:-1;
        offX=side*(2+Math.floor(i/2));
        offY=-Math.floor(i/2);
      } else if(techLevel===5){
        // Tercio: front line + rear support
        offX=(i%6)-3;
        offY=i<6?0:2;
      } else if(techLevel>=6){
        // Modern: spread formation
        offX=(i%5)-2;
        offY=Math.floor(i/5)*3;
      }
      const destTx=Math.max(0,Math.min(WORLD_W-1,rallyTx+offX));
      const destTy=Math.max(0,Math.min(WORLD_H-1,rallyTy+offY));
      if(Math.hypot(s.tx-destTx,s.ty-destTy)>8){
        s._setDest(destTx,destTy);
        s.action=ACTIONS.PATROL;
      }
    }
  }
}

class Human{
  constructor(tx,ty,rng,gender,parentA,parentB){
    this.id=humanIdCounter++;
    this.gender=gender||(rng()<0.5?'F':'M');
    this.name=randomName(rng,this.gender);
    this.tx=tx;this.ty=ty;
    this.px=tx*TILE+TILE/2;this.py=ty*TILE+TILE/2;
    this.destPx=this.px;this.destPy=this.py;
    this.tilesPerYear=6; // base speed — upgraded by transport tier

    this.age=parentA?0:18+Math.floor(rng()*8);
    this.health=100;this.hunger=95;this.energy=100;
    this.alive=true;this.action=ACTIONS.IDLE;
    this.target=null;
    this.inventory={food:parentA?12:20,wood:parentA?4:12,stone:parentA?2:6};
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
    this._buildUrge=parentA?0.3:0.5; // founders start ready to build immediately, children start at 0.3
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
    // Transport tier: 0=foot, 1=boat, 2=carriage, 3=train, 4=car, 5=plane
    this.transportTier=0;
    this._onWater=false; // currently sailing
    // Dynasty tracking
    this.parentIds=parentA?[parentA.id,parentB?parentB.id:parentA.id]:null;
    // Nearby cache — avoid _spatialQuery every tick per human
    this._nearbyCached=[];
    this._nearbyYear=-999;
  }

  addLog(msg){this.log.unshift(`Año ${year}: ${msg}`);if(this.log.length>4)this.log.pop();}

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
    if(this.age>maxAge&&!(typeof speedIndex!=='undefined'&&speedIndex===5)){this._die('vejez');return;}

    // Disease
    if(this.sick){
      this.sickTimer-=yearsElapsed;
      this.health=Math.max(0,this.health-this.sickType.damage*yearsElapsed);
      if(this.sickTimer<=0||this.health<=0){
        const immortal=typeof speedIndex!=='undefined'&&speedIndex===5;
        if(this.health<=0&&!immortal){this._die(this.sickType.name);return;}
        this.sick=false;this.immunity.add(this.sickType.name);
        this.health=Math.max(1,this.health);
        this.addLog(`Se recuperó de ${this.sickType.name}`);this.sickType=null;
      }
    } else {
      for(const o of activeOutbreaks){
        if(this.immunity.has(o.type.name))continue;
        const dx=this.tx-o.tx,dy=this.ty-o.ty;
        if(dx*dx+dy*dy>o.radius*o.radius)continue;
        const resistance=Math.min(0.92,this.knowledge*0.00015+(this.traits.intellect||50)*0.003);
        if(this._rng()<o.type.spread*0.03*yearsElapsed*(1-resistance)){
          this.sick=true;this.sickType=o.type;
          this.sickTimer=o.type.duration*(0.8+this._rng()*0.4)*(1-resistance*0.5);
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
      const immortal=typeof speedIndex!=='undefined'&&speedIndex===5;
      if(this.health<=0&&!immortal){this._die('hambre');return;}
      if(immortal) this.health=Math.max(1,this.health);
    } else if(!this.sick){
      this.health=Math.min(100,this.health+yearsElapsed*6);
    }

    // Build up drives — tasa de reproducción calibrada
    // Objetivo: ~1 hijo cada 3-4 años en era primitiva (mortalidad alta compensa)
    // Sube a ~1 cada 2 años en eras avanzadas (más recursos, medicina)
    if(this._canReproduce&&this.age>=16&&this.age<=50&&this.reproTimer<=0){
      const popCap = typeof speedIndex!=='undefined'&&speedIndex===5&&_cachedAlive.length>=4500;
      if(!popCap){
        const kFactor = Math.min(1, this.knowledge / 5000);
        const baseRate = 0.18 + kFactor * 0.22; // 0.18/año primitivo → 0.40/año avanzado
        // Bonus si la población está muy baja (instinto de supervivencia)
        const popBonus = _cachedAlive.length < 20 ? 0.15 : 0;
        this._reproUrge=Math.min(1,this._reproUrge+yearsElapsed*(baseRate+popBonus));
      }
    }
    this._exploreUrge=Math.min(1,this._exploreUrge+yearsElapsed*0.10);
    // Build urge scales with knowledge — advanced civs build constantly
    const buildRate=0.20+Math.min(0.5,this.knowledge*0.0012);
    this._buildUrge=Math.min(1,this._buildUrge+yearsElapsed*buildRate);
    // Flatten urge also scales with knowledge
    const flattenRate=0.06+Math.min(0.18,this.knowledge*0.0006);
    this._flattenUrge=Math.min(1,this._flattenUrge+yearsElapsed*flattenRate);
    if(getSocialPhase()==='division')
      this._razeUrge=Math.min(1,this._razeUrge+yearsElapsed*0.04);

    this.leaderScore=this.traits.charisma*0.4+this.traits.intellect*0.3+this.knowledge*0.2+this.children*3+this.age*0.05+this.kills*2;

    // Intelligence curve affects knowledge growth
    const intelMult=_intelModifier*this._intelVariance;
    this.brain.epsilon=Math.max(0.04,0.38-Math.min(this.knowledge,2000)*0.00015/intelMult);

    // Knowledge grows exponentially — slow at first, explosive at high levels
    // Base rate scales with intellect, then multiplied by a curve that accelerates with existing knowledge
    const kGrowthBase=0.10+this.traits.intellect*0.005;
    this.knowledge=Math.min(99999,this.knowledge+yearsElapsed*kGrowthBase*intelMult*_kCurve(this.knowledge));

    this.wealth=this.inventory.food+this.inventory.wood*2+this.inventory.stone*1.5;

    // Transport tier upgrade — based on knowledge, using 10-tier table
    const targetTransport=
      this.knowledge>130000?9:  // teletransporte — Era Espacial tardía
      this.knowledge>110000?8:  // nave orbital — Era Espacial
      this.knowledge>90000?7:   // cohete — Era Espacial
      this.knowledge>65000?6:   // helicóptero — Era Moderna tardía
      this.knowledge>45000?5:   // avión — Era Moderna
      this.knowledge>28000?4:   // automóvil — Era Industrial tardía
      this.knowledge>18000?3:   // tren — Era Industrial
      this.knowledge>2000?2:    // carruaje — Era Clásica
      (this.knowledge>500&&_unlockedTypes.has('shipyard'))?1:0; // bote — Era del Hierro
    if(targetTransport>this.transportTier){
      this.transportTier=targetTransport;
      const td=TRANSPORT_TIERS[targetTransport];
      this.tilesPerYear=td.speed;
      if(targetTransport>=3)addWorldEvent(`${td.icon} ${this.name.split(' ')[0]} viaja ${td.label}`);
    }

    if(getSocialPhase()==='division'){
      this.ideology=Math.max(0,Math.min(1,this.ideology+(this._rng()*0.04-0.02)));
    }
    if(getSocialPhase()==='division'&&this._warTimer>0)this._warTimer-=yearsElapsed;

    // Hard survival overrides
    if(this.sick&&this.health<35){this._doHeal();return;}
    if(this.hunger<10||this.health<8){this._seekFoodNow();return;}
    if(this.energy<5){this._doSleep();return;}

    // Nearby cache — refresh every 3 game-years to avoid per-tick spatial query
    if(year-this._nearbyYear>=3){
      const _fresh=_spatialQuery(this.tx,this.ty,16,this.id);
      // Copy into own array (shared _sqResults gets overwritten)
      this._nearbyCached.length=0;
      for(let _ci=0;_ci<_fresh.length;_ci++)this._nearbyCached.push(_fresh[_ci]);
      this._nearbyYear=year;
    }
    const nearby=this._nearbyCached;
    // Count crowding inline — avoid filter() allocation
    let crowding=0;
    for(let _i=0;_i<nearby.length;_i++){const _n=nearby[_i];const _dx=_n.tx-this.tx,_dy=_n.ty-this.ty;if(_dx*_dx+_dy*_dy<36)crowding++;}

    if(this.hunger<25){this._seekFoodNow();return;}
    if(this.energy<15){this._doSleep();return;}
    // Only disperse if truly overcrowded — allow dense city building
    if(crowding>=10){this._disperseFrom(nearby);return;}

    // ── Instinto de supervivencia global ─────────────────────────────────────
    // Si la humanidad está en peligro crítico, priorizar comida y reproducción
    const totalAlive = _cachedAlive.length;
    const inCrisis = totalAlive < 20;
    if(inCrisis){
      // Buscar comida ante todo
      if(this.hunger<70){this._seekFoodNow();return;}
      // Construir granero/granja si no hay suficiente comida
      if(this._buildUrge>0.1&&this.hunger>50){
        const hasFarm=structures.some(s=>s.civId===this.civId&&(s.type==='farm'||s.type==='granary'));
        if(!hasFarm){this._buildUrge=0;this._doBuild();return;}
      }
      // Reproducirse si hay pareja disponible (en crisis se relaja un poco el umbral)
      if(this._reproUrge>0.5&&this.hunger>45&&this.energy>25&&!this.sick){
        this._tryReproduce(nearby);return;
      }
    }

    // Biological imperatives — umbral más alto: necesitan estar bien alimentados
    if(this._reproUrge>(_cachedAlive.length<15?0.55:0.75)&&this.hunger>55&&this.energy>45&&!this.sick){
      this._tryReproduce(nearby);return;
    }
    // Repair crumbling structures — highest priority after survival
    if(this.hunger>30&&this.energy>20&&(this.inventory.wood>=1||this.inventory.stone>=1)){
      if(this._doRepair())return;
    }
    // Build fires much more aggressively — lower threshold, lower resource requirement
    if(this._buildUrge>0.30&&this.hunger>35&&this.energy>25&&
       (this.inventory.wood>=2||this.inventory.stone>=2)){
      this._buildUrge=0;this._doBuild();return;
    }
    // Flatten terrain for city building
    if(this._flattenUrge>0.6&&this.knowledge>80&&this.hunger>50){
      this._flattenUrge=0;this._doFlattenTerrain();return;
    }
    // Land reclamation — fill water to expand territory when hemmed in by sea
    if(this._flattenUrge>0.3&&this.knowledge>200&&this.hunger>45&&this._nearWater()){
      this._doLandReclamation();return;
    }
    // Raze enemy structures
    if(this._razeUrge>0.7&&this.aggression>0.4&&getSocialPhase()==='division'){
      this._razeUrge=0;this._doRaze();return;
    }
    // Island exploration — humans with boats sail to new lands
    if(this.transportTier>=1&&this._exploreUrge>0.9&&this.hunger>50&&this._nearWater()){
      this._exploreUrge=0;this._doSailToIsland();return;
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
      // Skip terrain mod at high speed for most humans — only 1 in 4
      if(yearsElapsed<2||this._rng()<0.25){
        this._modifyTerrain();
      }
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
        this.knowledge=Math.min(99999,this.knowledge+(other.knowledge-this.knowledge)*0.25*_intelModifier); // faster knowledge transfer
      if(!this.civId&&other.civId&&this._rng()<0.5)this._joinCiv(other.civId); // more eager to join civs
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

  // ── Reclaim water tiles to expand territory ───────────────────────────────
  _doLandReclamation(){
    if(this.knowledge<200||this.hunger<40||this.inventory.stone<3)return;
    // Count water tiles in a radius around settle point — only bother if crowded by water
    const checkR=12;
    let waterCount=0,landCount=0;
    for(let dy=-checkR;dy<=checkR;dy++)for(let dx=-checkR;dx<=checkR;dx++){
      if(dx*dx+dy*dy>checkR*checkR)continue;
      const cell=getCell(this._settleTx+dx,this._settleTy+dy);
      if(!cell)continue;
      if(['sea','shore','swamp'].includes(cell.biome))waterCount++;
      else if(isLand(this._settleTx+dx,this._settleTy+dy))landCount++;
    }
    // Only reclaim if water is significantly blocking expansion (>30% of area is water)
    const total=waterCount+landCount;
    if(total===0||waterCount/total<0.3)return;

    // Find the best water tile to fill — prefer tiles adjacent to existing land/structures
    const r=Math.min(16,6+Math.floor(this.knowledge/800));
    let bestTx=-1,bestTy=-1,bestScore=-1;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(dx*dx+dy*dy>r*r)continue;
      const tx=this._settleTx+dx,ty=this._settleTy+dy;
      const cell=getCell(tx,ty);
      if(!cell||cell.biome==='deep_sea')continue;
      if(!['sea','shore','swamp'].includes(cell.biome))continue;
      // Score: prefer tiles adjacent to land (especially with structures)
      let score=0;
      for(let ay=-1;ay<=1;ay++)for(let ax=-1;ax<=1;ax++){
        if(ax===0&&ay===0)continue;
        if(isLand(tx+ax,ty+ay))score+=2;
        if(structureGrid&&structureGrid[Math.max(0,Math.min(WORLD_H-1,ty+ay))*WORLD_W+Math.max(0,Math.min(WORLD_W-1,tx+ax))])score+=3;
      }
      // Prefer closer tiles
      score-=Math.hypot(dx,dy)*0.1;
      if(score>bestScore){bestScore=score;bestTx=tx;bestTy=ty;}
    }
    if(bestTx<0)return;

    // Fill it — costs stone
    if(reclaimLand(bestTx,bestTy)){
      this.inventory.stone=Math.max(0,this.inventory.stone-2);
      this.knowledge=Math.min(99999,this.knowledge+1*_intelModifier);
      this.action=ACTIONS.BUILD;
      if(typeof markTerritoryDirty!=='undefined')markTerritoryDirty();
      // Occasionally log a notable reclamation
      if(this._rng()<0.05)
        addWorldEvent(`🌊➡️🌿 ${this.name.split(' ')[0]} rellenó el mar para expandir ${civilizations.get(this.civId)?.name||'su ciudad'}`);
    }
  }
  _doRaze(){
    if(this.hunger<30||this.health<30)return;
    const myCiv=this.civId!=null?civilizations.get(this.civId):null;
    if(!myCiv)return;
    if(!structureGrid)return;
    // Find nearby enemy structure using grid — O(radius²) not O(all structures)
    let target=null,bestD=Infinity;
    const r=20;
    const x0=Math.max(0,this.tx-r),x1=Math.min(WORLD_W-1,this.tx+r);
    const y0=Math.max(0,this.ty-r),y1=Math.min(WORLD_H-1,this.ty+r);
    for(let ty=y0;ty<=y1&&!target;ty++)for(let tx=x0;tx<=x1&&!target;tx++){
      const s=structureGrid[ty*WORLD_W+tx];
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
      if(idx>=0){structures.splice(idx,1);structureGrid[target.ty*WORLD_W+target.tx]=null;}
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
      if(enemy.health<=0){
        this.kills++;
        // Legendary warrior milestone
        if(this.kills===10){
          const civName=this.civId!=null?(civilizations.get(this.civId)?.name||'los sin nombre'):'los sin nombre';
          addChronicle('war',`${this.name.split(' ')[0]}, el Implacable`,`Diez vidas segadas por una sola mano. ${this.name.split(' ')[0]}, guerrero de ${civName}, cruzó el umbral que separa al soldado de la leyenda. Los enemigos pronuncian su nombre en voz baja. Sus propios compañeros lo miran con una mezcla de admiración y miedo.`,'⚔️');
        } else if(this.kills===25){
          const civName=this.civId!=null?(civilizations.get(this.civId)?.name||'los sin nombre'):'los sin nombre';
          addChronicle('war',`${this.name.split(' ')[0]}: 25 victorias en combate`,`Veinticinco enemigos caídos. ${this.name.split(' ')[0]} de ${civName} se ha convertido en una fuerza de la naturaleza. Los bardos ya cantan sus hazañas. Los niños imitan sus movimientos. Los enemigos rezan para no cruzarse en su camino.`,'🗡️');
        }
        if(typeof registerCombat!=='undefined') registerCombat(enemy.tx,enemy.ty,true);
        enemy._die('combate');
      } else {
        if(typeof registerCombat!=='undefined') registerCombat(this.tx,this.ty,false);
      }
    } else {
      const dmg=3+Math.floor(this._rng()*6);
      this.health=Math.max(0,this.health-dmg);
      this._warFlash=3;
      if(typeof registerCombat!=='undefined') registerCombat(this.tx,this.ty,false);
    }
    this._warTimer=3+Math.floor(this._rng()*4);
    this.action=ACTIONS.LEAD;
  }

  _modifyTerrain(){
    // Radius scales with knowledge but capped lower for perf
    const r=Math.min(5, 2+Math.floor(this.knowledge/1000));
    const changed=[];
    outer:for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const tx=this._settleTx+dx,ty=this._settleTy+dy;
      const cell=getCell(tx,ty);
      if(!cell)continue;
      if(isLand(tx,ty)&&['forest','dense_forest','jungle','rainforest'].includes(cell.biome)){
        if(this._rng()<0.12){
          modifyTerrain(tx,ty,'grass');
          this.inventory.wood+=3;
          this.knowledge=Math.min(this.knowledge+0.3,9999);
          changed.push({tx,ty});
          if(changed.length>=2)break outer;
        }
      } else if(isLand(tx,ty)&&['dry_grass','desert','savanna'].includes(cell.biome)){
        const nearFarm=this._findNearbyStructure('farm',6);
        if(nearFarm&&this._rng()<0.1){
          modifyTerrain(tx,ty,'grass');
          this.knowledge=Math.min(this.knowledge+0.2,9999);
          changed.push({tx,ty});
          if(changed.length>=2)break outer;
        }
      } else if(this.knowledge>200&&['shore','swamp','sea'].includes(cell.biome)){
        let hasNearStruct=false;
        for(let sy2=Math.max(0,ty-3);sy2<=Math.min(WORLD_H-1,ty+3)&&!hasNearStruct;sy2++){
          for(let sx2=Math.max(0,tx-3);sx2<=Math.min(WORLD_W-1,tx+3)&&!hasNearStruct;sx2++){
            const ns=structureGrid[sy2*WORLD_W+sx2];
            if(ns&&ns.civId===this.civId)hasNearStruct=true;
          }
        }
        if(hasNearStruct&&this._rng()<0.08){
          reclaimLand(tx,ty);
          changed.push({tx,ty});
          if(changed.length>=2)break outer;
        }
      }
    }
    if(changed.length>0&&typeof markTerritoryDirty!=='undefined')markTerritoryDirty();
  }

  _doBuild(){
    if(this.hunger<30||this.energy<20){this.action=ACTIONS.IDLE;return;}
    const needsWood=this.inventory.wood<2;
    const needsStone=this.inventory.stone<2;
    if(needsWood&&needsStone){this.action=ACTIONS.GATHER;return;}

    const civ=this.civId!=null?civilizations.get(this.civId):null;

    // ── Establish or sync to civilization city center ─────────────────────
    if(civ){
      if(!civ.cityCenter){
        civ.cityCenter={tx:this._settleTx,ty:this._settleTy};
      }
      this._settleTx=civ.cityCenter.tx;
      this._settleTy=civ.cityCenter.ty;
    }

    const cx=this._settleTx, cy=this._settleTy;

    // ── Flatten terrain around city center before building ────────────────
    if(this.knowledge>=40){
      const flatR=Math.min(8,2+Math.floor(this.knowledge/300));
      let flattened=0;
      for(let dy=-flatR;dy<=flatR&&flattened<3;dy++){
        for(let dx=-flatR;dx<=flatR&&flattened<3;dx++){
          if(dx*dx+dy*dy>flatR*flatR)continue;
          const ftx=cx+dx,fty=cy+dy;
          if(flattenTerrain(ftx,fty)){flattened++;continue;}
          const fc=getCell(ftx,fty);
          if(fc&&isLand(ftx,fty)&&['forest','dense_forest','jungle','rainforest'].includes(fc.biome)){
            if(this._rng()<0.2){modifyTerrain(ftx,fty,'grass');this.inventory.wood+=2;flattened++;}
          }
        }
      }
      if(flattened>0&&typeof markTerritoryDirty!=='undefined')markTerritoryDirty();
    }

    // ── Pick structure type ───────────────────────────────────────────────
    // Count existing structures for this civ (used for proportional caps)
    const civPop = civ ? Math.max(1, civ.population) : 1;
    const civCount = (t) => { let n=0; for(const s of structures){ if(s.civId===this.civId&&s.type===t) n++; } return n; };

    // Proportional caps: max count relative to population
    // Returns true if we're already at or above the cap for this type
    const atCap = (t, perPop, absMax) => {
      const cap = Math.max(1, Math.min(absMax, Math.floor(civPop * perPop)));
      return civCount(t) >= cap;
    };

    // Housing: demolish old low-level huts/camps when knowledge has advanced significantly
    if(civ){
      let avgK=0,cnt=0;
      for(const id of civ.members){const h=_hById(id);if(h&&h.alive){avgK+=h.knowledge;cnt++;}}
      avgK=cnt>0?avgK/cnt:0;
      let targetLevel=0;
      for(const def of HOUSING_LEVELS){if(avgK>=def.minK)targetLevel=def.level;}
      // Always demolish camps once past primitive era (avgK > 50)
      if(avgK>50&&structureGrid){
        for(let i=structures.length-1;i>=0;i--){
          const s=structures[i];
          if(s.civId!==this.civId||s.type!=='camp')continue;
          structureGrid[s.ty*WORLD_W+s.tx]=null;
          structures.splice(i,1);
          if(typeof markCityGlowDirty!=='undefined')markCityGlowDirty();
          break;
        }
      }
      // Demolish huts that are 2+ levels behind the current target (was 3+)
      if(targetLevel>=2&&structureGrid){
        for(let i=structures.length-1;i>=0;i--){
          const s=structures[i];
          if(s.civId!==this.civId)continue;
          if(s.type!=='hut')continue;
          const sl=s.housingLevel||0;
          if(sl<=targetLevel-2&&Math.random()<0.05){ // 5% chance (was 2%)
            structureGrid[s.ty*WORLD_W+s.tx]=null;
            structures.splice(i,1);
            if(typeof markCityGlowDirty!=='undefined')markCityGlowDirty();
            break;
          }
        }
      }
    }

    let type='camp';
    // Once knowledge is sufficient, never build camps — gather instead
    const _noCamp = this.knowledge >= 30;

    // ── Unique / very rare structures (1 per civ) ─────────────────────────
    if(_unlockedTypes.has('spaceport')&&this.knowledge>110000&&this.inventory.wood>=30&&this.inventory.stone>=80&&this.isLeader&&civCount('spaceport')<1)type='spaceport';
    else if(_unlockedTypes.has('arcology')&&this.knowledge>75000&&this.inventory.wood>=30&&this.inventory.stone>=80&&this.isLeader&&civCount('arcology')<2)type='arcology';
    else if(_unlockedTypes.has('megacity_core')&&this.knowledge>55000&&this.inventory.wood>=20&&this.inventory.stone>=60&&this.isLeader&&civCount('megacity_core')<1)type='megacity_core';
    else if(_unlockedTypes.has('airport')&&this.knowledge>45000&&this.inventory.wood>=20&&this.inventory.stone>=40&&this.isLeader&&civCount('airport')<1)type='airport';
    else if(_unlockedTypes.has('palace')&&this.knowledge>11000&&this.inventory.wood>=25&&this.inventory.stone>=30&&this.isLeader&&civCount('palace')<1)type='palace';
    else if(_unlockedTypes.has('citadel')&&this.knowledge>6500&&this.inventory.wood>=15&&this.inventory.stone>=25&&civCount('citadel')<1)type='citadel';
    else if(_unlockedTypes.has('cathedral')&&this.knowledge>8000&&this.inventory.wood>=20&&this.inventory.stone>=20&&civCount('cathedral')<1)type='cathedral';
    else if(_unlockedTypes.has('colosseum')&&this.knowledge>3500&&this.inventory.wood>=15&&this.inventory.stone>=20&&civCount('colosseum')<1)type='colosseum';
    // ── Mega structures (1 per civ, require leader) ───────────────────────
    else if(_unlockedTypes.has('stadium')&&this.knowledge>8500&&this.inventory.wood>=20&&this.inventory.stone>=40&&this.isLeader&&civCount('stadium')<1)type='stadium';
    else if(_unlockedTypes.has('great_wall')&&this.knowledge>6000&&this.inventory.wood>=15&&this.inventory.stone>=50&&this.isLeader&&civCount('great_wall')<1)type='great_wall';
    else if(_unlockedTypes.has('pyramid')&&this.knowledge>3000&&this.inventory.wood>=10&&this.inventory.stone>=60&&this.isLeader&&civCount('pyramid')<1)type='pyramid';
    else if(_unlockedTypes.has('ziggurat')&&this.knowledge>2200&&this.inventory.wood>=12&&this.inventory.stone>=55&&this.isLeader&&civCount('ziggurat')<1)type='ziggurat';
    else if(_unlockedTypes.has('lighthouse')&&this.knowledge>4000&&this.inventory.wood>=20&&this.inventory.stone>=35&&this._nearWater()&&civCount('lighthouse')<1)type='lighthouse';
    else if(_unlockedTypes.has('amphitheater')&&this.knowledge>1800&&this.inventory.wood>=18&&this.inventory.stone>=35&&civCount('amphitheater')<1)type='amphitheater';
    else if(_unlockedTypes.has('obelisk')&&this.knowledge>400&&this.inventory.wood>=5&&this.inventory.stone>=30&&!atCap('obelisk',0.04,3))type='obelisk';

    // ── Infrastructure: roads connect the city — build proportionally ─────
    else if(_unlockedTypes.has('neural_hub')&&this.knowledge>90000&&this.inventory.wood>=20&&this.inventory.stone>=60&&!atCap('neural_hub',0.05,3))type='neural_hub';
    else if(_unlockedTypes.has('nuclear_silo')&&this.knowledge>70000&&this.inventory.wood>=20&&this.inventory.stone>=60&&this.isLeader&&civCount('nuclear_silo')<2)type='nuclear_silo';
    else if(_unlockedTypes.has('neon_district')&&this.knowledge>65000&&this.inventory.wood>=15&&this.inventory.stone>=50&&!atCap('neon_district',0.08,6))type='neon_district';
    else if(_unlockedTypes.has('skyscraper')&&this.knowledge>35000&&this.inventory.wood>=10&&this.inventory.stone>=40&&!atCap('skyscraper',0.15,12))type='skyscraper';
    else if(_unlockedTypes.has('powerplant')&&this.knowledge>28000&&this.inventory.wood>=10&&this.inventory.stone>=30&&!atCap('powerplant',0.05,2))type='powerplant';
    else if(_unlockedTypes.has('subway')&&this.knowledge>22000&&this.inventory.wood>=5&&this.inventory.stone>=25&&!atCap('subway',0.08,4))type='subway';
    else if(_unlockedTypes.has('railway')&&this.knowledge>18000&&this.inventory.wood>=10&&this.inventory.stone>=20&&!atCap('railway',0.1,6))type='railway';
    else if(_unlockedTypes.has('factory')&&this.knowledge>12000&&this.inventory.wood>=20&&this.inventory.stone>=30&&!atCap('factory',0.08,4))type='factory';
    else if(_unlockedTypes.has('observatory')&&this.knowledge>5500&&this.inventory.wood>=15&&this.inventory.stone>=25&&!atCap('observatory',0.04,2))type='observatory';
    else if(_unlockedTypes.has('university')&&this.knowledge>4500&&this.inventory.wood>=20&&this.inventory.stone>=20&&!atCap('university',0.05,2))type='university';
    else if(_unlockedTypes.has('highway')&&this.knowledge>10000&&this.inventory.stone>=15&&!atCap('highway',0.2,15))type='highway';
    else if(_unlockedTypes.has('aqueduct')&&this.knowledge>2500&&this.inventory.wood>=4&&this.inventory.stone>=12&&!atCap('aqueduct',0.05,2))type='aqueduct';
    else if(_unlockedTypes.has('carriage')&&this.knowledge>2000&&this.inventory.wood>=10&&this.inventory.stone>=4&&!atCap('carriage',0.04,2))type='carriage';
    else if(_unlockedTypes.has('harbor')&&this.knowledge>1500&&this.inventory.wood>=10&&this.inventory.stone>=6&&this._nearWater()&&!atCap('harbor',0.04,2))type='harbor';
    else if(_unlockedTypes.has('bridge')&&this.knowledge>1200&&this.inventory.wood>=8&&this.inventory.stone>=12&&this._nearWater()&&!atCap('bridge',0.04,3))type='bridge';
    else if(_unlockedTypes.has('road')&&this.knowledge>1000&&this.inventory.stone>=4&&!atCap('road',0.5,30))type='road';
    else if(_unlockedTypes.has('shipyard')&&this.knowledge>500&&this.inventory.wood>=15&&this.inventory.stone>=8&&this._nearWater()&&!atCap('shipyard',0.04,2))type='shipyard';

    // ── Replanting: build tree_nursery/greenhouse when wood is scarce nearby ─
    else if(_unlockedTypes.has('crane')&&this.knowledge>15000&&this.inventory.wood>=10&&this.inventory.stone>=15&&!atCap('crane',0.04,3))type='crane';
    else if(_unlockedTypes.has('ore_processor')&&this.knowledge>13000&&this.inventory.wood>=15&&this.inventory.stone>=25&&!atCap('ore_processor',0.04,3))type='ore_processor';
    else if(_unlockedTypes.has('mining_complex')&&this.knowledge>9000&&this.inventory.wood>=12&&this.inventory.stone>=20&&!atCap('mining_complex',0.06,4)&&this._stoneScarcity())type='mining_complex';
    else if(_unlockedTypes.has('drill_rig')&&this.knowledge>7500&&this.inventory.wood>=10&&this.inventory.stone>=18&&!atCap('drill_rig',0.06,4)&&this._stoneScarcity())type='drill_rig';
    else if(_unlockedTypes.has('excavator')&&this.knowledge>5000&&this.inventory.wood>=8&&this.inventory.stone>=12&&!atCap('excavator',0.08,5)&&this._stoneScarcity())type='excavator';
    else if(_unlockedTypes.has('bulldozer')&&this.knowledge>7000&&this.inventory.wood>=6&&this.inventory.stone>=10&&!atCap('bulldozer',0.06,4))type='bulldozer';
    else if(_unlockedTypes.has('greenhouse')&&this.knowledge>700&&this.inventory.wood>=8&&this.inventory.stone>=6&&!atCap('greenhouse',0.06,4)&&this._woodScarcity())type='greenhouse';
    else if(_unlockedTypes.has('tree_nursery')&&this.knowledge>200&&this.inventory.wood>=4&&this.inventory.stone>=2&&!atCap('tree_nursery',0.08,6)&&this._woodScarcity())type='tree_nursery';

    // ── Military (only in division phase, strict caps) ────────────────────
    else if(_unlockedTypes.has('barracks')&&this.knowledge>900&&this.inventory.wood>=8&&this.inventory.stone>=6&&getSocialPhase()==='division'&&!atCap('barracks',0.06,3))type='barracks';
    else if(_unlockedTypes.has('watchtower')&&this.knowledge>450&&this.inventory.wood>=5&&this.inventory.stone>=8&&getSocialPhase()==='division'&&!atCap('watchtower',0.06,4))type='watchtower';
    else if(_unlockedTypes.has('palisade')&&this.knowledge>80&&this.inventory.wood>=6&&getSocialPhase()==='division'&&!atCap('palisade',0.1,8))type='palisade';

    // ── Knowledge buildings (1-2 per civ, not spam) ───────────────────────
    else if(_unlockedTypes.has('academy')&&this.knowledge>650&&this.inventory.wood>=10&&this.inventory.stone>=10&&!atCap('academy',0.05,2))type='academy';
    else if(_unlockedTypes.has('library')&&this.knowledge>140&&this.inventory.wood>=8&&this.inventory.stone>=6&&!atCap('library',0.06,3))type='library';
    else if(_unlockedTypes.has('forge')&&this.knowledge>320&&this.inventory.wood>=6&&this.inventory.stone>=8&&!atCap('forge',0.06,3))type='forge';
    else if(_unlockedTypes.has('workshop')&&this.knowledge>40&&this.inventory.wood>=5&&this.inventory.stone>=3&&!atCap('workshop',0.08,4))type='workshop';

    // ── Food & economy (proportional to population) ───────────────────────
    else if(_unlockedTypes.has('granary')&&this.knowledge>220&&this.inventory.wood>=6&&this.inventory.stone>=4&&!atCap('granary',0.08,4))type='granary';
    else if(_unlockedTypes.has('animal_pen')&&this.knowledge>25&&this.inventory.wood>=3&&this.inventory.stone>=1&&!atCap('animal_pen',0.12,6))type='animal_pen';
    else if(_unlockedTypes.has('well')&&this.knowledge>15&&this.inventory.wood>=2&&this.inventory.stone>=4&&!atCap('well',0.06,3))type='well';
    else if(this.knowledge>200&&this.inventory.wood>=8&&this.inventory.stone>=8&&!atCap('temple',0.04,2))type='temple';
    else if(this.knowledge>100&&this.inventory.wood>=6&&this.inventory.stone>=4&&!atCap('market',0.06,3))type='market';
    else if(_unlockedTypes.has('mine')&&this.inventory.wood>=2&&this.inventory.stone>=3&&!atCap('mine',0.08,4))type='mine';

    // ── Housing: primary building type, scales with population ───────────
    // Farm: 1 per 3 people, max 20
    else if(!atCap('farm',0.33,20)&&this.inventory.wood>=1)type='farm';
    // Hut: 1 per person, max 60 — the main housing
    else if(!atCap('hut',1.0,60)&&this.inventory.wood>=4&&this.inventory.stone>=2)type='hut';
    // Camp: ONLY if knowledge is very low (primitive era) AND no hut is possible
    else if(!_noCamp&&this.inventory.wood>=2)type='camp';
    // If nothing fits and we're evolved — go gather resources instead of making a campfire
    else if(_noCamp){this.action=ACTIONS.GATHER;return;}

    const def=STRUCTURE_TYPES[type];
    if(!def){this.action=ACTIONS.GATHER;return;}
    const cost=def.cost;
    if(this.inventory.wood<cost.wood||this.inventory.stone<cost.stone){
      this.action=ACTIONS.GATHER;return;
    }

    // ── Zone-based placement ──────────────────────────────────────────────
    // Zones define ideal ring radii. If the zone search fails (e.g. island too small),
    // we fall back to a simple nearby search so building ALWAYS happens.
    const ZONE={
      palace:    {rMin:1, rMax:5},
      citadel:   {rMin:1, rMax:5},
      cathedral: {rMin:1, rMax:5},
      temple:    {rMin:1, rMax:6},
      colosseum: {rMin:2, rMax:7},
      market:    {rMin:3, rMax:10},
      library:   {rMin:3, rMax:10},
      academy:   {rMin:3, rMax:10},
      university:{rMin:3, rMax:10},
      observatory:{rMin:3, rMax:10},
      aqueduct:  {rMin:3, rMax:10},
      well:      {rMin:2, rMax:8},
      granary:   {rMin:3, rMax:10},
      hut:       {rMin:2, rMax:12},
      workshop:  {rMin:6, rMax:14},
      forge:     {rMin:6, rMax:14},
      mine:      {rMin:7, rMax:16},
      animal_pen:{rMin:8, rMax:16},
      carriage:  {rMin:6, rMax:12},
      factory:   {rMin:6, rMax:14},
      powerplant:{rMin:6, rMax:14},
      shipyard:  {rMin:4, rMax:12},
      harbor:    {rMin:4, rMax:12},
      palisade:  {rMin:10,rMax:18},
      barracks:  {rMin:8, rMax:16},
      watchtower:{rMin:12,rMax:20},
      road:      {rMin:1, rMax:20},
      railway:   {rMin:8, rMax:20},
      airport:   {rMin:10,rMax:18},
      farm:      {rMin:12,rMax:22},
      camp:      {rMin:1, rMax:6},
      // Cyberpunk era
      highway:   {rMin:5, rMax:22},
      bridge:    {rMin:4, rMax:14},
      subway:    {rMin:3, rMax:16},
      skyscraper:{rMin:2, rMax:12},
      megacity_core:{rMin:1,rMax:5},
      neon_district:{rMin:3,rMax:14},
      arcology:  {rMin:5, rMax:16},
      neural_hub:{rMin:3, rMax:12},
      spaceport: {rMin:12,rMax:22},
      // Mega structures — placed near city center for visibility
      stadium:      {rMin:3, rMax:10},
      pyramid:      {rMin:2, rMax:8},
      great_wall:   {rMin:12,rMax:24},
      lighthouse:   {rMin:4, rMax:14},
      amphitheater: {rMin:3, rMax:10},
      ziggurat:     {rMin:2, rMax:8},
      obelisk:      {rMin:2, rMax:12},
      // Heavy machinery & replanting
      tree_nursery:{rMin:10,rMax:22},
      greenhouse:  {rMin:8, rMax:20},
      excavator:   {rMin:8, rMax:20},
      bulldozer:   {rMin:6, rMax:18},
      drill_rig:   {rMin:10,rMax:22},
      mining_complex:{rMin:10,rMax:24},
      ore_processor: {rMin:8, rMax:20},
      crane:         {rMin:4, rMax:16},
    };

    const zone=ZONE[type]||{rMin:1,rMax:12};
    const isCore=zone.rMax<=10;
    const minSpacing=isCore?1:2;

    // Helper: try to place at a specific tile
    const tryPlace=(bx,by)=>{
      if(!isLand(bx,by)||getStructureAt(bx,by))return false;
      if(bx<0||by<0||bx>=WORLD_W||by>=WORLD_H)return false;
      if(!structureGrid) return false;
      for(let sy2=Math.max(0,by-minSpacing);sy2<=Math.min(WORLD_H-1,by+minSpacing);sy2++){
        for(let sx2=Math.max(0,bx-minSpacing);sx2<=Math.min(WORLD_W-1,bx+minSpacing);sx2++){
          const ns=structureGrid[sy2*WORLD_W+sx2];
          if(ns&&ns.type===type)return false;
        }
      }
      if(!placeStructure(bx,by,type,this))return false;
      // Remove any resource on this tile (building replaces it)
      removeResource(bx,by);
      this.inventory.wood-=cost.wood;this.inventory.stone-=cost.stone;
      this.knowledge=Math.min(99999,this.knowledge+6*_intelModifier*this._intelVariance);
      this.homeBase={tx:bx,ty:by};
      this.action=ACTIONS.BUILD;
      this.addLog(`Construyó ${def.label}`);
      this._onBuildComplete(type,bx,by);
      return true;
    };

    // ── Zone-based placement ──────────────────────────────────────────────
    // Roads: try to place between two existing structures for realistic networks
    if((type==='road'||type==='highway')&&civ){
      const civStructs=structures.filter(s=>s.civId===this.civId&&s.type!=='road'&&s.type!=='highway'&&s.type!=='camp');
      if(civStructs.length>=2){
        // Pick two random structures and place road tiles along the path between them
        const rng2=this._rng;
        const sA=civStructs[Math.floor(rng2()*civStructs.length)];
        const sB=civStructs[Math.floor(rng2()*civStructs.length)];
        if(sA&&sB&&(sA.tx!==sB.tx||sA.ty!==sB.ty)){
          // Walk from sA toward sB, place road tiles
          const steps=Math.max(Math.abs(sB.tx-sA.tx),Math.abs(sB.ty-sA.ty));
          const maxSteps=Math.min(steps,12);
          for(let step=1;step<=maxSteps;step++){
            const t2=step/steps;
            const bx=Math.round(sA.tx+(sB.tx-sA.tx)*t2);
            const by=Math.round(sA.ty+(sB.ty-sA.ty)*t2);
            if(tryPlace(bx,by))return;
          }
        }
      }
    }
    const angleSteps=24;
    const offset=Math.floor(this._rng()*angleSteps);
    for(let r=zone.rMin;r<=zone.rMax;r++){
      for(let ai=0;ai<angleSteps;ai++){
        const angle=((ai+offset)/angleSteps)*Math.PI*2;
        const bx=Math.round(cx+Math.cos(angle)*r);
        const by=Math.round(cy+Math.sin(angle)*r);
        if(tryPlace(bx,by))return;
      }
    }

    // Pass 2: fallback — search outward from human's current position
    // This guarantees building happens even on small islands
    for(let r=1;r<=16;r++){
      for(let ai=0;ai<16;ai++){
        const angle=(ai/16)*Math.PI*2+this._wanderAngle;
        const bx=Math.round(this.tx+Math.cos(angle)*r);
        const by=Math.round(this.ty+Math.sin(angle)*r);
        if(tryPlace(bx,by))return;
      }
    }

    this.action=ACTIONS.GATHER; // truly no space — gather more
  }

  // Returns true if a nearby structure was repaired (consumes resources)
  _doRepair(){
    if(!structureGrid)return false;
    const REPAIR_RADIUS=12;
    const x0=Math.max(0,this.tx-REPAIR_RADIUS), x1=Math.min(WORLD_W-1,this.tx+REPAIR_RADIUS);
    const y0=Math.max(0,this.ty-REPAIR_RADIUS), y1=Math.min(WORLD_H-1,this.ty+REPAIR_RADIUS);

    // Find the most damaged structure owned by this civ within radius
    let worst=null, worstRatio=1.0;
    for(let ty=y0;ty<=y1;ty++){
      for(let tx=x0;tx<=x1;tx++){
        const s=structureGrid[ty*WORLD_W+tx];
        if(!s||!s.decay||s.decayRate<=0)continue;
        if(s.civId!==this.civId)continue;
        const ratio=s.hp/s.maxHp;
        // Only repair if below 60% HP
        if(ratio<0.6&&ratio<worstRatio){worstRatio=ratio;worst=s;}
      }
    }
    if(!worst)return false;

    // Cost to repair: proportional to damage, uses wood+stone
    const def=STRUCTURE_TYPES[worst.type];
    if(!def)return false;
    const needWood=def.cost.wood>0?1:0;
    const needStone=def.cost.stone>0?1:0;
    if(this.inventory.wood<needWood&&this.inventory.stone<needStone)return false;

    // Move toward structure if not adjacent
    const dist=Math.hypot(worst.tx-this.tx,worst.ty-this.ty);
    if(dist>1.5){
      this._setDest(worst.tx,worst.ty);
      this.action=ACTIONS.REPAIR;
      return true;
    }

    // Repair it
    const repairAmt=worst.maxHp*0.35; // restore 35% HP per repair action
    worst.hp=Math.min(worst.maxHp,worst.hp+repairAmt);
    if(needWood&&this.inventory.wood>=1)this.inventory.wood--;
    if(needStone&&this.inventory.stone>=1)this.inventory.stone--;
    this.knowledge=Math.min(99999,this.knowledge+1*_intelModifier);
    this.action=ACTIONS.REPAIR;
    if(typeof markCityGlowDirty!=='undefined')markCityGlowDirty();
    return true;
  }

  _nearWater(){
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
      const cell=getCell(this._settleTx+dx,this._settleTy+dy);
      if(cell&&(cell.biome==='sea'||cell.biome==='shore'))return true;
    }
    return false;
  }

  // Returns true if wood resources are scarce within 25 tiles of this human
  _woodScarcity(){
    const WOOD_TYPES=['tree_oak','tree_pine','tree_palm','tree_jungle','bush'];
    let count=0;
    const r=25,r2=r*r;
    const x0=Math.max(0,this.tx-r),x1=Math.min(WORLD_W-1,this.tx+r);
    const y0=Math.max(0,this.ty-r),y1=Math.min(WORLD_H-1,this.ty+r);
    for(let ty=y0;ty<=y1;ty+=2)for(let tx=x0;tx<=x1;tx+=2){
      const res=resourceGrid[ty][tx];
      if(res&&WOOD_TYPES.includes(res.type)&&res.amount>5){count++;if(count>=4)return false;}
    }
    return count<4;
  }

  // Returns true if stone/mineral resources are scarce within 25 tiles
  _stoneScarcity(){
    const STONE_TYPES=['rock','iron_ore','gold_ore','coal','clay'];
    let count=0;
    const r=25,r2=r*r;
    const x0=Math.max(0,this.tx-r),x1=Math.min(WORLD_W-1,this.tx+r);
    const y0=Math.max(0,this.ty-r),y1=Math.min(WORLD_H-1,this.ty+r);
    for(let ty=y0;ty<=y1;ty+=2)for(let tx=x0;tx<=x1;tx+=2){
      const res=resourceGrid[ty][tx];
      if(res&&STONE_TYPES.includes(res.type)&&res.amount>5){count++;if(count>=4)return false;}
    }
    return count<4;
  }

  // ── Sail to a distant island ──────────────────────────────────────────────
  _doSailToIsland(){
    if(this.transportTier<1)return;
    // Pick a random land tile far away
    const rng=this._rng;
    const angle=rng()*Math.PI*2;
    const dist=60+Math.floor(rng()*120);
    const tx=Math.max(0,Math.min(WORLD_W-1,this.tx+Math.round(Math.cos(angle)*dist)));
    const ty=Math.max(0,Math.min(WORLD_H-1,this.ty+Math.round(Math.sin(angle)*dist)));
    // Find nearest land near that point
    for(let r=0;r<=15;r++){
      for(let a=0;a<8;a++){
        const lx=tx+Math.round(Math.cos(a/8*Math.PI*2)*r);
        const ly=ty+Math.round(Math.sin(a/8*Math.PI*2)*r);
        if(isLand(lx,ly)){
          this._navigateTo(lx,ly);
          this.action=ACTIONS.MIGRATE;
          return;
        }
      }
    }
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
        addWorldEvent(`🏰 ${this.name.split(' ')[0]} construyó Ciudadela — fortaleza inexpugnable`);
        chronicleBuilding(this.name.split(' ')[0],'Ciudadela',civilizations.get(this.civId)?.name||'?',`Sus muros prometían resistir cualquier asedio.`);break;
      case 'cathedral':
        for(const h of near){h.social=Math.min(100,h.social+20);h.ideology=Math.max(0,Math.min(1,h.ideology*0.9+0.05));}
        addWorldEvent(`⛪ ${this.name.split(' ')[0]} construyó Catedral`);
        chronicleBuilding(this.name.split(' ')[0],'Catedral',civilizations.get(this.civId)?.name||'?',`La fe del pueblo encontró su hogar de piedra y luz.`);break;
      case 'palace':
        if(this.civId){const c=civilizations.get(this.civId);if(c)c.militaryPower+=50;}
        addWorldEvent(`🏯 ${this.name.split(' ')[0]} construyó Palacio — capital del Imperio`);
        chronicleBuilding(this.name.split(' ')[0],'Palacio',civilizations.get(this.civId)?.name||'?',`Desde aquí se gobernaría el destino de miles de almas.`);break;
      case 'colosseum':
        addWorldEvent(`🏟 ${this.name.split(' ')[0]} construyó Coliseo`);
        chronicleBuilding(this.name.split(' ')[0],'Coliseo',civilizations.get(this.civId)?.name||'?',`El pueblo encontró en el espectáculo un escape a las penas de la vida.`);break;
      case 'university':
        addWorldEvent(`🏫 ${this.name.split(' ')[0]} fundó Universidad`);
        chronicleBuilding(this.name.split(' ')[0],'Universidad',civilizations.get(this.civId)?.name||'?',`El saber organizado comenzó a transformar la sociedad desde sus cimientos.`);break;
      case 'observatory':
        if(this.civId){const c=civilizations.get(this.civId);if(c&&c.techLevel<4)c.techLevel=4;}
        addWorldEvent(`🔭 ${this.name.split(' ')[0]} construyó Observatorio`);
        chronicleBuilding(this.name.split(' ')[0],'Observatorio',civilizations.get(this.civId)?.name||'?',`Por primera vez, los ojos de la humanidad miraron al cielo con método y razón.`);break;
      case 'shipyard':
        for(const h of near){if(h.civId===this.civId&&h.transportTier<1){h.transportTier=1;h.tilesPerYear=10;}}
        addMajorEvent(`⛵ ${this.name.split(' ')[0]} construyó Astillero — ¡los mares son navegables!`);
        chronicleBuilding(this.name.split(' ')[0],'Astillero',civilizations.get(this.civId)?.name||'?',`Los mares dejaron de ser una barrera. El horizonte se convirtió en una invitación.`);break;
      case 'road':
        // Roads boost speed of nearby humans
        for(const h of near){if(h.civId===this.civId&&h.transportTier<2)h.tilesPerYear=Math.max(h.tilesPerYear,9);}
        addWorldEvent(`🛤️ ${this.name.split(' ')[0]} construyó Camino`);break;
      case 'carriage':
        for(const h of near){if(h.civId===this.civId&&h.transportTier<2){h.transportTier=2;h.tilesPerYear=16;}}
        addMajorEvent(`🐎 ${this.name.split(' ')[0]} construyó Establo — carruajes y caballos`);break;
      case 'factory':
        for(const h of near){if(h.civId===this.civId){h.knowledge=Math.min(99999,h.knowledge+50);h.inventory.wood+=5;h.inventory.stone+=5;}}
        addMajorEvent(`🏭 ${this.name.split(' ')[0]} construyó Fábrica — Revolución Industrial`);
        chronicleBuilding(this.name.split(' ')[0],'Fábrica',civilizations.get(this.civId)?.name||'?',`La Revolución Industrial llegó. Nada volvería a ser igual.`);break;
      case 'railway':
        for(const h of near){if(h.civId===this.civId&&h.transportTier<3){h.transportTier=3;h.tilesPerYear=28;}}
        addMajorEvent(`🚂 ${this.name.split(' ')[0]} construyó Ferrocarril — el mundo se encoge`);
        chronicleBuilding(this.name.split(' ')[0],'Ferrocarril',civilizations.get(this.civId)?.name||'?',`El tiempo y la distancia se doblegaron ante el vapor y el acero.`);break;
      case 'powerplant':
        for(const h of near){if(h.civId===this.civId){h.knowledge=Math.min(99999,h.knowledge+200);if(h.transportTier<4){h.transportTier=4;h.tilesPerYear=45;}}}
        addMajorEvent(`⚡ ${this.name.split(' ')[0]} construyó Central Eléctrica — era moderna`);
        chronicleBuilding(this.name.split(' ')[0],'Central Eléctrica',civilizations.get(this.civId)?.name||'?',`La electricidad fluyó por primera vez. La oscuridad retrocedió para siempre.`);break;
      case 'airport':
        for(const h of near){if(h.civId===this.civId&&h.transportTier<5){h.transportTier=5;h.tilesPerYear=80;}}
        addMajorEvent(`✈️ ${this.name.split(' ')[0]} construyó Aeropuerto — la humanidad conquista el cielo`);
        chronicleBuilding(this.name.split(' ')[0],'Aeropuerto',civilizations.get(this.civId)?.name||'?',`El cielo ya no era el límite. La humanidad conquistó el aire.`);break;
      case 'bridge':
        addWorldEvent(`🌉 ${this.name.split(' ')[0]} construyó Puente — cruzando las aguas`);break;
      case 'highway':
        for(const h of near){if(h.civId===this.civId)h.tilesPerYear=Math.max(h.tilesPerYear,20);}
        addWorldEvent(`🛣️ ${this.name.split(' ')[0]} construyó Autopista`);break;
      case 'subway':
        for(const h of near){if(h.civId===this.civId&&h.transportTier<4){h.transportTier=4;h.tilesPerYear=45;}}
        addMajorEvent(`🚇 ${this.name.split(' ')[0]} construyó Metro — transporte subterráneo`);
        chronicleBuilding(this.name.split(' ')[0],'Metro',civilizations.get(this.civId)?.name||'?',`Las ciudades crecieron hacia abajo. Millones se moverían bajo tierra.`);break;
      case 'skyscraper':
        for(const h of near){if(h.civId===this.civId)h.knowledge=Math.min(99999,h.knowledge+100);}
        addMajorEvent(`🏙️ ${this.name.split(' ')[0]} construyó Rascacielos — la ciudad toca el cielo`);
        chronicleBuilding(this.name.split(' ')[0],'Rascacielos',civilizations.get(this.civId)?.name||'?',`Las torres de cristal y acero redefinieron el horizonte.`);break;
      case 'megacity_core':
        for(const h of near){if(h.civId===this.civId){h.knowledge=Math.min(99999,h.knowledge+500);h.health=Math.min(100,h.health+20);}}
        addMajorEvent(`🌆 ${this.name.split(' ')[0]} fundó Núcleo Urbano — nace la megaciudad`);
        chronicleBuilding(this.name.split(' ')[0],'Núcleo Urbano',civilizations.get(this.civId)?.name||'?',`Una megaciudad emergió. Millones de almas convergieron en un solo punto de luz y acero.`);break;
      case 'neon_district':
        for(const h of near){if(h.civId===this.civId){h.social=Math.min(100,h.social+30);h.knowledge=Math.min(99999,h.knowledge+200);}}
        addMajorEvent(`🌃 ${this.name.split(' ')[0]} construyó Distrito Neón — era cyberpunk`);
        chronicleBuilding(this.name.split(' ')[0],'Distrito Neón',civilizations.get(this.civId)?.name||'?',`Las luces de neón nunca se apagan. La ciudad vive de noche tanto como de día.`);break;
      case 'arcology':
        for(const h of near){if(h.civId===this.civId){h.knowledge=Math.min(99999,h.knowledge+1000);h.health=100;h.hunger=Math.min(100,h.hunger+50);}}
        addMajorEvent(`🏗️ ${this.name.split(' ')[0]} construyó Arcología — ciudad autosuficiente`);
        chronicleBuilding(this.name.split(' ')[0],'Arcología',civilizations.get(this.civId)?.name||'?',`Una ciudad dentro de una ciudad. Autosuficiente, eterna, imparable.`);break;
      case 'neural_hub':
        for(const h of near){if(h.civId===this.civId)h.knowledge=Math.min(99999,h.knowledge+2000);}
        if(this.civId){const c=civilizations.get(this.civId);if(c)c.techLevel=Math.max(c.techLevel,6);}
        addMajorEvent(`🧠 ${this.name.split(' ')[0]} construyó Hub Neural — la IA despierta`);
        chronicleBuilding(this.name.split(' ')[0],'Hub Neural',civilizations.get(this.civId)?.name||'?',`La inteligencia artificial tomó forma. El mundo nunca volvería a ser el mismo.`);break;
      case 'spaceport':
        for(const h of near){if(h.civId===this.civId&&h.transportTier<5){h.transportTier=5;h.tilesPerYear=80;}}
        addMajorEvent(`🚀 ${this.name.split(' ')[0]} construyó Puerto Espacial — ¡las estrellas nos esperan!`);
        chronicleBuilding(this.name.split(' ')[0],'Puerto Espacial',civilizations.get(this.civId)?.name||'?',`La humanidad alzó la vista al cosmos y dio el primer paso hacia las estrellas.`);break;
      case 'temple':case 'market':
        addWorldEvent(`🏛 ${this.name.split(' ')[0]} construyó ${STRUCTURE_TYPES[type].label}`);break;
      case 'animal_pen':
        for(const h of near){if(h.civId===this.civId){h.inventory.food=Math.min(50,h.inventory.food+8);h.hunger=Math.min(100,h.hunger+15);}}
        addWorldEvent(`🐄 ${this.name.split(' ')[0]} construyó Corral — ganadería asegurada`);break;
      case 'tree_nursery':
        addWorldEvent(`🌱 ${this.name.split(' ')[0]} construyó Vivero — replantando el bosque`);break;
      case 'greenhouse':
        for(const h of near){if(h.civId===this.civId){h.inventory.food=Math.min(50,h.inventory.food+5);}}
        addWorldEvent(`🏡 ${this.name.split(' ')[0]} construyó Invernadero — cosechas garantizadas`);break;
      case 'excavator':
        addWorldEvent(`🚜 ${this.name.split(' ')[0]} desplegó Excavadora — extracción mecánica`);break;
      case 'bulldozer':
        addWorldEvent(`🚧 ${this.name.split(' ')[0]} desplegó Bulldozer — remoción de tierra`);break;
      case 'drill_rig':
        addMajorEvent(`🔩 ${this.name.split(' ')[0]} construyó Torre de Perforación — extracción profunda`);break;
      case 'mining_complex':
        for(const h of near){if(h.civId===this.civId){h.inventory.stone=Math.min(30,h.inventory.stone+8);}}
        addMajorEvent(`⛏️ ${this.name.split(' ')[0]} construyó Complejo Minero — industria extractiva`);
        chronicleBuilding(this.name.split(' ')[0],'Complejo Minero',civilizations.get(this.civId)?.name||'?',`Las entrañas de la tierra cedieron sus secretos ante la maquinaria.`);break;
      case 'ore_processor':
        for(const h of near){if(h.civId===this.civId){h.inventory.stone=Math.min(30,h.inventory.stone+12);h.knowledge=Math.min(99999,h.knowledge+80);}}
        addMajorEvent(`🏗 ${this.name.split(' ')[0]} construyó Procesadora de Mineral — refinado industrial`);break;
      case 'crane':
        addWorldEvent(`🏗️ ${this.name.split(' ')[0]} instaló Grúa — construcción en altura`);break;
      case 'stadium':
        for(const h of near){if(h.civId===this.civId){h.social=Math.min(100,h.social+30);h.health=Math.min(100,h.health+10);}}
        addMajorEvent(`🏟 ${this.name.split(' ')[0]} construyó el Gran Estadio — el pueblo ruge de alegría`);
        chronicleBuilding(this.name.split(' ')[0],'Estadio',civilizations.get(this.civId)?.name||'?',`Miles de almas llenaron las gradas. El rugido del pueblo resonó por toda la tierra.`);break;
      case 'pyramid':
        if(this.civId){const c=civilizations.get(this.civId);if(c){c.honor=Math.min(100,c.honor+25);c.militaryPower+=30;}}
        addMajorEvent(`△ ${this.name.split(' ')[0]} erigió una Pirámide — monumento eterno al poder`);
        chronicleBuilding(this.name.split(' ')[0],'Pirámide',civilizations.get(this.civId)?.name||'?',`Generaciones trabajaron para elevar esta montaña de piedra. Los dioses la verían desde el cielo.`);break;
      case 'ziggurat':
        for(const h of near){if(h.civId===this.civId){h.knowledge=Math.min(99999,h.knowledge+200);h.social=Math.min(100,h.social+20);}}
        addMajorEvent(`🏛 ${this.name.split(' ')[0]} construyó el Zigurat — escalera hacia los dioses`);
        chronicleBuilding(this.name.split(' ')[0],'Zigurat',civilizations.get(this.civId)?.name||'?',`Cada escalón era una oración. Desde la cima, los sacerdotes hablaban con el cielo.`);break;
      case 'great_wall':
        if(this.civId){const c=civilizations.get(this.civId);if(c)c.militaryPower+=80;}
        addMajorEvent(`🧱 ${this.name.split(' ')[0]} construyó la Gran Muralla — el territorio es inviolable`);
        chronicleBuilding(this.name.split(' ')[0],'Gran Muralla',civilizations.get(this.civId)?.name||'?',`Kilómetros de piedra y voluntad. Ningún enemigo cruzaría esta frontera.`);break;
      case 'lighthouse':
        for(const h of near){if(h.civId===this.civId&&h.transportTier>=1)h.tilesPerYear=Math.max(h.tilesPerYear,14);}
        addMajorEvent(`🗼 ${this.name.split(' ')[0]} construyó el Faro Colosal — guía a los navegantes`);
        chronicleBuilding(this.name.split(' ')[0],'Faro Colosal',civilizations.get(this.civId)?.name||'?',`Su luz atravesaba la oscuridad del mar. Ningún barco volvería a perderse.`);break;
      case 'amphitheater':
        for(const h of near){if(h.civId===this.civId){h.social=Math.min(100,h.social+25);h.knowledge=Math.min(99999,h.knowledge+50);}}
        addMajorEvent(`🎭 ${this.name.split(' ')[0]} construyó el Anfiteatro — el arte florece`);
        chronicleBuilding(this.name.split(' ')[0],'Anfiteatro',civilizations.get(this.civId)?.name||'?',`Las obras de teatro, la música y la poesía encontraron su hogar de piedra.`);break;
      case 'obelisk':
        if(this.civId){const c=civilizations.get(this.civId);if(c)c.honor=Math.min(100,c.honor+10);}
        addWorldEvent(`▲ ${this.name.split(' ')[0]} erigió un Obelisco — símbolo eterno del poder`);break;
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
    // Determine what we need most for building
    const needWood=this.inventory.wood<8;
    const needStone=this.inventory.stone<6;

    if(needWood){
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
    if(needStone){
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
    // Have enough resources — build immediately, don't wander
    if(this.inventory.wood>=2||this.inventory.stone>=2){
      this._buildUrge=1;
      this._doBuild();
      return;
    }
    this._doWander();
  }

  _tryReproduce(nearby){
    if(!this._canReproduce||this.age<15||this.age>50||this.reproTimer>0){
      this.action=ACTIONS.SOCIALIZE;return;
    }
    const lowPop = _cachedAliveCount < 15;
    const hungerMin = lowPop ? 30 : 45;
    const energyMin = lowPop ? 20 : 35;
    if(this.hunger<hungerMin||this.energy<energyMin||this.sick){this.action=ACTIONS.IDLE;return;}
    // Con población muy baja, relajar requisitos para evitar extinción
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
      if(h.hunger<(lowPop?20:30)||h.energy<(lowPop?15:20)||h.sick)continue;
      if(Math.hypot(h.tx-this.tx,h.ty-this.ty)<=8){partner=h;break;}
    }
    if(partner){
      this.action=ACTIONS.REPRODUCE;partner.action=ACTIONS.REPRODUCE;
      // Cooldown entre hijos: primitivo ~2-4 años, avanzado ~1-2 años
      const kFactor = Math.min(1, this.knowledge / 5000);
      const minCooldown = Math.round(2 - kFactor * 1); // 2 primitivo → 1 avanzado
      const rangeCooldown = 2; // rango fijo de 2 años
      this.reproTimer = minCooldown + Math.floor(this._rng() * rangeCooldown);
      partner.reproTimer = minCooldown + Math.floor(partner._rng() * rangeCooldown);
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
    // With boat/transport — can cross water
    const canSail=this.transportTier>=1;
    const passable=(x,y)=>canSail?true:isLand(x,y);
    if(passable(sx,sy)){this._setDest(sx,sy);this._onWater=!isLand(sx,sy);return;}
    if(passable(sx,this.ty)){this._setDest(sx,this.ty);this._onWater=!isLand(sx,this.ty);return;}
    if(passable(this.tx,sy)){this._setDest(this.tx,sy);this._onWater=!isLand(this.tx,sy);return;}
    for(let a=0;a<8;a++){
      const rx=this.tx+Math.round(Math.cos(a/8*Math.PI*2));
      const ry=this.ty+Math.round(Math.sin(a/8*Math.PI*2));
      if(passable(rx,ry)){this._setDest(rx,ry);this._onWater=!isLand(rx,ry);return;}
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
    if(!structureGrid) return null;
    let best=null,bestD=Infinity;
    const r2=radius*radius;
    // Scan structureGrid directly — O(radius²) instead of O(all structures)
    const x0=Math.max(0,this.tx-radius),x1=Math.min(WORLD_W-1,this.tx+radius);
    const y0=Math.max(0,this.ty-radius),y1=Math.min(WORLD_H-1,this.ty+radius);
    for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
      const s=structureGrid[ty*WORLD_W+tx];
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
      structureGrid[farm.ty*WORLD_W+farm.tx]=null;
    }
  }

  _die(cause){
    this.alive=false;this.action=`Murió (${cause})`;
    this.addLog(`Murió de ${cause} a los ${Math.floor(this.age)} años`);
    _spatialRemove(this);
    if(this.civId){
      const civ=civilizations.get(this.civId);
      if(civ){
        civ.removeMember(this.id);
        // Civ collapse chronicle — when a once-large civ falls to near zero
        if(civ.population<=3&&civ.population>0&&civ._peakPop&&civ._peakPop>=20){
          addChronicle('disaster',`El colapso de ${civ.name}`,`Lo que una vez fue un pueblo de ${civ._peakPop} almas se ha reducido a apenas ${civ.population}. ${civ.name} agoniza. Sus estructuras se vacían, sus calles enmudecen. La historia no perdona a los que no saben adaptarse.`,'💀');
          civ._peakPop=0; // prevent repeat
        }
        if(civ._peakPop==null||civ.population>civ._peakPop) civ._peakPop=civ.population;
        if(civ.leaderId===this.id) _handleLeaderDeath(civ,this);
      }
    }
    if(this.isProdigy&&this.prodigyType?.onDeath){
      try{this.prodigyType.onDeath(this);}catch(e){}
    }
    if(this.isProdigy){
      addMajorEvent(`✨ ${this.name.split(' ')[0]} (${this.prodigyType?.icon||'✨'} ${this.prodigyType?.name||'Prodigio'}) murió a los ${Math.floor(this.age)} años — su legado perdura`);
      addChronicle('wonder', `Muere ${this.name}, ${this.prodigyType?.name||'Prodigio'}`, `A los ${Math.floor(this.age)} años, ${this.name} cerró los ojos por última vez. Había llegado como una tormenta y se fue como el viento. ${this.kills>0?`${this.kills} enemigos cayeron ante él/ella. `:''}${this.children>0?`Dejó ${this.children} hijos. `:''}El mundo es un poco más oscuro sin ${this.prodigyType?.icon||'✨'} ${this.name.split(' ')[0]}.`, this.prodigyType?.icon||'✨');
    } else if(this.children>0||this.isLeader||this.kills>2){
      addWorldEvent(`💀 ${this.name.split(' ')[0]} murió de ${cause} (${Math.floor(this.age)}a, ${this.children} hijos, ${this.kills} victorias)`);
    }
  }
}

// ── Knowledge unlocks — thresholds aligned with era timeline ─────────────────
// Era map (avgK ≈ year):
//   Primitiva  yr1-100    avgK 0-50
//   Piedra     yr100-400  avgK 50-300
//   Bronce     yr400-1000 avgK 300-800
//   Hierro     yr1000-2500 avgK 800-2500
//   Clásica    yr2500-5000 avgK 2500-6000
//   Medieval   yr5000-8000 avgK 6000-10000
//   Renacimiento yr8000-12000 avgK 10000-18000
//   Industrial yr12000-25000 avgK 18000-40000
//   Moderna    yr25000-60000 avgK 40000-90000
//   Espacial   yr60000+   avgK 90000+
const KNOWLEDGE_UNLOCKS=[
  // ── Era Primitiva / Piedra (avgK 0-300) ──────────────────────────────────
  {avgK:15,   type:'well',       icon:'💧',color:'#60a0ff',label:'Pozo',        cost:{wood:2,stone:4},  hp:120,decay:false,decayRate:0, msg:'💧 Pozo desbloqueado — agua garantizada'},
  {avgK:30,   type:'animal_pen', icon:'🐄',color:'#c8a040',label:'Corral',       cost:{wood:3,stone:1},  hp:120,decay:false,decayRate:0, msg:'🐄 Corrales desbloqueados — ganadería primitiva, fuente estable de comida'},
  {avgK:40,   type:'workshop',   icon:'🔨',color:'#c08040',label:'Taller',      cost:{wood:5,stone:3},  hp:120,decay:false,decayRate:0, msg:'🔨 Taller desbloqueado — producción avanzada'},
  {avgK:80,   type:'palisade',   icon:'🪵',color:'#8B5E3C',label:'Empalizada',  cost:{wood:6,stone:0},  hp:200,decay:false,decayRate:0, msg:'🪵 Empalizada desbloqueada — primeras defensas'},
  {avgK:140,  type:'library',    icon:'📚',color:'#80c0ff',label:'Biblioteca',  cost:{wood:8,stone:6},  hp:150,decay:false,decayRate:0, msg:'📚 Biblioteca desbloqueada — conocimiento compartido'},
  {avgK:200,  type:'tree_nursery',icon:'🌱',color:'#44cc44',label:'Vivero',     cost:{wood:4,stone:2},  hp:120,decay:false,decayRate:0, msg:'🌱 Viveros desbloqueados — la civilización aprende a replantar bosques'},
  {avgK:220,  type:'granary',    icon:'🌽',color:'#d4a017',label:'Granero',     cost:{wood:6,stone:4},  hp:150,decay:false,decayRate:0, msg:'🌽 Granero desbloqueado — reservas de alimento'},
  // ── Era del Bronce (avgK 300-800) ────────────────────────────────────────
  {avgK:320,  type:'forge',      icon:'⚒️', color:'#ff8040',label:'Forja',       cost:{wood:6,stone:8},  hp:150,decay:false,decayRate:0, msg:'⚒️ Forja desbloqueada — era del metal'},
  {avgK:400,  type:'obelisk',    icon:'▲', color:'#f0d060',label:'Obelisco',    cost:{wood:5,stone:30}, hp:500,decay:false,decayRate:0, msg:'▲ Obeliscos desbloqueados — monumentos eternos al poder'},
  {avgK:450,  type:'watchtower', icon:'🗼',color:'#aaaaaa',label:'Torre Vigía', cost:{wood:5,stone:8},  hp:200,decay:false,decayRate:0, msg:'🗼 Torre Vigía desbloqueada — vigilancia del territorio'},
  {avgK:500,  type:'shipyard',   icon:'⛵',color:'#4080ff',label:'Astillero',   cost:{wood:15,stone:8}, hp:300,decay:false,decayRate:0, msg:'⛵ Astillero desbloqueado — los mares son navegables'},
  {avgK:650,  type:'academy',    icon:'🎓',color:'#ffd700',label:'Academia',    cost:{wood:10,stone:10},hp:200,decay:false,decayRate:0, msg:'🎓 Academia desbloqueada — era del conocimiento'},
  {avgK:700,  type:'greenhouse', icon:'🏡',color:'#88ee44',label:'Invernadero', cost:{wood:8,stone:6},  hp:200,decay:false,decayRate:0, msg:'🏡 Invernaderos desbloqueados — agricultura controlada'},
  // ── Era del Hierro (avgK 800-2500) ───────────────────────────────────────
  {avgK:900,  type:'barracks',   icon:'⚔️', color:'#cc4444',label:'Cuartel',    cost:{wood:8,stone:6},  hp:180,decay:false,decayRate:0, msg:'⚔️ Cuartel desbloqueado — ejércitos organizados'},
  {avgK:1000, type:'road',       icon:'🛤️', color:'#888888',label:'Camino',      cost:{wood:0,stone:4},  hp:500,decay:false,decayRate:0, msg:'🛤️ Caminos desbloqueados — las civilizaciones se conectan'},
  {avgK:1200, type:'bridge',     icon:'🌉',color:'#a08060',label:'Puente',       cost:{wood:8,stone:12}, hp:400,decay:false,decayRate:0, msg:'🌉 Puentes desbloqueados — cruzando ríos y mares'},
  {avgK:1500, type:'harbor',     icon:'⚓',color:'#3080ff',label:'Puerto',      cost:{wood:10,stone:6}, hp:200,decay:false,decayRate:0, msg:'⚓ Puerto desbloqueado — comercio marítimo'},
  {avgK:1800, type:'amphitheater',icon:'🎭',color:'#c8a0e0',label:'Anfiteatro', cost:{wood:18,stone:35},hp:700,decay:false,decayRate:0, msg:'🎭 Anfiteatro desbloqueado — el arte y el espectáculo florecen'},
  {avgK:2000, type:'carriage',   icon:'🪄', color:'#c8a060',label:'Establo',     cost:{wood:10,stone:4}, hp:200,decay:false,decayRate:0, msg:'🐎 Establos desbloqueados — carruajes y caballos'},
  {avgK:2200, type:'ziggurat',   icon:'🏛', color:'#c8a040',label:'Zigurat',     cost:{wood:12,stone:55},hp:1800,decay:false,decayRate:0,msg:'🏛 Zigurat desbloqueado — templo escalonado hacia los dioses'},
  {avgK:2500, type:'aqueduct',   icon:'🌊',color:'#40c0ff',label:'Acueducto',   cost:{wood:4,stone:12}, hp:250,decay:false,decayRate:0, msg:'🌊 Acueducto desbloqueado — ingeniería hidráulica'},
  // ── Era Clásica (avgK 2500-6000) ─────────────────────────────────────────
  {avgK:3000, type:'pyramid',    icon:'△', color:'#d4a820',label:'Pirámide',    cost:{wood:10,stone:60},hp:2000,decay:false,decayRate:0, msg:'△ Pirámides desbloqueadas — maravillas que desafían el tiempo'},
  {avgK:3500, type:'colosseum',  icon:'🏟',color:'#e0a040',label:'Coliseo',     cost:{wood:15,stone:20},hp:300,decay:false,decayRate:0, msg:'🏟 Coliseo desbloqueado — era de los espectáculos'},
  {avgK:4000, type:'lighthouse', icon:'🗼',color:'#f0e080',label:'Faro Colosal',cost:{wood:20,stone:35},hp:600,decay:false,decayRate:0, msg:'🗼 Faro Colosal desbloqueado — guía a los navegantes desde lejos'},
  {avgK:4500, type:'university', icon:'🏫',color:'#a0d0ff',label:'Universidad', cost:{wood:20,stone:20},hp:300,decay:false,decayRate:0, msg:'🏫 Universidad desbloqueada — ciencia avanzada'},
  {avgK:5000, type:'excavator',  icon:'🚜',color:'#e8a020',label:'Excavadora',  cost:{wood:8,stone:12}, hp:300,decay:false,decayRate:0, msg:'🚜 Excavadoras desbloqueadas — extracción mecánica de minerales'},
  {avgK:5500, type:'observatory',icon:'🔭',color:'#c0a0ff',label:'Observatorio',cost:{wood:15,stone:25},hp:300,decay:false,decayRate:0, msg:'🔭 Observatorio desbloqueado — era de la ciencia'},
  // ── Era Medieval (avgK 6000-10000) ───────────────────────────────────────
  {avgK:6000, type:'great_wall', icon:'🧱',color:'#a08060',label:'Gran Muralla',cost:{wood:15,stone:50},hp:1500,decay:false,decayRate:0, msg:'🧱 Gran Muralla desbloqueada — la defensa definitiva del territorio'},
  {avgK:6500, type:'citadel',    icon:'🏰',color:'#888888',label:'Ciudadela',   cost:{wood:15,stone:25},hp:500,decay:false,decayRate:0, msg:'🏰 Ciudadela desbloqueada — fortaleza inexpugnable'},
  {avgK:7000, type:'bulldozer',  icon:'🚧',color:'#ffaa00',label:'Bulldozer',   cost:{wood:6,stone:10}, hp:250,decay:false,decayRate:0, msg:'🚧 Bulldozers desbloqueados — remoción de tierra a gran escala'},
  {avgK:7500, type:'drill_rig',  icon:'🔩',color:'#cc8844',label:'Torre de Perforación',cost:{wood:10,stone:18},hp:400,decay:false,decayRate:0,msg:'🔩 Torres de perforación desbloqueadas — extracción profunda'},
  {avgK:8000, type:'cathedral',  icon:'⛪',color:'#e8d0ff',label:'Catedral',    cost:{wood:20,stone:20},hp:400,decay:false,decayRate:0, msg:'⛪ Catedral desbloqueada — era de la fe'},
  {avgK:8500, type:'stadium',    icon:'🏟',color:'#e8c840',label:'Estadio',     cost:{wood:20,stone:40},hp:800,decay:false,decayRate:0, msg:'🏟 Estadio desbloqueado — el pueblo necesita espectáculo y gloria'},
  {avgK:9000, type:'mining_complex',icon:'⛏️',color:'#886644',label:'Complejo Minero',cost:{wood:12,stone:20},hp:500,decay:false,decayRate:0,msg:'⛏️ Complejos mineros desbloqueados — industria extractiva'},
  // ── Renacimiento (avgK 10000-18000) ──────────────────────────────────────
  {avgK:10000,type:'highway',    icon:'🛣️', color:'#666688',label:'Autopista',   cost:{wood:0,stone:15}, hp:800,decay:false,decayRate:0, msg:'🛣️ Autopistas desbloqueadas — las ciudades se expanden'},
  {avgK:11000,type:'palace',     icon:'🏯',color:'#ffd700',label:'Palacio',     cost:{wood:25,stone:30},hp:600,decay:false,decayRate:0, msg:'🏯 Palacio desbloqueado — era imperial'},
  {avgK:12000,type:'factory',    icon:'🏭',color:'#888888',label:'Fábrica',     cost:{wood:20,stone:30},hp:400,decay:false,decayRate:0, msg:'🏭 Fábricas desbloqueadas — Revolución Industrial'},
  {avgK:13000,type:'ore_processor',icon:'🏗',color:'#aa6633',label:'Procesadora de Mineral',cost:{wood:15,stone:25},hp:450,decay:false,decayRate:0,msg:'🏗 Procesadoras desbloqueadas — refinado industrial de minerales'},
  {avgK:15000,type:'crane',      icon:'🏗️',color:'#ddaa44',label:'Grúa',        cost:{wood:10,stone:15},hp:350,decay:false,decayRate:0, msg:'🏗️ Grúas desbloqueadas — construcción a gran altura'},
  // ── Era Industrial (avgK 18000-40000) ────────────────────────────────────
  {avgK:18000,type:'railway',    icon:'🚂',color:'#555555',label:'Ferrocarril', cost:{wood:10,stone:20},hp:600,decay:false,decayRate:0, msg:'🚂 Ferrocarril desbloqueado — el mundo se encoge'},
  {avgK:22000,type:'subway',     icon:'🚇',color:'#4466aa',label:'Metro',        cost:{wood:5,stone:25}, hp:700,decay:false,decayRate:0, msg:'🚇 Metro desbloqueado — transporte subterráneo'},
  {avgK:28000,type:'powerplant', icon:'⚡',color:'#ffff00',label:'Central Eléc.',cost:{wood:10,stone:30},hp:500,decay:false,decayRate:0, msg:'⚡ Electricidad desbloqueada — una nueva era comienza'},
  {avgK:35000,type:'skyscraper', icon:'🏙️', color:'#88aacc',label:'Rascacielos', cost:{wood:10,stone:40},hp:800,decay:false,decayRate:0, msg:'🏙️ Rascacielos desbloqueados — las ciudades tocan el cielo'},
  // ── Era Moderna (avgK 40000-90000) ───────────────────────────────────────
  {avgK:45000,type:'airport',    icon:'✈️', color:'#aaddff',label:'Aeropuerto',  cost:{wood:20,stone:40},hp:600,decay:false,decayRate:0, msg:'✈️ Aeropuertos desbloqueados — la humanidad conquista el cielo'},
  {avgK:55000,type:'megacity_core',icon:'🌆',color:'#cc8800',label:'Núcleo Urbano',cost:{wood:20,stone:60},hp:1200,decay:false,decayRate:0,msg:'🌆 Núcleo Urbano desbloqueado — megaciudades emergen'},
  {avgK:65000,type:'neon_district',icon:'🌃',color:'#ff44aa',label:'Distrito Neón',cost:{wood:15,stone:50},hp:600,decay:false,decayRate:0,msg:'🌃 Distritos Neón desbloqueados — era cyberpunk'},
  {avgK:75000,type:'arcology',   icon:'🏗️', color:'#44aa88',label:'Arcología',   cost:{wood:30,stone:80},hp:1500,decay:false,decayRate:0,msg:'🏗️ Arcologías desbloqueadas — ciudades autosuficientes'},
  // ── Era Espacial (avgK 90000+) ────────────────────────────────────────────
  {avgK:90000,type:'neural_hub', icon:'🧠',color:'#aa44ff',label:'Hub Neural',  cost:{wood:20,stone:60},hp:800,decay:false,decayRate:0, msg:'🧠 Hub Neural desbloqueado — la IA despierta'},
  {avgK:70000,type:'nuclear_silo',icon:'☢️',color:'#ff4400',label:'Silo Nuclear',cost:{wood:20,stone:60},hp:800,decay:false,decayRate:0, msg:'☢️ Silos Nucleares desbloqueados — el poder de destrucción total'},
  {avgK:110000,type:'spaceport', icon:'🚀',color:'#aaddff',label:'Puerto Espacial',cost:{wood:30,stone:80},hp:1000,decay:false,decayRate:0,msg:'🚀 Puerto Espacial desbloqueado — la humanidad mira las estrellas'},
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
    const newTech=avgCivK>80000?9:avgCivK>50000?8:avgCivK>25000?7:avgCivK>10000?6:avgCivK>5000?5:avgCivK>3000?4:avgCivK>800?3:avgCivK>200?2:avgCivK>50?1:0;
    if(newTech>civ.techLevel){
      civ.techLevel=newTech;
      const weaponName=WEAPON_TIERS[Math.min(newTech+1,WEAPON_TIERS.length-1)]||'Arma Avanzada';
      const weaponIcon=WEAPON_ICONS[Math.min(newTech+1,WEAPON_ICONS.length-1)]||'⚔️';
      const formation=_getFormationType(newTech);
      addWorldEvent(`${weaponIcon} ${civ.name} dominó: ${weaponName} — Formación: ${formation.name} (${formation.desc})`);
      // Update all members
      for(const id of civ.members){
        const h=_hById(id);
        if(h&&h.alive&&h.weaponTier<newTech+1)h.weaponTier=Math.min(WEAPON_TIERS.length-1,newTech+1);
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
    addChronicle('war',`Escisión: nace ${newCiv.name}`,`Las diferencias ideológicas dentro de ${civ.name} llegaron a un punto de ruptura. ${splinters.length} disidentes, liderados por ${founder.name.split(' ')[0]}, abandonaron el seno de su pueblo y fundaron ${newCiv.name}. Dos pueblos donde antes había uno. Dos destinos donde antes había un solo camino.`,'✊');
  }
}

// ── Prodigies ─────────────────────────────────────────────────────────────────
// Every 500 years a legendary figure is born — they actively move, build, fight
// and leave a permanent named legacy (structure) when they die

const prodigyLegacies=[]; // {name,icon,tx,ty,year,civName,prodigyName,prodigyIcon}
function _registerLegacy(h,structLabel,structIcon){
  const civ=h.civId!=null?civilizations.get(h.civId):null;
  prodigyLegacies.push({name:`${structLabel} de ${h.name.split(' ')[0]}`,icon:structIcon,tx:h.tx,ty:h.ty,year,civName:civ?civ.name:'?',prodigyName:h.name,prodigyIcon:h.prodigyType?.icon||'✨'});
  addMajorEvent(`${structIcon} ${h.name.split(' ')[0]} erigió ${structLabel} — legado eterno en ${civ?civ.name:'el mundo'}`);
}

const PRODIGY_TYPES=[
  {
    name:'Arquitecto Legendario',icon:'🏛',color:'#ffd700',
    gift:'constructor',
    desc:'Construye ciudades épicas y deja monumentos eternos',
    boost:{knowledge:8000,strength:60,intellect:95,charisma:80},
    onSpawn(h){
      h.inventory={food:80,wood:60,stone:50};
      h._buildUrge=1;h._flattenUrge=1;
      addMajorEvent(`🏛✨ ${h.name} nació — Arquitecto Legendario. Las ciudades nunca serán iguales.`);
    },
    onTick(h,yearsElapsed){
      h._buildUrge=Math.min(1,h._buildUrge+yearsElapsed*1.5);
      h._flattenUrge=Math.min(1,h._flattenUrge+yearsElapsed*1.0);
      h.inventory.wood=Math.min(80,h.inventory.wood+Math.floor(yearsElapsed*3));
      h.inventory.stone=Math.min(60,h.inventory.stone+Math.floor(yearsElapsed*3));
      const near=_spatialQuery(h.tx,h.ty,20,h.id);
      for(const n of near)n._buildUrge=Math.min(1,n._buildUrge+yearsElapsed*0.3);
      if(h._rng()<0.003*yearsElapsed){
        const types=['citadel','palace','cathedral','temple'];
        const t=types[Math.floor(h._rng()*types.length)];
        if(STRUCTURE_TYPES[t]&&placeStructure(h.tx,h.ty,t,h)){
          addMajorEvent(`🏛 ${h.name.split(' ')[0]} erigió ${STRUCTURE_TYPES[t].label} — obra maestra`);
        }
      }
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'citadel',h)||placeStructure(h.tx,h.ty,'palace',h);
      if(placed!==false) _registerLegacy(h,'Gran Ciudadela','🏰');
      else _registerLegacy(h,'Ruinas del Arquitecto','🏛');
    }
  },
  {
    name:'Filósofo Iluminado',icon:'📜',color:'#a8f0ff',
    gift:'sabio',
    desc:'Eleva el conocimiento de toda la civilización',
    boost:{knowledge:500,strength:30,intellect:99,charisma:90},
    onSpawn(h){
      addMajorEvent(`📜✨ ${h.name} nació — Filósofo Iluminado. Una nueva era del saber comienza.`);
    },
    onTick(h,yearsElapsed){
      const near=_spatialQuery(h.tx,h.ty,30,h.id);
      for(const n of near)n.knowledge=Math.min(99999,n.knowledge+yearsElapsed*8*_intelModifier);
      h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*20*_intelModifier);
      if(h._rng()<0.002*yearsElapsed){_checkKnowledgeUnlocks();addMajorEvent(`💡 ${h.name.split(' ')[0]} tuvo una revelación — el conocimiento da un salto`);}
      if(h._rng()<0.05*yearsElapsed){const alive=_cachedAlive;if(alive.length>0){const t=alive[Math.floor(h._rng()*alive.length)];if(t&&t.id!==h.id){h.tx=Math.max(0,Math.min(WORLD_W-1,t.tx+Math.floor(h._rng()*6-3)));h.ty=Math.max(0,Math.min(WORLD_H-1,t.ty+Math.floor(h._rng()*6-3)));}}}
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'library',h)||placeStructure(h.tx,h.ty,'academy',h);
      if(placed!==false) _registerLegacy(h,'Gran Biblioteca','📚');
      else _registerLegacy(h,'Escuela del Filósofo','📜');
      if(h.civId!=null){for(const id of (civilizations.get(h.civId)?.members||[])){const m=_hById(id);if(m&&m.alive)m.knowledge=Math.min(99999,m.knowledge+500);}}
    }
  },
  {
    name:'Gran Conquistador',icon:'⚔️',color:'#ff4444',
    gift:'guerrero',
    desc:'Unifica civilizaciones por la fuerza o la diplomacia',
    boost:{knowledge:150,strength:99,intellect:70,charisma:85},
    onSpawn(h){
      h.isSoldier=true;h.weaponTier=Math.min(6,h.weaponTier+2);h.aggression=0.85;
      addMajorEvent(`⚔️✨ ${h.name} nació — Gran Conquistador. Los imperios temblarán.`);
    },
    onTick(h,yearsElapsed){
      const near=_spatialQuery(h.tx,h.ty,25,h.id);
      for(const n of near){
        if(n.civId===h.civId){n.weaponTier=Math.max(n.weaponTier,h.weaponTier-1);if(!n.isSoldier&&h._rng()<0.02)n.isSoldier=true;}
      }
      if(h._rng()<0.08*yearsElapsed){for(const n of near){if(n.civId!=null&&n.civId!==h.civId){h.tx=Math.max(0,Math.min(WORLD_W-1,n.tx+Math.floor(h._rng()*4-2)));h.ty=Math.max(0,Math.min(WORLD_H-1,n.ty+Math.floor(h._rng()*4-2)));break;}}}
      if(h.civId!=null){const myCiv=civilizations.get(h.civId);if(myCiv){for(const n of near){if(n.civId!=null&&n.civId!==h.civId&&h._rng()<0.01*yearsElapsed){const tc=civilizations.get(n.civId);if(tc&&!myCiv.allies.has(n.civId)){myCiv.enemies.add(n.civId);tc.enemies.add(h.civId);}}}}}
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'barracks',h)||placeStructure(h.tx,h.ty,'citadel',h);
      if(placed!==false) _registerLegacy(h,'Fortaleza del Conquistador','⚔️');
      else _registerLegacy(h,'Campo de Batalla','🗡️');
      if(h.civId!=null){for(const id of (civilizations.get(h.civId)?.members||[])){const m=_hById(id);if(m&&m.alive&&m.isSoldier)m.weaponTier=Math.min(6,m.weaponTier+1);}}
    }
  },
  {
    name:'Sanador Divino',icon:'✨',color:'#80ffaa',
    gift:'sanador',
    desc:'Erradica enfermedades y extiende la vida de todos',
    boost:{knowledge:250,strength:40,intellect:85,charisma:95},
    onSpawn(h){
      activeOutbreaks.length=0;
      addMajorEvent(`✨🌿 ${h.name} nació — Sanador Divino. Las plagas retroceden.`);
    },
    onTick(h,yearsElapsed){
      const near=_spatialQuery(h.tx,h.ty,25,h.id);
      for(const n of near){
        n.health=Math.min(100,n.health+yearsElapsed*5);
        if(n.sick&&h._rng()<0.15*yearsElapsed){n.sick=false;n.immunity.add(n.sickType?.name||'');n.sickType=null;}
      }
      activeOutbreaks=activeOutbreaks.filter(o=>Math.hypot(o.tx-h.tx,o.ty-h.ty)>20);
      if(h._rng()<0.06*yearsElapsed){const sick=_cachedAlive.find(x=>x.sick&&x.id!==h.id);if(sick){h.tx=Math.max(0,Math.min(WORLD_W-1,sick.tx+Math.floor(h._rng()*4-2)));h.ty=Math.max(0,Math.min(WORLD_H-1,sick.ty+Math.floor(h._rng()*4-2)));}}
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'temple',h)||placeStructure(h.tx,h.ty,'well',h);
      if(placed!==false) _registerLegacy(h,'Templo de la Sanación','🌿');
      else _registerLegacy(h,'Santuario del Sanador','✨');
      if(h.civId!=null){for(const id of (civilizations.get(h.civId)?.members||[])){const m=_hById(id);if(m&&m.alive&&m.sick){m.sick=false;m.sickType=null;}}}
    }
  },
  {
    name:'Inventor Visionario',icon:'⚙️',color:'#ffcc00',
    gift:'inventor',
    desc:'Acelera el avance tecnológico de su civilización',
    boost:{knowledge:400,strength:50,intellect:98,charisma:70},
    onSpawn(h){
      if(h.civId!=null){const civ=civilizations.get(h.civId);if(civ&&civ.techLevel<5)civ.techLevel=Math.min(5,civ.techLevel+2);}
      addMajorEvent(`⚙️✨ ${h.name} nació — Inventor Visionario. La tecnología da un salto.`);
    },
    onTick(h,yearsElapsed){
      h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*15*_intelModifier);
      if(h.civId!=null&&h._rng()<0.005*yearsElapsed){const civ=civilizations.get(h.civId);if(civ&&civ.techLevel<5){civ.techLevel++;addMajorEvent(`⚙️ ${h.name.split(' ')[0]} inventó algo revolucionario — ${WEAPON_TIERS[civ.techLevel]||'tecnología avanzada'}`);}};
      const near=_spatialQuery(h.tx,h.ty,20,h.id);
      for(const n of near){if(n.civId===h.civId)n.knowledge=Math.min(99999,n.knowledge+yearsElapsed*4*_intelModifier);}
      if(h._rng()<0.04*yearsElapsed){
        const types=new Set(['workshop','forge','academy','university']);
        let best=null,bestD=Infinity;
        const r=30,x0=Math.max(0,h.tx-r),x1=Math.min(WORLD_W-1,h.tx+r),y0=Math.max(0,h.ty-r),y1=Math.min(WORLD_H-1,h.ty+r);
        for(let sy=y0;sy<=y1;sy++)for(let sx=x0;sx<=x1;sx++){const s=structureGrid&&structureGrid[sy*WORLD_W+sx];if(s&&types.has(s.type)){const d=(sx-h.tx)**2+(sy-h.ty)**2;if(d<bestD){bestD=d;best=s;}}}
        if(best){h.tx=Math.max(0,Math.min(WORLD_W-1,best.tx+Math.floor(h._rng()*4-2)));h.ty=Math.max(0,Math.min(WORLD_H-1,best.ty+Math.floor(h._rng()*4-2)));}
      }
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'university',h)||placeStructure(h.tx,h.ty,'observatory',h);
      if(placed!==false) _registerLegacy(h,'Universidad del Visionario','🔭');
      else _registerLegacy(h,'Taller del Inventor','⚙️');
      if(h.civId!=null){const civ=civilizations.get(h.civId);if(civ)civ.techLevel=Math.min(5,civ.techLevel+1);}
    }
  },
  {
    name:'Profeta Eterno',icon:'🔮',color:'#cc88ff',
    gift:'profeta',
    desc:'Une civilizaciones bajo una fe común y evita guerras',
    boost:{knowledge:300,strength:20,intellect:90,charisma:99},
    onSpawn(h){
      if(h.civId!=null){const myCiv=civilizations.get(h.civId);if(myCiv){const enemies=[...myCiv.enemies].slice(0,2);for(const eid of enemies){myCiv.enemies.delete(eid);myCiv.allies.add(eid);const ec=civilizations.get(eid);if(ec){ec.enemies.delete(h.civId);ec.allies.add(h.civId);}}}}
      addMajorEvent(`🔮✨ ${h.name} nació — Profeta Eterno. La paz desciende sobre el mundo.`);
    },
    onTick(h,yearsElapsed){
      const near=_spatialQuery(h.tx,h.ty,30,h.id);
      for(const n of near){n.social=Math.min(100,n.social+yearsElapsed*3);n.ideology=Math.max(0,Math.min(1,n.ideology*0.98+0.01));n.health=Math.min(100,n.health+yearsElapsed*1);}
      if(h.civId!=null&&h._rng()<0.004*yearsElapsed){const myCiv=civilizations.get(h.civId);if(myCiv){const civList=[...civilizations.values()].filter(c=>c.id!==h.civId&&c.population>0&&!myCiv.allies.has(c.id));if(civList.length>0){const other=civList[Math.floor(h._rng()*civList.length)];myCiv.allies.add(other.id);other.allies.add(h.civId);myCiv.enemies.delete(other.id);other.enemies.delete(h.civId);addMajorEvent(`🔮 ${h.name.split(' ')[0]} unió ${myCiv.name} y ${other.name} en paz`);}}}
      if(h._rng()<0.05*yearsElapsed){const t=_cachedAlive.find(x=>x.civId!==h.civId&&x.civId!=null&&x.id!==h.id);if(t){h.tx=Math.max(0,Math.min(WORLD_W-1,t.tx+Math.floor(h._rng()*6-3)));h.ty=Math.max(0,Math.min(WORLD_H-1,t.ty+Math.floor(h._rng()*6-3)));}}
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'cathedral',h)||placeStructure(h.tx,h.ty,'temple',h);
      if(placed!==false) _registerLegacy(h,'Catedral del Profeta','🔮');
      else _registerLegacy(h,'Altar Sagrado','⛪');
      if(h.civId!=null){const myCiv=civilizations.get(h.civId);if(myCiv){for(const eid of [...myCiv.enemies]){myCiv.enemies.delete(eid);myCiv.allies.add(eid);}}}
    }
  },
  {
    name:'Explorador Mítico',icon:'🧭',color:'#40e0d0',
    gift:'explorador',
    desc:'Descubre nuevas tierras y funda colonias lejanas',
    boost:{knowledge:200,strength:75,intellect:80,charisma:75},
    onSpawn(h){
      h.inventory={food:60,wood:30,stone:20};
      addMajorEvent(`🧭✨ ${h.name} nació — Explorador Mítico. Nuevas tierras serán descubiertas.`);
    },
    onTick(h,yearsElapsed){
      if(h._rng()<0.15*yearsElapsed){const angle=h._rng()*Math.PI*2;const dist=15+Math.floor(h._rng()*20);h.tx=Math.max(0,Math.min(WORLD_W-1,h.tx+Math.round(Math.cos(angle)*dist)));h.ty=Math.max(0,Math.min(WORLD_H-1,h.ty+Math.round(Math.sin(angle)*dist)));}
      if(h._rng()<0.008*yearsElapsed&&!getStructureAt(h.tx,h.ty)){if(placeStructure(h.tx,h.ty,'camp',h))addWorldEvent(`🧭 ${h.name.split(' ')[0]} fundó campamento`);}
      const near=_spatialQuery(h.tx,h.ty,10,h.id);
      for(const n of near){if(n.civId===h.civId&&h._rng()<0.02){n.tx=Math.max(0,Math.min(WORLD_W-1,h.tx+Math.floor(h._rng()*6-3)));n.ty=Math.max(0,Math.min(WORLD_H-1,h.ty+Math.floor(h._rng()*6-3)));}}
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'harbor',h)||placeStructure(h.tx,h.ty,'market',h);
      if(placed!==false) _registerLegacy(h,'Puerto del Explorador','⚓');
      else _registerLegacy(h,'Colonia Fundada','🧭');
      if(h.civId!=null){const civ=civilizations.get(h.civId);if(civ){const rng=mulberry32(WORLD_SEED^year^h.id);for(let i=0;i<3;i++){const nx=Math.max(0,Math.min(WORLD_W-1,h.tx+Math.floor(rng()*10-5)));const ny=Math.max(0,Math.min(WORLD_H-1,h.ty+Math.floor(rng()*10-5)));const c=new Human(nx,ny,rng,rng()<0.5?'M':'F',null,null);c.civId=civ.id;c.color=civ.color;humans.push(c);_spatialAdd(c);_humanById.set(c.id,c);civ.addMember(c);}addMajorEvent(`🧭 Colonia de ${h.name.split(' ')[0]} fundada — 3 colonos en nuevas tierras`);}}
    }
  },
  {
    name:'Rey Eterno',icon:'👑',color:'#ffa500',
    gift:'rey',
    desc:'Unifica toda la civilización bajo un solo reino glorioso',
    boost:{knowledge:600,strength:85,intellect:88,charisma:99},
    onSpawn(h){
      if(h.civId!=null){const civ=civilizations.get(h.civId);if(civ){const old=_hById(civ.leaderId);if(old)old.isLeader=false;civ.leaderId=h.id;h.isLeader=true;const small=[...civilizations.values()].filter(c=>c.id!==h.civId&&c.population>0&&c.population<5);for(const s of small.slice(0,2)){for(const mid of [...s.members]){const m=_hById(mid);if(m&&m.alive){s.removeMember(m.id);m.civId=civ.id;m.color=civ.color;civ.addMember(m);}}civilizations.delete(s.id);}}}
      addMajorEvent(`👑✨ ${h.name} nació — Rey Eterno. Un gran reino se forja.`);
    },
    onTick(h,yearsElapsed){
      if(h.civId!=null&&h._rng()<0.01*yearsElapsed){const civ=civilizations.get(h.civId);if(civ){for(const id of civ.members){const m=_hById(id);if(m&&m.alive){m.health=Math.min(100,m.health+yearsElapsed*1);m.knowledge=Math.min(99999,m.knowledge+yearsElapsed*2*_intelModifier);}}}}
      if(h._rng()<0.005*yearsElapsed){const hasPalace=structures.some(s=>s.type==='palace'&&s.civId===h.civId);if(!hasPalace){h.inventory.wood=Math.min(80,h.inventory.wood+30);h.inventory.stone=Math.min(80,h.inventory.stone+30);h._buildUrge=1;}}
      if(h._rng()<0.04*yearsElapsed&&h.civId!=null){const civ=civilizations.get(h.civId);if(civ&&civ.members.size>0){const ids=[...civ.members];const rid=ids[Math.floor(h._rng()*ids.length)];const m=_hById(rid);if(m&&m.alive&&m.id!==h.id){h.tx=Math.max(0,Math.min(WORLD_W-1,m.tx+Math.floor(h._rng()*8-4)));h.ty=Math.max(0,Math.min(WORLD_H-1,m.ty+Math.floor(h._rng()*8-4)));}}}
    },
    onDeath(h){
      const placed=placeStructure(h.tx,h.ty,'palace',h)||placeStructure(h.tx,h.ty,'citadel',h);
      if(placed!==false) _registerLegacy(h,'Palacio Real','🏯');
      else _registerLegacy(h,'Trono del Rey Eterno','👑');
      if(h.civId!=null){const civ=civilizations.get(h.civId);if(civ){civ.militaryPower+=100;for(const id of civ.members){const m=_hById(id);if(m&&m.alive){m.knowledge=Math.min(99999,m.knowledge+300);m.health=Math.min(100,m.health+20);}}addMajorEvent(`👑 El reino de ${civ.name} llora a ${h.name.split(' ')[0]} — su legado fortalece al pueblo`);}}
    }
  },
];

let _lastProdigyYear=0;
let _prodigyCount=0; // how many prodigies have been spawned total
const PRODIGY_INTERVAL=500;
// Milestone tracking sets — populated lazily in tickHumans
let _popMilestones=null;
let _transportMilestones=null;
let _structMilestones=null;

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

  // Chronicle for prodigy birth
  addChronicle('wonder', `Nace ${prodigy.name}, ${ptype.name}`, `Nadie esperaba que ese día fuera diferente. Pero cuando ${prodigy.name} llegó al mundo en ${targetCiv.name}, algo cambió. Los ancianos lo sintieron. Los niños lo miraron diferente. El ${ptype.icon} ${ptype.name} había llegado, y el mundo nunca volvería a ser exactamente igual.`, ptype.icon);

  _prodigyCount++;

  // Make them leader if they're the best
  _electNewLeader(targetCiv);
}

// Hook prodigy tick into Human.tick — called from tickHumans
function _tickProdigies(yearsElapsed){
  for(const h of _cachedAlive){
    if(!h.isProdigy||!h.prodigyType)continue;
    h.prodigyType.onTick(h,yearsElapsed);
    // Prodigies live longer and recover faster
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

  // Find the best spawn tile — scan whole world, prefer rich grassland near center
  const cx=Math.floor(WORLD_W/2), cy=Math.floor(WORLD_H/2);
  const GOOD_BIOMES=['grass','dense_grass','savanna','dry_grass','shrubland','forest','bamboo_forest','rainforest'];
  let sx=cx, sy=cy;
  let bestScore=-Infinity;
  // Sample every 4 tiles for speed, then refine
  for(let ty=2;ty<WORLD_H-2;ty+=4){
    for(let tx=2;tx<WORLD_W-2;tx+=4){
      if(!isLand(tx,ty))continue;
      const cell=getCell(tx,ty);
      if(!cell)continue;
      const biomeScore=GOOD_BIOMES.indexOf(cell.biome); // -1 if not good
      if(biomeScore<0)continue;
      // Prefer center of world, prefer good biomes
      const distFromCenter=Math.hypot(tx-cx,ty-cy)/(WORLD_W*0.5);
      const score=biomeScore*2 - distFromCenter*3;
      if(score>bestScore){bestScore=score;sx=tx;sy=ty;}
    }
  }
  // Fallback: any land tile
  if(!isLand(sx,sy)){
    outer:for(let ty=0;ty<WORLD_H;ty++)for(let tx=0;tx<WORLD_W;tx++){
      if(isLand(tx,ty)){sx=tx;sy=ty;break outer;}
    }
  }

  const rngA=mulberry32(WORLD_SEED^0xABCD1234);
  const rngB=mulberry32(WORLD_SEED^0xDEADBEEF);

  const adam=new Human(sx,sy,rngA,'M',null,null);
  adam.knowledge=60;adam.inventory={food:60,wood:25,stone:15};
  adam.traits.intellect=55+Math.floor(rngA()*20);
  adam.traits.charisma=50+Math.floor(rngA()*20);
  adam.traits.strength=50+Math.floor(rngA()*20);
  adam.hunger=100;adam.energy=100;adam.health=100;
  adam._wanderAngle=Math.PI*0.2;
  adam._settleTx=sx;adam._settleTy=sy;

  // Eve spawns on a guaranteed land tile near adam
  let ex=sx, ey=sy;
  for(let r=1;r<=20;r++){
    for(let a=0;a<16;a++){
      const tx=Math.round(sx+Math.cos(a/16*Math.PI*2)*r);
      const ty=Math.round(sy+Math.sin(a/16*Math.PI*2)*r);
      if(isLand(tx,ty)){ex=tx;ey=ty;break;}
    }
    if(ex!==sx||ey!==sy)break;
  }
  const eve=new Human(ex,ey,rngB,'F',null,null);
  eve.knowledge=60;eve.inventory={food:60,wood:25,stone:15};
  eve.traits.intellect=55+Math.floor(rngB()*20);
  eve.traits.charisma=50+Math.floor(rngB()*20);
  eve.traits.fertility=60+Math.floor(rngB()*20);
  eve.hunger=100;eve.energy=100;eve.health=100;
  eve._wanderAngle=Math.PI*1.2;
  eve._settleTx=ex;eve._settleTy=ey;

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
  // Use _cachedAlive if available to skip dead humans
  const list = (typeof _cachedAlive !== 'undefined' && _cachedAlive.length > 0) ? _cachedAlive : humans;
  for(const h of list) h.updateMovement(dtSec,speedMult);
}

// ── Annual tick ───────────────────────────────────────────────────────────────
let _leaderElectTimer=0;
let _passiveEffectsTimer=0;
let _territoryTimer=0;
// Shared alive cache used throughout tickHumans — avoids repeated filter()
let _cachedAlive=[];

function tickHumans(yearsElapsed){
  // Rebuild alive cache — reuse array to avoid GC pressure
  _cachedAlive.length=0;
  for(const h of humans){
    if(h.alive)_cachedAlive.push(h);
  }
  _cachedAliveCount=_cachedAlive.length;

  // Hard population cap — cull excess to prevent crash
  const HARD_MAX = 4500;
  if(_cachedAliveCount > HARD_MAX){
    // Kill weakest humans (lowest health + hunger) until under cap
    const excess = _cachedAliveCount - HARD_MAX;
    _cachedAlive.sort((a,b)=>(a.health+a.hunger)-(b.health+b.hunger));
    for(let i=0;i<excess;i++) _cachedAlive[i]._die('superpoblación');
    // Rebuild alive cache in-place
    let w=0;
    for(let i=0;i<_cachedAlive.length;i++){if(_cachedAlive[i].alive)_cachedAlive[w++]=_cachedAlive[i];}
    _cachedAlive.length=w;
    _cachedAliveCount=w;
  }

  // Build civStructureMap once per tick — civId → Set of structure types present
  // Reuse existing Sets to avoid GC pressure
  for(const st of _civStructureTypes.values()) st.clear();
  for(const s of structures){
    if(s.civId==null)continue;
    let st=_civStructureTypes.get(s.civId);
    if(!st){st=new Set();_civStructureTypes.set(s.civId,st);}
    st.add(s.type);
  }

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

  // Passive structure effects — INVERTED LOOP: iterate structures once, push to nearby humans
  // This is O(structures × radius) instead of O(humans × radius²)
  _passiveEffectsTimer+=yearsElapsed;
  if(_passiveEffectsTimer>=5&&structures.length>0){
    _passiveEffectsTimer=0;
    const PASSIVE_RADIUS=12;
    // Build a quick lookup: for each structure, find humans in radius via spatial grid
    for(const s of structures){
      const r=PASSIVE_RADIUS,r2=r*r;
      const cx0=Math.floor((s.tx-r)/SPATIAL_CELL),cx1=Math.floor((s.tx+r)/SPATIAL_CELL);
      const cy0=Math.floor((s.ty-r)/SPATIAL_CELL),cy1=Math.floor((s.ty+r)/SPATIAL_CELL);
      for(let cy=cy0;cy<=cy1;cy++)for(let cx=cx0;cx<=cx1;cx++){
        const cell=spatialGrid.get(cx|(cy<<16));
        if(!cell)continue;
        for(const h of cell){
          if(!h.alive)continue;
          const dx=h.tx-s.tx,dy=h.ty-s.ty;
          if(dx*dx+dy*dy>r2)continue;
          switch(s.type){
            case 'well':      h.health=Math.min(100,h.health+yearsElapsed*2);break;
            case 'animal_pen':
              if(h.civId===s.civId){
                // Produce comida constantemente — más que una farm pero sin depender del clima
                h.inventory.food=Math.min(50,h.inventory.food+Math.floor(yearsElapsed*3));
                h.hunger=Math.min(100,h.hunger+yearsElapsed*4);
              }break;
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
            case 'shipyard':
              if(h.civId===s.civId&&h.transportTier<1){h.transportTier=1;h.tilesPerYear=10;}break;
            case 'road':
              if(h.transportTier<2)h.tilesPerYear=Math.max(h.tilesPerYear,9);break;
            case 'carriage':
              if(h.civId===s.civId&&h.transportTier<2){h.transportTier=2;h.tilesPerYear=16;}break;
            case 'factory':
              if(h.civId===s.civId){h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*4*_intelModifier);h.inventory.stone=Math.min(30,h.inventory.stone+Math.floor(yearsElapsed));}break;
            case 'railway':
              if(h.civId===s.civId&&h.transportTier<3){h.transportTier=3;h.tilesPerYear=28;}break;
            case 'powerplant':
              if(h.civId===s.civId){h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*6*_intelModifier);if(h.transportTier<4){h.transportTier=4;h.tilesPerYear=45;}}break;
            case 'airport':
              if(h.civId===s.civId&&h.transportTier<5){h.transportTier=5;h.tilesPerYear=80;}break;
            case 'highway':
              if(h.transportTier<4)h.tilesPerYear=Math.max(h.tilesPerYear,20);break;
            case 'subway':
              if(h.civId===s.civId&&h.transportTier<4){h.transportTier=4;h.tilesPerYear=45;}break;
            case 'neural_hub':
              if(h.civId===s.civId)h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*8*_intelModifier);break;
            case 'arcology':
              if(h.civId===s.civId){h.health=Math.min(100,h.health+yearsElapsed*2);h.hunger=Math.min(100,h.hunger+yearsElapsed*3);h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*4*_intelModifier);}break;
            case 'megacity_core':
              if(h.civId===s.civId){h.knowledge=Math.min(99999,h.knowledge+yearsElapsed*5*_intelModifier);h.social=Math.min(100,h.social+yearsElapsed);}break;
          }
        }
      }
    }
  }

  _checkKnowledgeUnlocks();
  _tickHousingUpgrades(yearsElapsed);

  if(year>0&&year-_lastProdigyYear>=PRODIGY_INTERVAL&&_cachedAliveCount>0){
    _lastProdigyYear=year;
    _spawnProdigy();
  }

  if(year>=600&&year%15===0) _checkCivSplits();
  if(year===600)  addChronicle('war','Año 600: Las primeras rivalidades','Las tribus que antes coexistían en paz comienzan a mirarse con desconfianza. Los recursos escasean. Las fronteras se dibujan con sangre.','⚔️');
  if(year===1000) addChronicle('wonder','Año 1000: Nacen los primeros imperios','Lo que eran tribus dispersas se convierte en imperios. Líderes carismáticos unifican pueblos bajo una sola bandera. La historia entra en una nueva era.','🏛');
  if(year===2500) addChronicle('war','Año 2500: Era Clásica','Grandes guerras de conquista sacuden el mundo. Los imperios se expanden, chocan y se fragmentan. Es la era de los héroes y los tiranos.','⚔️');
  if(year===5000) addChronicle('wonder','Año 5000: Era Medieval','Castillos y catedrales se alzan hacia el cielo. La fe y la espada gobiernan el mundo. Los caballeros y los monjes escriben la historia.','🏰');
  if(year===8000) addChronicle('science','Año 8000: Renacimiento','Una explosión del arte y la ciencia sacude el mundo. Los viejos dogmas caen. La razón y la belleza se convierten en los nuevos dioses.','🎨');
  if(year===12000)addChronicle('science','Año 12000: Revolución Industrial','El vapor y el acero transforman el mundo para siempre. Las ciudades crecen sin control. La humanidad gana poder sobre la naturaleza.','⚙️');
  if(year===25000)addChronicle('wonder','Año 25000: Era Moderna','Civilizaciones globales conectadas por cables invisibles. El mundo se ha vuelto pequeño. Nada ocurre en un rincón sin que el resto lo sepa.','🌍');
  if(year===60000)addChronicle('wonder','Año 60000: Era Espacial','Los límites del mundo se rompen. La humanidad mira más allá de su planeta natal. El universo espera.','🚀');

  // Population milestones — "wow" moments
  const pop=_cachedAliveCount;
  if(!_popMilestones) _popMilestones=new Set();
  if(pop>=100&&!_popMilestones.has(100)){_popMilestones.add(100);addChronicle('culture','La humanidad alcanza 100 almas','El mundo se llena de vida. Cien voces, cien historias, cien futuros posibles. La humanidad da sus primeros pasos firmes.','👥');}
  if(pop>=500&&!_popMilestones.has(500)){_popMilestones.add(500);addChronicle('culture','500 almas pueblan el mundo','Las ciudades crecen y florecen. Lo que comenzó como una pequeña tribu se convierte en algo más grande que cualquier individuo.','🏘');}
  if(pop>=1000&&!_popMilestones.has(1000)){_popMilestones.add(1000);addChronicle('wonder','¡1.000 almas!','Una civilización verdadera ha nacido. Mil personas comparten el mundo, sus leyes, sus sueños y sus miedos. La historia comienza en serio.','🌆');}
  if(pop>=5000&&!_popMilestones.has(5000)){_popMilestones.add(5000);addChronicle('wonder','5.000 personas','El mundo es un hervidero de actividad. Ciudades, rutas, guerras, alianzas. La humanidad ya no puede ignorarse a sí misma.','🌆');}
  if(pop>=10000&&!_popMilestones.has(10000)){_popMilestones.add(10000);addChronicle('wonder','10.000 almas — Edad Dorada','Una era dorada de la humanidad. El conocimiento fluye, las ciudades brillan, y el futuro parece ilimitado.','🌍');}
  if(pop>=50000&&!_popMilestones.has(50000)){_popMilestones.add(50000);addChronicle('wonder','50.000 personas dominan el mundo','La humanidad ha transformado cada rincón del planeta. Lo que una vez fue naturaleza salvaje es ahora civilización.','🌍');}

  // Transport milestones — single pass
  if(!_transportMilestones) _transportMilestones=new Set();
  if(!_transportMilestones.has('plane')){
    let boaters=0,trainers=0,flyers=0;
    for(const h of _cachedAlive){
      if(h.transportTier>=1)boaters++;
      if(h.transportTier>=3)trainers++;
      if(h.transportTier>=5)flyers++;
    }
    if(boaters>=5&&!_transportMilestones.has('boat')){_transportMilestones.add('boat');addChronicle('wonder','Los primeros marineros surcan los mares','Las islas ya no están solas. Los barcos llevan personas, ideas y sueños más allá del horizonte conocido.','⛵');}
    if(trainers>=10&&!_transportMilestones.has('train')){_transportMilestones.add('train');addChronicle('science','El ferrocarril conecta las ciudades','El mundo se encoge. Lo que antes tardaba meses en recorrerse, ahora se hace en días. La distancia pierde su poder.','🚂');}
    if(flyers>=5){_transportMilestones.add('plane');addChronicle('wonder','La humanidad conquista el cielo','El sueño más antiguo de la humanidad se hace realidad. El cielo ya no es el límite.','✈️');}
  }

  // Structure milestones
  if(!_structMilestones) _structMilestones=new Set();
  const sc=structures.length;
  if(sc>=100&&!_structMilestones.has(100)){_structMilestones.add(100);addChronicle('wonder','100 estructuras','Las ciudades se alzan en el horizonte. La humanidad ha dejado su huella permanente en el mundo.','🏗');}
  if(sc>=500&&!_structMilestones.has(500)){_structMilestones.add(500);addChronicle('wonder','500 estructuras','Una red de ciudades cubre el mundo. Lo que comenzó como campamentos primitivos es ahora una civilización compleja.','🏙');}
  if(sc>=1500&&!_structMilestones.has(1500)){_structMilestones.add(1500);addChronicle('wonder','1.500 estructuras','La civilización ha transformado el planeta. Cada colina, cada valle lleva la marca de la humanidad.','🌆');}

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
        const prevAvg=civ.avgKnowledge||0;
        civ.avgKnowledge=avg; // cache — reused by tickInventions, features.js, etc.
        civ.era=avg>300?'imperial':avg>150?'moderna':avg>80?'industrial':avg>50?'medieval':avg>30?'antigua':'primitiva';
        civ.militaryPower=(civMilitary.get(civ.id)||0)+count*2;
        // Knowledge golden age — when avgK doubles and crosses a meaningful threshold
        if(!civ._kMilestones) civ._kMilestones=new Set();
        const kThresholds=[50,150,400,1000,3000];
        for(const t of kThresholds){
          if(avg>=t&&prevAvg<t&&!civ._kMilestones.has(t)){
            civ._kMilestones.add(t);
            const labels={50:'la Antigüedad',150:'la Era Medieval',400:'el Renacimiento',1000:'la Revolución Industrial',3000:'la Era Moderna'};
            addChronicle('science',`${civ.name} entra en ${labels[t]||'una nueva era'}`,`El conocimiento acumulado de ${civ.name} ha alcanzado un nuevo umbral. Sus pensadores, artesanos y líderes han transformado la manera en que su pueblo entiende el mundo. Una nueva era comienza para ellos.`,'🔬');
          }
        }
      }
    }
  }

  // Prune dead humans aggressively — no cap, clear all dead each tick
  if(humans.length>_cachedAliveCount){
    for(let i=humans.length-1;i>=0;i--){
      if(!humans[i].alive){
        _humanById.delete(humans[i].id);
        humans.splice(i,1);
      }
    }
  }

  // ── New depth systems ──────────────────────────────────────────────────────
  tickSeasons(yearsElapsed);
  _tickMonumentBonuses(yearsElapsed);
  tickTrade(yearsElapsed);
  tickInventions(yearsElapsed);
  tickReligion(yearsElapsed);
  tickFormalWars(yearsElapsed);
  tickArmyFormations(yearsElapsed);
  tickMassiveMigration(yearsElapsed);
  _tickReplanting(yearsElapsed);
  _tickExcavation(yearsElapsed);

  // Apply season effects to all humans (throttled — only when season changes)
  if(_seasonTimer<yearsElapsed+0.1){ // just changed season
    const foodMod=SEASON_FOOD_MOD[_season];
    const healthMod=SEASON_HEALTH_MOD[_season];
    for(const h of _cachedAlive){
      if(healthMod!==0) h.health=Math.max(1,Math.min(100,h.health+healthMod));
      // Winter slows movement
      h._seasonSpeedMod=SEASON_SPEED_MOD[_season];
    }
  }
}

