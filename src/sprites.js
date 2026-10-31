// Sprite do astronauta gerado em canvas — estilo pixel art.
// Quadro base 32x44, quatro direções e quatro quadros de caminhada.

const W = 32;
const H = 44;

const C = {
  outline: '#0a0d17',
  suit: '#e9f0ff',
  suitShade: '#b9c8e4',
  suitDark: '#93a4c4',
  accent: '#58e6d0',
  accent2: '#6ee7ff',
  visor: '#07101e',
  visorGlow: '#7cecff',
  glove: '#2b3552',
  boot: '#171d30',
  pack: '#3b4666',
  packHi: '#5d6d93',
  lamp: '#ffd166',
};

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function outlinedRect(ctx, x, y, w, h, fill, outline = C.outline) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, outline);
  rect(ctx, x, y, w, h, fill);
}

function drawLegs(ctx, dir, swing) {
  if (dir === 'left' || dir === 'right') {
    outlinedRect(ctx, 13, 29 + swing, 5, 10, C.suitShade);
    outlinedRect(ctx, 16, 29 - swing, 5, 10, C.suit);
    rect(ctx, 13, 37 + swing, 5, 3, C.boot);
    rect(ctx, 16, 37 - swing, 5, 3, C.boot);
    rect(ctx, 14, 33 + swing, 3, 2, C.suitDark);
    rect(ctx, 17, 33 - swing, 3, 2, C.suitDark);
    return;
  }
  outlinedRect(ctx, 10, 29 + swing, 5, 10, C.suitShade);
  outlinedRect(ctx, 17, 29 - swing, 5, 10, C.suit);
  rect(ctx, 9, 37 + swing, 6, 3, C.boot);
  rect(ctx, 17, 37 - swing, 6, 3, C.boot);
  rect(ctx, 11, 33 + swing, 3, 2, C.suitDark);
  rect(ctx, 18, 33 - swing, 3, 2, C.suitDark);
}

function drawBody(ctx, dir) {
  if (dir === 'up') {
    outlinedRect(ctx, 8, 14, 16, 18, C.pack);
    rect(ctx, 11, 17, 10, 12, C.packHi);
    rect(ctx, 13, 19, 6, 8, '#46557a');
    rect(ctx, 9, 28, 14, 4, C.suitShade);
    rect(ctx, 16, 30, 2, 2, C.lamp);
    return;
  }
  outlinedRect(ctx, 8, 15, 16, 17, C.suit);
  rect(ctx, 21, 16, 3, 14, C.suitShade);
  rect(ctx, 10, 16, 2, 13, C.suitShade);
  // peitoral e luz
  rect(ctx, 12, 19, 8, 6, C.suitDark);
  rect(ctx, 14, 20, 4, 3, '#172137');
  rect(ctx, 15, 21, 2, 1, C.accent2);
  // cinto
  rect(ctx, 9, 27, 14, 3, C.glove);
  rect(ctx, 15, 27, 3, 3, C.accent);
  // mangas
  rect(ctx, 7, 17, 2, 9, C.suitShade);
  rect(ctx, 23, 17, 2, 9, C.suitShade);
}

function drawArms(ctx, dir, swing) {
  if (dir === 'left' || dir === 'right') {
    outlinedRect(ctx, 18, 18 + swing, 5, 8, C.suit);
    rect(ctx, 18, 24 + swing, 5, 3, C.glove);
    outlinedRect(ctx, 10, 19 - swing, 4, 7, C.suitShade);
    rect(ctx, 10, 24 - swing, 4, 3, C.glove);
    return;
  }
  outlinedRect(ctx, 3, 17 + swing, 5, 10, C.suitShade);
  outlinedRect(ctx, 24, 17 - swing, 5, 10, C.suit);
  rect(ctx, 3, 24 + swing, 5, 3, C.glove);
  rect(ctx, 24, 24 - swing, 5, 3, C.glove);
}

function drawHelmet(ctx, dir) {
  if (dir === 'up') {
    outlinedRect(ctx, 8, 2, 16, 15, C.suit, C.outline);
    rect(ctx, 9, 3, 14, 13, C.suitShade);
    rect(ctx, 11, 5, 10, 9, '#d5e2f7');
    rect(ctx, 14, 8, 4, 4, '#899ab9');
    rect(ctx, 15, 9, 2, 2, C.accent);
    rect(ctx, 23, 4, 3, 2, C.accent2);
    return;
  }
  // casco
  outlinedRect(ctx, 8, 2, 16, 16, C.suit);
  rect(ctx, 21, 3, 3, 14, C.suitShade);
  rect(ctx, 8, 14, 16, 4, C.suitShade);
  // viseira
  rect(ctx, 10, 6, 12, 9, C.outline);
  rect(ctx, 11, 7, 10, 7, C.visor);
  if (dir === 'left' || dir === 'right') {
    rect(ctx, 11, 8, 4, 5, '#17314a');
    rect(ctx, 11, 8, 2, 3, C.visorGlow);
    rect(ctx, 10, 12, 9, 2, '#0b2034');
  } else {
    rect(ctx, 12, 8, 6, 4, '#12324d');
    rect(ctx, 12, 8, 2, 2, C.visorGlow);
    rect(ctx, 17, 11, 3, 1, '#2c7f9d');
  }
  // antena
  rect(ctx, 23, 0, 2, 3, C.outline);
  rect(ctx, 23, 0, 1, 2, C.accent2);
  // detalhe auricular
  rect(ctx, 7, 9, 2, 5, C.accent);
  rect(ctx, 25, 9, 2, 5, C.accent);
}

function drawFrame(ctx, dir, frame) {
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const swing = [0, 2, 0, -2][frame];
  const armSwing = [0, -1, 0, 1][frame];

  ctx.save();
  if (dir === 'right') {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    dir = 'left';
  }
  ctx.translate(0, bob);

  if (dir === 'up') {
    // mochila maior atrás
    drawLegs(ctx, dir, swing);
    drawBody(ctx, dir);
    drawArms(ctx, dir, armSwing);
    drawHelmet(ctx, dir);
  } else {
    drawLegs(ctx, dir, swing);
    drawBody(ctx, dir);
    drawArms(ctx, dir, armSwing);
    drawHelmet(ctx, dir);
  }
  ctx.restore();

  // pequena sombra no chão é desenhada no renderer
}

export function makePlayerSprites() {
  const dirs = ['down', 'left', 'right', 'up'];
  const result = {};
  for (const dir of dirs) {
    result[dir] = [];
    for (let frame = 0; frame < 4; frame++) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      drawFrame(ctx, dir, frame);
      result[dir].push(canvas);
    }
  }
  return result;
}

export const PLAYER_SPRITE_W = W;
export const PLAYER_SPRITE_H = H;
