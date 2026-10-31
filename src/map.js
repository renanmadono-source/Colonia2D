// Mapa estelar interativo do sistema Aurora.

import { PLANETS, planetById } from './config.js';
import { claimedCount, planetUnlocked } from './sim.js';
import { hashString, mulberry32, clamp } from './rng.js';

const TAU = Math.PI * 2;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export class StarMap {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.selected = game.state?.planetId || 'nix';
    this.hover = null;
    this.positions = {};
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.stars = [];
    this.baseAngles = {};
    const rng = mulberry32(918273);
    for (let i = 0; i < 140; i++) {
      this.stars.push({ x: rng(), y: rng(), r: 0.4 + rng() * 1.5, phase: rng() * TAU });
    }
    for (const p of PLANETS) {
      this.baseAngles[p.id] = (hashString(p.id) % 1000) / 1000 * TAU;
    }
    this.bind();
    this.resize();
  }

  bind() {
    const onMove = (ev) => {
      const id = this.hitTest(ev.clientX, ev.clientY);
      this.hover = id;
      this.canvas.style.cursor = id ? 'pointer' : 'default';
    };
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.canvas.style.cursor = 'default';
    });
    this.canvas.addEventListener('pointerdown', (ev) => {
      if (this.game.travelAnim) return;
      const id = this.hitTest(ev.clientX, ev.clientY);
      if (id) this.game.selectPlanet(id);
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(280, rect.width || this.canvas.clientWidth || 600);
    this.h = Math.max(240, rect.height || this.canvas.clientHeight || 420);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  }

  layout(time) {
    const cx = this.w / 2;
    const cy = this.h / 2 + 2;
    const base = Math.min(this.w, this.h) * 0.47;
    const scale = clamp(Math.min(this.w, this.h) / 620, 0.72, 1.18);
    const positions = {};
    for (const def of PLANETS) {
      const rx = def.orbit * base * 1.62;
      const angle = this.baseAngles[def.id] + time * def.speed * 2.2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * rx * 0.55;
      positions[def.id] = {
        x, y,
        r: def.size * scale,
        rx,
        angle,
        def,
      };
    }
    return { cx, cy, positions, scale };
  }

  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (const [id, p] of Object.entries(this.positions)) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < p.r + 16 && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  draw(time) {
    if (!this.game.state) return;
    const state = this.game.state;
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#05070f');
    bg.addColorStop(0.55, '#080d1c');
    bg.addColorStop(1, '#05070f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // nebulosas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const neb = (x, y, r, color, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(0.5, rgba(color, a * 0.3));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(w * 0.22, h * 0.3, h * 0.7, '#2b4f9e', 0.11);
    neb(w * 0.8, h * 0.75, h * 0.65, '#7a3f86', 0.1);
    ctx.restore();

    for (const s of this.stars) {
      const a = 0.16 + 0.5 * (0.5 + 0.5 * Math.sin(time * 0.9 + s.phase));
      ctx.fillStyle = `rgba(220,240,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
      ctx.fill();
    }

    const layout = this.layout(time);
    this.positions = layout.positions;
    const { cx, cy } = layout;

    // órbitas
    for (const def of PLANETS) {
      const p = layout.positions[def.id];
      const selected = this.selected === def.id;
      ctx.strokeStyle = selected ? rgba(def.color2, 0.5) : 'rgba(120,160,230,0.1)';
      ctx.lineWidth = selected ? 1.2 : 1;
      ctx.setLineDash(selected ? [3, 5] : [2, 8]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.rx, p.rx * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // rota atual -> selecionado
    const currentId = state.planetId;
    if (this.selected && this.selected !== currentId && !this.game.travelAnim) {
      const a = layout.positions[currentId];
      const b = layout.positions[this.selected];
      if (a && b) {
        const locked = !planetUnlocked(state, b.def).ok;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.25);
        ctx.strokeStyle = locked ? 'rgba(255,196,107,0.18)' : 'rgba(110,231,255,0.28)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // sol
    const sunR = Math.max(12, Math.min(w, h) * 0.038);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sunG = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 6);
    sunG.addColorStop(0, 'rgba(255,246,220,0.95)');
    sunG.addColorStop(0.12, 'rgba(255,209,102,0.7)');
    sunG.addColorStop(0.4, 'rgba(255,154,99,0.18)');
    sunG.addColorStop(1, 'rgba(255,154,99,0)');
    ctx.fillStyle = sunG;
    ctx.beginPath();
    ctx.arc(cx, cy, sunR * 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff6dc';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, TAU);
    ctx.fill();
    // raios
    ctx.strokeStyle = 'rgba(255,209,102,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = time * 0.1 + (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * sunR * 1.4, cy + Math.sin(a) * sunR * 1.4);
      ctx.lineTo(cx + Math.cos(a) * sunR * 2.3, cy + Math.sin(a) * sunR * 2.3);
      ctx.stroke();
    }
    ctx.restore();

    // planetas
    for (const def of PLANETS) {
      const p = layout.positions[def.id];
      const claimed = state.planets[def.id]?.claimed;
      const unlocked = planetUnlocked(state, def).ok;
      const isCurrent = def.id === currentId;
      const isSelected = def.id === this.selected;
      const isHover = def.id === this.hover;

      if (isSelected) {
        const pulse = 0.65 + 0.35 * Math.sin(time * 2.4);
        ctx.strokeStyle = rgba(def.color2, 0.75 * pulse);
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 10, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        const c = 6;
        const off = p.r + 8;
        ctx.strokeStyle = rgba('#ffffff', 0.55);
        ctx.lineWidth = 1.2;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(p.x + sx * off, p.y + sy * (off - c));
          ctx.lineTo(p.x + sx * off, p.y + sy * off);
          ctx.lineTo(p.x + sx * (off - c), p.y + sy * off);
          ctx.stroke();
        }
      }

      // halo
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(p.x, p.y, p.r * 0.4, p.x, p.y, p.r * 3);
      halo.addColorStop(0, rgba(def.glow.startsWith('rgba') ? def.color : def.color, 0.2));
      halo.addColorStop(1, rgba(def.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3, 0, TAU);
      ctx.fill();
      ctx.restore();

      // anel traseiro
      if (def.id === 'aether') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-0.3);
        ctx.strokeStyle = rgba('#ffd166', 0.35);
        ctx.lineWidth = Math.max(2, p.r * 0.16);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.8, p.r * 0.45, 0, Math.PI, TAU);
        ctx.stroke();
        ctx.restore();
      }

      const g = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r);
      g.addColorStop(0, mixColor(def.color2, '#ffffff', 0.22));
      g.addColorStop(0.45, def.color);
      g.addColorStop(1, mixColor(def.color, '#080a16', 0.78));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();

      // textura
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.clip();
      const band = ctx.createLinearGradient(p.x - p.r, p.y, p.x + p.r, p.y);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.6, 'rgba(255,255,255,0.05)');
      band.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = band;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - p.r * 0.4 + i * p.r * 0.4, p.r, p.r * 0.07, 0.1, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // anel frontal
      if (def.id === 'aether') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-0.3);
        ctx.strokeStyle = rgba('#ffe0a3', 0.55);
        ctx.lineWidth = Math.max(2, p.r * 0.16);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.8, p.r * 0.45, 0, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
      }

      // planeta bloqueado
      if (!unlocked) {
        ctx.fillStyle = 'rgba(5,8,16,0.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,209,102,0.6)';
        ctx.lineWidth = 1.2;
        const lr = Math.max(4, p.r * 0.38);
        ctx.strokeRect(p.x - lr, p.y - lr * 0.5, lr * 2, lr * 1.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y - lr * 0.5, lr * 0.62, Math.PI, 0);
        ctx.stroke();
      }

      // status
      if (claimed) {
        ctx.fillStyle = '#7dffb2';
        ctx.beginPath();
        ctx.arc(p.x + p.r * 0.75, p.y - p.r * 0.75, 2.4, 0, TAU);
        ctx.fill();
      }

      // seleção por hover
      if (isHover && !isSelected) {
        ctx.strokeStyle = rgba(def.color2, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 7, 0, TAU);
        ctx.stroke();
      }

      // etiqueta
      const labelColor = isCurrent ? '#8feaff' : claimed ? '#a9f0c8' : unlocked ? '#b9c8e8' : '#8a7f68';
      ctx.fillStyle = labelColor;
      ctx.font = `${isSelected ? 'bold ' : ''}9px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(def.name.toUpperCase(), p.x, p.y + p.r + 16);
      if (isCurrent) {
        ctx.fillStyle = rgba('#6ee7ff', 0.85);
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillText('VOCÊ ESTÁ AQUI', p.x, p.y + p.r + 25);
      } else if (!unlocked) {
        ctx.fillStyle = 'rgba(255,209,102,0.75)';
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillText('BLOQUEADO', p.x, p.y + p.r + 25);
      } else if (claimed) {
        ctx.fillStyle = 'rgba(125,255,178,0.7)';
        ctx.font = '6px ui-monospace, monospace';
        ctx.fillText('COLONIZADO', p.x, p.y + p.r + 25);
      }
    }

    // nave em dobra
    if (this.game.travelAnim) {
      const anim = this.game.travelAnim;
      const a = layout.positions[anim.fromId];
      const b = layout.positions[anim.toId];
      if (a && b) {
        const raw = clamp((performance.now() - anim.start) / anim.duration, 0, 1);
        const ease = raw * raw * (3 - 2 * raw);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 100;
        const x = (1 - ease) * (1 - ease) * a.x + 2 * (1 - ease) * ease * mx + ease * ease * b.x;
        const y = (1 - ease) * (1 - ease) * a.y + 2 * (1 - ease) * ease * my + ease * ease * b.y;
        ctx.strokeStyle = 'rgba(110,231,255,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        ctx.fillStyle = '#dff8ff';
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-6, 5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, -5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 26);
        glow.addColorStop(0, 'rgba(110,231,255,0.7)');
        glow.addColorStop(1, 'rgba(110,231,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // moldura
    ctx.strokeStyle = 'rgba(126,190,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }
}

function mixColor(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${c(A.r, B.r)},${c(A.g, B.g)},${c(A.b, B.b)})`;
}

export { planetById };
