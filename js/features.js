// ═══════════════════════════════════════════════════════════════════════════════
// FEATURES.JS — 15 nuevas mecánicas de profundidad para la simulación
// ═══════════════════════════════════════════════════════════════════════════════

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
  if (typeof _season === 'undefined' || typeof _cachedAlive === 'undefined') return;
  _seasonalEpidemicTimer += yearsElapsed;
  if (_seasonalEpidemicTimer < 8) return;
  _seasonalEpidemicTimer = 0;
  // Invierno (_season===3): alta probabilidad de brote
  if (_season === 3 && _cachedAlive.length > 10 && Math.random() < 0.35) {
    if(activeOutbreaks.length < 12){ // cap outbreaks
    const host = _cachedAlive[Math.floor(Math.random() * _cachedAlive.length)];
    const coldDiseases = DISEASE_TYPES.filter(d => ['Fiebre','Tifus','Pestilencia'].includes(d.name));
    const dtype = coldDiseases[Math.floor(Math.random() * coldDiseases.length)];
    activeOutbreaks.push({ type: dtype, tx: host.tx, ty: host.ty, radius: 6 + Math.floor(Math.random() * 5), yearsLeft: dtype.duration });
    addWorldEvent(`❄️🦠 Epidemia invernal de ${dtype.name} — el frío debilita a la población`);
    }
  }
  // Verano (_season===1): brotes de cólera/malaria en zonas húmedas
  if (_season === 1 && _cachedAlive.length > 15 && Math.random() < 0.18) {
    if(activeOutbreaks.length < 12){ // cap outbreaks
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
      h.health = Math.max(0, h.health - Math.floor((1 - d / radius) * 40));
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
  _locustTimer += yearsElapsed;
  if (_locustTimer < 30) return;
  _locustTimer = 0;
  if (typeof _season === 'undefined' || _season !== 1) return; // solo en verano
  if (Math.random() > 0.15) return;
  if (typeof structureGrid === 'undefined' || !structureGrid) return;
  const rng = mulberry32(WORLD_SEED ^ year ^ 0xA0CC);
  const epicTx = Math.floor(rng() * WORLD_W);
  const epicTy = Math.floor(rng() * WORLD_H);
  const radius = 15 + Math.floor(rng() * 15);
  let destroyed = 0;
  for (let i = structures.length - 1; i >= 0; i--) {
    const s = structures[i];
    if (s.type !== 'farm' && s.type !== 'granary') continue;
    if (Math.hypot(s.tx - epicTx, s.ty - epicTy) > radius) continue;
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
  if (_bigGameAnimals.length < 5 && Math.random() < 0.4) {
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
      { msg: 'una nueva ruta comercial', effect: (h) => { h.knowledge += 200 * _intelModifier; civ.honor += 8; } },
      { msg: 'un yacimiento de minerales', effect: (h) => { h.inventory.stone += 20; h.knowledge += 100 * _intelModifier; } },
      { msg: 'plantas medicinales desconocidas', effect: (h) => { h.health = 100; h.knowledge += 150 * _intelModifier; for (const id of civ.members) { const m = _hById(id); if (m && m.alive) m.health = Math.min(100, m.health + 15); } } },
      { msg: 'ruinas de una civilización antigua', effect: (h) => { h.knowledge += 500 * _intelModifier; addMajorEvent(`🏚 ${h.name.split(' ')[0]} descubrió ruinas antiguas — el pasado revela sus secretos`); } },
      { msg: 'un paso de montaña desconocido', effect: (h) => { h.tilesPerYear = Math.min(h.tilesPerYear + 5, 80); h.knowledge += 80 * _intelModifier; } },
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

function tickAllFeatures(yearsElapsed) {
  // Always run core features every tick
  _tickCoreFeatues(yearsElapsed);
  tickKnowledgeInheritance(yearsElapsed);
  tickGlobalPandemic(yearsElapsed);
  tickFamine(yearsElapsed);
  tickGlobalClimate(yearsElapsed);
  tickSurvivalInstinct(yearsElapsed);

  // Rotate through medium-frequency features (every 2 ticks)
  _featureTickIdx = (_featureTickIdx + 1) % 3;

  if(_featureTickIdx === 0){
    tickTradeRoutes(yearsElapsed);
    tickDynasticLegacy(yearsElapsed);
    tickEspionage(yearsElapsed);
    tickVolcanicEruptions(yearsElapsed);
    tickEliteExodus(yearsElapsed);
    tickGlaciation(yearsElapsed);
    tickMilitaryAlliances(yearsElapsed);
  } else if(_featureTickIdx === 1){
    tickDiseaseMutation(yearsElapsed);
    tickPiracy(yearsElapsed);
    tickBattlefieldLegacy(yearsElapsed);
    tickDarkAgeRenaissance(yearsElapsed);
    tickSecretCults(yearsElapsed);
    tickRatPlague(yearsElapsed);
    tickTechCollapse(yearsElapsed);
  } else {
    tickAstronomyEvents(yearsElapsed);
    tickPrisonerExchange(yearsElapsed);
    tickCyberpunkFeatures(yearsElapsed);
    tickWorldWonders(yearsElapsed);
    tickIrrigation(yearsElapsed);
    tickLegendaryHeroes(yearsElapsed);
    tickTsunamis(yearsElapsed);
    tickForcedNomadism(yearsElapsed);
  }

  // Siempre activos — no dependen de velocidad
  tickAIPlague(yearsElapsed);
  tickGridCities(yearsElapsed);
  tickAdvancedDiplomacy(yearsElapsed);
  tickTourism(yearsElapsed);
  tickGlobalization(yearsElapsed);
  tickCivDiversity(yearsElapsed);
  tickRandomChronicles(yearsElapsed);
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
    const bonus = 8 + Math.floor(Math.random() * 10);
    for (const id of ca.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + bonus * _intelModifier * 0.3); }
    for (const id of cb.members) { const h = _hById(id); if (h && h.alive) h.knowledge = Math.min(99999, h.knowledge + bonus * _intelModifier * 0.3); }
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
    heir.knowledge = Math.min(99999, heir.knowledge + bonus * 10 * _intelModifier);
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
        for (const id of targetCiv.members) { const h = _hById(id); if (h && h.alive) { const take = Math.floor(h.knowledge * 0.05); h.knowledge -= take; stolen += take; } }
        const share = Math.floor(stolen / Math.max(1, spyCiv ? spyCiv.population : 1));
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
    if (!inFamine && foodPerCapita < 0.15 && civ.population > 8) {
      const severity = Math.min(3, Math.floor(1 + (0.15 - foodPerCapita) * 20));
      _famineState.set(civ.id, { yearsLeft: 30 + severity * 20, severity });
      addMajorEvent(`🍂 ¡HAMBRUNA en ${civ.name}! Severidad ${severity}/3 — ${civ.population} bocas, solo ${foodStructures} fuentes de comida`);
      addChronicle('famine',`Hambruna en ${civ.name}`,`Con ${civ.population} bocas que alimentar y apenas ${foodStructures} fuentes de comida, ${civ.name} entró en una espiral de desesperación. Los más débiles cayeron primero. Los demás miraron al horizonte buscando salvación.`,'🍂');
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
      h.hunger = Math.max(0, h.hunger - famine.severity * 8);
      h.health = Math.max(0, h.health - famine.severity * 3);
      if (h.health <= 0) { h._die('hambruna'); deaths++; continue; }
      // Migración: los más débiles huyen a otras tierras
      if (h.hunger < 20 && !h.isLeader && Math.random() < 0.15) {
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
      h.health = Math.max(0, h.health - yearsElapsed * count * 0.5);
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
    mortality: 2 + Math.random() * 4,
    spread: 0.3 + Math.random() * 0.4,
  };
  _activePandemics.push(pandemic);
  addMajorEvent(`☠️ ¡PANDEMIA! "${name}" surge en ${originCiv.name} — la enfermedad comienza a propagarse`);
  addChronicle('plague', `Nace la pandemia "${name}"`, `Nadie supo de dónde vino. Primero fueron unos pocos enfermos, luego docenas, luego cientos. "${name}" se extendió por las rutas comerciales como veneno en el agua. El mundo contuvo la respiración.`, '☠️');
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
            h.knowledge = Math.max(10, Math.floor(h.knowledge * 0.4));
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
const BATTLE_PREFIXES = ['Batalla de','Masacre de','Asedio de','Combate de','Carnicería de'];
const BATTLE_PLACES = ['las Llanuras','el Valle','la Colina','el Río','los Bosques','la Costa','las Ruinas','el Paso','la Fortaleza'];
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
    const casualties = zone.count;
    const knowledgeBonus = 30 + casualties * 5;
    _battlefields.push({ tx: zone.tx, ty: zone.ty, name: battleName, year, civA: civA?.name || '?', civB: civB?.name || '?', casualties, knowledgeBonus });
    addMajorEvent(`⚔️ La ${battleName} quedará en la historia — ${casualties} combatientes, ${civA?.name || '?'} vs ${civB?.name || '?'}`);
    addChronicle('war', battleName, `El suelo de ${place.toLowerCase()} quedó empapado de sangre. ${casualties} guerreros cayeron en la ${battleName}. Los cuervos sobrevolaron durante días. Quienes sobrevivieron nunca olvidaron lo que vieron. El lugar se convirtió en símbolo de lo que la guerra realmente es.`, '⚔️');
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
    ];
    const inv = INVENTIONS[Math.floor(Math.random() * INVENTIONS.length)];
    addChronicle('science', `${civ.name} inventa ${inv[0]}`, `Un artesano anónimo de ${civ.name} cambió el mundo sin saberlo. ${inv[1]} El inventor nunca supo que su nombre sería olvidado, pero su obra no.`, '💡');
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

