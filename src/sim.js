// ============================================================
// Simulação da colônia — economia, plantações, missões
// ============================================================

import {
  PLANETS, planetById, BUILDINGS, CROPS, QUESTS, STARTER, NODE_TYPES,
  SAVE_VERSION, WORLD_W, WORLD_H, ECONOMY_TICK, TILE,
} from './config.js';
import {
  generateTerrain, scatterNodes, starterSetup, tileAt, T, isWalkableTile,
  inBounds, getPlot, plotKey, nodeIsActive, nodeAt, buildingAt, footprint, addBuilding,
  canPlaceBuilding,
} from './world.js';
import { hashString, clamp } from './rng.js';

export function makePlanet(def, seed, start = false) {
  const gen = generateTerrain(def, seed);
  const planet = {
    id: def.id,
    seed,
    claimed: Boolean(start),
    tiles: Array.from(gen.tiles),
    spawn: { x: gen.spawn.x, y: gen.spawn.y },
    spawnTile: { x: gen.spawnTile.x, y: gen.spawnTile.y },
    plots: {},
    buildings: [],
    nodes: scatterNodes(def, seed, gen.tiles, gen.spawnTile),
    pop: 0,
    happiness: 78,
    popTimer: 0,
    cycles: 0,
    visits: 0,
    claimDay: start ? 1 : null,
  };
  if (start) {
    starterSetup(planet, gen.spawnTile);
    planet.pop = 1;
    planet.happiness = 82;
    planet.visits = 1;
  }
  return planet;
}

export function createInitialState(seed = (Date.now() >>> 0)) {
  const state = {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    planetId: 'nix',
    time: { day: 1, t: 0.3 },
    resources: { ...STARTER.resources },
    seeds: { ...STARTER.seeds },
    stats: {
      tilled: 0, planted: 0, watered: 0, harvested: 0,
      built: 0, traveled: 0, gathered: 0, creditsEarned: 0,
    },
    completedQuests: [],
    planets: {},
    tool: 'hoe',
    seedType: 'lumen',
    nextId: 1,
    settings: { muted: false },
  };

  for (const def of PLANETS) {
    const planetSeed = (hashString(`${state.seed}:${def.id}`) ^ 0xa5a5a5a5) >>> 0;
    state.planets[def.id] = makePlanet(def, planetSeed, Boolean(def.start));
  }
  const home = state.planets[state.planetId];
  state.player = { x: home.spawn.x, y: home.spawn.y, dir: 'down' };
  return state;
}

export function currentPlanet(state) {
  return state.planets[state.planetId];
}

export function claimedCount(state) {
  return PLANETS.reduce((n, p) => n + (state.planets[p.id]?.claimed ? 1 : 0), 0);
}

export function buildingCount(state, type) {
  let n = 0;
  for (const p of Object.values(state.planets)) {
    for (const b of p.buildings) if (b.type === type) n++;
  }
  return n;
}

export function totalBuildings(state) {
  let n = 0;
  for (const p of Object.values(state.planets)) n += p.buildings.length;
  return n;
}

export function populationCap(planet) {
  let cap = 0;
  for (const b of planet.buildings) {
    const def = BUILDINGS[b.type];
    if (def?.cap) cap += def.cap;
  }
  return cap;
}

export function daylight(t) {
  return clamp(0.5 + 0.5 * Math.sin((t - 0.25) * Math.PI * 2), 0, 1);
}

export function isDaytime(state) {
  return daylight(state.time.t) > 0.28;
}

