// ============================================================
// Renderizador 2D — terreno, entidades, clima e título
// ============================================================

import {
  TILE, WORLD_W, WORLD_H, PLANETS, planetById, CROPS, BUILDINGS, NODE_TYPES, RESOURCES,
} from './config.js';
import { T, tileAt, getPlot, nodeIsActive } from './world.js';
import { daylight } from './sim.js';
import { makePlayerSprites, PLAYER_SPRITE_W, PLAYER_SPRITE_H } from './sprites.js';
import { hash2, hashString, mulberry32, clamp, lerp } from './rng.js';

const TAU = Math.PI * 2;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function mix(hexA, hexB, t) {
  const A = hexToRgb(hexA);
  const B = hexToRgb(hexB);
  const c = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${c(A.r, B.r)},${c(A.g, B.g)},${c(A.b, B.b)})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function glow(ctx, x, y, radius, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(color, 0.55 * alpha));
  g.addColorStop(0.45, rgba(color, 0.18 * alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function lamp(ctx, x, y, size, color, time, phase = 0) {
  const pulse = 0.55 + 0.45 * Math.sin(time * 2.2 + phase);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, size * 4, color, 0.55 * pulse);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function hazardStripe(ctx, x, y, w, h, color1 = '#20232e', color2 = '#ffb35c') {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color2;
  ctx.lineWidth = 2;
  for (let i = -h; i < w + h; i += 8) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sprites = makePlayerSprites();
    this.groundCache = new Map();
    this.weatherCache = new Map();
    this.time = 0;
    this.zoom = 2;
    this.vw = 1;
    this.vh = 1;
    this.dpr = 1;
    this.vignette = null;
    this.titleStars = [];
    this.resize();
  }

  resize() {
    this.vw = Math.max(320, window.innerWidth);
    this.vh = Math.max(320, window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.vw * this.dpr);
    this.canvas.height = Math.floor(this.vh * this.dpr);
    this.canvas.style.width = `${this.vw}px`;
    this.canvas.style.height = `${this.vh}px`;
    this.zoom = clamp(Math.min(this.vw / (21.5 * TILE), this.vh / (14.2 * TILE)), 1.18, 2.25);

    const ctx = this.ctx;
    const vg = ctx.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.28, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.72, 'rgba(0,0,0,0.18)');
    vg.addColorStop(1, 'rgba(0,0,0,0.58)');
    this.vignette = vg;

    if (!this.titleStars.length) this.generateTitleStars();
  }

  generateTitleStars() {
    const rng = mulberry32(20261031);
    this.titleStars = [];
    for (let i = 0; i < 220; i++) {
      this.titleStars.push({
        x: rng(),
        y: rng(),
        r: 0.4 + rng() * 1.7,
        phase: rng() * TAU,
        speed: 0.3 + rng() * 1.4,
        color: rng() > 0.82 ? '#b58cff' : rng() > 0.65 ? '#8fe4ff' : '#ffffff',
      });
    }
  }

  screenPosition(game, x, y) {
    return {
      x: this.vw / 2 + (x - game.camera.x) * this.zoom,
      y: this.vh / 2 + (y - game.camera.y) * this.zoom,
    };
  }

  ensureGround(def, planet) {
    const key = `${planet.id}:${planet.seed}`;
    if (this.groundCache.has(key)) return this.groundCache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = WORLD_W * TILE;
    canvas.height = WORLD_H * TILE;
    const ctx = canvas.getContext('2d');
    this.paintGround(ctx, def, planet);
    this.groundCache.set(key, canvas);
    return canvas;
  }

  paintGround(ctx, def, planet) {
    const theme = def.theme;
    const seed = planet.seed;
    const rng = mulberry32(seed ^ 0x1234567);

    ctx.fillStyle = theme.ground[0];
    ctx.fillRect(0, 0, WORLD_W * TILE, WORLD_H * TILE);

    for (let ty = 0; ty < WORLD_H; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) {
        const tile = planet.tiles[ty * WORLD_W + tx];
        const x = tx * TILE;
        const y = ty * TILE;
        const h = hash2(tx, ty, seed);
        if (tile === T.WATER) {
          const g = ctx.createLinearGradient(x, y, x, y + TILE);
          g.addColorStop(0, mix(theme.water, '#000000', 0.18));
          g.addColorStop(1, theme.water);
          ctx.fillStyle = g;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = rgba(theme.waterHi, 0.18 + h * 0.12);
          ctx.lineWidth = 1;
          for (let i = 0; i < 2; i++) {
            const wy = y + 7 + ((h * 19 + i * 13) % 20);
            const wx = x + 4 + ((h * 23 + i * 11) % 12);
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.quadraticCurveTo(wx + 5, wy - 2, wx + 10, wy);
            ctx.stroke();
          }
          continue;
        }
        if (tile === T.ROCK) {
          ctx.fillStyle = mix(theme.rock, theme.ground[0], 0.12);
          ctx.fillRect(x, y, TILE, TILE);
          const bx = x + 3 + h * 4;
          const by = y + 5 + ((h * 7) % 5);
          const bw = 23 + h * 5;
          const bh = 18 + h * 6;
          ctx.fillStyle = rgba('#000000', 0.35);
          ctx.beginPath();
          ctx.ellipse(bx + bw / 2 + 2, by + bh - 2, bw * 0.55, 6, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = theme.rockHi;
          ctx.beginPath();
          ctx.moveTo(bx, by + bh * 0.6);
          ctx.lineTo(bx + bw * 0.28, by + 2);
          ctx.lineTo(bx + bw * 0.62, by);
          ctx.lineTo(bx + bw, by + bh * 0.45);
          ctx.lineTo(bx + bw * 0.8, by + bh);
          ctx.lineTo(bx + bw * 0.2, by + bh);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = rgba('#000000', 0.3);
          ctx.beginPath();
          ctx.moveTo(bx + bw * 0.28, by + 2);
          ctx.lineTo(bx + bw * 0.62, by);
          ctx.lineTo(bx + bw, by + bh * 0.45);
          ctx.lineTo(bx + bw * 0.45, by + bh * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = rgba(theme.accent, 0.12 + h * 0.1);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + bw * 0.3, by + 5);
          ctx.lineTo(bx + bw * 0.45, by + bh * 0.4);
          ctx.stroke();
          continue;
        }

        const palette = theme.ground;
        const base = palette[Math.floor(h * palette.length) % palette.length];
        ctx.fillStyle = base;
        ctx.fillRect(x, y, TILE, TILE);

        // textura fina
        ctx.fillStyle = rgba('#ffffff', 0.025 + (h % 0.03));
        for (let i = 0; i < 3; i++) {
          const sx = x + ((h * (i + 2) * 37) % TILE);
          const sy = y + ((h * (i + 3) * 53) % TILE);
          ctx.fillRect(sx, sy, 1, 1);
        }

        if (tile === T.FERTILE) {
          ctx.fillStyle = rgba(theme.fertile, 0.85);
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = rgba(theme.accent, 0.1);
          for (let i = 0; i < 4; i++) {
            const sx = x + 4 + ((h * (i + 5) * 29) % 24);
            const sy = y + 4 + ((h * (i + 7) * 41) % 24);
            ctx.fillRect(sx, sy, 2, 2);
          }
          ctx.strokeStyle = rgba('#000000', 0.12);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 10 + h * 10);
          ctx.quadraticCurveTo(x + 16, y + 8 + h * 12, x + 27, y + 12 + h * 8);
          ctx.stroke();
        }

        const deco = hash2(tx, ty, seed + 19);
        if (deco > 0.88) {
          this.drawGroundDecor(ctx, def, x, y, tx, ty, deco, rng);
        }
      }
    }

    // bordas suaves de água e rocha
    for (let ty = 0; ty < WORLD_H; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) {
        const tile = planet.tiles[ty * WORLD_W + tx];
        if (tile !== T.WATER && tile !== T.ROCK) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        const edges = [
          [tx, ty - 1, x, y, TILE, 2],
          [tx, ty + 1, x, y + TILE - 2, TILE, 2],
          [tx - 1, ty, x, y, 2, TILE],
          [tx + 1, ty, x + TILE - 2, y, 2, TILE],
        ];
        for (const [nx, ny, ex, ey, ew, eh] of edges) {
          if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
          const nt = tileAt(planet, nx, ny);
          if (nt === T.WATER || nt === T.ROCK) continue;
          ctx.fillStyle = tile === T.WATER
            ? rgba(theme.waterHi, 0.22)
            : rgba(theme.rockHi, 0.24);
          ctx.fillRect(ex, ey, ew, eh);
        }
      }
    }
  }

  drawGroundDecor(ctx, def, x, y, tx, ty, seedValue, rng) {
    const theme = def.theme;
    const cx = x + 6 + rng() * 20;
    const cy = y + 6 + rng() * 20;
    const kind = def.id;

    if (kind === 'nix') {
      ctx.fillStyle = rgba(theme.decor[Math.floor(rng() * theme.decor.length)], 0.35 + rng() * 0.3);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx + 3, cy + 2);
      ctx.lineTo(cx - 2, cy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.22);
      ctx.fillRect(cx - 1, cy - 2, 1, 3);
    } else if (kind === 'cinder') {
      ctx.strokeStyle = rgba(theme.accent, 0.22 + rng() * 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + 4);
      ctx.lineTo(cx - 1, cy);
      ctx.lineTo(cx + 3, cy + 3);
      ctx.lineTo(cx + 7, cy - 2);
      ctx.stroke();
      if (seedValue > 0.96) glow(ctx, cx, cy, 10, theme.accent, 0.2);
    } else if (kind === 'verdant') {
      ctx.strokeStyle = rgba(theme.decor[0], 0.4);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 2 - 2, cy + 4);
        ctx.quadraticCurveTo(cx + i * 3 - 4, cy - 1, cx + i * 4 - 4, cy - 5);
        ctx.stroke();
      }
      if (seedValue > 0.965) {
        glow(ctx, cx + 4, cy + 2, 8, theme.accent, 0.35);
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(cx + 4, cy + 2, 1.6, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 'frost') {
      ctx.fillStyle = rgba('#e6f9ff', 0.16 + rng() * 0.18);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7 + rng() * 5, 3 + rng() * 2, rng() * 2, 0, TAU);
      ctx.fill();
      if (seedValue > 0.95) {
        ctx.fillStyle = rgba(theme.decor[0], 0.5);
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy + 3);
        ctx.lineTo(cx, cy - 6);
        ctx.lineTo(cx + 3, cy + 3);
        ctx.closePath();
        ctx.fill();
      }
    } else if (kind === 'aether') {
      ctx.strokeStyle = rgba(theme.accent, 0.14);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y + 4, 24, 24);
      ctx.fillStyle = rgba(theme.decor[Math.floor(rng() * 3)], 0.18);
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
    }
  }

  weatherFor(planet) {
    if (this.weatherCache.has(planet.id)) return this.weatherCache.get(planet.id);
    const rng = mulberry32(hashString(`weather:${planet.id}`));
    const list = [];
    for (let i = 0; i < 64; i++) {
      list.push({
        x: rng(),
        y: rng(),
        speed: 0.1 + rng() * 0.55,
        size: 0.6 + rng() * 2.1,
        phase: rng() * TAU,
        drift: 0.2 + rng() * 1.4,
      });
    }
    this.weatherCache.set(planet.id, list);
    return list;
  }

  // ----------------------------------------------------------
  // MUNDO
  // ----------------------------------------------------------

  drawWorld(game, dt) {
    const state = game.state;
    if (!state) return;
    const def = planetById(state.planetId);
    const planet = state.planets[state.planetId];
    if (!planet) return;
    const ctx = this.ctx;
    const { vw, vh, zoom, dpr } = this;
    const t = game.clock;
    this.time = t;
    this.zoom = zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = def.theme.sky;
    ctx.fillRect(0, 0, vw, vh);

    const cam = game.camera;
    const halfW = vw / (2 * zoom);
    const halfH = vh / (2 * zoom);
    const ground = this.ensureGround(def, planet);

    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const view = {
      x0: cam.x - halfW - TILE,
      x1: cam.x + halfW + TILE,
      y0: cam.y - halfH - TILE,
      y1: cam.y + halfH + TILE,
    };

    const sx = clamp(view.x0, 0, WORLD_W * TILE);
    const sy = clamp(view.y0, 0, WORLD_H * TILE);
    const sw = clamp(view.x1, 0, WORLD_W * TILE) - sx;
    const sh = clamp(view.y1, 0, WORLD_H * TILE) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);

    this.drawWaterGlints(ctx, planet, def, view, t);
    this.drawPlots(ctx, game, planet, def, view, t);
    this.drawNodes(ctx, game, planet, def, view, t);

    const entities = [];
    for (const b of planet.buildings) {
      const bx = b.tx * TILE;
      const by = b.ty * TILE;
      if (bx > view.x1 || bx + b.w * TILE < view.x0 || by > view.y1 || by + b.h * TILE < view.y0) continue;
      entities.push({ y: (b.ty + b.h) * TILE, draw: () => this.drawBuilding(ctx, b, def, t) });
    }
    entities.push({ y: state.player.y + 1, draw: () => this.drawPlayer(ctx, game, def, t) });
    entities.push({ y: game.drone.y + 6, draw: () => this.drawDrone(ctx, game, def, t) });
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw();

    this.drawParticles(ctx, game);
    this.drawFloats(ctx, game, t);
    if (game.buildGhost) this.drawBuildGhost(ctx, game, def, t, planet);
    if (game.aimTile && !game.buildGhost) this.drawHover(ctx, game, planet, def, t);

    ctx.restore();

    this.drawNight(game, def, planet);
    this.drawWeather(game, def, planet, t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, vw, vh);

    this.drawEdgeHud(ctx, game, def, planet, t);
  }

  drawWaterGlints(ctx, planet, def, view, t) {
    const x0 = Math.max(0, Math.floor(view.x0 / TILE));
    const x1 = Math.min(WORLD_W - 1, Math.ceil(view.x1 / TILE));
    const y0 = Math.max(0, Math.floor(view.y0 / TILE));
    const y1 = Math.min(WORLD_H - 1, Math.ceil(view.y1 / TILE));
    ctx.save();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tileAt(planet, tx, ty) !== T.WATER) continue;
        const h = hash2(tx, ty, planet.seed);
        const px = tx * TILE;
        const py = ty * TILE;
        const a = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.4 + h * 8));
        ctx.fillStyle = rgba(def.theme.waterHi, a);
        const wx = px + 5 + ((h * 17) % 18);
        const wy = py + 8 + ((h * 31) % 16);
        ctx.fillRect(wx, wy, 8, 1);
        ctx.fillRect(wx + 11, wy + 4, 4, 1);
        if (def.id === 'cinder' && h > 0.7) {
          const bubble = (t * 0.5 + h) % 1;
          ctx.fillStyle = rgba(def.theme.waterHi, (1 - bubble) * 0.5);
          ctx.beginPath();
          ctx.arc(px + 10 + h * 12, py + 22 - bubble * 14, 1.4 + h * 1.6, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawPlots(ctx, game, planet, def, view, t) {
    for (const plot of Object.values(planet.plots)) {
      const px = plot.tx * TILE;
      const py = plot.ty * TILE;
      if (px > view.x1 || px + TILE < view.x0 || py > view.y1 || py + TILE < view.y0) continue;
      this.drawPlot(ctx, plot, def, t, game);
      if (plot.crop) this.drawCrop(ctx, plot, def, t);
    }
  }

  drawPlot(ctx, plot, def, t, game) {
    const x = plot.tx * TILE;
    const y = plot.ty * TILE;
    const wet = plot.moisture > 0.05;
    ctx.save();
    roundRectPath(ctx, x + 1.5, y + 1.5, TILE - 3, TILE - 3, 5);
    ctx.fillStyle = wet ? '#241d31' : '#2b2338';
    ctx.fill();
    ctx.strokeStyle = rgba(def.theme.accent, 0.12);
    ctx.lineWidth = 1;
    ctx.stroke();

    // sulcos
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < 3; i++) {
      const yy = y + 8 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x + 5, yy);
      ctx.lineTo(x + TILE - 5, yy);
      ctx.stroke();
    }
    if (wet) {
      ctx.fillStyle = rgba(def.theme.waterHi, 0.08 + plot.moisture * 0.09);
      roundRectPath(ctx, x + 1.5, y + 1.5, TILE - 3, TILE - 3, 5);
      ctx.fill();
      ctx.fillStyle = rgba(def.theme.waterHi, 0.4);
      ctx.beginPath();
      ctx.arc(x + TILE - 6, y + 6, 1.5, 0, TAU);
      ctx.fill();
    }
    // cantos
    ctx.strokeStyle = rgba(def.theme.accent, 0.22);
    ctx.lineWidth = 1;
    const c = 4;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2 + c); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 2 + c, y + 2);
    ctx.moveTo(x + TILE - 2 - c, y + 2); ctx.lineTo(x + TILE - 2, y + 2); ctx.lineTo(x + TILE - 2, y + 2 + c);
    ctx.stroke();
    ctx.restore();
    void game;
    void t;
  }

  drawCrop(ctx, plot, def, t) {
    const crop = CROPS[plot.crop.species];
    if (!crop) return;
    const g = plot.crop.growth;
    const stage = g >= 1 ? 3 : g >= 0.66 ? 2 : g >= 0.33 ? 1 : 0;
    const cx = plot.tx * TILE + TILE / 2;
    const baseY = plot.ty * TILE + TILE - 6;
    const ripe = g >= 1;
    const sway = Math.sin(t * 2 + plot.tx * 1.3 + plot.ty) * 0.9;

    ctx.save();
    if (ripe) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, baseY - 12, 20, crop.color, 0.32 + 0.12 * Math.sin(t * 3));
      ctx.globalCompositeOperation = 'source-over';
    }

    if (stage === 0) {
      ctx.fillStyle = '#3b2f45';
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 1, 5, 2.4, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = crop.leaf;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, baseY - 2);
      ctx.lineTo(cx + sway, baseY - 8);
      ctx.stroke();
      ctx.fillStyle = crop.color;
      ctx.beginPath();
      ctx.arc(cx + sway, baseY - 8, 1.4, 0, TAU);
      ctx.fill();
    } else {
      const height = stage === 1 ? 10 : stage === 2 ? 16 : 19;
      ctx.strokeStyle = crop.leaf;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.quadraticCurveTo(cx + sway * 0.5, baseY - height * 0.55, cx + sway, baseY - height);
      ctx.stroke();
      // folhas
      ctx.fillStyle = crop.leaf;
      const leaves = stage === 1 ? 2 : stage === 2 ? 3 : 4;
      for (let i = 0; i < leaves; i++) {
        const ly = baseY - height * (0.26 + i * 0.18);
        const dir = i % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(cx + dir * 4.4 + sway * 0.3, ly, 4.6, 1.8, dir * 0.45, 0, TAU);
        ctx.fill();
      }
      // frutos
      if (stage >= 2) {
        const fruits = ripe ? 4 : 2;
        for (let i = 0; i < fruits; i++) {
          const angle = (i / fruits) * TAU + 0.4;
          const fx = cx + Math.cos(angle) * 5.2 + sway * 0.4;
          const fy = baseY - height * 0.62 + Math.sin(angle) * 4;
          ctx.fillStyle = crop.color;
          ctx.beginPath();
          ctx.arc(fx, fy, ripe ? 2.7 : 2, 0, TAU);
          ctx.fill();
          if (ripe) {
            ctx.fillStyle = rgba('#ffffff', 0.65);
            ctx.beginPath();
            ctx.arc(fx - 0.8, fy - 0.8, 0.9, 0, TAU);
            ctx.fill();
          }
        }
      }
    }

    if (ripe) {
      const fy = baseY - 27 + Math.sin(t * 3 + plot.tx) * 2;
      ctx.fillStyle = crop.color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, fy - 3);
      ctx.lineTo(cx + 3, fy);
      ctx.lineTo(cx, fy + 3);
      ctx.lineTo(cx - 3, fy);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawNodes(ctx, game, planet, def, view, t) {
    for (const node of planet.nodes) {
      const px = node.tx * TILE;
      const py = node.ty * TILE;
      if (px > view.x1 || px + TILE < view.x0 || py > view.y1 || py + TILE < view.y0) continue;
      const active = nodeIsActive(node, game.state.time.day);
      this.drawNode(ctx, node, def, t, active);
    }
  }

  drawNode(ctx, node, def, t, active) {
    const cx = node.tx * TILE + TILE / 2;
    const cy = node.ty * TILE + TILE / 2 + 4;
    const type = NODE_TYPES[node.type];
    if (!type) return;
    const color = type.color;
    ctx.save();
    if (!active) ctx.globalAlpha = 0.3;

    if (active) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy - 4, 19, color, 0.26 + 0.08 * Math.sin(t * 2 + node.variant));
      ctx.globalCompositeOperation = 'source-over';
    }

    if (node.type === 'crystal') {
      ctx.fillStyle = '#241f35';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 7, 11, 4, 0, 0, TAU);
      ctx.fill();
      const shards = [
        [0, -2, 12, 6],
        [-7, 2, 8, 4],
        [6, 3, 7, 5],
      ];
      for (const [ox, oy, hh, ww] of shards) {
        const grad = ctx.createLinearGradient(cx + ox, cy + oy - hh, cx + ox, cy + oy + 4);
        grad.addColorStop(0, active ? rgba(color, 0.95) : rgba('#9aa6c0', 0.4));
        grad.addColorStop(1, rgba(color, 0.35));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy + oy - hh);
        ctx.lineTo(cx + ox + ww, cy + oy + 2);
        ctx.lineTo(cx + ox, cy + oy + 4);
        ctx.lineTo(cx + ox - ww, cy + oy + 2);
        ctx.closePath();
        ctx.fill();
        if (active) {
          ctx.strokeStyle = rgba('#ffffff', 0.45);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx + ox, cy + oy - hh + 2);
          ctx.lineTo(cx + ox + 1, cy + oy + 1);
          ctx.stroke();
        }
      }
    } else if (node.type === 'scrap') {
      ctx.fillStyle = '#1d2030';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, 12, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = active ? '#4b5570' : '#3a4054';
      roundRectPath(ctx, cx - 10, cy - 1, 13, 11, 2);
      ctx.fill();
      roundRectPath(ctx, cx + 1, cy - 7, 9, 10, 2);
      ctx.fill();
      ctx.fillStyle = '#6f7b96';
      ctx.fillRect(cx - 8, cy + 1, 6, 2);
      ctx.fillRect(cx + 3, cy - 5, 5, 2);
      if (active) {
        hazardStripe(ctx, cx - 10, cy + 6, 13, 4);
        ctx.fillStyle = rgba(color, 0.7);
        ctx.fillRect(cx + 3, cy - 10, 2, 4);
      }
      ctx.strokeStyle = rgba(color, 0.5);
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 10);
      ctx.lineTo(cx + 4, cy - 15 + Math.sin(t * 3 + node.variant) * 1.5);
      ctx.stroke();
    } else if (node.type === 'ice') {
      ctx.fillStyle = '#1c3242';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 7, 12, 4, 0, 0, TAU);
      ctx.fill();
      const pts = [
        [-8, 4, 5, 10], [0, 6, 7, 15], [8, 4, 5, 9],
      ];
      for (const [ox, oy, ww, hh] of pts) {
        const grad = ctx.createLinearGradient(cx + ox, cy - hh, cx + ox, cy + oy);
        grad.addColorStop(0, active ? '#e6f9ff' : '#6b8294');
        grad.addColorStop(0.6, active ? '#7dd3fc' : '#475d6f');
        grad.addColorStop(1, '#2a4d63');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy + oy - hh);
        ctx.lineTo(cx + ox + ww, cy + oy);
        ctx.lineTo(cx + ox - ww, cy + oy);
        ctx.closePath();
        ctx.fill();
      }
      if (active) {
        ctx.fillStyle = rgba('#ffffff', 0.7);
        ctx.fillRect(cx - 1, cy - 8, 2, 5);
      }
    } else if (node.type === 'flora') {
      ctx.fillStyle = '#16352a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 7, 11, 4, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = active ? '#4be1c3' : '#3c675a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 5);
      ctx.quadraticCurveTo(cx + 2, cy - 2, cx - 1, cy - 7);
      ctx.stroke();
      const caps = [[-6, -4, 4], [5, -6, 5], [0, -12, 6]];
      for (const [ox, oy, rr] of caps) {
        ctx.fillStyle = active ? rgba(color, 0.85) : '#3d6557';
        ctx.beginPath();
        ctx.ellipse(cx + ox, cy + oy, rr, rr * 0.62, 0, Math.PI, TAU);
        ctx.fill();
        if (active) {
          ctx.fillStyle = rgba('#ffffff', 0.4);
          ctx.beginPath();
          ctx.arc(cx + ox - rr * 0.3, cy + oy - rr * 0.2, 1, 0, TAU);
          ctx.fill();
        }
      }
    } else if (node.type === 'vent') {
      ctx.fillStyle = '#241b1b';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, 12, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a2b29';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 10, 6, 0, 0, TAU);
      ctx.fill();
      if (active) {
        ctx.fillStyle = rgba(color, 0.8);
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, 6, 3, 0, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 2; i++) {
          const rise = ((t * 0.6 + i * 0.5 + node.variant * 0.01) % 1);
          ctx.fillStyle = rgba(color, (1 - rise) * 0.22);
          ctx.beginPath();
          ctx.arc(cx + Math.sin(t + i * 2) * 3, cy - 4 - rise * 18, 3 + rise * 3, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawPlayer(ctx, game, def, t) {
    const player = game.state.player;
    const moving = game.moving;
    const frame = moving ? Math.floor(game.walkPhase) % 4 : 0;
    const sprite = this.sprites[player.dir]?.[frame] || this.sprites.down[0];
    const x = player.x;
    const y = player.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 11, 4.5, 0, 0, TAU);
    ctx.fill();
    ctx.drawImage(sprite, Math.round(x - PLAYER_SPRITE_W / 2), Math.round(y - PLAYER_SPRITE_H + 6));
    ctx.restore();

    // aura da roupa à noite
    const dark = 1 - daylight(game.state.time.t);
    if (dark > 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 16, 30, def.theme.accent, 0.16 * dark);
      ctx.restore();
    }
    void t;
  }

  drawDrone(ctx, game, def, t) {
    const d = game.drone;
    if (!d) return;
    const bob = Math.sin(t * 2.4) * 2.5;
    const x = d.x;
    const y = d.y - 16 + bob;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 4, 7, 2.6, 0, 0, TAU);
    ctx.fill();

    // thruster
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y + 7, 12, def.theme.accent, 0.4);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#2b3550';
    roundRectPath(ctx, x - 7, y - 4, 14, 10, 4);
    ctx.fill();
    ctx.strokeStyle = '#0b0f1b';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#59688a';
    ctx.fillRect(x - 4, y - 6, 8, 2);
    // olho
    ctx.fillStyle = '#0a1220';
    ctx.beginPath();
    ctx.arc(x, y + 1, 3.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = def.theme.accent;
    ctx.beginPath();
    ctx.arc(x + 0.6, y + 1, 1.7, 0, TAU);
    ctx.fill();
    // antenas
    ctx.strokeStyle = rgba(def.theme.accent, 0.45);
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 4);
    ctx.lineTo(x - 9, y - 8);
    ctx.moveTo(x + 6, y - 4);
    ctx.lineTo(x + 9, y - 8);
    ctx.stroke();
    ctx.restore();
  }

  // ----------------------------------------------------------
  // CONSTRUÇÕES
  // ----------------------------------------------------------

  drawBuilding(ctx, b, def, t, alpha = 1) {
    const bd = BUILDINGS[b.type];
    if (!bd) return;
    const x = b.tx * TILE;
    const y = b.ty * TILE;
    const w = b.w * TILE;
    const h = b.h * TILE;
    const accent = def.theme.accent;
    const accent2 = def.theme.accent2;
    ctx.save();
    ctx.globalAlpha = alpha;

    // sombra de contato
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h - 3, w * 0.46, Math.min(9, h * 0.18), 0, 0, TAU);
    ctx.fill();

    if (b.type === 'pod') this.drawPod(ctx, x, y, w, h, accent, t, b.id);
    else if (b.type === 'habitat') this.drawHabitat(ctx, x, y, w, h, accent, accent2, t, b.id);
    else if (b.type === 'solar') this.drawSolar(ctx, x, y, w, h, accent, t, b.id);
    else if (b.type === 'extractor') this.drawExtractor(ctx, x, y, w, h, accent, t, b.id);
    else if (b.type === 'greenhouse') this.drawGreenhouse(ctx, x, y, w, h, accent, accent2, t, b.id);
    else if (b.type === 'workshop') this.drawWorkshop(ctx, x, y, w, h, accent, t, b.id);
    else if (b.type === 'lab') this.drawLab(ctx, x, y, w, h, accent, accent2, t, b.id);
    else if (b.type === 'beacon') this.drawBeacon(ctx, x, y, w, h, accent, t, b.id);
    else if (b.type === 'pad') this.drawPad(ctx, x, y, w, h, accent, t, b.id);

    ctx.restore();
  }

  metal(ctx, x, y, w, h, light = '#dfe9fa', dark = '#7d8ba3') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, light);
    g.addColorStop(0.5, mix(light, dark, 0.35));
    g.addColorStop(1, dark);
    return g;
  }

  drawPod(ctx, x, y, w, h, accent, t, id) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    // cratera / plataforma
    ctx.fillStyle = 'rgba(20,22,34,0.8)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h - 8, w * 0.44, 10, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, y + h - 8, w * 0.44, 10, 0, 0, TAU);
    ctx.stroke();

    // pernas
    ctx.strokeStyle = '#39445f';
    ctx.lineWidth = 3;
    for (const dx of [-18, 0, 18]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 0.5, y + h - 22);
      ctx.lineTo(cx + dx, y + h - 7);
      ctx.stroke();
    }
    // corpo
    const bodyW = 26;
    const bodyH = 36;
    const bx = cx - bodyW / 2;
    const by = y + 9;
    ctx.fillStyle = this.metal(ctx, bx, by, bodyW, bodyH);
    roundRectPath(ctx, bx, by, bodyW, bodyH, 10);
    ctx.fill();
    ctx.strokeStyle = '#232b40';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // faixa
    ctx.fillStyle = rgba(accent, 0.75);
    ctx.fillRect(bx + 2, by + bodyH - 9, bodyW - 4, 3);
    ctx.fillStyle = '#c8d6ed';
    ctx.fillRect(bx + 2, by + bodyH - 16, bodyW - 4, 2);
    // escotilha
    ctx.fillStyle = '#56627c';
    roundRectPath(ctx, cx - 6, by + bodyH - 30, 12, 10, 4);
    ctx.fill();
    ctx.strokeStyle = '#2a3248';
    ctx.stroke();

    // janela
    ctx.fillStyle = '#08131f';
    ctx.beginPath();
    ctx.ellipse(cx, by + 12, 8, 9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(accent, 0.55);
    ctx.beginPath();
    ctx.ellipse(cx - 2, by + 10, 3.5, 4.5, -0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#aab9d4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, by + 12, 8, 9, 0, 0, TAU);
    ctx.stroke();

    // antena
    ctx.strokeStyle = '#8c9ab3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 10, by + 2);
    ctx.lineTo(cx + 16, y - 3);
    ctx.stroke();
    lamp(ctx, cx + 16, y - 3, 1.3, '#ff5f6d', t, 0.4);
    lamp(ctx, cx - 10, by + 18, 1.2, accent, t, 1.7);

    // texto
    ctx.fillStyle = 'rgba(220,235,255,0.5)';
    ctx.font = '5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A-01', cx, by + bodyH + 1);
    ctx.textAlign = 'left';
    void id;
  }

  drawHabitat(ctx, x, y, w, h, accent, accent2, t, id) {
    const cx = x + w / 2;
    const baseY = y + h - 8;
    // base
    ctx.fillStyle = 'rgba(18,22,36,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.47, 11, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.24);
    ctx.stroke();
    // tanques laterais
    for (const dx of [-27, 24]) {
      ctx.fillStyle = '#6a7894';
      roundRectPath(ctx, cx + dx, baseY - 15, 7, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#3a4460';
      ctx.fillRect(cx + dx, baseY - 12, 7, 2);
    }
    // cúpula
    const r = w * 0.4;
    const g = ctx.createLinearGradient(cx - r, baseY - r, cx + r, baseY);
    g.addColorStop(0, '#dbe7fa');
    g.addColorStop(0.45, '#9eafca');
    g.addColorStop(1, '#5d6d8c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, baseY - 5, r, Math.PI, 0);
    ctx.lineTo(cx + r, baseY - 3);
    ctx.lineTo(cx - r, baseY - 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#252e46';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // nervuras
    ctx.strokeStyle = 'rgba(35,44,68,0.55)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const rr = (r * i) / 4;
      ctx.beginPath();
      ctx.arc(cx, baseY - 5, rr, Math.PI, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 5 - r);
    ctx.lineTo(cx, baseY - 3);
    ctx.stroke();
    // janelas
    for (const ox of [-14, 0, 14]) {
      ctx.fillStyle = rgba('#ffd166', 0.75);
      roundRectPath(ctx, cx + ox - 3.5, baseY - 22, 7, 9, 3);
      ctx.fill();
      ctx.fillStyle = rgba('#fff7d6', 0.5);
      ctx.fillRect(cx + ox - 2, baseY - 21, 2, 5);
    }
    // airlock
    ctx.fillStyle = '#2c3550';
    roundRectPath(ctx, cx - 7, baseY - 12, 14, 13, 3);
    ctx.fill();
    ctx.fillStyle = rgba(accent, 0.65);
    ctx.fillRect(cx - 4, baseY - 8, 8, 2);
    ctx.fillStyle = '#4c5878';
    ctx.fillRect(cx - 1, baseY - 12, 2, 13);
    // antena
    ctx.strokeStyle = '#a4b3cc';
    ctx.beginPath();
    ctx.moveTo(cx + r - 3, baseY - 5 - r + 8);
    ctx.lineTo(cx + r + 4, y + 1);
    ctx.stroke();
    lamp(ctx, cx + r + 4, y + 1, 1.4, accent2, t, 0.9);
    lamp(ctx, cx, baseY - 5 - r + 3, 1.2, '#7dffb2', t, 2.4);
    void id;
  }

  drawSolar(ctx, x, y, w, h, accent, t, id) {
    const baseY = y + h - 4;
    ctx.fillStyle = 'rgba(15,19,30,0.85)';
    roundRectPath(ctx, x + 3, baseY - 7, w - 6, 7, 2);
    ctx.fill();
    // suportes
    ctx.strokeStyle = '#5d6a84';
    ctx.lineWidth = 2;
    for (const ox of [w * 0.3, w * 0.7]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, baseY - 6);
      ctx.lineTo(x + ox, reportSolarTop(y, 16));
      ctx.stroke();
    }
    const shimmer = 0.35 + 0.3 * Math.sin(t * 1.2);
    for (let i = 0; i < 2; i++) {
      const px = x + 4 + i * (w / 2 - 2);
      const py = y + 5;
      const pw = w / 2 - 8;
      const ph = 16;
      const grad = ctx.createLinearGradient(px, py, px + pw, py + ph);
      grad.addColorStop(0, '#1a3a5c');
      grad.addColorStop(0.5, '#2f6e96');
      grad.addColorStop(1, '#17314c');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px + 5, py);
      ctx.lineTo(px + pw - 3, py + 3);
      ctx.lineTo(px + pw - 6, py + ph);
      ctx.lineTo(px + 2, py + ph - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,220,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.28);
      for (let gx = 1; gx < 4; gx++) {
        ctx.beginPath();
        ctx.moveTo(px + 3 + gx * (pw / 4), py + 1);
        ctx.lineTo(px + 1 + gx * (pw / 4), py + ph - 1);
        ctx.stroke();
      }
      for (let gy = 1; gy < 3; gy++) {
        ctx.beginPath();
        ctx.moveTo(px + 3, py + gy * (ph / 3));
        ctx.lineTo(px + pw - 2, py + 2 + gy * (ph / 3));
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#eaffff', shimmer);
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 2);
      ctx.lineTo(px + 15, py + 2.5);
      ctx.lineTo(px + 11, py + ph - 2);
      ctx.lineTo(px + 6, py + ph - 1);
      ctx.closePath();
      ctx.fill();
    }
    // cabos
    ctx.strokeStyle = rgba(accent, 0.3);
    ctx.beginPath();
    ctx.moveTo(x + 8, y + h - 2);
    ctx.quadraticCurveTo(x + w / 2, y + h + 2, x + w - 8, y + h - 2);
    ctx.stroke();
    lamp(ctx, x + 6, y + h - 8, 1, '#7dffb2', t, 0.3);
    void id;
  }

  drawExtractor(ctx, x, y, w, h, accent, t, id) {
    const cx = x + w / 2;
    const baseY = y + h - 5;
    ctx.fillStyle = 'rgba(14,18,28,0.9)';
    roundRectPath(ctx, x + 3, baseY - 8, w - 6, 8, 2);
    ctx.fill();
    // tanque
    const tw = 16;
    const th = 34;
    const tx = cx - tw / 2;
    const ty = y + 12;
    ctx.fillStyle = this.metal(ctx, tx, ty, tw, th, '#cfdcf0', '#68758e');
    roundRectPath(ctx, tx, ty, tw, th, 7);
    ctx.fill();
    ctx.strokeStyle = '#28324a';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#3e4a64';
    for (let i = 0; i < 3; i++) ctx.fillRect(tx + 2, ty + 8 + i * 8, tw - 4, 2);
    // visor de água
    ctx.fillStyle = '#0a1a24';
    ctx.beginPath();
    ctx.arc(cx, ty + 15, 4.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(accent, 0.8);
    ctx.beginPath();
    ctx.arc(cx, ty + 16, 2.6, 0, TAU);
    ctx.fill();
    // tubo
    ctx.strokeStyle = '#59657e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 4, baseY - 7);
    ctx.lineTo(cx + 9, baseY - 2);
    ctx.stroke();
    // bomba
    const pump = Math.sin(t * 2.2 + 1) * 2;
    ctx.fillStyle = '#8996ae';
    ctx.fillRect(cx - 2, baseY - 16 + pump, 4, 9);
    ctx.fillStyle = '#39435c';
    ctx.fillRect(cx - 1, baseY - 10 + pump, 2, 8);
    // névoa
    ctx.fillStyle = rgba(accent, 0.18);
    ctx.beginPath();
    ctx.arc(cx - 9, ty - 2 + Math.sin(t * 1.4) * 2, 3, 0, TAU);
    ctx.fill();
    lamp(ctx, cx + 9, ty + 2, 1.2, accent, t, 1.1);
    void id;
  }

  drawGreenhouse(ctx, x, y, w, h, accent, accent2, t, id) {
    const cx = x + w / 2;
    const baseY = y + h - 7;
    ctx.fillStyle = 'rgba(16,23,28,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.46, 9, 0, 0, TAU);
    ctx.fill();
    // plantas internas
    for (let i = 0; i < 5; i++) {
      const px = cx - 22 + i * 11;
      ctx.fillStyle = i % 2 ? '#4be1c3' : '#7dffb2';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(px, baseY - 8 - (i % 2) * 3, 4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // cúpula de vidro
    const r = w * 0.42;
    const g = ctx.createLinearGradient(cx - r, baseY - r, cx + r, baseY);
    g.addColorStop(0, 'rgba(180,255,240,0.42)');
    g.addColorStop(0.5, 'rgba(90,220,190,0.22)');
    g.addColorStop(1, 'rgba(25,90,90,0.36)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, baseY - 4, r, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // estrutura
    ctx.strokeStyle = rgba('#bffcf0', 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, baseY - 4, r, Math.PI, 0);
    ctx.stroke();
    for (let i = 1; i <= 4; i++) {
      const rr = (r * i) / 5;
      ctx.beginPath();
      ctx.arc(cx, baseY - 4, rr, Math.PI, 0);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(cx, baseY - 4);
      ctx.lineTo(cx + Math.cos(a) * r, baseY - 4 + Math.sin(a) * r);
      ctx.stroke();
    }
    // luzes de cultivo
    ctx.fillStyle = rgba(accent2, 0.7);
    ctx.fillRect(cx - 14, baseY - 6, 28, 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, baseY - 16, 26, accent2, 0.22 + 0.08 * Math.sin(t * 2));
    ctx.restore();
    // porta
    ctx.fillStyle = '#2b3850';
    roundRectPath(ctx, cx - 6, baseY - 12, 12, 11, 2);
    ctx.fill();
    ctx.fillStyle = rgba(accent, 0.6);
    ctx.fillRect(cx - 4, baseY - 9, 8, 1.5);
    lamp(ctx, cx + r - 2, baseY - 8, 1.1, '#7dffb2', t, 0.2);
    void id;
  }

  drawWorkshop(ctx, x, y, w, h, accent, t, id) {
    const cx = x + w / 2;
    const baseY = y + h - 7;
    // base
    ctx.fillStyle = 'rgba(18,21,32,0.9)';
    roundRectPath(ctx, x + 5, baseY - 6, w - 10, 8, 2);
    ctx.fill();
    // módulo
    const bw = 38;
    const bh = 24;
    const bx = cx - bw / 2;
    const by = baseY - bh - 8;
    ctx.fillStyle = this.metal(ctx, bx, by, bw, bh, '#b9c6dd', '#5d6982');
    ctx.beginPath();
    ctx.moveTo(bx + 4, by + 4);
    ctx.lineTo(bx + bw - 3, by);
    ctx.lineTo(bx + bw, by + bh - 5);
    ctx.lineTo(bx + 2, by + bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#232c42';
    ctx.stroke();
    ctx.fillStyle = '#2f3a54';
    ctx.fillRect(bx + 5, by + 7, 12, 8);
    ctx.fillStyle = rgba(accent, 0.6);
    ctx.fillRect(bx + 6, by + 8, 10, 2);
    hazardStripe(ctx, bx + 20, by + 4, 13, 5);
    // guindaste
    ctx.strokeStyle = '#8493ac';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + 4, by + 2);
    ctx.lineTo(cx + 4, by - 12);
    ctx.lineTo(cx + 23, by - 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 23, by - 8);
    ctx.lineTo(cx + 23, by + 2 + Math.sin(t * 2) * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb35c';
    ctx.fillRect(cx + 21, by + 2 + Math.sin(t * 2) * 2, 4, 3);
    // faíscas
    if (Math.sin(t * 5) > 0.7) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx + 10, by + 14, 8, '#ffd166', 0.7);
      ctx.restore();
    }
    // caixas
    ctx.fillStyle = '#59637b';
    ctx.fillRect(x + 6, baseY - 15, 10, 9);
    ctx.fillStyle = '#7c88a1';
    ctx.fillRect(x + 8, baseY - 13, 6, 2);
    lamp(ctx, cx - 15, by + 5, 1.1, accent, t, 2.1);
    void id;
  }

  drawLab(ctx, x, y, w, h, accent, accent2, t, id) {
    const cx = x + w / 2;
    const baseY = y + h - 7;
    ctx.fillStyle = 'rgba(14,18,30,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.45, 10, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent2, 0.3);
    ctx.stroke();
    // torre
    ctx.fillStyle = this.metal(ctx, cx - 13, y + 22, 26, baseY - y - 28, '#d8e3f5', '#64718c');
    roundRectPath(ctx, cx - 13, y + 22, 26, baseY - y - 28, 5);
    ctx.fill();
    ctx.strokeStyle = '#232b42';
    ctx.stroke();
    // cúpula
    ctx.fillStyle = '#9fb0cb';
    ctx.beginPath();
    ctx.arc(cx, y + 23, 14, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#252e46';
    ctx.stroke();
    // janelas
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? rgba(accent, 0.8) : rgba('#bffcff', 0.5);
      roundRectPath(ctx, cx - 8, y + 30 + i * 7, 16, 4, 2);
      ctx.fill();
    }
    // prato de antena
    ctx.save();
    ctx.translate(cx, y + 16);
    ctx.rotate(Math.sin(t * 0.5) * 0.35);
    ctx.fillStyle = '#c3d0e4';
    ctx.beginPath();
    ctx.ellipse(0, -4, 11, 4.5, -0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#59667f';
    ctx.stroke();
    ctx.strokeStyle = '#8d9ab2';
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.restore();
    // holograma
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const holo = 0.25 + 0.2 * Math.sin(t * 2.4);
    ctx.strokeStyle = rgba(accent2, holo);
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, y + 5 + i * 5, 12 + i * 6, 3 + i * 1.5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    lamp(ctx, cx + 13, y + 27, 1.2, accent2, t, 1.4);
    void id;
  }

  drawBeacon(ctx, x, y, w, h, accent, t, id) {
    const cx = x + w / 2;
    const baseY = y + h - 4;
    // base
    ctx.fillStyle = '#262e46';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 12, 4.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.stroke();
    // feixe
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(cx, baseY - 70, cx, baseY);
    beam.addColorStop(0, rgba(accent, 0));
    beam.addColorStop(0.55, rgba(accent, 0.16 + pulse * 0.14));
    beam.addColorStop(1, rgba(accent, 0.02));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - 3, baseY - 70);
    ctx.lineTo(cx + 3, baseY - 70);
    ctx.lineTo(cx + 12, baseY);
    ctx.lineTo(cx - 12, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // mastro
    ctx.strokeStyle = '#9aa8c1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, baseY - 2);
    ctx.lineTo(cx - 1.5, baseY - 34);
    ctx.moveTo(cx + 4, baseY - 2);
    ctx.lineTo(cx + 1.5, baseY - 34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,185,220,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const yy = baseY - 6 - i * 7;
      ctx.beginPath();
      ctx.moveTo(cx - 3.4 + i * 0.5, yy);
      ctx.lineTo(cx + 3.4 - i * 0.5, yy - 5);
      ctx.stroke();
    }
    // topo
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 42);
    ctx.lineTo(cx + 4, baseY - 35);
    ctx.lineTo(cx - 4, baseY - 35);
    ctx.closePath();
    ctx.fill();
    lamp(ctx, cx, baseY - 36, 2, accent, t, 0.7);
    // anéis no chão
    ctx.strokeStyle = rgba(accent, 0.2 + pulse * 0.25);
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 14 + pulse * 4, 5 + pulse * 1.5, 0, 0, TAU);
    ctx.stroke();
    void id;
  }

  drawPad(ctx, x, y, w, h, accent, t, id) {
    const cx = x + w / 2;
    const cy = y + h / 2 + 3;
    const rx = w * 0.44;
    const ry = h * 0.38;
    ctx.fillStyle = '#252d44';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,190,240,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.35);
    for (const k of [0.72, 0.45]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, TAU);
      ctx.stroke();
    }
    hazardStripe(ctx, cx - 14, cy - 3, 28, 3, '#3a4358', accent);
    ctx.fillStyle = 'rgba(230,240,255,0.4)';
    ctx.font = '6px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LZ-01', cx, cy + 14);
    ctx.textAlign = 'left';
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.25;
      const lx = cx + Math.cos(a) * rx * 0.92;
      const ly = cy + Math.sin(a) * ry * 0.92;
      lamp(ctx, lx, ly, 1.1, i % 2 ? accent : '#ffd166', t, i);
    }
    void pulse;
    void id;
  }

  // ----------------------------------------------------------
  // EFEITOS / HUD NO CANVAS
  // ----------------------------------------------------------

  drawParticles(ctx, game) {
    for (const p of game.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      if (p.shape === 'square') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFloats(ctx, game, t) {
    for (const f of game.floats) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,8,16,0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    void t;
  }

  drawBuildGhost(ctx, game, def, t, planet) {
    const ghost = game.buildGhost;
    if (!ghost) return;
    const bd = BUILDINGS[ghost.type];
    if (!bd) return;
    const [w, h] = bd.size;
    const x = ghost.tx * TILE;
    const y = ghost.ty * TILE;
    ctx.save();
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const ok = ghost.ok;
        ctx.fillStyle = ok ? 'rgba(110,231,255,0.12)' : 'rgba(255,107,129,0.14)';
        ctx.fillRect(x + xx * TILE + 1, y + yy * TILE + 1, TILE - 2, TILE - 2);
        ctx.strokeStyle = ok ? 'rgba(110,231,255,0.4)' : 'rgba(255,107,129,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + xx * TILE + 1, y + yy * TILE + 1, TILE - 2, TILE - 2);
      }
    }
    const fake = { ...ghost, w, h };
    this.drawBuilding(ctx, fake, def, t, 0.55);
    // cantos
    ctx.strokeStyle = ghost.ok ? 'rgba(110,231,255,0.9)' : 'rgba(255,107,129,0.9)';
    ctx.lineWidth = 2;
    const c = 9;
    const totalW = w * TILE;
    const totalH = h * TILE;
    const corners = [
      [x, y, 1, 1], [x + totalW, y, -1, 1],
      [x, y + totalH, 1, -1], [x + totalW, y + totalH, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * c, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * c);
      ctx.stroke();
    }
    ctx.restore();
    void planet;
  }

  drawHover(ctx, game, planet, def, t) {
    const aim = game.aimTile;
    const x = aim.tx * TILE;
    const y = aim.ty * TILE;
    if (x < -TILE || y < -TILE) return;
    const plot = getPlot(planet, aim.tx, aim.ty);
    const ripe = plot?.crop && plot.crop.growth >= 1;
    const hoverNode = planet.nodes.find((n) => n.tx === aim.tx && n.ty === aim.ty && nodeIsActive(n, game.state.time.day));
    const color = ripe || hoverNode ? '#ffd166' : def.theme.accent;
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.85);
    ctx.lineWidth = 1.6;
    const c = 7;
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x, y); ctx.lineTo(x, y + c);
    ctx.moveTo(x + TILE - c, y); ctx.lineTo(x + TILE, y); ctx.lineTo(x + TILE, y + c);
    ctx.moveTo(x + c, y + TILE); ctx.lineTo(x, y + TILE); ctx.lineTo(x, y + TILE - c);
    ctx.moveTo(x + TILE - c, y + TILE); ctx.lineTo(x + TILE, y + TILE); ctx.lineTo(x + TILE, y + TILE - c);
    ctx.stroke();
    ctx.fillStyle = rgba(color, 0.06 + 0.03 * Math.sin(t * 3));
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.restore();
  }

  drawNight(game, def, planet) {
    const night = 1 - daylight(game.state.time.t);
    if (night < 0.03) return;
    const ctx = this.ctx;
    const { vw, vh, zoom } = this;
    ctx.save();
    ctx.globalAlpha = night * 0.82;
    ctx.fillStyle = def.theme.dark;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();

    // luzes de construções e cristais
    const cam = game.camera;
    const halfW = vw / (2 * zoom);
    const halfH = vh / (2 * zoom);
    const screen = (x, y) => ({ x: vw / 2 + (x - cam.x) * zoom, y: vh / 2 + (y - cam.y) * zoom });

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of planet.buildings) {
      const bx = b.tx * TILE;
      const by = b.ty * TILE;
      if (bx + b.w * TILE < cam.x - halfW || bx > cam.x + halfW) continue;
      if (by + b.h * TILE < cam.y - halfH || by > cam.y + halfH) continue;
      const p = screen(bx + b.w * TILE / 2, by + b.h * TILE * 0.38);
      const strength = b.type === 'lab' || b.type === 'greenhouse' ? 0.22 : b.type === 'beacon' ? 0.3 : 0.14;
      glow(ctx, p.x, p.y, 44 * (zoom / 2), def.theme.accent, strength * night);
    }
    for (const n of planet.nodes) {
      if (n.type !== 'crystal' || !nodeIsActive(n, game.state.time.day)) continue;
      const p = screen(n.tx * TILE + TILE / 2, n.ty * TILE + TILE / 2);
      if (p.x < -30 || p.x > vw + 30 || p.y < -30 || p.y > vh + 30) continue;
      glow(ctx, p.x, p.y, 26, def.theme.accent, 0.12 * night);
    }
    // lanterna do jogador
    const pp = screen(game.state.player.x, game.state.player.y - 12);
    glow(ctx, pp.x, pp.y, 90 + 20 * Math.sin(this.time * 2), def.theme.light, 0.2 * night);
    ctx.restore();
  }

  drawWeather(game, def, planet, t) {
    const ctx = this.ctx;
    const { vw, vh } = this;
    const list = this.weatherFor(planet);
    const kind = def.id;
    ctx.save();
    for (const p of list) {
      let x;
      let y;
      if (kind === 'cinder') {
        x = (p.x * vw + Math.sin(t * 0.3 + p.phase) * 40 + vw) % vw;
        y = (p.y * vh - t * p.speed * 26 + vh * 2) % vh;
      } else if (kind === 'frost') {
        x = (p.x * vw + Math.sin(t * 0.5 + p.phase) * 22 + vw) % vw;
        y = (p.y * vh + t * p.speed * 22) % vh;
      } else if (kind === 'aether') {
        x = (p.x * vw + t * p.speed * 20) % vw;
        y = (p.y * vh + Math.sin(t * 0.6 + p.phase) * 14 + vh) % vh;
      } else {
        x = (p.x * vw + t * p.speed * 16 + Math.sin(t * 0.4 + p.phase) * 20) % vw;
        y = (p.y * vh + t * p.speed * 8) % vh;
      }
      const alpha = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.phase));
      ctx.fillStyle = rgba(def.theme.dust, alpha);
      if (kind === 'nix' || kind === 'cinder') {
        ctx.fillRect(x, y, p.size * 2.4, p.size * 0.7);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    void game;
  }

  drawEdgeHud(ctx, game, def, planet, t) {
    const { vw, vh } = this;
    // etiqueta do planeta no canto inferior esquerdo
    ctx.save();
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(150,180,220,0.4)';
    ctx.textAlign = 'left';
    const label = `${def.name.toUpperCase()} // SETOR ${String(planet.spawnTile.x).padStart(2, '0')}-${String(planet.spawnTile.y).padStart(2, '0')}`;
    ctx.fillText(label, 18, vh - 13);
    ctx.fillStyle = 'rgba(150,180,220,0.22)';
    ctx.fillRect(18, vh - 22, 74, 1);
    ctx.restore();
    void game;
    void t;
  }

  // ----------------------------------------------------------
  // TÍTULO
  // ----------------------------------------------------------

  drawTitle(time) {
    const ctx = this.ctx;
    const { vw, vh, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    const bg = ctx.createLinearGradient(0, 0, 0, vh);
    bg.addColorStop(0, '#04050c');
    bg.addColorStop(0.55, '#070a17');
    bg.addColorStop(1, '#0b0e1f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);

    // nebulosas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const neb = (x, y, r, color, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(0.5, rgba(color, a * 0.35));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(vw * 0.74 + Math.sin(time * 0.05) * 20, vh * 0.48, vh * 0.62, '#5b4a9e', 0.2);
    neb(vw * 0.16, vh * 0.72, vh * 0.5, '#1c6d86', 0.12);
    neb(vw * 0.9, vh * 0.16, vh * 0.28, '#a44a7e', 0.08);
    ctx.restore();

    // estrelas
    for (const s of this.titleStars) {
      const alpha = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
      ctx.fillStyle = rgba(s.color, alpha);
      ctx.beginPath();
      ctx.arc(s.x * vw, s.y * vh, s.r, 0, TAU);
      ctx.fill();
    }

    // estrela cadente
    const shoot = (time * 0.055) % 1;
    if (shoot < 0.16) {
      const p = shoot / 0.16;
      const x = vw * (0.14 + p * 0.34);
      const y = vh * (0.16 + p * 0.11);
      const g = ctx.createLinearGradient(x, y, x - 90, y - 28);
      g.addColorStop(0, 'rgba(220,245,255,0.9)');
      g.addColorStop(1, 'rgba(220,245,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 90, y - 28);
      ctx.stroke();
    }

    // planeta principal
    const pr = Math.min(vw, vh) * (vw < 900 ? 0.22 : 0.25);
    const px = vw * (vw < 900 ? 0.76 : 0.77);
    const py = vh * (vw < 900 ? 0.28 : 0.55);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, px, py, pr * 2.1, '#ff9a63', 0.22);
    glow(ctx, px, py, pr * 1.35, '#ffd166', 0.15);
    ctx.restore();

    // anel traseiro
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.22);
    ctx.strokeStyle = 'rgba(255,200,140,0.22)';
    ctx.lineWidth = pr * 0.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 1.62, pr * 0.42, 0, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();

    // esfera
    const planetGrad = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
    planetGrad.addColorStop(0, '#ffe9c4');
    planetGrad.addColorStop(0.28, '#ffc36b');
    planetGrad.addColorStop(0.62, '#d97a51');
    planetGrad.addColorStop(1, '#4a2340');
    ctx.fillStyle = planetGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();

    // bandas
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 7; i++) {
      const yy = py - pr * 0.8 + i * pr * 0.26;
      ctx.fillStyle = i % 2 ? 'rgba(120,45,80,0.16)' : 'rgba(255,230,180,0.12)';
      ctx.beginPath();
      ctx.ellipse(px, yy, pr * 1.1, pr * 0.08, -0.06, 0, TAU);
      ctx.fill();
    }
    // sombra noturna
    const shadow = ctx.createLinearGradient(px - pr, py, px + pr, py);
    shadow.addColorStop(0, 'rgba(6,8,20,0)');
    shadow.addColorStop(0.52, 'rgba(6,8,20,0.05)');
    shadow.addColorStop(1, 'rgba(4,5,14,0.82)');
    ctx.fillStyle = shadow;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    ctx.restore();

    // anel frontal
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.22);
    ctx.strokeStyle = 'rgba(255,214,160,0.42)';
    ctx.lineWidth = pr * 0.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 1.62, pr * 0.42, 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.18)';
    ctx.lineWidth = pr * 0.03;
    ctx.beginPath();
    ctx.ellipse(0, 0, pr * 1.48, pr * 0.36, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    // lua
    const mx = px - pr * 1.5;
    const my = py - pr * 0.7;
    ctx.fillStyle = '#8d9bff';
    ctx.beginPath();
    ctx.arc(mx, my, pr * 0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(4,5,14,0.6)';
    ctx.beginPath();
    ctx.arc(mx + pr * 0.035, my - pr * 0.02, pr * 0.09, 0, TAU);
    ctx.fill();

    // nave pequena
    const shipX = vw * 0.39 + Math.sin(time * 0.12) * 30;
    const shipY = vh * 0.36 + Math.cos(time * 0.1) * 16;
    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(-0.15);
    ctx.fillStyle = 'rgba(210,235,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, 4);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(110,231,255,0.9)';
    ctx.fillRect(-8, -1, 3, 2);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, shipX - 9, shipY, 16, '#6ee7ff', 0.5);
    ctx.restore();

    // linha do horizonte
    ctx.save();
    ctx.strokeStyle = 'rgba(110,231,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(vw * 0.5, vh * 1.18, vw * 0.72, vh * 0.3, 0, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

// pequena função auxiliar usada no layout do painel solar
function reportSolarTop(y, offset) {
  return y + offset;
}
