import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState, currentPlanet, tillAt, plantAt, waterAt, harvestAt,
  economyTick, placeBuilding, validatePlacement, planetUnlocked, claimedCount,
  populationCap, serialize, restoreState, checkQuests,
} from '../src/sim.js';
import {
  getPlot, tileAt, buildingAt, nodeAt, isWalkableTile, plotKey, canPlaceBuilding,
} from '../src/world.js';
import { BUILDINGS, STARTER, WORLD_W, WORLD_H, planetById } from '../src/config.js';

function findEmptyTile(state, planetId = state.planetId) {
  const planet = state.planets[planetId];
  const { x: sx, y: sy } = planet.spawnTile;
  for (let radius = 1; radius < 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = sx + dx;
        const ty = sy + dy;
        if (tx < 1 || ty < 1 || tx >= WORLD_W - 1 || ty >= WORLD_H - 1) continue;
        if (!isWalkableTile(tileAt(planet, tx, ty))) continue;
        if (getPlot(planet, tx, ty)) continue;
        if (buildingAt(planet, tx, ty)) continue;
        if (nodeAt(planet, tx, ty)) continue;
        return { tx, ty };
      }
    }
  }
  throw new Error('nenhum tile livre encontrado');
}

function findBuildSpot(state, planetId, type) {
  const planet = state.planets[planetId];
  const def = BUILDINGS[type];
  const { x: sx, y: sy } = planet.spawnTile;
  for (let radius = 2; radius < 16; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = sx + dx;
        const ty = sy + dy;
        if (canPlaceBuilding(planet, def, tx, ty).ok) return { tx, ty };
      }
    }
  }
  throw new Error(`nenhum local válido para ${type}`);
}

test('estado inicial cria o sistema Aurora com Nix colonizada', () => {
  const state = createInitialState(12345);
  assert.equal(Object.keys(state.planets).length, 5);
  assert.equal(state.planetId, 'nix');
  assert.equal(state.planets.nix.claimed, true);
  assert.equal(claimedCount(state), 1);
  assert.equal(state.planets.cinder.claimed, false);
  assert.ok(state.player);
  assert.ok(Number.isFinite(state.player.x));
  assert.ok(Number.isFinite(state.player.y));
  assert.equal(state.resources.energy, STARTER.resources.energy);
});

test('três canteiros iniciais e o primeiro já está maduro', () => {
  const state = createInitialState(77);
  const plots = Object.values(state.planets.nix.plots);
  assert.equal(plots.length, 3);
  assert.equal(plots.filter((p) => p.crop && p.crop.growth >= 1).length, 1);
});

test('ciclo de cultivo: preparar, plantar, regar e colher', () => {
  const state = createInitialState(99);
  const planet = currentPlanet(state);
  const { tx, ty } = findEmptyTile(state);

  const tilled = tillAt(state, planet, tx, ty);
  assert.equal(tilled.ok, true);
  assert.ok(getPlot(planet, tx, ty));
  assert.equal(state.stats.tilled, 1);

  const planted = plantAt(state, planet, tx, ty, 'wheat');
  assert.equal(planted.ok, true);
  assert.equal(getPlot(planet, tx, ty).crop.species, 'wheat');
  assert.equal(state.seeds.wheat, STARTER.seeds.wheat - 1);
  assert.equal(state.stats.planted, 1);

  const early = harvestAt(state, planet, tx, ty);
  assert.equal(early.ok, false);
  assert.equal(early.notReady, true);

  const waterBefore = state.resources.water;
  const watered = waterAt(state, planet, tx, ty);
  assert.equal(watered.ok, true);
  assert.equal(state.resources.water, waterBefore - 1);
  assert.equal(getPlot(planet, tx, ty).moisture, 1);

  getPlot(planet, tx, ty).crop.growth = 1;
  const foodBefore = state.resources.food;
  const creditsBefore = state.resources.credits;
  const harvested = harvestAt(state, planet, tx, ty);
  assert.equal(harvested.ok, true);
  assert.equal(state.resources.food, foodBefore + 4);
  assert.equal(state.resources.credits, creditsBefore + 7);
  assert.equal(state.seeds.wheat, STARTER.seeds.wheat + 1);
  assert.equal(getPlot(planet, tx, ty).crop, null);
  assert.equal(state.stats.harvested, 1);
});

