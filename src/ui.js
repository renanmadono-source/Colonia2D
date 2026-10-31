// ============================================================
// Interface — HUD, menus, mapa estelar e feedback
// ============================================================

import {
  PLANETS, planetById, RESOURCES, TOOLS, BUILDINGS, BUILD_ORDER,
  QUESTS, CROPS, CROP_ORDER, DAY_LENGTH,
} from './config.js';
import {
  formatNumber, clockLabel, claimedCount, totalBuildings, populationCap,
  productionSummary, canAfford, travelCost, planetUnlocked, questProgress,
  buildingCount,
} from './sim.js';
import { StarMap } from './map.js';
import { hasSave } from './save.js';

const ICONS = {
  energy: '<path d="M13 2 4.5 13.5H10l-1 8.5L20 10h-6l-1-8Z" fill="currentColor" stroke="none"/>',
  water: '<path d="M12 2.5S5.5 10 5.5 15a6.5 6.5 0 0 0 13 0c0-5-6.5-12.5-6.5-12.5Z"/>',
  food: '<path d="M20 4C11 4 5 8.5 5 15c0 2.5 1.5 4.5 4 5 6.5 1.3 11-6 11-16Z"/><path d="M4 21c2-6 6.5-10.5 12-13"/>',
  materials: '<path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4Z"/><path d="m4 7.4 8 4.6 8-4.6M12 12v9.2"/>',
  credits: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.7h5M9.5 14.3h5"/>',
  research: '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M8 15h8"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-28 12 12)"/><circle cx="19" cy="8" r="1.3" fill="currentColor" stroke="none"/>',
  hammer: '<path d="m14.5 5.5 4 4M3 21l7-7"/><path d="M12 3.5 20 11.5l-2.4 2.4-8-8L12 3.5Z"/><path d="m6.5 13.5 4 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.9 2.9 0 1 1 4.3 2.6c-.9.5-1.5 1-1.5 2.1"/><circle cx="12" cy="17.5" r=".7" fill="currentColor" stroke="none"/>',
  sound: '<path d="M4 9.5v5h3l4 3.5v-12L7 9.5H4Z"/><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10"/>',
  mute: '<path d="M4 9.5v5h3l4 3.5v-12L7 9.5H4Z"/><path d="m15.5 10 4 4M19.5 10l-4 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  hoe: '<path d="M4 20 15.5 8.5"/><path d="M13 5.5 18.5 11l-2.5 2.5L10.5 8 13 5.5Z"/><path d="m4 20 2.5-1"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13C8 13 5 10 5 5c4 0 7 3 7 8Z"/><path d="M12 13c4 0 7-3 7-8-4 0-7 3-7 8Z"/>',
  sickle: '<path d="M20 4C11 4 5 9 5 16c0 2 1 4 3 4 4-9 8-11 12-12Z"/><path d="m7 20 4-5"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 10.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-1c-2 0-3.5-1-5-3l-4-6a1.6 1.6 0 0 1 2.6-1.8L8 13"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  leaf: '<path d="M20 4C11 4 5 8.5 5 15c0 2.5 1.5 4.5 4 5 6.5 1.3 11-6 11-16Z"/><path d="M4 21c2-6 6.5-10.5 12-13"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M8 15h8"/>',
  beacon: '<path d="M12 22V8M8 22h8"/><path d="m9 8 3-6 3 6"/><path d="m6 4 2.5 3M18 4l-2.5 3"/>',
  pad: '<ellipse cx="12" cy="17" rx="9" ry="3.5"/><path d="M8 17v-5h8v5"/><path d="m8 12 4-5 4 5"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 6.5"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9 2.9-6Z"/>',
  play: '<path d="M7 4.5 19 12 7 19.5v-15Z" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  save: '<path d="M4 4h13l3 3v13H4V4Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
  sparkle: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="m6 6 2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 4.5 7 4.5 9S15 17.5 12 21c-3-3.5-4.5-7-4.5-9S9 6.5 12 3Z"/>',
};

const ICON_BY_RES = {
  energy: 'energy', water: 'water', food: 'food',
  materials: 'materials', credits: 'credits', research: 'research',
};

