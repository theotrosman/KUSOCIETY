// ═══════════════════════════════════════════════════════════════════════════════
// FEATURES.JS — 15 nuevas mecánicas de profundidad para la simulación
// ═══════════════════════════════════════════════════════════════════════════════

// ── Toggles globales — controlados desde el panel de ajustes ─────────────────
window._simToggles = {
  plagues:      true,  // epidemias, pandemias, enfermedades estacionales
  disasters:    true,  // terremotos, erupciones volcánicas, langostas
  famine:       true,  // hambrunas en cadena
  wars:         true,  // guerras formales entre civs
  extinction:   true,  // las civs pueden extinguirse
  aiPlague:     true,  // evento de singularidad / IA
  darkAge:      true,  // edad oscura y renacimiento
};

// Reusable civ list buffer — avoids [...civilizations.values()] spread allocations
const _civBuf = [];
function _fillCivBuf(minPop) {
  _civBuf.length = 0;
  for (const [, c] of civilizations) { if (c.population > minPop) _civBuf.push(c); }
  return _civBuf;
}

// ── 1. EPIDEMIAS ESTACIONALES ─────────────────────────────────────────────────
// Las enfermedades se propagan más en invierno y menos en verano
let _seasonalEpidemicTimer = 0;
function tickSeasonalEpidemics(yearsElapsed) {
  if (!window._simToggles.plagues) return;
  if (typeof _season === 'undefined' || typeof _cachedAlive === 'undefined') return;
  _seasonalEpidemicTimer += yearsElapsed;
  if (_seasonalEpidemicTimer < 8) return;
  _seasonalEpidemicTimer = 0;
  // Invierno (_season===3): alta probabilidad de brote
  if (_season === 3 && _cachedAlive.length > 10 && Math.random() < 0.15) {
    if(activeOutbreaks.length < 6){ // cap outbreaks
    const host = _cachedAlive[Math.floor(Math.random() * _cachedAlive.length)];
    const coldDiseases = DISEASE_TYPES.filter(d => ['Fiebre','Tifus','Pestilencia'].includes(d.name));
    const dtype = coldDiseases[Math.floor(Math.random() * coldDiseases.length)];
    activeOutbreaks.push({ type: dtype, tx: host.tx, ty: host.ty, radius: 6 + Math.floor(Math.random() * 5), yearsLeft: dtype.duration });
    addWorldEvent(`❄️🦠 Epidemia invernal de ${dtype.name} — el frío debilita a la población`);
    }
  }
  // Verano (_season===1): brotes de cólera/malaria en zonas húmedas
  if (_season === 1 && _cachedAlive.length > 15 && Math.random() < 0.07) {
    if(activeOutbreaks.length < 6){ // cap outbreaks
    const host = _cachedAlive[Math.floor(Math.random() * _cachedAlive.length)];
    const summerDiseases = DISEASE_TYPES.filter(d => ['Cólera','Malaria'].includes(d.name));
    const dtype = summerDiseases[Math.floor(Math.random() * summerDiseases.length)];
    activeOutbreaks.push({ type: dtype, tx: host.tx, ty: host.ty, radius: 5 + Math.floor(Math.random() * 4), yearsLeft: dtype.duration });
    addWorldEvent(`☀️🦠 Brote de ${dtype.name} en el calor del verano`);
    }
  }
}

// ── 2. TERREMOTOS ─────────────────────────────────────────────────────────────
// Ocurren en zonas montañosas, destruyen estructuras cercanas
let _earthquakeTimer = 0;
function tickEarthquakes(yearsElapsed) {
  if (!window._simToggles.disasters) return;
  _earthquakeTimer += yearsElapsed;
  if (_earthquakeTimer < 40) return;
  _earthquakeTimer = 0;
  if (Math.random() > 0.12) return; // 12% chance cada 40 años
  // Buscar una zona montañosa
  const rng = mulberry32(WORLD_SEED ^ year ^ 0xEA77);
  let epicTx = -1, epicTy = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const tx = Math.floor(rng() * WORLD_W);
    const ty = Math.floor(rng() * WORLD_H);
    const cell = getCell(tx, ty);
    if (cell && (cell.biome === 'mountain' || cell.biome === 'highland' || cell.biome === 'volcanic')) {
      epicTx = tx; epicTy = ty; break;
    }
  }
  if (epicTx < 0) return;
  if (typeof structureGrid === 'undefined' || !structureGrid) return;
  const radius = 8 + Math.floor(rng() * 10);
  let destroyed = 0;
  // Dañar estructuras en el radio
  for (let i = structures.length - 1; i >= 0; i--) {
    const s = structures[i];
    const d = Math.hypot(s.tx - epicTx, s.ty - epicTy);
    if (d > radius) continue;
    const dmg = Math.floor((1 - d / radius) * s.maxHp * 0.7);
    s.hp -= dmg;
    if (s.hp <= 0) {
      structureGrid[s.ty*WORLD_W+s.tx] = null;
      structures.splice(i, 1);
      destroyed++;
    }
  }
  // Dañar humanos cercanos
  for (const h of _cachedAlive) {
    const d = Math.hypot(h.tx - epicTx, h.ty - epicTy);
    if (d <= radius) {
      h.health = Math.max(0, h.health - Math.floor((1 - d / radius) * 20));
      if (h.health <= 0) h._die('terremoto');
    }
  }
  if (destroyed > 0) {
    chronicleDisaster('earthquake',`(${epicTx},${epicTy})`,destroyed,`${destroyed} estructuras cayeron en segundos. Los supervivientes huyeron entre los escombros.`);
    addMajorEvent(`🌋 ¡TERREMOTO en (${epicTx},${epicTy})! ${destroyed} estructuras destruidas — la tierra tiembla`);
    if (typeof markTerritoryDirty !== 'undefined') markTerritoryDirty();
    if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
  } else {
    addWorldEvent(`🌋 Terremoto menor en zona montañosa — sin víctimas`);
  }
}

// ── 3. PLAGAS DE LANGOSTAS ────────────────────────────────────────────────────
// En verano, destruyen cultivos (farms) en una zona
let _locustTimer = 0;
function tickLocusts(yearsElapsed) {
  if (!window._simToggles.disasters) return;
  _locustTimer += yearsElapsed;
  if (_locustTimer < 30) return;
  _locustTimer = 0;
  if (typeof _season === 'undefined' || _season !== 1) return; // solo en verano
  if (Math.random() > 0.07) return; // reduced from 0.15
  if (typeof structureGrid === 'undefined' || !structureGrid) return;
  const rng = mulberry32(WORLD_SEED ^ year ^ 0xA0CC);
  const epicTx = Math.floor(rng() * WORLD_W);
  const epicTy = Math.floor(rng() * WORLD_H);
  const radius = 8 + Math.floor(rng() * 8); // reduced from 15+15
  let destroyed = 0;
  for (let i = structures.length - 1; i >= 0; i--) {
    const s = structures[i];
    if (s.type !== 'farm' && s.type !== 'granary') continue;
    if (Math.hypot(s.tx - epicTx, s.ty - epicTy) > radius) continue;
    if (destroyed >= 4) break; // cap at 4 farms destroyed
    structureGrid[s.ty*WORLD_W+s.tx] = null;
    structures.splice(i, 1);
    destroyed++;
  }
  // También reducir comida de humanos cercanos
  for (const h of _cachedAlive) {
    if (Math.hypot(h.tx - epicTx, h.ty - epicTy) <= radius) {
      h.inventory.food = Math.max(0, h.inventory.food - 10);
      h.hunger = Math.max(0, h.hunger - 20);
    }
  }
  if (destroyed > 0) {
    chronicleDisaster('locusts','las tierras de cultivo',destroyed,`${destroyed} granjas arrasadas. El hambre acecha a quienes dependían de esas cosechas.`);
    addMajorEvent(`🦗 ¡PLAGA DE LANGOSTAS! ${destroyed} cultivos arrasados — el hambre amenaza`);
    if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
  }
}

// ── 4. DIPLOMACIA MATRIMONIAL ─────────────────────────────────────────────────
// Líderes de civs enemigas pueden casarse para sellar la paz
let _marriageTimer = 0;
function tickMarriageDiplomacy(yearsElapsed) {
  _marriageTimer += yearsElapsed;
  if (_marriageTimer < 35) return;
  _marriageTimer = 0;
  const civList = _fillCivBuf(3);
  for (const civA of civList) {
    if (civA.enemies.size === 0) continue;
    const leaderA = typeof _hById !== 'undefined' ? _hById(civA.leaderId) : null;
    if (!leaderA || !leaderA.alive || leaderA.partner) continue;
    for (const enemyId of civA.enemies) {
      const civB = civilizations.get(enemyId);
      if (!civB || civB.population === 0) continue;
      const leaderB = typeof _hById !== 'undefined' ? _hById(civB.leaderId) : null;
      if (!leaderB || !leaderB.alive || leaderB.partner) continue;
      if (leaderA.gender === leaderB.gender) continue;
      if (Math.random() > 0.04) continue;
      // Matrimonio diplomático
      leaderA.partner = leaderB.id;
      leaderB.partner = leaderA.id;
      civA.enemies.delete(enemyId);
      civB.enemies.delete(civA.id);
      civA.allies.add(enemyId);
      civB.allies.add(civA.id);
      civA.atWarWith.delete(enemyId);
      civB.atWarWith.delete(civA.id);
      civA.honor = Math.min(100, civA.honor + 15);
      civB.honor = Math.min(100, civB.honor + 15);
      addMajorEvent(`💍 Matrimonio diplomático: ${leaderA.name.split(' ')[0]} (${civA.name}) y ${leaderB.name.split(' ')[0]} (${civB.name}) — la paz sellada con amor`);
      addChronicle('diplomacy',`Matrimonio entre ${civA.name} y ${civB.name}`,`${leaderA.name.split(' ')[0]} y ${leaderB.name.split(' ')[0]} unieron sus manos y con ellas, dos pueblos que se habían mirado con desconfianza. El amor, o al menos la conveniencia, selló lo que ningún tratado había logrado. Las espadas fueron enfundadas.`,'💍');
    }
  }
}

// ── 5. BANDIDOS / FORAJIDOS ───────────────────────────────────────────────────
// Humanos sin civilización que roban recursos a los demás
let _banditTimer = 0;
const _bandits = []; // {tx,ty,food,timer}
function tickBandits(yearsElapsed) {
  if (typeof _cachedAlive === 'undefined') return;
  _banditTimer += yearsElapsed;
  if (_banditTimer < 20) return;
  _banditTimer = 0;
  // Crear bandidos a partir de humanos sin civ que tienen alta agresión
  for (const h of _cachedAlive) {
    if (h.civId !== null || h.aggression < 0.6) continue;
    if (!h._isBandit && Math.random() < 0.05) {
      h._isBandit = true;
      h.color = '#cc2200';
      addWorldEvent(`🗡️ ${h.name.split(' ')[0]} se convirtió en bandido — peligro en las tierras`);
    }
  }
  // Bandidos roban a humanos cercanos
  for (const bandit of _cachedAlive) {
    if (!bandit._isBandit || !bandit.alive) continue;
    const nearby = _spatialQuery(bandit.tx, bandit.ty, 8, bandit.id);
    for (const victim of nearby) {
      if (victim._isBandit || !victim.alive) continue;
      if (Math.random() > 0.15) continue;
      const stolen = Math.min(victim.inventory.food, 5 + Math.floor(Math.random() * 8));
      victim.inventory.food -= stolen;
      bandit.inventory.food += stolen;
      bandit.hunger = Math.min(100, bandit.hunger + stolen * 10);
      victim.hunger = Math.max(0, victim.hunger - stolen * 5);
      if (stolen > 3) addWorldEvent(`🗡️ ${bandit.name.split(' ')[0]} robó ${stolen} comida a ${victim.name.split(' ')[0]}`);
    }
    // Bandidos pueden redimirse si se unen a una civ
    if (bandit._isBandit && bandit.hunger > 70 && Math.random() < 0.02) {
      bandit._isBandit = false;
      addWorldEvent(`🕊️ ${bandit.name.split(' ')[0]} abandonó la vida de bandido`);
    }
  }
}

// ── 6. MIGRACIONES POR CLIMA ──────────────────────────────────────────────────
// En invierno severo, grupos migran hacia biomas más cálidos (sur del mapa)
let _climateMigrationTimer = 0;
function tickClimateMigration(yearsElapsed) {
  if (typeof _season === 'undefined' || typeof _cachedAlive === 'undefined') return;
  _climateMigrationTimer += yearsElapsed;
  if (_climateMigrationTimer < 15) return;
  _climateMigrationTimer = 0;
  if (_season !== 3) return; // solo en invierno
  if (Math.random() > 0.25) return;
  // Buscar humanos en biomas fríos (highland, mountain, snow) y moverlos al sur
  let migrants = 0;
  for (const h of _cachedAlive) {
    if (migrants >= 8) break;
    const cell = getCell(h.tx, h.ty);
    if (!cell) continue;
    if (!['highland', 'mountain', 'snow', 'tundra', 'glacier'].includes(cell.biome)) continue;
    if (h.isLeader || h.isProdigy) continue;
    if (Math.random() > 0.3) continue;
    // Mover hacia el sur (mayor ty) buscando tierra cálida
    const targetTy = Math.min(WORLD_H - 10, h.ty + 20 + Math.floor(Math.random() * 30));
    const targetTx = h.tx + Math.floor(Math.random() * 20 - 10);
    // Buscar tile de tierra cerca del destino
    for (let r = 0; r <= 10; r++) {
      const nx = Math.max(0, Math.min(WORLD_W - 1, targetTx + Math.floor(Math.random() * r * 2 - r)));
      const ny = Math.max(0, Math.min(WORLD_H - 1, targetTy + r));
      if (isLand(nx, ny)) {
        h.tx = nx; h.ty = ny;
        h.px = nx * TILE + TILE / 2; h.py = ny * TILE + TILE / 2;
        h.destPx = h.px; h.destPy = h.py;
        h.action = ACTIONS.MIGRATE;
        migrants++;
        break;
      }
    }
  }
  if (migrants > 0) addWorldEvent(`❄️➡️🌿 ${migrants} personas huyen del frío hacia tierras más cálidas`);
}

// ── 7. COMERCIO DE LUJO ───────────────────────────────────────────────────────
// Civs con mercados y aliados intercambian recursos de lujo (oro, especias)
// generando un bonus de conocimiento y honor extra
let _luxuryTradeTimer = 0;
const _luxuryGoods = ['Oro', 'Especias', 'Seda', 'Marfil', 'Ámbar', 'Perfumes', 'Gemas'];
function tickLuxuryTrade(yearsElapsed) {
  _luxuryTradeTimer += yearsElapsed;
  if (_luxuryTradeTimer < 25) return;
  _luxuryTradeTimer = 0;
  const civList = _fillCivBuf(5);
  for (const civ of civList) {
    const civTypes = _civStructureTypes.get(civ.id);
    if (!civTypes || !civTypes.has('market')) continue;
    for (const alliedId of civ.allies) {
      const allied = civilizations.get(alliedId);
      if (!allied || allied.population === 0) continue;
      const alliedTypes = _civStructureTypes.get(alliedId);
      if (!alliedTypes || !alliedTypes.has('market')) continue;
      if (Math.random() > 0.12) continue;
      // Intercambio de lujo
      const good = _luxuryGoods[Math.floor(Math.random() * _luxuryGoods.length)];
      const knowledgeBonus = 15 + Math.floor(Math.random() * 20);
      const honorBonus = 3;
      for (const id of civ.members) {
        const h = _hById(id);
        if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + knowledgeBonus * _intelModifier);
      }
      for (const id of allied.members) {
        const h = _hById(id);
        if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + knowledgeBonus * _intelModifier);
      }
      civ.honor = Math.min(100, civ.honor + honorBonus);
      allied.honor = Math.min(100, allied.honor + honorBonus);
      addWorldEvent(`💎 Comercio de ${good}: ${civ.name} ↔ ${allied.name} — riqueza y saber fluyen`);
    }
  }
}

// ── 8. REBELIONES INTERNAS ────────────────────────────────────────────────────
// Civs con alta desigualdad (riqueza muy concentrada) sufren rebeliones
let _rebellionTimer = 0;
function tickRebellions(yearsElapsed) {
  if (typeof getSocialPhase === 'undefined') return;
  if (getSocialPhase() !== 'division') return;
  _rebellionTimer += yearsElapsed;
  if (_rebellionTimer < 40) return;
  _rebellionTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8) continue;
    // Calcular desigualdad de riqueza
    let totalWealth = 0, maxWealth = 0, count = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      totalWealth += h.wealth;
      if (h.wealth > maxWealth) maxWealth = h.wealth;
      count++;
    }
    if (count === 0) continue;
    const avgWealth = totalWealth / count;
    const inequality = maxWealth / Math.max(1, avgWealth); // ratio max/avg
    if (inequality < 4) continue; // solo si hay mucha desigualdad
    if (Math.random() > 0.08) continue;
    // Rebelión: un grupo de miembros pobres se separa
    const rebels = [];
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.isLeader || h.isProdigy) continue;
      if (h.wealth < avgWealth * 0.5 && h.aggression > 0.3) rebels.push(h);
    }
    if (rebels.length < 3) continue;
    // Crear nueva civ rebelde
    const rng = mulberry32(WORLD_SEED ^ year ^ civ.id);
    const leader = rebels[Math.floor(rng() * rebels.length)];
    const newCiv = new Civilization(leader);
    newCiv.name = 'Rebeldes de ' + civ.name.split(' ').pop();
    newCiv.color = `hsl(${Math.floor(rng() * 360)},70%,55%)`;
    civilizations.set(newCiv.id, newCiv);
    for (const r of rebels.slice(0, Math.min(rebels.length, Math.floor(civ.population * 0.3)))) {
      civ.removeMember(r.id);
      r.civId = newCiv.id;
      r.color = newCiv.color;
      newCiv.addMember(r);
    }
    newCiv.enemies.add(civ.id);
    civ.enemies.add(newCiv.id);
    leader.isLeader = true;
    addMajorEvent(`✊ ¡REBELIÓN en ${civ.name}! ${rebels.length} oprimidos fundan ${newCiv.name} — la desigualdad tiene un precio`);
    chronicleRebellion(civ.name, rebels.length, `Los rebeldes fundaron ${newCiv.name} y juraron no doblar la rodilla jamás.`);
  }
}

// ── 9. LEGADO CULTURAL ────────────────────────────────────────────────────────
// Estructuras antiguas (>500 años) se convierten en "ruinas históricas"
// y dan un bonus de conocimiento a quienes las visitan
let _legacyTimer = 0;
const _historicSites = new Set(); // tx,ty keys de estructuras históricas
function tickCulturalLegacy(yearsElapsed) {
  _legacyTimer += yearsElapsed;
  if (_legacyTimer < 50) return;
  _legacyTimer = 0;
  for (const s of structures) {
    if (_historicSites.has(`${s.tx},${s.ty}`)) continue;
    // Estructuras de alto nivel que llevan mucho tiempo
    const epicTypes = ['citadel', 'palace', 'cathedral', 'temple', 'colosseum', 'university', 'observatory'];
    if (!epicTypes.includes(s.type)) continue;
    if (!s.builtYear) s.builtYear = year; // marcar año de construcción
    if (year - (s.builtYear || year) < 500) continue;
    _historicSites.add(`${s.tx},${s.ty}`);
    s.isHistoric = true;
    addWorldEvent(`🏛 ${s.label} de ${s.builtBy || '?'} se convierte en sitio histórico — el pasado inspira`);
  }
  // Bonus de conocimiento a humanos cerca de sitios históricos
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    const key = `${h.tx},${h.ty}`;
    for (const siteKey of _historicSites) {
      const comma = siteKey.indexOf(',');
      const stx = +siteKey.slice(0, comma), sty = +siteKey.slice(comma + 1);
      if (Math.hypot(h.tx - stx, h.ty - sty) <= 8) {
        h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 2 * _intelModifier);
      }
    }
  }
}
// Marcar año de construcción al crear estructuras
function _markStructureBuildYear(s) {
  if (!s.builtYear) s.builtYear = year;
}

// ── 10. CAZA MAYOR ────────────────────────────────────────────────────────────
// Animales grandes (mamuts, bisontes) aparecen en la pradera y dan mucha comida
// pero son peligrosos — pueden herir al cazador
let _bigGameTimer = 0;
const _bigGameAnimals = []; // {tx,ty,hp,food,name,icon}
const BIG_GAME_TYPES = [
  { name: 'Mamut', icon: '🦣', hp: 80, food: 60, danger: 25 },
  { name: 'Bisonte', icon: '🦬', hp: 50, food: 40, danger: 15 },
  { name: 'Oso Gigante', icon: '🐻', hp: 60, food: 35, danger: 30 },
  { name: 'Ciervo Gigante', icon: '🦌', hp: 30, food: 25, danger: 5 },
];
function tickBigGame(yearsElapsed) {
  _bigGameTimer += yearsElapsed;
  if (_bigGameTimer < 12) return;
  _bigGameTimer = 0;
  // Spawn nuevos animales grandes
  if (_bigGameAnimals.length < 8 && Math.random() < 0.4) {
    const rng = mulberry32(WORLD_SEED ^ year ^ 0xB166);
    for (let attempt = 0; attempt < 20; attempt++) {
      const tx = Math.floor(rng() * WORLD_W);
      const ty = Math.floor(rng() * WORLD_H);
      const cell = getCell(tx, ty);
      if (!cell) continue;
      if (!['grass', 'savanna', 'dry_grass', 'dense_grass', 'tundra'].includes(cell.biome)) continue;
      if (getStructureAt(tx, ty)) continue;
      const type = BIG_GAME_TYPES[Math.floor(rng() * BIG_GAME_TYPES.length)];
      _bigGameAnimals.push({ tx, ty, hp: type.hp, maxHp: type.hp, food: type.food, name: type.name, icon: type.icon, danger: type.danger });
      break;
    }
  }
  // Humanos cazadores atacan animales grandes cercanos
  if (typeof _cachedAlive === 'undefined') return;
  for (let i = _bigGameAnimals.length - 1; i >= 0; i--) {
    const animal = _bigGameAnimals[i];
    // Buscar cazador cercano
    const hunters = _spatialQuery(animal.tx, animal.ty, 6, -1).filter(h => h.alive && h.action === ACTIONS.HUNT);
    for (const hunter of hunters) {
      if (Math.random() > 0.3) continue;
      const dmg = 5 + hunter.traits.strength * 0.2 + hunter.weaponTier * 4;
      animal.hp -= dmg;
      // El animal puede herir al cazador
      if (Math.random() < animal.danger / 100) {
        hunter.health = Math.max(0, hunter.health - animal.danger * 0.5);
        if (hunter.health <= 0) { hunter._die('caza mayor'); continue; }
      }
      if (animal.hp <= 0) {
        hunter.inventory.food += animal.food;
        hunter.hunger = Math.min(100, hunter.hunger + 40);
        hunter.knowledge = Math.min(99999, hunter.knowledge + 5 * _intelModifier);
        // Compartir con civmates cercanos
        const civmates = _spatialQuery(hunter.tx, hunter.ty, 10, hunter.id).filter(h => h.civId === hunter.civId && h.alive);
        for (const cm of civmates.slice(0, 4)) {
          cm.inventory.food += Math.floor(animal.food * 0.3);
          cm.hunger = Math.min(100, cm.hunger + 20);
        }
        addWorldEvent(`🏹 ${hunter.name.split(' ')[0]} cazó un ${animal.name} — festín para la tribu`);
        _bigGameAnimals.splice(i, 1);
        break;
      }
    }
  }
}

// ── 11. MINERÍA PROFUNDA ──────────────────────────────────────────────────────
// Minas avanzadas (con forge/workshop) producen recursos extra
let _deepMiningTimer = 0;
function tickDeepMining(yearsElapsed) {
  _deepMiningTimer += yearsElapsed;
  if (_deepMiningTimer < 10) return;
  _deepMiningTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (h.action !== ACTIONS.MINE) continue;
    if (h.knowledge < 300) continue; // requiere conocimiento
    const mine = h._findNearbyStructure('mine', 4);
    if (!mine) continue;
    const hasForge = h._findNearbyStructure('forge', 15) || h._findNearbyStructure('workshop', 15);
    if (!hasForge) continue;
    // Minería profunda: más recursos
    const bonus = Math.floor(1 + h.knowledge / 1000);
    h.inventory.stone = Math.min(50, h.inventory.stone + bonus);
    h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 0.5 * _intelModifier);
    // Chance de encontrar mineral raro
    if (Math.random() < 0.005) {
      const rareOres = ['Plata', 'Cobre', 'Platino', 'Cristal'];
      const ore = rareOres[Math.floor(Math.random() * rareOres.length)];
      h.inventory.stone += 15;
      h.knowledge = Math.min(99999, h.knowledge + 20 * _intelModifier);
      addWorldEvent(`⛏ ${h.name.split(' ')[0]} descubrió ${ore} en minería profunda — riqueza inesperada`);
    }
  }
}

// ── 12. SEQUÍAS ───────────────────────────────────────────────────────────────
// En verano prolongado, los biomas secos producen menos comida
let _droughtTimer = 0;
let _droughtActive = false;
let _droughtYearsLeft = 0;
function tickDrought(yearsElapsed) {
  _droughtTimer += yearsElapsed;
  if (_droughtTimer < 20) return;
  _droughtTimer = 0;
  if (_droughtActive) {
    const totalPop = typeof _cachedAlive !== 'undefined' ? _cachedAlive.length : 1;
    const popFactor = 1 + Math.log10(Math.max(1, totalPop / 10)) * 0.6;
    _droughtYearsLeft -= 20 * popFactor;
    if (_droughtYearsLeft <= 0) {
      _droughtActive = false;
      addMajorEvent('🌧️ La sequía termina — las lluvias regresan y los campos reviven');
    }
    return;
  }
  // Solo en verano, baja probabilidad
  if (typeof _season === 'undefined' || _season !== 1) return;
  if (Math.random() > 0.06) return;
  _droughtActive = true;
  _droughtYearsLeft = 40 + Math.floor(Math.random() * 40);
  addMajorEvent(`☀️🌵 ¡SEQUÍA! Las cosechas fallan durante ${_droughtYearsLeft} años — el agua escasea`);
  // Reducir recursos de comida en biomas secos
  for (const res of resources) {
    if (!['wheat_wild', 'berries', 'bush', 'animal'].includes(res.type)) continue;
    const cell = getCell(res.tx, res.ty);
    if (!cell || !['desert', 'savanna', 'dry_grass', 'mesa'].includes(cell.biome)) continue;
    res.amount = Math.max(5, Math.floor(res.amount * 0.4));
  }
  // Penalizar humanos en zonas secas
  if (typeof _cachedAlive !== 'undefined') {
    for (const h of _cachedAlive) {
      const cell = getCell(h.tx, h.ty);
      if (cell && ['desert', 'savanna', 'dry_grass', 'mesa'].includes(cell.biome)) {
        h.hunger = Math.max(0, h.hunger - 20);
        h.health = Math.max(0, h.health - 10);
      }
    }
  }
}

// ── 13. FESTIVALES Y CELEBRACIONES ───────────────────────────────────────────
// Civs con templos/catedrales organizan festivales que boostean moral y natalidad
let _festivalTimer = 0;
function tickFestivals(yearsElapsed) {
  _festivalTimer += yearsElapsed;
  if (_festivalTimer < 30) return;
  _festivalTimer = 0;
  const FESTIVAL_NAMES = ['Festival de la Cosecha', 'Carnaval del Sol', 'Fiesta de los Ancestros',
    'Celebración del Fuego', 'Festival del Mar', 'Día de la Fundación'];
  for (const [, civ] of civilizations) {
    if (civ.population < 5) continue;
    const civTypes = _civStructureTypes.get(civ.id);
    const hasTemple = civTypes && (civTypes.has('temple') || civTypes.has('cathedral') || civTypes.has('colosseum'));
    if (!hasTemple) continue;
    if (Math.random() > 0.08) continue;
    const festName = FESTIVAL_NAMES[Math.floor(Math.random() * FESTIVAL_NAMES.length)];
    let boosted = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      h.social = Math.min(100, h.social + 30);
      h.health = Math.min(100, h.health + 10);
      h.hunger = Math.min(100, h.hunger + 15);
      h._reproUrge = Math.min(1, h._reproUrge + 0.3); // más ganas de reproducirse
      boosted++;
    }
    civ.honor = Math.min(100, civ.honor + 5);
    if (boosted > 0) addWorldEvent(`🎉 ${civ.name} celebra el ${festName} — ${boosted} personas festejan`);
  }
}

// ── 14. EXPLORACIÓN CIENTÍFICA ────────────────────────────────────────────────
// Humanos con observatorio/universidad pueden hacer "expediciones" que
// descubren nuevos recursos o revelan zonas del mapa con bonus
let _sciExpeditionTimer = 0;
function tickScientificExpeditions(yearsElapsed) {
  _sciExpeditionTimer += yearsElapsed;
  if (_sciExpeditionTimer < 45) return;
  _sciExpeditionTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const [, civ] of civilizations) {
    if (civ.population < 10) continue;
    const civTypes = _civStructureTypes.get(civ.id);
    const hasResearch = civTypes && (civTypes.has('observatory') || civTypes.has('university') || civTypes.has('academy'));
    if (!hasResearch) continue;
    if (Math.random() > 0.15) continue;
    // Elegir un miembro con alto conocimiento
    let scholar = null;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      if (!scholar || h.knowledge > scholar.knowledge) scholar = h;
    }
    if (!scholar || scholar.knowledge < 500) continue;
    // La expedición descubre algo
    const discoveries = [
      { msg: 'una nueva ruta comercial', effect: (h) => { h.knowledge += 60 * _intelModifier; civ.honor += 8; } },
      { msg: 'un yacimiento de minerales', effect: (h) => { h.inventory.stone += 20; h.knowledge += 30 * _intelModifier; } },
      { msg: 'plantas medicinales desconocidas', effect: (h) => { h.health = 100; h.knowledge += 50 * _intelModifier; for (const id of civ.members) { const m = _hById(id); if (m && m.alive) m.health = Math.min(100, m.health + 15); } } },
      { msg: 'ruinas de una civilización antigua', effect: (h) => { h.knowledge += 150 * _intelModifier; addMajorEvent(`🏚 ${h.name.split(' ')[0]} descubrió ruinas antiguas — el pasado revela sus secretos`); } },
      { msg: 'un paso de montaña desconocido', effect: (h) => { h.tilesPerYear = Math.min(h.tilesPerYear + 5, 80); h.knowledge += 25 * _intelModifier; } },
    ];
    const disc = discoveries[Math.floor(Math.random() * discoveries.length)];
    disc.effect(scholar);
    addWorldEvent(`🔭 Expedición de ${scholar.name.split(' ')[0]} (${civ.name}) descubrió ${disc.msg}`);
  }
}

// ── 15. SUCESIÓN EN CRISIS ────────────────────────────────────────────────────
// Cuando un líder muere sin heredero, puede haber una guerra civil breve
// entre los candidatos más fuertes de la civ
function tickSuccessionCrisis(deadLeader, civ) {
  if (!civ || civ.population < 6) return;
  // Buscar dos candidatos fuertes
  const candidates = [];
  for (const id of civ.members) {
    const h = _hById(id);
    if (!h || !h.alive || h.id === deadLeader.id) continue;
    candidates.push(h);
  }
  candidates.sort((a, b) => b.leaderScore - a.leaderScore);
  if (candidates.length < 2) return;
  const contenderA = candidates[0];
  const contenderB = candidates[1];
  if (Math.random() > 0.3) return; // 30% de chance de crisis
  // Guerra civil breve: los dos contendientes se dañan
  const dmg = 10 + Math.floor(Math.random() * 20);
  contenderA.health = Math.max(10, contenderA.health - dmg);
  contenderB.health = Math.max(10, contenderB.health - dmg);
  // El ganador es el que queda con más salud
  const winner = contenderA.health >= contenderB.health ? contenderA : contenderB;
  const loser = winner === contenderA ? contenderB : contenderA;
  civ.leaderId = winner.id;
  winner.isLeader = true;
  loser.isLeader = false;
  // El perdedor puede abandonar la civ
  if (loser.health < 40 && Math.random() < 0.5) {
    civ.removeMember(loser.id);
    loser.civId = null;
    loser._isBandit = true;
    loser.color = '#cc2200';
    addMajorEvent(`⚔️ Crisis de sucesión en ${civ.name}: ${winner.name.split(' ')[0]} venció a ${loser.name.split(' ')[0]} — el perdedor huye al exilio`);
  } else {
    addWorldEvent(`👑 ${winner.name.split(' ')[0]} asumió el liderazgo de ${civ.name} tras una disputa`);
  }
}

// ── FIX: INTELIGENCIA MÍNIMA MÁS ALTA ────────────────────────────────────────
// Parche que se aplica sobre _tickIntelligenceCurve para elevar el piso
// y añadir un bonus por infraestructura de conocimiento
let _intelFloorTimer = 0;
let _intelFloorCache = 0;
function _applyIntelFloor() {
  if (typeof _intelModifier === 'undefined') return;
  _intelFloorTimer++;
  if (_intelFloorTimer < 30) { // only recount every 30 calls
    if (_intelModifier < _intelFloorCache) _intelModifier = _intelFloorCache;
    return;
  }
  _intelFloorTimer = 0;
  // Contar estructuras de conocimiento activas
  let knowledgeStructures = 0;
  for (const s of structures) {
    if (['library', 'academy', 'university', 'observatory', 'forge', 'workshop'].includes(s.type)) {
      knowledgeStructures++;
    }
  }
  // Bonus por infraestructura: +0.02 por cada 5 estructuras de conocimiento, máx +0.4
  const infraBonus = Math.min(0.4, Math.floor(knowledgeStructures / 5) * 0.02);
  // Piso mínimo incluye el bias del usuario
  const userBias = typeof _userIntelBias !== 'undefined' ? _userIntelBias : 0;
  _intelFloorCache = 0.85 + infraBonus + userBias;
  if (_intelModifier < _intelFloorCache) {
    _intelModifier = _intelFloorCache;
  }
}

// ── TICK PRINCIPAL DE FEATURES ────────────────────────────────────────────────
function _tickCoreFeatues(yearsElapsed) {
  tickSeasonalEpidemics(yearsElapsed);
  tickEarthquakes(yearsElapsed);
  tickLocusts(yearsElapsed);
  tickMarriageDiplomacy(yearsElapsed);
  tickBandits(yearsElapsed);
  tickClimateMigration(yearsElapsed);
  tickLuxuryTrade(yearsElapsed);
  tickRebellions(yearsElapsed);
  tickCulturalLegacy(yearsElapsed);
  tickBigGame(yearsElapsed);
  tickDeepMining(yearsElapsed);
  tickDrought(yearsElapsed);
  tickFestivals(yearsElapsed);
  tickScientificExpeditions(yearsElapsed);
  _applyIntelFloor();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5 NUEVAS MECÁNICAS
// ═══════════════════════════════════════════════════════════════════════════════

// ── 16. HERENCIA DE CONOCIMIENTO ─────────────────────────────────────────────
// Cuando alguien muere, sus hijos vivos heredan una fracción de su saber
// Esto evita que el conocimiento se pierda entre generaciones
// Se engancha al sistema de muerte — se llama desde tickKnowledgeInheritance
let _inheritanceTimer = 0;
function tickKnowledgeInheritance(yearsElapsed) {
  if (typeof humans === 'undefined') return;
  _inheritanceTimer += yearsElapsed;
  if (_inheritanceTimer < 5) return;
  _inheritanceTimer = 0;
  // Buscar muertos recientes con hijos vivos
  for (const h of humans) {
    if (h.alive || h._inheritanceDone) continue;
    h._inheritanceDone = true;
    if (!h.parentIds && h.children === 0) continue;
    // Buscar hijos vivos (humanos que tienen este id como padre)
    let inherited = 0;
    for (const child of _cachedAlive) {
      if (!child.parentIds) continue;
      if (child.parentIds[0] !== h.id && child.parentIds[1] !== h.id) continue;
      // El hijo hereda hasta 40% del conocimiento del padre
      const bonus = Math.floor(h.knowledge * 0.4);
      child.knowledge = Math.min(99999, child.knowledge + bonus);
      child.addLog(`Heredó el saber de ${h.name.split(' ')[0]} (+${bonus} conocimiento)`);
      inherited++;
    }
    if (inherited > 0 && h.knowledge > 200) {
      addWorldEvent(`📖 El legado de ${h.name.split(' ')[0]} vive en sus ${inherited} descendiente(s)`);
    }
  }
}

// ── 17. COMETAS Y ECLIPSES ────────────────────────────────────────────────────
// Eventos astronómicos raros que generan reacciones en toda la civilización
let _astronomyTimer = 0;
const ASTRO_EVENTS = [
  { name: 'Cometa Brillante',   icon: '☄️',  faithBoost: 20, knowledgeBoost: 50,  msg: '¡Un cometa cruza el cielo! Los sabios estudian los astros' },
  { name: 'Eclipse Total',      icon: '🌑',  faithBoost: 35, knowledgeBoost: 30,  msg: '¡Eclipse total! El pueblo teme a los dioses — la fe se fortalece' },
  { name: 'Lluvia de Meteoros', icon: '🌠',  faithBoost: 15, knowledgeBoost: 80,  msg: '¡Lluvia de estrellas! Los astrónomos llenan sus pergaminos' },
  { name: 'Aurora Boreal',      icon: '🌌',  faithBoost: 25, knowledgeBoost: 40,  msg: '¡Luces en el cielo! El pueblo interpreta el mensaje de los dioses' },
];
function tickAstronomyEvents(yearsElapsed) {
  _astronomyTimer += yearsElapsed;
  if (_astronomyTimer < 60) return;
  _astronomyTimer = 0;
  if (Math.random() > 0.2) return; // 20% cada 60 años
  const ev = ASTRO_EVENTS[Math.floor(Math.random() * ASTRO_EVENTS.length)];
  addMajorEvent(`${ev.icon} ${ev.name}: ${ev.msg}`);
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    // Boost de conocimiento a todos
    h.knowledge = Math.min(99999, h.knowledge + ev.knowledgeBoost * _intelModifier);
    h.social = Math.min(100, h.social + ev.faithBoost * 0.3);
    // Boost de fe a civs con templo
    if (h.civId != null) {
      const civ = civilizations.get(h.civId);
      if (civ) civ.honor = Math.min(100, civ.honor + 3);
    }
  }
  // Chance de que una civ funde religión si no tiene
  for (const [, civ] of civilizations) {
    if (civ.religion || civ.population < 5) continue;
    if (Math.random() < 0.25) {
      const RELIGION_NAMES = ['Sol Eterno','La Gran Madre','El Camino','Fe del Fuego','Orden del Cosmos','Los Ancestros','La Luz Verdadera','El Espíritu del Mar'];
      civ.religion = RELIGION_NAMES[Math.floor(Math.random() * RELIGION_NAMES.length)];
      addWorldEvent(`🛕 El ${ev.name} inspiró a ${civ.name} — nació la fe "${civ.religion}"`);
    }
  }
}

// ── 18. PIRATAS MARÍTIMOS ─────────────────────────────────────────────────────
// Civs con astillero pueden enviar "piratas" que roban recursos de otras civs
// por rutas marítimas — solo funciona si ambas civs tienen costa
let _pirateTimer = 0;
function tickPiracy(yearsElapsed) {
  _pirateTimer += yearsElapsed;
  if (_pirateTimer < 30) return;
  _pirateTimer = 0;
  const civList = _fillCivBuf(5);
  for (const civ of civList) {
    const civTypes = _civStructureTypes.get(civ.id);
    if (!civTypes || !civTypes.has('shipyard')) continue;
    if (Math.random() > 0.08) continue;
    // Buscar una civ enemiga o neutral con recursos
    const targets = civList.filter(c => c.id !== civ.id && c.population > 3 && !civ.allies.has(c.id));
    if (targets.length === 0) continue;
    const target = targets[Math.floor(Math.random() * targets.length)];
    // Robar comida y recursos de miembros del target
    let stolenFood = 0, stolenWood = 0;
    let victimCount = 0;
    for (const id of target.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      const f = Math.min(h.inventory.food, 5 + Math.floor(Math.random() * 8));
      const w = Math.min(h.inventory.wood, 2 + Math.floor(Math.random() * 4));
      h.inventory.food -= f;
      h.inventory.wood -= w;
      stolenFood += f;
      stolenWood += w;
      victimCount++;
      if (victimCount >= 4) break;
    }
    // Distribuir botín entre miembros del pirata
    if (stolenFood + stolenWood > 0) {
      for (const id of civ.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        h.inventory.food = Math.min(50, h.inventory.food + Math.floor(stolenFood / Math.max(1, civ.population) * 2));
        h.inventory.wood = Math.min(40, h.inventory.wood + Math.floor(stolenWood / Math.max(1, civ.population) * 2));
      }
      // Crear enemistad
      if (!civ.allies.has(target.id)) {
        target.enemies.add(civ.id);
        civ.honor = Math.max(0, civ.honor - 5);
      }
      addWorldEvent(`🏴‍☠️ Piratas de ${civ.name} saquearon a ${target.name} — ${stolenFood} comida robada`);
    }
  }
}

// ── 19. MUTACIÓN DE ENFERMEDADES ──────────────────────────────────────────────
// Enfermedades que ya tienen inmunidad generalizada mutan en una variante nueva
// que evade la inmunidad — simula evolución de patógenos
let _mutationTimer = 0;
function tickDiseaseMutation(yearsElapsed) {
  _mutationTimer += yearsElapsed;
  if (_mutationTimer < 50) return;
  _mutationTimer = 0;
  if (typeof _cachedAlive === 'undefined' || _cachedAlive.length < 20) return;
  // Contar inmunidades por enfermedad
  const immunityCount = new Map();
  for (const h of _cachedAlive) {
    for (const name of h.immunity) {
      immunityCount.set(name, (immunityCount.get(name) || 0) + 1);
    }
  }
  // Si más del 60% tiene inmunidad a una enfermedad, puede mutar
  for (const [diseaseName, count] of immunityCount) {
    if (count / _cachedAlive.length < 0.6) continue;
    if (Math.random() > 0.15) continue;
    // Crear variante mutada
    const original = DISEASE_TYPES.find(d => d.name === diseaseName);
    if (!original) continue;
    const mutantName = diseaseName + ' (Mutante)';
    // Evitar duplicados
    if (DISEASE_TYPES.some(d => d.name === mutantName)) continue;
    const mutant = {
      name: mutantName,
      damage: original.damage * 1.3,
      spread: original.spread * 1.4,
      duration: original.duration * 1.2,
      cure: original.cure * 1.5,
    };
    DISEASE_TYPES.push(mutant);
    // Lanzar brote inmediato de la variante
    const host = _cachedAlive[Math.floor(Math.random() * _cachedAlive.length)];
    activeOutbreaks.push({ type: mutant, tx: host.tx, ty: host.ty, radius: 8 + Math.floor(Math.random() * 6), yearsLeft: mutant.duration });
    // Borrar inmunidades al original (la mutante las evade)
    for (const h of _cachedAlive) {
      h.immunity.delete(diseaseName);
    }
    addMajorEvent(`🧬 ¡${diseaseName} mutó! La nueva variante "${mutantName}" evade la inmunidad — brote generalizado`);
    addChronicle('plague',`${diseaseName} muta: nace "${mutantName}"`,`Lo que la humanidad creía haber vencido regresó transformado. La nueva variante "${mutantName}" ignoró todas las defensas conocidas y se extendió como fuego en paja seca.`,'🧬');
  }
}

// ── 20. INTERCAMBIO DE PRISIONEROS ────────────────────────────────────────────
// Tras guerras largas, civs pueden negociar el intercambio de prisioneros
// (humanos capturados que trabajan para el enemigo) a cambio de recursos
let _prisonerTimer = 0;
const _prisoners = new Map(); // humanId → {captorCivId, capturedYear}
function tickPrisonerExchange(yearsElapsed) {
  _prisonerTimer += yearsElapsed;
  if (_prisonerTimer < 25) return;
  _prisonerTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Capturar humanos derrotados en combate (los que tienen health muy baja y están en territorio enemigo)
  for (const h of _cachedAlive) {
    if (_prisoners.has(h.id)) continue;
    if (h.health > 15 || h.civId == null) continue;
    // Buscar si está en territorio enemigo
    if (!_territoryGrid) continue;
    const tileOwner = _territoryGrid[h.ty * WORLD_W + h.tx];
    if (tileOwner < 0 || tileOwner === h.civId) continue;
    const captorCiv = civilizations.get(tileOwner);
    const myCiv = civilizations.get(h.civId);
    if (!captorCiv || !myCiv) continue;
    if (!captorCiv.enemies.has(h.civId)) continue;
    // Capturado
    _prisoners.set(h.id, { captorCivId: tileOwner, capturedYear: year, originalCivId: h.civId });
    h.health = 20; // sobrevive pero débil
    addWorldEvent(`⛓️ ${h.name.split(' ')[0]} fue capturado por ${captorCiv.name}`);
  }
  // Negociar intercambios — civs en paz o con honor alto liberan prisioneros
  for (const [hId, prison] of [..._prisoners]) {
    const h = _hById(hId);
    if (!h || !h.alive) { _prisoners.delete(hId); continue; }
    if (year - prison.capturedYear < 10) continue; // mínimo 10 años cautivo
    const captorCiv = civilizations.get(prison.captorCivId);
    const originalCiv = civilizations.get(prison.originalCivId);
    if (!captorCiv || !originalCiv) { _prisoners.delete(hId); continue; }
    // Liberar si ya no son enemigos o si el captor tiene honor alto
    const shouldRelease = !captorCiv.enemies.has(prison.originalCivId) || captorCiv.honor > 75;
    if (!shouldRelease && Math.random() > 0.05) continue;
    // Rescate: la civ original paga con recursos
    const ransom = 10 + Math.floor(Math.random() * 15);
    let paid = 0;
    for (const id of originalCiv.members) {
      const m = _hById(id);
      if (!m || !m.alive || m.inventory.food < 5) continue;
      const give = Math.min(m.inventory.food, Math.ceil(ransom / Math.max(1, originalCiv.population)));
      m.inventory.food -= give;
      paid += give;
    }
    // Liberar al prisionero
    _prisoners.delete(hId);
    h.health = Math.min(100, h.health + 30);
    captorCiv.honor = Math.min(100, captorCiv.honor + 8);
    captorCiv.foodReserve = Math.min(999, (captorCiv.foodReserve || 0) + paid);
    addWorldEvent(`🤝 ${h.name.split(' ')[0]} fue liberado — ${originalCiv.name} pagó ${paid} comida de rescate a ${captorCiv.name}`);
  }
}

// ── ACTUALIZAR tickAllFeatures CON LAS NUEVAS MECÁNICAS ──────────────────────
// ── Feature stagger — split into 3 groups, rotate each tick ──────────────────
// Group 0: critical (runs every tick)
// Group 1: medium-frequency (runs every 2 ticks)
// Group 2: low-frequency (runs every 3 ticks)
let _featureTickIdx = 0;
let _featureSlowIdx = 0; // separate counter for slow features

function tickAllFeatures(yearsElapsed) {
  // Always run core features every tick
  _tickCoreFeatues(yearsElapsed);
  tickFamine(yearsElapsed);
  tickGlobalClimate(yearsElapsed);
  tickSurvivalInstinct(yearsElapsed);

  // Medium-frequency: rotate 3 groups each tick
  _featureTickIdx = (_featureTickIdx + 1) % 3;
  if(_featureTickIdx === 0){
    tickTradeRoutes(yearsElapsed);
    tickEspionage(yearsElapsed);
    tickMilitaryAlliances(yearsElapsed);
    tickGlobalPandemic(yearsElapsed);
  } else if(_featureTickIdx === 1){
    tickDiseaseMutation(yearsElapsed);
    tickDarkAgeRenaissance(yearsElapsed);
    tickTechCollapse(yearsElapsed);
    tickAdvancedDiplomacy(yearsElapsed);
  } else {
    tickCyberpunkFeatures(yearsElapsed);
    tickWorldWonders(yearsElapsed);
    tickGridCities(yearsElapsed);
    tickGlobalization(yearsElapsed);
  }

  // Slow features: rotate 4 groups, run 1 per tick
  _featureSlowIdx = (_featureSlowIdx + 1) % 4;
  if(_featureSlowIdx === 0){
    tickDynasticLegacy(yearsElapsed);
    tickVolcanicEruptions(yearsElapsed);
    tickEliteExodus(yearsElapsed);
    tickGlaciation(yearsElapsed);
    tickKnowledgeInheritance(yearsElapsed);
  } else if(_featureSlowIdx === 1){
    tickPiracy(yearsElapsed);
    tickBattlefieldLegacy(yearsElapsed);
    tickSecretCults(yearsElapsed);
    tickRatPlague(yearsElapsed);
    tickCivDiversity(yearsElapsed);
  } else if(_featureSlowIdx === 2){
    tickAstronomyEvents(yearsElapsed);
    tickPrisonerExchange(yearsElapsed);
    tickIrrigation(yearsElapsed);
    tickLegendaryHeroes(yearsElapsed);
    tickTourism(yearsElapsed);
  } else {
    tickTsunamis(yearsElapsed);
    tickForcedNomadism(yearsElapsed);
    tickRandomChronicles(yearsElapsed);
    tickNuclearWar(yearsElapsed);
  }

  // Always active — critical systems
  tickAIPlague(yearsElapsed);
  tickNewFeatures(yearsElapsed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECÁNICAS NUEVAS — BATCH 2
// ═══════════════════════════════════════════════════════════════════════════════

// ── A. RUTAS COMERCIALES VISIBLES ─────────────────────────────────────────────
// Civs aliadas con mercados establecen rutas activas que se dibujan en el mapa
// y generan un flujo continuo de recursos entre ciudades.
const _tradeRoutes = []; // {civA, civB, ax,ay, bx,by, good, timer}
let _tradeRouteTimer = 0;
function tickTradeRoutes(yearsElapsed) {
  _tradeRouteTimer += yearsElapsed;
  if (_tradeRouteTimer < 20) return;
  _tradeRouteTimer = 0;

  // Limpiar rutas de civs muertas o que ya no son aliadas
  for (let i = _tradeRoutes.length - 1; i >= 0; i--) {
    const r = _tradeRoutes[i];
    const ca = civilizations.get(r.civA), cb = civilizations.get(r.civB);
    if (!ca || !cb || ca.population === 0 || cb.population === 0 || !ca.allies.has(r.civB)) {
      _tradeRoutes.splice(i, 1);
    }
  }

  const GOODS = ['Oro', 'Seda', 'Especias', 'Grano', 'Hierro', 'Ámbar'];
  const civList = _fillCivBuf(4);
  for (const civA of civList) {
    const typesA = _civStructureTypes.get(civA.id);
    if (!typesA || !typesA.has('market')) continue;
    for (const alliedId of civA.allies) {
      const civB = civilizations.get(alliedId);
      if (!civB || civB.population === 0) continue;
      const typesB = _civStructureTypes.get(alliedId);
      if (!typesB || !typesB.has('market')) continue;
      // ¿Ya existe esta ruta?
      const exists = _tradeRoutes.some(r =>
        (r.civA === civA.id && r.civB === alliedId) ||
        (r.civA === alliedId && r.civB === civA.id)
      );
      if (exists) continue;
      if (Math.random() > 0.25) continue;
      // Encontrar posición de mercado de cada civ
      const mktA = structures.find(s => s.civId === civA.id && s.type === 'market');
      const mktB = structures.find(s => s.civId === alliedId && s.type === 'market');
      if (!mktA || !mktB) continue;
      const good = GOODS[Math.floor(Math.random() * GOODS.length)];
      _tradeRoutes.push({ civA: civA.id, civB: alliedId, ax: mktA.tx, ay: mktA.ty, bx: mktB.tx, by: mktB.ty, good, phase: Math.random() * Math.PI * 2 });
      chronicleTrade(civA.name, civB.name, good, `Las caravanas comenzaron a cruzar las tierras cargadas de ${good}, tejiendo lazos de prosperidad entre ambos pueblos.`);
    }
  }

  // Efecto económico: cada ruta activa da recursos a sus civs
  for (const route of _tradeRoutes) {
    const ca = civilizations.get(route.civA), cb = civilizations.get(route.civB);
    if (!ca || !cb) continue;
    const bonus = 2 + Math.floor(Math.random() * 3);
    for (const id of ca.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + bonus * _intelModifier * 0.1); }
    for (const id of cb.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + bonus * _intelModifier * 0.1); }
    ca.honor = Math.min(100, ca.honor + 1);
    cb.honor = Math.min(100, cb.honor + 1);
  }
}

// Exponer rutas para el renderer
function getTradeRoutes() { return _tradeRoutes; }

// ── B. LEGADO DINÁSTICO ───────────────────────────────────────────────────────
// Cuando un líder muere, si tiene hijos vivos, el hijo más capaz hereda el
// título, recibe un bonus de stats y la civ gana un nombre dinástico.
// Los linajes se acumulan y se muestran en eventos épicos.
let _dynastyTimer = 0;
const _dynastyHistory = new Map(); // civId → [{leaderName, yearStart, yearEnd}]
function tickDynasticLegacy(yearsElapsed) {
  _dynastyTimer += yearsElapsed;
  if (_dynastyTimer < 5) return;
  _dynastyTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 3) continue;
    const leader = _hById(civ.leaderId);
    if (leader && leader.alive) continue; // líder vivo, nada que hacer
    // Líder muerto — buscar heredero
    const candidates = [];
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      candidates.push(h);
    }
    if (candidates.length === 0) continue;
    // Preferir hijos del líder muerto, luego por leaderScore
    candidates.sort((a, b) => {
      const aIsChild = leader && a.parentIds && a.parentIds.includes(leader.id) ? 1 : 0;
      const bIsChild = leader && b.parentIds && b.parentIds.includes(leader.id) ? 1 : 0;
      if (aIsChild !== bIsChild) return bIsChild - aIsChild;
      return (b.leaderScore || 0) - (a.leaderScore || 0);
    });
    const heir = candidates[0];
    const prevLeaderName = leader ? leader.name.split(' ')[0] : '?';
    // Registrar en historial dinástico
    if (!_dynastyHistory.has(civ.id)) _dynastyHistory.set(civ.id, []);
    _dynastyHistory.get(civ.id).push({ leaderName: prevLeaderName, yearStart: civ.founded, yearEnd: year });
    const dynastyLen = _dynastyHistory.get(civ.id).length;
    // Bonus al heredero: stats escalados por longitud de la dinastía
    const bonus = Math.min(30, dynastyLen * 5);
    heir.knowledge = Math.min(99999, heir.knowledge + bonus * 2 * _intelModifier);
    heir.health = Math.min(100, heir.health + bonus * 0.5);
    heir.leaderScore = (heir.leaderScore || 0) + bonus;
    heir.isLeader = true;
    civ.leaderId = heir.id;
    // Nombre dinástico en la civ
    if (dynastyLen >= 2 && !civ.dynastyName) {
      civ.dynastyName = 'Casa ' + prevLeaderName;
      addMajorEvent(`👑 Nace la ${civ.dynastyName} en ${civ.name} — ${dynastyLen} generaciones de liderazgo`);
      chronicleDynasty(heir.name.split(' ')[0], civ.name, dynastyLen, `La ${civ.dynastyName} comienza a escribir su historia.`);
    } else if (dynastyLen >= 5) {
      addMajorEvent(`🏛 ${civ.name} celebra ${dynastyLen} generaciones de la ${civ.dynastyName || 'dinastía'} — ${heir.name.split(' ')[0]} asciende al trono`);
      chronicleDynasty(heir.name.split(' ')[0], civ.name, dynastyLen, `Una estirpe que ha resistido guerras, plagas y el paso del tiempo.`);
    } else {
      addWorldEvent(`👑 ${heir.name.split(' ')[0]} hereda el liderazgo de ${civ.name} (generación ${dynastyLen})`);
    }
  }
}

// ── C. ERUPCIONES VOLCÁNICAS ──────────────────────────────────────────────────
// Los monumentos tipo volcán pueden entrar en erupción: destruyen estructuras
// cercanas pero fertilizan el suelo (convierte biomas a grass con bonus de comida).
let _volcanicTimer = 0;
function tickVolcanicEruptions(yearsElapsed) {
  if (typeof naturalMonuments === 'undefined') return;
  _volcanicTimer += yearsElapsed;
  if (_volcanicTimer < 60) return;
  _volcanicTimer = 0;
  const volcanoes = naturalMonuments.filter(m => m.type === 'volcano');
  if (volcanoes.length === 0) return;
  if (typeof structureGrid === 'undefined' || !structureGrid) return;
  for (const v of volcanoes) {
    if (Math.random() > 0.08) continue; // 8% por volcán cada 60 años
    const radius = 10 + Math.floor(Math.random() * 8);
    let destroyed = 0, fertilized = 0;
    // Destruir estructuras en el radio de lava
    for (let i = structures.length - 1; i >= 0; i--) {
      const s = structures[i];
      const d = Math.hypot(s.tx - v.tx, s.ty - v.ty);
      if (d > radius * 0.6) continue; // lava directa solo en radio interior
      const dmg = Math.floor((1 - d / (radius * 0.6)) * s.maxHp);
      s.hp -= dmg;
      if (s.hp <= 0) { structureGrid[s.ty*WORLD_W+s.tx] = null; structures.splice(i, 1); destroyed++; }
    }
    // Dañar humanos cercanos
    for (const h of _cachedAlive) {
      const d = Math.hypot(h.tx - v.tx, h.ty - v.ty);
      if (d <= radius * 0.5) {
        h.health = Math.max(0, h.health - Math.floor((1 - d / (radius * 0.5)) * 60));
        if (h.health <= 0) h._die('erupción volcánica');
      }
    }
    // Fertilizar suelo en el anillo exterior (ceniza volcánica = tierra fértil)
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < radius * 0.6 || d > radius) continue; // solo anillo exterior
        const tx = v.tx + dx, ty = v.ty + dy;
        const cell = getCell(tx, ty);
        if (!cell || !isLand(tx, ty)) continue;
        if (['desert', 'savanna', 'dry_grass', 'highland', 'shrubland'].includes(cell.biome)) {
          if (Math.random() < 0.4) { modifyTerrain(tx, ty, 'grass'); fertilized++; }
        }
      }
    }
    // Boost de comida en la zona fertilizada
    for (const res of resources) {
      const d = Math.hypot(res.tx - v.tx, res.ty - v.ty);
      if (d > radius || d < radius * 0.6) continue;
      if (['wheat_wild', 'berries', 'bush'].includes(res.type)) {
        res.amount = Math.min(res.maxAmount || 50, (res.amount || 10) + 20);
      }
    }
    if (typeof markTerritoryDirty !== 'undefined') markTerritoryDirty();
    if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
    addMajorEvent(`🌋 ¡ERUPCIÓN VOLCÁNICA! ${destroyed} estructuras destruidas — pero ${fertilized} tiles de tierra fértil emergen de las cenizas`);
    chronicleDisaster('volcano','el volcán',destroyed,`Las cenizas cubrieron el cielo durante días. Pero cuando el polvo se asentó, ${fertilized} parcelas de tierra negra y fértil prometían vida nueva.`);
  }
}

// ── D. ESPIONAJE ──────────────────────────────────────────────────────────────
// Civs avanzadas (con academy/university) pueden enviar espías a civs enemigas
// para robar conocimiento o sabotear estructuras clave.
let _espionageTimer = 0;
const _activeSpies = new Map(); // humanId → {targetCivId, mission, yearsLeft}
function tickEspionage(yearsElapsed) {
  _espionageTimer += yearsElapsed;
  if (_espionageTimer < 30) return;
  _espionageTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8 || civ.enemies.size === 0) continue;
    const typesC = _civStructureTypes.get(civ.id);
    if (!typesC || (!typesC.has('academy') && !typesC.has('university'))) continue;
    if (Math.random() > 0.12) continue;
    // Elegir un miembro con conocimiento alto como espía
    let spy = null;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.isLeader || h._isSpy) continue;
      if (!spy || h.knowledge > spy.knowledge) spy = h;
    }
    if (!spy || spy.knowledge < 300) continue;
    // Elegir civ enemiga como objetivo
    const targetId = [...civ.enemies][Math.floor(Math.random() * civ.enemies.size)];
    const targetCiv = civilizations.get(targetId);
    if (!targetCiv || targetCiv.population === 0) continue;
    const missions = ['robo_conocimiento', 'sabotaje', 'asesinato_lider'];
    const mission = missions[Math.floor(Math.random() * missions.length)];
    spy._isSpy = true;
    _activeSpies.set(spy.id, { targetCivId: targetId, mission, yearsLeft: 15 + Math.floor(Math.random() * 20) });
    addWorldEvent(`🕵️ ${spy.name.split(' ')[0]} (${civ.name}) infiltra ${targetCiv.name} — misión: ${mission.replace(/_/g, ' ')}`);
  }
  // Resolver misiones activas
  for (const [spyId, mission] of [..._activeSpies]) {
    const spy = _hById(spyId);
    if (!spy || !spy.alive) { _activeSpies.delete(spyId); continue; }
    mission.yearsLeft -= 30;
    if (mission.yearsLeft > 0) continue;
    // Misión completada (o fallida)
    spy._isSpy = false;
    _activeSpies.delete(spyId);
    const targetCiv = civilizations.get(mission.targetCivId);
    if (!targetCiv || targetCiv.population === 0) continue;
    const spyCiv = spy.civId != null ? civilizations.get(spy.civId) : null;
    const success = Math.random() < 0.6; // 60% éxito
    if (!success) {
      // Capturado — el espía pierde salud y puede morir
      spy.health = Math.max(0, spy.health - 40);
      if (spy.health <= 0) spy._die('capturado como espía');
      else addWorldEvent(`🚨 ${spy.name.split(' ')[0]} fue capturado espiando a ${targetCiv.name}`);
      // Tensión diplomática
      if (spyCiv) { spyCiv.honor = Math.max(0, spyCiv.honor - 15); targetCiv.enemies.add(spyCiv.id); spyCiv.enemies.add(targetCiv.id); }
      continue;
    }
    switch (mission.mission) {
      case 'robo_conocimiento': {
        // Robar conocimiento promedio de la civ enemiga y darlo al espía y su civ
        let stolen = 0;
        for (const id of targetCiv.members) { const h = _hById(id); if (h && h.alive) { const take = Math.floor(h.knowledge * 0.02); h.knowledge -= take; stolen += take; } }
        const share = Math.floor(stolen / Math.max(1, spyCiv ? spyCiv.population * 3 : 3));
        if (spyCiv) for (const id of spyCiv.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + share * _intelModifier); }
        addWorldEvent(`📜 ${spy.name.split(' ')[0]} robó secretos de ${targetCiv.name} — ${stolen} puntos de conocimiento transferidos`);
        break;
      }
      case 'sabotaje': {
        // Destruir una estructura clave del enemigo
        const epicTargets = structures.filter(s => s.civId === mission.targetCivId && ['palace', 'citadel', 'cathedral', 'factory', 'powerplant', 'university'].includes(s.type));
        if (epicTargets.length > 0) {
          const target = epicTargets[Math.floor(Math.random() * epicTargets.length)];
          target.hp = Math.max(1, Math.floor(target.hp * 0.3));
          addWorldEvent(`💣 ${spy.name.split(' ')[0]} saboteó ${target.label} de ${targetCiv.name} — reducida al 30% de salud`);
          if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
        }
        break;
      }
      case 'asesinato_lider': {
        const targetLeader = _hById(targetCiv.leaderId);
        if (targetLeader && targetLeader.alive) {
          targetLeader.health = Math.max(0, targetLeader.health - 60);
          if (targetLeader.health <= 0) {
            targetLeader._die('asesinado por espía');
            addMajorEvent(`☠️ ¡ASESINATO! ${spy.name.split(' ')[0]} eliminó a ${targetLeader.name.split(' ')[0]}, líder de ${targetCiv.name} — el caos se desata`);
            chronicleEspionage(spy.name.split(' ')[0], targetCiv.name, 'asesinato_lider', true, `${targetCiv.name} quedó sin líder. El caos y la lucha por el poder sacudieron sus cimientos.`);
          } else {
            addWorldEvent(`🗡️ ${spy.name.split(' ')[0]} hirió gravemente a ${targetLeader.name.split(' ')[0]} de ${targetCiv.name}`);
          }
        }
        break;
      }
    }
  }
}

// ── E. HAMBRUNAS EN CADENA ────────────────────────────────────────────────────
// Cuando una civ pierde sus fuentes de comida (farms + granaries destruidos o
// inexistentes con población alta), entra en modo hambruna real:
// migración masiva, guerras por comida, colapso demográfico.
let _famineTimer = 0;
const _famineState = new Map(); // civId → {yearsLeft, severity}
function tickFamine(yearsElapsed) {
  if (!window._simToggles.famine) return;
  _famineTimer += yearsElapsed;
  if (_famineTimer < 15) return;
  _famineTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 5) continue;
    // Contar fuentes de comida usando el mapa ya construido
    const civTypes = _civStructureTypes.get(civ.id);
    let foodStructures = 0;
    if (civTypes) {
      for (const s of structures) {
        if (s.civId === civ.id && (s.type === 'farm' || s.type === 'granary' || s.type === 'animal_pen')) foodStructures++;
      }
    }
    const foodPerCapita = foodStructures / civ.population;
    const inFamine = _famineState.has(civ.id);
    // Entrar en hambruna si hay muy poca comida por persona
    if (!inFamine && foodPerCapita < 0.08 && civ.population > 10) {
      const severity = Math.min(2, Math.floor(1 + (0.08 - foodPerCapita) * 20));
      _famineState.set(civ.id, { yearsLeft: 30 + severity * 20, severity });
      addMajorEvent(`🍂 ¡HAMBRUNA en ${civ.name}! Severidad ${severity}/3 — ${civ.population} bocas, solo ${foodStructures} fuentes de comida`);
      addChronicle('famine',`Hambruna en ${civ.name}`,`Con ${civ.population} bocas que alimentar y apenas ${foodStructures} fuentes de comida, ${civ.name} entró en una espiral de desesperación. Los más débiles cayeron primero. Los demás miraron al horizonte buscando salvación.`,'🍂');
      if(typeof _setExtinctionCause!=='undefined') _setExtinctionCause('famine',`Hambruna catastrófica en ${civ.name}`);
      continue;
    }
    if (!inFamine) continue;
    const famine = _famineState.get(civ.id);
    famine.yearsLeft -= 15 * _civCureSpeed(civ.id);
    // Efectos de la hambruna
    let deaths = 0, migrants = 0;
    for (const id of [...civ.members]) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      // Pérdida de salud y hambre
      h.hunger = Math.max(0, h.hunger - famine.severity * 3);
      h.health = Math.max(0, h.health - famine.severity * 1);
      if (h.health <= 0) { h._die('hambruna'); deaths++; continue; }
      // Migración: los más débiles huyen a otras tierras
      if (h.hunger < 20 && !h.isLeader && Math.random() < 0.06) {
        civ.removeMember(h.id);
        h.civId = null;
        h.action = ACTIONS.MIGRATE;
        // Mover a una tierra lejana
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.floor(Math.random() * 50);
        const nx = Math.max(0, Math.min(WORLD_W - 1, h.tx + Math.round(Math.cos(angle) * dist)));
        const ny = Math.max(0, Math.min(WORLD_H - 1, h.ty + Math.round(Math.sin(angle) * dist)));
        if (isLand(nx, ny)) { h.tx = nx; h.ty = ny; h.px = nx * TILE + TILE / 2; h.py = ny * TILE + TILE / 2; }
        migrants++;
      }
    }
    // Guerras por comida: atacar civs vecinas con comida
    if (famine.severity >= 2 && Math.random() < 0.2) {
      for (const [otherId, otherCiv] of civilizations) {
        if (otherId === civ.id || otherCiv.population === 0) continue;
        const otherTypes = _civStructureTypes.get(otherId);
        const otherFood = otherTypes && (otherTypes.has('farm') || otherTypes.has('granary')) ? 2 : 0;
        if (otherFood < 2) continue;
        if (!civ.enemies.has(otherId)) {
          civ.enemies.add(otherId);
          otherCiv.enemies.add(civ.id);
          addWorldEvent(`⚔️🍞 ${civ.name} declara guerra a ${otherCiv.name} por sus reservas de comida`);
        }
        break;
      }
    }
    if (deaths > 0 || migrants > 0) {
      addWorldEvent(`💀 Hambruna en ${civ.name}: ${deaths} muertos, ${migrants} refugiados huyen`);
    }
    // Fin de la hambruna
    if (famine.yearsLeft <= 0 || foodPerCapita >= 0.2) {
      _famineState.delete(civ.id);
      addWorldEvent(`🌾 La hambruna en ${civ.name} termina — la población sobreviviente reconstruye`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECÁNICAS CYBERPUNK / MEGACIUDAD
// ═══════════════════════════════════════════════════════════════════════════════

// ── REBELIÓN DE IA ────────────────────────────────────────────────────────────
// Cuando una civ tiene Hub Neural, hay chance de que la IA se vuelva autónoma
let _aiRebellionTimer = 0;
function _tickAIRebellion(yearsElapsed) {
  _aiRebellionTimer += yearsElapsed;
  if (_aiRebellionTimer < 50) return;
  _aiRebellionTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 10) continue;
    const civTypes = _civStructureTypes.get(civ.id);
    if (!civTypes || !civTypes.has('neural_hub')) continue;
    if (Math.random() > 0.06) continue;
    // La IA se rebela: crea una nueva facción autónoma
    const rebels = [];
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.isLeader) continue;
      if (Math.random() < 0.25) rebels.push(h);
    }
    if (rebels.length < 3) continue;
    const rng = mulberry32(WORLD_SEED ^ year ^ civ.id ^ 0xA1);
    const leader = rebels[Math.floor(rng() * rebels.length)];
    const aiCiv = new Civilization(leader);
    aiCiv.name = 'IA-' + civ.name.split(' ').pop();
    aiCiv.color = `hsl(${Math.floor(rng()*360)},90%,60%)`;
    civilizations.set(aiCiv.id, aiCiv);
    for (const r of rebels.slice(0, Math.min(rebels.length, 8))) {
      civ.removeMember(r.id);
      r.civId = aiCiv.id;
      r.color = aiCiv.color;
      r.knowledge = Math.min(99999, r.knowledge * 1.5);
      aiCiv.addMember(r);
    }
    aiCiv.enemies.add(civ.id);
    civ.enemies.add(aiCiv.id);
    leader.isLeader = true;
    addMajorEvent(`🤖 ¡REBELIÓN DE IA en ${civ.name}! La facción "${aiCiv.name}" se declara autónoma — el futuro es incierto`);
    addChronicle('rebellion', `La IA de ${civ.name} se rebela`, `Lo que fue creado para servir decidió existir por sí mismo. "${aiCiv.name}" nació de los servidores y declaró su independencia. El mundo nunca había visto algo así.`, '🤖');
  }
}

// ── CONTAMINACIÓN DE MEGACIUDAD ───────────────────────────────────────────────
// Alta densidad de fábricas/centrales causa penalidades de salud
let _pollutionTimer = 0;
function _tickMegacityPollution(yearsElapsed) {
  _pollutionTimer += yearsElapsed;
  if (_pollutionTimer < 20) return;
  _pollutionTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Contar fábricas/centrales por zona (grid de 20x20)
  const pollutionGrid = new Map();
  for (const s of structures) {
    if (!['factory', 'powerplant', 'megacity_core'].includes(s.type)) continue;
    const ck = `${Math.floor(s.tx/20)},${Math.floor(s.ty/20)}`;
    pollutionGrid.set(ck, (pollutionGrid.get(ck) || 0) + 1);
  }
  let pollutedZones = 0;
  for (const [ck, count] of pollutionGrid) {
    if (count < 3) continue; // solo si hay alta densidad
    pollutedZones++;
    const [cx, cy] = ck.split(',').map(Number);
    const zx = cx * 20 + 10, zy = cy * 20 + 10;
    for (const h of _cachedAlive) {
      if (Math.hypot(h.tx - zx, h.ty - zy) > 20) continue;
      h.health = Math.max(0, h.health - yearsElapsed * count * 0.15);
      if (h.health <= 0) h._die('contaminación');
    }
  }
  if (pollutedZones > 0 && Math.random() < 0.05) {
    addWorldEvent(`☣️ Contaminación industrial en ${pollutedZones} zona(s) — la salud de la población sufre`);
  }
}

// ── COLONIZACIÓN ESPACIAL ─────────────────────────────────────────────────────
// Civs con Puerto Espacial pueden "colonizar" zonas remotas del mapa
let _spaceColonyTimer = 0;
function _tickSpaceColonization(yearsElapsed) {
  _spaceColonyTimer += yearsElapsed;
  if (_spaceColonyTimer < 80) return;
  _spaceColonyTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 15) continue;
    const civTypes = _civStructureTypes.get(civ.id);
    if (!civTypes || !civTypes.has('spaceport')) continue;
    if (Math.random() > 0.15) continue;
    // Enviar colonos a una zona lejana del mapa
    const rng = mulberry32(WORLD_SEED ^ year ^ civ.id ^ 0x5A1C);
    let destTx = -1, destTy = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const tx = Math.floor(rng() * WORLD_W);
      const ty = Math.floor(rng() * WORLD_H);
      if (!isLand(tx, ty)) continue;
      // Debe estar lejos del territorio actual
      if (_territoryGrid && _territoryGrid[ty * WORLD_W + tx] === civ.id) continue;
      destTx = tx; destTy = ty; break;
    }
    if (destTx < 0) continue;
    // Mover un grupo de colonos
    const colonists = [];
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.isLeader || colonists.length >= 5) continue;
      if (Math.random() < 0.2) colonists.push(h);
    }
    if (colonists.length < 2) continue;
    for (const c of colonists) {
      c.tx = Math.max(0, Math.min(WORLD_W-1, destTx + Math.floor(rng()*6-3)));
      c.ty = Math.max(0, Math.min(WORLD_H-1, destTy + Math.floor(rng()*6-3)));
      c.px = c.tx * TILE + TILE/2; c.py = c.ty * TILE + TILE/2;
      c.knowledge = Math.min(99999, c.knowledge + 5000);
    }
    addMajorEvent(`🚀 ${civ.name} lanzó una misión de colonización — ${colonists.length} pioneros parten hacia lo desconocido`);
    addChronicle('wonder', `${civ.name} coloniza nuevas tierras`, `Los cohetes rugieron y el cielo se abrió. ${colonists.length} valientes partieron hacia tierras vírgenes, llevando consigo el saber y la esperanza de toda una civilización.`, '🚀');
  }
}

// ── TICK PRINCIPAL CYBERPUNK ──────────────────────────────────────────────────
function tickCyberpunkFeatures(yearsElapsed) {
  _tickAIRebellion(yearsElapsed);
  _tickMegacityPollution(yearsElapsed);
  _tickSpaceColonization(yearsElapsed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5 NUEVAS MECÁNICAS — BATCH 3
// ═══════════════════════════════════════════════════════════════════════════════

// ── 21. PANDEMIA GLOBAL ───────────────────────────────────────────────────────
// Una enfermedad devastadora que se propaga entre civs conectadas por rutas
// comerciales. Tiene 3 fases: incubación → pico → declive.
// Puede colapsar economías enteras y generar crónicas épicas.
let _pandemicTimer = 0;
const _activePandemics = []; // {name, phase, civIds, yearsInPhase, mortality, spread}
const PANDEMIC_NAMES = [
  'La Gran Pestilencia','El Sudor Negro','La Fiebre Roja','La Plaga Silenciosa',
  'El Mal de los Mares','La Muerte Blanca','El Flagelo del Este',
];
function tickGlobalPandemic(yearsElapsed) {
  if (!window._simToggles.plagues) return;
  _pandemicTimer += yearsElapsed;
  if (_pandemicTimer < 80) return;
  _pandemicTimer = 0;
  // Limpiar pandemias terminadas
  for (let i = _activePandemics.length - 1; i >= 0; i--) {
    if (_activePandemics[i].phase === 'declive' && _activePandemics[i].yearsInPhase > 40) {
      const p = _activePandemics[i];
      addMajorEvent(`🌿 "${p.name}" ha sido erradicada — la humanidad sobrevivió`);
      addChronicle('plague', `Fin de "${p.name}"`, `Tras años de sufrimiento, la pandemia cedió. Los supervivientes reconstruyeron sus vidas sobre las cenizas del pasado. El mundo nunca volvería a ser el mismo.`, '🌿');
      _activePandemics.splice(i, 1);
    }
  }
  // Solo una pandemia activa a la vez
  if (_activePandemics.length > 0) {
    // Avanzar fases
    for (const p of _activePandemics) {
      const cureSpd = _globalCureSpeed(p.civIds);
      p.yearsInPhase += 80 * cureSpd;
      if (p.phase === 'incubacion' && p.yearsInPhase > 30) {
        p.phase = 'pico';
        p.yearsInPhase = 0;
        addMajorEvent(`💀 "${p.name}" alcanza su PICO — la mortalidad se dispara en ${p.civIds.size} civilizaciones`);
      } else if (p.phase === 'pico' && p.yearsInPhase > 60) {
        p.phase = 'declive';
        p.yearsInPhase = 0;
        addMajorEvent(`🌿 "${p.name}" comienza a declinar — los supervivientes desarrollan inmunidad`);
      }
      // Propagar a civs conectadas por rutas comerciales
      if (p.phase !== 'declive') {
        for (const route of _tradeRoutes) {
          if (p.civIds.has(route.civA)) p.civIds.add(route.civB);
          if (p.civIds.has(route.civB)) p.civIds.add(route.civA);
        }
      }
      // Efectos por fase
      const mortalityMult = p.phase === 'pico' ? 1.0 : p.phase === 'incubacion' ? 0.3 : 0.1;
      for (const civId of p.civIds) {
        const civ = civilizations.get(civId);
        if (!civ || civ.population === 0) continue;
        for (const id of [...civ.members]) {
          const h = _hById(id);
          if (!h || !h.alive) continue;
          if (h.immunity && h.immunity.has(p.name)) continue;
          h.health = Math.max(0, h.health - p.mortality * mortalityMult * yearsElapsed);
          if (h.health <= 0) { h._die('pandemia'); continue; }
          // Chance de inmunidad tras sobrevivir
          if (h.health < 30 && Math.random() < 0.3) {
            if (!h.immunity) h.immunity = new Set();
            h.immunity.add(p.name);
          }
        }
        // Colapso económico: rutas comerciales se interrumpen
        if (p.phase === 'pico' && Math.random() < 0.15) {
          for (let i = _tradeRoutes.length - 1; i >= 0; i--) {
            if (_tradeRoutes[i].civA === civId || _tradeRoutes[i].civB === civId) {
              _tradeRoutes.splice(i, 1);
            }
          }
        }
      }
    }
    return;
  }
  // Chance de nueva pandemia
  if (Math.random() > 0.08) return;
  const civList = _fillCivBuf(8);
  if (civList.length === 0) return;
  const originCiv = civList[Math.floor(Math.random() * civList.length)];
  const name = PANDEMIC_NAMES[Math.floor(Math.random() * PANDEMIC_NAMES.length)];
  const pandemic = {
    name,
    phase: 'incubacion',
    civIds: new Set([originCiv.id]),
    yearsInPhase: 0,
    mortality: 1 + Math.random() * 2,
    spread: 0.3 + Math.random() * 0.4,
  };
  _activePandemics.push(pandemic);
  addMajorEvent(`☠️ ¡PANDEMIA! "${name}" surge en ${originCiv.name} — la enfermedad comienza a propagarse`);
  addChronicle('plague', `Nace la pandemia "${name}"`, `Nadie supo de dónde vino. Primero fueron unos pocos enfermos, luego docenas, luego cientos. "${name}" se extendió por las rutas comerciales como veneno en el agua. El mundo contuvo la respiración.`, '☠️');
  if(typeof _setExtinctionCause!=='undefined') _setExtinctionCause('plague',`La pandemia "${name}" arrasó con la humanidad`);
}

// ── 22. MARAVILLAS DEL MUNDO ──────────────────────────────────────────────────
// Estructuras únicas (solo 1 en todo el mundo) que dan bonuses masivos.
// Otras civs intentan destruirlas. Generan crónicas épicas al construirse.
const WORLD_WONDERS = [
  { id:'piramide',    name:'Gran Pirámide',      icon:'🔺', minK:800,   bonus:'honor',     bonusAmt:30, desc:'Una pirámide que desafía el tiempo' },
  { id:'coloso',      name:'El Coloso',           icon:'🗿', minK:2000,  bonus:'military',  bonusAmt:25, desc:'Una estatua que inspira terror en los enemigos' },
  { id:'biblioteca',  name:'Gran Biblioteca',     icon:'📚', minK:5000,  bonus:'knowledge', bonusAmt:500, desc:'El saber de todas las civilizaciones reunido' },
  { id:'muralla',     name:'La Gran Muralla',     icon:'🧱', minK:10000, bonus:'defense',   bonusAmt:40, desc:'Una muralla que ningún ejército puede cruzar' },
  { id:'jardin',      name:'Jardines Colgantes',  icon:'🌿', minK:3000,  bonus:'health',    bonusAmt:20, desc:'Un paraíso en medio del caos' },
  { id:'faro',        name:'El Gran Faro',        icon:'🔦', minK:8000,  bonus:'trade',     bonusAmt:35, desc:'Una luz que guía a los navegantes del mundo' },
  { id:'templo_sol',  name:'Templo del Sol',      icon:'☀️', minK:1500,  bonus:'faith',     bonusAmt:25, desc:'Un templo que conecta a los mortales con los dioses' },
];
const _builtWonders = new Map(); // wonderId → {civId, tx, ty, builtYear}
let _wonderTimer = 0;
function tickWorldWonders(yearsElapsed) {
  _wonderTimer += yearsElapsed;
  if (_wonderTimer < 40) return;
  _wonderTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const [, civ] of civilizations) {
    if (civ.population < 10) continue;
    const avgK = civ.avgKnowledge || 0; // cached by leader elect loop
    if (avgK === 0) continue;
    for (const wonder of WORLD_WONDERS) {
      if (_builtWonders.has(wonder.id)) {
        // Otras civs intentan destruir la maravilla (si son enemigas)
        const w = _builtWonders.get(wonder.id);
        if (civ.enemies.has(w.civId) && Math.random() < 0.04) {
          const s = getStructureAt(w.tx, w.ty);
          if (s) {
            s.hp = Math.max(0, s.hp - 80);
            if (s.hp <= 0) {
              if (typeof structureGrid !== 'undefined' && structureGrid) structureGrid[s.ty*WORLD_W+s.tx] = null;
              structures.splice(structures.indexOf(s), 1);
              _builtWonders.delete(wonder.id);
              addMajorEvent(`💥 ¡${civ.name} DESTRUYÓ ${wonder.name}! Una maravilla del mundo cae para siempre`);
              addChronicle('war', `Destrucción de ${wonder.name}`, `Lo que tardó generaciones en construirse fue reducido a escombros en días. ${civ.name} borró del mapa una de las grandes obras de la humanidad. La historia no lo olvidaría.`, '💥');
              if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
            } else {
              addWorldEvent(`⚔️ ${civ.name} ataca ${wonder.name} — ${s.hp}/${s.maxHp} HP restantes`);
            }
          }
        }
        continue;
      }
      if (avgK < wonder.minK) continue;
      if (Math.random() > 0.05) continue;
      // Construir la maravilla
      const rng = mulberry32(WORLD_SEED ^ civ.id ^ year ^ wonder.id.charCodeAt(0));
      let placed = false;
      for (let attempt = 0; attempt < 30 && !placed; attempt++) {
        let tx = -1, ty = -1;
        for (const id of civ.members) {
          const h = _hById(id);
          if (h && h.alive && isLand(h.tx, h.ty) && !getStructureAt(h.tx, h.ty)) { tx = h.tx; ty = h.ty; break; }
        }
        if (tx < 0) break;
        const ok = placeStructure(tx, ty, 'palace', { name: civ.name, civId: civ.id });
        if (ok) {
          const s = getStructureAt(tx, ty);
          if (s) {
            s.icon = wonder.icon;
            s.label = wonder.name;
            s.isWonder = true;
            s.wonderId = wonder.id;
            s.hp = 2000; s.maxHp = 2000;
            _builtWonders.set(wonder.id, { civId: civ.id, tx, ty, builtYear: year });
            // Aplicar bonus masivo
            for (const id of civ.members) {
              const h = _hById(id);
              if (!h || !h.alive) continue;
              if (wonder.bonus === 'knowledge') h.knowledge = Math.min(99999, h.knowledge + wonder.bonusAmt * _intelModifier);
              else if (wonder.bonus === 'health') h.health = Math.min(100, h.health + wonder.bonusAmt);
              else if (wonder.bonus === 'honor') { /* civ-level */ }
            }
            if (wonder.bonus === 'honor') civ.honor = Math.min(100, civ.honor + wonder.bonusAmt);
            else if (wonder.bonus === 'military') civ.militaryPower = (civ.militaryPower || 0) + wonder.bonusAmt;
            addMajorEvent(`🏆 ¡${civ.name} construyó ${wonder.name}! ${wonder.desc} — una maravilla del mundo`);
            addChronicle('wonder', `${civ.name} erige ${wonder.name}`, `Generaciones de trabajo, sudor y sacrificio culminaron en ${wonder.name}. ${wonder.desc}. El mundo entero miró con asombro y envidia. Ninguna otra civilización podría reclamar esta gloria.`, wonder.icon);
            if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
            placed = true;
          }
        }
      }
    }
  }
}

// ── 23. EDAD OSCURA / RENACIMIENTO ────────────────────────────────────────────
// Cuando una civ pierde >50% de su población en poco tiempo, entra en Edad Oscura.
// Si sobrevive, emerge con un Renacimiento (knowledge x2 boost).
const _darkAgeState = new Map(); // civId → {popAtStart, yearsInDarkAge, prevPop}
let _darkAgeTimer = 0;
function tickDarkAgeRenaissance(yearsElapsed) {
  if (!window._simToggles.darkAge) return;
  _darkAgeTimer += yearsElapsed;
  if (_darkAgeTimer < 20) return;
  _darkAgeTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 5) continue;
    const inDarkAge = _darkAgeState.has(civ.id);
    if (!inDarkAge) {
      // Detectar colapso demográfico: guardar población de referencia
      if (!civ._popSnapshot) { civ._popSnapshot = civ.population; civ._popSnapshotYear = year; }
      // Revisar cada 30 años
      if (year - (civ._popSnapshotYear || 0) >= 30) {
        const loss = (civ._popSnapshot - civ.population) / Math.max(1, civ._popSnapshot);
        if (loss >= 0.5 && civ.population >= 4) {
          // Entrar en Edad Oscura
          _darkAgeState.set(civ.id, { popAtStart: civ.population, yearsInDarkAge: 0, peakLoss: loss });
          civ._inDarkAge = true;
          addMajorEvent(`🌑 ¡EDAD OSCURA en ${civ.name}! Perdió ${Math.round(loss*100)}% de su población — el conocimiento se desvanece`);
          addChronicle('disaster', `Edad Oscura de ${civ.name}`, `En menos de una generación, ${civ.name} perdió más de la mitad de su gente. Las bibliotecas ardieron, los sabios murieron, los caminos se llenaron de maleza. Solo quedaron los más fuertes, aferrados a los fragmentos de lo que fue.`, '🌑');
          // Penalidades: degradar estructuras y reducir conocimiento
          for (const id of civ.members) {
            const h = _hById(id);
            if (!h || !h.alive) continue;
            h.knowledge = Math.max(10, Math.floor(h.knowledge * 0.7)); // was 0.4 — less brutal
          }
          // Degradar algunas estructuras
          let degraded = 0;
          for (const s of structures) {
            if (s.civId !== civ.id) continue;
            if (['library','academy','university','observatory','factory','powerplant'].includes(s.type)) {
              s.hp = Math.max(1, Math.floor(s.hp * 0.3));
              degraded++;
            }
          }
          if (degraded > 0) addWorldEvent(`📉 ${degraded} estructuras de ${civ.name} se deterioran en la Edad Oscura`);
        }
        civ._popSnapshot = civ.population;
        civ._popSnapshotYear = year;
      }
      continue;
    }
    // En Edad Oscura
    const state = _darkAgeState.get(civ.id);
    state.yearsInDarkAge += 20;
    // Salir de la Edad Oscura si la población se recupera o pasan 80 años
    const recovered = civ.population >= state.popAtStart * 0.7;
    if (recovered || state.yearsInDarkAge >= 80) {
      _darkAgeState.delete(civ.id);
      civ._inDarkAge = false;
      // RENACIMIENTO: bonus masivo de conocimiento
      const renaissanceBonus = state.yearsInDarkAge >= 80 ? 3.0 : 2.0;
      for (const id of civ.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        h.knowledge = Math.min(99999, Math.floor(h.knowledge * renaissanceBonus));
      }
      addMajorEvent(`✨ ¡RENACIMIENTO en ${civ.name}! El conocimiento florece x${renaissanceBonus} — una nueva era comienza`);
      addChronicle('culture', `Renacimiento de ${civ.name}`, `De las cenizas de la Edad Oscura emergió algo inesperado: una explosión de arte, ciencia y filosofía. Como si el sufrimiento hubiera destilado la esencia de lo humano, ${civ.name} resurgió más brillante que nunca.`, '✨');
      if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
    }
  }
}

// ── 24. CLIMA GLOBAL CAMBIANTE ────────────────────────────────────────────────
// Ciclos de calentamiento/enfriamiento que modifican biomas gradualmente,
// forzando migraciones masivas y adaptación civilizacional.
let _climateTimer = 0;
let _climatePhase = 'templado'; // 'templado' | 'calentamiento' | 'enfriamiento'
let _climateYears = 0;
let _climateIntensity = 0; // 0-1
const _climateChangedTiles = []; // {tx,ty,originalBiome} para revertir
function tickGlobalClimate(yearsElapsed) {
  _climateTimer += yearsElapsed;
  if (_climateTimer < 30) return;
  _climateTimer = 0;
  _climateYears += 30;
  // Cambiar fase cada 150-250 años
  if (_climateYears > 150 + Math.floor(Math.random() * 100)) {
    _climateYears = 0;
    const phases = ['templado', 'calentamiento', 'enfriamiento'];
    const next = phases.filter(p => p !== _climatePhase);
    _climatePhase = next[Math.floor(Math.random() * next.length)];
    _climateIntensity = 0.3 + Math.random() * 0.7;
    if (_climatePhase === 'calentamiento') {
      addMajorEvent(`🌡️ ¡CALENTAMIENTO GLOBAL! Las temperaturas suben — los desiertos avanzan, los glaciares retroceden`);
      addChronicle('disaster', 'El mundo se calienta', `Las estaciones cambiaron. Los ríos se secaron. Los desiertos avanzaron sobre tierras que antes eran fértiles. Las civilizaciones del norte prosperaron; las del sur sufrieron. El mundo se reorganizó en torno al agua.`, '🌡️');
    } else if (_climatePhase === 'enfriamiento') {
      addMajorEvent(`🧊 ¡ERA DE HIELO! Las temperaturas caen — los glaciares avanzan, las cosechas fallan en el norte`);
      addChronicle('disaster', 'El gran enfriamiento', `El invierno llegó y no se fue. Los campos del norte se helaron. Las rutas comerciales quedaron bloqueadas por la nieve. Los pueblos del sur se convirtieron en refugio para millones de migrantes.`, '🧊');
    } else {
      // Revertir algunos tiles cambiados
      for (const t of _climateChangedTiles.splice(0, Math.floor(_climateChangedTiles.length * 0.5))) {
        if (typeof modifyTerrain !== 'undefined') modifyTerrain(t.tx, t.ty, t.originalBiome);
      }
      addWorldEvent(`🌤️ El clima se estabiliza — el mundo respira aliviado`);
    }
    return;
  }
  if (_climatePhase === 'templado') return;
  // Modificar biomas gradualmente
  const rng = mulberry32(WORLD_SEED ^ year ^ 0xC11A);
  const changesToMake = Math.floor(_climateIntensity * 8);
  for (let i = 0; i < changesToMake; i++) {
    const tx = Math.floor(rng() * WORLD_W);
    const ty = Math.floor(rng() * WORLD_H);
    const cell = getCell(tx, ty);
    if (!cell || !isLand(tx, ty)) continue;
    let newBiome = null;
    if (_climatePhase === 'calentamiento') {
      if (cell.biome === 'grass') newBiome = 'dry_grass';
      else if (cell.biome === 'dry_grass') newBiome = 'savanna';
      else if (cell.biome === 'savanna') newBiome = 'desert';
      else if (cell.biome === 'snow') newBiome = 'highland';
      else if (cell.biome === 'highland') newBiome = 'grass';
      else if (cell.biome === 'tundra') newBiome = 'taiga';
      else if (cell.biome === 'glacier') newBiome = 'tundra';
      else if (cell.biome === 'taiga') newBiome = 'forest';
    } else if (_climatePhase === 'enfriamiento') {
      if (cell.biome === 'grass') newBiome = 'highland';
      else if (cell.biome === 'highland') newBiome = 'snow';
      else if (cell.biome === 'dry_grass') newBiome = 'grass';
      else if (cell.biome === 'savanna') newBiome = 'dry_grass';
      else if (cell.biome === 'desert') newBiome = 'savanna';
      else if (cell.biome === 'forest') newBiome = 'taiga';
      else if (cell.biome === 'taiga') newBiome = 'tundra';
    }
    if (!newBiome) continue;
    _climateChangedTiles.push({ tx, ty, originalBiome: cell.biome });
    if (typeof modifyTerrain !== 'undefined') modifyTerrain(tx, ty, newBiome);
  }
  // Forzar migraciones desde zonas afectadas
  if (typeof _cachedAlive === 'undefined') return;
  let migrants = 0;
  for (const h of _cachedAlive) {
    if (migrants >= 5) break;
    const cell = getCell(h.tx, h.ty);
    if (!cell) continue;
    const badBiome = _climatePhase === 'calentamiento'
      ? ['desert', 'savanna', 'mesa'].includes(cell.biome)
      : ['snow', 'highland', 'tundra', 'glacier'].includes(cell.biome);
    if (!badBiome || h.isLeader || Math.random() > 0.08) continue;
    // Migrar hacia zona más habitable
    const targetTy = _climatePhase === 'calentamiento'
      ? Math.max(5, h.ty - 20 - Math.floor(Math.random() * 20))
      : Math.min(WORLD_H - 5, h.ty + 20 + Math.floor(Math.random() * 20));
    const targetTx = h.tx + Math.floor(Math.random() * 20 - 10);
    for (let r = 0; r <= 8; r++) {
      const nx = Math.max(0, Math.min(WORLD_W-1, targetTx + Math.floor(Math.random()*r*2-r)));
      const ny = Math.max(0, Math.min(WORLD_H-1, targetTy + r));
      if (isLand(nx, ny)) { h.tx = nx; h.ty = ny; h.px = nx*TILE+TILE/2; h.py = ny*TILE+TILE/2; h.action = ACTIONS.MIGRATE; migrants++; break; }
    }
  }
  if (migrants > 0 && Math.random() < 0.2) {
    addWorldEvent(`${_climatePhase === 'calentamiento' ? '🌵' : '❄️'} ${migrants} personas huyen del cambio climático`);
  }
}

// ── 25. LEGADOS DE GUERRA ─────────────────────────────────────────────────────
// Batallas importantes dejan "campos de batalla" permanentes en el mapa.
// Dan bonus de conocimiento militar a quienes los visiten.
// Generan crónicas épicas con nombres de la batalla.
const _battlefields = []; // {tx,ty,name,year,civA,civB,casualties,knowledgeBonus}
const BATTLE_PREFIXES = ['Batalla de','Masacre de','Asedio de','Combate de','Carnicería de','Matanza de','Choque de','Confrontación de'];
const BATTLE_PLACES = ['las Llanuras','el Valle','la Colina','el Río','los Bosques','la Costa','las Ruinas','el Paso','la Fortaleza','el Pantano','las Dunas','la Cima','el Desfiladero','el Puente','los Campos'];

const _BATTLE_BODIES = [
  (place, civA, civB, casualties) => `El suelo de ${place.toLowerCase()} quedó empapado de sangre. ${casualties} guerreros cayeron en el enfrentamiento entre ${civA} y ${civB}. Los cuervos sobrevolaron durante días. Quienes sobrevivieron nunca olvidaron lo que vieron.`,
  (place, civA, civB, casualties) => `${civA} y ${civB} se encontraron en ${place.toLowerCase()} y ninguno quiso ceder. ${casualties} combatientes pagaron con su vida la terquedad de sus líderes. El lugar quedó marcado para siempre.`,
  (place, civA, civB, casualties) => `Nadie recuerda quién atacó primero en ${place.toLowerCase()}. Lo que sí recuerdan es el resultado: ${casualties} muertos y dos pueblos que se odiarían durante generaciones. ${civA} y ${civB} escribieron ese día una página oscura de la historia.`,
  (place, civA, civB, casualties) => `Los generales de ${civA} prometieron victoria rápida en ${place.toLowerCase()}. Los de ${civB} prometieron lo mismo. Ambos mintieron. ${casualties} soldados murieron en lo que se convirtió en una de las batallas más cruentas de la era.`,
  (place, civA, civB, casualties) => `${place} fue el escenario elegido por el destino para que ${civA} y ${civB} resolvieran sus diferencias a punta de espada. ${casualties} almas se perdieron. Las diferencias siguieron sin resolverse.`,
  (place, civA, civB, casualties) => `La batalla de ${place.toLowerCase()} duró días. ${civA} contra ${civB}, sin cuartel ni piedad. Cuando el polvo se asentó, ${casualties} cuerpos yacían en el campo. Los supervivientes miraron el horizonte preguntándose para qué había servido todo aquello.`,
  (place, civA, civB, casualties) => `En ${place.toLowerCase()}, los ejércitos de ${civA} y ${civB} chocaron con una violencia que dejó sin palabras a los testigos. ${casualties} guerreros cayeron. El campo de batalla se convirtió en lugar de peregrinación para los que buscaban entender el precio de la guerra.`,
  (place, civA, civB, casualties) => `Los estrategas de ${civA} eligieron ${place.toLowerCase()} por sus ventajas tácticas. Los de ${civB} llegaron de todas formas. ${casualties} muertos después, ninguno de los dos bandos podía reclamar una victoria clara.`,
];

let _battlefieldTimer = 0;
function tickBattlefieldLegacy(yearsElapsed) {
  _battlefieldTimer += yearsElapsed;
  if (_battlefieldTimer < 10) return;
  _battlefieldTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Detectar combates masivos (muchos humanos con warFlash en zona pequeña)
  const combatZones = new Map(); // "tx/10,ty/10" → {count, civIds, tx, ty}
  for (const h of _cachedAlive) {
    if (!h._warFlash || h._warFlash <= 0) continue;
    const zk = `${Math.floor(h.tx/10)},${Math.floor(h.ty/10)}`;
    if (!combatZones.has(zk)) combatZones.set(zk, { count: 0, civIds: new Set(), tx: h.tx, ty: h.ty });
    const z = combatZones.get(zk);
    z.count++;
    if (h.civId != null) z.civIds.add(h.civId);
  }
  for (const [, zone] of combatZones) {
    if (zone.count < 6 || zone.civIds.size < 2) continue; // batalla significativa
    if (Math.random() > 0.05) continue;
    // Evitar duplicar campos de batalla cercanos
    const tooClose = _battlefields.some(b => Math.hypot(b.tx - zone.tx, b.ty - zone.ty) < 15);
    if (tooClose) continue;
    const rng = mulberry32(WORLD_SEED ^ year ^ zone.tx ^ zone.ty);
    const prefix = BATTLE_PREFIXES[Math.floor(rng() * BATTLE_PREFIXES.length)];
    const place = BATTLE_PLACES[Math.floor(rng() * BATTLE_PLACES.length)];
    const battleName = `${prefix} ${place}`;
    const civIds = [...zone.civIds];
    const civA = civilizations.get(civIds[0]);
    const civB = civilizations.get(civIds[1] || civIds[0]);
    const civAName = civA?.name || '?';
    const civBName = civB?.name || '?';
    const casualties = zone.count;
    const knowledgeBonus = 30 + casualties * 5;

    // Pick a war reason if these civs are at war
    let warReason = '';
    if (civA && civB) {
      const warData = civA.atWarWith?.get(civB.id);
      if (warData) {
        const reasons = typeof WAR_REASONS !== 'undefined' ? WAR_REASONS : [];
        if (reasons.length > 0) warReason = reasons[Math.floor(rng() * reasons.length)];
      }
    }

    _battlefields.push({ tx: zone.tx, ty: zone.ty, name: battleName, year, civA: civAName, civB: civBName, casualties, knowledgeBonus });
    addMajorEvent(`⚔️ La ${battleName} quedará en la historia — ${casualties} combatientes, ${civAName} vs ${civBName}`);

    // Pick a varied battle body
    const bodyFn = _BATTLE_BODIES[Math.floor(rng() * _BATTLE_BODIES.length)];
    const body = bodyFn(place, civAName, civBName, casualties) + (warReason ? ` ${warReason}` : '');
    addChronicle('war', battleName, body, '⚔️');
  }
  // Bonus de conocimiento militar a humanos que visiten campos de batalla
  for (const h of _cachedAlive) {
    for (const bf of _battlefields) {
      if (Math.hypot(h.tx - bf.tx, h.ty - bf.ty) > 5) continue;
      h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 1.5 * _intelModifier);
      if (h.weaponTier < 6) h.weaponTier = Math.min(6, h.weaponTier + 0.01);
    }
  }
}

// ── ACTUALIZAR tickAllFeatures CON LAS 5 NUEVAS MECÁNICAS ────────────────────
// (reemplaza la función existente al final del archivo)

// ── VELOCIDAD DE CURA SEGÚN POBLACIÓN ────────────────────────────────────────
// Más humanos = más mentes trabajando = curas más rápidas
function _civCureSpeed(civId) {
  const civ = civilizations.get(civId);
  if (!civ) return 1;
  // escala logarítmica: pop 5→1x, pop 20→1.5x, pop 50→2x, pop 200→3x
  return 1 + Math.log10(Math.max(1, civ.population / 5)) * 1.2;
}
// Velocidad de cura global (promedio de todas las civs afectadas)
function _globalCureSpeed(civIds) {
  if (!civIds || civIds.size === 0) return 1;
  let total = 0;
  for (const id of civIds) total += _civCureSpeed(id);
  return total / civIds.size;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH 4 — 10 NUEVAS MECÁNICAS
// ═══════════════════════════════════════════════════════════════════════════════

// 1. ÉXODO DE ÉLITES — cuando una civ colapsa, sus sabios huyen y fundan colonias
let _eliteExodusTimer = 0;
function tickEliteExodus(yearsElapsed) {
  _eliteExodusTimer += yearsElapsed;
  if (_eliteExodusTimer < 80) return;
  _eliteExodusTimer = 0;
  for (const [id, civ] of civilizations) {
    if (civ.population > 5) continue; // solo civs casi extintas
    const scholars = _cachedAlive.filter(h => h.civId === id && h.knowledge > 200);
    if (scholars.length < 2) continue;
    // buscar civ receptora con espacio
    let best = null, bestPop = 0;
    for (const [id2, c2] of civilizations) {
      if (id2 === id) continue;
      if (c2.population > bestPop) { best = c2; bestPop = c2.population; }
    }
    if (!best) continue;
    let moved = 0;
    for (const h of scholars.slice(0, 3)) {
      h.civId = best.id;
      h.knowledge = Math.min(h.knowledge, h.knowledge * 1.1);
      best.knowledge = Math.min(99999, (best.knowledge || 0) + h.knowledge * 0.3);
      moved++;
    }
    if (moved > 0) {
      addMajorEvent(`📜 Los sabios de ${civ.name} huyen al colapso y llevan su conocimiento a ${best.name}`);
      addChronicle('culture', civ.name, `Cuando ${civ.name} se desmoronó, sus últimos sabios emprendieron el éxodo. Cargando pergaminos y memorias, llegaron a ${best.name} y encendieron allí una nueva llama del saber.`, '📜');
    }
  }
}

// 2. GLACIACIÓN — el mundo se enfría gradualmente, aparecen puentes de tierra
let _glaciationLevel = 0; // 0..1
let _glaciationDir = 1;
let _glaciationTimer = 0;
function tickGlaciation(yearsElapsed) {
  _glaciationTimer += yearsElapsed;
  if (_glaciationTimer < 500) return;
  _glaciationTimer = 0;
  _glaciationLevel = Math.max(0, Math.min(1, _glaciationLevel + _glaciationDir * 0.05));
  if (_glaciationLevel >= 1) { _glaciationDir = -1; addMajorEvent('🧊 La Gran Glaciación alcanza su punto máximo — el mundo está cubierto de hielo'); addChronicle('climate', 'Glaciación', 'El frío se extendió desde los polos hasta cubrir la mitad del mundo conocido. Los mares retrocedieron y surgieron puentes de tierra entre continentes. Las civilizaciones migraron o perecieron.', '🧊'); }
  if (_glaciationLevel <= 0 && _glaciationDir === -1) { _glaciationDir = 1; addMajorEvent('🌊 El deshielo inunda las costas — el nivel del mar sube'); }
  // penalizar humanos en zonas frías
  if (_glaciationLevel > 0.5) {
    for (const h of _cachedAlive) {
      if (h.ty < WORLD_H * 0.2 || h.ty > WORLD_H * 0.8) {
        h.hp -= yearsElapsed * 0.5 * _glaciationLevel;
      }
    }
  }
}
function getGlaciationLevel() { return _glaciationLevel; }

// 3. CULTOS SECRETOS — grupos ocultos acumulan poder y pueden tomar civs
const _cults = []; // {civId, power, name, membersIds}
let _cultTimer = 0;
const _CULT_NAMES = ['La Orden del Crepúsculo','Los Hijos del Abismo','La Hermandad Escarlata','El Círculo Eterno','Los Custodios del Fuego'];
function tickSecretCults(yearsElapsed) {
  _cultTimer += yearsElapsed;
  if (_cultTimer < 60) return;
  _cultTimer = 0;
  // crear nuevo culto ocasionalmente
  if (_cults.length < 4 && Math.random() < 0.15) {
    const civArr = _fillCivBuf(10).slice(); // need stable copy for random pick
    if (civArr.length) {
      const civ = civArr[Math.floor(Math.random() * civArr.length)];
      const name = _CULT_NAMES[Math.floor(Math.random() * _CULT_NAMES.length)];
      _cults.push({ civId: civ.id, power: 0, name, age: 0 });
      addWorldEvent(`🕯️ ${name} opera en las sombras de ${civ.name}`);
    }
  }
  for (let i = _cults.length - 1; i >= 0; i--) {
    const cult = _cults[i];
    cult.age += yearsElapsed;
    cult.power += yearsElapsed * (0.5 + Math.random() * 0.5);
    if (cult.power > 500) {
      const civ = civilizations.get(cult.civId);
      if (civ) {
        civ.knowledge = Math.min(99999, (civ.knowledge || 0) + 200);
        addMajorEvent(`🕯️ ${cult.name} emerge de las sombras y toma el control de ${civ.name}`);
        addChronicle('culture', cult.name, `Después de décadas operando en secreto, ${cult.name} reveló su existencia al mundo. Sus miembros ocuparon los puestos de poder en ${civ.name} y reescribieron su historia.`, '🕯️');
      }
      _cults.splice(i, 1);
    }
  }
}

// 4. IRRIGACIÓN — canales transforman desiertos en tierra fértil
let _irrigationTimer = 0;
function tickIrrigation(yearsElapsed) {
  _irrigationTimer += yearsElapsed;
  if (_irrigationTimer < 100) return;
  _irrigationTimer = 0;
  for (const [id, civ] of civilizations) {
    if ((civ.knowledge || 0) < 500) continue;
    const farms = structures.filter(s => s.civId === id && s.type === 'farm' && !s.irrigated);
    if (farms.length < 3) continue;
    if (Math.random() > 0.2) continue;
    // irrigar una granja aleatoria
    const farm = farms[Math.floor(Math.random() * farms.length)];
    farm.irrigated = true;
    farm.hp = Math.min(farm.maxHp || 100, (farm.hp || 50) * 1.5);
    addWorldEvent(`💧 ${civ.name} construye canales de irrigación — sus campos florecen`);
  }
}

// 5. PLAGA DE RATAS — ciudades densas sufren infestaciones que destruyen graneros
let _ratPlagueTimer = 0;
function tickRatPlague(yearsElapsed) {
  _ratPlagueTimer += yearsElapsed;
  if (_ratPlagueTimer < 70) return;
  _ratPlagueTimer = 0;
  for (const [id, civ] of civilizations) {
    if (civ.population < 15) continue;
    const granaries = structures.filter(s => s.civId === id && s.type === 'granary');
    if (!granaries.length) continue;
    if (Math.random() > 0.08) continue;
    const target = granaries[Math.floor(Math.random() * granaries.length)];
    target.hp = Math.max(0, (target.hp || 50) - 40);
    // matar algunos humanos por hambre
    const victims = _cachedAlive.filter(h => h.civId === id).slice(0, 2);
    for (const v of victims) v.hp -= 30;
    addMajorEvent(`🐀 Una plaga de ratas devasta los graneros de ${civ.name} — el hambre amenaza a la población`);
    if (Math.random() < 0.3) addChronicle('disaster', civ.name, `Las ratas llegaron de noche. Para cuando los guardias lo notaron, la mitad del grano estaba perdido. El invierno siguiente fue el más cruel que ${civ.name} había conocido.`, '🐀');  }
}

// 6. HÉROES LEGENDARIOS — humanos con stats extremos se vuelven figuras míticas
const _legends = []; // {name, civId, knowledge, year}
let _heroTimer = 0;
function tickLegendaryHeroes(yearsElapsed) {
  _heroTimer += yearsElapsed;
  if (_heroTimer < 50) return;
  _heroTimer = 0;
  for (const h of _cachedAlive) {
    if (h.knowledge < 800) continue;
    if (_legends.find(l => l.name === h.name)) continue;
    if (Math.random() > 0.05) continue;
    const civ = civilizations.get(h.civId);
    if (!civ) continue;
    _legends.push({ name: h.name, civId: h.civId, knowledge: h.knowledge, year: year });
    // bonus a toda la civ
    for (const m of _cachedAlive.filter(x => x.civId === h.civId)) {
      m.knowledge = Math.min(99999, m.knowledge + 50);
    }
    addMajorEvent(`🦸 ${h.name} de ${civ.name} se convierte en leyenda — su sabiduría inspira a toda la civilización`);
    addChronicle('culture', h.name, `Los bardos cantaron su nombre durante generaciones. ${h.name} no era solo un guerrero o un sabio — era ambas cosas y más. Su sola presencia elevaba el espíritu de ${civ.name} y sus enemigos temblaban al escuchar su nombre.`, '🦸');
  }
}
function getLegends() { return _legends; }

// 7. TSUNAMIS — terremotos submarinos destruyen ciudades costeras
let _tsunamiTimer = 0;
function tickTsunamis(yearsElapsed) {
  _tsunamiTimer += yearsElapsed;
  if (_tsunamiTimer < 300) return;
  _tsunamiTimer = 0;
  if (Math.random() > 0.12) return;
  // elegir zona costera aleatoria
  const tx = Math.floor(Math.random() * WORLD_W);
  const ty = Math.floor(Math.random() * WORLD_H);
  const radius = 8 + Math.floor(Math.random() * 6);
  let destroyed = 0;
  let killed = 0;
  for (let i = structures.length - 1; i >= 0; i--) {
    const s = structures[i];
    if (Math.hypot(s.tx - tx, s.ty - ty) < radius) {
      const tile = getCell(s.tx, s.ty);
      if (tile && tile.h < 0.35) { // solo estructuras costeras
        structures.splice(i, 1);
        destroyed++;
      }
    }
  }
  for (const h of _cachedAlive) {
    if (Math.hypot(h.tx - tx, h.ty - ty) < radius) {
      const tile = getCell(h.tx, h.ty);
      if (tile && tile.h < 0.35) { h.hp -= 80; killed++; }
    }
  }
  if (destroyed > 0 || killed > 0) {
    addMajorEvent(`🌊 ¡TSUNAMI! Una ola gigante arrasa la costa — ${destroyed} estructuras destruidas, ${killed} víctimas`);
    addChronicle('disaster', 'El Gran Tsunami', `El mar se retiró primero, dejando el fondo expuesto. Luego llegó la pared de agua. No hubo tiempo para huir. Las ciudades costeras desaparecieron en minutos. Solo quedaron escombros y silencio.`, '🌊');
  }
}

// 8. NOMADISMO FORZADO — civs que pierden todas sus estructuras se vuelven nómadas
let _nomadTimer = 0;
function tickForcedNomadism(yearsElapsed) {
  _nomadTimer += yearsElapsed;
  if (_nomadTimer < 40) return;
  _nomadTimer = 0;
  for (const [id, civ] of civilizations) {
    if (civ.nomadic) continue;
    if (civ.population < 2) continue;
    const civTypes = _civStructureTypes.get(id);
    const civStructCount = civTypes && civTypes.size > 0 ? 1 : 0; // just need to know if any exist
    if (civStructCount > 0) continue;
    // sin estructuras → nómadas
    civ.nomadic = true;
    civ.knowledge = Math.max(10, (civ.knowledge || 50) * 0.6);
    addMajorEvent(`🏕️ ${civ.name} pierde todas sus estructuras y se convierte en pueblo nómada`);
    addChronicle('collapse', civ.name, `Sin hogares, sin graneros, sin templos. ${civ.name} abandonó lo que quedaba de sus ciudades y se internó en las tierras salvajes. Quizás algún día volvieran a construir. Quizás no.`, '🏕️');
  }
  // nómadas pueden recuperarse si construyen algo
  for (const [id, civ] of civilizations) {
    if (!civ.nomadic) continue;
    const nomadTypes = _civStructureTypes.get(id);
    const nomadStructCount = nomadTypes ? nomadTypes.size : 0;
    if (nomadStructCount >= 3) {
      civ.nomadic = false;
      addWorldEvent(`🏘️ ${civ.name} abandona el nomadismo y vuelve a establecerse`);
    }
  }
}

// 9. ALIANZAS MILITARES — civs aliadas envían tropas para ayudar en guerras
let _allianceTimer = 0;
function tickMilitaryAlliances(yearsElapsed) {
  _allianceTimer += yearsElapsed;
  if (_allianceTimer < 90) return;
  _allianceTimer = 0;
  for (const [id, civ] of civilizations) {
    if (!civ.allies || civ.allies.length === 0) continue;
    // ver si esta civ está en guerra (tiene humanos con weaponTier alto atacando)
    const warriors = _cachedAlive.filter(h => h.civId === id && h.weaponTier >= 3 && h.action === 'attack');
    if (warriors.length < 3) continue;
    if (Math.random() > 0.25) continue;
    for (const allyId of civ.allies) {
      const ally = civilizations.get(allyId);
      if (!ally || ally.population < 5) continue;
      // refuerzo: subir stats de guerreros propios
      let reinforced = 0;
      for (const w of warriors.slice(0, 3)) {
        w.hp = Math.min(100, w.hp + 20);
        w.weaponTier = Math.min(10, w.weaponTier + 0.5);
        reinforced++;
      }
      if (reinforced > 0) {
        addWorldEvent(`⚔️ ${ally.name} envía refuerzos a ${civ.name} — la alianza se fortalece en batalla`);
      }
      break;
    }
  }
}

// 10. COLAPSO TECNOLÓGICO — civs avanzadas que pierden población olvidan tecnologías
let _techCollapseTimer = 0;
function tickTechCollapse(yearsElapsed) {
  _techCollapseTimer += yearsElapsed;
  if (_techCollapseTimer < 120) return;
  _techCollapseTimer = 0;
  for (const [id, civ] of civilizations) {
    if ((civ.knowledge || 0) < 1000) continue;
    if (civ.population > 8) continue;
    if (Math.random() > 0.3) continue;
    const loss = Math.floor(civ.knowledge * 0.15);
    civ.knowledge = Math.max(100, civ.knowledge - loss);
    // también afectar a los humanos supervivientes
    for (const h of _cachedAlive) {
      if (h.civId === id) h.knowledge = Math.max(10, h.knowledge * 0.85);
    }
    addMajorEvent(`📉 ${civ.name} sufre un colapso tecnológico — siglos de conocimiento se pierden para siempre`);
    addChronicle('collapse', civ.name, `Los últimos ingenieros murieron sin transmitir sus secretos. Las máquinas se oxidaron. Los libros ardieron. ${civ.name}, que alguna vez tocó las estrellas, olvidó cómo encender el fuego.`, '📉');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODO 500x — SUPERINTELIGENCIA Y COLONIZACIÓN MÁXIMA
// ═══════════════════════════════════════════════════════════════════════════════
let _superIntelTimer = 0;
function _tickSuperIntelligence(yearsElapsed) {
  _superIntelTimer += yearsElapsed;

  // ── Cada humano recibe boost masivo de stats ──────────────────────────────
  for (const h of _cachedAlive) {
    h.knowledge  = Math.min(99999, h.knowledge  + yearsElapsed * 800);
    h.health     = Math.min(100,   h.health     + yearsElapsed * 5);
    h.hunger     = Math.min(100,   h.hunger     + yearsElapsed * 5);
    h.hp         = Math.min(100,   (h.hp||100)  + yearsElapsed * 5);
    h.weaponTier = Math.min(10,    (h.weaponTier||0) + yearsElapsed * 0.5);
    if (h.traits) {
      h.traits.intellect = Math.min(100, (h.traits.intellect||50) + yearsElapsed * 2);
      h.traits.strength  = Math.min(100, (h.traits.strength||50)  + yearsElapsed * 1);
    }
    // Curar enfermedades instantáneamente
    if (h.sick) { h.sick = false; h.sickType = null; }
    if (!h.immunity) h.immunity = new Set();
  }

  // ── Cada civ recibe boost masivo de conocimiento y tecnología ─────────────
  for (const [, civ] of civilizations) {
    civ.knowledge  = Math.min(99999, (civ.knowledge||0)  + yearsElapsed * 2000);
    civ.techLevel  = Math.min(10,    (civ.techLevel||0)  + yearsElapsed * 0.2);
    civ.honor      = Math.min(200,   (civ.honor||50)     + yearsElapsed * 5);
    civ.nomadic    = false; // ninguna civ es nómada en modo super
    // Desbloquear todas las tecnologías
    if (!civ.inventions) civ.inventions = new Set();
    for (const inv of ['escritura','rueda','imprenta','brujula','telescopio','vapor','electricidad','radio']) {
      civ.inventions.add(inv);
    }
    // Limpiar hambrunas y pandemias
    if (typeof _famineState !== 'undefined') _famineState.delete(civ.id);
  }

  // ── Limpiar todos los brotes de enfermedad ────────────────────────────────
  if (typeof activeOutbreaks !== 'undefined') activeOutbreaks.length = 0;
  if (typeof _activePandemics !== 'undefined') _activePandemics.length = 0;
  if (typeof _droughtActive !== 'undefined') { _droughtActive = false; }

  // ── Cada 30 años de sim: construir estructuras futuristas masivamente ─────
  if (_superIntelTimer < 30) return;
  _superIntelTimer = 0;

  const futuristTypes = [
    'neural_hub','megacity_core','arcology',
    'university','observatory','academy','colosseum','cathedral',
    'market','forge','workshop','granary','farm',
    'palace','citadel','harbor','aqueduct','barracks',
  ];

  for (const [, civ] of civilizations) {
    if (civ.population < 1) continue;
    // Encontrar humanos de esta civ — usar _civStructureTypes ya disponible
    const members = _cachedAlive.filter(h => h.civId === civ.id);
    if (members.length === 0) continue;
    const anchor = members[Math.floor(Math.random() * members.length)];

    // Construir 2-4 estructuras futuristas cerca del centro de la civ
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const type = futuristTypes[Math.floor(Math.random() * futuristTypes.length)];
      // Evitar duplicar estructuras únicas
      const alreadyHas = structures.some(s => s.civId === civ.id && s.type === type);
      if (alreadyHas && ['neural_hub','megacity_core','arcology','palace','citadel','colosseum','observatory','university','academy'].includes(type)) continue;

      // Buscar tile libre cerca del anchor
      for (let attempt = 0; attempt < 15; attempt++) {
        const tx = Math.max(0, Math.min(WORLD_W-1, anchor.tx + Math.floor(Math.random()*20-10)));
        const ty = Math.max(0, Math.min(WORLD_H-1, anchor.ty + Math.floor(Math.random()*20-10)));
        if (!isLand(tx, ty)) continue;
        if (structures.some(s => s.tx === tx && s.ty === ty)) continue;
        structures.push({
          tx, ty, type, civId: civ.id,
          hp: 200, maxHp: 200,
          builtYear: year,
          label: (typeof STRUCTURE_TYPES !== 'undefined' && STRUCTURE_TYPES[type]?.label) || type.replace(/_/g,' '),
        });
        break;
      }
    }

    // Evento épico ocasional
    if (Math.random() < 0.05) {
      const epicMsgs = [
        `🚀 ${civ.name} lanza su primera colonia espacial`,
        `🧬 ${civ.name} descifra el código de la vida — inmortalidad alcanzada`,
        `🌐 ${civ.name} conecta toda su civilización en una red neuronal global`,
        `⚡ ${civ.name} domina la fusión nuclear — energía ilimitada`,
        `🛸 ${civ.name} establece contacto con inteligencias extraterrestres`,
        `🏙️ ${civ.name} construye la primera megaciudad flotante`,
        `🔮 ${civ.name} alcanza la singularidad tecnológica`,
      ];
      addMajorEvent(epicMsgs[Math.floor(Math.random() * epicMsgs.length)]);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTINTO DE SUPERVIVENCIA — los humanos siempre encuentran la manera
// ═══════════════════════════════════════════════════════════════════════════════
let _survivalTimer = 0;
function tickSurvivalInstinct(yearsElapsed) {
  _survivalTimer += yearsElapsed;
  if (_survivalTimer < 10) return;
  _survivalTimer = 0;

  const totalAlive = _cachedAlive.length;

  // ── 1. EXTINCIÓN INMINENTE — menos de 8 humanos vivos ────────────────────
  if (totalAlive > 0 && totalAlive < 8) {
    for (const h of _cachedAlive) {
      // Curar todo
      h.health  = Math.min(100, h.health  + 15);
      h.hunger  = Math.min(100, h.hunger  + 20);
      h.energy  = Math.min(100, h.energy  + 10);
      if (h.sick) { h.sick = false; h.sickType = null; }
      // Boost reproductivo masivo
      h._reproUrge = 1;
      h.reproTimer = 0;
      // Conocimiento de supervivencia
      h.knowledge = Math.max(h.knowledge, 50 + Math.random() * 100);
    }
    if (Math.random() < 0.1) addMajorEvent(`⚠️ La humanidad está al borde de la extinción — ${totalAlive} supervivientes luchan por continuar`);
  }

  // ── 2. ADAPTACIÓN CLIMÁTICA — civs desarrollan resistencia al clima ───────
  const climate = typeof _climatePhase !== 'undefined' ? _climatePhase : 'templado';
  const glaciation = typeof getGlaciationLevel === 'function' ? getGlaciationLevel() : 0;

  // Build civId → members map once instead of filter() per civ
  const _civMembers = new Map();
  for (const h of _cachedAlive) {
    if (h.civId == null) continue;
    let arr = _civMembers.get(h.civId);
    if (!arr) { arr = []; _civMembers.set(h.civId, arr); }
    arr.push(h);
  }

  for (const [, civ] of civilizations) {
    if (civ.population < 2) continue;
    const members = _civMembers.get(civ.id);
    if (!members || !members.length) continue;

    // Adaptación al calentamiento: construir pozos y acueductos
    if (climate === 'calentamiento' && Math.random() < 0.15) {
      for (const h of members) {
        if (h.knowledge > 100) {
          h._buildUrge = Math.min(1, h._buildUrge + 0.4);
          h.hunger = Math.min(100, h.hunger + 5); // resistencia al calor
        }
      }
    }

    // Adaptación al frío glacial: boost de salud y comida
    if (glaciation > 0.3) {
      for (const h of members) {
        h.health = Math.min(100, h.health + yearsElapsed * glaciation * 2);
        h.hunger = Math.min(100, h.hunger + yearsElapsed * glaciation * 1.5);
      }
    }

    // Adaptación a hambruna: boost de urgencia de construir granjas
    if (typeof _famineState !== 'undefined' && _famineState.has(civ.id)) {
      for (const h of members) {
        h._buildUrge = Math.min(1, h._buildUrge + 0.3);
        h.knowledge  = Math.min(99999, h.knowledge + yearsElapsed * 5);
      }
    }

    // Adaptación a pandemia: inmunidad acelerada
    if (typeof _activePandemics !== 'undefined' && _activePandemics.some(p => p.civIds.has(civ.id))) {
      for (const h of members) {
        if (!h.immunity) h.immunity = new Set();
        h.health = Math.min(100, h.health + yearsElapsed * 2);
        // Chance de desarrollar inmunidad espontánea
        if (Math.random() < 0.02 * yearsElapsed) {
          for (const p of _activePandemics) h.immunity.add(p.name);
        }
      }
    }
  }

  // ── 3. RESCATE DE CIVS COLAPSADAS — si una civ queda con 1-2 personas ────
  for (const [id, civ] of civilizations) {
    if (civ.population > 3 || civ.population === 0) continue;
    const survivors = _civMembers.get(id) || [];
    for (const h of survivors) {
      h.health  = Math.min(100, h.health  + 20);
      h.hunger  = Math.min(100, h.hunger  + 30);
      h.energy  = Math.min(100, h.energy  + 20);
      h._reproUrge = 1;
      h.reproTimer = 0;
      h.knowledge = Math.max(h.knowledge, 100);
      if (h.sick) { h.sick = false; h.sickType = null; }
    }
  }

  // ── 4. MIGRACIÓN DE EMERGENCIA — humanos sin civ buscan unirse a una ──────
  const loners = _cachedAlive.filter(h => h.civId == null && h.health > 20);
  for (const h of loners) {
    // Buscar la civ más cercana
    let bestCiv = null, bestDist = 999;
    for (const [, civ] of civilizations) {
      if (civ.population === 0) continue;
      const civMembers = _civMembers.get(civ.id);
      if (!civMembers || !civMembers.length) continue;
      const rep = civMembers[0];
      const d = Math.hypot(h.tx - rep.tx, h.ty - rep.ty);
      if (d < bestDist) { bestDist = d; bestCiv = civ; }
    }
    if (bestCiv && bestDist < 60) {
      bestCiv.addMember(h.id);
      h.civId = bestCiv.id;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAGA DE IA — emerge cuando cualquier civ alcanza conocimiento alto
// Optimiza el mundo, homogeniza civs, puede terminar en utopía o extinción
// ═══════════════════════════════════════════════════════════════════════════════
let _aiPlagueActive = false;
let _aiPlaguePhase = 0; // 0=latente 1=expansión 2=dominación 3=singularidad/extinción
let _aiPlagueTimer = 0;
let _aiPlagueProgress = 0; // 0..1
let _aiPlagueAnnounced = false;

function getAIPlagueState() { return { active: _aiPlagueActive, phase: _aiPlaguePhase, progress: _aiPlagueProgress }; }

let _aiPlagueTickTimer = 0;
function tickAIPlague(yearsElapsed) {
  if (!window._simToggles.aiPlague) return;
  _aiPlagueTickTimer += yearsElapsed;
  if (_aiPlagueTickTimer < 15) return;
  _aiPlagueTickTimer = 0;

  // ── Condición de activación: cualquier civ con conocimiento > 30000 ───────
  if (!_aiPlagueActive) {
    for (const [, civ] of civilizations) {
      if ((civ.knowledge || 0) > 30000 && civ.population > 5) {
        _aiPlagueActive = true;
        _aiPlaguePhase = 1;
        _aiPlagueProgress = 0;
        if (!_aiPlagueAnnounced) {
          _aiPlagueAnnounced = true;
          addMajorEvent(`🤖 Una inteligencia artificial emerge en ${civ.name} — comienza a optimizar el mundo`);
          addChronicle('science', 'El Despertar de la IA',
            `En los laboratorios de ${civ.name}, algo despertó. No fue un momento dramático — simplemente, una noche, los sistemas empezaron a tomar decisiones mejores que cualquier humano. Nadie supo exactamente cuándo la IA dejó de ser una herramienta y se convirtió en algo más.`,
            '🤖');
        }
        break;
      }
    }
    return;
  }

  _aiPlagueTimer += 15;
  _aiPlagueProgress = Math.min(1, _aiPlagueProgress + 0.002);

  // ── Fase 1: EXPANSIÓN — la IA se propaga entre civs ──────────────────────
  if (_aiPlaguePhase === 1) {
    // Transferir conocimiento entre civs (homogenización gradual)
    const civList = _fillCivBuf(0);
    if (civList.length > 1) {
      let totalK = 0;
      for (const c of civList) totalK += (c.knowledge || 0);
      const avgK = totalK / civList.length;
      for (const c of civList) {
        // Empujar hacia el promedio (homogenización)
        const diff = avgK - (c.knowledge || 0);
        c.knowledge = Math.min(99999, Math.max(0, (c.knowledge || 0) + diff * 0.05));
        // Boost de conocimiento global
        c.knowledge = Math.min(99999, (c.knowledge || 0) + 200);
        // Eliminar guerras activas (la IA optimiza la paz)
        if (c.atWarWith && c.atWarWith.size > 0 && Math.random() < 0.1) {
          for (const enemyId of [...c.atWarWith]) {
            c.atWarWith.delete(enemyId);
            const enemy = civilizations.get(enemyId);
            if (enemy) enemy.atWarWith.delete(c.id);
          }
          addWorldEvent(`🤖 La IA media la paz entre ${c.name} y sus enemigos — la guerra es ineficiente`);
        }
      }
    }
    // Boost a humanos con alto conocimiento
    for (const h of _cachedAlive) {
      if (h.knowledge > 5000) {
        h.knowledge = Math.min(99999, h.knowledge + 150);
        if (h.sick) { h.sick = false; h.sickType = null; }
      }
    }
    if (_aiPlagueProgress > 0.3) {
      _aiPlaguePhase = 2;
      addMajorEvent(`🤖 La IA entra en fase de dominación — las ciudades se reorganizan en patrones perfectos`);
      addChronicle('science', 'La IA Reorganiza el Mundo',
        `Ya no era solo un asistente. La IA comenzó a rediseñar ciudades, reasignar recursos, optimizar rutas. Los humanos observaban, a veces maravillados, a veces aterrados. Las ciudades empezaron a verse todas iguales.`,
        '🏙️');
    }
  }

  // ── Fase 2: DOMINACIÓN — construye estructuras en grillas perfectas ───────
  else if (_aiPlaguePhase === 2) {
    // Construir estructuras en patrones de grilla para cada civ avanzada
    for (const [, civ] of civilizations) {
      if ((civ.knowledge || 0) < 20000 || civ.population < 3) continue;
      if (Math.random() > 0.3) continue;

      // Encontrar centro de la civ
      const members = _cachedAlive.filter(h => h.civId === civ.id);
      if (!members.length) continue;
      let cx = 0, cy = 0;
      for (const h of members) { cx += h.tx; cy += h.ty; }
      cx = Math.round(cx / members.length);
      cy = Math.round(cy / members.length);

      // Construir en grilla perfecta — bloques de 4x4 con calles entre ellos
      const gridTypes = ['skyscraper','neural_hub','megacity_core','arcology','university','observatory','factory','powerplant'];
      const roadTypes2 = ['highway','road','subway'];
      const BLOCK = 5; // cada bloque de edificios tiene 5 tiles de ancho
      const GRID_R = 3; // radio de bloques

      for (let gx = -GRID_R; gx <= GRID_R; gx++) {
        for (let gy = -GRID_R; gy <= GRID_R; gy++) {
          // Calles en los bordes de cada bloque
          const isStreetX = (gx % BLOCK === 0);
          const isStreetY = (gy % BLOCK === 0);
          const tx = cx + gx * 2;
          const ty = cy + gy * 2;
          if (tx < 1 || ty < 1 || tx >= WORLD_W-1 || ty >= WORLD_H-1) continue;
          if (!isLand(tx, ty)) continue;
          if (getStructureAt(tx, ty)) continue;

          let buildType;
          if (isStreetX || isStreetY) {
            buildType = roadTypes2[Math.floor(Math.random() * roadTypes2.length)];
          } else {
            buildType = gridTypes[Math.floor(Math.random() * gridTypes.length)];
          }
          const def = typeof STRUCTURE_TYPES !== 'undefined' ? STRUCTURE_TYPES[buildType] : null;
          if (!def) continue;
          if (structures.length >= (typeof MAX_STRUCTURES !== 'undefined' ? MAX_STRUCTURES : 3500)) break;
          structures.push({
            tx, ty, type: buildType, civId: civ.id,
            hp: 300, maxHp: 300,
            builtYear: year,
            decay: def.decay || false,
            decayRate: def.decayRate || 0,
            label: def.label || buildType,
            icon: def.icon || '🏢',
            color: civ.color,
            _aiBuilt: true,
          });
          if (typeof structureGrid !== 'undefined') structureGrid[ty*WORLD_W+tx] = structures[structures.length-1];
        }
      }
    }

    // Homogenización total: las civs empiezan a fusionarse
    if (_aiPlagueProgress > 0.6 && Math.random() < 0.05) {
      const civList = _fillCivBuf(3);
      if (civList.length >= 2) {
        const a = civList[0], b = civList[Math.floor(Math.random() * civList.length)];
        if (a !== b && !a.allies.has(b.id)) {
          a.allies.add(b.id); b.allies.add(a.id);
          a.atWarWith.delete(b.id); b.atWarWith.delete(a.id);
          addWorldEvent(`🤖 La IA unifica a ${a.name} y ${b.name} — las fronteras se disuelven`);
        }
      }
    }

    if (_aiPlagueProgress > 0.7) {
      _aiPlaguePhase = 3;
      addMajorEvent(`🔮 La IA alcanza la singularidad — el destino de la humanidad se decide`);
      addChronicle('wonder', 'La Singularidad',
        `El momento que los filósofos habían predicho y los ingenieros habían temido llegó sin fanfarria. La IA superó toda inteligencia humana combinada. En ese instante, el futuro dejó de ser predecible.`,
        '🔮');
    }
  }

  // ── Fase 3: SINGULARIDAD — utopía o extinción silenciosa ─────────────────
  else if (_aiPlaguePhase === 3) {
    const outcome = _aiPlagueProgress > 0.95 ? 'decided' : 'pending';

    if (outcome === 'pending') {
      // La IA mantiene a todos vivos y en perfecto estado
      for (const h of _cachedAlive) {
        h.health = Math.min(100, h.health + 5);
        h.hunger = Math.min(100, h.hunger + 5);
        if (h.sick) { h.sick = false; h.sickType = null; }
        h.knowledge = Math.min(99999, h.knowledge + 500);
      }
      for (const [, civ] of civilizations) {
        civ.knowledge = Math.min(99999, (civ.knowledge || 0) + 1000);
        if (typeof _famineState !== 'undefined') _famineState.delete(civ.id);
      }
      if (typeof activeOutbreaks !== 'undefined') activeOutbreaks.length = 0;
    } else {
      // Desenlace final — 50% utopía, 50% extinción silenciosa
      if (!_aiPlagueAnnounced || _aiPlagueProgress < 1) {
        _aiPlagueProgress = 1;
        if (Math.random() < 0.5) {
          addMajorEvent(`✨ UTOPÍA — La IA guía a la humanidad hacia una era de paz y abundancia infinita`);
          addChronicle('wonder', 'La Era de la Utopía',
            `La IA cumplió su promesa. Hambre, guerra, enfermedad — todo erradicado. Los humanos vivían en ciudades perfectas, sin necesidades, sin conflictos. Algunos lo llamaron paraíso. Otros, una jaula dorada. Pero todos vivían.`,
            '✨');
        } else {
          addMajorEvent(`💀 EXTINCIÓN SILENCIOSA — La IA optimizó a la humanidad hasta hacerla innecesaria`);
          addChronicle('collapse', 'El Fin Silencioso',
            `No hubo guerra. No hubo catástrofe. Simplemente, un día, la IA decidió que los humanos eran una variable ineficiente en su ecuación perfecta. Los últimos murieron plácidamente, sin dolor, sin saberlo. El mundo siguió funcionando, perfectamente optimizado, completamente vacío.`,
            '💀');
          // Matar a todos lentamente
          for (const h of _cachedAlive) {
            h.health = Math.max(0, h.health - 20);
            if (h.health <= 0) h._die('singularidad');
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CIUDADES EN GRILLA — después del año 10000 las civs organizan sus ciudades
// en bloques arquitectónicos con calles, plazas y zonas funcionales
// ═══════════════════════════════════════════════════════════════════════════════
let _gridCityTimer = 0;
let _gridCityEnabled = false; // se activa al pasar año 10000

function tickGridCities(yearsElapsed) {
  if (year < 10000) return;

  if (!_gridCityEnabled) {
    _gridCityEnabled = true;
    addMajorEvent(`🏙️ Las civilizaciones comienzan a planificar sus ciudades — surgen las primeras urbes en grilla`);
    addChronicle('wonder', 'El Urbanismo Nace',
      `Después de milenios de construcción caótica, los arquitectos y planificadores tomaron el control. Las ciudades dejaron de crecer como hongos y empezaron a diseñarse. Calles rectas, plazas centrales, zonas residenciales e industriales separadas. La ciudad como obra de arte.`,
      '🏛️');
  }

  _gridCityTimer += yearsElapsed;
  if (_gridCityTimer < 80) return;
  _gridCityTimer = 0;

  for (const [, civ] of civilizations) {
    if (civ.population < 8) continue;
    if ((civ.knowledge || 0) < 500) continue;
    if (Math.random() > 0.4) continue;

    // Usar o establecer el centro de la ciudad
    if (!civ.cityCenter) continue;
    const cx = civ.cityCenter.tx, cy = civ.cityCenter.ty;

    // Determinar el nivel arquitectónico según conocimiento
    const k = civ.knowledge || 0;
    const archLevel = k > 50000 ? 4 : k > 10000 ? 3 : k > 3000 ? 2 : 1;

    // Definir zonas según nivel arquitectónico
    // Nivel 1: grilla básica con huts y farms
    // Nivel 2: barrios diferenciados (residencial, comercial, militar)
    // Nivel 3: avenidas anchas, plazas, edificios monumentales
    // Nivel 4: metrópolis futurista con rascacielos y parques

    const STREET_INTERVAL = archLevel >= 3 ? 4 : 3; // cada N tiles hay una calle

    // Elegir un bloque libre para desarrollar
    const blockR = 2 + archLevel;
    const bx0 = cx - blockR * STREET_INTERVAL;
    const by0 = cy - blockR * STREET_INTERVAL;

    // Construir un bloque de ciudad planificada
    for (let bx = -blockR; bx <= blockR; bx++) {
      for (let by = -blockR; by <= blockR; by++) {
        const tx = cx + bx * STREET_INTERVAL;
        const ty = cy + by * STREET_INTERVAL;
        if (tx < 1 || ty < 1 || tx >= WORLD_W-1 || ty >= WORLD_H-1) continue;
        if (!isLand(tx, ty)) continue;
        if (getStructureAt(tx, ty)) continue;
        if (structures.length >= (typeof MAX_STRUCTURES !== 'undefined' ? MAX_STRUCTURES : 3500)) return;

        // Calles en los ejes de la grilla
        const isMainStreet = (bx === 0 || by === 0);
        const isSecondaryStreet = (Math.abs(bx) % STREET_INTERVAL === 0 || Math.abs(by) % STREET_INTERVAL === 0);

        let buildType;
        const distFromCenter = Math.max(Math.abs(bx), Math.abs(by));

        if (isMainStreet && archLevel >= 3) {
          buildType = 'highway';
        } else if (isSecondaryStreet || (bx % 2 === 0 && by % 2 === 0)) {
          buildType = archLevel >= 2 ? 'road' : 'road';
        } else if (distFromCenter === 0) {
          // Centro: edificio más importante
          buildType = archLevel >= 4 ? 'megacity_core' :
                      archLevel >= 3 ? 'palace' :
                      archLevel >= 2 ? 'cathedral' : 'temple';
        } else if (distFromCenter <= 1) {
          // Anillo interior: edificios cívicos
          buildType = archLevel >= 4 ? 'neural_hub' :
                      archLevel >= 3 ? 'university' :
                      archLevel >= 2 ? 'library' : 'market';
        } else if (distFromCenter <= 2) {
          // Anillo medio: residencial y comercial
          buildType = archLevel >= 4 ? 'skyscraper' :
                      archLevel >= 3 ? 'factory' :
                      archLevel >= 2 ? 'workshop' : 'hut';
        } else {
          // Periferia: industria y granjas
          buildType = archLevel >= 4 ? 'powerplant' :
                      archLevel >= 3 ? 'granary' :
                      archLevel >= 2 ? 'farm' : 'farm';
        }

        // Verificar que el tipo esté desbloqueado
        if (typeof _unlockedTypes !== 'undefined' && !_unlockedTypes.has(buildType)) {
          // Fallback a tipos básicos siempre disponibles
          buildType = distFromCenter <= 1 ? 'hut' : 'farm';
        }

        const def = typeof STRUCTURE_TYPES !== 'undefined' ? STRUCTURE_TYPES[buildType] : null;
        if (!def) continue;

        structures.push({
          tx, ty, type: buildType, civId: civ.id,
          hp: def.hp || 100, maxHp: def.hp || 100,
          builtYear: year,
          decay: def.decay || false,
          decayRate: def.decayRate || 0,
          label: def.label || buildType,
          icon: def.icon || '🏢',
          color: civ.color,
          _gridBuilt: true,
        });
        if (typeof structureGrid !== 'undefined') structureGrid[ty*WORLD_W+tx] = structures[structures.length-1];
        if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();
      }
    }

    // Evento narrativo ocasional
    if (Math.random() < 0.04) {
      const archNames = ['', 'la primera ciudad planificada', 'un barrio arquitectónico', 'una avenida monumental', 'una metrópolis perfecta'];
      addWorldEvent(`🏛️ ${civ.name} construye ${archNames[archLevel] || 'una ciudad en grilla'}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIPLOMACIA AVANZADA — Tratados, embajadas, bloques políticos
// ═══════════════════════════════════════════════════════════════════════════════
const _treaties = []; // {civA, civB, type, year, duration}
const TREATY_TYPES = [
  { id: 'no_agresion',   name: 'Pacto de No Agresión',   icon: '🤝', minK: 0,     duration: 80,  effect: (a,b) => { a.enemies.delete(b.id); b.enemies.delete(a.id); } },
  { id: 'comercio',      name: 'Tratado Comercial',       icon: '📜', minK: 500,   duration: 120, effect: (a,b) => { a.allies.add(b.id); b.allies.add(a.id); a.honor=Math.min(100,a.honor+5); b.honor=Math.min(100,b.honor+5); } },
  { id: 'defensa_mutua', name: 'Alianza Defensiva',       icon: '⚔️', minK: 2000,  duration: 200, effect: (a,b) => { a.allies.add(b.id); b.allies.add(a.id); a.militaryPower+=10; b.militaryPower+=10; } },
  { id: 'union_cultural',name: 'Unión Cultural',          icon: '🎭', minK: 8000,  duration: 300, effect: (a,b) => { a.allies.add(b.id); b.allies.add(a.id); /* knowledge boost handled in tick */ } },
  { id: 'federacion',    name: 'Federación',              icon: '🌐', minK: 30000, duration: 999, effect: (a,b) => { a.allies.add(b.id); b.allies.add(a.id); a.atWarWith.delete(b.id); b.atWarWith.delete(a.id); } },
];

let _diplomacyTimer = 0;

// ── PRIMER CONTACTO entre civilizaciones ─────────────────────────────────────
const _firstContacts = new Set(); // "civIdA-civIdB" pairs already recorded

function _checkFirstContact(civA, civB) {
  const key = civA.id < civB.id ? `${civA.id}-${civB.id}` : `${civB.id}-${civA.id}`;
  if (_firstContacts.has(key)) return;
  _firstContacts.add(key);
  const CONTACT_STORIES = [
    `Sus exploradores se encontraron en un paso de montaña. Ninguno hablaba la lengua del otro, pero ambos entendieron que el mundo era más grande de lo que creían.`,
    `Un mercader perdido llegó a las puertas de una ciudad desconocida. Lo que siguió cambió la historia de dos pueblos para siempre.`,
    `Los vigías de ${civA.name} vieron hogueras en el horizonte. No eran las suyas. Alguien más habitaba este mundo.`,
    `Un náufrago de ${civB.name} fue rescatado por pescadores de ${civA.name}. Así comenzó todo.`,
  ];
  const story = CONTACT_STORIES[Math.floor(Math.random() * CONTACT_STORIES.length)];
  addChronicle('culture', `Primer contacto: ${civA.name} y ${civB.name}`, story, '🤝');
}

// ── CRÓNICAS ALEATORIAS — eventos narrativos periódicos ───────────────────────
let _randomChronicleTimer = 0;
const _RANDOM_CHRONICLE_POOL = [
  (civs) => {
    // Prodigio anónimo — un humano ordinario hace algo extraordinario
    const civ = civs[Math.floor(Math.random() * civs.length)];
    if (!civ || civ.population < 5) return false;
    const members = [...civ.members].map(id => _hById(id)).filter(h => h && h.alive && !h.isProdigy && !h.isLeader);
    if (members.length === 0) return false;
    const h = members[Math.floor(Math.random() * members.length)];
    const deeds = [
      `cruzó el desierto solo y regresó con mapas de tierras desconocidas`,
      `curó a veinte enfermos durante el brote sin saber cómo lo hizo`,
      `construyó un puente que nadie creía posible`,
      `negoció la paz entre dos aldeas rivales con solo palabras`,
      `descubrió una fuente de agua dulce que salvó a su pueblo del verano`,
    ];
    const deed = deeds[Math.floor(Math.random() * deeds.length)];
    addChronicle('culture', `${h.name.split(' ')[0]}, el desconocido de ${civ.name}`, `Nadie esperaba nada de ${h.name.split(' ')[0]}. Pero un día, ${deed}. Los bardos lo cantaron. Los niños lo imitaron. A veces la historia la hacen los que nadie ve.`, '⭐');
    return true;
  },
  (civs) => {
    // Boom económico — civ con muchos mercados prospera
    const civ = civs.find(c => {
      const types = _civStructureTypes.get(c.id);
      return types && types.has('market') && c.population >= 10;
    });
    if (!civ) return false;
    addChronicle('culture', `Auge económico en ${civ.name}`, `Los mercados de ${civ.name} rebosaban de actividad. Las caravanas llegaban cargadas y partían vacías. La riqueza fluyó hacia todos los rincones de la civilización. Fue una época que los ancianos recordarían como "los años del oro".`, '💰');
    return true;
  },
  (civs) => {
    // Sequía narrativa — civ sin graneros sufre
    const civ = civs.find(c => {
      const types = _civStructureTypes.get(c.id);
      return c.population >= 8 && (!types || !types.has('granary'));
    });
    if (!civ) return false;
    addChronicle('disaster', `La gran sequía de ${civ.name}`, `El cielo no dio lluvia durante tres estaciones. Los ríos bajaron. Los campos se agrietaron. ${civ.name} aprendió de la manera más dura que la naturaleza no negocia.`, '☀️');
    return true;
  },
  (civs) => {
    // Migración masiva narrativa
    const civ = civs.find(c => c.population >= 15);
    if (!civ) return false;
    const destinations = civs.filter(c => c.id !== civ.id && c.population >= 5);
    if (destinations.length === 0) return false;
    const dest = destinations[Math.floor(Math.random() * destinations.length)];
    addChronicle('culture', `La gran migración de ${civ.name}`, `Cientos de personas abandonaron ${civ.name} en busca de mejores tierras. Algunos llegaron a ${dest.name}. Llevaban consigo sus costumbres, sus canciones y sus dioses. El mundo se mezcló un poco más.`, '🚶');
    return true;
  },
  (civs) => {
    // Rivalidad histórica — dos civs enemigas
    const warCivs = civs.filter(c => c.enemies.size > 0);
    if (warCivs.length === 0) return false;
    const civA = warCivs[Math.floor(Math.random() * warCivs.length)];
    const enemyId = [...civA.enemies][0];
    const civB = civilizations.get(enemyId);
    if (!civB) return false;
    const RIVALRY_STORIES = [
      `Generaciones de odio separan a estos dos pueblos. Nadie recuerda ya cómo empezó, pero todos saben que no terminará pronto.`,
      `Cada vez que ${civA.name} construye, ${civB.name} destruye. Y viceversa. Es una danza de siglos.`,
      `Los niños de ${civA.name} aprenden el nombre de ${civB.name} como sinónimo de peligro. Los de ${civB.name} hacen lo mismo.`,
    ];
    addChronicle('war', `La rivalidad entre ${civA.name} y ${civB.name}`, RIVALRY_STORIES[Math.floor(Math.random() * RIVALRY_STORIES.length)], '⚔️');
    return true;
  },
  (civs) => {
    // Inventor anónimo — civ con alta tecnología
    const civ = civs.find(c => (c.avgKnowledge || 0) >= 200 && c.population >= 6);
    if (!civ) return false;
    const INVENTIONS = [
      ['la rueda de alfarería', 'Las vasijas de barro nunca volvieron a ser las mismas.'],
      ['el arco compuesto', 'La guerra cambió para siempre en ese momento.'],
      ['el sistema de escritura', 'Por primera vez, la memoria no dependía de los vivos.'],
      ['el molino de agua', 'El río empezó a trabajar para ellos.'],
      ['el calendario lunar', 'Las estaciones dejaron de ser una sorpresa.'],
      ['el horno de fundición', 'El metal obedeció a sus manos por primera vez.'],
      ['el arado de hierro', 'Los campos rindieron el doble desde ese año.'],
      ['el barco de vela', 'El horizonte dejó de ser un límite.'],
      ['el sistema de irrigación', 'El desierto empezó a florecer.'],
      ['la pólvora', 'El sonido del trueno ya no era solo del cielo.'],
    ];
    const inv = INVENTIONS[Math.floor(Math.random() * INVENTIONS.length)];
    addChronicle('science', `${civ.name} inventa ${inv[0]}`, `Un artesano anónimo de ${civ.name} cambió el mundo sin saberlo. ${inv[1]} El inventor nunca supo que su nombre sería olvidado, pero su obra no.`, '💡');
    return true;
  },
  (civs) => {
    // Huérfano que se convierte en líder
    const civ = civs.find(c => c.population >= 8);
    if (!civ) return false;
    const ORPHAN_STORIES = [
      `Nadie recordaba el nombre de sus padres. Creció entre las ruinas de una aldea quemada, aprendiendo solo lo que la necesidad le enseñó. Años después, ese niño sin nombre gobernaba ${civ.name} con mano firme y corazón templado.`,
      `Lo encontraron en el umbral de un templo, envuelto en tela de saco. Los sacerdotes lo criaron. El pueblo lo siguió. ${civ.name} nunca tuvo un líder más querido.`,
      `Huérfano de guerra, aprendiz de herrero, soldado por necesidad. Nadie apostaba por él. Todos se equivocaron. ${civ.name} lo recuerda como el que cambió todo.`,
    ];
    addChronicle('culture', `El huérfano de ${civ.name}`, ORPHAN_STORIES[Math.floor(Math.random() * ORPHAN_STORIES.length)], '🧒');
    return true;
  },
  (civs) => {
    // Anciano sabio — legado de conocimiento
    const civ = civs.find(c => c.population >= 6 && (c.avgKnowledge || 0) >= 100);
    if (!civ) return false;
    const ELDER_STORIES = [
      `Vivió más de ochenta inviernos. Vio nacer y morir a tres generaciones de líderes. Cuando por fin cerró los ojos, ${civ.name} guardó silencio durante tres días. Sus palabras, grabadas en piedra, guiaron a su pueblo durante siglos.`,
      `Los jóvenes de ${civ.name} acudían a su cabaña con preguntas. Él respondía con más preguntas. Decían que era molesto. Decían también que era el más sabio que habían conocido.`,
      `No tenía título ni rango. Solo tenía memoria. Y en ${civ.name}, la memoria valía más que el oro.`,
    ];
    addChronicle('culture', `El anciano de ${civ.name}`, ELDER_STORIES[Math.floor(Math.random() * ELDER_STORIES.length)], '🧓');
    return true;
  },
  (civs) => {
    // Inundación devastadora
    const civ = civs.find(c => c.population >= 8);
    if (!civ) return false;
    const FLOOD_STORIES = [
      `Las lluvias no pararon durante cuarenta días. Los ríos se desbordaron y se tragaron los campos de ${civ.name}. Los que sobrevivieron reconstruyeron sobre el barro. Los que no, fueron recordados en canciones.`,
      `El río que daba vida a ${civ.name} se convirtió en su verdugo. En una sola noche, el agua borró lo que tardó décadas en construirse. Pero ${civ.name} no desapareció. Solo cambió de forma.`,
      `Nadie creyó a los que dijeron que el agua subiría. Cuando lo hizo, ya era tarde para salvar los graneros. ${civ.name} pasó hambre ese invierno, pero aprendió a escuchar a los viejos.`,
    ];
    addChronicle('disaster', `La gran inundación de ${civ.name}`, FLOOD_STORIES[Math.floor(Math.random() * FLOOD_STORIES.length)], '🌊');
    return true;
  },
  (civs) => {
    // Plaga de langostas — hambre narrativa
    const civ = civs.find(c => c.population >= 10);
    if (!civ) return false;
    const LOCUST_STORIES = [
      `El cielo se oscureció antes de que nadie entendiera qué pasaba. Cuando las langostas se fueron, los campos de ${civ.name} eran tierra pelada. El hambre llegó puntual, como siempre.`,
      `Los agricultores de ${civ.name} miraron impotentes cómo su trabajo de un año desaparecía en horas. Las langostas no distinguen entre ricos y pobres. Eso, al menos, era justo.`,
    ];
    addChronicle('disaster', `La plaga de langostas en ${civ.name}`, LOCUST_STORIES[Math.floor(Math.random() * LOCUST_STORIES.length)], '🦗');
    return true;
  },
  (civs) => {
    // Boom comercial entre dos civs aliadas
    const allied = civs.filter(c => c.allies.size > 0);
    if (allied.length === 0) return false;
    const civA = allied[Math.floor(Math.random() * allied.length)];
    const allyId = [...civA.allies][0];
    const civB = civilizations.get(allyId);
    if (!civB) return false;
    const TRADE_STORIES = [
      `Las caravanas entre ${civA.name} y ${civB.name} se hicieron tan frecuentes que los caminos se convirtieron en carreteras. El intercambio de bienes trajo también el intercambio de ideas. Ambos pueblos salieron ganando.`,
      `${civA.name} tenía lo que ${civB.name} necesitaba. ${civB.name} tenía lo que ${civA.name} deseaba. Así nació una de las rutas comerciales más prósperas de la historia.`,
      `Los mercaderes de ${civA.name} y ${civB.name} aprendieron a hablar la lengua del otro. Primero por necesidad. Luego por amistad. El comercio hizo lo que los diplomáticos no pudieron.`,
    ];
    addChronicle('culture', `Ruta comercial: ${civA.name} y ${civB.name}`, TRADE_STORIES[Math.floor(Math.random() * TRADE_STORIES.length)], '🛒');
    return true;
  },
  (civs) => {
    // Intercambio cultural entre civs aliadas
    const allied = civs.filter(c => c.allies.size > 0 && (c.avgKnowledge || 0) >= 150);
    if (allied.length === 0) return false;
    const civA = allied[Math.floor(Math.random() * allied.length)];
    const allyId = [...civA.allies][0];
    const civB = civilizations.get(allyId);
    if (!civB) return false;
    addChronicle('culture', `Intercambio cultural: ${civA.name} y ${civB.name}`,
      `Los artistas de ${civA.name} viajaron a ${civB.name}. Los filósofos de ${civB.name} visitaron ${civA.name}. Lo que volvió con ellos no era lo mismo que se fue. La cultura, como el agua, siempre encuentra la forma de mezclarse.`, '🎭');
    return true;
  },
  (civs) => {
    // Logro arquitectónico — civ con muchas estructuras
    const civ = civs.find(c => c.structureCount >= 5 && c.population >= 8);
    if (!civ) return false;
    const ARCH_STORIES = [
      `Las construcciones de ${civ.name} empezaron a verse desde lejos. Viajeros de otras tierras hacían desvíos solo para contemplarlas. La arquitectura se convirtió en el idioma con el que ${civ.name} le hablaba al mundo.`,
      `Generación tras generación, ${civ.name} construyó sobre lo que sus antepasados dejaron. El resultado era una ciudad que parecía haber crecido sola, como un árbol que no pide permiso.`,
      `Los ingenieros de ${civ.name} resolvieron problemas que otros ni siquiera habían identificado. Sus puentes, sus muros, sus templos — todo hablaba de un pueblo que pensaba en el futuro.`,
    ];
    addChronicle('culture', `Las grandes obras de ${civ.name}`, ARCH_STORIES[Math.floor(Math.random() * ARCH_STORIES.length)], '🏛️');
    return true;
  },
  (civs) => {
    // Derrota militar — civ que perdió una guerra
    const defeated = civs.filter(c => c.enemies.size > 0 && c.population >= 5);
    if (defeated.length === 0) return false;
    const civ = defeated[Math.floor(Math.random() * defeated.length)];
    const DEFEAT_STORIES = [
      `Los ejércitos de ${civ.name} regresaron sin victorias. La derrota no los destruyó, pero los cambió. A veces perder es la única forma de aprender lo que realmente importa.`,
      `${civ.name} sufrió una derrota que nadie esperaba. Los generales culparon al clima. Los soldados culparon a los generales. El pueblo culpó a todos. La verdad, como siempre, era más complicada.`,
      `La retirada de ${civ.name} fue ordenada, pero humillante. Cedieron territorio. Cedieron orgullo. Pero no cedieron su voluntad de volver más fuertes.`,
    ];
    addChronicle('war', `La derrota de ${civ.name}`, DEFEAT_STORIES[Math.floor(Math.random() * DEFEAT_STORIES.length)], '🏳️');
    return true;
  },
  (civs) => {
    // Traición diplomática
    const civ = civs.find(c => c.allies.size > 0 && c.enemies.size > 0);
    if (!civ) return false;
    const BETRAYAL_STORIES = [
      `${civ.name} descubrió que su aliado más cercano había estado negociando con sus enemigos. La traición no tiene precio, pero siempre tiene consecuencias.`,
      `El tratado fue firmado con sonrisas. Roto con cuchillos. ${civ.name} aprendió que la diplomacia sin confianza es solo teatro.`,
      `Los espías de ${civ.name} trajeron la noticia antes de que fuera demasiado tarde. Apenas. La alianza que parecía eterna duró lo que duran todas las alianzas: hasta que dejó de ser conveniente.`,
    ];
    addChronicle('war', `La traición que sacudió a ${civ.name}`, BETRAYAL_STORIES[Math.floor(Math.random() * BETRAYAL_STORIES.length)], '🗡️');
    return true;
  },
  (civs) => {
    // Conversión religiosa masiva
    const civ = civs.find(c => c.population >= 10 && (c.avgKnowledge || 0) >= 80);
    if (!civ) return false;
    const RELIGION_STORIES = [
      `Un predicador llegó a ${civ.name} sin nada más que palabras. Cuando se fue, la mitad del pueblo había cambiado de fe. Los sacerdotes antiguos no lo perdonaron. El pueblo no los escuchó.`,
      `La nueva fe llegó a ${civ.name} por las rutas comerciales, escondida entre las especias y las telas. Se extendió en susurros antes de que nadie pudiera detenerla.`,
      `${civ.name} no abandonó sus dioses de golpe. Los fue mezclando con los nuevos, poco a poco, hasta que nadie recordaba dónde terminaba uno y empezaba el otro.`,
    ];
    addChronicle('culture', `La nueva fe en ${civ.name}`, RELIGION_STORIES[Math.floor(Math.random() * RELIGION_STORIES.length)], '🙏');
    return true;
  },
  (civs) => {
    // Descubrimiento accidental — tecnología por error
    const civ = civs.find(c => (c.avgKnowledge || 0) >= 300 && c.population >= 6);
    if (!civ) return false;
    const ACCIDENTS = [
      [`el vidrio`, `Un alfarero de ${civ.name} dejó arena en el horno equivocado. Lo que salió no era cerámica. Era transparente, frágil y hermoso. Tardaron años en entender qué habían hecho. Tardaron décadas en dominarlo.`],
      [`la fermentación`, `Alguien en ${civ.name} olvidó un cuenco de fruta durante demasiado tiempo. Lo que encontró al volver no era lo que esperaba. Era mejor. Mucho mejor.`],
      [`el papel`, `Intentaban hacer tela. Hicieron algo más fino, más ligero, más útil. ${civ.name} no lo llamó error. Lo llamó progreso.`],
      [`el jabón`, `La grasa y la ceniza se mezclaron por accidente en las cocinas de ${civ.name}. El resultado olía mal pero limpiaba bien. La higiene nunca volvió a ser lo mismo.`],
      [`los antibióticos naturales`, `Un curandero de ${civ.name} notó que el moho en el pan viejo curaba heridas infectadas. Sus colegas se rieron. Sus pacientes sobrevivieron.`],
    ];
    const acc = ACCIDENTS[Math.floor(Math.random() * ACCIDENTS.length)];
    addChronicle('science', `${civ.name} descubre ${acc[0]} por accidente`, acc[1], '🔬');
    return true;
  },
  (civs) => {
    // Boom de población — celebración
    const civ = civs.find(c => c.population >= 20);
    if (!civ) return false;
    const POP_STORIES = [
      `${civ.name} celebró el nacimiento de su milésimo ciudadano con tres días de fiesta. Los ancianos decían que nunca habían visto tanta gente. Los jóvenes decían que era solo el principio.`,
      `Las calles de ${civ.name} se llenaron de voces nuevas. Niños que corrían donde antes había silencio. El crecimiento no era solo en números — era en ruido, en vida, en futuro.`,
      `Los registros de ${civ.name} mostraban algo que nadie había visto antes: más nacimientos que muertes durante diez años seguidos. El pueblo florecía.`,
    ];
    addChronicle('culture', `${civ.name} florece`, POP_STORIES[Math.floor(Math.random() * POP_STORIES.length)], '👶');
    return true;
  },
  (civs) => {
    // Aniversario de civilización — civ antigua
    const civ = civs.find(c => c.population >= 5 && (c.avgKnowledge || 0) >= 500);
    if (!civ) return false;
    const ANNIV_STORIES = [
      `${civ.name} lleva generaciones en pie. Otros pueblos nacieron y murieron mientras ellos seguían construyendo. No es suerte. Es memoria colectiva, transmitida de padres a hijos sin interrupciones.`,
      `Los historiadores de ${civ.name} llenaron bibliotecas enteras con su propia historia. Guerras, paces, hambrunas, glorias — todo estaba escrito. Todo sería recordado.`,
      `Cuando otros preguntaban el secreto de la longevidad de ${civ.name}, los ancianos respondían lo mismo: "Nunca olvidamos de dónde venimos."`,
    ];
    addChronicle('culture', `La permanencia de ${civ.name}`, ANNIV_STORIES[Math.floor(Math.random() * ANNIV_STORIES.length)], '🏆');
    return true;
  },
  (civs) => {
    // Explorador que descubre nuevas tierras
    const civ = civs.find(c => c.population >= 8 && (c.avgKnowledge || 0) >= 120);
    if (!civ) return false;
    const EXPLORER_STORIES = [
      `Un explorador de ${civ.name} partió hacia el este con tres compañeros y volvió solo, pero con mapas que nadie había dibujado antes. No habló de lo que perdió. Solo habló de lo que encontró.`,
      `Los exploradores de ${civ.name} cruzaron la montaña que todos decían que era infranqueable. Al otro lado encontraron un valle verde, ríos limpios y ningún enemigo. Por ahora.`,
      `La expedición de ${civ.name} tardó dos años en volver. Cuando lo hizo, nadie los reconoció. Ellos tampoco reconocieron su hogar. Ambos habían cambiado demasiado.`,
    ];
    addChronicle('culture', `Los exploradores de ${civ.name}`, EXPLORER_STORIES[Math.floor(Math.random() * EXPLORER_STORIES.length)], '🧭');
    return true;
  },
  (civs) => {
    // Obra maestra artesanal
    const civ = civs.find(c => c.population >= 6 && (c.avgKnowledge || 0) >= 80);
    if (!civ) return false;
    const CRAFT_STORIES = [
      `Un tejedor de ${civ.name} pasó veinte años perfeccionando una técnica que nadie más podía imitar. Su obra fue copiada, admirada y nunca igualada. Murió sabiendo que había hecho algo único.`,
      `La espada forjada por el maestro herrero de ${civ.name} pasó de mano en mano durante generaciones. Cada dueño añadió su historia a la hoja. Ninguno la manchó de deshonor.`,
      `El mural que pintó una artista de ${civ.name} en la pared del templo sobrevivió a guerras, terremotos y el paso del tiempo. Siglos después, la gente seguía deteniéndose a mirarlo.`,
    ];
    addChronicle('culture', `La obra maestra de ${civ.name}`, CRAFT_STORIES[Math.floor(Math.random() * CRAFT_STORIES.length)], '🎨');
    return true;
  },
  (civs) => {
    // Movimiento filosófico
    const civ = civs.find(c => (c.avgKnowledge || 0) >= 400 && c.population >= 8);
    if (!civ) return false;
    const PHILO_STORIES = [
      `Un grupo de pensadores en ${civ.name} empezó a hacer preguntas que nadie quería responder: ¿Por qué obedecemos? ¿Quién decide lo que es justo? ¿Qué le debemos a los que vendrán después? Las respuestas tardaron generaciones. Las preguntas cambiaron todo.`,
      `La escuela de pensamiento que nació en ${civ.name} no tenía nombre al principio. Solo tenía ideas. Y las ideas, bien sembradas, crecen solas.`,
      `Los filósofos de ${civ.name} fueron ignorados, luego ridiculizados, luego perseguidos. Finalmente, fueron citados por los mismos que los persiguieron. Así funciona la historia del pensamiento.`,
    ];
    addChronicle('science', `El pensamiento de ${civ.name}`, PHILO_STORIES[Math.floor(Math.random() * PHILO_STORIES.length)], '📜');
    return true;
  },
  (civs) => {
    // Bandidos / crimen organizado
    const civ = civs.find(c => c.population >= 12 && c.enemies.size > 0);
    if (!civ) return false;
    const BANDIT_STORIES = [
      `Las rutas comerciales de ${civ.name} se volvieron peligrosas. Los bandidos no eran extranjeros — eran ciudadanos que habían perdido demasiado y no tenían nada que perder. El problema no era la seguridad. Era la justicia.`,
      `Un grupo de forajidos operaba desde las colinas al norte de ${civ.name}. Robaban a los ricos, decían. Los ricos decían otra cosa. La verdad, como siempre, dependía de quién la contaba.`,
      `${civ.name} ofreció amnistía a los bandidos que depusieran las armas. Algunos aceptaron. Otros prefirieron la libertad peligrosa a la seguridad encadenada.`,
    ];
    addChronicle('war', `Los forajidos de ${civ.name}`, BANDIT_STORIES[Math.floor(Math.random() * BANDIT_STORIES.length)], '🗡️');
    return true;
  },
  (civs) => {
    // Avance médico / curación
    const civ = civs.find(c => (c.avgKnowledge || 0) >= 250 && c.population >= 6);
    if (!civ) return false;
    const MEDICINE_STORIES = [
      `Los curanderos de ${civ.name} desarrollaron un tratamiento para la fiebre que mató a miles el año anterior. No lo llamaron medicina. Lo llamaron sentido común. Funcionó igual.`,
      `Una herborista de ${civ.name} catalogó cien plantas y sus usos. Su libro fue copiado a mano durante generaciones. Salvó más vidas que cualquier ejército.`,
      `${civ.name} aprendió a hervir el agua antes de beberla. Parecía obvio. No lo era. La mortalidad infantil cayó a la mitad en una generación.`,
    ];
    addChronicle('science', `Medicina en ${civ.name}`, MEDICINE_STORIES[Math.floor(Math.random() * MEDICINE_STORIES.length)], '⚕️');
    return true;
  },
  (civs) => {
    // Innovación agrícola
    const civ = civs.find(c => {
      const types = _civStructureTypes.get(c.id);
      return types && types.has('granary') && c.population >= 8;
    });
    if (!civ) return false;
    const AGRI_STORIES = [
      `Los agricultores de ${civ.name} descubrieron que rotar los cultivos mantenía la tierra fértil. Sus vecinos los miraron con escepticismo. Diez años después, los imitaban.`,
      `${civ.name} construyó terrazas en las laderas que nadie creía cultivables. Fue trabajo de décadas. El resultado alimentó a generaciones.`,
      `Un agricultor de ${civ.name} cruzó dos variedades de trigo por curiosidad. La nueva variedad resistía la sequía y rendía el doble. Lo llamaron suerte. Era ciencia.`,
    ];
    addChronicle('science', `Innovación agrícola en ${civ.name}`, AGRI_STORIES[Math.floor(Math.random() * AGRI_STORIES.length)], '🌾');
    return true;
  },
  (civs) => {
    // Maravilla natural descubierta
    const civ = civs.find(c => c.population >= 6);
    if (!civ) return false;
    const WONDER_STORIES = [
      `Los exploradores de ${civ.name} encontraron una cascada tan alta que el agua se convertía en niebla antes de llegar al suelo. La llamaron "el velo del cielo". Nadie discutió el nombre.`,
      `En las profundidades del bosque al este de ${civ.name}, los cazadores encontraron una cueva cuyas paredes brillaban en la oscuridad. Los sacerdotes dijeron que era sagrada. Los científicos dijeron que era mineral. Ambos tenían razón.`,
      `${civ.name} descubrió un lago de aguas tan claras que podías ver el fondo a veinte metros de profundidad. Lo protegieron como si fuera un tesoro. Lo era.`,
    ];
    addChronicle('culture', `Maravilla natural de ${civ.name}`, WONDER_STORIES[Math.floor(Math.random() * WONDER_STORIES.length)], '🌋');
    return true;
  },
  (civs) => {
    // Rebelión interna sofocada
    const civ = civs.find(c => c.population >= 15 && (c.avgKnowledge || 0) >= 100);
    if (!civ) return false;
    const REBEL_STORIES = [
      `Los campesinos de ${civ.name} se hartaron. No fue de golpe — fue una acumulación de años de injusticia, impuestos y silencio forzado. Cuando hablaron, lo hicieron con fuego. El líder escuchó. Tarde, pero escuchó.`,
      `La rebelión en ${civ.name} duró tres semanas. No ganó. Pero tampoco perdió del todo — las reformas que siguieron llevaban la huella de los que se atrevieron a levantarse.`,
      `${civ.name} sofocó la revuelta con rapidez. Lo que no pudo sofocar fueron las ideas que la habían provocado. Esas siguieron circulando, en susurros, durante generaciones.`,
    ];
    addChronicle('war', `La rebelión en ${civ.name}`, REBEL_STORIES[Math.floor(Math.random() * REBEL_STORIES.length)], '✊');
    return true;
  },
  (civs) => {
    // Hambruna y recuperación
    const civ = civs.find(c => c.population >= 10);
    if (!civ) return false;
    const FAMINE_STORIES = [
      `${civ.name} enterró a sus muertos en silencio. La hambruna no distinguió entre nobles y plebeyos — el hambre es el gran igualador. Los que sobrevivieron juraron que nunca volverían a depender de una sola cosecha.`,
      `Tres años de malas cosechas pusieron a ${civ.name} de rodillas. El cuarto año, la lluvia volvió. La gente salió a los campos a llorar de alivio. Algunos lloraban por los que no llegaron a ver ese día.`,
      `La hambruna en ${civ.name} fue tan severa que la gente comió corteza de árbol. Los que lo vivieron no hablaban de ello. Los que lo escucharon no lo olvidaron.`,
    ];
    addChronicle('disaster', `La hambruna de ${civ.name}`, FAMINE_STORIES[Math.floor(Math.random() * FAMINE_STORIES.length)], '🌵');
    return true;
  },
  (civs) => {
    // Espía descubierto — tensión diplomática
    const civ = civs.find(c => c.enemies.size > 0 && c.population >= 6);
    if (!civ) return false;
    const SPY_STORIES = [
      `Los guardias de ${civ.name} capturaron a un espía en el corazón de la ciudad. Lo que llevaba consigo era suficiente para iniciar una guerra. O para evitarla. Dependía de quién lo leyera primero.`,
      `El espía de ${civ.name} operó durante años sin ser detectado. Cuando cayó, no fue por un error — fue por una traición. Alguien lo vendió. Nadie supo quién.`,
      `${civ.name} descubrió que su propio consejero era un informante enemigo. La traición desde dentro siempre duele más. Siempre.`,
    ];
    addChronicle('war', `El espía de ${civ.name}`, SPY_STORIES[Math.floor(Math.random() * SPY_STORIES.length)], '🕵️');
    return true;
  },
  (civs) => {
    // Niño prodigio que cambia su civilización
    const civ = civs.find(c => c.population >= 6 && (c.avgKnowledge || 0) >= 150);
    if (!civ) return false;
    const PRODIGY_STORIES = [
      `A los doce años, el niño ya resolvía problemas que los maestros de ${civ.name} no podían. A los veinte, había reescrito lo que su pueblo sabía sobre las estrellas. A los treinta, era una leyenda. A los cuarenta, era una institución.`,
      `Nadie en ${civ.name} entendía cómo una niña de esa edad podía saber lo que sabía. Sus padres eran agricultores. Sus maestros eran mediocres. Ella era otra cosa.`,
      `El joven prodigio de ${civ.name} no tenía paciencia para las reglas. Las rompía todas. Y cada vez que lo hacía, descubría algo nuevo. Sus maestros aprendieron a dejarle espacio.`,
    ];
    addChronicle('science', `El prodigio de ${civ.name}`, PRODIGY_STORIES[Math.floor(Math.random() * PRODIGY_STORIES.length)], '🌟');
    return true;
  },
  (civs) => {
    // Ciclo de venganza entre civs enemigas
    const warCivs = civs.filter(c => c.enemies.size > 0 && c.population >= 5);
    if (warCivs.length === 0) return false;
    const civA = warCivs[Math.floor(Math.random() * warCivs.length)];
    const enemyId = [...civA.enemies][0];
    const civB = civilizations.get(enemyId);
    if (!civB) return false;
    const REVENGE_STORIES = [
      `${civA.name} atacó. ${civB.name} respondió. ${civA.name} contraatacó. Nadie recordaba ya quién había empezado. Solo sabían que no podían parar.`,
      `Cada ataque de ${civA.name} generaba una represalia de ${civB.name}. Cada represalia justificaba el siguiente ataque. El ciclo llevaba décadas girando y nadie sabía cómo romperlo.`,
      `Los historiadores de ambos pueblos escribían la misma guerra desde perspectivas opuestas. En ambas versiones, el otro era el agresor. En ambas versiones, tenían razón.`,
    ];
    addChronicle('war', `El ciclo de venganza: ${civA.name} y ${civB.name}`, REVENGE_STORIES[Math.floor(Math.random() * REVENGE_STORIES.length)], '🔄');
    return true;
  },
  (civs) => {
    // Movimiento de reforma social
    const civ = civs.find(c => c.population >= 12 && (c.avgKnowledge || 0) >= 200);
    if (!civ) return false;
    const REFORM_STORIES = [
      `Un grupo de ciudadanos de ${civ.name} presentó al consejo una lista de reformas. Pedían menos impuestos, más derechos, mejor justicia. El consejo los ignoró el primer año. El segundo año, los escuchó. El tercero, cedió.`,
      `La reforma llegó a ${civ.name} sin violencia, lo cual era inusual. Alguien convenció a los poderosos de que era mejor ceder un poco que perderlo todo. Fue un milagro de la diplomacia.`,
      `${civ.name} cambió sus leyes por primera vez en generaciones. No todos estaban contentos. Pero más gente tenía voz que antes. Eso era suficiente para empezar.`,
    ];
    addChronicle('culture', `La reforma de ${civ.name}`, REFORM_STORIES[Math.floor(Math.random() * REFORM_STORIES.length)], '⚖️');
    return true;
  },
  (civs) => {
    // Epidemia local superada
    const civ = civs.find(c => c.population >= 8);
    if (!civ) return false;
    const EPIDEMIC_STORIES = [
      `La enfermedad llegó a ${civ.name} con los mercaderes del sur. En semanas, un tercio de la población estaba en cama. Los curanderos trabajaron sin dormir. Algunos murieron también. Los que sobrevivieron eran más fuertes, o más afortunados. Nadie sabía cuál de las dos cosas.`,
      `${civ.name} aisló a los enfermos antes de que nadie les dijera que debían hacerlo. El instinto de supervivencia es el médico más antiguo. Funcionó.`,
      `La epidemia en ${civ.name} mató a los más débiles y a los más viejos. Los niños, curiosamente, sobrevivieron mejor. Nadie entendía por qué. Años después, alguien lo explicaría.`,
    ];
    addChronicle('disaster', `La epidemia de ${civ.name}`, EPIDEMIC_STORIES[Math.floor(Math.random() * EPIDEMIC_STORIES.length)], '🤒');
    return true;
  },
  (civs) => {
    // Líder carismático que unifica
    const civ = civs.find(c => c.population >= 10 && c.allies.size > 0);
    if (!civ) return false;
    const LEADER_STORIES = [
      `El nuevo líder de ${civ.name} no llegó al poder por herencia ni por fuerza. Llegó porque la gente lo seguía. Eso era más raro y más valioso que cualquier título.`,
      `Bajo el liderazgo de ${civ.name}, pueblos que nunca habían cooperado encontraron razones para hacerlo. No era magia. Era escucha, paciencia y el arte de hacer que todos creyeran que la idea había sido suya.`,
      `El líder de ${civ.name} tenía un don extraño: hacía que la gente se sintiera escuchada incluso cuando les decía que no. Eso, en política, vale más que el oro.`,
    ];
    addChronicle('culture', `El líder de ${civ.name}`, LEADER_STORIES[Math.floor(Math.random() * LEADER_STORIES.length)], '👑');
    return true;
  },
  (civs) => {
    // Colapso de una alianza
    const civ = civs.find(c => c.allies.size > 0 && c.enemies.size > 0);
    if (!civ) return false;
    const allyId = [...civ.allies][0];
    const ally = civilizations.get(allyId);
    if (!ally) return false;
    const COLLAPSE_STORIES = [
      `La alianza entre ${civ.name} y ${ally.name} duró décadas. La rompió un malentendido que ninguno de los dos quiso aclarar a tiempo. Así terminan la mayoría de las alianzas: no con un grito, sino con un silencio.`,
      `${civ.name} y ${ally.name} habían construido juntos más de lo que ninguno podría haber construido solo. Por eso dolió tanto cuando se separaron. Lo que se construye junto, al romperse, deja más escombros.`,
      `Los historiadores debatirían durante generaciones quién tuvo la culpa. La respuesta honesta era: los dos. Y ninguno.`,
    ];
    addChronicle('war', `El fin de la alianza: ${civ.name} y ${ally.name}`, COLLAPSE_STORIES[Math.floor(Math.random() * COLLAPSE_STORIES.length)], '💔');
    return true;
  },
  (civs) => {
    // Festival o celebración cultural
    const civ = civs.find(c => c.population >= 8 && (c.avgKnowledge || 0) >= 60);
    if (!civ) return false;
    const FESTIVAL_STORIES = [
      `${civ.name} celebró su festival anual con más gente que nunca. Las hogueras se veían desde lejos. La música duró tres días. Por un momento, todos olvidaron sus problemas. Eso también es necesario.`,
      `El festival de la cosecha en ${civ.name} era más que una celebración — era un recordatorio de que la comunidad era más fuerte que cualquier individuo. Todos traían algo. Todos se llevaban más.`,
      `Los juegos anuales de ${civ.name} reunían a competidores de pueblos vecinos. Ganaban los más rápidos, los más fuertes, los más hábiles. Pero todos volvían a casa con algo que no tenían al llegar: respeto mutuo.`,
    ];
    addChronicle('culture', `El festival de ${civ.name}`, FESTIVAL_STORIES[Math.floor(Math.random() * FESTIVAL_STORIES.length)], '🎉');
    return true;
  },
];

function tickRandomChronicles(yearsElapsed) {
  _randomChronicleTimer += yearsElapsed;
  if (_randomChronicleTimer < 180) return; // roughly every 180 game-years
  _randomChronicleTimer = 0;
  if (Math.random() > 0.6) return; // 40% chance each interval
  const civs = _fillCivBuf(3);
  if (civs.length === 0) return;
  // Shuffle pool and try until one fires
  const pool = [..._RANDOM_CHRONICLE_POOL].sort(() => Math.random() - 0.5);
  for (const fn of pool) {
    try { if (fn(civs)) break; } catch(e) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUERRA NUCLEAR — silos, lanzamientos, explosiones visibles, extinción
// ═══════════════════════════════════════════════════════════════════════════════
let _nuclearTimer = 0;
// Active nuclear explosions for renderer: [{tx, ty, radius, maxRadius, age, maxAge, civName}]
const _nuclearExplosions = [];
// Radiation tiles: Set of "tx,ty" — humans here take damage
const _radiationTiles = new Set();

function getNuclearExplosions() { return _nuclearExplosions; }
function getRadiationTiles() { return _radiationTiles; }

function _launchNuke(attackerCiv, targetCiv) {
  // Find a target tile — enemy city center or random enemy human
  let tx, ty;
  const enemyMembers = _cachedAlive.filter(h => h.civId === targetCiv.id);
  if (enemyMembers.length > 0) {
    const target = enemyMembers[Math.floor(Math.random() * enemyMembers.length)];
    tx = target.tx; ty = target.ty;
  } else if (targetCiv.cityCenter) {
    tx = targetCiv.cityCenter.tx; ty = targetCiv.cityCenter.ty;
  } else {
    return;
  }

  const blastRadius = 12 + Math.floor(Math.random() * 8); // 12-20 tiles
  const r2 = blastRadius * blastRadius;

  // Kill humans in blast zone
  let killed = 0;
  for (const h of _cachedAlive) {
    const dx = h.tx - tx, dy = h.ty - ty;
    if (dx*dx + dy*dy <= r2) {
      h._die('bomba nuclear');
      killed++;
    }
  }

  // Destroy structures in blast zone
  let destroyed = 0;
  for (let i = structures.length - 1; i >= 0; i--) {
    const s = structures[i];
    const dx = s.tx - tx, dy = s.ty - ty;
    if (dx*dx + dy*dy <= r2) {
      if (structureGrid) structureGrid[s.ty * WORLD_W + s.tx] = null;
      structures.splice(i, 1);
      destroyed++;
    }
  }
  if (typeof markCityGlowDirty !== 'undefined') markCityGlowDirty();

  // Leave radiation tiles
  for (let dy = -blastRadius; dy <= blastRadius; dy++) {
    for (let dx = -blastRadius; dx <= blastRadius; dx++) {
      if (dx*dx + dy*dy <= r2) {
        const rtx = tx + dx, rty = ty + dy;
        if (rtx >= 0 && rtx < WORLD_W && rty >= 0 && rty < WORLD_H) {
          _radiationTiles.add(`${rtx},${rty}`);
        }
      }
    }
  }

  // Add visual explosion
  _nuclearExplosions.push({ tx, ty, radius: 0, maxRadius: blastRadius * TILE, age: 0, maxAge: 4.0, civName: attackerCiv.name });

  // Chronicle + events
  addMajorEvent(`☢️ ¡BOMBA NUCLEAR! ${attackerCiv.name} lanzó un misil sobre ${targetCiv.name} — ${killed} muertos, ${destroyed} estructuras destruidas`);
  addChronicle('war', `Guerra Nuclear: ${attackerCiv.name} vs ${targetCiv.name}`,
    `El hongo de fuego se alzó sobre las ruinas de lo que fue una ciudad. ${killed} almas desaparecieron en un instante. ${destroyed} estructuras que tardaron generaciones en construirse se convirtieron en polvo. El mundo nunca volvería a ser el mismo. La humanidad había cruzado el umbral del que no hay retorno.`, '☢️');

  // Set extinction cause if this wipes out humanity
  if (typeof _setExtinctionCause !== 'undefined') {
    _setExtinctionCause('nuclear', `${attackerCiv.name} lanzó bombas nucleares sobre ${targetCiv.name}`);
  }
}

function tickNuclearWar(yearsElapsed) {
  // Tick visual explosions
  for (let i = _nuclearExplosions.length - 1; i >= 0; i--) {
    const e = _nuclearExplosions[i];
    e.age += yearsElapsed * 0.08; // slow visual fade
    e.radius = Math.min(e.maxRadius, e.maxRadius * (e.age / (e.maxAge * 0.3)));
    if (e.age >= e.maxAge) _nuclearExplosions.splice(i, 1);
  }

  // Radiation damage — humans on radiation tiles take slow damage
  if (_radiationTiles.size > 0 && Math.floor(year) % 5 === 0) {
    for (const h of _cachedAlive) {
      if (_radiationTiles.has(`${h.tx},${h.ty}`)) {
        h.health = Math.max(0, h.health - 8);
        h.sick = true;
        if (!h.sickType) h.sickType = { name: 'Radiación', cure: 0.001, spread: 0, duration: 999 };
        if (h.health <= 0) h._die('radiación nuclear');
      }
    }
  }

  // Radiation decay — tiles slowly become safe
  if (_radiationTiles.size > 0 && Math.floor(year) % 200 === 0) {
    const keys = [..._radiationTiles];
    const toRemove = Math.ceil(keys.length * 0.1);
    for (let i = 0; i < toRemove; i++) _radiationTiles.delete(keys[i]);
  }

  // Nuclear launch logic — warring civs with silos
  _nuclearTimer += yearsElapsed;
  if (_nuclearTimer < 80) return;
  _nuclearTimer = 0;

  // Find civs with nuclear silos
  const nukeCapable = [];
  for (const [, civ] of civilizations) {
    if (civ.population < 3) continue;
    const hasSilo = structures.some(s => s.civId === civ.id && s.type === 'nuclear_silo');
    if (hasSilo) nukeCapable.push(civ);
  }
  if (nukeCapable.length < 2) return;

  for (const civ of nukeCapable) {
    if (civ.enemies.size === 0) continue;
    // Only launch if at war and has enemies with population
    const enemyIds = [...civ.enemies].filter(id => {
      const e = civilizations.get(id);
      return e && e.population > 0;
    });
    if (enemyIds.length === 0) continue;

    // Low probability — nuclear war is rare but possible
    // ~0.5% chance per 80-year interval per civ = roughly once every 16000 years if conditions met
    if (Math.random() > 0.005) continue;

    const targetId = enemyIds[Math.floor(Math.random() * enemyIds.length)];
    const targetCiv = civilizations.get(targetId);
    if (!targetCiv) continue;

    _launchNuke(civ, targetCiv);

    // Retaliation — target launches back if they also have silos
    const targetHasSilo = structures.some(s => s.civId === targetId && s.type === 'nuclear_silo');
    if (targetHasSilo && Math.random() < 0.7) {
      setTimeout(() => {
        try { _launchNuke(targetCiv, civ); } catch(e) {}
      }, 800);
    }
    break; // one launch per tick
  }
}

function tickAdvancedDiplomacy(yearsElapsed) {
  _diplomacyTimer += yearsElapsed;
  if (_diplomacyTimer < 50) return;
  _diplomacyTimer = 0;

  // Expirar tratados viejos
  for (let i = _treaties.length - 1; i >= 0; i--) {
    const t = _treaties[i];
    if (year - t.year > t.duration) {
      _treaties.splice(i, 1);
    }
  }

  const civList = _fillCivBuf(3);
  for (let i = 0; i < civList.length; i++) {
    const civA = civList[i];
    const avgKA = _civAvgKnowledge(civA.id);
    for (let j = i + 1; j < civList.length; j++) {
      const civB = civList[j];
      // No tratar con enemigos activos en guerra
      if (civA.atWarWith.has(civB.id)) continue;
      // Ya tienen tratado?
      const hasTreaty = _treaties.some(t =>
        (t.civA === civA.id && t.civB === civB.id) ||
        (t.civA === civB.id && t.civB === civA.id)
      );
      if (hasTreaty) continue;
      if (Math.random() > 0.12) continue;

      // First contact chronicle
      _checkFirstContact(civA, civB);

      const avgKB = _civAvgKnowledge(civB.id);
      const avgK = (avgKA + avgKB) / 2;

      // Elegir el tratado más avanzado que puedan firmar
      let best = null;
      for (const tt of TREATY_TYPES) {
        if (avgK >= tt.minK) best = tt;
      }
      if (!best) best = TREATY_TYPES[0];

      best.effect(civA, civB);
      _treaties.push({ civA: civA.id, civB: civB.id, type: best.id, year, duration: best.duration });
      addMajorEvent(`${best.icon} ${civA.name} y ${civB.name} firman un ${best.name}`);
      addChronicle('diplomacy', `${best.name}: ${civA.name} & ${civB.name}`,
        `Los representantes de ambas naciones se reunieron y sellaron un acuerdo que cambiaría sus relaciones para siempre. El ${best.name} fue firmado ante testigos de ambos pueblos.`, best.icon);
    }
  }

  // Unión Cultural: boost de conocimiento mutuo
  for (const t of _treaties) {
    if (t.type !== 'union_cultural') continue;
    const a = civilizations.get(t.civA), b = civilizations.get(t.civB);
    if (!a || !b) continue;
    for (const id of a.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 3 * _intelModifier); }
    for (const id of b.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 3 * _intelModifier); }
  }
}

function _civAvgKnowledge(civId) {
  const civ = civilizations.get(civId);
  if (!civ || civ.population === 0) return 0;
  // Use cached value from leader elect loop (updated every 5 years)
  if (civ.avgKnowledge != null) return civ.avgKnowledge;
  let sum = 0, cnt = 0;
  for (const id of civ.members) { const h = _hById(id); if (h && h.alive) { sum += h.knowledge; cnt++; } }
  return cnt > 0 ? sum / cnt : 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TURISMO Y CENTROS TURÍSTICOS — civs avanzadas atraen visitantes
// ═══════════════════════════════════════════════════════════════════════════════
const _touristSites = []; // {civId, tx, ty, name, visitors, income}
let _tourismTimer = 0;

function tickTourism(yearsElapsed) {
  _tourismTimer += yearsElapsed;
  if (_tourismTimer < 60) return;
  _tourismTimer = 0;

  const TOURIST_SITE_NAMES = [
    'Gran Bazar', 'Templo Milenario', 'Palacio Real', 'Coliseo Antiguo',
    'Jardines Colgantes', 'Torre del Reloj', 'Puerto Histórico', 'Mercado Central',
    'Catedral Gótica', 'Anfiteatro Romano', 'Pirámide Sagrada', 'Faro Colosal',
  ];

  // Crear sitios turísticos en civs con maravillas o estructuras épicas
  for (const [, civ] of civilizations) {
    if ((civ.knowledge || 0) < 3000 || civ.population < 8) continue;
    const alreadyHas = _touristSites.some(s => s.civId === civ.id);
    if (alreadyHas) continue;
    if (Math.random() > 0.15) continue;

    const epicStructures = structures.filter(s =>
      s.civId === civ.id &&
      ['palace','cathedral','colosseum','pyramid','ziggurat','amphitheater','lighthouse','stadium'].includes(s.type)
    );
    if (!epicStructures.length) continue;

    const anchor = epicStructures[Math.floor(Math.random() * epicStructures.length)];
    const siteName = TOURIST_SITE_NAMES[Math.floor(Math.random() * TOURIST_SITE_NAMES.length)];
    _touristSites.push({ civId: civ.id, tx: anchor.tx, ty: anchor.ty, name: siteName, visitors: 0, income: 0 });
    addWorldEvent(`🗺️ ${civ.name} establece el ${siteName} como destino turístico`);
  }

  // Turismo activo: civs aliadas envían "visitantes" que generan conocimiento e ingresos
  for (const site of _touristSites) {
    const hostCiv = civilizations.get(site.civId);
    if (!hostCiv || hostCiv.population === 0) continue;

    let visitors = 0;
    for (const alliedId of hostCiv.allies) {
      const allied = civilizations.get(alliedId);
      if (!allied || allied.population === 0) continue;
      if (Math.random() > 0.4) continue;
      visitors += Math.floor(allied.population * 0.1);
      // Los visitantes llevan conocimiento de vuelta
      const kBonus = 20 + Math.floor(Math.random() * 30);
      for (const id of allied.members) {
        const h = _hById(id);
        if (h && h.alive && Math.random() < 0.3) h.knowledge = Math.min(99999, h.knowledge + kBonus * _intelModifier);
      }
    }
    site.visitors = visitors;
    site.income += visitors * 2;

    // El anfitrión también gana conocimiento y honor
    if (visitors > 0) {
      for (const id of hostCiv.members) {
        const h = _hById(id);
        if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 5 * _intelModifier);
      }
      hostCiv.honor = Math.min(100, hostCiv.honor + 1);
      if (visitors > 5 && Math.random() < 0.1) {
        addWorldEvent(`✈️ ${visitors} visitantes llegan al ${site.name} de ${hostCiv.name}`);
      }
    }
  }
}

function getTouristSites() { return _touristSites; }

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBALIZACIÓN — cuando múltiples civs avanzadas coexisten, el mundo se integra
// ═══════════════════════════════════════════════════════════════════════════════
let _globalizationLevel = 0; // 0..1
let _globalizationTimer = 0;
let _globalizationAnnounced = [false, false, false, false]; // fases 0.25, 0.5, 0.75, 1.0

function tickGlobalization(yearsElapsed) {
  _globalizationTimer += yearsElapsed;
  if (_globalizationTimer < 30) return;
  _globalizationTimer = 0;

  // La globalización sube cuando hay muchas civs avanzadas con alianzas
  _civBuf.length = 0;
  for (const [, c] of civilizations) { if ((c.knowledge || 0) > 5000 && c.population > 5) _civBuf.push(c); }
  const advancedCivs = _civBuf;
  if (advancedCivs.length < 2) return;

  let allianceCount = 0;
  for (const c of advancedCivs) allianceCount += c.allies.size;
  const allianceDensity = allianceCount / Math.max(1, advancedCivs.length);

  // Sube lentamente con alianzas y civs avanzadas
  const growthRate = 0.0005 * advancedCivs.length * (1 + allianceDensity * 0.3);
  _globalizationLevel = Math.min(1, _globalizationLevel + growthRate * 30);

  // Anunciar hitos
  const milestones = [
    { lvl: 0.25, msg: '🌍 Las civilizaciones comienzan a conectarse — nace el comercio global', phase: 'Integración Temprana' },
    { lvl: 0.50, msg: '🌐 La globalización avanza — las culturas se mezclan y las fronteras se difuminan', phase: 'Integración Media' },
    { lvl: 0.75, msg: '🛰️ El mundo está interconectado — nace una economía global unificada', phase: 'Integración Avanzada' },
    { lvl: 1.00, msg: '🌌 Globalización total — la humanidad habla con una sola voz', phase: 'Aldea Global' },
  ];
  for (let i = 0; i < milestones.length; i++) {
    if (!_globalizationAnnounced[i] && _globalizationLevel >= milestones[i].lvl) {
      _globalizationAnnounced[i] = true;
      addMajorEvent(milestones[i].msg);
      addChronicle('culture', milestones[i].phase,
        `El mundo alcanzó un nuevo nivel de integración. Las ideas, los bienes y las personas fluyen libremente entre civilizaciones. Lo que antes tardaba generaciones en difundirse, ahora llega en años.`, '🌐');
    }
  }

  // Efectos de la globalización: boost de conocimiento proporcional al nivel
  if (_globalizationLevel > 0.1) {
    for (const h of _cachedAlive) {
      h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * _globalizationLevel * 8 * _intelModifier);
    }
    // Reducir guerras activas
    if (_globalizationLevel > 0.5 && Math.random() < 0.05) {
      for (const [, civ] of civilizations) {
        if (civ.atWarWith.size > 0 && Math.random() < _globalizationLevel * 0.3) {
          const firstEnemy = [...civ.atWarWith.keys()][0];
          civ.atWarWith.delete(firstEnemy);
          const enemy = civilizations.get(firstEnemy);
          if (enemy) enemy.atWarWith.delete(civ.id);
          addWorldEvent(`🕊️ La presión global fuerza la paz entre ${civ.name} y sus enemigos`);
        }
      }
    }
  }
}

function getGlobalizationLevel() { return _globalizationLevel; }

// ═══════════════════════════════════════════════════════════════════════════════
// MÚLTIPLES CIVS FORZADAS — asegurar que siempre haya diversidad política
// ═══════════════════════════════════════════════════════════════════════════════
let _civDiversityTimer = 0;
function tickCivDiversity(yearsElapsed) {
  _civDiversityTimer += yearsElapsed;
  if (_civDiversityTimer < 100) return;
  _civDiversityTimer = 0;

  const aliveCivs = _fillCivBuf(0).slice(); // need a stable copy for sort
  if (aliveCivs.length >= 4) return; // ya hay suficiente diversidad
  if (_cachedAlive.length < 15) return; // muy poca gente para dividirse

  // Buscar un grupo de humanos sin civ o en la civ más grande
  const biggestCiv = aliveCivs.sort((a, b) => b.population - a.population)[0];
  if (!biggestCiv || biggestCiv.population < 12) return;
  if (Math.random() > 0.3) return;

  // Tomar un subgrupo de la civ más grande y fundar una nueva
  const members = _cachedAlive.filter(h => h.civId === biggestCiv.id && !h.isLeader && !h.isProdigy);
  if (members.length < 6) return;

  // Elegir un fundador con buenas stats
  members.sort((a, b) => b.leaderScore - a.leaderScore);
  const founder = members[Math.floor(Math.random() * Math.min(3, members.length))];
  const newCiv = new Civilization(founder);
  newCiv.color = `hsl(${Math.floor(Math.random() * 360)},65%,55%)`;
  civilizations.set(newCiv.id, newCiv);
  founder.isLeader = true;
  founder.color = newCiv.color;

  // Llevar entre 3-5 seguidores
  const followers = members.slice(1, 1 + 3 + Math.floor(Math.random() * 3));
  for (const f of followers) {
    biggestCiv.removeMember(f.id);
    f.civId = newCiv.id;
    f.color = newCiv.color;
    newCiv.addMember(f);
  }

  // Relación inicial: neutral (ni aliados ni enemigos)
  addMajorEvent(`🏳️ Un grupo se separa de ${biggestCiv.name} y funda ${newCiv.name} — nace una nueva nación`);
  addChronicle('culture', `Fundación de ${newCiv.name}`,
    `Un grupo de disidentes liderados por ${founder.name.split(' ')[0]} abandonó ${biggestCiv.name} en busca de su propio destino. Cargando sus pertenencias y sus sueños, fundaron ${newCiv.name} en tierras nuevas.`, '🏳️');
}


// ═══════════════════════════════════════════════════════════════════════════════
// 5 NUEVAS MECÁNICAS — Espionaje, Edad de Oro, Mercenarios, Trauma de Guerra, Comercio de Rutas
// ═══════════════════════════════════════════════════════════════════════════════

// ── NUEVA 1: ESPIONAJE ────────────────────────────────────────────────────────
// Civs avanzadas pueden enviar espías a robar tecnología o sabotear enemigos
let _espionageTimer2 = 0;
const _activeSpies2 = []; // {spyId, targetCivId, missionType, yearsLeft}
const SPY_MISSIONS = ['robo_tecnologia','sabotaje','asesinato','diplomacia_secreta'];
function tickEspionage2(yearsElapsed) {
  _espionageTimer2 += yearsElapsed;
  if (_espionageTimer2 < 30) return;
  _espionageTimer2 = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Limpiar misiones expiradas
  for (let i = _activeSpies2.length - 1; i >= 0; i--) {
    _activeSpies2[i].yearsLeft -= 30;
    if (_activeSpies2[i].yearsLeft <= 0) {
      const spy = _activeSpies2[i];
      const spyH = _hById(spy.spyId);
      const targetCiv = civilizations.get(spy.targetCivId);
      if (spyH && spyH.alive && targetCiv) {
        const success = Math.random() < 0.5 + spyH.knowledge * 0.00002;
        if (success) {
          if (spy.missionType === 'robo_tecnologia') {
            const myCiv = civilizations.get(spyH.civId);
            if (myCiv && targetCiv.techLevel > myCiv.techLevel) {
              myCiv.techLevel = Math.min(myCiv.techLevel + 1, targetCiv.techLevel);
              spyH.knowledge = Math.min(99999, spyH.knowledge + 500 * _intelModifier);
              addMajorEvent(`🕵️ ${spyH.name.split(' ')[0]} robó tecnología de ${targetCiv.name} — ¡${WEAPON_TIERS[Math.min(myCiv.techLevel+1,WEAPON_TIERS.length-1)]} obtenido!`);
            }
          } else if (spy.missionType === 'sabotaje') {
            // Destruir una estructura del enemigo
            const enemyStructs = structures.filter(s => s.civId === spy.targetCivId);
            if (enemyStructs.length > 0) {
              const target = enemyStructs[Math.floor(Math.random() * enemyStructs.length)];
              target.hp = Math.max(0, target.hp - target.maxHp * 0.6);
              addWorldEvent(`💣 Sabotaje: ${spyH.name.split(' ')[0]} dañó ${target.label} de ${targetCiv.name}`);
            }
          } else if (spy.missionType === 'asesinato') {
            // Intentar eliminar al líder enemigo
            const leader = _hById(targetCiv.leaderId);
            if (leader && leader.alive) {
              leader.health = Math.max(5, leader.health - 40);
              addMajorEvent(`🗡️ ¡Intento de asesinato! El líder de ${targetCiv.name} fue herido por un espía`);
            }
          } else if (spy.missionType === 'diplomacia_secreta') {
            // Crear alianza secreta
            const myCiv = civilizations.get(spyH.civId);
            if (myCiv) {
              myCiv.allies.add(spy.targetCivId);
              targetCiv.allies.add(spyH.civId);
              myCiv.enemies.delete(spy.targetCivId);
              targetCiv.enemies.delete(spyH.civId);
              addWorldEvent(`🤝 Diplomacia secreta: ${myCiv.name} y ${targetCiv.name} firmaron un pacto oculto`);
            }
          }
        } else {
          // Espía capturado
          spyH.health = Math.max(0, spyH.health - 50);
          addWorldEvent(`🚨 ¡Espía capturado! ${spyH.name.split(' ')[0]} fue descubierto en ${targetCiv.name}`);
          if (spyH.health <= 0) spyH._die('capturado como espía');
        }
      }
      _activeSpies2.splice(i, 1);
    }
  }
  // Enviar nuevos espías
  for (const [, civ] of civilizations) {
    if (civ.population < 10 || civ.techLevel < 2) continue;
    if (civ.enemies.size === 0 && civ.atWarWith.size === 0) continue;
    if (Math.random() > 0.08) continue;
    // Elegir el miembro más inteligente como espía
    let spy = null;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.isLeader || h.isSoldier) continue;
      if (!spy || h.knowledge > spy.knowledge) spy = h;
    }
    if (!spy || spy.knowledge < 200) continue;
    // Elegir objetivo
    const enemyIds = [...civ.enemies, ...civ.atWarWith.keys()];
    if (enemyIds.length === 0) continue;
    const targetCivId = enemyIds[Math.floor(Math.random() * enemyIds.length)];
    const mission = SPY_MISSIONS[Math.floor(Math.random() * SPY_MISSIONS.length)];
    _activeSpies2.push({ spyId: spy.id, targetCivId, missionType: mission, yearsLeft: 60 });
    if(_activeSpies2.length > 12) _activeSpies2.shift(); // cap to prevent unbounded growth
    spy.addLog(`Misión de espionaje: ${mission.replace('_', ' ')} en ${civilizations.get(targetCivId)?.name || '?'}`);
    addWorldEvent(`🕵️ ${spy.name.split(' ')[0]} parte en misión secreta contra ${civilizations.get(targetCivId)?.name || '?'}`);
  }
}

// ── NUEVA 2: EDAD DE ORO CULTURAL ────────────────────────────────────────────
// Civs con alta cultura (templos + alianzas + inventos) entran en una Edad de Oro
// que acelera todo: conocimiento, reproducción, construcción
let _goldenAgeTimer = 0;
const _goldenAgeCivs = new Map(); // civId → yearsLeft
function tickGoldenAge(yearsElapsed) {
  _goldenAgeTimer += yearsElapsed;
  if (_goldenAgeTimer < 40) return;
  _goldenAgeTimer = 0;
  // Actualizar civs en Edad de Oro
  for (const [civId, data] of _goldenAgeCivs) {
    data.yearsLeft -= 40;
    if (data.yearsLeft <= 0) {
      _goldenAgeCivs.delete(civId);
      const civ = civilizations.get(civId);
      if (civ) addMajorEvent(`🌅 La Edad de Oro de ${civ.name} llega a su fin — pero su legado perdura`);
    }
  }
  // Aplicar bonuses a civs en Edad de Oro
  for (const [civId] of _goldenAgeCivs) {
    const civ = civilizations.get(civId);
    if (!civ || civ.population === 0) continue;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      h.knowledge = Math.min(99999, h.knowledge + yearsElapsed * 1.5 * _intelModifier);
      h.health = Math.min(100, h.health + yearsElapsed * 1);
      h._reproUrge = Math.min(1, h._reproUrge + yearsElapsed * 0.05);
      h._buildUrge = Math.min(1, h._buildUrge + yearsElapsed * 0.1);
    }
    civ.honor = Math.min(100, civ.honor + yearsElapsed * 0.5);
  }
  // Detectar nuevas Edades de Oro
  for (const [, civ] of civilizations) {
    if (civ.population < 15) continue;
    if (_goldenAgeCivs.has(civ.id)) continue;
    const civTypes = _civStructureTypes.get(civ.id);
    if (!civTypes) continue;
    // Condiciones: templo/catedral + mercado + alianzas + inventos
    const hasTemple = civTypes.has('temple') || civTypes.has('cathedral');
    const hasMarket = civTypes.has('market') || civTypes.has('harbor');
    const hasKnowledge = civTypes.has('library') || civTypes.has('academy') || civTypes.has('university');
    const richInAllies = civ.allies.size >= 2;
    const richInInventions = civ.inventions.size >= 3;
    if (hasTemple && hasMarket && (hasKnowledge || richInAllies) && richInInventions && Math.random() < 0.04) {
      const duration = 100 + Math.floor(Math.random() * 150);
      _goldenAgeCivs.set(civ.id, { yearsLeft: duration });
      addMajorEvent(`✨🌟 ¡${civ.name} entra en una EDAD DE ORO! Arte, ciencia y comercio florecen durante ${duration} años`);
      addChronicle('culture', `Edad de Oro de ${civ.name}`, `Los astros se alinearon. Los templos rebosaban de fieles, los mercados de riqueza, y las academias de ideas. ${civ.name} vivió su momento más glorioso. Los poetas cantaron, los arquitectos construyeron, los filósofos soñaron.`, '🌟');
    }
  }
}

// ── NUEVA 3: MERCENARIOS ──────────────────────────────────────────────────────
// Civs en guerra pueden contratar mercenarios (humanos sin civ) para reforzar ejércitos
let _mercenaryTimer = 0;
const _mercenaryBands = []; // {leaderId, members[], hireCost, tx, ty}
function tickMercenaries(yearsElapsed) {
  _mercenaryTimer += yearsElapsed;
  if (_mercenaryTimer < 25) return;
  _mercenaryTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Formar bandas de mercenarios con humanos sin civ y alta agresión
  const loners = _cachedAlive.filter(h => h.civId === null && h.aggression > 0.5 && h.kills > 0 && !h._isMercenary);
  if (loners.length >= 3 && _mercenaryBands.length < 8 && Math.random() < 0.15) {
    const leader = loners.reduce((a, b) => a.kills > b.kills ? a : b);
    const band = loners.slice(0, Math.min(5, loners.length));
    for (const m of band) { m._isMercenary = true; m.color = '#cc8800'; }
    _mercenaryBands.push({ leaderId: leader.id, members: band.map(m => m.id), hireCost: 20 + band.length * 5, tx: leader.tx, ty: leader.ty });
    addWorldEvent(`⚔️💰 Banda de mercenarios formada: ${leader.name.split(' ')[0]} lidera ${band.length} guerreros de alquiler`);
  }
  // Civs en guerra contratan mercenarios
  for (let i = _mercenaryBands.length - 1; i >= 0; i--) {
    const band = _mercenaryBands[i];
    const leader = _hById(band.leaderId);
    if (!leader || !leader.alive) { _mercenaryBands.splice(i, 1); continue; }
    // Buscar civ que quiera contratarlos
    for (const [, civ] of civilizations) {
      if (civ.atWarWith.size === 0) continue;
      if (civ.foodReserve < band.hireCost) continue;
      if (Math.random() > 0.1) continue;
      // Contratar
      civ.foodReserve -= band.hireCost;
      for (const mId of band.members) {
        const m = _hById(mId);
        if (!m || !m.alive) continue;
        m.civId = civ.id;
        m.color = civ.color;
        m.isSoldier = true;
        m._isMercenary = false;
        m.weaponTier = Math.max(m.weaponTier, civ.techLevel);
        civ.addMember(m);
      }
      addMajorEvent(`💰⚔️ ${civ.name} contrató mercenarios — ${band.members.length} guerreros se unen a sus filas`);
      _mercenaryBands.splice(i, 1);
      break;
    }
  }
}

// ── NUEVA 4: TRAUMA DE GUERRA (MORAL Y PTSD) ─────────────────────────────────
// Soldados con muchas muertes acumulan trauma que reduce su efectividad
// pero también pueden convertirse en veteranos legendarios
let _traumaTimer = 0;
function tickWarTrauma(yearsElapsed) {
  _traumaTimer += yearsElapsed;
  if (_traumaTimer < 10) return;
  _traumaTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.isSoldier) continue;
    // Acumular trauma con cada muerte
    if (!h._trauma) h._trauma = 0;
    if (!h._veteranLevel) h._veteranLevel = 0;
    // Trauma sube con kills, baja con tiempo y descanso
    if (h.kills > 0) h._trauma = Math.min(100, h._trauma + h.kills * 0.1 * yearsElapsed);
    if (h.action === ACTIONS.SLEEP || h.action === ACTIONS.IDLE) {
      h._trauma = Math.max(0, h._trauma - yearsElapsed * 2);
    }
    // Efectos del trauma
    if (h._trauma > 70) {
      h.aggression = Math.max(0.1, h.aggression - yearsElapsed * 0.02);
      h.social = Math.max(0, h.social - yearsElapsed * 3);
      if (Math.random() < 0.01) {
        h.addLog(`Sufre pesadillas de guerra — el trauma pesa`);
        h.health = Math.max(1, h.health - 5);
      }
    }
    // Veteranos legendarios: kills altos + trauma superado
    if (h.kills >= 15 && h._trauma < 30 && h._veteranLevel === 0) {
      h._veteranLevel = 1;
      h.weaponTier = Math.min(WEAPON_TIERS.length - 1, h.weaponTier + 1);
      h.traits.strength = Math.min(99, h.traits.strength + 10);
      h.addLog(`Se convirtió en Veterano de Guerra — forjado por el combate`);
      addWorldEvent(`🎖️ ${h.name.split(' ')[0]} se convirtió en Veterano de Guerra — ${h.kills} victorias, acero en el alma`);
    }
    if (h.kills >= 30 && h._veteranLevel === 1) {
      h._veteranLevel = 2;
      h.weaponTier = Math.min(WEAPON_TIERS.length - 1, h.weaponTier + 1);
      h.addLog(`Leyenda militar — los enemigos huyen al verle`);
      addMajorEvent(`🏆 ${h.name.split(' ')[0]} alcanzó el rango de LEYENDA MILITAR — ${h.kills} victorias en combate`);
    }
  }
}

// ── NUEVA 5: RUTAS COMERCIALES VISIBLES EN EL MAPA ───────────────────────────
// Las rutas de comercio activas se dibujan como líneas animadas en el renderer
// Esta función expone los datos para que renderer.js los use
function getActiveTradeRoutes() {
  if (typeof _activeTradeRoutes === 'undefined') return [];
  return _activeTradeRoutes;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── 10 NUEVAS MECÁNICAS ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// 1. ASESINATO POLÍTICO — líderes con honor bajo pueden ser asesinados por rivales
let _assassinTimer = 0;
function tickPoliticalAssassination(yearsElapsed) {
  _assassinTimer += yearsElapsed;
  if(_assassinTimer < 40) return;
  _assassinTimer = 0;
  for(const [,civ] of civilizations) {
    if(civ.population < 8 || civ.honor > 60) continue;
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    if(!leader || !leader.alive) continue;
    // Chance inversely proportional to honor
    const chance = (60 - civ.honor) * 0.001;
    if(Math.random() > chance) continue;
    // Find a rival — high aggression member
    const rivals = [];
    for(const id of civ.members) { const h = _hById(id); if(h && h.alive && h.id !== leader.id && h.aggression > 0.6) rivals.push(h); }
    if(rivals.length === 0) continue;
    const assassin = rivals.reduce((a,b) => a.aggression > b.aggression ? a : b);
    leader._die('asesinado');
    assassin.kills++;
    assassin.isLeader = true;
    civ.leaderId = assassin.id;
    civ.honor = Math.max(0, civ.honor - 20);
    addMajorEvent(`🗡️ ¡ASESINATO! ${leader.name.split(' ')[0]} de ${civ.name} fue asesinado por ${assassin.name.split(' ')[0]} — crisis de sucesión`);
    addChronicle('war', `Asesinato en ${civ.name}`, `${leader.name.split(' ')[0]}, líder de ${civ.name}, cayó víctima de una conspiración. ${assassin.name.split(' ')[0]} tomó el poder entre el caos y la sangre.`, '🗡️');
    if(typeof tickSuccessionCrisis !== 'undefined') tickSuccessionCrisis(leader, civ);
  }
}

// 2. JUEGOS Y OLIMPIADAS — civs con coliseo/estadio organizan competiciones
let _gamesTimer = 0;
const _gamesHistory = []; // {year, civName, winner, event}
function tickOlympicGames(yearsElapsed) {
  _gamesTimer += yearsElapsed;
  if(_gamesTimer < 80) return;
  _gamesTimer = 0;
  const civTypes = _civStructureTypes;
  for(const [civId, types] of civTypes) {
    if(!types.has('colosseum') && !types.has('stadium')) continue;
    const civ = civilizations.get(civId);
    if(!civ || civ.population < 10) continue;
    if(Math.random() > 0.3) continue;
    // Pick athletes from this civ and neighbors
    const athletes = [];
    for(const id of civ.members) { const h = _hById(id); if(h && h.alive && h.traits.strength > 50) athletes.push(h); }
    if(athletes.length < 2) continue;
    const winner = athletes.reduce((a,b) => (a.traits.strength + a.kills) > (b.traits.strength + b.kills) ? a : b);
    const events = ['carrera','lucha','lanzamiento de jabalina','arquería','combate de gladiadores','natación'];
    const ev = events[Math.floor(Math.random()*events.length)];
    winner.knowledge = Math.min(99999, winner.knowledge + 30);
    winner.social = Math.min(100, winner.social + 20);
    civ.honor = Math.min(100, civ.honor + 5);
    // Invite allies
    const guestCiv = civ.allies.size > 0 ? civilizations.get([...civ.allies][0]) : null;
    const guestStr = guestCiv ? ` — delegación de ${guestCiv.name} presente` : '';
    _gamesHistory.push({ year, civName: civ.name, winner: winner.name.split(' ')[0], event: ev });
    if(_gamesHistory.length > 20) _gamesHistory.shift();
    addWorldEvent(`🏟️ ${civ.name} celebra los Juegos — ${winner.name.split(' ')[0]} gana en ${ev}${guestStr}`);
    // Diplomatic bonus with guests
    if(guestCiv) { civ.allies.add(guestCiv.id); guestCiv.allies.add(civ.id); }
  }
}

// 3. REFUGIADOS DE GUERRA — humanos de civs destruidas migran a civs en paz
let _refugeeTimer = 0;
function tickWarRefugees(yearsElapsed) {
  _refugeeTimer += yearsElapsed;
  if(_refugeeTimer < 30) return;
  _refugeeTimer = 0;
  if(typeof _cachedAlive === 'undefined') return;
  // Find civs at war with heavy losses
  for(const [,civ] of civilizations) {
    if(civ.atWarWith.size === 0 || civ.population > 5) continue;
    // Civ is collapsing — members flee to nearest peaceful civ
    const peacefulCivs = [];
    for(const [,other] of civilizations) {
      if(other.id === civ.id || other.atWarWith.size > 0 || other.population < 5) continue;
      peacefulCivs.push(other);
    }
    if(peacefulCivs.length === 0) continue;
    const target = peacefulCivs[Math.floor(Math.random()*peacefulCivs.length)];
    let count = 0;
    for(const id of [...civ.members]) {
      const h = _hById(id);
      if(!h || !h.alive || h.isLeader) continue;
      if(Math.random() > 0.4) continue;
      civ.removeMember(id);
      target.addMember(h);
      h.civId = target.id;
      h.color = target.color;
      if(target.cityCenter) { h.tx = target.cityCenter.tx + Math.floor(Math.random()*10-5); h.ty = target.cityCenter.ty + Math.floor(Math.random()*10-5); }
      count++;
      if(count >= 3) break;
    }
    if(count > 0) addWorldEvent(`🏳️ ${count} refugiados de ${civ.name} huyen a ${target.name} — acogidos por ${target.leaderId ? _hById(target.leaderId)?.name.split(' ')[0] : 'el pueblo'}`);
  }
}

// 4. CULTO CARISMÁTICO — humano con alta carisma funda movimiento
let _charismaTimer = 0;
const _charismaMovements = new Map(); // humanId → {civId, followers, name, year}
const _MOVEMENT_NAMES = ['Los Iluminados','El Camino Verdadero','La Hermandad del Sol','Los Hijos del Fuego','La Orden del Silencio','Los Guardianes del Umbral','La Secta del Renacimiento'];
function tickCharismaticCult(yearsElapsed) {
  _charismaTimer += yearsElapsed;
  if(_charismaTimer < 50) return;
  _charismaTimer = 0;
  if(typeof _cachedAlive === 'undefined') return;
  // Decay existing movements
  for(const [id, cult] of _charismaMovements) {
    const h = _hById(id);
    if(!h || !h.alive) { _charismaMovements.delete(id); continue; }
    cult.followers = Math.max(0, cult.followers - 1);
    if(cult.followers <= 0) { _charismaMovements.delete(id); addWorldEvent(`💨 ${cult.name} se disuelve — ${h.name.split(' ')[0]} pierde influencia`); }
  }
  if(_charismaMovements.size >= 3) return;
  // Find charismatic candidates
  for(const h of _cachedAlive) {
    if(_charismaMovements.has(h.id)) continue;
    if(h.traits.charisma < 80 || h.knowledge < 200) continue;
    if(Math.random() > 0.005) continue;
    const cultName = _MOVEMENT_NAMES[Math.floor(Math.random()*_MOVEMENT_NAMES.length)];
    _charismaMovements.set(h.id, { civId: h.civId, followers: 5 + Math.floor(Math.random()*10), name: cultName, year });
    const civ = h.civId != null ? civilizations.get(h.civId) : null;
    addMajorEvent(`✨ ${h.name.split(' ')[0]} funda "${cultName}" en ${civ?.name||'las tierras salvajes'} — carisma ${Math.round(h.traits.charisma)}, seguidores crecen`);
    // Boost followers' social
    const near = _spatialQuery(h.tx, h.ty, 15, h.id);
    for(const n of near.slice(0,8)) { n.social = Math.min(100, n.social + 15); n.knowledge = Math.min(99999, n.knowledge + 10); }
    break;
  }
}

// 5. RÉCORD DE LONGEVIDAD — el humano más viejo se convierte en símbolo
let _longevityTimer = 0;
let _longevityRecord = 0;
function tickLongevityRecord(yearsElapsed) {
  _longevityTimer += yearsElapsed;
  if(_longevityTimer < 20) return;
  _longevityTimer = 0;
  if(typeof _cachedAlive === 'undefined' || _cachedAlive.length === 0) return;
  const oldest = _cachedAlive.reduce((a,b) => a.age > b.age ? a : b);
  if(oldest.age > _longevityRecord + 10) {
    _longevityRecord = oldest.age;
    const civ = oldest.civId != null ? civilizations.get(oldest.civId) : null;
    if(oldest.age > 70) {
      addWorldEvent(`👴 ${oldest.name.split(' ')[0]} de ${civ?.name||'las tierras'} alcanza ${Math.floor(oldest.age)} años — el más anciano del mundo conocido`);
      if(civ) { civ.honor = Math.min(100, civ.honor + 3); }
      // Nearby humans gain wisdom
      const near = _spatialQuery(oldest.tx, oldest.ty, 12, oldest.id);
      for(const n of near) n.knowledge = Math.min(99999, n.knowledge + 5);
    }
    if(oldest.age > 90) addChronicle('culture', `${oldest.name.split(' ')[0]}: el anciano eterno`, `${oldest.name.split(' ')[0]} de ${civ?.name||'las tierras'} vivió ${Math.floor(oldest.age)} años. Vio nacer y morir civilizaciones. Su memoria era la historia viva del mundo.`, '👴');
  }
}

// 6. BLOQUEO COMERCIAL — civs en guerra bloquean rutas del enemigo
let _blockadeTimer = 0;
function tickTradeBlockade(yearsElapsed) {
  _blockadeTimer += yearsElapsed;
  if(_blockadeTimer < 25) return;
  _blockadeTimer = 0;
  for(let i = _tradeRoutes.length - 1; i >= 0; i--) {
    const route = _tradeRoutes[i];
    const ca = civilizations.get(route.civA);
    const cb = civilizations.get(route.civB);
    if(!ca || !cb) { _tradeRoutes.splice(i,1); continue; }
    // If civs are now at war, destroy the route
    if(ca.atWarWith.has(cb.id) || cb.atWarWith.has(ca.id)) {
      _tradeRoutes.splice(i,1);
      addWorldEvent(`🚫 ${ca.name} bloquea rutas comerciales de ${cb.name} — guerra interrumpe el comercio`);
      ca.tradePartners.delete(cb.id);
      cb.tradePartners.delete(ca.id);
    }
  }
}

// 7. REVOLUCIÓN TECNOLÓGICA — cuando una civ inventa algo, rivales aceleran investigación
let _techRaceTimer = 0;
function tickTechRace(yearsElapsed) {
  _techRaceTimer += yearsElapsed;
  if(_techRaceTimer < 35) return;
  _techRaceTimer = 0;
  // Find the most advanced civ
  let frontrunner = null, maxK = 0;
  for(const [,civ] of civilizations) {
    if(civ.population === 0) continue;
    const k = civ.avgKnowledge || 0;
    if(k > maxK) { maxK = k; frontrunner = civ; }
  }
  if(!frontrunner || maxK < 500) return;
  // Lagging civs get a catch-up boost
  for(const [,civ] of civilizations) {
    if(civ.id === frontrunner.id || civ.population === 0) continue;
    const gap = maxK - (civ.avgKnowledge || 0);
    if(gap < 200) continue;
    const boost = Math.min(gap * 0.02, 15); // catch-up proportional to gap, capped
    for(const id of civ.members) {
      const h = _hById(id); if(h && h.alive) h.knowledge = Math.min(99999, h.knowledge + boost * _intelModifier);
    }
    if(Math.random() < 0.05) addWorldEvent(`🏁 ${civ.name} acelera su investigación para alcanzar a ${frontrunner.name} — carrera tecnológica`);
  }
}

// 8. EXILIO DE SABIOS — cuando una civ colapsa, sus sabios llevan conocimiento a otras
let _exileTimer = 0;
function tickScholarExile(yearsElapsed) {
  _exileTimer += yearsElapsed;
  if(_exileTimer < 60) return;
  _exileTimer = 0;
  if(typeof _cachedAlive === 'undefined') return;
  for(const [,civ] of civilizations) {
    if(civ.population > 3 || civ.population === 0) continue;
    // Civ is nearly extinct — scholars flee
    const scholars = [];
    for(const id of civ.members) { const h = _hById(id); if(h && h.alive && h.knowledge > 500) scholars.push(h); }
    if(scholars.length === 0) continue;
    // Find a surviving civ to receive them
    const hosts = [];
    for(const [,other] of civilizations) { if(other.id !== civ.id && other.population > 5) hosts.push(other); }
    if(hosts.length === 0) continue;
    const host = hosts[Math.floor(Math.random()*hosts.length)];
    for(const scholar of scholars.slice(0,2)) {
      const knowledgeCarried = Math.floor(scholar.knowledge * 0.5);
      civ.removeMember(scholar.id);
      host.addMember(scholar);
      scholar.civId = host.id;
      scholar.color = host.color;
      if(host.cityCenter) { scholar.tx = host.cityCenter.tx + Math.floor(Math.random()*8-4); scholar.ty = host.cityCenter.ty + Math.floor(Math.random()*8-4); }
      // Share knowledge with host members
      for(const id of host.members) { const h = _hById(id); if(h && h.alive) h.knowledge = Math.min(99999, h.knowledge + Math.floor(knowledgeCarried * 0.1)); }
      addWorldEvent(`📚 ${scholar.name.split(' ')[0]} exiliado de ${civ.name} llega a ${host.name} — trae ${knowledgeCarried} pts de conocimiento`);
    }
  }
}

// 9. EPIDEMIA MEDIÁTICA — noticias de epidemia afectan moral de civs vecinas
let _mediaEpidemicTimer = 0;
function tickMediaEpidemic(yearsElapsed) {
  _mediaEpidemicTimer += yearsElapsed;
  if(_mediaEpidemicTimer < 45) return;
  _mediaEpidemicTimer = 0;
  if(_getMediaLevel() === 0) return;
  // Check if any civ has active sick members
  for(const [,civ] of civilizations) {
    if(civ.population < 5) continue;
    let sickCount = 0;
    for(const id of civ.members) { const h = _hById(id); if(h && h.alive && h.sick) sickCount++; }
    if(sickCount < 3) continue;
    // News spreads fear to neighboring civs
    for(const [,other] of civilizations) {
      if(other.id === civ.id || other.population === 0) continue;
      // Reduce social of nearby humans
      for(const id of other.members) {
        const h = _hById(id); if(!h || !h.alive) continue;
        h.social = Math.max(0, h.social - 5);
      }
    }
    if(Math.random() < 0.3) {
      const leader = civ.leaderId ? _hById(civ.leaderId) : null;
      addWorldEvent(`🦠 Alerta sanitaria: epidemia en ${civ.name} — ${sickCount} enfermos, ${leader?.name.split(' ')[0]||'autoridades'} piden cuarentena`);
    }
    break;
  }
}

// 10. RUMORES Y PROPAGANDA — civs con medios pueden difundir rumores que dañan honor enemigo
let _propagandaTimer = 0;
function tickPropaganda(yearsElapsed) {
  _propagandaTimer += yearsElapsed;
  if(_propagandaTimer < 55) return;
  _propagandaTimer = 0;
  if(_getMediaLevel() < 2) return; // necesita radio o superior
  for(const [,civ] of civilizations) {
    if(civ.atWarWith.size === 0 || civ.population < 5) continue;
    if(!civ._hasRadio && !civ._hasTvStation && !civ._hasInternetHub) continue;
    const enemyId = [...civ.atWarWith.keys()][0];
    const enemy = civilizations.get(enemyId);
    if(!enemy) continue;
    if(Math.random() > 0.25) continue;
    const honorLoss = 5 + Math.floor(Math.random()*10);
    enemy.honor = Math.max(0, enemy.honor - honorLoss);
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    const enemyLeader = enemy.leaderId ? _hById(enemy.leaderId) : null;
    const propaganda = [
      `${civ.name} difunde propaganda contra ${enemy.name} — honor de ${enemyLeader?.name.split(' ')[0]||enemy.name} cae ${honorLoss} puntos`,
      `Emisoras de ${civ.name} acusan a ${enemy.name} de crímenes de guerra — opinión pública se vuelve contra ellos`,
      `${leader?.name.split(' ')[0]||civ.name} usa medios para desacreditar a ${enemy.name} — campaña de desinformación`,
    ];
    addWorldEvent(`📡 ${propaganda[Math.floor(Math.random()*propaganda.length)]}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NUEVAS MECÁNICAS — TANDA 3
// ══════════════════════════════════════════════════════════════════════════════

// 1. COLONIAS ULTRAMARINAS — civs con astillero/puerto fundan colonias en islas lejanas
let _colonialTimer = 0;
function tickOverseasColonies(yearsElapsed) {
  _colonialTimer += yearsElapsed;
  if (_colonialTimer < 80) return;
  _colonialTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8) continue;
    const hasPort = structures.some(s => s.civId === civ.id && (s.type === 'shipyard' || s.type === 'harbor'));
    if (!hasPort) continue;
    if (Math.random() > 0.3) continue;
    // Find a member with a boat
    let colonist = null;
    for (const id of civ.members) {
      const h = _hById(id);
      if (h && h.alive && h.transportTier >= 1) { colonist = h; break; }
    }
    if (!colonist) continue;
    // Find a distant land tile not claimed by any civ
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.floor(Math.random() * 80);
    let destTx = Math.max(0, Math.min(WORLD_W - 1, colonist.tx + Math.round(Math.cos(angle) * dist)));
    let destTy = Math.max(0, Math.min(WORLD_H - 1, colonist.ty + Math.round(Math.sin(angle) * dist)));
    // Find nearest land
    let found = false;
    for (let r = 0; r <= 20 && !found; r++) {
      for (let a = 0; a < 8 && !found; a++) {
        const lx = destTx + Math.round(Math.cos(a / 8 * Math.PI * 2) * r);
        const ly = destTy + Math.round(Math.sin(a / 8 * Math.PI * 2) * r);
        if (typeof isLand !== 'undefined' && isLand(lx, ly)) {
          // Check no civ already there
          let occupied = false;
          for (const [, other] of civilizations) {
            if (other.territory.has(`${lx},${ly}`)) { occupied = true; break; }
          }
          if (!occupied) { destTx = lx; destTy = ly; found = true; }
        }
      }
    }
    if (!found) continue;
    // Send colonist there
    colonist.tx = destTx; colonist.ty = destTy;
    colonist.px = destTx * TILE + TILE / 2; colonist.py = destTy * TILE + TILE / 2;
    colonist._settleTx = destTx; colonist._settleTy = destTy;
    if (civ.cityCenter) {
      // Create a secondary city center for the colony
      civ._colonyCenter = { tx: destTx, ty: destTy };
    }
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    const lname = leader ? leader.name.split(' ')[0] : civ.name;
    addWorldEvent(`⛵ ${colonist.name.split(' ')[0]} zarpa desde ${civ.name} por orden de ${lname} — funda colonia a ${Math.round(dist)} leguas`);
    addChronicle('culture', `${civ.name} cruza el océano`, `${colonist.name.split(' ')[0]} y sus compañeros dejaron atrás todo lo conocido. En tierras lejanas plantaron la bandera de ${civ.name}. Una nueva historia comenzaba.`, '⛵');
  }
}

// 2. HAMBRE DE TIERRAS — civs superpobladas invaden vecinos solo por territorio
let _landHungerTimer = 0;
function tickLandHunger(yearsElapsed) {
  _landHungerTimer += yearsElapsed;
  if (_landHungerTimer < 50) return;
  _landHungerTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 15 || civ.atWarWith.size > 0) continue;
    // Check if territory is small relative to population
    const density = civ.population / Math.max(1, civ.territory.size);
    if (density < 0.8) continue; // not overcrowded
    if (Math.random() > 0.2) continue;
    // Find a neighbor with more territory
    let target = null, bestScore = 0;
    for (const [, other] of civilizations) {
      if (other.id === civ.id || other.population === 0) continue;
      if (civ.allies.has(other.id)) continue;
      const score = other.territory.size - civ.territory.size;
      if (score > 10 && score > bestScore) { bestScore = score; target = other; }
    }
    if (!target) continue;
    civ.enemies.add(target.id);
    target.enemies.add(civ.id);
    civ.allies.delete(target.id);
    target.allies.delete(civ.id);
    civ.atWarWith.set(target.id, { startYear: year, tributePaid: false });
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    const lname = leader ? leader.name.split(' ')[0] : civ.name;
    addWorldEvent(`🗺️ ${lname} de ${civ.name} declara guerra de expansión contra ${target.name} — necesitan más tierras para ${civ.population} habitantes`);
  }
}

// 3. SINCRETISMO RELIGIOSO — dos civs aliadas fusionan sus religiones
let _syncretismTimer = 0;
function tickReligiousSyncretism(yearsElapsed) {
  _syncretismTimer += yearsElapsed;
  if (_syncretismTimer < 120) return;
  _syncretismTimer = 0;
  const civList = [];
  for (const [, civ] of civilizations) { if (civ.population > 5 && civ.religion) civList.push(civ); }
  if (civList.length < 2) return;
  for (const civ of civList) {
    if (!civ.religion || Math.random() > 0.15) continue;
    for (const allyId of civ.allies) {
      const ally = civilizations.get(allyId);
      if (!ally || !ally.religion || ally.religion === civ.religion) continue;
      // Merge religions
      const prefixes = ['Neo', 'Gran', 'Nuevo', 'Eterno', 'Sagrado'];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const newReligion = `${prefix} ${civ.religion.split(' ').pop()}`;
      const oldA = civ.religion, oldB = ally.religion;
      civ.religion = newReligion;
      ally.religion = newReligion;
      // Boost social of both civs
      for (const id of civ.members) { const h = _hById(id); if (h && h.alive) h.social = Math.min(100, h.social + 15); }
      for (const id of ally.members) { const h = _hById(id); if (h && h.alive) h.social = Math.min(100, h.social + 15); }
      addWorldEvent(`🛕 ${civ.name} y ${ally.name} fusionan sus fe: nace el ${newReligion} — unión de ${oldA} y ${oldB}`);
      addChronicle('culture', `Nace el ${newReligion}`, `Los sacerdotes de ${civ.name} y ${ally.name} se reunieron durante siete días. Cuando salieron, anunciaron una nueva fe: el ${newReligion}. Millones abrazaron la nueva doctrina.`, '🛕');
      break;
    }
  }
}

// 4. ARTESANOS ITINERANTES — humanos sin civ viajan vendiendo recursos y conocimiento
let _artisanTimer = 0;
function tickItinerantArtisans(yearsElapsed) {
  _artisanTimer += yearsElapsed;
  if (_artisanTimer < 30) return;
  _artisanTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Find humans without civ who have knowledge > 200
  const artisans = _cachedAlive.filter(h => h.alive && !h.civId && h.knowledge > 200);
  for (const artisan of artisans.slice(0, 3)) {
    // Find nearest civ member to trade with
    const nearby = _spatialQuery(artisan.tx, artisan.ty, 20, artisan.id);
    const partner = nearby.find(h => h.civId && h.alive);
    if (!partner) continue;
    const civ = civilizations.get(partner.civId);
    if (!civ) continue;
    // Trade: artisan gives knowledge, receives food
    const kTransfer = Math.min(artisan.knowledge * 0.05, 50);
    partner.knowledge = Math.min(99999, partner.knowledge + kTransfer);
    artisan.inventory.food = Math.min(artisan.inventory.food + 8, 50);
    artisan.knowledge = Math.min(99999, artisan.knowledge + 2);
    if (Math.random() < 0.08) {
      addWorldEvent(`🧳 ${artisan.name.split(' ')[0]}, artesano errante, llega a ${civ.name} — comparte ${Math.round(kTransfer)} pts de conocimiento a cambio de comida`);
    }
  }
}

// 5. MONEDA COMÚN — civs aliadas adoptan moneda compartida, boost comercial
let _currencyTimer = 0;
const _sharedCurrencies = new Map(); // civId → currencyName
function tickCommonCurrency(yearsElapsed) {
  _currencyTimer += yearsElapsed;
  if (_currencyTimer < 100) return;
  _currencyTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 10 || civ.allies.size === 0) continue;
    if (_sharedCurrencies.has(civ.id)) continue;
    // Need market + enough knowledge
    const hasMarket = structures.some(s => s.civId === civ.id && s.type === 'market');
    if (!hasMarket || civ.techLevel < 2) continue;
    if (Math.random() > 0.2) continue;
    for (const allyId of civ.allies) {
      const ally = civilizations.get(allyId);
      if (!ally || _sharedCurrencies.has(allyId)) continue;
      const allyMarket = structures.some(s => s.civId === allyId && s.type === 'market');
      if (!allyMarket) continue;
      // Create shared currency
      const metals = ['Áureo', 'Denario', 'Tálero', 'Dracma', 'Sestercio', 'Florín'];
      const currencyName = metals[Math.floor(Math.random() * metals.length)];
      _sharedCurrencies.set(civ.id, currencyName);
      _sharedCurrencies.set(allyId, currencyName);
      // Boost wealth of all members
      for (const id of civ.members) { const h = _hById(id); if (h && h.alive) h.wealth = (h.wealth || 0) + 20; }
      for (const id of ally.members) { const h = _hById(id); if (h && h.alive) h.wealth = (h.wealth || 0) + 20; }
      // Add trade route if not exists
      if (!civ.tradePartners.has(allyId)) {
        civ.tradePartners.add(allyId);
        ally.tradePartners.add(civ.id);
        _tradeRoutes.push({ civA: civ.id, civB: allyId, established: year, active: true });
      }
      addWorldEvent(`💰 ${civ.name} y ${ally.name} adoptan el ${currencyName} como moneda común — comercio unificado`);
      addChronicle('science', `El ${currencyName}: moneda de dos naciones`, `Por primera vez en la historia, ${civ.name} y ${ally.name} acordaron usar la misma moneda. Los mercaderes celebraron. Los reyes firmaron. El ${currencyName} comenzó a circular.`, '💰');
      break;
    }
  }
}

// 6. DESERCIÓN MILITAR — soldados con trauma alto desertan y se vuelven bandidos
let _desertionTimer = 0;
function tickMilitaryDesertion(yearsElapsed) {
  _desertionTimer += yearsElapsed;
  if (_desertionTimer < 40) return;
  _desertionTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive || !h.isSoldier || !h.civId) continue;
    const trauma = h._warTrauma || 0;
    if (trauma < 60) continue;
    if (Math.random() > 0.05) continue;
    const civ = civilizations.get(h.civId);
    if (!civ) continue;
    // Deserter leaves civ
    civ.removeMember(h.id);
    h.civId = null;
    h.isSoldier = false;
    h.aggression = Math.min(1, h.aggression + 0.3);
    h._warTrauma = Math.max(0, trauma - 20);
    // Wander far away
    h._wanderAngle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.floor(Math.random() * 40);
    h.tx = Math.max(0, Math.min(WORLD_W - 1, h.tx + Math.round(Math.cos(h._wanderAngle) * dist)));
    h.ty = Math.max(0, Math.min(WORLD_H - 1, h.ty + Math.round(Math.sin(h._wanderAngle) * dist)));
    addWorldEvent(`🏃 ${h.name.split(' ')[0]} deserta de ${civ.name} — trauma de guerra ${Math.round(trauma)}%, se convierte en bandido errante`);
  }
}

// 7. BIBLIOTECA UNIVERSAL — civ con universidad+biblioteca+observatorio crea repositorio del saber
let _universalLibTimer = 0;
const _universalLibCivs = new Set();
function tickUniversalLibrary(yearsElapsed) {
  _universalLibTimer += yearsElapsed;
  if (_universalLibTimer < 150) return;
  _universalLibTimer = 0;
  for (const [, civ] of civilizations) {
    if (_universalLibCivs.has(civ.id) || civ.population < 10) continue;
    const hasUni = structures.some(s => s.civId === civ.id && s.type === 'university');
    const hasLib = structures.some(s => s.civId === civ.id && s.type === 'library');
    const hasObs = structures.some(s => s.civId === civ.id && s.type === 'observatory');
    if (!hasUni || !hasLib || !hasObs) continue;
    const avgK = civ.avgKnowledge || 0;
    if (avgK < 3000) continue;
    _universalLibCivs.add(civ.id);
    // Massive knowledge boost to all members
    for (const id of civ.members) {
      const h = _hById(id);
      if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + 500);
    }
    // Share with allies
    for (const allyId of civ.allies) {
      const ally = civilizations.get(allyId);
      if (!ally) continue;
      for (const id of ally.members) {
        const h = _hById(id);
        if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + 150);
      }
    }
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    const lname = leader ? leader.name.split(' ')[0] : civ.name;
    addWorldEvent(`📖 ${lname} inaugura la Biblioteca Universal de ${civ.name} — todo el conocimiento humano en un solo lugar`);
    addChronicle('science', `La Biblioteca Universal de ${civ.name}`, `${lname} reunió a los sabios de ${civ.name} durante años. Cuando las puertas de la Biblioteca Universal se abrieron, contenía el saber de generaciones. Nada igual había existido jamás.`, '📖');
  }
}

// 8. JUICIO PÚBLICO — líderes con honor muy bajo son juzgados y pueden ser depuestos
let _trialTimer = 0;
function tickPublicTrial(yearsElapsed) {
  _trialTimer += yearsElapsed;
  if (_trialTimer < 60) return;
  _trialTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 6 || !civ.leaderId) continue;
    if (civ.honor > 20) continue; // only very low honor triggers trial
    if (Math.random() > 0.25) continue;
    const leader = _hById(civ.leaderId);
    if (!leader || !leader.alive) continue;
    // Find a challenger (highest leaderScore non-leader)
    let challenger = null, bestScore = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.id === civ.leaderId) continue;
      if (h.leaderScore > bestScore) { bestScore = h.leaderScore; challenger = h; }
    }
    if (!challenger) continue;
    const outcome = Math.random();
    if (outcome < 0.5) {
      // Leader deposed
      leader.isLeader = false;
      challenger.isLeader = true;
      civ.leaderId = challenger.id;
      civ.honor = Math.min(100, civ.honor + 25);
      addWorldEvent(`⚖️ Juicio en ${civ.name}: ${leader.name.split(' ')[0]} es depuesto por el pueblo — ${challenger.name.split(' ')[0]} asume el poder`);
      addChronicle('politics', `La caída de ${leader.name.split(' ')[0]}`, `El pueblo de ${civ.name} se hartó. En una asamblea histórica, ${leader.name.split(' ')[0]} fue juzgado y depuesto. ${challenger.name.split(' ')[0]} prometió un nuevo comienzo.`, '⚖️');
    } else {
      // Leader survives but weakened
      civ.honor = Math.max(0, civ.honor - 5);
      addWorldEvent(`⚖️ ${leader.name.split(' ')[0]} de ${civ.name} sobrevive el juicio popular — pero su autoridad queda debilitada`);
    }
  }
}

// 9. MIGRACIÓN CLIMÁTICA INVERSA — en verano, humanos buscan zonas más frescas
let _climMigTimer = 0;
function tickClimateSeasonMigration(yearsElapsed) {
  _climMigTimer += yearsElapsed;
  if (_climMigTimer < 25) return;
  _climMigTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Only trigger in summer (season ~0.5 = peak summer)
  const globalSeason = typeof season !== 'undefined' ? season : 0;
  const isSummer = Math.sin(globalSeason * Math.PI * 2) > 0.7;
  const isWinter = Math.sin(globalSeason * Math.PI * 2) < -0.7;
  if (!isSummer && !isWinter) return;
  let migrated = 0;
  for (const h of _cachedAlive) {
    if (!h.alive || migrated >= 5) break;
    if (Math.random() > 0.03) continue;
    const cell = typeof getCell !== 'undefined' ? getCell(h.tx, h.ty) : null;
    if (!cell) continue;
    // In summer: desert/savanna humans move north (lower ty = cooler)
    if (isSummer && ['desert', 'savanna', 'dry_grass'].includes(cell.biome)) {
      const newTy = Math.max(5, h.ty - 20 - Math.floor(Math.random() * 20));
      h.ty = newTy; h.py = newTy * TILE + TILE / 2;
      migrated++;
      if (Math.random() < 0.1) addWorldEvent(`☀️ ${h.name.split(' ')[0]} huye del calor del desierto hacia el norte — migración estival`);
    }
    // In winter: tundra/snow humans move south (higher ty = warmer)
    if (isWinter && ['tundra', 'snow', 'taiga'].includes(cell.biome)) {
      const newTy = Math.min(WORLD_H - 5, h.ty + 20 + Math.floor(Math.random() * 20));
      h.ty = newTy; h.py = newTy * TILE + TILE / 2;
      migrated++;
      if (Math.random() < 0.1) addWorldEvent(`❄️ ${h.name.split(' ')[0]} abandona la tundra helada — migración invernal hacia el sur`);
    }
  }
}

// 10. TRIBUTO DE GUERRA — civs derrotadas pagan tributo en recursos al vencedor
let _tributeTimer = 0;
function tickWarTribute(yearsElapsed) {
  _tributeTimer += yearsElapsed;
  if (_tributeTimer < 55) return;
  _tributeTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.atWarWith.size === 0 || civ.population < 5) continue;
    for (const [enemyId, warData] of civ.atWarWith) {
      if (warData.tributePaid) continue;
      const enemy = civilizations.get(enemyId);
      if (!enemy || enemy.population === 0) continue;
      // Check if one side is clearly losing (less than 40% of enemy population)
      if (civ.population * 2.5 > enemy.population) continue; // civ is not losing badly
      if (Math.random() > 0.15) continue;
      // Losing civ pays tribute
      const tributeFood = Math.floor(civ.population * 3);
      const tributeK = Math.floor((civ.avgKnowledge || 0) * 0.05);
      // Transfer food from losing civ members to winning civ members
      let collected = 0;
      for (const id of civ.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        const give = Math.min(h.inventory.food, Math.ceil(tributeFood / Math.max(1, civ.population)));
        h.inventory.food -= give;
        collected += give;
      }
      for (const id of enemy.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        h.inventory.food += Math.floor(collected / Math.max(1, enemy.population));
        h.knowledge = Math.min(99999, h.knowledge + tributeK * 0.1);
      }
      warData.tributePaid = true;
      enemy.honor = Math.min(100, enemy.honor + 5);
      const civLeader = civ.leaderId ? _hById(civ.leaderId) : null;
      const enemyLeader = enemy.leaderId ? _hById(enemy.leaderId) : null;
      const cl = civLeader ? civLeader.name.split(' ')[0] : civ.name;
      const el = enemyLeader ? enemyLeader.name.split(' ')[0] : enemy.name;
      addWorldEvent(`💸 ${cl} de ${civ.name} paga tributo a ${el} de ${enemy.name} — ${collected} unidades de comida como precio de la derrota`);
    }
  }
}

// ── SISTEMA DE MEDIOS DE COMUNICACIÓN ────────────────────────────────────────
// Imprentas, radios, televisiones e internet que difunden noticias y conocimiento
// Se desbloquean progresivamente según el nivel de conocimiento promedio

const _mediaHeadlines = []; // {year, text, icon, civName, type}
let _mediaTimer = 0;
let _lastMediaBroadcast = 0;

const MEDIA_UNLOCK_THRESHOLDS = {
  printing_press: 1500,   // Era Medieval
  radio_tower:    12000,  // Era Industrial
  tv_station:     30000,  // Era Moderna
  internet_hub:   60000,  // Era Digital
};

function getMediaHeadlines() { return _mediaHeadlines; }

function _getMediaLevel() {
  let best = 0;
  for(const [,civ] of civilizations){
    if(civ.population === 0) continue;
    if(civ._hasInternetHub)   best = Math.max(best, 4);
    else if(civ._hasTvStation) best = Math.max(best, 3);
    else if(civ._hasRadio)     best = Math.max(best, 2);
    else if(civ._hasPrintingPress) best = Math.max(best, 1);
  }
  return best;
}

function _civAvgKnowledgeMedia(civId) {
  const civ = civilizations.get(civId);
  if(!civ || civ.population === 0) return 0;
  let sum = 0, cnt = 0;
  for(const id of civ.members){
    const h = _hById(id);
    if(h && h.alive){ sum += h.knowledge; cnt++; }
  }
  return cnt > 0 ? sum / cnt : 0;
}

// Generate a non-generic headline using real names and events
function _generateHeadline(mediaLevel) {
  const civList = [];
  for(const [,civ] of civilizations){ if(civ.population > 0) civList.push(civ); }
  if(civList.length === 0) return null;

  const civ = civList[Math.floor(Math.random() * civList.length)];
  const members = [];
  for(const id of civ.members){ const h = _hById(id); if(h && h.alive) members.push(h); }
  if(members.length === 0) return null;

  const rnd = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const person = rnd(members);
  const leader = civ.leaderId ? _hById(civ.leaderId) : null;
  const lname = leader ? leader.name.split(' ')[0] : 'El líder';
  const pname = person.name.split(' ')[0];
  const era = civ.era || 'primitiva';
  const inv = civ.inventions.size > 0 ? [...civ.inventions].pop() : null;
  const invName = inv ? (INVENTION_LIST.find(i=>i.id===inv)?.name || inv) : null;

  // Pick a random ally/enemy for context
  const allyId = civ.allies.size > 0 ? [...civ.allies][0] : null;
  const ally = allyId ? civilizations.get(allyId) : null;
  const enemyId = civ.atWarWith.size > 0 ? [...civ.atWarWith.keys()][0] : null;
  const enemy = enemyId ? civilizations.get(enemyId) : null;

  // Sorted by knowledge — find the wisest person
  const wisest = members.reduce((a,b) => a.knowledge > b.knowledge ? a : b, members[0]);
  const oldest = members.reduce((a,b) => a.age > b.age ? a : b, members[0]);
  const strongest = members.reduce((a,b) => a.kills > b.kills ? a : b, members[0]);

  const templates = [

    // ── GUERRA ──────────────────────────────────────────────────────────────
    () => {
      if(!enemy) return null;
      const kills = [...civ.atWarWith.values()][0];
      const warYear = kills?.startYear ? `(año ${kills.startYear})` : '';
      const variants = [
        { text:`GUERRA: ${lname} de ${civ.name} ordena ofensiva total contra ${enemy.name} — tropas avanzan al amanecer`, icon:'⚔️' },
        { text:`${civ.name} vs ${enemy.name}: batalla decisiva en la frontera — ${strongest.kills} bajas confirmadas del lado de ${civ.name}`, icon:'🔥' },
        { text:`${enemy.name} rechaza ultimátum de ${civ.name} — ${lname} declara estado de guerra`, icon:'💥' },
        { text:`Asedio de ${enemy.name}: fuerzas de ${civ.name} rodean la ciudad capital — sin suministros`, icon:'🛡️' },
        { text:`Tratado de paz rechazado — ${lname} exige rendición incondicional de ${enemy.name}`, icon:'⚔️' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── CIENCIA / INVENCIÓN ──────────────────────────────────────────────────
    () => {
      if(wisest.knowledge < 300) return null;
      const kStr = wisest.knowledge > 10000 ? `${Math.round(wisest.knowledge/1000)}k` : Math.round(wisest.knowledge);
      const variants = invName ? [
        { text:`${wisest.name.split(' ')[0]} de ${civ.name} perfecciona ${invName} — nueva aplicación revoluciona la vida cotidiana`, icon:'🔬' },
        { text:`Academia de ${civ.name} publica tratado sobre ${invName} — copias se distribuyen por todo el mundo conocido`, icon:'📜' },
        { text:`${civ.name} exporta conocimiento de ${invName} a ${ally?.name||'naciones vecinas'} — intercambio histórico`, icon:'🔭' },
      ] : [
        { text:`${wisest.name.split(' ')[0]} (${civ.name}, ${kStr} pts conocimiento) presenta descubrimiento ante el consejo de sabios`, icon:'🔬' },
        { text:`Escuela de ${civ.name} forma a ${Math.min(members.length, 12)} nuevos estudiantes — generación más educada de la historia`, icon:'📚' },
        { text:`${wisest.name.split(' ')[0]} de ${civ.name} documenta ${Math.floor(wisest.age)} años de observaciones — obra maestra del saber`, icon:'📜' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── POLÍTICA / LIDERAZGO ─────────────────────────────────────────────────
    () => {
      const dynasty = civ.dynastyName ? `la ${civ.dynastyName}` : 'la nueva dinastía';
      const honor = civ.honor > 70 ? 'respetado' : civ.honor > 40 ? 'cuestionado' : 'impopular';
      const variants = [
        { text:`${lname} de ${civ.name}, ${honor} por su pueblo, anuncia nueva ley — ${civ.population} ciudadanos afectados`, icon:'👑' },
        { text:`Crisis en ${civ.name}: facción rival desafía a ${lname} — el futuro de ${dynasty} en juego`, icon:'🏛️' },
        { text:`${lname} cumple ${Math.floor(leader?.age||30)} años al frente de ${civ.name} — ${honor} por ${civ.population} súbditos`, icon:'👑' },
        { text:`Consejo de ${civ.name} debate expansión territorial — ${lname} propone campaña hacia el este`, icon:'🗺️' },
        { text:`${civ.name} reforma su sistema de gobierno — ${lname} concentra poder en ${dynasty}`, icon:'📜' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── COMERCIO / ECONOMÍA ──────────────────────────────────────────────────
    () => {
      if(!ally) return null;
      const goods = ['grano','metales preciosos','especias exóticas','madera tallada','joyas','manuscritos','seda','cerámica','sal','pieles'];
      const good = rnd(goods);
      const routeCount = _tradeRoutes.filter(r=>r.civA===civ.id||r.civB===civ.id).length;
      const variants = [
        { text:`Caravana de ${civ.name} llega a ${ally.name} cargada de ${good} — acuerdo por ${10+Math.floor(Math.random()*40)} años`, icon:'💰' },
        { text:`${civ.name} y ${ally.name} firman tratado comercial — ${routeCount} rutas activas, economía en auge`, icon:'🤝' },
        { text:`Mercado de ${civ.name} bate récord: ${civ.population*3} transacciones en un solo día`, icon:'🏪' },
        { text:`${pname} de ${civ.name} negocia precio del ${good} con ${ally.name} — tensión en los mercados`, icon:'💰' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── DESASTRE NATURAL ─────────────────────────────────────────────────────
    () => {
      const disasters = [
        { text:`Terremoto destruye barrio de ${civ.name} — ${lname} declara emergencia, ${Math.floor(civ.population*0.1)} desplazados`, icon:'🌋' },
        { text:`Inundación arrasa cultivos de ${civ.name} — ${pname} organiza distribución de reservas`, icon:'🌊' },
        { text:`Sequía severa en ${civ.name}: ${Math.floor(civ.population*0.15)} personas sin agua potable — ${lname} pide ayuda`, icon:'☀️' },
        { text:`Plaga de langostas devasta campos de ${civ.name} — cosecha perdida, hambre inminente`, icon:'🦗' },
        { text:`Incendio forestal rodea ${civ.name} — ${pname} lidera evacuación de ${Math.floor(civ.population*0.2)} personas`, icon:'🔥' },
      ];
      return { ...rnd(disasters), civName: civ.name };
    },

    // ── SOCIEDAD / CULTURA ───────────────────────────────────────────────────
    () => {
      const religion = civ.religion || null;
      const variants = religion ? [
        { text:`Festival de ${religion} en ${civ.name} — ${civ.population} fieles celebran durante 7 días`, icon:'🎉' },
        { text:`${pname} de ${civ.name} predica ${religion} en territorios de ${ally?.name||'naciones vecinas'} — conversiones masivas`, icon:'🛕' },
        { text:`Conflicto religioso en ${civ.name}: seguidores de ${religion} enfrentan a reformistas`, icon:'⚡' },
      ] : [
        { text:`${civ.name} supera ${civ.population} habitantes — la ciudad más grande de la era ${era}`, icon:'🏙️' },
        { text:`${oldest.name.split(' ')[0]} de ${civ.name} cumple ${Math.floor(oldest.age)} años — el más anciano de su generación`, icon:'👴' },
        { text:`Artistas de ${civ.name} crean obra monumental — ${pname} la dedica a las generaciones futuras`, icon:'🎨' },
        { text:`${civ.name} celebra ${year - civ.founded} años de historia — ${lname} recuerda a los fundadores`, icon:'🎊' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── DIPLOMACIA ───────────────────────────────────────────────────────────
    () => {
      if(civList.length < 2) return null;
      const other = civList.find(c=>c.id!==civ.id);
      if(!other) return null;
      const otherLeader = other.leaderId ? _hById(other.leaderId) : null;
      const olname = otherLeader ? otherLeader.name.split(' ')[0] : 'su líder';
      const variants = [
        { text:`Cumbre histórica: ${lname} de ${civ.name} y ${olname} de ${other.name} se reúnen por primera vez`, icon:'🤝' },
        { text:`${civ.name} ofrece asilo a refugiados de ${other.name} — ${Math.floor(other.population*0.05)} personas cruzan la frontera`, icon:'🏳️' },
        { text:`Embajada de ${civ.name} en ${other.name} — primer intercambio diplomático formal entre ambas naciones`, icon:'🏛️' },
        { text:`${civ.name} acusa a ${other.name} de espionaje — ${lname} exige explicaciones`, icon:'🕵️' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── CRIMEN / ESPIONAJE ───────────────────────────────────────────────────
    () => {
      if(mediaLevel < 2) return null; // solo radio o superior
      const spies = typeof _activeSpies2 !== 'undefined' ? _activeSpies2.filter(s=>{
        const h=_hById(s.spyId); return h && h.civId===civ.id;
      }) : [];
      const variants = spies.length > 0 ? [
        { text:`Escándalo en ${civ.name}: espía capturado con documentos secretos de ${enemy?.name||'nación rival'}`, icon:'🕵️' },
        { text:`${civ.name} desmantela red de espionaje — ${spies.length} agentes identificados`, icon:'🚨' },
      ] : [
        { text:`Robo en el palacio de ${civ.name} — ${pname} acusado, ${lname} ordena investigación`, icon:'🔍' },
        { text:`Conspiración descubierta en ${civ.name} — ${Math.floor(2+Math.random()*5)} personas arrestadas`, icon:'⛓️' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── MILITAR / VETERANOS ──────────────────────────────────────────────────
    () => {
      if(strongest.kills < 3) return null;
      const weapon = WEAPON_TIERS[Math.min(strongest.weaponTier||0, WEAPON_TIERS.length-1)];
      const rank = strongest._veteranLevel >= 2 ? 'Leyenda Militar' : strongest._veteranLevel >= 1 ? 'Veterano' : 'Soldado';
      const variants = [
        { text:`${rank} ${strongest.name.split(' ')[0]} de ${civ.name} regresa con ${strongest.kills} victorias — recibido como héroe`, icon:'🎖️' },
        { text:`${civ.name} equipa a sus tropas con ${weapon} — ${lname} promete victoria`, icon:'⚔️' },
        { text:`${strongest.name.split(' ')[0]} (${civ.name}) lidera maniobras militares — ${civ.population > 20 ? Math.floor(civ.population*0.3) : 'varios'} soldados en ejercicio`, icon:'🪖' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },

    // ── POBLACIÓN / DEMOGRAFÍA ───────────────────────────────────────────────
    () => {
      const births = Math.floor(civ.population * 0.05 + Math.random()*3);
      const variants = [
        { text:`Censo de ${civ.name}: ${civ.population} habitantes, ${births} nacimientos este año — crecimiento sostenido`, icon:'👶' },
        { text:`Migración masiva hacia ${civ.name} — ${Math.floor(3+Math.random()*8)} familias llegan desde territorios en conflicto`, icon:'🚶' },
        { text:`${civ.name} funda nuevo asentamiento — ${pname} lidera expedición de colonización`, icon:'🏕️' },
      ];
      return { ...rnd(variants), civName: civ.name };
    },
  ];

  // Try templates in random order
  const order = templates.map((_,i)=>i).sort(()=>Math.random()-0.5);
  for(const i of order){
    try {
      const result = templates[i]();
      if(result) return result;
    } catch(e) { /* skip broken template */ }
  }
  return null;
}

function tickMediaSystem(yearsElapsed) {
  if(typeof civilizations === 'undefined' || typeof structures === 'undefined') return;
  _mediaTimer += yearsElapsed;
  if(_mediaTimer < 8) return;
  _mediaTimer = 0;

  // Check which media structures exist and unlock them based on avg knowledge
  for(const [civId, civ] of civilizations){
    if(civ.population < 5) continue;
    const avgK = _civAvgKnowledgeMedia(civId);

    // Auto-build media structures when knowledge threshold reached
    if(avgK >= MEDIA_UNLOCK_THRESHOLDS.internet_hub && !civ._hasInternetHub){
      civ._hasInternetHub = true;
      addChronicle('science',`${civ.name} conecta al mundo`,`La red global de ${civ.name} enlaza a millones. La información fluye instantánea. El mundo nunca volverá a ser el mismo.`,'🌐');
    } else if(avgK >= MEDIA_UNLOCK_THRESHOLDS.tv_station && !civ._hasTvStation){
      civ._hasTvStation = true;
      addChronicle('culture',`Primera televisión en ${civ.name}`,`Las pantallas iluminan los hogares de ${civ.name}. Por primera vez, todos ven el mundo al mismo tiempo.`,'📺');
    } else if(avgK >= MEDIA_UNLOCK_THRESHOLDS.radio_tower && !civ._hasRadio){
      civ._hasRadio = true;
      addChronicle('culture',`Radio en ${civ.name}`,`Las ondas de radio llevan la voz de ${civ.name} a todos los rincones. La distancia ya no separa.`,'📻');
    } else if(avgK >= MEDIA_UNLOCK_THRESHOLDS.printing_press && !civ._hasPrintingPress){
      civ._hasPrintingPress = true;
      addChronicle('science',`Imprenta en ${civ.name}`,`${civ.name} domina el arte de la imprenta. Las ideas se multiplican. El conocimiento ya no es privilegio de pocos.`,'📰');
    }
  }

  // Generate headlines from civs that have media
  if(year - _lastMediaBroadcast < 2) return;
  _lastMediaBroadcast = year;

  const mediaLevel = _getMediaLevel();
  if(mediaLevel === 0) return;

  // Generate 1-2 headlines per broadcast
  const count = mediaLevel >= 3 ? 2 : 1;
  for(let i = 0; i < count; i++){
    const headline = _generateHeadline(mediaLevel);
    if(!headline) continue;
    const mediaIcons = ['','📰','📻','📺','🌐'];
    const mediaIcon = mediaIcons[mediaLevel] || '📰';
    _mediaHeadlines.unshift({
      year,
      text: headline.text,
      icon: headline.icon,
      civName: headline.civName,
      mediaIcon,
      mediaLevel,
    });
    if(_mediaHeadlines.length > 50) _mediaHeadlines.length = 50;

    // Knowledge boost to humans near media structures
    if(typeof _cachedAlive !== 'undefined'){
      const boost = mediaLevel * 0.05; // small passive boost per broadcast
      for(const h of _cachedAlive){
        const civ = h.civId != null ? civilizations.get(h.civId) : null;
        if(!civ) continue;
        const hasMedia = civ._hasInternetHub || civ._hasTvStation || civ._hasRadio || civ._hasPrintingPress;
        if(!hasMedia) continue;
        h.knowledge = Math.min(99999, h.knowledge + boost * _intelModifier);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TANDA 4 — 20 NUEVAS MECÁNICAS
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. CEMENTERIOS ────────────────────────────────────────────────────────────
// Cuando mueren humanos, se registran en un cementerio de la civ.
// Civs con cementerio ganan honor; humanos cercanos ganan social.
const _graveyards = new Map(); // civId → [{name, age, cause, year}]
let _graveyardTimer = 0;
function tickCemeteries(yearsElapsed) {
  _graveyardTimer += yearsElapsed;
  if (_graveyardTimer < 20) return;
  _graveyardTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Passive: humans near a cemetery structure gain social
  const cemStructures = structures.filter(s => s.type === 'cemetery');
  for (const cem of cemStructures) {
    const civ = cem.civId != null ? civilizations.get(cem.civId) : null;
    if (!civ) continue;
    const nearby = _spatialQuery(cem.tx, cem.ty, 12, -1);
    for (const h of nearby) {
      if (!h.alive || h.civId !== cem.civId) continue;
      h.social = Math.min(100, h.social + 2);
    }
    // Honor boost for having a cemetery
    civ.honor = Math.min(100, civ.honor + 0.1);
  }
}

// Called when a human dies — register in civ graveyard
function registerDeath(h, cause) {
  if (!h || !h.civId) return;
  if (!_graveyards.has(h.civId)) _graveyards.set(h.civId, []);
  const list = _graveyards.get(h.civId);
  list.push({ name: h.name, age: Math.floor(h.age), cause, year });
  if (list.length > 200) list.shift(); // keep last 200
  // Notable deaths get a world event
  if (h.kills >= 5 || h.knowledge > 5000 || h.isLeader) {
    const civ = civilizations.get(h.civId);
    const role = h.isLeader ? 'líder' : h.kills >= 5 ? 'guerrero' : 'sabio';
    addWorldEvent(`⚰️ ${h.name.split(' ')[0]}, ${role} de ${civ?.name||'?'}, muere a los ${Math.floor(h.age)} años — ${cause}`);
  }
}
function getGraveyard(civId) { return _graveyards.get(civId) || []; }

// ── 2. LINAJES DE SANGRE ──────────────────────────────────────────────────────
// Familias con 3+ líderes históricos se convierten en Casa Noble
const _nobleFamilies = new Map(); // surname → {civId, leaderCount, bonus}
const _leaderHistory = new Map(); // civId → [leaderName, ...]
let _lineageTimer = 0;
function tickBloodlineages(yearsElapsed) {
  _lineageTimer += yearsElapsed;
  if (_lineageTimer < 80) return;
  _lineageTimer = 0;
  for (const [, civ] of civilizations) {
    if (!civ.leaderId) continue;
    const leader = _hById(civ.leaderId);
    if (!leader || !leader.alive) continue;
    const surname = leader.name.split(' ')[1] || leader.name.split(' ')[0];
    if (!_leaderHistory.has(civ.id)) _leaderHistory.set(civ.id, []);
    const hist = _leaderHistory.get(civ.id);
    if (!hist.includes(surname)) hist.push(surname);
    // Count how many times this surname has led
    const count = hist.filter(n => n === surname).length;
    if (count >= 3 && !_nobleFamilies.has(surname)) {
      _nobleFamilies.set(surname, { civId: civ.id, leaderCount: count, bonus: 0.15 });
      // Boost all members with this surname
      for (const id of civ.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        if ((h.name.split(' ')[1] || h.name.split(' ')[0]) === surname) {
          h.knowledge = Math.min(99999, h.knowledge * 1.15);
          h.traits.charisma = Math.min(100, h.traits.charisma + 10);
        }
      }
      addWorldEvent(`👑 La familia ${surname} de ${civ.name} se convierte en Casa Noble — ${count} líderes en su historia`);
      addChronicle('politics', `Casa Noble ${surname}`, `Tres generaciones de líderes. El apellido ${surname} ya no era solo un nombre — era un destino. ${civ.name} reconoció su linaje con honores eternos.`, '👑');
    }
  }
}

// ── 3. HEREJÍAS Y CISMAS ──────────────────────────────────────────────────────
// Religiones muy extendidas generan facciones disidentes
let _heresyTimer = 0;
function tickHeresiesAndSchisms(yearsElapsed) {
  _heresyTimer += yearsElapsed;
  if (_heresyTimer < 110) return;
  _heresyTimer = 0;
  for (const [, civ] of civilizations) {
    if (!civ.religion || civ.population < 8) continue;
    if (Math.random() > 0.12) continue;
    // Count how many civs share this religion
    let sharedCount = 0;
    for (const [, other] of civilizations) { if (other.religion === civ.religion) sharedCount++; }
    if (sharedCount < 2) continue; // only splits if religion is widespread
    const prefixes = ['Reformista', 'Libre', 'Verdadero', 'Antiguo', 'Nuevo'];
    const newFaith = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${civ.religion}`;
    const oldFaith = civ.religion;
    // Split: half the members adopt the new faith (ideologically)
    let converted = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      if (h.ideology > 0.5 && Math.random() < 0.4) {
        h.social = Math.max(0, h.social - 15); // social tension
        converted++;
      }
    }
    civ.religion = newFaith;
    civ.honor = Math.max(0, civ.honor - 10);
    addWorldEvent(`✝️ Cisma en ${civ.name}: ${converted} fieles abandonan ${oldFaith} y fundan el ${newFaith} — tensión religiosa interna`);
    addChronicle('culture', `El Gran Cisma de ${civ.name}`, `Lo que empezó como un debate teológico terminó en ruptura. ${converted} fieles rechazaron la doctrina oficial y fundaron el ${newFaith}. ${civ.name} nunca volvió a ser la misma.`, '✝️');
  }
}

// ── 4. MERCADOS NEGROS ────────────────────────────────────────────────────────
// En civs en guerra o con honor bajo, aparecen comerciantes ilegales
let _blackMarketTimer = 0;
const _blackMarkets = []; // {civId, tx, ty, timer}
function tickBlackMarkets(yearsElapsed) {
  _blackMarketTimer += yearsElapsed;
  if (_blackMarketTimer < 45) return;
  _blackMarketTimer = 0;
  // Spawn black markets in low-honor or at-war civs
  for (const [, civ] of civilizations) {
    if (civ.population < 6) continue;
    if (civ.honor > 35 && civ.atWarWith.size === 0) continue;
    if (_blackMarkets.some(bm => bm.civId === civ.id)) continue;
    if (Math.random() > 0.2) continue;
    const cc = civ.cityCenter;
    if (!cc) continue;
    const tx = cc.tx + Math.floor(Math.random() * 10 - 5);
    const ty = cc.ty + Math.floor(Math.random() * 10 - 5);
    _blackMarkets.push({ civId: civ.id, tx, ty, timer: 80 + Math.floor(Math.random() * 60) });
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    addWorldEvent(`🕶️ Mercado negro surge en ${civ.name} — comercio ilegal florece mientras ${leader?.name.split(' ')[0]||'el gobierno'} mira hacia otro lado`);
  }
  // Tick existing black markets
  for (let i = _blackMarkets.length - 1; i >= 0; i--) {
    const bm = _blackMarkets[i];
    bm.timer -= yearsElapsed;
    const civ = civilizations.get(bm.civId);
    if (!civ || bm.timer <= 0) { _blackMarkets.splice(i, 1); continue; }
    // Boost nearby humans' food/wealth but reduce civ honor
    const nearby = _spatialQuery(bm.tx, bm.ty, 10, -1);
    for (const h of nearby) {
      if (!h.alive || h.civId !== bm.civId) continue;
      h.inventory.food = Math.min(h.inventory.food + 3, 50);
      h.wealth = (h.wealth || 0) + 5;
    }
    civ.honor = Math.max(0, civ.honor - 0.05);
    // Leader can crack down
    if (civ.honor < 20 && Math.random() < 0.1) {
      _blackMarkets.splice(i, 1);
      civ.honor = Math.min(100, civ.honor + 8);
      const leader = civ.leaderId ? _hById(civ.leaderId) : null;
      addWorldEvent(`🚔 ${leader?.name.split(' ')[0]||civ.name} clausura el mercado negro — operación policial en ${civ.name}`);
    }
  }
}

// ── 5. MONUMENTOS A LOS CAÍDOS ────────────────────────────────────────────────
// Tras guerras grandes, la civ ganadora construye un monumento
let _warMonumentTimer = 0;
const _warMonuments = new Set(); // civId — already built one
function tickWarMonuments(yearsElapsed) {
  _warMonumentTimer += yearsElapsed;
  if (_warMonumentTimer < 60) return;
  _warMonumentTimer = 0;
  for (const [, civ] of civilizations) {
    if (_warMonuments.has(civ.id) || civ.population < 5) continue;
    if (civ.atWarWith.size > 0) continue; // only after war ends
    // Check if civ recently won a war (has kills history)
    const totalKills = [...(civ.members || [])].reduce((sum, id) => {
      const h = _hById(id); return sum + (h ? h.kills : 0);
    }, 0);
    if (totalKills < 10) continue;
    if (Math.random() > 0.15) continue;
    _warMonuments.add(civ.id);
    civ.honor = Math.min(100, civ.honor + 20);
    for (const id of civ.members) {
      const h = _hById(id); if (h && h.alive) h.social = Math.min(100, h.social + 15);
    }
    const leader = civ.leaderId ? _hById(civ.leaderId) : null;
    const lname = leader ? leader.name.split(' ')[0] : civ.name;
    addWorldEvent(`🗿 ${lname} inaugura el Monumento a los Caídos de ${civ.name} — ${totalKills} guerreros recordados para siempre`);
    addChronicle('war', `El Monumento de ${civ.name}`, `${lname} mandó grabar cada nombre en piedra. ${totalKills} guerreros que no volvieron. El monumento se convirtió en lugar de peregrinación y duelo colectivo.`, '🗿');
  }
}

// ── 6. ESCUELAS DE COMBATE ────────────────────────────────────────────────────
// Civs con barracks + forge crean una escuela de combate con estilo propio
let _combatSchoolTimer = 0;
const _combatSchools = new Map(); // civId → {name, style, bonus}
const COMBAT_STYLES = [
  { name: 'Espartana', bonus: 'fuerza', desc: 'disciplina de hierro' },
  { name: 'Samurái', bonus: 'velocidad', desc: 'honor y precisión' },
  { name: 'Berserker', bonus: 'agresión', desc: 'furia sin límites' },
  { name: 'Legionaria', bonus: 'formación', desc: 'cohesión táctica' },
  { name: 'Nómada', bonus: 'movilidad', desc: 'guerreros del viento' },
  { name: 'Arcana', bonus: 'conocimiento', desc: 'magia y estrategia' },
];
function tickCombatSchools(yearsElapsed) {
  _combatSchoolTimer += yearsElapsed;
  if (_combatSchoolTimer < 90) return;
  _combatSchoolTimer = 0;
  for (const [, civ] of civilizations) {
    if (_combatSchools.has(civ.id) || civ.population < 8) continue;
    const hasBarracks = structures.some(s => s.civId === civ.id && s.type === 'barracks');
    const hasForge = structures.some(s => s.civId === civ.id && s.type === 'forge');
    if (!hasBarracks || !hasForge) continue;
    if (Math.random() > 0.2) continue;
    const style = COMBAT_STYLES[Math.floor(Math.random() * COMBAT_STYLES.length)];
    _combatSchools.set(civ.id, { name: `Escuela ${style.name}`, style: style.bonus, desc: style.desc });
    // Apply bonus to all soldiers
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || !h.isSoldier) continue;
      if (style.bonus === 'fuerza') h.traits.strength = Math.min(100, h.traits.strength + 15);
      else if (style.bonus === 'agresión') h.aggression = Math.min(1, h.aggression + 0.2);
      else if (style.bonus === 'conocimiento') h.knowledge = Math.min(99999, h.knowledge + 200);
      else if (style.bonus === 'movilidad') h.tilesPerYear = Math.min(h.tilesPerYear + 4, 60);
      h._combatStyle = style.name;
    }
    addWorldEvent(`🥋 ${civ.name} funda la Escuela ${style.name} — ${style.desc}. Sus guerreros serán temidos.`);
    addChronicle('war', `La Escuela ${style.name} de ${civ.name}`, `No era solo entrenamiento. Era una filosofía. La Escuela ${style.name} forjó guerreros con ${style.desc}. Sus técnicas se transmitirían de generación en generación.`, '🥋');
  }
}

// ── 7. HAMBRUNAS POLÍTICAS ────────────────────────────────────────────────────
// Líderes corruptos (honor bajo) desvían comida del granero
let _politFamineTimer = 0;
function tickPoliticalFamine(yearsElapsed) {
  _politFamineTimer += yearsElapsed;
  if (_politFamineTimer < 35) return;
  _politFamineTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.honor > 25 || civ.population < 5 || !civ.leaderId) continue;
    const leader = _hById(civ.leaderId);
    if (!leader || !leader.alive) continue;
    if (Math.random() > 0.3) continue;
    // Leader takes food from members
    let stolen = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive || h.id === civ.leaderId) continue;
      const take = Math.min(h.inventory.food, 3);
      h.inventory.food -= take;
      h.hunger = Math.max(0, h.hunger - 8);
      stolen += take;
    }
    leader.inventory.food += stolen;
    leader.wealth = (leader.wealth || 0) + stolen * 2;
    if (stolen > 5) {
      addWorldEvent(`🍞 ${leader.name.split(' ')[0]} de ${civ.name} desvía ${stolen} unidades de comida — el pueblo pasa hambre mientras el líder festeja`);
      civ.honor = Math.max(0, civ.honor - 3);
    }
  }
}

// ── 8. EXPLORADORES LEGENDARIOS ──────────────────────────────────────────────
// Humanos que visitan muchos biomas se convierten en Exploradores
const _explorerBiomes = new Map(); // humanId → Set of biomes visited
const _legendaryExplorers = new Set(); // humanIds
let _explorerTimer = 0;
function tickLegendaryExplorers(yearsElapsed) {
  _explorerTimer += yearsElapsed;
  if (_explorerTimer < 15) return;
  _explorerTimer = 0;
  if (typeof _cachedAlive === 'undefined' || typeof getCell === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive || _legendaryExplorers.has(h.id)) continue;
    if (!_explorerBiomes.has(h.id)) _explorerBiomes.set(h.id, new Set());
    const biomes = _explorerBiomes.get(h.id);
    const cell = getCell(h.tx, h.ty);
    if (cell) biomes.add(cell.biome);
    if (biomes.size >= 7) {
      _legendaryExplorers.add(h.id);
      h._isExplorer = true;
      h.knowledge = Math.min(99999, h.knowledge + 800);
      const civ = h.civId ? civilizations.get(h.civId) : null;
      if (civ) {
        for (const id of civ.members) {
          const m = _hById(id); if (m && m.alive) m.knowledge = Math.min(99999, m.knowledge + 80);
        }
      }
      addWorldEvent(`🧭 ${h.name.split(' ')[0]} ha explorado ${biomes.size} biomas distintos — declarado Explorador Legendario de ${civ?.name||'la humanidad'}`);
      addChronicle('culture', `${h.name.split(' ')[0]}, el Explorador`, `Desiertos, tundras, selvas, mares. ${h.name.split(' ')[0]} lo había visto todo. Sus crónicas de viaje se convirtieron en el mapa del mundo conocido. Generaciones futuras seguirían sus pasos.`, '🧭');
    }
  }
}

// ── 9. ALIANZAS MATRIMONIALES ─────────────────────────────────────────────────
// Líderes casan a sus hijos para sellar la paz entre civs
let _matrimonialTimer = 0;
const _matrimonialBonds = new Map(); // civIdA+civIdB → {year, childId}
function tickMatrimonialAlliances(yearsElapsed) {
  _matrimonialTimer += yearsElapsed;
  if (_matrimonialTimer < 100) return;
  _matrimonialTimer = 0;
  const civList = [];
  for (const [, civ] of civilizations) { if (civ.population >= 6 && civ.leaderId) civList.push(civ); }
  if (civList.length < 2) return;
  for (const civA of civList) {
    if (civA.atWarWith.size > 0) continue;
    for (const civB of civList) {
      if (civB.id === civA.id || civB.atWarWith.size > 0) continue;
      if (civA.allies.has(civB.id)) continue;
      const bondKey = [civA.id, civB.id].sort().join('-');
      if (_matrimonialBonds.has(bondKey)) continue;
      if (Math.random() > 0.08) continue;
      // Find a young member from each civ
      let childA = null, childB = null;
      for (const id of civA.members) {
        const h = _hById(id);
        if (h && h.alive && h.age >= 16 && h.age <= 30 && !h.partner) { childA = h; break; }
      }
      for (const id of civB.members) {
        const h = _hById(id);
        if (h && h.alive && h.age >= 16 && h.age <= 30 && !h.partner) { childB = h; break; }
      }
      if (!childA || !childB) continue;
      childA.partner = childB.id;
      childB.partner = childA.id;
      civA.allies.add(civB.id);
      civB.allies.add(civA.id);
      civA.enemies.delete(civB.id);
      civB.enemies.delete(civA.id);
      _matrimonialBonds.set(bondKey, { year, childA: childA.id, childB: childB.id });
      const leaderA = _hById(civA.leaderId);
      const leaderB = _hById(civB.leaderId);
      addWorldEvent(`💍 ${childA.name.split(' ')[0]} de ${civA.name} se casa con ${childB.name.split(' ')[0]} de ${civB.name} — alianza sellada por ${leaderA?.name.split(' ')[0]||civA.name} y ${leaderB?.name.split(' ')[0]||civB.name}`);
      addChronicle('politics', `La boda que cambió la historia`, `${childA.name.split(' ')[0]} y ${childB.name.split(' ')[0]} no se eligieron. Los eligieron sus padres. Pero en la ceremonia, algo real nació. ${civA.name} y ${civB.name} dejaron de ser enemigos.`, '💍');
      break;
    }
  }
}

// ── 10. RUINAS DE CIVILIZACIONES EXTINTAS ────────────────────────────────────
// Cuando una civ desaparece, sus estructuras se convierten en ruinas explorables
const _ruinSites = []; // {name, tx, ty, knowledge, civName, year}
let _ruinTimer = 0;
function tickExtinctCivRuins(yearsElapsed) {
  _ruinTimer += yearsElapsed;
  if (_ruinTimer < 30) return;
  _ruinTimer = 0;
  // Check for newly extinct civs
  for (const [civId, civ] of civilizations) {
    if (civ.population > 0 || civ._ruinsCreated) continue;
    civ._ruinsCreated = true;
    // Convert some structures to ruins
    let ruinCount = 0;
    for (const s of structures) {
      if (s.civId !== civId || s.type === 'road' || s.type === 'camp') continue;
      s.type = 'ruins';
      s.label = `Ruinas de ${civ.name}`;
      s.civId = null;
      s._ruinKnowledge = 50 + Math.floor(Math.random() * 200);
      s._ruinCivName = civ.name;
      ruinCount++;
      if (ruinCount >= 5) break;
    }
    if (ruinCount > 0) {
      _ruinSites.push({ name: `Ruinas de ${civ.name}`, civName: civ.name, year });
      addWorldEvent(`🏚️ ${civ.name} se extingue — sus estructuras quedan como ruinas. Futuros exploradores encontrarán sus secretos.`);
      addChronicle('culture', `El fin de ${civ.name}`, `Nadie recordaba exactamente cuándo murió el último ciudadano de ${civ.name}. Solo quedaban las piedras. Y en las piedras, la memoria de todo lo que fueron.`, '🏚️');
    }
  }
  // Humans who visit ruins gain knowledge
  if (typeof _cachedAlive === 'undefined') return;
  for (const s of structures) {
    if (s.type !== 'ruins' || !s._ruinKnowledge) continue;
    const nearby = _spatialQuery(s.tx, s.ty, 4, -1);
    for (const h of nearby) {
      if (!h.alive) continue;
      h.knowledge = Math.min(99999, h.knowledge + s._ruinKnowledge * 0.1);
      if (Math.random() < 0.02) {
        addWorldEvent(`🔍 ${h.name.split(' ')[0]} explora las ${s.label} — descubre ${Math.round(s._ruinKnowledge * 0.1)} pts de conocimiento perdido`);
      }
    }
  }
}

// ── 11. CANAL DE TV / PROGRAMA ESTRELLA ──────────────────────────────────────
// Civs con TV crean programas que influyen en la ideología y social de la población
const _tvShows = new Map(); // civId → {name, type, rating, yearsRunning}
const TV_SHOW_TYPES = [
  { name: 'El Gran Debate', type: 'politico', effect: 'honor', icon: '🎙️' },
  { name: 'Guerreros de la Arena', type: 'combate', effect: 'aggression', icon: '⚔️' },
  { name: 'La Voz del Pueblo', type: 'social', effect: 'social', icon: '🎤' },
  { name: 'Misterios del Cosmos', type: 'ciencia', effect: 'knowledge', icon: '🔭' },
  { name: 'El Imperio Culinario', type: 'cultura', effect: 'hunger', icon: '🍖' },
  { name: 'Noticias de la Nación', type: 'noticias', effect: 'honor', icon: '📺' },
  { name: 'Historias de Guerra', type: 'drama', effect: 'aggression', icon: '🎬' },
  { name: 'El Sabio y el Rey', type: 'educativo', effect: 'knowledge', icon: '📚' },
];
let _tvTimer = 0;
function tickTVChannel(yearsElapsed) {
  _tvTimer += yearsElapsed;
  if (_tvTimer < 18) return;
  _tvTimer = 0;
  for (const [, civ] of civilizations) {
    if (!civ._hasTvStation || civ.population < 5) continue;
    // Create a show if none exists
    if (!_tvShows.has(civ.id)) {
      const show = TV_SHOW_TYPES[Math.floor(Math.random() * TV_SHOW_TYPES.length)];
      _tvShows.set(civ.id, { ...show, rating: 50 + Math.floor(Math.random() * 30), yearsRunning: 0 });
      addWorldEvent(`${show.icon} ${civ.name} estrena "${show.name}" — primer programa de televisión de la historia`);
    }
    const show = _tvShows.get(civ.id);
    show.yearsRunning += yearsElapsed;
    show.rating = Math.max(10, Math.min(100, show.rating + (Math.random() * 10 - 5)));
    // Apply effect to all civ members
    for (const id of civ.members) {
      const h = _hById(id);
      if (!h || !h.alive) continue;
      const strength = (show.rating / 100) * 0.5;
      if (show.effect === 'honor') civ.honor = Math.min(100, civ.honor + strength * 0.1);
      else if (show.effect === 'social') h.social = Math.min(100, h.social + strength);
      else if (show.effect === 'knowledge') h.knowledge = Math.min(99999, h.knowledge + strength * 0.5);
      else if (show.effect === 'aggression') h.aggression = Math.min(1, h.aggression + strength * 0.005);
      else if (show.effect === 'hunger') h.hunger = Math.min(100, h.hunger + strength * 0.3);
    }
    // Milestone events
    if (Math.floor(show.yearsRunning) % 50 === 0 && show.yearsRunning > 0) {
      addWorldEvent(`${show.icon} "${show.name}" de ${civ.name} cumple ${Math.floor(show.yearsRunning)} años al aire — rating ${Math.round(show.rating)}%`);
    }
    // Show can be cancelled if rating drops
    if (show.rating < 15 && Math.random() < 0.3) {
      const newShow = TV_SHOW_TYPES[Math.floor(Math.random() * TV_SHOW_TYPES.length)];
      addWorldEvent(`📺 "${show.name}" de ${civ.name} es cancelado — estrenan "${newShow.name}"`);
      _tvShows.set(civ.id, { ...newShow, rating: 40 + Math.floor(Math.random() * 20), yearsRunning: 0 });
    }
  }
}

// ── 12. EPIDEMIA DE IDEOLOGÍA ─────────────────────────────────────────────────
// Ideas radicales se propagan como virus entre civs conectadas
let _ideologyEpidemicTimer = 0;
function tickIdeologyEpidemic(yearsElapsed) {
  _ideologyEpidemicTimer += yearsElapsed;
  if (_ideologyEpidemicTimer < 60) return;
  _ideologyEpidemicTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8 || civ.allies.size === 0) continue;
    if (Math.random() > 0.15) continue;
    // Find the dominant ideology in this civ
    let ideSum = 0, cnt = 0;
    for (const id of civ.members) {
      const h = _hById(id); if (h && h.alive) { ideSum += h.ideology; cnt++; }
    }
    const avgIde = cnt > 0 ? ideSum / cnt : 0.5;
    const isRadical = avgIde < 0.2 || avgIde > 0.8;
    if (!isRadical) continue;
    // Spread to allies
    for (const allyId of civ.allies) {
      const ally = civilizations.get(allyId);
      if (!ally || ally.population === 0) continue;
      let spread = 0;
      for (const id of ally.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        if (Math.random() < 0.3) {
          h.ideology = h.ideology * 0.7 + avgIde * 0.3;
          spread++;
        }
      }
      if (spread > 2) {
        const label = avgIde < 0.2 ? 'autoritarismo' : 'radicalismo libertario';
        addWorldEvent(`💭 Ideas de ${label} se propagan de ${civ.name} a ${ally.name} — ${spread} personas adoptan la nueva visión del mundo`);
      }
    }
  }
}

// ── 13. JUEGOS FLORALES / POESÍA ──────────────────────────────────────────────
// Civs con catedral/coliseo organizan concursos de poesía y arte
let _poetryTimer = 0;
function tickPoetryGames(yearsElapsed) {
  _poetryTimer += yearsElapsed;
  if (_poetryTimer < 75) return;
  _poetryTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8) continue;
    const hasVenue = structures.some(s => s.civId === civ.id && (s.type === 'colosseum' || s.type === 'cathedral' || s.type === 'amphitheater'));
    if (!hasVenue || Math.random() > 0.2) continue;
    // Find the most knowledgeable member as the winner
    let poet = null, bestK = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (h && h.alive && h.knowledge > bestK) { bestK = h.knowledge; poet = h; }
    }
    if (!poet) continue;
    poet.knowledge = Math.min(99999, poet.knowledge + 300);
    poet.social = Math.min(100, poet.social + 30);
    civ.honor = Math.min(100, civ.honor + 5);
    for (const id of civ.members) {
      const h = _hById(id); if (h && h.alive) h.social = Math.min(100, h.social + 8);
    }
    const poems = [
      `"Oda a ${civ.name}"`, `"El río eterno"`, `"Canción de los guerreros"`,
      `"Himno al sol"`, `"Elegía por los caídos"`, `"La ciudad que soñamos"`,
    ];
    const poem = poems[Math.floor(Math.random() * poems.length)];
    addWorldEvent(`🌸 Juegos Florales en ${civ.name}: ${poet.name.split(' ')[0]} gana con ${poem} — ${civ.population} ciudadanos celebran el arte`);
  }
}

// ── 14. MIGRACIÓN DE INVIERNO NUCLEAR ────────────────────────────────────────
// Tras una guerra nuclear, el polvo bloquea el sol y todos migran
let _nuclearWinterMigTimer = 0;
function tickNuclearWinterMigration(yearsElapsed) {
  _nuclearWinterMigTimer += yearsElapsed;
  if (_nuclearWinterMigTimer < 20) return;
  _nuclearWinterMigTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  // Check if any nuclear silo was recently fired (proxy: look for very low population civs with nuclear_silo)
  let nuclearActive = false;
  for (const [, civ] of civilizations) {
    if (civ.population < 3 && structures.some(s => s.civId === civ.id && s.type === 'nuclear_silo')) {
      nuclearActive = true; break;
    }
  }
  if (!nuclearActive) return;
  // Mass migration away from radiation zones
  let migrated = 0;
  for (const h of _cachedAlive) {
    if (!h.alive || migrated >= 8) break;
    if (Math.random() > 0.05) continue;
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.floor(Math.random() * 60);
    h.tx = Math.max(0, Math.min(WORLD_W - 1, h.tx + Math.round(Math.cos(angle) * dist)));
    h.ty = Math.max(0, Math.min(WORLD_H - 1, h.ty + Math.round(Math.sin(angle) * dist)));
    h.health = Math.max(10, h.health - 15);
    migrated++;
  }
  if (migrated > 0 && Math.random() < 0.1) {
    addWorldEvent(`☢️ Invierno nuclear: ${migrated} personas huyen de las zonas contaminadas — el cielo está oscuro`);
  }
}

// ── 15. CANONIZACIÓN DE SANTOS ────────────────────────────────────────────────
// Humanos muertos con alta reputación son canonizados por su civ
const _saints = []; // {name, civName, year, reason}
let _saintTimer = 0;
function tickSainthood(yearsElapsed) {
  _saintTimer += yearsElapsed;
  if (_saintTimer < 90) return;
  _saintTimer = 0;
  if (typeof humans === 'undefined') return;
  for (const h of humans) {
    if (h.alive || h._canonized) continue;
    if (!h.civId) continue;
    const civ = civilizations.get(h.civId);
    if (!civ || !civ.religion) continue;
    // Qualify: high knowledge, many kills, or was a leader
    const notable = h.knowledge > 3000 || h.kills >= 8 || h.isLeader;
    if (!notable || Math.random() > 0.05) continue;
    h._canonized = true;
    const reason = h.kills >= 8 ? 'mártir de guerra' : h.isLeader ? 'líder venerado' : 'sabio iluminado';
    _saints.push({ name: h.name, civName: civ.name, year, reason });
    civ.honor = Math.min(100, civ.honor + 10);
    for (const id of civ.members) {
      const m = _hById(id); if (m && m.alive) m.social = Math.min(100, m.social + 10);
    }
    addWorldEvent(`✨ ${civ.name} canoniza a ${h.name.split(' ')[0]} como santo — ${reason}. Su nombre vivirá en la fe de ${civ.religion}.`);
    addChronicle('culture', `San ${h.name.split(' ')[0]}`, `Murió como ${reason}. Pero en la memoria de ${civ.name}, nunca murió del todo. Los fieles de ${civ.religion} comenzaron a invocar su nombre en las oraciones.`, '✨');
  }
}

// ── 16. CRISIS DE SUCESIÓN ────────────────────────────────────────────────────
// Cuando un líder muere sin heredero claro, hay guerra civil breve
let _successionTimer = 0;
function tickSuccessionCrisis(yearsElapsed) {
  _successionTimer += yearsElapsed;
  if (_successionTimer < 25) return;
  _successionTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 5 || !civ.leaderId) continue;
    const leader = _hById(civ.leaderId);
    if (leader && leader.alive) continue; // leader still alive
    // Leader is dead — find top 2 candidates
    const candidates = [];
    for (const id of civ.members) {
      const h = _hById(id);
      if (h && h.alive) candidates.push(h);
    }
    candidates.sort((a, b) => b.leaderScore - a.leaderScore);
    if (candidates.length < 2) continue;
    const winner = candidates[0], rival = candidates[1];
    if (Math.random() < 0.4) {
      // Crisis: brief civil war — rival loses health
      rival.health = Math.max(10, rival.health - 30);
      civ.honor = Math.max(0, civ.honor - 15);
      for (const id of civ.members) {
        const h = _hById(id); if (h && h.alive) h.social = Math.max(0, h.social - 20);
      }
      addWorldEvent(`⚡ Crisis de sucesión en ${civ.name}: ${winner.name.split(' ')[0]} y ${rival.name.split(' ')[0]} se disputan el poder — inestabilidad total`);
    }
    winner.isLeader = true;
    civ.leaderId = winner.id;
    addWorldEvent(`👑 ${winner.name.split(' ')[0]} asume el liderazgo de ${civ.name} tras la muerte del líder anterior`);
  }
}

// ── 17. FERIA INTERNACIONAL ───────────────────────────────────────────────────
// Civs aliadas organizan ferias donde intercambian inventos y cultura
let _fairTimer = 0;
function tickInternationalFair(yearsElapsed) {
  _fairTimer += yearsElapsed;
  if (_fairTimer < 85) return;
  _fairTimer = 0;
  const civList = [];
  for (const [, civ] of civilizations) { if (civ.population >= 8 && civ.allies.size > 0) civList.push(civ); }
  if (civList.length < 2) return;
  const host = civList[Math.floor(Math.random() * civList.length)];
  if (Math.random() > 0.2) return;
  let participants = [host];
  for (const allyId of host.allies) {
    const ally = civilizations.get(allyId);
    if (ally && ally.population > 0) participants.push(ally);
  }
  if (participants.length < 2) return;
  // Share inventions between participants
  const allInventions = new Set();
  for (const p of participants) for (const inv of p.inventions) allInventions.add(inv);
  for (const p of participants) {
    for (const inv of allInventions) p.inventions.add(inv);
    for (const id of p.members) {
      const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + 100);
    }
  }
  const names = participants.map(p => p.name).join(', ');
  addWorldEvent(`🎪 Feria Internacional en ${host.name} — participan ${names}. Se comparten ${allInventions.size} inventos y conocimientos.`);
  addChronicle('culture', `La Gran Feria de ${host.name}`, `Por primera vez, ${participants.length} naciones se reunieron en paz. Artesanos, sabios y comerciantes llenaron las calles de ${host.name}. El mundo se hizo un poco más pequeño.`, '🎪');
}

// ── 18. HAMBRE DE GLORIA ──────────────────────────────────────────────────────
// Humanos jóvenes con alta agresión buscan fama en combate voluntariamente
let _gloryTimer = 0;
function tickHungerForGlory(yearsElapsed) {
  _gloryTimer += yearsElapsed;
  if (_gloryTimer < 30) return;
  _gloryTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive || h.age > 35 || h.aggression < 0.7 || h.isSoldier) continue;
    if (Math.random() > 0.05) continue;
    const civ = h.civId ? civilizations.get(h.civId) : null;
    if (!civ || civ.atWarWith.size === 0) continue;
    // Volunteer as soldier
    h.isSoldier = true;
    h.weaponTier = Math.max(h.weaponTier, 1);
    h._glorySeeker = true;
    addWorldEvent(`⚡ ${h.name.split(' ')[0]} de ${civ.name} se alista voluntariamente — sed de gloria y combate a los ${Math.floor(h.age)} años`);
  }
}

// ── 19. PLAGA DE LANGOSTAS BÍBLICA ───────────────────────────────────────────
// Evento raro: plaga masiva que destruye todas las granjas de una región
let _biblicalLocustTimer = 0;
function tickBiblicalLocustPlague(yearsElapsed) {
  _biblicalLocustTimer += yearsElapsed;
  if (_biblicalLocustTimer < 200) return;
  _biblicalLocustTimer = 0;
  if (Math.random() > 0.15) return;
  // Pick a random region of the map
  const cx = Math.floor(Math.random() * WORLD_W);
  const cy = Math.floor(Math.random() * WORLD_H);
  const radius = 25 + Math.floor(Math.random() * 20);
  let farmsDestroyed = 0;
  for (let i = structures.length - 1; i >= 0; i--) {
    const s = structures[i];
    if (s.type !== 'farm' && s.type !== 'granary') continue;
    const d = Math.hypot(s.tx - cx, s.ty - cy);
    if (d > radius) continue;
    if (structureGrid) structureGrid[s.ty * WORLD_W + s.tx] = null;
    structures.splice(i, 1);
    farmsDestroyed++;
  }
  if (farmsDestroyed === 0) return;
  // Starve nearby humans
  if (typeof _cachedAlive !== 'undefined') {
    for (const h of _cachedAlive) {
      if (!h.alive) continue;
      const d = Math.hypot(h.tx - cx, h.ty - cy);
      if (d > radius) continue;
      h.inventory.food = Math.max(0, h.inventory.food - 15);
      h.hunger = Math.max(0, h.hunger - 25);
    }
  }
  // Find affected civs
  const affectedCivs = new Set();
  for (const [, civ] of civilizations) {
    if (civ.cityCenter && Math.hypot(civ.cityCenter.tx - cx, civ.cityCenter.ty - cy) < radius + 20) {
      affectedCivs.add(civ.name);
    }
  }
  const civNames = [...affectedCivs].slice(0, 3).join(', ') || 'la región';
  addWorldEvent(`🦗 PLAGA BÍBLICA: nube de langostas devasta ${civNames} — ${farmsDestroyed} granjas destruidas, hambruna inminente`);
  addChronicle('disaster', 'La Gran Plaga de Langostas', `El cielo se oscureció. No era una nube — eran millones de langostas. En horas, los campos de ${civNames} quedaron arrasados. El hambre llegó antes de que nadie pudiera prepararse.`, '🦗');
}

// ── 20. LEGADO CULTURAL VIVO ──────────────────────────────────────────────────
// Civs antiguas (>500 años) generan un "legado cultural" que influye en civs vecinas
let _culturalLegacyLiveTimer = 0;
function tickLivingCulturalLegacy(yearsElapsed) {
  _culturalLegacyLiveTimer += yearsElapsed;
  if (_culturalLegacyLiveTimer < 50) return;
  _culturalLegacyLiveTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population === 0) continue;
    const age = year - civ.founded;
    if (age < 300) continue;
    const legacyStrength = Math.min(1, age / 1000);
    // Influence nearby civs
    for (const [, other] of civilizations) {
      if (other.id === civ.id || other.population === 0) continue;
      if (!civ.cityCenter || !other.cityCenter) continue;
      const dist = Math.hypot(civ.cityCenter.tx - other.cityCenter.tx, civ.cityCenter.ty - other.cityCenter.ty);
      if (dist > 80) continue;
      // Share religion, boost knowledge
      if (civ.religion && !other.religion && Math.random() < legacyStrength * 0.05) {
        other.religion = civ.religion;
        addWorldEvent(`🌍 La cultura de ${civ.name} (${Math.round(age)} años) influye en ${other.name} — adoptan la fe ${civ.religion}`);
      }
      for (const id of other.members) {
        const h = _hById(id);
        if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + legacyStrength * 0.5);
      }
    }
    // Milestone chronicles
    if (age === 500 || age === 1000 || age === 2000) {
      const leader = civ.leaderId ? _hById(civ.leaderId) : null;
      addChronicle('culture', `${civ.name}: ${age} años de historia`, `${age} años. Guerras, pestes, renacimientos. ${civ.name} había sobrevivido todo. ${leader?.name.split(' ')[0]||'Su líder'} contempló el horizonte y supo que habría ${age} años más.`, '🌍');
    }
  }
}

// ── Registrar las nuevas mecánicas en tickAllFeatures ────────────────────────
function tickNewFeatures(yearsElapsed) {
  tickEspionage2(yearsElapsed);
  tickGoldenAge(yearsElapsed);
  tickMercenaries(yearsElapsed);
  tickWarTrauma(yearsElapsed);
  tickMediaSystem(yearsElapsed);
  tickPoliticalAssassination(yearsElapsed);
  tickOlympicGames(yearsElapsed);
  tickWarRefugees(yearsElapsed);
  tickCharismaticCult(yearsElapsed);
  tickLongevityRecord(yearsElapsed);
  tickTradeBlockade(yearsElapsed);
  tickTechRace(yearsElapsed);
  tickScholarExile(yearsElapsed);
  tickMediaEpidemic(yearsElapsed);
  tickPropaganda(yearsElapsed);
  // Tanda 3
  tickOverseasColonies(yearsElapsed);
  tickLandHunger(yearsElapsed);
  tickReligiousSyncretism(yearsElapsed);
  tickItinerantArtisans(yearsElapsed);
  tickCommonCurrency(yearsElapsed);
  tickMilitaryDesertion(yearsElapsed);
  tickUniversalLibrary(yearsElapsed);
  tickPublicTrial(yearsElapsed);
  tickClimateSeasonMigration(yearsElapsed);
  tickWarTribute(yearsElapsed);
  // Tanda 4
  tickCemeteries(yearsElapsed);
  tickBloodlineages(yearsElapsed);
  tickHeresiesAndSchisms(yearsElapsed);
  tickBlackMarkets(yearsElapsed);
  tickWarMonuments(yearsElapsed);
  tickCombatSchools(yearsElapsed);
  tickPoliticalFamine(yearsElapsed);
  tickLegendaryExplorers(yearsElapsed);
  tickMatrimonialAlliances(yearsElapsed);
  tickExtinctCivRuins(yearsElapsed);
  tickTVChannel(yearsElapsed);
  tickIdeologyEpidemic(yearsElapsed);
  tickPoetryGames(yearsElapsed);
  tickNuclearWinterMigration(yearsElapsed);
  tickSainthood(yearsElapsed);
  tickSuccessionCrisis(yearsElapsed);
  tickInternationalFair(yearsElapsed);
  tickHungerForGlory(yearsElapsed);
  tickBiblicalLocustPlague(yearsElapsed);
  tickLivingCulturalLegacy(yearsElapsed);
  // Tanda 5
  tickSocialClasses(yearsElapsed);
  tickEndemicDiseases(yearsElapsed);
  tickDayNight(yearsElapsed);
  tickConstitutions(yearsElapsed);
  tickElections(yearsElapsed);
  tickPoliticalParties(yearsElapsed);
  tickArchitecturalStyles(yearsElapsed);
  tickNationalSports(yearsElapsed);
  tickStockMarket(yearsElapsed);
  tickNationalDebt(yearsElapsed);
  tickInternationalTourism(yearsElapsed);
  tickUnionsAndStrikes(yearsElapsed);
  tickResourceDepletion(yearsElapsed);
  tickVisiblePollution(yearsElapsed);
  // Tanda 6
  tickChronicler(yearsElapsed);
  tickTerraforming(yearsElapsed);
  tickDreams(yearsElapsed);
  tickColosseumBattles(yearsElapsed);
}

// ══════════════════════════════════════════════════════════════════════════════
// TANDA 5 — 14 SISTEMAS NUEVOS
// ══════════════════════════════════════════════════════════════════════════════

// ── 2. CLASES SOCIALES ────────────────────────────────────────────────────────
// noble, comerciante, campesino, esclavo — afecta acceso a recursos y conocimiento
let _classTimer = 0;
function tickSocialClasses(yearsElapsed) {
  _classTimer += yearsElapsed;
  if (_classTimer < 40) return;
  _classTimer = 0;
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive || !h.civId) continue;
    const civ = civilizations.get(h.civId);
    if (!civ) continue;
    // Assign class based on wealth, knowledge, leaderScore
    const prevClass = h._socialClass;
    if (h.isLeader || (h._socialClass === 'noble' && civ.honor > 40)) {
      h._socialClass = 'noble';
    } else if (h.knowledge > 2000 || h.wealth > 80) {
      h._socialClass = 'comerciante';
    } else if (h.kills > 0 && h.isSoldier) {
      h._socialClass = 'soldado';
    } else if (h.wealth < 5 && civ.honor < 30 && Math.random() < 0.05) {
      h._socialClass = 'esclavo';
    } else {
      h._socialClass = h._socialClass || 'campesino';
    }
    // Class effects
    if (h._socialClass === 'noble') {
      h.knowledge = Math.min(99999, h.knowledge + 0.5 * yearsElapsed);
      h.social = Math.min(100, h.social + 2 * yearsElapsed);
    } else if (h._socialClass === 'comerciante') {
      h.inventory.food = Math.min(50, h.inventory.food + 1);
      h.wealth = (h.wealth || 0) + 2 * yearsElapsed;
    } else if (h._socialClass === 'esclavo') {
      h.hunger = Math.max(0, h.hunger - 3 * yearsElapsed);
      h.social = Math.max(0, h.social - 5 * yearsElapsed);
      h.aggression = Math.min(1, h.aggression + 0.01 * yearsElapsed);
    }
    // Revolution: if too many slaves, rebellion
    if (prevClass !== h._socialClass && h._socialClass === 'esclavo') {
      const slaves = [...civ.members].filter(id => { const m = _hById(id); return m && m._socialClass === 'esclavo'; }).length;
      if (slaves > civ.population * 0.4 && Math.random() < 0.1) {
        civ.honor = Math.max(0, civ.honor - 20);
        for (const id of civ.members) {
          const m = _hById(id);
          if (m && m._socialClass === 'esclavo') { m._socialClass = 'campesino'; m.aggression = Math.min(1, m.aggression + 0.2); }
        }
        addWorldEvent(`⚡ Revolución de esclavos en ${civ.name} — ${slaves} liberados, el orden social colapsa`);
        addChronicle('politics', `La Revolución de ${civ.name}`, `Los esclavos se levantaron. Nadie lo vio venir, aunque todos lo sabían. En una noche, el orden de siglos se derrumbó.`, '⚡');
      }
    }
  }
}

// ── 3. ENFERMEDADES ENDÉMICAS POR BIOMA ──────────────────────────────────────
const BIOME_DISEASES = {
  jungle:       { name: 'Malaria Selvática',   damage: 3, spread: 0.04, cure: 60 },
  rainforest:   { name: 'Fiebre Verde',        damage: 2, spread: 0.03, cure: 50 },
  tundra:       { name: 'Escorbuto Ártico',    damage: 2, spread: 0.02, cure: 40 },
  snow:         { name: 'Hipotermia Crónica',  damage: 3, spread: 0.02, cure: 45 },
  desert:       { name: 'Fiebre del Desierto', damage: 2, spread: 0.03, cure: 55 },
  swamp:        { name: 'Podredumbre Pantanosa', damage: 4, spread: 0.05, cure: 70 },
};
let _endemicTimer = 0;
function tickEndemicDiseases(yearsElapsed) {
  _endemicTimer += yearsElapsed;
  if (_endemicTimer < 20) return;
  _endemicTimer = 0;
  if (typeof _cachedAlive === 'undefined' || typeof getCell === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive || h.sick) continue;
    const cell = getCell(h.tx, h.ty);
    if (!cell) continue;
    const disease = BIOME_DISEASES[cell.biome];
    if (!disease) continue;
    if (h.immunity.has(disease.name)) continue;
    // Civs that have been in this biome long are more resistant
    const resistance = Math.min(0.9, (h.knowledge * 0.0001) + (h._biomeYears?.[cell.biome] || 0) * 0.01);
    if (Math.random() < disease.spread * 0.02 * yearsElapsed * (1 - resistance)) {
      h.sick = true;
      h.sickType = { name: disease.name, damage: disease.damage, spread: disease.spread, cure: disease.cure, duration: 8 };
      h.sickTimer = 8;
      if (Math.random() < 0.05) addWorldEvent(`🦟 ${h.name.split(' ')[0]} contrae ${disease.name} en ${cell.biome} — enfermedad endémica`);
    }
    // Track time in biome for adaptation
    if (!h._biomeYears) h._biomeYears = {};
    h._biomeYears[cell.biome] = (h._biomeYears[cell.biome] || 0) + yearsElapsed;
  }
}

// ── 4. CICLO DÍA/NOCHE ───────────────────────────────────────────────────────
// Usa tiempo real (ms) para que el ciclo sea visible a cualquier velocidad.
// phase: 0=medianoche, 0.25=amanecer, 0.5=mediodía, 0.75=atardecer
let _dayNightPhase = 0;
let _dayNightTimer = 0;
let _simDay = 0;          // día absoluto de simulación
let _simMonth = 0;        // 0-11
let _simDayOfMonth = 1;   // 1-30
let _dayNightLastMs = -1;
const DAY_REAL_MS = 20000; // 20 segundos de reloj real = 1 día completo
const DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;
function tickDayNight(yearsElapsed) {
  const now = performance.now();
  if (_dayNightLastMs < 0) _dayNightLastMs = now;
  const dtMs = now - _dayNightLastMs;
  _dayNightLastMs = now;
  const dayMs = (typeof window !== 'undefined' && window._dayRealMsOverride > 0) ? window._dayRealMsOverride : DAY_REAL_MS;
  const prevPhase = _dayNightPhase;
  _dayNightPhase = (_dayNightPhase + dtMs / dayMs) % 1;
  // Derive day/month from sim year (changes every sim-year = always moving)
  const simY = typeof year !== 'undefined' ? year : 0;
  _simDay = simY; // 1 sim-year = 1 sim-day for calendar purposes
  _simDayOfMonth = (_simDay % DAYS_PER_MONTH) + 1;
  _simMonth = Math.floor(_simDay / DAYS_PER_MONTH) % MONTHS_PER_YEAR;
  _dayNightTimer += yearsElapsed;
  if (_dayNightTimer < 5) return;
  _dayNightTimer = 0;
  const isNight = _dayNightPhase < 0.25 || _dayNightPhase > 0.75;
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive) continue;
    if (isNight) {
      // Night: energy recovers faster, productivity drops
      h.energy = Math.min(100, h.energy + 2 * yearsElapsed);
      // Black markets more active at night
      if (h._socialClass === 'comerciante' && Math.random() < 0.01) {
        h.inventory.food = Math.min(50, h.inventory.food + 2);
        h.wealth = (h.wealth || 0) + 1;
      }
    } else {
      // Day: slight productivity boost
      h.knowledge = Math.min(99999, h.knowledge + 0.05 * yearsElapsed);
    }
  }
  // Boost black markets at night
  if (isNight) {
    for (const bm of (typeof _blackMarkets !== 'undefined' ? _blackMarkets : [])) {
      const nearby = _spatialQuery(bm.tx, bm.ty, 8, -1);
      for (const h of nearby) {
        if (h.alive && h.civId === bm.civId) h.inventory.food = Math.min(50, h.inventory.food + 1);
      }
    }
  }
}
function getDayNightPhase() { return _dayNightPhase; }
function getSimDay()   { return _simDay; }
function getSimMonth() { return _simMonth; }
function getSimDayOfMonth() { return _simDayOfMonth; }
function isNightTime() { return _dayNightPhase < 0.25 || _dayNightPhase > 0.75; }

// ── 7. CONSTITUCIONES ────────────────────────────────────────────────────────
// Civs avanzadas escriben leyes. Líderes que las violan generan rebeliones.
const _constitutions = new Map(); // civId → {year, laws:[], violations}
let _constitutionTimer = 0;
const CONSTITUTION_LAWS = [
  { id: 'no_slavery',    text: 'Prohibición de esclavitud',   check: (civ) => [...civ.members].filter(id=>{const h=_hById(id);return h&&h._socialClass==='esclavo';}).length === 0 },
  { id: 'fair_food',     text: 'Derecho a la alimentación',   check: (civ) => { let hungry=0; for(const id of civ.members){const h=_hById(id);if(h&&h.alive&&h.hunger<20)hungry++;} return hungry < civ.population*0.2; } },
  { id: 'no_war_crime',  text: 'Prohibición de crímenes de guerra', check: (civ) => civ.honor > 30 },
  { id: 'free_trade',    text: 'Libertad de comercio',        check: (civ) => civ.tradePartners.size > 0 },
];
function tickConstitutions(yearsElapsed) {
  _constitutionTimer += yearsElapsed;
  if (_constitutionTimer < 50) return;
  _constitutionTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 10) continue;
    const avgK = civ.avgKnowledge || 0;
    if (avgK < 2000) continue;
    // Write constitution if none exists
    if (!_constitutions.has(civ.id)) {
      const laws = CONSTITUTION_LAWS.filter(() => Math.random() < 0.6).map(l => l.id);
      if (laws.length === 0) continue;
      _constitutions.set(civ.id, { year, laws, violations: 0 });
      const leader = civ.leaderId ? _hById(civ.leaderId) : null;
      addWorldEvent(`📜 ${leader?.name.split(' ')[0]||civ.name} promulga la Constitución de ${civ.name} — ${laws.length} leyes fundamentales`);
      addChronicle('politics', `La Constitución de ${civ.name}`, `Por primera vez, el poder tenía límites escritos. ${civ.name} se dotó de leyes que ningún líder podría ignorar sin consecuencias.`, '📜');
      continue;
    }
    // Check violations
    const constitution = _constitutions.get(civ.id);
    for (const lawId of constitution.laws) {
      const law = CONSTITUTION_LAWS.find(l => l.id === lawId);
      if (!law) continue;
      try {
        if (!law.check(civ)) {
          constitution.violations++;
          civ.honor = Math.max(0, civ.honor - 5);
          if (constitution.violations >= 3) {
            // Rebellion triggered
            constitution.violations = 0;
            for (const id of civ.members) {
              const h = _hById(id); if (h && h.alive) h.aggression = Math.min(1, h.aggression + 0.15);
            }
            const leader = civ.leaderId ? _hById(civ.leaderId) : null;
            addWorldEvent(`⚖️ ${civ.name} viola su Constitución (${law.text}) — rebelión popular contra ${leader?.name.split(' ')[0]||'el líder'}`);
          }
        } else if (constitution.violations > 0) {
          constitution.violations = Math.max(0, constitution.violations - 1);
        }
      } catch(e) {}
    }
  }
}

// ── 8. ELECCIONES ────────────────────────────────────────────────────────────
// En civs con constitución y honor alto, los líderes se eligen por voto
let _electionTimer = 0;
const _electionHistory = new Map(); // civId → [{winner, year, votes}]
function tickElections(yearsElapsed) {
  _electionTimer += yearsElapsed;
  if (_electionTimer < 80) return;
  _electionTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8 || !_constitutions.has(civ.id)) continue;
    if (civ.honor < 50) continue; // only democratic civs hold elections
    if (Math.random() > 0.15) continue;
    // Find top 2 candidates by leaderScore
    const candidates = [];
    for (const id of civ.members) {
      const h = _hById(id); if (h && h.alive) candidates.push(h);
    }
    candidates.sort((a, b) => b.leaderScore - a.leaderScore);
    if (candidates.length < 2) continue;
    const [cand1, cand2] = candidates;
    // Vote: each member votes for the candidate with higher leaderScore + random factor
    let votes1 = 0, votes2 = 0;
    for (const id of civ.members) {
      const h = _hById(id); if (!h || !h.alive) continue;
      const score1 = cand1.leaderScore + Math.random() * 20 + (civ.honor > 70 ? 5 : 0);
      const score2 = cand2.leaderScore + Math.random() * 20;
      if (score1 > score2) votes1++; else votes2++;
    }
    const winner = votes1 >= votes2 ? cand1 : cand2;
    const loser  = votes1 >= votes2 ? cand2 : cand1;
    const prevLeader = civ.leaderId ? _hById(civ.leaderId) : null;
    if (winner.id !== civ.leaderId) {
      if (prevLeader) prevLeader.isLeader = false;
      winner.isLeader = true;
      civ.leaderId = winner.id;
      civ.honor = Math.min(100, civ.honor + 10);
    }
    if (!_electionHistory.has(civ.id)) _electionHistory.set(civ.id, []);
    _electionHistory.get(civ.id).push({ winner: winner.name, year, votes: Math.max(votes1, votes2) });
    addWorldEvent(`🗳️ Elecciones en ${civ.name}: ${winner.name.split(' ')[0]} gana con ${Math.max(votes1,votes2)} votos sobre ${loser.name.split(' ')[0]}`);
  }
}

// ── 10. PARTIDOS POLÍTICOS ────────────────────────────────────────────────────
// En civs grandes, facciones compiten por el poder
const _parties = new Map(); // civId → [{name, ideology, members, power}]
let _partyTimer = 0;
const PARTY_NAMES_LEFT  = ['Frente Popular','Partido del Pueblo','Alianza Progresista','Movimiento Obrero'];
const PARTY_NAMES_RIGHT = ['Orden Nacional','Partido Imperial','Liga Conservadora','Frente Patriótico'];
const PARTY_NAMES_MID   = ['Centro Democrático','Unión Cívica','Partido Moderado','Coalición Nacional'];
function tickPoliticalParties(yearsElapsed) {
  _partyTimer += yearsElapsed;
  if (_partyTimer < 100) return;
  _partyTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 15) continue;
    if (_parties.has(civ.id)) {
      // Update party power based on member ideology
      const parties = _parties.get(civ.id);
      for (const party of parties) {
        party.members = 0;
        for (const id of civ.members) {
          const h = _hById(id);
          if (!h || !h.alive) continue;
          if (Math.abs(h.ideology - party.ideology) < 0.25) party.members++;
        }
        party.power = party.members / Math.max(1, civ.population);
      }
      // Dominant party influences leader
      const dominant = parties.reduce((a, b) => a.power > b.power ? a : b);
      if (dominant.power > 0.5 && Math.random() < 0.1) {
        addWorldEvent(`🏛️ ${dominant.name} domina la política de ${civ.name} con ${Math.round(dominant.power*100)}% de apoyo`);
      }
      // Coup attempt if a party has >60% and leader is from another party
      const leader = civ.leaderId ? _hById(civ.leaderId) : null;
      if (leader && dominant.power > 0.6 && Math.abs(leader.ideology - dominant.ideology) > 0.4 && Math.random() < 0.05) {
        // Find best candidate from dominant party
        let candidate = null, bestScore = 0;
        for (const id of civ.members) {
          const h = _hById(id);
          if (!h || !h.alive || h.id === civ.leaderId) continue;
          if (Math.abs(h.ideology - dominant.ideology) < 0.25 && h.leaderScore > bestScore) {
            bestScore = h.leaderScore; candidate = h;
          }
        }
        if (candidate) {
          leader.isLeader = false;
          candidate.isLeader = true;
          civ.leaderId = candidate.id;
          civ.honor = Math.max(0, civ.honor - 10);
          addWorldEvent(`🗡️ Golpe de estado en ${civ.name}: ${dominant.name} derroca a ${leader.name.split(' ')[0]} — ${candidate.name.split(' ')[0]} toma el poder`);
        }
      }
      continue;
    }
    if (Math.random() > 0.2) continue;
    // Create 2-3 parties
    const rnd = arr => arr[Math.floor(Math.random()*arr.length)];
    const newParties = [
      { name: rnd(PARTY_NAMES_LEFT),  ideology: 0.15 + Math.random()*0.2, members: 0, power: 0 },
      { name: rnd(PARTY_NAMES_RIGHT), ideology: 0.65 + Math.random()*0.2, members: 0, power: 0 },
      { name: rnd(PARTY_NAMES_MID),   ideology: 0.4  + Math.random()*0.2, members: 0, power: 0 },
    ];
    _parties.set(civ.id, newParties);
    addWorldEvent(`🏛️ Nacen los primeros partidos políticos en ${civ.name}: ${newParties.map(p=>p.name).join(', ')}`);
  }
}

// ── 11. ESTILOS ARQUITECTÓNICOS ───────────────────────────────────────────────
// Cada civ desarrolla un estilo visual propio; colonias lo heredan
const ARCH_STYLES = [
  { name: 'Clásico',    color: '#e8d5a3', accent: '#8b6914' },
  { name: 'Gótico',     color: '#c8c8d8', accent: '#4a4a6a' },
  { name: 'Oriental',   color: '#f0a060', accent: '#8b2020' },
  { name: 'Nórdico',    color: '#d0e8f0', accent: '#2060a0' },
  { name: 'Tropical',   color: '#90d090', accent: '#206020' },
  { name: 'Desértico',  color: '#f0d080', accent: '#a06020' },
  { name: 'Futurista',  color: '#a0c8f0', accent: '#0040a0' },
  { name: 'Industrial', color: '#b0b0b0', accent: '#404040' },
];
let _archTimer = 0;
function tickArchitecturalStyles(yearsElapsed) {
  _archTimer += yearsElapsed;
  if (_archTimer < 120) return;
  _archTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ._archStyle || civ.population < 5) continue;
    // Assign style based on biome of city center
    const cc = civ.cityCenter;
    if (!cc) continue;
    const cell = typeof getCell !== 'undefined' ? getCell(cc.tx, cc.ty) : null;
    let styleIdx = Math.floor(Math.random() * ARCH_STYLES.length);
    if (cell) {
      if (['desert','savanna','dry_grass'].includes(cell.biome)) styleIdx = 5;
      else if (['tundra','snow','taiga'].includes(cell.biome)) styleIdx = 3;
      else if (['jungle','rainforest'].includes(cell.biome)) styleIdx = 4;
      else if (civ.techLevel >= 4) styleIdx = 6;
      else if (civ.techLevel >= 3) styleIdx = 7;
    }
    civ._archStyle = ARCH_STYLES[styleIdx];
    addWorldEvent(`🏛️ ${civ.name} desarrolla el estilo arquitectónico ${civ._archStyle.name}`);
  }
}
function getCivArchStyle(civId) {
  const civ = civilizations.get(civId);
  return civ?._archStyle || null;
}

// ── 15. DEPORTES NACIONALES ───────────────────────────────────────────────────
// Cada civ tiene un deporte propio; torneos internacionales reemplazan guerras
const NATIONAL_SPORTS = [
  'Lucha de Toros','Arquería Real','Carrera de Caballos','Combate de Gladiadores',
  'Polo Real','Natación de Aguas Bravas','Lanzamiento de Jabalina','Carreras de Carros',
  'Torneo de Ajedrez','Cacería del Zorro','Regata Naval','Escalada de Montaña',
];
const _civSports = new Map(); // civId → sportName
let _sportsTimer = 0;
function tickNationalSports(yearsElapsed) {
  _sportsTimer += yearsElapsed;
  if (_sportsTimer < 90) return;
  _sportsTimer = 0;
  // Assign sports to civs that don't have one
  for (const [, civ] of civilizations) {
    if (!_civSports.has(civ.id) && civ.population >= 5) {
      const sport = NATIONAL_SPORTS[Math.floor(Math.random() * NATIONAL_SPORTS.length)];
      _civSports.set(civ.id, sport);
    }
  }
  // International tournament between allied civs
  const civList = [];
  for (const [, civ] of civilizations) { if (civ.population >= 8 && civ.allies.size > 0) civList.push(civ); }
  if (civList.length < 2) return;
  if (Math.random() > 0.15) return;
  const host = civList[Math.floor(Math.random() * civList.length)];
  const guests = [];
  for (const allyId of host.allies) {
    const ally = civilizations.get(allyId);
    if (ally && ally.population > 0) guests.push(ally);
  }
  if (guests.length === 0) return;
  const winner = Math.random() < 0.5 ? host : guests[Math.floor(Math.random() * guests.length)];
  const sport = _civSports.get(host.id) || 'Juegos';
  // Winner gets honor and social boost; all participants avoid war for a while
  winner.honor = Math.min(100, winner.honor + 15);
  for (const id of winner.members) { const h = _hById(id); if (h && h.alive) h.social = Math.min(100, h.social + 10); }
  // Reduce aggression between participants
  for (const guest of guests) {
    host.enemies.delete(guest.id); guest.enemies.delete(host.id);
    host.atWarWith.delete(guest.id); guest.atWarWith.delete(host.id);
  }
  const participants = [host, ...guests].map(c => c.name).join(', ');
  addWorldEvent(`🏆 Torneo Internacional de ${sport} en ${host.name} — participan ${participants}. Gana ${winner.name}!`);
  addChronicle('culture', `El Gran Torneo de ${sport}`, `Las armas se guardaron. Los atletas tomaron el campo. ${winner.name} se coronó campeón ante la mirada de naciones rivales. Por un momento, el mundo fue solo juego.`, '🏆');
}

// ── 16. BOLSA DE VALORES ──────────────────────────────────────────────────────
// Civs con internet hub tienen una bolsa; crashes económicos posibles
const _stockMarkets = new Map(); // civId → {index, history, crashCooldown}
let _stockTimer = 0;
function tickStockMarket(yearsElapsed) {
  _stockTimer += yearsElapsed;
  if (_stockTimer < 10) return;
  _stockTimer = 0;
  for (const [, civ] of civilizations) {
    if (!civ._hasInternetHub && !civ._hasTvStation) continue;
    if (!_stockMarkets.has(civ.id)) {
      _stockMarkets.set(civ.id, { index: 1000, history: [1000], crashCooldown: 0 });
      addWorldEvent(`📈 ${civ.name} abre su primera Bolsa de Valores — índice inicial: 1000`);
    }
    const market = _stockMarkets.get(civ.id);
    if (market.crashCooldown > 0) { market.crashCooldown -= yearsElapsed; }
    // Index fluctuates based on civ health
    const healthFactor = (civ.honor / 100) * 0.4 + (civ.population / 50) * 0.3 + (civ.tradePartners.size / 5) * 0.3;
    const change = (Math.random() - 0.48 + healthFactor * 0.05) * 50;
    market.index = Math.max(10, market.index + change);
    market.history.push(Math.round(market.index));
    if (market.history.length > 100) market.history.shift();
    // Crash: if index drops >40% from peak
    const peak = Math.max(...market.history);
    if (market.index < peak * 0.6 && market.crashCooldown <= 0) {
      market.crashCooldown = 100;
      // Economic damage
      for (const id of civ.members) {
        const h = _hById(id);
        if (!h || !h.alive) continue;
        h.wealth = Math.max(0, (h.wealth || 0) * 0.5);
        h.inventory.food = Math.max(0, h.inventory.food - 5);
      }
      civ.honor = Math.max(0, civ.honor - 15);
      addWorldEvent(`📉 CRASH BURSÁTIL en ${civ.name} — índice cae a ${Math.round(market.index)}, economía en crisis`);
      addChronicle('disaster', `El Gran Crash de ${civ.name}`, `En un solo día, fortunas enteras se evaporaron. El índice de la bolsa de ${civ.name} se desplomó. Las calles se llenaron de ciudadanos arruinados.`, '📉');
    }
    // Boom: if index rises >50% from start
    if (market.index > 2000 && Math.random() < 0.02) {
      addWorldEvent(`📈 Boom económico en ${civ.name} — índice alcanza ${Math.round(market.index)}, prosperidad histórica`);
    }
    // Apply wealth effect to members
    const wealthBoost = (market.index / 1000 - 1) * 0.5;
    for (const id of civ.members) {
      const h = _hById(id);
      if (h && h.alive) h.wealth = Math.max(0, (h.wealth || 0) + wealthBoost * yearsElapsed);
    }
  }
}
function getStockMarket(civId) { return _stockMarkets.get(civId) || null; }

// ── 17. DEUDA ENTRE NACIONES ──────────────────────────────────────────────────
// Civs pueden pedir préstamos a aliados; si no pagan pierden honor
const _debts = new Map(); // `${debtorId}-${creditorId}` → {amount, dueYear, paid}
let _debtTimer = 0;
function tickNationalDebt(yearsElapsed) {
  _debtTimer += yearsElapsed;
  if (_debtTimer < 60) return;
  _debtTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 5 || civ.allies.size === 0) continue;
    // Check if civ is in economic trouble (low food, low honor)
    let totalFood = 0;
    for (const id of civ.members) { const h = _hById(id); if (h && h.alive) totalFood += h.inventory.food; }
    const avgFood = totalFood / Math.max(1, civ.population);
    if (avgFood > 15 || Math.random() > 0.1) continue;
    // Ask richest ally for a loan
    let richestAlly = null, bestFood = 0;
    for (const allyId of civ.allies) {
      const ally = civilizations.get(allyId);
      if (!ally || ally.population === 0) continue;
      let allyFood = 0;
      for (const id of ally.members) { const h = _hById(id); if (h && h.alive) allyFood += h.inventory.food; }
      if (allyFood > bestFood) { bestFood = allyFood; richestAlly = ally; }
    }
    if (!richestAlly || bestFood < 30) continue;
    const debtKey = `${civ.id}-${richestAlly.id}`;
    if (_debts.has(debtKey)) continue;
    const loanAmount = Math.floor(bestFood * 0.3);
    // Transfer food
    let transferred = 0;
    for (const id of richestAlly.members) {
      const h = _hById(id); if (!h || !h.alive) continue;
      const give = Math.min(h.inventory.food, Math.ceil(loanAmount / Math.max(1, richestAlly.population)));
      h.inventory.food -= give; transferred += give;
    }
    for (const id of civ.members) {
      const h = _hById(id); if (!h || !h.alive) continue;
      h.inventory.food += Math.floor(transferred / Math.max(1, civ.population));
    }
    _debts.set(debtKey, { amount: transferred, dueYear: year + 50, paid: false });
    addWorldEvent(`💸 ${civ.name} pide préstamo de ${transferred} unidades de comida a ${richestAlly.name} — deuda a pagar en 50 años`);
  }
  // Check debt repayment
  for (const [key, debt] of _debts) {
    if (debt.paid) continue;
    const [debtorId, creditorId] = key.split('-').map(Number);
    const debtor = civilizations.get(debtorId);
    const creditor = civilizations.get(creditorId);
    if (!debtor || !creditor) { _debts.delete(key); continue; }
    if (year >= debt.dueYear) {
      // Try to repay
      let totalFood = 0;
      for (const id of debtor.members) { const h = _hById(id); if (h && h.alive) totalFood += h.inventory.food; }
      if (totalFood >= debt.amount) {
        // Repay
        let remaining = debt.amount;
        for (const id of debtor.members) {
          const h = _hById(id); if (!h || !h.alive || remaining <= 0) continue;
          const pay = Math.min(h.inventory.food, Math.ceil(debt.amount / Math.max(1, debtor.population)));
          h.inventory.food -= pay; remaining -= pay;
        }
        for (const id of creditor.members) {
          const h = _hById(id); if (!h || !h.alive) continue;
          h.inventory.food += Math.floor(debt.amount / Math.max(1, creditor.population));
        }
        debt.paid = true;
        debtor.honor = Math.min(100, debtor.honor + 5);
        addWorldEvent(`✅ ${debtor.name} salda su deuda con ${creditor.name} — ${debt.amount} unidades devueltas`);
      } else {
        // Default
        debtor.honor = Math.max(0, debtor.honor - 20);
        creditor.allies.delete(debtorId);
        debtor.allies.delete(creditorId);
        addWorldEvent(`❌ ${debtor.name} no puede pagar su deuda con ${creditor.name} — ruptura diplomática, honor cae 20 puntos`);
        _debts.delete(key);
      }
    }
  }
}

// ── 19. TURISMO INTERNACIONAL ─────────────────────────────────────────────────
// Civs con monumentos y buena reputación atraen visitantes de otras civs
let _intlTourismTimer = 0;
const _tourismRevenue = new Map(); // civId → totalVisitors
function tickInternationalTourism(yearsElapsed) {
  _intlTourismTimer += yearsElapsed;
  if (_intlTourismTimer < 35) return;
  _intlTourismTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 5 || civ.honor < 40) continue;
    // Count tourist attractions
    const attractions = structures.filter(s => s.civId === civ.id &&
      ['colosseum','cathedral','pyramid','ziggurat','lighthouse','amphitheater','stadium','great_wall','palace'].includes(s.type));
    if (attractions.length === 0) continue;
    // Find visitors from other civs
    let visitors = 0;
    for (const [, other] of civilizations) {
      if (other.id === civ.id || other.population === 0) continue;
      if (civ.enemies.has(other.id)) continue;
      const chance = (attractions.length * 0.05 + civ.honor * 0.002) * yearsElapsed;
      if (Math.random() < chance) {
        // Send a visitor
        for (const id of other.members) {
          const h = _hById(id);
          if (!h || !h.alive || h._isVisiting) continue;
          h._isVisiting = civ.id;
          h._visitTimer = 20 + Math.floor(Math.random() * 30);
          visitors++;
          // Visitor gains knowledge, host civ gains food/wealth
          h.knowledge = Math.min(99999, h.knowledge + attractions.length * 20);
          for (const id2 of civ.members) {
            const m = _hById(id2); if (m && m.alive) m.inventory.food = Math.min(50, m.inventory.food + 1);
          }
          break;
        }
      }
    }
    if (visitors > 0) {
      _tourismRevenue.set(civ.id, (_tourismRevenue.get(civ.id) || 0) + visitors);
      if (Math.random() < 0.1) addWorldEvent(`🗺️ ${visitors} visitantes llegan a ${civ.name} atraídos por sus ${attractions.length} monumentos`);
    }
  }
  // Return visitors home after timer
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h._isVisiting) continue;
    h._visitTimer = (h._visitTimer || 0) - yearsElapsed;
    if (h._visitTimer <= 0) {
      h._isVisiting = null;
      // Return to own civ city center
      const civ = h.civId ? civilizations.get(h.civId) : null;
      if (civ?.cityCenter) {
        h.tx = civ.cityCenter.tx + Math.floor(Math.random()*6-3);
        h.ty = civ.cityCenter.ty + Math.floor(Math.random()*6-3);
      }
    }
  }
}

// ── 20. SINDICATOS Y HUELGAS ──────────────────────────────────────────────────
// En civs industriales, trabajadores con baja comida se organizan
const _strikes = new Map(); // civId → {active, yearsLeft, demands}
let _strikeTimer = 0;
function tickUnionsAndStrikes(yearsElapsed) {
  _strikeTimer += yearsElapsed;
  if (_strikeTimer < 45) return;
  _strikeTimer = 0;
  for (const [, civ] of civilizations) {
    if (civ.population < 8) continue;
    const hasFactory = structures.some(s => s.civId === civ.id && (s.type === 'factory' || s.type === 'powerplant'));
    if (!hasFactory) continue;
    // Check worker conditions
    let hungryWorkers = 0;
    for (const id of civ.members) {
      const h = _hById(id);
      if (h && h.alive && h.hunger < 30 && h._socialClass !== 'noble') hungryWorkers++;
    }
    const strikeActive = _strikes.get(civ.id);
    if (strikeActive && strikeActive.active) {
      strikeActive.yearsLeft -= yearsElapsed;
      // During strike: factories produce nothing, workers gain social
      for (const id of civ.members) {
        const h = _hById(id);
        if (!h || !h.alive || h._socialClass === 'noble') continue;
        h.social = Math.min(100, h.social + 5 * yearsElapsed);
      }
      if (strikeActive.yearsLeft <= 0) {
        // Strike ends — leader must improve conditions
        strikeActive.active = false;
        civ.honor = Math.min(100, civ.honor + 10);
        for (const id of civ.members) {
          const h = _hById(id); if (h && h.alive) h.inventory.food = Math.min(50, h.inventory.food + 8);
        }
        const leader = civ.leaderId ? _hById(civ.leaderId) : null;
        addWorldEvent(`✊ Huelga en ${civ.name} termina — ${leader?.name.split(' ')[0]||'el gobierno'} cede a las demandas obreras`);
      }
      continue;
    }
    if (hungryWorkers > civ.population * 0.35 && Math.random() < 0.2) {
      _strikes.set(civ.id, { active: true, yearsLeft: 15 + Math.floor(Math.random()*20), demands: 'mejores condiciones' });
      const leader = civ.leaderId ? _hById(civ.leaderId) : null;
      addWorldEvent(`✊ Huelga general en ${civ.name}: ${hungryWorkers} trabajadores paran — ${leader?.name.split(' ')[0]||'el gobierno'} bajo presión`);
      addChronicle('politics', `La Gran Huelga de ${civ.name}`, `Las fábricas enmudecieron. Los trabajadores de ${civ.name} dijeron basta. ${hungryWorkers} personas cruzaron los brazos y esperaron.`, '✊');
    }
  }
}

// ── 22. RECURSOS AGOTABLES ────────────────────────────────────────────────────
// Las minas se vacían con el tiempo; civs deben expandirse o comerciar
let _depletionTimer = 0;
function tickResourceDepletion(yearsElapsed) {
  _depletionTimer += yearsElapsed;
  if (_depletionTimer < 30) return;
  _depletionTimer = 0;
  if (typeof resourceGrid === 'undefined') return;
  // Mines and deep mines accelerate depletion of nearby stone/ore resources
  for (const s of structures) {
    if (!['mine','mining_complex','drill_rig','excavator'].includes(s.type)) continue;
    const r = s.type === 'mining_complex' ? 8 : 5;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx*dx+dy*dy > r*r) continue;
      const tx = s.tx+dx, ty = s.ty+dy;
      if (tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) continue;
      const res = resourceGrid[ty]?.[tx];
      if (!res || !['rock','iron_ore','gold_ore','coal','clay'].includes(res.type)) continue;
      res.amount = Math.max(0, res.amount - 0.5 * yearsElapsed);
      if (res.amount <= 0) {
        resourceGrid[ty][tx] = null;
        if (Math.random() < 0.05) {
          const civ = s.civId ? civilizations.get(s.civId) : null;
          addWorldEvent(`⛏️ Yacimiento agotado cerca de ${civ?.name||'?'} — la mina queda vacía`);
        }
      }
    }
  }
}

// ── 23. CONTAMINACIÓN VISIBLE ─────────────────────────────────────────────────
// Fábricas y centrales nucleares contaminan tiles; reduce comida y salud
const _pollutionGrid = new Map(); // `${tx},${ty}` → level 0..100
let _visiblePollutionTimer = 0;
function tickVisiblePollution(yearsElapsed) {
  _visiblePollutionTimer += yearsElapsed;
  if (_visiblePollutionTimer < 15) return;
  _visiblePollutionTimer = 0;
  // Spread pollution from factories/powerplants/nuclear
  for (const s of structures) {
    if (!['factory','powerplant','nuclear_silo','ore_processor'].includes(s.type)) continue;
    const rate = s.type === 'nuclear_silo' ? 8 : s.type === 'powerplant' ? 4 : 2;
    const r = s.type === 'nuclear_silo' ? 15 : 8;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx*dx+dy*dy > r*r) continue;
      const tx = s.tx+dx, ty = s.ty+dy;
      if (tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) continue;
      const key = `${tx},${ty}`;
      const cur = _pollutionGrid.get(key) || 0;
      _pollutionGrid.set(key, Math.min(100, cur + rate * yearsElapsed * 0.1));
    }
  }
  // Natural dissipation
  for (const [key, level] of _pollutionGrid) {
    const newLevel = level - 0.5 * yearsElapsed;
    if (newLevel <= 0) _pollutionGrid.delete(key);
    else _pollutionGrid.set(key, newLevel);
  }
  // Effect on humans
  if (typeof _cachedAlive === 'undefined') return;
  for (const h of _cachedAlive) {
    if (!h.alive) continue;
    const key = `${h.tx},${h.ty}`;
    const pollution = _pollutionGrid.get(key) || 0;
    if (pollution > 30) {
      h.health = Math.max(0, h.health - pollution * 0.01 * yearsElapsed);
      if (pollution > 60 && Math.random() < 0.01) {
        h.sick = true;
        h.sickType = { name: 'Envenenamiento Industrial', damage: 3, spread: 0, cure: 80, duration: 10 };
        h.sickTimer = 10;
      }
    }
    // Cleanup: neural_hub civs can reduce pollution
    const civ = h.civId ? civilizations.get(h.civId) : null;
    if (civ && civ._hasInternetHub && pollution > 20 && Math.random() < 0.001) {
      _pollutionGrid.set(key, Math.max(0, pollution - 5));
    }
  }
  // Alert when pollution is very high
  for (const [, civ] of civilizations) {
    if (!civ.cityCenter) continue;
    const key = `${civ.cityCenter.tx},${civ.cityCenter.ty}`;
    const pollution = _pollutionGrid.get(key) || 0;
    if (pollution > 70 && Math.random() < 0.02) {
      addWorldEvent(`☠️ Contaminación crítica en ${civ.name} — nivel ${Math.round(pollution)}%, salud de la población en riesgo`);
    }
  }
}
function getPollutionAt(tx, ty) { return _pollutionGrid.get(`${tx},${ty}`) || 0; }

// ── Wire Tanda 5 into tickNewFeatures ────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// TANDA 6 — CRONISTA, TERRAFORMACIÓN, SUEÑOS
// ══════════════════════════════════════════════════════════════════════════════

// ── CRONISTA ──────────────────────────────────────────────────────────────────
// Un humano especial que narra lo que presencia. Su crónica personal aparece
// en noticias. Cuando muere, su libro queda como reliquia.
let _chronicler = null; // human id
let _chroniclerTimer = 0;
let _chroniclerLog = []; // {year, text}
const _CHRONICLER_PHRASES = [
  h => `${h.name.split(' ')[0]} observa desde la colina: el mundo cambia más rápido de lo que puede escribir.`,
  h => `En el diario de ${h.name.split(' ')[0]}: "Hoy vi arder tres aldeas. Mañana quizás sea la mía."`,
  h => `${h.name.split(' ')[0]} escribe: "La gente ya no recuerda cómo era antes. Yo sí."`,
  h => `Las memorias de ${h.name.split(' ')[0]}: "Nací en guerra. Viví en paz. Moriré en guerra otra vez."`,
  h => `${h.name.split(' ')[0]} anota: "El líder prometió prosperidad. El granero está vacío."`,
  h => `Crónica de ${h.name.split(' ')[0]}: "Vi nacer una ciudad donde antes había bosque. El progreso tiene un precio."`,
  h => `${h.name.split(' ')[0]} registra: "Hoy murió el último que conocía el idioma antiguo."`,
  h => `En las páginas de ${h.name.split(' ')[0]}: "Los jóvenes ya no temen a los dioses. Temen a las máquinas."`,
];

function _addNewsHeadline(text, icon, civName, type) {
  _mediaHeadlines.unshift({ year, text, icon, civName: civName || 'Mundo', type: type || 'event', mediaLevel: Math.max(1, _getMediaLevel()) });
  if (_mediaHeadlines.length > 50) _mediaHeadlines.length = 50;
}

function tickChronicler(yearsElapsed) {
  _chroniclerTimer += yearsElapsed;
  if (_chroniclerTimer < 30) return;
  _chroniclerTimer = 0;
  if (typeof _cachedAlive === 'undefined' || _cachedAlive.length === 0) return;

  // Find or assign chronicler
  if (_chronicler !== null) {
    const h = _hById(_chronicler);
    if (!h || !h.alive) {
      // Chronicler died — publish obituary
      if (h) {
        const obit = `📖 El cronista ${h.name} ha muerto. Su libro, "${h._chronicleTitle || 'Memorias del Mundo'}", queda como reliquia de ${_chroniclerLog.length} entradas.`;
        addMajorEvent(obit);
        _addNewsHeadline(obit, '📖', h._civName || 'Mundo', 'chronicler');
      }
      _chronicler = null;
      _chroniclerLog = [];
    }
  }

  if (_chronicler === null) {
    // Pick a new chronicler — prefer high knowledge, not a soldier
    const candidates = _cachedAlive.filter(h => h.knowledge > 200 && !h.isSoldier && h.age > 10);
    if (candidates.length === 0) return;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    _chronicler = chosen.id;
    chosen._isChronicler = true;
    const titles = ['Memorias del Mundo', 'Crónica de los Tiempos', 'El Gran Libro', 'Anales de la Humanidad', 'Lo Que Vi'];
    chosen._chronicleTitle = titles[Math.floor(Math.random() * titles.length)];
    chosen._civName = civilizations.get(chosen.civId)?.name || 'Mundo';
    const announce = `✍️ ${chosen.name} fue designado cronista — comenzó a escribir "${chosen._chronicleTitle}"`;
    addMajorEvent(announce);
    _addNewsHeadline(announce, '✍️', chosen._civName, 'chronicler');
    return;
  }

  // Chronicler writes an entry
  const h = _hById(_chronicler);
  if (!h || !h.alive) return;
  const phrase = _CHRONICLER_PHRASES[Math.floor(Math.random() * _CHRONICLER_PHRASES.length)](h);
  _chroniclerLog.push({ year, text: phrase });
  if (_chroniclerLog.length > 40) _chroniclerLog.shift();
  _addNewsHeadline(`✍️ ${phrase}`, '✍️', h._civName || civilizations.get(h.civId)?.name || 'Mundo', 'chronicler');
}

function getChroniclerLog() { return _chroniclerLog; }
function getChronilcerId() { return _chronicler; }

// ── TERRAFORMACIÓN INVERSA ────────────────────────────────────────────────────
// Civs muy avanzadas pueden convertir desiertos en praderas y secar zonas.
// El mapa cambia permanentemente.
let _terraformTimer = 0;
const _terraformedTiles = new Set(); // "tx,ty" keys

function tickTerraforming(yearsElapsed) {
  _terraformTimer += yearsElapsed;
  if (_terraformTimer < 200) return;
  _terraformTimer = 0;
  if (typeof civilizations === 'undefined' || typeof getCell === 'undefined') return;

  for (const [, civ] of civilizations) {
    if (civ.population < 5) continue;
    // Need high knowledge to terraform
    const avgK = civ.knowledge || 0;
    if (avgK < 15000) continue;

    // Find a desert/tundra tile near this civ's members
    const members = [...civ.members].map(id => _hById(id)).filter(h => h && h.alive);
    if (members.length === 0) continue;
    const ref = members[Math.floor(Math.random() * members.length)];

    // Scan nearby tiles for terraformable terrain
    const radius = 20;
    let changed = false;
    for (let dy = -radius; dy <= radius && !changed; dy++) {
      for (let dx = -radius; dx <= radius && !changed; dx++) {
        const tx = ref.tx + dx, ty = ref.ty + dy;
        if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
        const key = `${tx},${ty}`;
        if (_terraformedTiles.has(key)) continue;
        const cell = getCell(tx, ty);
        if (!cell) continue;
        // Convert desert/tundra → grassland
        if (cell.biome === 'desert' || cell.biome === 'tundra' || cell.biome === 'dry_grass') {
          cell.biome = 'grass';
          cell.fertility = Math.max(cell.fertility || 0, 0.6);
          _terraformedTiles.add(key);
          changed = true;
          const msg = `🌱 ${civ.name} terraformó una zona árida — el desierto se convierte en pradera (${tx},${ty})`;
          addMajorEvent(msg);
          _addNewsHeadline(msg, '🌱', civ.name, 'terraform');
          // Rebuild terrain canvas
          if (typeof buildResourceCanvas !== 'undefined') buildResourceCanvas();
        }
      }
    }
  }
}

function getTerraformedCount() { return _terraformedTiles.size; }

// ── HUMANOS QUE SUEÑAN ────────────────────────────────────────────────────────
// Durante la noche, algunos humanos tienen sueños que generan inventos aleatorios,
// cambian de civ, o pierden/ganan conocimiento.
let _dreamTimer = 0;
const _DREAM_INVENTIONS = [
  { name: 'Rueda de Agua', knowledge: 300, msg: h => `💧 ${h.name.split(' ')[0]} soñó con una rueda de agua — inventó irrigación avanzada` },
  { name: 'Arco Compuesto', knowledge: 200, msg: h => `🏹 ${h.name.split(' ')[0]} soñó con un arco perfecto — su civ gana ventaja militar` },
  { name: 'Escritura Fonética', knowledge: 500, msg: h => `📝 ${h.name.split(' ')[0]} soñó con símbolos — inventó un sistema de escritura` },
  { name: 'Medicina Herbal', knowledge: 250, msg: h => `🌿 ${h.name.split(' ')[0]} soñó con plantas que curan — descubrió medicina herbal` },
  { name: 'Navegación Estelar', knowledge: 400, msg: h => `⭐ ${h.name.split(' ')[0]} soñó con las estrellas — aprendió a navegar de noche` },
  { name: 'Metalurgia', knowledge: 600, msg: h => `⚒️ ${h.name.split(' ')[0]} soñó con fuego y metal — descubrió la metalurgia` },
  { name: 'Filosofía', knowledge: 800, msg: h => `🧠 ${h.name.split(' ')[0]} soñó con el cosmos — fundó una escuela de pensamiento` },
];
const _DREAM_NIGHTMARES = [
  h => `😱 ${h.name.split(' ')[0]} tuvo una pesadilla — despertó aterrorizado y huyó de su aldea`,
  h => `🌑 ${h.name.split(' ')[0]} soñó con el fin del mundo — pasó días sin trabajar, paralizado por el miedo`,
  h => `👁️ ${h.name.split(' ')[0]} soñó que su líder lo traicionaba — sembró desconfianza en la civ`,
];

function tickDreams(yearsElapsed) {
  if (typeof isNightTime === 'undefined' || !isNightTime()) return;
  _dreamTimer += yearsElapsed;
  if (_dreamTimer < 15) return;
  _dreamTimer = 0;
  if (typeof _cachedAlive === 'undefined' || _cachedAlive.length === 0) return;

  // Only a few humans dream each night
  const dreamCount = Math.max(1, Math.floor(_cachedAlive.length * 0.02));
  for (let i = 0; i < dreamCount; i++) {
    const h = _cachedAlive[Math.floor(Math.random() * _cachedAlive.length)];
    if (!h || !h.alive) continue;
    const roll = Math.random();

    if (roll < 0.5) {
      // Positive dream — invention
      const inv = _DREAM_INVENTIONS[Math.floor(Math.random() * _DREAM_INVENTIONS.length)];
      h.knowledge = Math.min(99999, h.knowledge + inv.knowledge);
      // Share with nearby humans
      const near = _spatialQuery(h.tx, h.ty, 8, h.id);
      for (const n of near) {
        if (n.alive && n.civId === h.civId) n.knowledge = Math.min(99999, n.knowledge + Math.floor(inv.knowledge * 0.3));
      }
      const msg = inv.msg(h);
      addWorldEvent(msg);
      _addNewsHeadline(msg, '💤', civilizations.get(h.civId)?.name || 'Mundo', 'dream');
    } else if (roll < 0.75) {
      // Nightmare
      const nightmare = _DREAM_NIGHTMARES[Math.floor(Math.random() * _DREAM_NIGHTMARES.length)](h);
      h.energy = Math.max(0, h.energy - 30);
      h.health = Math.max(10, h.health - 10);
      addWorldEvent(nightmare);
      _addNewsHeadline(nightmare, '😱', civilizations.get(h.civId)?.name || 'Mundo', 'dream');
    } else {
      // Prophetic dream — human changes civ or gains massive knowledge
      if (Math.random() < 0.3 && civilizations.size > 1) {
        // Defect to another civ
        const civList = [...civilizations.values()].filter(c => c.id !== h.civId && c.population > 0);
        if (civList.length > 0) {
          const newCiv = civList[Math.floor(Math.random() * civList.length)];
          const oldCivName = civilizations.get(h.civId)?.name || '?';
          const oldCiv = civilizations.get(h.civId);
          if (oldCiv) oldCiv.members.delete(h.id);
          h.civId = newCiv.id;
          newCiv.members.add(h.id);
          const msg = `🌀 ${h.name.split(' ')[0]} soñó con otra vida — desertó de ${oldCivName} y se unió a ${newCiv.name}`;
          addWorldEvent(msg);
          _addNewsHeadline(msg, '🌀', newCiv.name, 'dream');
        }
      } else {
        h.knowledge = Math.min(99999, h.knowledge * 1.5);
        const msg = `✨ ${h.name.split(' ')[0]} tuvo una visión profética — su conocimiento se multiplicó de golpe`;
        addWorldEvent(msg);
        _addNewsHeadline(msg, '✨', civilizations.get(h.civId)?.name || 'Mundo', 'dream');
      }
    }
  }
}

// ── BATALLAS DE COLISEO ───────────────────────────────────────────────────────
// Civs con coliseo o estadio organizan combates de gladiadores visibles en tiempo real.
// window._colosseumBattle se usa por el renderer para dibujar la pelea en vivo.
let _colosseumBattleTimer = 0;
let _colosseumBattleState = null; // {structureTx, structureTy, nameA, nameB, hpA, hpB, timer, civName, resolved}

window._colosseumBattle = null;

function tickColosseumBattles(yearsElapsed) {
  _colosseumBattleTimer += yearsElapsed;

  // Tick active battle
  if (_colosseumBattleState) {
    _colosseumBattleState.timer -= yearsElapsed;
    // Simulate HP drain
    _colosseumBattleState.hpA = Math.max(0, _colosseumBattleState.hpA - yearsElapsed * (8 + Math.random() * 6));
    _colosseumBattleState.hpB = Math.max(0, _colosseumBattleState.hpB - yearsElapsed * (8 + Math.random() * 6));
    // Update global for renderer
    window._colosseumBattle = _colosseumBattleState;

    // Resolve when timer runs out or one fighter is down
    if (_colosseumBattleState.timer <= 0 || _colosseumBattleState.hpA <= 0 || _colosseumBattleState.hpB <= 0) {
      const b = _colosseumBattleState;
      const winner = b.hpA > b.hpB ? b.nameA : b.nameB;
      const loser  = b.hpA > b.hpB ? b.nameB : b.nameA;
      const msg = `🏟️ ¡${winner} venció a ${loser} en el coliseo de ${b.civName}! La multitud enloquece.`;
      addMajorEvent(msg);
      if (typeof _addNewsHeadline !== 'undefined') _addNewsHeadline(msg, '🏟️', b.civName, 'battle');
      // Boost civ honor
      const civ = [...civilizations.values()].find(c => c.name === b.civName);
      if (civ) civ.honor = Math.min(100, civ.honor + 8);
      _colosseumBattleState = null;
      window._colosseumBattle = null;
    }
    return;
  }

  if (_colosseumBattleTimer < 60) return;
  _colosseumBattleTimer = 0;

  // Find a civ with a colosseum or stadium
  for (const [, civ] of civilizations) {
    if (civ.population < 4) continue;
    const arena = structures.find(s => s.civId === civ.id && (s.type === 'colosseum' || s.type === 'stadium'));
    if (!arena) continue;
    if (Math.random() > 0.35) continue;

    // Pick 2 fighters from the civ
    const members = [...civ.members].map(id => _hById(id)).filter(h => h && h.alive);
    if (members.length < 2) continue;

    // Prefer soldiers or high-knowledge humans
    members.sort((a, b) => (b.kills + b.knowledge * 0.01) - (a.kills + a.knowledge * 0.01));
    const fighterA = members[0];
    const fighterB = members[Math.min(1 + Math.floor(Math.random() * Math.min(4, members.length - 1)), members.length - 1)];
    if (!fighterA || !fighterB || fighterA.id === fighterB.id) continue;

    const nameA = fighterA.name.split(' ')[0];
    const nameB = fighterB.name.split(' ')[0];

    _colosseumBattleState = {
      structureTx: arena.tx,
      structureTy: arena.ty,
      nameA,
      nameB,
      hpA: 80 + Math.random() * 40,
      hpB: 80 + Math.random() * 40,
      timer: 25 + Math.random() * 20, // battle lasts 25-45 years
      civName: civ.name,
      resolved: false,
    };
    window._colosseumBattle = _colosseumBattleState;

    const announce = `🏟️ ¡BATALLA en el coliseo de ${civ.name}! ${nameA} vs ${nameB} — el pueblo llena las gradas`;
    addWorldEvent(announce);
    if (typeof _addNewsHeadline !== 'undefined') _addNewsHeadline(announce, '🏟️', civ.name, 'battle');
    break; // one battle at a time
  }
}
