// ============================================================
// Terreno, colisão e geração procedural dos planetas
// ============================================================

import { TILE, WORLD_W, WORLD_H, BUILDINGS } from './config.js';
import { mulberry32, fbm2, clamp } from './rng.js';

export const T = {
  GROUND: 0,
  FERTILE: 1,
  ROCK: 2,
  WATER: 3,
};

export function tileIndex(x, y) {
  return y * WORLD_W + x;
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
}

export function tileAt(planet, tx, ty) {
  if (!planet || !planet.tiles || !inBounds(tx, ty)) return T.ROCK;
  return planet.tiles[tileIndex(tx, ty)];
}

export function isWalkableTile(tile) {
  return tile === T.GROUND || tile === T.FERTILE || tile === undefined;
}

export function tileToWorld(tx, ty) {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

export function worldToTile(x, y) {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}

export function plotKey(tx, ty) {
  return `${tx},${ty}`;
}

export function getPlot(planet, tx, ty) {
  return planet.plots[plotKey(tx, ty)] || null;
}

const TERRAIN = {
  nix: { water: 0.1, rock: 0.65, fertile: 0.55 },
  cinder: { water: 0.09, rock: 0.62, fertile: 0.57 },
  verdant: { water: 0.29, rock: 0.64, fertile: 0.48 },
  frost: { water: 0.24, rock: 0.62, fertile: 0.55 },
  aether: { water: 0.16, rock: 0.6, fertile: 0.6 },
};

const NODE_WEIGHTS = {
  nix: { crystal: 0.38, scrap: 0.32, ice: 0.12, flora: 0.18, vent: 0 },
  cinder: { crystal: 0.24, scrap: 0.3, ice: 0.04, flora: 0.06, vent: 0.36 },
  verdant: { crystal: 0.22, scrap: 0.14, ice: 0.16, flora: 0.48, vent: 0 },
  frost: { crystal: 0.28, scrap: 0.14, ice: 0.52, flora: 0.06, vent: 0 },
  aether: { crystal: 0.2, scrap: 0.36, ice: 0.04, flora: 0.04, vent: 0.36 },
};

function weightedType(weights, roll) {
  let acc = 0;
  for (const [type, weight] of Object.entries(weights)) {
    acc += weight;
    if (roll <= acc) return type;
  }
  return Object.keys(weights)[0];
}

export function generateTerrain(def, seed) {
  const cfg = TERRAIN[def.id] || TERRAIN.nix;
  const tiles = new Uint8Array(WORLD_W * WORLD_H);
  const spawnTile = {
    x: Math.floor(WORLD_W * 0.44),
    y: Math.floor(WORLD_H * 0.56),
  };

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const n = fbm2(x * 0.085, y * 0.085, seed + 11, 4);
      const r = fbm2(x * 0.12 + 23, y * 0.12 + 9, seed + 77, 3);
      const f = fbm2(x * 0.16 + 3, y * 0.16 + 41, seed + 123, 3);
      let tile = T.GROUND;
      if (n < cfg.water) tile = T.WATER;
      else if (r > cfg.rock) tile = T.ROCK;
      else if (f > cfg.fertile) tile = T.FERTILE;
      tiles[tileIndex(x, y)] = tile;
    }
  }

  // Clareira de pouso: sempre limpa, plana e segura.
  const clearRadius = 7.4;
  for (let y = spawnTile.y - 8; y <= spawnTile.y + 8; y++) {
    for (let x = spawnTile.x - 8; x <= spawnTile.x + 8; x++) {
      if (!inBounds(x, y)) continue;
      const dx = x - spawnTile.x;
      const dy = y - spawnTile.y;
      if (Math.hypot(dx, dy) > clearRadius) continue;
      tiles[tileIndex(x, y)] = Math.abs(dx) + Math.abs(dy) < 3 ? T.FERTILE : T.GROUND;
    }
  }

  // Pequenos canteiros férteis ao redor da cápsula.
  const fertileSpots = [
    [spawnTile.x + 3, spawnTile.y + 1],
    [spawnTile.x + 4, spawnTile.y + 1],
    [spawnTile.x + 3, spawnTile.y + 2],
    [spawnTile.x + 5, spawnTile.y + 1],
    [spawnTile.x + 4, spawnTile.y + 2],
  ];
  for (const [x, y] of fertileSpots) {
    if (inBounds(x, y)) tiles[tileIndex(x, y)] = T.FERTILE;
  }

  const spawn = {
    x: (spawnTile.x + 0.5) * TILE,
    y: (spawnTile.y + 0.55) * TILE,
  };

  return { tiles, spawn, spawnTile };
}

export function scatterNodes(def, seed, tiles, spawnTile) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const weights = NODE_WEIGHTS[def.id] || NODE_WEIGHTS.nix;
  const nodes = [];
  const occupied = new Set();
  let attempts = 0;

  while (nodes.length < 38 && attempts < 1600) {
    attempts++;
    const tx = 2 + Math.floor(rng() * (WORLD_W - 4));
    const ty = 2 + Math.floor(rng() * (WORLD_H - 4));
    if (!isWalkableTile(tiles[tileIndex(tx, ty)])) continue;
    if (Math.hypot(tx - spawnTile.x, ty - spawnTile.y) < 3.8) continue;
    const key = plotKey(tx, ty);
    if (occupied.has(key)) continue;
    // não amontoa recursos
    let tooClose = false;
    for (const n of nodes) {
      if (Math.abs(n.tx - tx) + Math.abs(n.ty - ty) < 2) { tooClose = true; break; }
    }
    if (tooClose) continue;
    occupied.add(key);
    nodes.push({
      id: `n${nodes.length}`,
      tx,
      ty,
      type: weightedType(weights, rng()),
      takenDay: 0,
      variant: Math.floor(rng() * 1000),
    });
  }

  return nodes;
}

