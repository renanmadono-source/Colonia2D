// ============================================================
// COLÔNIA AURORA — loop principal, entrada e integração
// ============================================================

import {
  TILE, WORLD_W, WORLD_H, PLAYER_SPEED, INTERACT_RANGE, BUILD_RANGE,
  DAY_LENGTH, ECONOMY_TICK, RESOURCES, PLANETS, planetById, BUILDINGS, TOOLS,
  CROP_ORDER, CROPS, NODE_TYPES,
} from './config.js';
import {
  createInitialState, economyTick, growCrops, tillAt, waterAt, plantAt,
  harvestAt, collectNodeAt, checkQuests, placeBuilding, validatePlacement,
  planetUnlocked, travelCost, canAfford, pay,
} from './sim.js';
import {
  getPlot, nodeAt, buildingAt, tileAt, isWalkableTile, findNearbyPlot,
  findNearbyNode, worldToTile, isCircleBlocked, T, nodeIsActive,
} from './world.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { clamp } from './rng.js';

const SHORT = Object.fromEntries(RESOURCES.map((r) => [r.key, r.short]));
const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function resourceLabel(gains) {
  return Object.entries(gains)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `+${Math.round(value)} ${SHORT[key] || key.toUpperCase()}`)
    .join(' · ');
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.audio = new AudioEngine();

    this.state = null;
    this.ui = null;
    this.clock = 0;
    this.last = performance.now();
    this.camera = { x: WORLD_W * TILE * 0.44, y: WORLD_H * TILE * 0.56 };
    this.mouse = { x: 0, y: 0, screenX: 0, screenY: 0, inside: false };
    this.touch = { x: 0, y: 0 };
    this.keys = new Set();
    this.aimTile = null;
    this.buildMode = null;
    this.buildGhost = null;
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.travelAnim = null;
    this.particles = [];
    this.floats = [];
    this.drone = { x: 0, y: 0 };
    this.moving = false;
    this.walkPhase = 0;
    this.economyTimer = 0;
    this.autosaveTimer = 0;
    this.ambientTimer = 0;
    this.dirty = false;
    this.blocked = false;
    this.tool = 'hoe';
    this.knownUnlocked = new Set();
    this.coarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    this.loop = this.loop.bind(this);

    this.bind();
    this.ui = new UI(this);
    this.ui.showTitle();
    requestAnimationFrame(this.loop);
  }

  // ----------------------------------------------------------
  // Ciclo de vida
  // ----------------------------------------------------------

  newGame() {
    clearSave();
    this.state = createInitialState();
    this.beginSession(true);
    this.ui.toast({
      title: 'BEM-VINDO A NIX',
      text: 'Prepare canteiros com a enxada, plante sementes e construa seu primeiro habitat.',
      tone: 'violet',
      iconName: 'sparkle',
      duration: 5200,
    });
  }

  continueGame() {
    const restored = loadGame();
    if (!restored) {
      this.newGame();
      return;
    }
    this.state = restored;
    this.beginSession(false);
    this.ui.toast({
      title: 'LINK RESTABELECIDO',
      text: 'Sua colônia foi restaurada. O sistema Aurora aguarda seus próximos passos.',
      tone: 'green',
      iconName: 'check',
      duration: 4200,
    });
  }

  beginSession(isNew) {
    const state = this.state;
    const home = state.planets[state.planetId] || state.planets.nix;
    if (!state.planets[state.planetId]) state.planetId = 'nix';
    if (!state.player || !Number.isFinite(state.player.x)) {
      state.player = { x: home.spawn.x, y: home.spawn.y, dir: 'down' };
    }
    if (!state.seedType || !CROPS[state.seedType]) state.seedType = 'lumen';
    if (!TOOLS.some((t) => t.id === state.tool)) state.tool = 'hoe';

    this.tool = state.tool;
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.buildMode = null;
    this.buildGhost = null;
    this.travelAnim = null;
    this.particles = [];
    this.floats = [];
    this.economyTimer = 0;
    this.autosaveTimer = 0;
    this.ambientTimer = 0;
    this.dirty = false;
    this.keys.clear();
    this.drone.x = state.player.x + 24;
    this.drone.y = state.player.y - 3;
    this.snapCamera();

    this.audio.unlock();
    this.audio.setMuted(Boolean(state.settings?.muted));
    this.audio.startAmbient();

    this.knownUnlocked = new Set(
      PLANETS.filter((p) => p.start || planetUnlocked(state, p).ok).map((p) => p.id),
    );

    this.ui.hideAllOverlays();
    this.ui.showGame();
    this.ui.setFade(false);
    this.ui.setState(state);
    this.ui.updateSoundUI();
    this.ui.updateContinue();
    this.ui.refresh(true);

    if (isNew) {
      this.saveNow(false);
      this.ui.updateContinue();
    }
  }

  returnToTitle() {
    if (this.state) this.saveNow(false);
    this.state = null;
    this.ui.state = null;
    this.moving = false;
    this.buildMode = null;
    this.buildGhost = null;
    this.travelAnim = null;
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.keys.clear();
    this.touch.x = 0;
    this.touch.y = 0;
    document.body.classList.remove('build-mode');
    this.audio.stopAmbient();
    this.ui.showTitle();
  }

  resetGame() {
    clearSave();
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.ui.hideAllOverlays();
    this.newGame();
    this.ui.toast({
      title: 'NOVA EXPEDIÇÃO',
      text: 'Um novo link foi aberto em Nix. Todo o sistema Aurora está à sua frente.',
      tone: 'gold',
      iconName: 'orbit',
      duration: 4200,
    });
  }

  saveNow(showToast = false) {
    if (!this.state) return;
    const ok = saveGame(this.state);
    this.autosaveTimer = 0;
    this.dirty = false;
    if (showToast) {
      this.ui.toast({
        title: ok ? 'PROGRESSO SALVO' : 'FALHA AO SALVAR',
        text: ok ? 'O link com a colônia foi arquivado neste navegador.' : 'O armazenamento local está indisponível.',
        tone: ok ? 'green' : 'red',
        iconName: ok ? 'save' : 'close',
        duration: 2600,
      });
    }
    this.ui.updateContinue();
  }

  // ----------------------------------------------------------
  // Loop
  // ----------------------------------------------------------

  loop(now) {
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.clock += dt;

    if (this.state) {
      this.blocked = this.anyOverlayOpen() || Boolean(this.travelAnim);
      this.update(dt);
      this.renderer.drawWorld(this, dt);
      this.ui.tick(dt);
      this.updateTravel();
    } else {
      this.renderer.drawTitle(this.clock);
    }

    requestAnimationFrame(this.loop);
  }

  update(dt) {
    if (!this.state) return;

    if (!this.blocked) {
      this.updateTime(dt);
      this.updateMovement(dt);
      this.updateParticles(dt);
      this.updateDrone(dt);
      this.updateAmbient(dt);

      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 18 && this.dirty) this.saveNow(false);
    }

    this.updateCamera(dt);
    this.updateAim();
    this.updateBuildGhost();
  }

  updateTime(dt) {
    const state = this.state;
    state.time.t += dt / DAY_LENGTH;
    while (state.time.t >= 1) {
      state.time.t -= 1;
      state.time.day += 1;
      this.onNewDay();
    }

    this.economyTimer += dt;
    while (this.economyTimer >= ECONOMY_TICK) {
      this.economyTimer -= ECONOMY_TICK;
      const result = economyTick(state);
      if (result.newColonist) {
        this.ui.notifyColonist(planetById(state.planetId).name);
        this.audio.sfx('quest');
      }
      this.applyQuestsAndUnlocks();
      this.dirty = true;
    }

    const ripened = growCrops(state, dt);
    if (ripened > 0) {
      const planet = state.planets[state.planetId];
      for (const plot of Object.values(planet.plots)) {
        if (plot.crop && plot.crop.growth >= 1) {
          this.spawnPlotSparkle(plot);
        }
      }
    }
  }

  onNewDay() {
    const state = this.state;
    const def = planetById(state.planetId);
    this.ui.notifyNewDay(state.time.day);
    this.audio.sfx('day');
    this.spawnAmbientBurst(def.theme.dust, 8);
    this.dirty = true;
    this.saveNow(false);
  }

  updateMovement(dt) {
    const state = this.state;
    const planet = state.planets[state.planetId];
    const player = state.player;

    let ix = 0;
    let iy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy += 1;

    let mx = ix;
    let my = iy;
    if (!ix && !iy) {
      mx = this.touch.x;
      my = this.touch.y;
    }

    const len = Math.hypot(mx, my);
    if (len < 0.08) {
      this.moving = false;
      return;
    }
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    this.moving = true;
    this.walkPhase += dt * 10.5;

    if (Math.abs(mx) >= Math.abs(my)) player.dir = mx >= 0 ? 'right' : 'left';
    else player.dir = my >= 0 ? 'down' : 'up';

    const speed = PLAYER_SPEED * dt;
    const nx = player.x + mx * speed;
    if (!isCircleBlocked(planet, nx, player.y, 9)) player.x = nx;
    const ny = player.y + my * speed;
    if (!isCircleBlocked(planet, player.x, ny, 9)) player.y = ny;

    if (this.clock - (this.lastDust || 0) > 0.24) {
      this.lastDust = this.clock;
      const def = planetById(state.planetId);
      const tile = tileAt(planet, Math.floor(player.x / TILE), Math.floor(player.y / TILE));
      const color = tile === T.WATER ? def.theme.waterHi : def.theme.dust;
      this.burst(player.x + (mx > 0 ? -6 : 6), player.y, color, 1, {
        speed: 16, size: 1.4, life: 0.5, glow: false, gravity: -4,
      });
    }
  }

  updateDrone(dt) {
    if (!this.state) return;
    const player = this.state.player;
    const side = player.dir === 'right' ? -1 : 1;
    const dx = player.x + side * 25 + Math.sin(this.clock * 0.7) * 4;
    const dy = player.y - 6 + Math.sin(this.clock * 1.1) * 3;
    const k = Math.min(1, dt * 3.4);
    this.drone.x += (dx - this.drone.x) * k;
    this.drone.y += (dy - this.drone.y) * k;
  }

  updateCamera(dt) {
    if (!this.state) return;
    const player = this.state.player;
    const targetX = player.x;
    const targetY = player.y - 14;
    const k = Math.min(1, dt * 7);
    this.camera.x += (targetX - this.camera.x) * k;
    this.camera.y += (targetY - this.camera.y) * k;
    this.clampCamera();
  }

  snapCamera() {
    if (!this.state) return;
    this.camera.x = this.state.player.x;
    this.camera.y = this.state.player.y - 14;
    this.clampCamera();
  }

  clampCamera() {
    const { vw, vh, zoom } = this.renderer;
    const halfW = vw / (2 * zoom);
    const halfH = vh / (2 * zoom);
    const worldW = WORLD_W * TILE;
    const worldH = WORLD_H * TILE;
    this.camera.x = worldW <= halfW * 2
      ? worldW / 2
      : clamp(this.camera.x, halfW, worldW - halfW);
    this.camera.y = worldH <= halfH * 2
      ? worldH / 2
      : clamp(this.camera.y, halfH, worldH - halfH);
  }

  updateAim() {
    if (!this.state) {
      this.aimTile = null;
      return;
    }
    const { vw, vh, zoom } = this.renderer;
    if (this.mouse.inside) {
      const wx = this.camera.x + (this.mouse.screenX - vw / 2) / zoom;
      const wy = this.camera.y + (this.mouse.screenY - vh / 2) / zoom;
      const tile = worldToTile(wx, wy);
      if (tile.x >= 0 && tile.y >= 0 && tile.x < WORLD_W && tile.y < WORLD_H) {
        this.aimTile = { tx: tile.x, ty: tile.y, x: wx, y: wy };
      } else {
        this.aimTile = null;
      }
      return;
    }
    if (this.coarse) {
      const target = this.facingTile();
      this.aimTile = {
        tx: target.tx,
        ty: target.ty,
        x: (target.tx + 0.5) * TILE,
        y: (target.ty + 0.5) * TILE,
      };
      return;
    }
    this.aimTile = null;
  }

  // ----------------------------------------------------------
  // Alvos, dicas e ferramentas
  // ----------------------------------------------------------

  facingTile() {
    const player = this.state.player;
    const tx = Math.floor(player.x / TILE);
    const ty = Math.floor(player.y / TILE);
    const offsets = {
      up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    };
    const [ox, oy] = offsets[player.dir] || offsets.down;
    return {
      tx: clamp(tx + ox, 0, WORLD_W - 1),
      ty: clamp(ty + oy, 0, WORLD_H - 1),
    };
  }

  distanceToTile(tile) {
    const player = this.state.player;
    const cx = (tile.tx + 0.5) * TILE;
    const cy = (tile.ty + 0.5) * TILE;
    return Math.hypot(cx - player.x, cy - player.y);
  }

  usableAim() {
    const aim = this.aimTile;
    if (!aim || !this.mouse.inside) return null;
    return this.distanceToTile(aim) <= INTERACT_RANGE ? aim : null;
  }

  resolveActionTile(tool = this.state?.tool) {
    if (!this.state) return this.facingTile();
    const planet = this.state.planets[this.state.planetId];
    const player = this.state.player;

    const aim = this.usableAim();
    if (aim) return aim;

    if (tool === 'harvest') {
      const plot = findNearbyPlot(planet, player.x, player.y, (p) => p.crop && p.crop.growth >= 1, 3.6);
      if (plot) return { tx: plot.tx, ty: plot.ty };
    } else if (tool === 'water') {
      const plot = findNearbyPlot(planet, player.x, player.y, (p) => p.moisture < 0.9, 3.6);
      if (plot) return { tx: plot.tx, ty: plot.ty };
    } else if (tool === 'seed') {
      const plot = findNearbyPlot(planet, player.x, player.y, (p) => !p.crop, 3.6);
      if (plot) return { tx: plot.tx, ty: plot.ty };
    } else if (tool === 'interact') {
      const node = findNearbyNode(planet, player.x, player.y, this.state.time.day, 3.2);
      if (node) return { tx: node.tx, ty: node.ty };
      const plot = findNearbyPlot(planet, player.x, player.y, (p) => p.crop && p.crop.growth >= 1, 3.2);
      if (plot) return { tx: plot.tx, ty: plot.ty };
    }

    return this.facingTile();
  }

  getActionHint() {
    if (!this.state || this.anyOverlayOpen() || this.travelAnim) return null;
    const state = this.state;
    const planet = state.planets[state.planetId];

    if (this.buildMode) {
      const def = BUILDINGS[this.buildMode];
      const ghost = this.buildGhost;
      return {
        key: 'ESC',
        icon: 'hammer',
        html: ghost && ghost.ok
          ? `Posicionar <b>${def.name}</b> · clique`
          : `<b>${def?.name || 'Estrutura'}</b>${ghost?.reason ? ` · ${ghost.reason}` : ' · mova o cursor'}`,
        warn: !ghost || !ghost.ok,
      };
    }

    const tool = state.tool;
    const tile = this.resolveActionTile(tool);
    const plot = getPlot(planet, tile.tx, tile.ty);
    const node = nodeAt(planet, tile.tx, tile.ty);

    if (tool === 'interact') {
      if (node) {
        const active = nodeIsActive(node, state.time.day);
        return {
          key: 'E',
          icon: 'hand',
          html: active ? `Coletar <b>${NODE_TYPES[node.type]?.short || node.type}</b>` : 'Recurso esgotado hoje',
          warn: !active,
        };
      }
      if (plot?.crop) {
        const ready = plot.crop.growth >= 1;
        return {
          key: 'E',
          icon: ready ? 'sickle' : 'sprout',
          html: ready ? `Colher <b>${CROPS[plot.crop.species]?.short || 'planta'}</b>` : `Crescendo · ${Math.floor(plot.crop.growth * 100)}%`,
          warn: !ready,
        };
      }
      return { key: 'E', icon: 'hand', html: 'Nada para interagir aqui', warn: true };
    }

    if (plot) {
      if (tool === 'hoe') {
        return { key: 'E', icon: 'hoe', html: 'Canteiro já preparado', warn: true };
      }
      if (tool === 'water') {
        const wet = plot.moisture >= 0.9;
        return {
          key: 'E',
          icon: 'water',
          html: wet ? 'Solo úmido · pronto' : `Regar canteiro · ${Math.floor(plot.moisture * 100)}%`,
          warn: wet,
        };
      }
      if (tool === 'seed') {
        if (plot.crop) {
          const crop = CROPS[plot.crop.species];
          const ready = plot.crop.growth >= 1;
          return {
            key: 'E',
            icon: ready ? 'sickle' : 'sprout',
            html: ready ? `<b>${crop?.short || 'Planta'}</b> madura · colha` : `${crop?.name || 'Planta'} · ${Math.floor(plot.crop.growth * 100)}%`,
            warn: ready,
          };
        }
        const count = state.seeds[state.seedType] || 0;
        const crop = CROPS[state.seedType];
        return {
          key: 'E',
          icon: 'sprout',
          html: `Plantar <b>${crop.short}</b> · ${count} semente${count === 1 ? '' : 's'}`,
          warn: count < 1,
        };
      }
      if (tool === 'harvest') {
        const ready = plot.crop && plot.crop.growth >= 1;
        return {
          key: 'E',
          icon: 'sickle',
          html: ready ? `Colher <b>${CROPS[plot.crop.species]?.short}</b>` : plot.crop ? `Ainda crescendo · ${Math.floor(plot.crop.growth * 100)}%` : 'Nada plantado aqui',
          warn: !ready,
        };
      }
    }

    if (tool === 'hoe') {
      const walkable = isWalkableTile(tileAt(planet, tile.tx, tile.ty));
      const blocked = Boolean(buildingAt(planet, tile.tx, tile.ty)) || Boolean(node);
      return {
        key: 'E',
        icon: 'hoe',
        html: walkable && !blocked ? 'Preparar canteiro' : 'Solo indisponível',
        warn: !walkable || blocked,
      };
    }
    if (tool === 'water') return { key: 'E', icon: 'water', html: 'Mire um canteiro para regar', warn: true };
    if (tool === 'seed') return { key: 'E', icon: 'sprout', html: 'Mire um canteiro para plantar', warn: true };
    if (tool === 'harvest') return { key: 'E', icon: 'sickle', html: 'Nenhuma planta madura por perto', warn: true };

    return { key: 'E', icon: 'hand', html: 'Interagir', warn: false };
  }

  getHoverInfo() {
    if (!this.state || !this.aimTile || this.anyOverlayOpen() || this.travelAnim) return null;
    const state = this.state;
    const planet = state.planets[state.planetId];
    const def = planetById(state.planetId);
    const { tx, ty } = this.aimTile;

    const plot = getPlot(planet, tx, ty);
    if (plot) {
      const rows = [['UMIDADE', `${Math.floor(plot.moisture * 100)}%`]];
      if (plot.crop) {
        const crop = CROPS[plot.crop.species];
        const ready = plot.crop.growth >= 1;
        rows.push(['CULTURA', crop?.name || plot.crop.species]);
        rows.push(['CRESCIMENTO', ready ? 'PRONTA' : `${Math.floor(plot.crop.growth * 100)}%`, ready ? 'tt-ready' : '']);
      } else {
        rows.push(['ESTADO', 'VAZIO']);
      }
      return { title: `CANTEIRO ${tx}-${ty}`, rows };
    }

    const node = nodeAt(planet, tx, ty);
    if (node) {
      const active = nodeIsActive(node, state.time.day);
      const names = {
        crystal: 'Cristal de energia', scrap: 'Sucata estelar', ice: 'Gelo antigo',
        flora: 'Flora luminescente', vent: 'Respiração térmica',
      };
      const yields = {
        crystal: '10 EN · 2 PQ', scrap: '7 MT', ice: '8 AG', flora: '6 AL · 1 semente', vent: '14 EN',
      };
      return {
        title: (names[node.type] || node.type).toUpperCase(),
        rows: [
          ['RECOMPENSA', yields[node.type] || '—'],
          ['ESTADO', active ? 'DISPONÍVEL' : 'ESGOTADO HOJE', active ? 'tt-ready' : ''],
          ['COLETA', 'FERRAMENTA E', ''],
        ],
      };
    }

    const building = buildingAt(planet, tx, ty);
    if (building) {
      const bd = BUILDINGS[building.type];
      return {
        title: (bd?.name || building.type).toUpperCase(),
        rows: [
          ['SETOR', `${building.w}×${building.h}`],
          ['FUNÇÃO', bd?.desc ? bd.desc.slice(0, 46) + (bd.desc.length > 46 ? '…' : '') : 'Estrutura'],
        ],
      };
    }

    const tile = tileAt(planet, tx, ty);
    const terrain = tile === T.WATER ? 'ÁGUA'
      : tile === T.ROCK ? 'ROCHA'
        : tile === T.FERTILE ? 'SOLO FÉRTIL' : 'SOLO';
    return {
      title: `${def.name.toUpperCase()} ${tx}-${ty}`,
      rows: [
        ['TERRENO', terrain],
        ['SETOR', `${WORLD_W}×${WORLD_H}`],
      ],
    };
  }

  useCurrentTool(explicitTile = null) {
    if (!this.state || this.blocked || this.travelAnim) return;
    if (!this.audio.ready) {
      this.audio.unlock();
      this.audio.startAmbient();
    }
    if (this.buildMode) {
      this.placeAtGhost();
      return;
    }

    const state = this.state;
    const planet = state.planets[state.planetId];
    const tile = explicitTile || this.resolveActionTile(state.tool);
    if (!tile) return;

    if (explicitTile && this.distanceToTile(tile) > INTERACT_RANGE) {
      this.playerFeedback('Muito longe', tile);
      return;
    }

    const tool = state.tool;

    if (tool === 'hoe') {
      const result = tillAt(state, planet, tile.tx, tile.ty);
      if (!result.ok) return this.playerFeedback(result.reason, tile);
      this.audio.sfx('till');
      this.burst((tile.tx + 0.5) * TILE, (tile.ty + 0.6) * TILE, '#9b7b68', 10, {
        speed: 55, size: 2.2, life: 0.55, glow: false, gravity: 90, shape: 'square',
      });
      this.addFloat((tile.tx + 0.5) * TILE, tile.ty * TILE + 4, 'CANTEIRO', '#ffd166');
      return this.afterAction();
    }

    if (tool === 'water') {
      const result = waterAt(state, planet, tile.tx, tile.ty);
      if (!result.ok) return this.playerFeedback(result.reason, tile);
      this.audio.sfx('water');
      this.burst((tile.tx + 0.5) * TILE, (tile.ty + 0.5) * TILE, '#6ee7ff', 14, {
        speed: 45, size: 1.8, life: 0.6, glow: true, gravity: 65,
      });
      this.addFloat((tile.tx + 0.5) * TILE, tile.ty * TILE, 'REGADO', '#6ee7ff');
      return this.afterAction();
    }

    if (tool === 'seed') {
      const result = plantAt(state, planet, tile.tx, tile.ty, state.seedType);
      if (!result.ok) return this.playerFeedback(result.reason, tile);
      this.audio.sfx('plant');
      this.burst((tile.tx + 0.5) * TILE, (tile.ty + 0.5) * TILE, CROPS[state.seedType].color, 9, {
        speed: 35, size: 1.8, life: 0.7, glow: true, gravity: -12,
      });
      this.addFloat((tile.tx + 0.5) * TILE, tile.ty * TILE, `PLANTADO · ${CROPS[state.seedType].short}`, CROPS[state.seedType].color);
      return this.afterAction();
    }

    if (tool === 'harvest') {
      const result = harvestAt(state, planet, tile.tx, tile.ty);
      if (!result.ok) return this.playerFeedback(result.reason, tile);
      this.harvestFeedback(result, tile);
      return this.afterAction();
    }

    if (tool === 'interact') {
      let node = nodeAt(planet, tile.tx, tile.ty);
      if (!node || !nodeIsActive(node, state.time.day)) {
        node = findNearbyNode(planet, state.player.x, state.player.y, state.time.day, 3.2);
      }
      if (node) {
        const result = collectNodeAt(state, planet, node);
        if (!result.ok) return this.playerFeedback(result.reason, { tx: node.tx, ty: node.ty });
        const colors = {
          crystal: '#6ee7ff', scrap: '#ff9a63', ice: '#9fe8ff',
          flora: '#74f7a5', vent: '#ff8a5c',
        };
        const color = colors[result.type] || '#ffffff';
        this.audio.sfx('gather');
        this.burst((node.tx + 0.5) * TILE, (node.ty + 0.4) * TILE, color, 14, {
          speed: 70, size: 2, life: 0.7, glow: true, gravity: 20,
        });
        this.addFloat((node.tx + 0.5) * TILE, node.ty * TILE, resourceLabel(result.gains), color);
        return this.afterAction();
      }

      const plot = getPlot(planet, tile.tx, tile.ty);
      if (plot?.crop) {
        const result = harvestAt(state, planet, tile.tx, tile.ty);
        if (!result.ok) return this.playerFeedback(result.reason, tile);
        this.harvestFeedback(result, tile);
        return this.afterAction();
      }
      return this.playerFeedback('Nada para interagir', tile);
    }

    if (tool === 'build') {
      this.openBuild();
      return;
    }

    this.playerFeedback('Nenhuma ação disponível', tile);
  }

  harvestFeedback(result, tile) {
    this.audio.sfx('harvest');
    const color = result.crop?.color || '#ffd166';
    this.burst((tile.tx + 0.5) * TILE, (tile.ty + 0.4) * TILE, color, 18, {
      speed: 85, size: 2.2, life: 0.85, glow: true, gravity: 35,
    });
    this.burst((tile.tx + 0.5) * TILE, (tile.ty + 0.5) * TILE, '#ffffff', 5, {
      speed: 40, size: 1.3, life: 0.5, glow: true,
    });
    const text = Object.entries(result.gains)
      .map(([key, value]) => `+${value} ${SHORT[key] || key.toUpperCase()}`)
      .join(' · ');
    this.addFloat((tile.tx + 0.5) * TILE, tile.ty * TILE, text, '#ffd166');
    if (result.seeds) {
      this.addFloat((tile.tx + 0.5) * TILE, tile.ty * TILE - 12, `+${result.seeds} SEMENTE`, '#7dffb2');
    }
  }

  afterAction() {
    this.applyQuestsAndUnlocks();
    this.dirty = true;
    this.ui.refresh(true);
  }

  applyQuestsAndUnlocks() {
    if (!this.state) return;
    const completed = checkQuests(this.state);
    for (const quest of completed) {
      this.ui.questToast(quest);
      this.audio.sfx('quest');
    }
    this.checkUnlocks();
    if (completed.length) this.ui.refresh(true);
  }

  checkUnlocks() {
    if (!this.state) return;
    for (const def of PLANETS) {
      if (def.start || this.knownUnlocked.has(def.id)) continue;
      if (planetUnlocked(this.state, def).ok) {
        this.knownUnlocked.add(def.id);
        this.ui.notifyUnlocked(def.name);
        this.audio.sfx('quest');
      }
    }
  }

  // ----------------------------------------------------------
  // Construção
  // ----------------------------------------------------------

  openBuild() {
    if (!this.state || this.travelAnim) return;
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.buildMode = null;
    this.buildGhost = null;
    this.overlays.build = true;
    this.ui.hideAllOverlays();
    this.ui.showBuild();
    this.audio.sfx('click');
  }

  chooseBuilding(type) {
    if (!this.state) return;
    const def = BUILDINGS[type];
    const planet = this.state.planets[this.state.planetId];
    if (!def) return;
    if (!planet.claimed && !def.claim) {
      this.ui.showBuildBannerError('Reivindique o planeta com um farol de colonização antes de construir.');
      return;
    }
    if (def.claim && planet.claimed) {
      this.ui.showBuildBannerError('Este planeta já está colonizado.');
      return;
    }
    if ((this.state.resources.research || 0) < (def.research || 0)) {
      this.ui.showBuildBannerError(`Pesquisa insuficiente. Requer ${def.research} PQ.`);
      return;
    }
    if (!canAfford(this.state, def.cost)) {
      this.ui.showBuildBannerError('Recursos insuficientes para esta estrutura.');
      return;
    }

    this.buildMode = type;
    this.overlays.build = false;
    this.ui.hideBuild();
    this.audio.sfx('click');
    this.ui.toast({
      title: `CONSTRUINDO ${def.name.toUpperCase()}`,
      text: 'Clique em uma área livre próxima. ESC cancela.',
      tone: 'violet',
      iconName: 'hammer',
      duration: 2600,
    });
    this.ui.refresh(true);
  }

  updateBuildGhost() {
    if (!this.buildMode || !this.state || this.blocked) {
      this.buildGhost = null;
      return;
    }
    const def = BUILDINGS[this.buildMode];
    if (!def) {
      this.buildGhost = null;
      return;
    }
    let aim = this.aimTile;
    if (!aim || !this.mouse.inside) {
      const facing = this.facingTile();
      aim = { tx: facing.tx, ty: facing.ty };
    }

    const [w, h] = def.size;
    const tx = aim.tx - Math.floor(w / 2);
    const ty = aim.ty - Math.floor(h / 2);
    const planet = this.state.planets[this.state.planetId];
    const check = validatePlacement(this.state, planet, def, tx, ty);
    let ok = check.ok;
    let reason = check.reason;

    const cx = (tx + w / 2) * TILE;
    const cy = (ty + h / 2) * TILE;
    if (ok && Math.hypot(cx - this.state.player.x, cy - this.state.player.y) > BUILD_RANGE) {
      ok = false;
      reason = 'Muito longe do astronauta.';
    }

    this.buildGhost = { type: this.buildMode, tx, ty, ok, reason };
  }

  placeAtGhost() {
    if (!this.state || !this.buildGhost) return;
    const ghost = this.buildGhost;
    const def = BUILDINGS[ghost.type];
    const planet = this.state.planets[this.state.planetId];
    if (!ghost.ok) {
      this.ui.showBuildBannerError(ghost.reason || 'Local inválido.');
      this.audio.sfx('error');
      return;
    }

    const result = placeBuilding(this.state, planet, def, ghost.tx, ghost.ty);
    if (!result.ok) {
      this.ui.showBuildBannerError(result.reason || 'Não foi possível construir.');
      this.audio.sfx('error');
      return;
    }

    this.audio.sfx(result.claimed ? 'claim' : 'build');
    const cx = (ghost.tx + def.size[0] / 2) * TILE;
    const cy = (ghost.ty + def.size[1] / 2) * TILE;
    const defPlanet = planetById(this.state.planetId);
    this.burst(cx, cy, defPlanet.theme.accent, 22, {
      speed: 95, size: 2.4, life: 0.9, glow: true, gravity: 30,
    });
    this.burst(cx, cy, defPlanet.theme.accent2, 12, {
      speed: 50, size: 1.6, life: 1.2, glow: true, gravity: -20,
    });
    this.addFloat(cx, cy - 10, def.name.toUpperCase(), defPlanet.theme.accent);

    this.buildMode = null;
    this.buildGhost = null;
    this.dirty = true;

    if (result.claimed) {
      this.ui.toast({
        title: `${defPlanet.name.toUpperCase()} COLONIZADO`,
        text: 'O farol fincou a bandeira da humanidade neste mundo. Uma nova colônia floresce.',
        tone: 'gold',
        iconName: 'beacon',
        duration: 6000,
      });
      this.burst(cx, cy, '#ffd166', 40, {
        speed: 140, size: 2.6, life: 1.4, glow: true, gravity: 40,
      });
    }

    this.applyQuestsAndUnlocks();
    this.saveNow(false);
    this.ui.refresh(true);
  }

  cancelBuild() {
    if (!this.buildMode) return;
    this.buildMode = null;
    this.buildGhost = null;
    this.ui.refresh(true);
    this.audio.sfx('click');
  }

  // ----------------------------------------------------------
  // Menus e mapa
  // ----------------------------------------------------------

  anyOverlayOpen() {
    return Boolean(this.overlays.build || this.overlays.map || this.overlays.help || this.overlays.pause);
  }

  openMap() {
    if (!this.state || this.travelAnim) return;
    if (this.overlays.map) {
      this.closeOverlay('map');
      return;
    }
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.buildMode = null;
    this.buildGhost = null;
    this.overlays.map = true;
    this.ui.hideAllOverlays();
    this.ui.showMap();
    this.audio.sfx('click');
  }

  openHelp() {
    if (!this.state) return;
    if (this.overlays.help) {
      this.closeOverlay('help');
      return;
    }
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.overlays.help = true;
    this.ui.hideAllOverlays();
    this.ui.showHelp();
    this.audio.sfx('click');
  }

  openPause() {
    if (!this.state || this.travelAnim) return;
    if (this.overlays.pause) {
      this.closeOverlay('pause');
      return;
    }
    this.overlays = { build: false, map: false, help: false, pause: false };
    this.buildMode = null;
    this.buildGhost = null;
    this.overlays.pause = true;
    this.ui.hideAllOverlays();
    this.ui.showPause();
    this.audio.sfx('click');
  }

  closeOverlay(name) {
    if (!name) {
      if (this.overlays.pause) return this.closeOverlay('pause');
      if (this.overlays.help) return this.closeOverlay('help');
      if (this.overlays.map) return this.closeOverlay('map');
      if (this.overlays.build) return this.closeOverlay('build');
      return;
    }
    if (name === 'map' && this.travelAnim) return;
    this.overlays[name] = false;
    if (name === 'build') {
      this.buildMode = null;
      this.buildGhost = null;
      this.ui.hideBuild();
      this.ui.refresh(true);
    } else if (name === 'map') {
      this.ui.hideMap();
    } else if (name === 'help') {
      this.ui.hideHelp();
    } else if (name === 'pause') {
      this.ui.hidePause();
    }
    this.audio.sfx('click');
  }

  selectPlanet(id) {
    if (!this.state || this.travelAnim) return;
    this.ui.selectPlanet(id);
    this.audio.sfx('click');
  }

  travelTo(planetId) {
    if (!this.state || this.travelAnim) return;
    const state = this.state;
    if (planetId === state.planetId) return;
    const def = planetById(planetId);
    const unlock = planetUnlocked(state, def);
    if (!unlock.ok) {
      this.ui.toast({
        title: 'ROTA BLOQUEADA',
        text: `Requisitos pendentes: ${unlock.reasons.join(' · ')}.`,
        tone: 'red',
        iconName: 'lock',
        duration: 3600,
      });
      this.audio.sfx('error');
      return;
    }
    const cost = travelCost(state, def);
    if ((state.resources.energy || 0) < cost) {
      this.ui.toast({
        title: 'ENERGIA INSUFICIENTE',
        text: `A dobra consome ${cost} EN. Gere mais energia e tente novamente.`,
        tone: 'red',
        iconName: 'energy',
        duration: 3600,
      });
      this.audio.sfx('error');
      return;
    }
    if (!pay(state, { energy: cost })) return;

    this.dirty = true;
    this.saveNow(false);
    this.audio.unlock();
    this.audio.sfx('travel');
    this.travelAnim = {
      fromId: state.planetId,
      toId: planetId,
      start: performance.now(),
      duration: 3000,
    };
    this.ui.renderMapSide();
    this.ui.refresh(true);
  }

  updateTravel() {
    if (!this.travelAnim) return;
    const anim = this.travelAnim;
    if (performance.now() < anim.start + anim.duration) return;

    const state = this.state;
    const def = planetById(anim.toId);
    const dest = state.planets[anim.toId];
    this.travelAnim = null;
    state.planetId = anim.toId;
    dest.visits = (dest.visits || 0) + 1;
    state.stats.traveled += 1;
    state.player = { x: dest.spawn.x, y: dest.spawn.y, dir: 'down' };

    this.ui.mapSelected = anim.toId;
    this.ui.map.selected = anim.toId;
    this.overlays.map = false;
    this.ui.hideMap();

    this.snapCamera();
    this.drone.x = state.player.x + 24;
    this.drone.y = state.player.y - 3;
    this.audio.sfx('arrive');
    this.ui.refresh(true);

    this.burst(dest.spawn.x, dest.spawn.y, def.theme.accent, 30, {
      speed: 120, size: 2.4, life: 1.1, glow: true, gravity: 30,
    });

    this.ui.toast({
      title: `POUSO EM ${def.name.toUpperCase()}`,
      text: dest.claimed
        ? `Colônia ativa · ${dest.pop} colonos · ${dest.buildings.length} estruturas.`
        : 'Mundo virgem. Construa um Farol de Colonização para reivindicar este território.',
      tone: dest.claimed ? 'green' : 'gold',
      iconName: 'pad',
      duration: 5600,
    });

    this.applyQuestsAndUnlocks();
    this.saveNow(false);
    this.ui.updateContinue();
  }

  // ----------------------------------------------------------
  // Ferramentas, som e feedback
  // ----------------------------------------------------------

  selectTool(id) {
    if (!this.state) return;
    if (id === 'build') {
      this.openBuild();
      return;
    }
    if (!TOOLS.some((t) => t.id === id)) return;
    this.state.tool = id;
    this.tool = id;
    if (this.buildMode) this.cancelBuild();
    this.dirty = true;
    this.audio.sfx('click');
    this.ui.refresh(true);
  }

  selectSeed(id) {
    if (!this.state) return;
    if (!CROPS[id]) return;
    this.state.seedType = id;
    this.state.tool = 'seed';
    this.tool = 'seed';
    this.dirty = true;
    this.audio.sfx('click');
    this.ui.refresh(true);
  }

  cycleSeed() {
    if (!this.state) return;
    const index = CROP_ORDER.indexOf(this.state.seedType);
    const next = CROP_ORDER[(index + 1) % CROP_ORDER.length];
    this.state.seedType = next;
    this.state.tool = 'seed';
    this.tool = 'seed';
    this.dirty = true;
    this.audio.sfx('click');
    this.ui.refresh(true);
  }

  toggleSound() {
    if (!this.state) return;
    this.audio.unlock();
    const muted = !Boolean(this.state.settings?.muted);
    this.state.settings = { ...(this.state.settings || {}), muted };
    this.audio.setMuted(muted);
    if (!muted) this.audio.startAmbient();
    this.ui.updateSoundUI();
    this.dirty = true;
    this.ui.toast({
      title: muted ? 'SOM DESLIGADO' : 'SOM LIGADO',
      text: muted ? 'O ambiente de Aurora está em silêncio.' : 'Trilha e efeitos sintetizados reativados.',
      tone: 'violet',
      iconName: muted ? 'mute' : 'sound',
      duration: 2200,
    });
  }

  playerFeedback(text, tile) {
    const short = String(text || '').replace(/\.$/, '');
    const x = (tile.tx + 0.5) * TILE;
    const y = tile.ty * TILE + 2;
    this.addFloat(x, y, short, '#ff8a9a');
    this.audio.sfx('error');
  }

  addFloat(x, y, text, color = '#e9f1ff') {
    this.floats.push({
      x, y, text, color,
      life: 1.15, max: 1.15,
      vy: -26,
    });
    if (this.floats.length > 24) this.floats.shift();
  }

  burst(x, y, color, count = 10, opts = {}) {
    const {
      speed = 70, size = 2, life = 0.7, glow = true,
      gravity = 0, shape = 'circle', spread = Math.PI * 2,
      angle = Math.random() * Math.PI * 2,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.9);
      const l = life * (0.6 + Math.random() * 0.8);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.18,
        life: l, max: l,
        size: size * (0.6 + Math.random() * 0.8),
        color, glow, gravity, shape,
      });
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity || 0) * dt;
      p.vx *= 1 - dt * 0.8;
      p.vy *= 1 - dt * 0.4;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 1 - dt * 1.4;
    }
  }

  updateAmbient(dt) {
    this.ambientTimer += dt;
    if (this.ambientTimer < 0.22) return;
    this.ambientTimer = 0;
    if (this.particles.length > 180) return;
    const state = this.state;
    const def = planetById(state.planetId);
    const player = state.player;
    const x = player.x + (Math.random() - 0.5) * this.renderer.vw / this.renderer.zoom;
    const y = player.y + (Math.random() - 0.5) * this.renderer.vh / this.renderer.zoom;
    this.particles.push({
      x, y,
      vx: 4 + Math.random() * 10,
      vy: -3 - Math.random() * 8,
      life: 2.4 + Math.random() * 2.4,
      max: 4.8,
      size: 0.8 + Math.random() * 1.2,
      color: def.theme.dust,
      glow: Math.random() > 0.45,
      gravity: 0,
      shape: 'circle',
    });
  }

  spawnAmbientBurst(color, count) {
    if (!this.state) return;
    const p = this.state.player;
    this.burst(p.x, p.y - 8, color, count, {
      speed: 60, size: 1.5, life: 1.4, glow: true, gravity: -10,
    });
  }

  spawnPlotSparkle(plot) {
    if (Math.random() > 0.14) return;
    const crop = CROPS[plot.crop.species];
    this.burst((plot.tx + 0.5) * TILE, (plot.ty + 0.35) * TILE, crop?.color || '#ffd166', 1, {
      speed: 12, size: 1.2, life: 1.1, glow: true, gravity: -16,
    });
  }

  // ----------------------------------------------------------
  // Entrada
  // ----------------------------------------------------------

  bind() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.clampCamera();
    });

    window.addEventListener('pointermove', (e) => {
      this.mouse.screenX = e.clientX;
      this.mouse.screenY = e.clientY;
      this.mouse.inside = e.target === this.canvas;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.state || this.anyOverlayOpen() || this.travelAnim) return;
      this.audio.unlock();
      if (!this.audio.started) this.audio.startAmbient();
      if (e.button === 2) {
        if (this.buildMode) this.cancelBuild();
        return;
      }
      if (e.button !== 0) return;
      this.mouse.screenX = e.clientX;
      this.mouse.screenY = e.clientY;
      this.mouse.inside = true;
      this.updateAim();
      const tile = this.tileFromScreen(e.clientX, e.clientY);
      if (this.buildMode) {
        this.updateBuildGhost();
        this.placeAtGhost();
        return;
      }
      if (tile) this.useCurrentTool(tile);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.buildMode) this.cancelBuild();
    });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.x = 0;
      this.touch.y = 0;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state) this.saveNow(false);
      if (this.state) {
        if (document.hidden) this.audio.suspend();
        else this.audio.resume();
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.state) saveGame(this.state);
    });
  }

  tileFromScreen(clientX, clientY) {
    const { vw, vh, zoom } = this.renderer;
    const wx = this.camera.x + (clientX - vw / 2) / zoom;
    const wy = this.camera.y + (clientY - vh / 2) / zoom;
    const tile = worldToTile(wx, wy);
    if (tile.x < 0 || tile.y < 0 || tile.x >= WORLD_W || tile.y >= WORLD_H) return null;
    return tile;
  }

  onKeyDown(e) {
    if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;

    if (!this.state) {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.newGame();
      }
      return;
    }

    if (MOVE_KEYS.has(e.code)) {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }

    if (e.repeat) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.anyOverlayOpen()) this.closeOverlay();
      else if (this.buildMode) this.cancelBuild();
      else this.openPause();
      return;
    }

    if (e.code === 'KeyE' || e.code === 'Space') {
      e.preventDefault();
      if (!this.anyOverlayOpen()) this.useCurrentTool();
      return;
    }
    if (e.code === 'KeyQ') {
      if (!this.anyOverlayOpen()) this.cycleSeed();
      return;
    }

    const digit = /^Digit([1-6])$/.exec(e.code);
    if (digit) {
      const tool = TOOLS[Number(digit[1]) - 1];
      if (tool) {
        if (tool.id === 'build') this.openBuild();
        else {
          this.overlays = { build: false, map: false, help: false, pause: false };
          this.ui.hideAllOverlays();
          this.selectTool(tool.id);
        }
      }
      return;
    }

    if (e.code === 'KeyB') {
      if (this.overlays.build) this.closeOverlay('build');
      else if (!this.anyOverlayOpen()) this.openBuild();
      return;
    }
    if (e.code === 'KeyM') {
      this.openMap();
      return;
    }
    if (e.code === 'KeyH') {
      this.openHelp();
      return;
    }
    if (e.code === 'KeyF') {
      this.toggleSound();
    }
  }
}

// ============================================================
// Inicialização
// ============================================================

const game = new Game();
window.__colonia = game;

export { Game };
export default game;