function icon(name, cls = '') {
  const body = ICONS[name] || ICONS.star;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rewardLabel(reward) {
  if (!reward) return '';
  const parts = [];
  for (const [key, value] of Object.entries(reward)) {
    const meta = RESOURCES.find((r) => r.key === key);
    parts.push(`+${formatNumber(value)} ${meta?.short || key.toUpperCase()}`);
  }
  return parts.join(' · ');
}

function costChips(cost, state) {
  return Object.entries(cost || {}).map(([key, value]) => {
    const meta = RESOURCES.find((r) => r.key === key);
    const short = meta?.short || key.slice(0, 2).toUpperCase();
    const enough = (state.resources[key] || 0) + 1e-6 >= value;
    return `<span class="build-cost ${enough ? '' : 'insufficient'}">${icon(ICON_BY_RES[key] || 'materials')}${value} ${short}</span>`;
  }).join('');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.state = null;
    this.acc = 0;
    this.lastSig = {};
    this.toastTimers = new Set();
    this.mapSelected = 'nix';
    this.muted = false;

    this.refs = {
      title: document.getElementById('title-screen'),
      hud: document.getElementById('hud'),
      planet: document.getElementById('hud-planet'),
      biome: document.getElementById('hud-biome'),
      day: document.getElementById('hud-day'),
      resourceBar: document.getElementById('resource-bar'),
      questPanel: document.getElementById('quest-panel'),
      questList: document.getElementById('quest-list'),
      questTag: document.getElementById('quest-tag'),
      colonyStatus: document.getElementById('colony-status'),
      colonyPop: document.getElementById('colony-pop'),
      colonyCap: document.getElementById('colony-cap'),
      colonyHappy: document.getElementById('colony-happy'),
      happyMeter: document.getElementById('happy-meter'),
      colonyProduction: document.getElementById('colony-production'),
      colonyBuildings: document.getElementById('colony-buildings'),
      colonyCycles: document.getElementById('colony-cycles'),
      hotbar: document.getElementById('hotbar'),
      hotbarContext: document.getElementById('hotbar-context'),
      seedPicker: document.getElementById('seed-picker'),
      actionHint: document.getElementById('action-hint'),
      toasts: document.getElementById('toasts'),
      tileTip: document.getElementById('tile-tip'),
      buildScreen: document.getElementById('build-screen'),
      buildGrid: document.getElementById('build-grid'),
      buildFootnote: document.getElementById('build-footnote'),
      mapScreen: document.getElementById('map-screen'),
      mapSide: document.getElementById('map-side'),
      mapColonies: document.getElementById('map-colonies'),
      mapCanvas: document.getElementById('orbit-canvas'),
      planetSwitch: document.getElementById('planet-switch'),
      helpScreen: document.getElementById('help-screen'),
      pauseScreen: document.getElementById('pause-screen'),
      pauseStats: document.getElementById('pause-stats'),
      travelScreen: document.getElementById('travel-screen'),
      travelDest: document.getElementById('travel-dest'),
      travelProgress: document.getElementById('travel-progress'),
      joystick: document.getElementById('joystick'),
      actionButton: document.getElementById('touch-action'),
      continueBtn: document.getElementById('btn-continue'),
      playBtn: document.getElementById('btn-play'),
      fade: document.getElementById('fade'),
    };

    this.resEls = {};
    this.map = new StarMap(this.refs.mapCanvas, game);
    this.buildResourceBar();
    this.buildHotbar();
    this.buildSeedPicker();
    this.bind();
    this.updateContinue();
    this.updateSoundUI();
  }

  setState(state) {
    this.state = state;
    this.muted = Boolean(state.settings?.muted);
    this.mapSelected = state.planetId;
    this.map.selected = state.planetId;
    this.refresh(true);
    this.renderMapStatic();
  }

  buildResourceBar() {
    this.refs.resourceBar.innerHTML = RESOURCES.map((r) => `
      <div class="res-chip" data-res="${r.key}" title="${r.label}">
        <span class="res-icon">${icon(ICON_BY_RES[r.key])}</span>
        <span class="res-text">
          <span class="res-value" data-value="${r.key}">0</span>
          <span class="res-label">${r.label}</span>
        </span>
      </div>
    `).join('');
    for (const r of RESOURCES) {
      this.resEls[r.key] = this.refs.resourceBar.querySelector(`[data-value="${r.key}"]`);
    }
  }

  buildHotbar() {
    this.refs.hotbar.innerHTML = TOOLS.map((tool, i) => `
      <button class="tool-slot ${tool.id === 'build' ? 'accent' : ''}" data-tool="${tool.id}" title="${tool.hint}">
        <span class="tool-key">${i + 1}</span>
        <span class="tool-icon">${icon(tool.icon)}</span>
        <span class="tool-name" ${tool.id === 'seed' ? 'id="seed-name"' : ''}>${tool.id === 'seed' ? 'LUMEN' : tool.short}</span>
        ${tool.id === 'seed' ? `<span class="tool-badge" id="seed-count">0</span><span class="seed-dot" id="seed-dot" style="color:#ffd166"></span>` : ''}
      </button>
    `).join('');
    this.refs.seedCount = document.getElementById('seed-count');
    this.refs.seedName = document.getElementById('seed-name');
    this.refs.seedDot = document.getElementById('seed-dot');
  }

  buildSeedPicker() {
    this.refs.seedPicker.innerHTML = CROP_ORDER.map((id) => {
      const crop = CROPS[id];
      return `<button class="seed-option" data-seed="${id}" title="${crop.blurb}">
        <span class="seed-dot" style="color:${crop.color}"></span>
        <span>${crop.short}</span>
        <b data-seed-count="${id}">0</b>
      </button>`;
    }).join('');
  }

  bind() {
    this.refs.hotbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (!btn) return;
      const tool = btn.dataset.tool;
      if (tool === 'build') this.game.openBuild();
      else if (tool === 'seed' && this.game.tool === 'seed') this.game.cycleSeed();
      else this.game.selectTool(tool);
    });
    this.refs.hotbar.addEventListener('contextmenu', (e) => {
      const btn = e.target.closest('[data-tool="seed"]');
      if (!btn) return;
      e.preventDefault();
      this.game.cycleSeed();
    });
    this.refs.seedPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-seed]');
      if (!btn) return;
      this.game.selectSeed(btn.dataset.seed);
      this.game.selectTool('seed');
    });

    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.audio.unlock();
        this.game.audio.sfx('click');
        const action = btn.dataset.action;
        if (action === 'map') this.game.openMap();
        else if (action === 'build') this.game.openBuild();
        else if (action === 'help') this.game.openHelp();
        else if (action === 'sound') this.game.toggleSound();
        else if (action === 'pause') this.game.openPause();
      });
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.closeOverlay(btn.dataset.close));
    });

    this.refs.buildGrid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-build]');
      if (!card) return;
      this.game.chooseBuilding(card.dataset.build);
    });

    this.refs.mapSide.addEventListener('click', (e) => {
      if (e.target.closest('[data-travel]')) {
        this.game.travelTo(this.mapSelected);
      }
    });

    this.refs.planetSwitch.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-planet]');
      if (!btn) return;
      this.game.selectPlanet(btn.dataset.planet);
    });

    document.querySelectorAll('[data-pause]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.pause;
        if (action === 'resume') this.game.closeOverlay('pause');
        else if (action === 'save') this.game.saveNow(true);
        else if (action === 'help') this.game.openHelp();
        else if (action === 'sound') this.game.toggleSound();
        else if (action === 'title') this.game.returnToTitle();
        else if (action === 'reset') this.game.resetGame();
      });
    });

    this.refs.playBtn.addEventListener('click', () => this.game.newGame());
    this.refs.continueBtn.addEventListener('click', () => this.game.continueGame());

    window.addEventListener('resize', () => {
      if (!this.refs.mapScreen.classList.contains('hidden')) this.map.resize();
    });

    // Joystick virtual
    const stick = this.refs.joystick;
    const knob = stick.querySelector('.joystick-knob');
    let pointerId = null;
    let center = { x: 0, y: 0 };
    const reset = () => {
      pointerId = null;
      knob.style.transform = 'translate(-50%, -50%)';
      this.game.touch.x = 0;
      this.game.touch.y = 0;
    };
    const update = (e) => {
      const dx = e.clientX - center.x;
      const dy = e.clientY - center.y;
      const max = 36;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, max / len);
      const ox = dx * k;
      const oy = dy * k;
      knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      const nx = ox / max;
      const ny = oy / max;
      this.game.touch.x = Math.abs(nx) > 0.16 ? nx : 0;
      this.game.touch.y = Math.abs(ny) > 0.16 ? ny : 0;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointerId = e.pointerId;
      stick.setPointerCapture(pointerId);
      const rect = stick.getBoundingClientRect();
      center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      update(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (pointerId !== e.pointerId) return;
      e.preventDefault();
      update(e);
    });
    stick.addEventListener('pointerup', reset);
    stick.addEventListener('pointercancel', reset);
    stick.addEventListener('lostpointercapture', reset);

    this.refs.actionButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.game.audio.unlock();
      this.game.useCurrentTool();
    });

    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('#game')) e.preventDefault();
    });
  }

  updateContinue() {
    if (!this.refs.continueBtn) return;
    if (hasSave()) this.refs.continueBtn.classList.remove('hidden');
    else this.refs.continueBtn.classList.add('hidden');
  }

  showTitle() {
    this.refs.title.classList.remove('hidden');
    this.refs.hud.classList.add('hidden');
    this.hideAllOverlays();
    this.refs.tileTip.classList.add('hidden');
    this.updateContinue();
  }

  showGame() {
    this.refs.title.classList.add('hidden');
    this.refs.hud.classList.remove('hidden');
  }

  hideAllOverlays() {
    this.refs.buildScreen.classList.add('hidden');
    this.refs.mapScreen.classList.add('hidden');
    this.refs.helpScreen.classList.add('hidden');
    this.refs.pauseScreen.classList.add('hidden');
    this.refs.travelScreen.classList.add('hidden');
  }

  showBuild() {
    if (!this.state) return;
    this.renderBuildCards();
    this.refs.buildScreen.classList.remove('hidden');
  }

  hideBuild() {
    this.refs.buildScreen.classList.add('hidden');
  }

  renderBuildCards() {
    const state = this.state;
    const planet = state.planets[state.planetId];
    const def = planetById(state.planetId);
    const cards = [];
    for (const type of BUILD_ORDER) {
      const bd = BUILDINGS[type];
      if (!bd || bd.hidden) continue;
      if (type === 'beacon' && planet.claimed) continue;
      let lock = '';
      if (!planet.claimed && !bd.claim) lock = 'Reivindique o planeta primeiro';
      else if ((state.resources.research || 0) < (bd.research || 0)) lock = `Requer ${bd.research} de pesquisa`;
      const poor = !canAfford(state, bd.cost);
      const outputs = bd.output && Object.keys(bd.output).length
        ? Object.entries(bd.output).map(([key, value]) => {
          const meta = RESOURCES.find((r) => r.key === key);
          return `<span class="build-out">${icon(ICON_BY_RES[key] || 'materials')}+${value} ${meta?.short || ''}</span>`;
        }).join('')
        : '';
      const special = bd.claim ? '<span class="build-out">REIVINDICA PLANETA</span>'
        : type === 'pad' ? '<span class="build-out">VIAGENS -25%</span>'
          : type === 'habitat' ? `<span class="build-out">CAPACIDADE +${bd.cap}</span>` : '';
      cards.push(`
        <button class="build-card ${lock ? 'locked' : ''} ${poor ? 'poor' : ''}" data-build="${type}" title="${esc(bd.desc)}">
          <div class="build-card-top">
            <div class="build-icon">${icon(bd.icon || 'home')}</div>
            <div class="build-size">${bd.size[0]}×${bd.size[1]} · ${bd.claim ? 'SETOR' : 'BASE'}</div>
          </div>
          <div class="build-name">${bd.name}</div>
          <div class="build-desc">${esc(bd.desc)}</div>
          <div class="build-meta">
            ${costChips(bd.cost, state)}
            ${outputs}
            ${special}
          </div>
          ${lock ? `<div class="build-lock">${icon('lock')}${lock}</div>` : ''}
        </button>
      `);
    }
    this.refs.buildGrid.innerHTML = cards.join('');
    this.refs.buildFootnote.textContent = !planet.claimed
      ? `Setor ${def.name.toUpperCase()} não reivindicado — construa um farol para fundar a colônia.`
      : `Setor ${def.name.toUpperCase()} reivindicado · ${planet.buildings.length} estruturas · os recursos são consumidos ao posicionar.`;
  }

  showMap() {
    if (!this.state) return;
    this.mapSelected = this.state.planetId;
    this.map.selected = this.state.planetId;
    this.renderMapStatic();
    this.refs.mapScreen.classList.remove('hidden');
    this.map.resize();
    this.game.selectPlanet(this.mapSelected);
  }

  hideMap() {
    this.refs.mapScreen.classList.add('hidden');
    this.refs.travelScreen.classList.add('hidden');
  }

  renderMapStatic() {
    if (!this.state) return;
    const state = this.state;
    const total = claimedCount(state);
    this.refs.mapColonies.textContent = `${total} / ${PLANETS.length} COLONIZADOS`;
    this.refs.planetSwitch.innerHTML = PLANETS.map((p) => {
      const current = p.id === state.planetId;
      const claimed = state.planets[p.id]?.claimed;
      const color = claimed ? (current ? '#6ee7ff' : '#7dffb2') : '#6b7a98';
      return `<button class="planet-pill ${p.id === this.mapSelected ? 'selected' : ''}" data-planet="${p.id}">
        <i style="background:${color};box-shadow:0 0 6px ${color}"></i>${p.name.toUpperCase()}${current ? ' · ATUAL' : ''}
      </button>`;
    }).join('');
    this.renderMapSide();
  }

  selectPlanet(id) {
    this.mapSelected = id;
    this.map.selected = id;
    this.renderMapSide();
    this.refs.planetSwitch.querySelectorAll('.planet-pill').forEach((el) => {
      el.classList.toggle('selected', el.dataset.planet === id);
    });
  }

  renderMapSide() {
    if (!this.state) return;
    const state = this.state;
    const def = planetById(this.mapSelected);
    const planet = state.planets[this.mapSelected];
    const isCurrent = state.planetId === this.mapSelected;
    const claimed = planet?.claimed;
    const unlock = planetUnlocked(state, def);
    const cost = travelCost(state, def);
    const energy = state.resources.energy || 0;
    const hasPad = state.planets[state.planetId]?.buildings.some((b) => b.type === 'pad');
    const statusClass = isCurrent ? 'cur' : claimed ? 'claimed' : unlock.ok ? 'open' : 'locked';
    const statusLabel = isCurrent ? 'VOCÊ ESTÁ AQUI' : claimed ? 'COLONIZADO' : unlock.ok ? 'DISPONÍVEL' : 'ROTA BLOQUEADA';

    let note = '';
    if (isCurrent) {
      note = `Sua colônia atual · ${planet.buildings.length} estruturas · ${planet.pop}/${populationCap(planet)} colonos.`;
    } else if (!claimed && unlock.ok) {
      note = 'Ao pousar, construa um Farol de Colonização (80 MT · 40 EN) para reivindicar o mundo.';
    } else if (!unlock.ok) {
      note = `Requisitos pendentes: ${unlock.reasons.join(' · ')}.`;
    } else {
      note = `Colônia estável · ${planet.pop} colonos · ${planet.buildings.length} estruturas.`;
    }

    const travelBase = def.travel || 0;
    const travelNote = hasPad && !isCurrent
      ? `${travelBase} EN base · plataforma de pouso ativa (-25%)`
      : `${travelBase} EN por viagem`;

    let button = '';
    let disabled = false;
    if (isCurrent) {
      button = 'VOCÊ ESTÁ AQUI';
      disabled = true;
    } else if (!unlock.ok) {
      button = 'BLOQUEADO';
      disabled = true;
    } else if (energy < cost) {
      button = `ENERGIA INSUFICIENTE · ${cost} EN`;
      disabled = true;
    } else {
      button = `VIAJAR · ${cost} EN`;
    }

    this.refs.mapSide.innerHTML = `
      <div class="map-status ${statusClass}"><i class="dot ${isCurrent ? 'current' : claimed ? 'claimed' : 'open'}"></i>${statusLabel}</div>
      <div>
        <h3 class="map-name">${def.name.toUpperCase()}</h3>
        <div class="map-type">${def.type.toUpperCase()}</div>
      </div>
      <p class="map-desc">${esc(def.blurb)}</p>
      <div class="map-perks">${def.perks.map((p) => `<span class="perk">${esc(p)}</span>`).join('')}</div>
      <div class="map-rows">
        <div class="map-row"><span>PESQUISA NECESSÁRIA</span><b class="${unlock.researchOk ? 'ok' : 'bad'}">${def.unlock.research}</b></div>
        <div class="map-row"><span>COLÔNIAS NECESSÁRIAS</span><b class="${unlock.coloniesOk ? 'ok' : 'bad'}">${def.unlock.colonies}</b></div>
        <div class="map-row"><span>CUSTO DE VIAGEM</span><b>${isCurrent ? '—' : `${cost} EN`}</b></div>
        <div class="map-row"><span>SUA ENERGIA</span><b class="${energy >= cost ? 'ok' : 'bad'}">${formatNumber(energy)} EN</b></div>
      </div>
      <div class="map-note">${note}<br />${isCurrent ? '' : travelNote}</div>
      <button class="btn btn-primary" data-travel ${disabled ? 'disabled' : ''}>${button}</button>
    `;
  }

  showHelp() {
    this.refs.helpScreen.classList.remove('hidden');
  }

  hideHelp() {
    this.refs.helpScreen.classList.add('hidden');
  }

  showPause() {
    if (!this.state) return;
    const state = this.state;
    this.refs.pauseStats.innerHTML = `
      <div class="pause-stat"><span>DIA</span><b>${state.time.day}</b></div>
      <div class="pause-stat"><span>COLÔNIAS</span><b>${claimedCount(state)}/${PLANETS.length}</b></div>
      <div class="pause-stat"><span>COLHEITAS</span><b>${state.stats.harvested}</b></div>
    `;
    this.refs.pauseScreen.classList.remove('hidden');
    this.updateSoundUI();
  }

  hidePause() {
    this.refs.pauseScreen.classList.add('hidden');
  }

  updateSoundUI() {
    const muted = this.game.audio.muted || this.state?.settings?.muted;
    this.muted = Boolean(muted);
    const soundBtn = document.querySelector('[data-action="sound"] .ib-icon');
    if (soundBtn) soundBtn.innerHTML = icon(this.muted ? 'mute' : 'sound');
    const pauseSound = document.querySelector('[data-pause="sound"]');
    if (pauseSound) pauseSound.textContent = this.muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO';
  }

  toast({ title, text = '', tone = '', iconName = 'star', duration = 4000 }) {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.innerHTML = `
      <div class="toast-icon">${icon(iconName)}</div>
      <div class="toast-body">
        <div class="toast-title">${esc(title)}</div>
        ${text ? `<div class="toast-text">${esc(text)}</div>` : ''}
      </div>
    `;
    this.refs.toasts.appendChild(el);
    while (this.refs.toasts.children.length > 4) {
      this.refs.toasts.removeChild(this.refs.toasts.firstElementChild);
    }
    const timer = setTimeout(() => {
      el.classList.add('out');
      this.toastTimers.delete(timer);
      setTimeout(() => el.remove(), 320);
    }, duration);
    this.toastTimers.add(timer);
  }

  questToast(quest) {
    this.toast({
      title: 'DIRETRIZ CONCLUÍDA',
      text: `${quest.title} · ${rewardLabel(quest.reward)}`,
      tone: 'gold',
      iconName: 'check',
      duration: 4800,
    });
  }

  tick(dt) {
    if (!this.state) return;
    this.acc += dt;
    if (this.acc < 0.1) {
      if (this.game.overlays.map) this.map.draw(this.game.clock);
      this.updateTravel();
      return;
    }
    this.acc = 0;
    this.refresh();
    if (this.game.overlays.map) this.map.draw(this.game.clock);
    this.updateTravel();
  }

  refresh(force = false) {
    if (!this.state) return;
    const state = this.state;
    const def = planetById(state.planetId);
    const planet = state.planets[state.planetId];

    for (const r of RESOURCES) {
      const val = Math.max(0, state.resources[r.key] || 0);
      if (this.resEls[r.key]) this.resEls[r.key].textContent = formatNumber(val);
    }
    this.refs.planet.textContent = def.name.toUpperCase();
    this.refs.biome.textContent = def.type;
    this.refs.day.textContent = `DIA ${state.time.day} · ${clockLabel(state.time.t)}`;
    this.refs.mapColonies.textContent = `${claimedCount(state)} / ${PLANETS.length} COLONIZADOS`;

    this.refreshQuests(force);
    this.refreshColony(force);
    this.refreshHotbar();
    this.refreshSeedPicker();
    this.refreshHint();
    this.refreshTileTip();
    this.refreshBuildBanner();
  }

  refreshQuests(force) {
    const state = this.state;
    const remaining = QUESTS.filter((q) => !state.completedQuests.includes(q.id));
    const shown = remaining.slice(0, 3);
    const sig = shown.map((q) => `${q.id}:${questProgress(state, q)}`).join('|') + `:${remaining.length}`;
    if (!force && sig === this.lastSig.quests) return;
    this.lastSig.quests = sig;
    this.refs.questTag.textContent = `${state.completedQuests.length}/${QUESTS.length}`;
    if (!shown.length) {
      this.refs.questList.innerHTML = '<div class="quest-empty">TODAS AS DIRETRIZES CONCLUÍDAS · SISTEMA AURORA UNIFICADO</div>';
      return;
    }
    this.refs.questList.innerHTML = shown.map((q) => {
      const value = Math.min(questProgress(state, q), q.goal);
      const pct = Math.min(100, (questProgress(state, q) / q.goal) * 100);
      return `
        <div class="quest-item">
          <div class="quest-top">
            <span class="quest-title">${esc(q.title)}</span>
            <span class="quest-reward">${rewardLabel(q.reward)}</span>
          </div>
          <div class="quest-sub">${esc(q.detail)}</div>
          <div class="quest-progress">
            <div class="meter"><span style="width:${pct}%"></span></div>
            <span class="quest-count">${value}/${q.goal}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  refreshColony(force) {
    const state = this.state;
    const def = planetById(state.planetId);
    const planet = state.planets[state.planetId];
    const cap = populationCap(planet);
    const happiness = Math.round(planet.happiness);
    const summary = productionSummary(state, def, planet);
    const prodRows = [];
    for (const [key, value] of Object.entries(summary.gains)) {
      if (value <= 0.05) continue;
      const meta = RESOURCES.find((r) => r.key === key);
      prodRows.push(`<div class="prod-row">${icon(ICON_BY_RES[key])}<span>${meta?.label || key}</span><b>+${value >= 10 ? Math.round(value) : value.toFixed(1)}</b></div>`);
    }
    if (summary.consumption.food > 0.01) {
      prodRows.push(`<div class="prod-row">${icon('food')}<span>CONSUMO</span><b class="neg">-${summary.consumption.food.toFixed(1)}</b></div>`);
    }
    if (summary.consumption.water > 0.01) {
      prodRows.push(`<div class="prod-row">${icon('water')}<span>ÁGUA</span><b class="neg">-${summary.consumption.water.toFixed(1)}</b></div>`);
    }
    if (!prodRows.length) prodRows.push('<div class="prod-empty">Nenhuma produção ativa. Construa estruturas.</div>');

    const sig = `${planet.pop}/${cap}/${happiness}/${planet.cycles}/${planet.buildings.map((b) => b.type).join(',')}/${planet.claimed}/${Math.round(summary.gains.energy * 10)}/${Math.round(summary.gains.food * 10)}/${state.time.t > 0.5 ? 1 : 0}`;
    if (!force && sig === this.lastSig.colony) return;
    this.lastSig.colony = sig;

    this.refs.colonyPop.textContent = planet.pop;
    this.refs.colonyCap.textContent = `/${cap}`;
    this.refs.colonyHappy.textContent = happiness;
    this.refs.happyMeter.style.width = `${happiness}%`;
    this.refs.happyMeter.style.background = happiness < 35
      ? 'linear-gradient(90deg,#ff6b81,#ff9a63)'
      : happiness < 65
        ? 'linear-gradient(90deg,#ffd166,#7dffb2)'
        : 'linear-gradient(90deg,#6ee7ff,#7dffb2)';
    this.refs.colonyStatus.textContent = planet.claimed ? 'ATIVA' : 'FRONTEIRA';
    this.refs.colonyStatus.style.color = planet.claimed ? '' : 'var(--gold)';
    this.refs.colonyProduction.innerHTML = prodRows.join('');
    this.refs.colonyBuildings.textContent = `${planet.buildings.length} ${planet.buildings.length === 1 ? 'estrutura' : 'estruturas'}`;
    this.refs.colonyCycles.textContent = `CICLO ${planet.cycles}`;
  }

  refreshHotbar() {
    const state = this.state;
    const seed = CROPS[state.seedType] || CROPS.lumen;
    this.refs.hotbar.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.tool === state.tool);
    });
    const tool = TOOLS.find((t) => t.id === state.tool);
    this.refs.hotbarContext.textContent = state.tool === 'seed' ? `SEMENTE · ${seed.short}` : (tool?.short || '');
    if (this.refs.seedCount) {
      const count = state.seeds[state.seedType] || 0;
      this.refs.seedCount.textContent = count;
      this.refs.seedCount.classList.toggle('empty', count < 1);
    }
    if (this.refs.seedName) this.refs.seedName.textContent = seed.short;
    if (this.refs.seedDot) {
      this.refs.seedDot.style.color = seed.color;
      this.refs.seedDot.style.background = seed.color;
    }
  }

  refreshSeedPicker() {
    const state = this.state;
    const visible = state.tool === 'seed';
    this.refs.seedPicker.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.refs.seedPicker.querySelectorAll('[data-seed]').forEach((btn) => {
      const id = btn.dataset.seed;
      btn.classList.toggle('selected', id === state.seedType);
      const count = state.seeds[id] || 0;
      const b = btn.querySelector('[data-seed-count]');
      if (b) {
        b.textContent = count;
        b.classList.toggle('empty', count < 1);
      }
    });
  }

  refreshHint() {
    if (!this.state) return;
    const hint = this.game.getActionHint();
    if (!hint) {
      this.refs.actionHint.style.opacity = '0.4';
      return;
    }
    this.refs.actionHint.style.opacity = '1';
    this.refs.actionHint.classList.toggle('warn', Boolean(hint.warn));
    this.refs.actionHint.querySelector('.ah-key').textContent = hint.key || 'E';
    this.refs.actionHint.querySelector('.ah-icon').innerHTML = icon(hint.icon || 'hand');
    this.refs.actionHint.querySelector('.ah-text').innerHTML = hint.html || esc(hint.text || 'Interagir');
  }

  refreshTileTip() {
    const game = this.game;
    const info = game.getHoverInfo();
    const show = info && game.mouse.inside && !game.anyOverlayOpen() && !game.buildGhost;
    if (!show) {
      this.refs.tileTip.classList.add('hidden');
      return;
    }
    this.refs.tileTip.classList.remove('hidden');
    const rows = info.rows.map(([label, value, tone]) => `<div class="tt-row"><span>${esc(label)}</span><b class="${tone || ''}">${esc(value)}</b></div>`).join('');
    this.refs.tileTip.innerHTML = `<div class="tt-title">${esc(info.title)}</div>${rows}`;
    const pad = 16;
    const tw = this.refs.tileTip.offsetWidth;
    const th = this.refs.tileTip.offsetHeight;
    let x = game.mouse.screenX + pad;
    let y = game.mouse.screenY + pad;
    if (x + tw > window.innerWidth - 8) x = game.mouse.screenX - tw - pad;
    if (y + th > window.innerHeight - 8) y = game.mouse.screenY - th - pad;
    this.refs.tileTip.style.left = `${Math.max(8, x)}px`;
    this.refs.tileTip.style.top = `${Math.max(8, y)}px`;
  }

  refreshBuildBanner() {
    let banner = document.getElementById('build-banner');
    if (!this.game.buildMode) {
      if (banner) banner.remove();
      document.body.classList.remove('build-mode');
      return;
    }
    document.body.classList.add('build-mode');
    const def = BUILDINGS[this.game.buildMode];
    const cost = Object.entries(def.cost || {}).map(([key, value]) => {
      const meta = RESOURCES.find((r) => r.key === key);
      return `<span class="bb-cost">${value} ${meta?.short || key}</span>`;
    }).join(' · ');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'build-banner';
      this.refs.hud.appendChild(banner);
    }
    banner.innerHTML = `${icon('hammer')} CONSTRUINDO: <b>${def.name.toUpperCase()}</b> · ${cost} <span class="bb-cancel">· CLIQUE PARA POSICIONAR · ESC CANCELA</span>`;
  }

  updateTravel() {
    const anim = this.game.travelAnim;
    if (!anim) {
      this.refs.travelScreen.classList.add('hidden');
      return;
    }
    const dest = planetById(anim.toId);
    this.refs.travelScreen.classList.remove('hidden');
    this.refs.travelDest.textContent = dest.name.toUpperCase();
    const pct = Math.min(100, Math.max(0, ((performance.now() - anim.start) / anim.duration) * 100));
    this.refs.travelProgress.style.width = `${pct}%`;
    this.refs.travelProgress.parentElement.parentElement.querySelector('.travel-sub').textContent =
      pct < 35 ? 'Alinhando vetor de dobra…' : pct < 75 ? 'Dobrando o espaço-tempo…' : 'Preparando módulo de pouso…';
  }

  showBuildBannerError(text) {
    this.toast({ title: 'AÇÃO IMPOSSÍVEL', text, tone: 'red', iconName: 'close', duration: 3000 });
  }

  setFade(active) {
    this.refs.fade.classList.toggle('active', Boolean(active));
  }

  notifyNewDay(day) {
    this.toast({
      title: `DIA ${day} EM ${planetById(this.state.planetId).name.toUpperCase()}`,
      text: 'Novo ciclo de produção iniciado · recursos do dia disponíveis.',
      tone: 'violet',
      iconName: 'clock',
      duration: 3600,
    });
  }

  notifyColonist(planetName) {
    this.toast({
      title: 'NOVO COLONO',
      text: `Mais um sobrevivente chegou em ${planetName}. A colônia cresce.`,
      tone: 'green',
      iconName: 'sparkle',
    });
  }

  notifyUnlocked(planetName) {
    this.toast({
      title: 'ROTA DESBLOQUEADA',
      text: `${planetName} está ao alcance. Abra o mapa estelar (M) para planejar a viagem.`,
      tone: 'violet',
      iconName: 'orbit',
      duration: 5000,
    });
  }
}

export { icon, ICONS };