export function starterSetup(planet, spawnTile) {
  const defPod = BUILDINGS.pod;
  if (!planet.buildings.length) {
    planet.buildings.push({
      id: 'b0',
      type: 'pod',
      tx: spawnTile.x - 1,
      ty: spawnTile.y - 3,
      w: defPod.size[0],
      h: defPod.size[1],
      cycle: 0,
    });
  }

  const starterPlots = [
    { tx: spawnTile.x + 3, ty: spawnTile.y + 1, crop: 'lumen', growth: 1 },
    { tx: spawnTile.x + 4, ty: spawnTile.y + 1, crop: 'wheat', growth: 0.62 },
    { tx: spawnTile.x + 3, ty: spawnTile.y + 2, crop: 'lumen', growth: 0.4 },
  ];
  for (const p of starterPlots) {
    const key = plotKey(p.tx, p.ty);
    planet.plots[key] = {
      tx: p.tx,
      ty: p.ty,
      moisture: 0.65,
      crop: { species: p.crop, growth: p.growth },
    };
  }

  const starterNodes = [
    { tx: spawnTile.x - 4, ty: spawnTile.y + 2, type: 'crystal' },
    { tx: spawnTile.x + 5, ty: spawnTile.y - 1, type: 'crystal' },
    { tx: spawnTile.x + 1, ty: spawnTile.y + 4, type: 'scrap' },
    { tx: spawnTile.x - 3, ty: spawnTile.y - 3, type: 'flora' },
  ];
  for (const n of starterNodes) {
    if (!inBounds(n.tx, n.ty)) continue;
    if (planet.nodes.some((o) => o.tx === n.tx && o.ty === n.ty)) continue;
    planet.nodes.push({
      id: `s${planet.nodes.length}`,
      tx: n.tx,
      ty: n.ty,
      type: n.type,
      takenDay: 0,
      variant: 17 + planet.nodes.length * 31,
    });
  }
}

export function footprint(def, tx, ty) {
  const [w, h] = def.size;
  return { tx, ty, w, h };
}

export function buildingAt(planet, tx, ty, ignoreId = null) {
  for (const b of planet.buildings) {
    if (b.id === ignoreId) continue;
    if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) return b;
  }
  return null;
}

export function nodeAt(planet, tx, ty, includeTaken = true) {
  return planet.nodes.find((n) => n.tx === tx && n.ty === ty && (includeTaken || n.takenDay === 0)) || null;
}

export function nodeIsActive(node, day) {
  return node.takenDay === 0 || node.takenDay < day;
}

export function canPlaceBuilding(planet, def, tx, ty) {
  if (!def) return { ok: false, reason: 'Estrutura desconhecida.' };
  const [w, h] = def.size;
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      if (!inBounds(x, y)) return { ok: false, reason: 'Fora dos limites do setor.' };
      if (!isWalkableTile(tileAt(planet, x, y))) {
        return { ok: false, reason: 'Terreno bloqueado por rocha ou água.' };
      }
      if (buildingAt(planet, x, y)) return { ok: false, reason: 'Já existe uma estrutura aqui.' };
      if (getPlot(planet, x, y)) return { ok: false, reason: 'Há um canteiro preparado aqui.' };
      const node = nodeAt(planet, x, y);
      if (node) return { ok: false, reason: 'Colete o recurso antes de construir.' };
    }
  }
  return { ok: true, reason: '', tiles: [] };
}

export function addBuilding(planet, def, tx, ty, id) {
  const b = { id, type: def.id, tx, ty, w: def.size[0], h: def.size[1], cycle: 0 };
  planet.buildings.push(b);
  return b;
}

export function isCircleBlocked(planet, x, y, radius = 9) {
  const minX = x - radius;
  const maxX = x + radius;
  const minY = y - radius;
  const maxY = y + radius;
  if (minX < TILE * 0.3 || minY < TILE * 0.3) return true;
  if (maxX > WORLD_W * TILE - TILE * 0.3 || maxY > WORLD_H * TILE - TILE * 0.3) return true;

  const checks = [
    [x, y],
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
    [x, minY],
    [x, maxY],
    [minX, y],
    [maxX, y],
  ];
  for (const [px, py] of checks) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (!inBounds(tx, ty)) return true;
    if (!isWalkableTile(tileAt(planet, tx, ty))) return true;
  }

  for (const b of planet.buildings) {
    const rx = b.tx * TILE + 1;
    const ry = b.ty * TILE + 1;
    const rw = b.w * TILE - 2;
    const rh = b.h * TILE - 2;
    const cx = clamp(x, rx, rx + rw);
    const cy = clamp(y, ry, ry + rh);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < (radius - 3) * (radius - 3)) return true;
  }
  return false;
}

export function findNearbyNode(planet, x, y, day, maxTiles = 2.6) {
  let best = null;
  let bestDist = maxTiles;
  for (const n of planet.nodes) {
    if (!nodeIsActive(n, day)) continue;
    const cx = (n.tx + 0.5) * TILE;
    const cy = (n.ty + 0.5) * TILE;
    const d = Math.hypot(cx - x, cy - y) / TILE;
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export function findNearbyPlot(planet, x, y, predicate = null, maxTiles = 3.2) {
  let best = null;
  let bestDist = maxTiles;
  for (const key of Object.keys(planet.plots)) {
    const p = planet.plots[key];
    if (predicate && !predicate(p)) continue;
    const cx = (p.tx + 0.5) * TILE;
    const cy = (p.ty + 0.5) * TILE;
    const d = Math.hypot(cx - x, cy - y) / TILE;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