test('não é possível preparar canteiro sobre estrutura ou recurso', () => {
  const state = createInitialState(2026);
  const planet = currentPlanet(state);
  const pod = planet.buildings[0];
  const blocked = tillAt(state, planet, pod.tx, pod.ty);
  assert.equal(blocked.ok, false);

  const node = planet.nodes[0];
  const nodeBlocked = tillAt(state, planet, node.tx, node.ty);
  assert.equal(nodeBlocked.ok, false);
});

test('economia produz recursos e cobra consumo dos colonos', () => {
  const state = createInitialState(4242);
  const planet = currentPlanet(state);
  state.resources.food = 20;
  state.resources.water = 20;
  planet.buildings.push({
    id: 'solar-test', type: 'solar', tx: planet.spawnTile.x + 6, ty: planet.spawnTile.y + 6, w: 2, h: 1, cycle: 0,
  });

  const energyBefore = state.resources.energy;
  const waterBefore = state.resources.water;
  const result = economyTick(state);
  assert.ok(result.gains.energy > 0);
  assert.ok(state.resources.energy > energyBefore);
  assert.ok(state.resources.water < waterBefore);
  assert.ok(planet.cycles >= 1);
});

test('pesquisa e colônias desbloqueiam rotas', () => {
  const state = createInitialState(8);
  const cinder = planetById('cinder');
  assert.equal(planetUnlocked(state, cinder).ok, false);

  state.resources.research = 20;
  assert.equal(planetUnlocked(state, cinder).researchOk, true);
  assert.equal(planetUnlocked(state, cinder).ok, true);

  const frost = planetById('frost');
  state.resources.research = 100;
  assert.equal(planetUnlocked(state, frost).coloniesOk, false);
  assert.equal(planetUnlocked(state, frost).ok, false);
  state.planets.cinder.claimed = true;
  assert.equal(planetUnlocked(state, frost).ok, true);
});

test('farol reivindica planeta virgem e garante capacidade inicial', () => {
  const state = createInitialState(31337);
  const planet = state.planets.cinder;
  state.resources.materials = 400;
  state.resources.energy = 400;
  const def = BUILDINGS.beacon;
  const spot = findBuildSpot(state, 'cinder', 'beacon');
  const result = placeBuilding(state, planet, def, spot.tx, spot.ty);
  assert.equal(result.ok, true);
  assert.equal(result.claimed, true);
  assert.equal(planet.claimed, true);
  assert.equal(planet.pop, 1);
  assert.equal(populationCap(planet), 1);
  assert.equal(claimedCount(state), 2);
});

test('construções fora do planeta reivindicado são bloqueadas', () => {
  const state = createInitialState(5);
  const planet = state.planets.verdant;
  const spot = findBuildSpot(state, 'verdant', 'solar');
  const check = validatePlacement(state, planet, BUILDINGS.solar, spot.tx, spot.ty);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Reivindique/);
});

test('missão de colheita entrega recompensa uma única vez', () => {
  const state = createInitialState(99);
  state.stats.harvested = 1;
  state.resources.credits = 0;
  const completed = checkQuests(state);
  assert.ok(completed.some((q) => q.id === 'harvest1'));
  assert.equal(state.resources.credits, 60);
  assert.equal(checkQuests(state).length, 0);
  assert.equal(state.resources.credits, 60);
});

test('serialização preserva a colônia e o jogador', () => {
  const state = createInitialState(111);
  state.planetId = 'nix';
  state.time.day = 4;
  state.resources.food = 123.5;
  state.player = { x: 700.25, y: 610.75, dir: 'left' };
  state.planets.nix.plots[plotKey(3, 3)] = {
    tx: 3, ty: 3, moisture: 1, crop: { species: 'cryo', growth: 0.5 },
  };

  const restored = restoreState(serialize(state));
  assert.ok(restored);
  assert.equal(restored.time.day, 4);
  assert.equal(restored.resources.food, 123.5);
  assert.deepEqual(restored.player, { x: 700.25, y: 610.75, dir: 'left' });
  assert.equal(restored.planets.nix.plots['3,3'].crop.species, 'cryo');
  assert.equal(restored.planets.nix.tiles.length, WORLD_W * WORLD_H);
});

test('save inválido é rejeitado', () => {
  assert.equal(restoreState('{'), null);
  assert.equal(restoreState('{"version":999}'), null);
  assert.equal(restoreState(JSON.stringify({ version: 1, seed: 1, time: {}, resources: {}, planets: {} })), null);
});