export function clockLabel(t) {
  const totalMinutes = Math.floor(((t % 1) + 1) % 1 * 24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatNumber(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.floor(n));
}

export function canAfford(state, cost) {
  if (!cost) return true;
  return Object.entries(cost).every(([key, amount]) => (state.resources[key] ?? 0) + 1e-6 >= amount);
}

export function pay(state, cost) {
  if (!canAfford(state, cost)) return false;
  for (const [key, amount] of Object.entries(cost || {})) state.resources[key] -= amount;
  return true;
}

export function addResources(state, gains) {
  if (!gains) return;
  for (const [key, amount] of Object.entries(gains)) {
    if (key === 'seeds') continue;
    if (state.resources[key] === undefined) state.resources[key] = 0;
    state.resources[key] += amount;
    if (key === 'credits' && amount > 0) state.stats.creditsEarned += amount;
  }
}

export function planetUnlocked(state, def) {
  const research = state.resources.research || 0;
  const colonies = claimedCount(state);
  const researchOk = research + 1e-6 >= (def.unlock?.research || 0);
  const coloniesOk = colonies >= (def.unlock?.colonies || 0);
  const reasons = [];
  if (!researchOk) reasons.push(`Pesquisa ${Math.floor(research)}/${def.unlock.research}`);
  if (!coloniesOk) reasons.push(`Colônias ${colonies}/${def.unlock.colonies}`);
  return { ok: researchOk && coloniesOk, researchOk, coloniesOk, reasons };
}

export function travelCost(state, def) {
  const origin = currentPlanet(state);
  const hasPad = origin?.buildings.some((b) => b.type === 'pad');
  return Math.round((def.travel || 0) * (hasPad ? 0.75 : 1));
}

export function productionSummary(state, def, planet = currentPlanet(state)) {
  const gains = { energy: 0, water: 0, food: 0, materials: 0, credits: 0, research: 0 };
  const multiplier = 0.82 + planet.happiness / 300;
  const popMultiplier = 1 + planet.pop * 0.05;
  const day = isDaytime(state);

  for (const b of planet.buildings) {
    const bd = BUILDINGS[b.type];
    if (!bd?.output) continue;
    for (const [key, value] of Object.entries(bd.output)) {
      let amount = value;
      if (b.type === 'solar' && !day) amount *= 0.2;
      amount *= def.mods?.[key] ?? 1;
      gains[key] += amount;
    }
  }
  for (const key of Object.keys(gains)) {
    if (key === 'credits') continue;
    gains[key] *= multiplier * popMultiplier;
  }
  gains.credits += planet.pop * 2.5 * (def.mods?.credits ?? 1) * multiplier;
  gains.credits *= popMultiplier;

  const consumption = {
    food: planet.pop * 0.55,
    water: planet.pop * 0.45,
  };
  return { gains, consumption, multiplier };
}

export function economyTick(state) {
  const def = planetById(state.planetId);
  const planet = currentPlanet(state);
  const summary = productionSummary(state, def, planet);
  const { gains, consumption } = summary;

  for (const [key, amount] of Object.entries(gains)) {
    if (state.resources[key] === undefined) state.resources[key] = 0;
    state.resources[key] += amount;
    if (key === 'credits') state.stats.creditsEarned += amount;
  }

  const foodBefore = state.resources.food;
  const waterBefore = state.resources.water;
  const foodUsed = Math.min(Math.max(0, foodBefore), consumption.food);
  const waterUsed = Math.min(Math.max(0, waterBefore), consumption.water);
  state.resources.food = Math.max(0, foodBefore - consumption.food);
  state.resources.water = Math.max(0, waterBefore - consumption.water);
  const starved = foodUsed + 1e-6 < consumption.food || waterUsed + 1e-6 < consumption.water;

  if (starved) planet.happiness = Math.max(0, planet.happiness - 3);
  else planet.happiness = Math.min(100, planet.happiness + 0.9);

  planet.cycles += 1;
  planet.popTimer += ECONOMY_TICK;

  let newColonist = false;
  const cap = populationCap(planet);
  if (planet.pop < cap && planet.popTimer >= 22 && state.resources.food > 8 && state.resources.water > 8) {
    planet.pop += 1;
    planet.popTimer = 0;
    newColonist = true;
  } else if (planet.pop >= cap) {
    planet.popTimer = Math.min(planet.popTimer, 21);
  }

  return {
    gains,
    consumption,
    foodUsed,
    waterUsed,
    starved,
    newColonist,
    multiplier: summary.multiplier,
  };
}

function greenhouseNear(planet, plot) {
  for (const b of planet.buildings) {
    if (b.type !== 'greenhouse') continue;
    const cx = b.tx + b.w / 2;
    const cy = b.ty + b.h / 2;
    if (Math.hypot(cx - (plot.tx + 0.5), cy - (plot.ty + 0.5)) <= 2.6) return true;
  }
  return false;
}

export function growCrops(state, dt) {
  const def = planetById(state.planetId);
  const planet = currentPlanet(state);
  if (!planet) return 0;
  let ripened = 0;
  for (const plot of Object.values(planet.plots)) {
    if (!plot.crop) continue;
    const crop = CROPS[plot.crop.species];
    if (!crop) continue;
    plot.moisture = Math.max(0, plot.moisture - dt * 0.014);
    const fertile = tileAt(planet, plot.tx, plot.ty) === T.FERTILE;
    const wet = plot.moisture > 0.04;
    let rate = (1 / crop.grow) * (wet ? 1.08 : 0.42) * (fertile ? 1.12 : 1) * (def.mods?.food ?? 1);
    if (greenhouseNear(planet, plot)) rate *= 1.18;
    const before = plot.crop.growth;
    plot.crop.growth = Math.min(1, before + rate * dt);
    if (before < 1 && plot.crop.growth >= 1) ripened++;
  }
  return ripened;
}

export function tillAt(state, planet, tx, ty) {
  if (!inBounds(tx, ty)) return { ok: false, reason: 'Fora do setor.' };
  if (!isWalkableTile(tileAt(planet, tx, ty))) return { ok: false, reason: 'Este solo não pode ser cultivado.' };
  if (buildingAt(planet, tx, ty)) return { ok: false, reason: 'Há uma estrutura aqui.' };
  if (nodeAt(planet, tx, ty)) return { ok: false, reason: 'Colete o recurso primeiro.' };
  if (getPlot(planet, tx, ty)) return { ok: false, reason: 'Este canteiro já está preparado.' };
  const plot = { tx, ty, moisture: 0, crop: null };
  planet.plots[plotKey(tx, ty)] = plot;
  state.stats.tilled += 1;
  return { ok: true, plot };
}

export function waterAt(state, planet, tx, ty) {
  const plot = getPlot(planet, tx, ty);
  if (!plot) return { ok: false, reason: 'Prepare um canteiro com a enxada primeiro.' };
  if (plot.moisture >= 0.94) return { ok: false, reason: 'O solo já está úmido.' };
  if ((state.resources.water || 0) < 1) return { ok: false, reason: 'Sem água. Colete gelo ou construa um extrator.' };
  state.resources.water -= 1;
  plot.moisture = 1;
  state.stats.watered += 1;
  return { ok: true, plot };
}

export function plantAt(state, planet, tx, ty, seedType) {
  const plot = getPlot(planet, tx, ty);
  if (!plot) return { ok: false, reason: 'Prepare um canteiro com a enxada primeiro.' };
  if (plot.crop) return { ok: false, reason: 'Já existe uma planta neste canteiro.' };
  const crop = CROPS[seedType];
  if (!crop) return { ok: false, reason: 'Semente inválida.' };
  if ((state.seeds[seedType] || 0) < 1) {
    return { ok: false, reason: `Sem sementes de ${crop.name}. Colha plantas para recuperar.` };
  }
  state.seeds[seedType] -= 1;
  plot.crop = { species: seedType, growth: 0 };
  state.stats.planted += 1;
  return { ok: true, plot, crop };
}

export function harvestAt(state, planet, tx, ty) {
  const plot = getPlot(planet, tx, ty);
  if (!plot || !plot.crop) return { ok: false, reason: 'Nada para colher aqui.' };
  const crop = CROPS[plot.crop.species];
  if (!crop) return { ok: false, reason: 'Planta desconhecida.' };
  if (plot.crop.growth < 1) {
    return { ok: false, reason: `Ainda não está pronta (${Math.floor(plot.crop.growth * 100)}%).`, notReady: true };
  }
  const gains = { food: crop.food, credits: crop.credits };
  addResources(state, gains);
  state.seeds[plot.crop.species] = (state.seeds[plot.crop.species] || 0) + crop.seeds;
  plot.crop = null;
  plot.moisture = Math.max(0, plot.moisture - 0.15);
  state.stats.harvested += 1;
  return { ok: true, gains, seeds: crop.seeds, crop, plot };
}

export function collectNodeAt(state, planet, node) {
  if (!node) return { ok: false, reason: 'Nada para coletar.' };
  if (!nodeIsActive(node, state.time.day)) return { ok: false, reason: 'Recurso esgotado. Volte no próximo dia.' };
  const type = node.type;
  const gains = { ...(NODE_YIELDS[type] || {}) };
  if (!Object.keys(gains).length) return { ok: false, reason: 'Recurso desconhecido.' };
  addResources(state, gains);
  if (type === 'flora') state.seeds.lumen = (state.seeds.lumen || 0) + 1;
  node.takenDay = state.time.day;
  state.stats.gathered += 1;
  return { ok: true, gains, type, node };
}

const NODE_YIELDS = Object.fromEntries(Object.values(NODE_TYPES).map((n) => [n.id, n.yields]));

export function questProgress(state, quest) {
  if (quest.metric.startsWith('stat.')) {
    return Math.floor(state.stats[quest.metric.slice(5)] || 0);
  }
  if (quest.metric.startsWith('building.')) {
    return buildingCount(state, quest.metric.slice(9));
  }
  if (quest.metric === 'resource.research') {
    return Math.floor(state.resources.research || 0);
  }
  if (quest.metric === 'colonies') {
    return claimedCount(state);
  }
  return 0;
}

export function checkQuests(state) {
  const completed = [];
  for (const quest of QUESTS) {
    if (state.completedQuests.includes(quest.id)) continue;
    if (questProgress(state, quest) >= quest.goal) {
      state.completedQuests.push(quest.id);
      addResources(state, quest.reward);
      completed.push(quest);
    }
  }
  return completed;
}

export function claimPlanet(state, planetId) {
  const planet = state.planets[planetId];
  if (!planet || planet.claimed) return false;
  planet.claimed = true;
  planet.claimDay = state.time.day;
  planet.happiness = 72;
  planet.pop = Math.max(planet.pop, 1);
  return true;
}

export function unlockedPlanets(state) {
  return PLANETS.filter((p) => p.start || planetUnlocked(state, p).ok);
}

export function validatePlacement(state, planet, def, tx, ty) {
  if (!def) return { ok: false, reason: 'Estrutura inválida.' };
  if (!planet.claimed && !def.claim) {
    return { ok: false, reason: 'Reivindique o planeta com um farol de colonização.' };
  }
  if (def.claim && planet.claimed) {
    return { ok: false, reason: 'Este planeta já está colonizado.' };
  }
  if (!canAfford(state, def.cost)) return { ok: false, reason: 'Recursos insuficientes.' };
  if ((state.resources.research || 0) < (def.research || 0)) {
    return { ok: false, reason: `Requer ${def.research} de pesquisa.` };
  }
  const base = footprint(def, tx, ty);
  if (base.tx < 0 || base.ty < 0 || base.tx + base.w > WORLD_W || base.ty + base.h > WORLD_H) {
    return { ok: false, reason: 'Fora dos limites do setor.' };
  }
  return canPlaceBuilding(planet, def, tx, ty);
}

export function placeBuilding(state, planet, def, tx, ty) {
  const check = validatePlacement(state, planet, def, tx, ty);
  if (!check.ok) return check;
  if (!pay(state, def.cost)) return { ok: false, reason: 'Recursos insuficientes.' };
  const id = `b${state.nextId++}`;
  const building = addBuilding(planet, def, tx, ty, id);
  state.stats.built += 1;
  let claimed = false;
  if (def.claim) claimed = claimPlanet(state, planet.id);
  return { ok: true, building, claimed };
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function restoreState(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!data || data.version !== SAVE_VERSION || !Number.isFinite(data.seed)) return null;
  if (!data.time || !data.resources || !data.planets) return null;
  if (!Number.isFinite(data.time.day) || !Number.isFinite(data.time.t)) return null;
  if (typeof data.planets !== 'object') return null;

  const state = {
    ...data,
    resources: { ...STARTER.resources, ...data.resources },
    seeds: { ...STARTER.seeds, ...data.seeds },
    stats: {
      tilled: 0, planted: 0, watered: 0, harvested: 0,
      built: 0, traveled: 0, gathered: 0, creditsEarned: 0, ...data.stats,
    },
    completedQuests: Array.isArray(data.completedQuests) ? data.completedQuests : [],
    settings: { muted: false, ...(data.settings || {}) },
    planets: {},
  };

  if (!data.planets[state.planetId]) state.planetId = 'nix';

  for (const def of PLANETS) {
    const saved = data.planets[def.id];
    const planetSeed = (hashString(`${state.seed}:${def.id}`) ^ 0xa5a5a5a5) >>> 0;
    if (!saved || !Array.isArray(saved.tiles) || saved.tiles.length !== WORLD_W * WORLD_H) {
      state.planets[def.id] = makePlanet(def, planetSeed, Boolean(def.start));
      continue;
    }
    const spawnTile = saved.spawnTile || { x: Math.floor(WORLD_W * 0.44), y: Math.floor(WORLD_H * 0.56) };
    const planet = {
      ...saved,
      seed: saved.seed ?? planetSeed,
      tiles: saved.tiles.map((v) => (Number.isFinite(v) ? v : T.GROUND)),
      plots: saved.plots && typeof saved.plots === 'object' ? saved.plots : {},
      buildings: Array.isArray(saved.buildings) ? saved.buildings : [],
      nodes: Array.isArray(saved.nodes) ? saved.nodes : [],
      pop: Math.max(0, Math.floor(saved.pop || 0)),
      happiness: clamp(Number(saved.happiness) || 0, 0, 100),
      popTimer: Number(saved.popTimer) || 0,
      cycles: Number(saved.cycles) || 0,
      visits: Number(saved.visits) || 0,
      claimed: Boolean(saved.claimed),
      spawn: saved.spawn || { x: (spawnTile.x + 0.5) * TILE, y: (spawnTile.y + 0.55) * TILE },
      spawnTile,
    };
    state.planets[def.id] = planet;
  }

  if (!state.planets[state.planetId]) state.planetId = 'nix';
  return state;
}
