import { COLORS, FONT_DISPLAY } from './constants';
import type { Livery } from './drivers';
import type { SpriteKind } from './track';

export interface SpriteImage {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  worldW: number; // width in world units (road full width = 4000)
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shade(hex: string, amt: number): string {
  // amt in -1..1 ; negative darkens
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt < 0) {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  } else {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  }
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// F1 car, rear view
// ---------------------------------------------------------------------------
export function renderCar(l: Livery, W = 240, H = 130): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(W, H);
  const s = W / 240; // scale factor
  ctx.scale(s, s);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(120, 118, 108, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // rear tyres
  const tyre = (x: number) => {
    ctx.fillStyle = '#121212';
    roundRect(ctx, x, 46, 48, 72, 9);
    ctx.fill();
    ctx.fillStyle = '#1e1e1e';
    roundRect(ctx, x + 6, 52, 36, 62, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 8, 54, 6, 58);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 32, 54, 8, 58);
    // tread grooves
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 12 + i * 8, 56, 2, 56);
  };
  tyre(6);
  tyre(186);

  // rear wing endplates
  ctx.fillStyle = l.secondary;
  ctx.fillRect(22, 10, 9, 54);
  ctx.fillRect(209, 10, 9, 54);
  ctx.fillStyle = l.accent;
  ctx.fillRect(22, 10, 9, 5);
  ctx.fillRect(209, 10, 9, 5);

  // rear wing main plane + DRS flap
  ctx.fillStyle = l.secondary;
  roundRect(ctx, 30, 28, 180, 17, 3);
  ctx.fill();
  ctx.fillStyle = shade(l.secondary, 0.18);
  ctx.fillRect(30, 28, 180, 3);
  ctx.fillStyle = l.primary;
  roundRect(ctx, 34, 17, 172, 10, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(34, 17, 172, 2);

  // wing pylons
  ctx.fillStyle = shade(l.secondary, -0.2);
  ctx.fillRect(106, 44, 7, 24);
  ctx.fillRect(127, 44, 7, 24);

  // sidepods
  const pod = (mirror: boolean) => {
    ctx.save();
    if (mirror) {
      ctx.translate(240, 0);
      ctx.scale(-1, 1);
    }
    const g = ctx.createLinearGradient(50, 0, 90, 0);
    g.addColorStop(0, shade(l.primary, -0.45));
    g.addColorStop(1, shade(l.primary, -0.1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(54, 118);
    ctx.lineTo(52, 98);
    ctx.lineTo(62, 82);
    ctx.lineTo(86, 74);
    ctx.lineTo(90, 118);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  pod(false);
  pod(true);

  // engine cover body
  const bodyGrad = ctx.createLinearGradient(80, 0, 165, 0);
  bodyGrad.addColorStop(0, shade(l.primary, 0.15));
  bodyGrad.addColorStop(0.5, l.primary);
  bodyGrad.addColorStop(1, shade(l.primary, -0.4));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(78, 118);
  ctx.lineTo(84, 72);
  ctx.lineTo(98, 46);
  ctx.lineTo(110, 34);
  ctx.lineTo(130, 34);
  ctx.lineTo(142, 46);
  ctx.lineTo(156, 72);
  ctx.lineTo(162, 118);
  ctx.closePath();
  ctx.fill();

  // accent spine stripe
  ctx.fillStyle = l.accent;
  ctx.beginPath();
  ctx.moveTo(116, 40);
  ctx.lineTo(124, 40);
  ctx.lineTo(128, 96);
  ctx.lineTo(112, 96);
  ctx.closePath();
  ctx.fill();

  // airbox + halo + helmet peek
  ctx.fillStyle = '#0d0d0d';
  roundRect(ctx, 107, 22, 26, 16, 5);
  ctx.fill();
  ctx.fillStyle = l.helmet;
  ctx.beginPath();
  ctx.arc(120, 22, 7, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(120, 26, 22, 9, 0, Math.PI, 0);
  ctx.stroke();

  // diffuser
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.moveTo(64, 118);
  ctx.lineTo(74, 100);
  ctx.lineTo(166, 100);
  ctx.lineTo(176, 118);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  for (const fx of [84, 98, 142, 156]) ctx.fillRect(fx, 102, 2, 16);

  // exhaust
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.arc(120, 92, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(120, 92, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // rain light
  ctx.save();
  ctx.shadowColor = '#ff2a2a';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff2a2a';
  roundRect(ctx, 113, 104, 14, 8, 2);
  ctx.fill();
  ctx.restore();

  return c;
}

// ---------------------------------------------------------------------------
// Roadside scenery
// ---------------------------------------------------------------------------
const SPONSORS = [
  { text: 'APEX', bg: '#e10600', fg: '#ffffff' },
  { text: 'VELOCE', bg: '#1d4ed8', fg: '#ffffff' },
  { text: 'TURBO 9', bg: '#111111', fg: '#ffd400' },
  { text: 'GRIDLINE', bg: '#f59e0b', fg: '#111111' },
];

function renderTree(W: number, H: number, big: boolean): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#2a1a12';
  ctx.fillRect(W * 0.44, H * 0.55, W * 0.12, H * 0.45);
  const blobs = big
    ? [
        [0.5, 0.32, 0.36],
        [0.3, 0.5, 0.28],
        [0.7, 0.5, 0.28],
        [0.5, 0.58, 0.3],
      ]
    : [
        [0.5, 0.34, 0.34],
        [0.32, 0.52, 0.26],
        [0.68, 0.52, 0.26],
      ];
  for (const [bx, by, br] of blobs) {
    const g = ctx.createRadialGradient(W * bx - W * br * 0.35, H * by - W * br * 0.4, W * br * 0.1, W * bx, H * by, W * br);
    g.addColorStop(0, '#2f7a45');
    g.addColorStop(1, '#0f3a20');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(W * bx, H * by, W * br, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function renderBillboard(i: number): HTMLCanvasElement {
  const W = 220;
  const H = 210;
  const [c, ctx] = makeCanvas(W, H);
  const s = SPONSORS[i % SPONSORS.length];
  ctx.fillStyle = '#3b3b44';
  ctx.fillRect(34, 120, 12, 90);
  ctx.fillRect(174, 120, 12, 90);
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(8, 16, 204, 112);
  ctx.fillStyle = s.bg;
  ctx.fillRect(16, 24, 188, 96);
  ctx.fillStyle = s.fg;
  ctx.font = `700 40px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.text, W / 2, 74);
  return c;
}

function renderGrandstand(): HTMLCanvasElement {
  const W = 360;
  const H = 210;
  const [c, ctx] = makeCanvas(W, H);
  // structure
  ctx.fillStyle = '#23232c';
  ctx.fillRect(0, 60, W, 150);
  // roof
  ctx.fillStyle = '#e6e6e6';
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.lineTo(W, 60);
  ctx.lineTo(W - 10, 36);
  ctx.lineTo(10, 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 56, W, 8);
  // crowd
  const palette = ['#ffd400', '#e10600', '#38bdf8', '#f8f8f8', '#22c55e', '#f97316', '#a855f7', '#f472b6'];
  for (let row = 0; row < 8; row++) {
    const y = 78 + row * 15;
    for (let x = 10; x < W - 6; x += 10) {
      if (Math.random() < 0.12) continue;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.beginPath();
      ctx.arc(x + (row % 2) * 4, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // dark base with sponsor band
  ctx.fillStyle = '#111116';
  ctx.fillRect(0, 196, W, 14);
  return c;
}

function renderPole(): HTMLCanvasElement {
  const W = 70;
  const H = 340;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#5b5b66';
  ctx.fillRect(31, 40, 8, 300);
  ctx.fillStyle = '#d9d9e3';
  roundRect(ctx, 8, 22, 54, 24, 6);
  ctx.fill();
  const g = ctx.createRadialGradient(35, 46, 2, 35, 46, 34);
  g.addColorStop(0, 'rgba(255,240,180,0.95)');
  g.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 12, 70, 70);
  return c;
}

function renderTireWall(): HTMLCanvasElement {
  const W = 220;
  const H = 76;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 60, W, 16);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#f2f2f2' : '#c8101a';
    roundRect(ctx, i * 44 + 2, 14, 40, 50, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(i * 44 + 2, 52, 40, 12);
  }
  return c;
}

function renderGate(text: string, start: boolean): HTMLCanvasElement {
  const W = 720;
  const H = 240;
  const [c, ctx] = makeCanvas(W, H);
  // pylons
  ctx.fillStyle = '#1b1b22';
  ctx.fillRect(0, 30, 34, 210);
  ctx.fillRect(W - 34, 30, 34, 210);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 30, 34, 10);
  ctx.fillRect(W - 34, 30, 34, 10);
  // banner
  ctx.fillStyle = start ? '#0f0f14' : '#14141c';
  ctx.fillRect(0, 20, W, 84);
  // checkered strips
  const sq = 12;
  for (let x = 0; x < W; x += sq) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x / sq + y) % 2 ? '#f5f5f5' : '#111';
      ctx.fillRect(x, 20 + y * sq, sq, sq);
      ctx.fillRect(x, 104 - (y + 1) * sq, sq, sq);
    }
  }
  ctx.fillStyle = start ? COLORS.accent : '#ffffff';
  ctx.font = `700 46px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, 62);
  // little lights along the underside
  for (let x = 60; x < W - 40; x += 60) {
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(x, 106, 8, 5);
  }
  return c;
}

function renderFlag(): HTMLCanvasElement {
  const W = 70;
  const H = 220;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#cfcfd8';
  ctx.fillRect(6, 10, 6, 210);
  const sq = 10;
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
      ctx.fillRect(12 + x * sq, 12 + y * sq, sq, sq);
    }
  }
  return c;
}

export type SpriteAtlas = Record<SpriteKind, SpriteImage>;

export function buildSpriteAtlas(): SpriteAtlas {
  const wrap = (canvas: HTMLCanvasElement, worldW: number): SpriteImage => ({
    canvas,
    w: canvas.width,
    h: canvas.height,
    worldW,
  });
  return {
    tree: wrap(renderTree(170, 250, true), 1300),
    treeSmall: wrap(renderTree(120, 160, false), 800),
    billboard0: wrap(renderBillboard(0), 1500),
    billboard1: wrap(renderBillboard(1), 1500),
    billboard2: wrap(renderBillboard(2), 1500),
    billboard3: wrap(renderBillboard(3), 1500),
    grandstand: wrap(renderGrandstand(), 3400),
    pole: wrap(renderPole(), 320),
    tirewall: wrap(renderTireWall(), 1000),
    gate: wrap(renderGate('CHECKPOINT', false), 6000),
    gateStart: wrap(renderGate('APEX GP', true), 6000),
    flag: wrap(renderFlag(), 300),
  };
}

// ---------------------------------------------------------------------------
// Backdrop layers
// ---------------------------------------------------------------------------
export function renderSky(W: number, H: number, horizon: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(Math.max(1, W), Math.max(1, horizon + 2));
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.4, COLORS.skyMid);
  g.addColorStop(0.72, COLORS.skyLow);
  g.addColorStop(0.92, '#d9575b');
  g.addColorStop(1, COLORS.skyHorizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizon + 2);

  // stars
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = Math.random() * horizon * 0.55;
    const a = 0.25 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const r = Math.random() < 0.15 ? 1.8 : 1.1;
    ctx.fillRect(x, y, r, r);
  }

  // sun
  const r = Math.min(W, H) * 0.16;
  const sx = W * 0.66;
  const sy = horizon - r * 0.25;
  const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 2.4);
  glow.addColorStop(0, 'rgba(255,170,90,0.55)');
  glow.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, horizon + 2);
  const sun = ctx.createLinearGradient(0, sy - r, 0, sy + r);
  sun.addColorStop(0, COLORS.sunCore);
  sun.addColorStop(0.5, COLORS.sun);
  sun.addColorStop(1, '#ff6b3d');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  // retro bands across the lower half of the sun
  ctx.fillStyle = 'rgba(138,45,92,0.55)';
  for (let i = 0; i < 5; i++) {
    const by = sy + r * (0.15 + i * 0.17);
    ctx.fillRect(sx - r, by, r * 2, 2 + i * 1.3);
  }
  return c;
}

export function renderMountains(W: number, H: number): HTMLCanvasElement {
  const tileW = Math.max(2, W * 2);
  const mh = Math.max(2, Math.floor(H * 0.2));
  const [c, ctx] = makeCanvas(tileW, mh);
  ctx.beginPath();
  ctx.moveTo(0, mh);
  for (let x = 0; x <= tileW; x += 3) {
    const t = (x / tileW) * Math.PI * 2;
    const f =
      0.42 +
      0.22 * Math.sin(t * 3 + 1.2) +
      0.16 * Math.sin(t * 7 + 2.1) +
      0.09 * Math.sin(t * 13 + 0.4) +
      0.05 * Math.sin(t * 29 + 3.3);
    ctx.lineTo(x, mh - f * mh);
  }
  ctx.lineTo(tileW, mh);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, mh);
  g.addColorStop(0, '#4a1f5e');
  g.addColorStop(1, COLORS.mountains);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,160,120,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return c;
}

export function renderHills(W: number, H: number): HTMLCanvasElement {
  const tileW = Math.max(2, W * 2);
  const hh = Math.max(2, Math.floor(H * 0.1));
  const [c, ctx] = makeCanvas(tileW, hh);
  ctx.beginPath();
  ctx.moveTo(0, hh);
  for (let x = 0; x <= tileW; x += 3) {
    const t = (x / tileW) * Math.PI * 2;
    const f = 0.4 + 0.25 * Math.sin(t * 2 + 0.3) + 0.15 * Math.sin(t * 5 + 1.7) + 0.08 * Math.sin(t * 17);
    ctx.lineTo(x, hh - f * hh);
  }
  ctx.lineTo(tileW, hh);
  ctx.closePath();
  ctx.fillStyle = COLORS.hills;
  ctx.fill();
  // distant paddock lights
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * tileW;
    const y = hh * (0.55 + Math.random() * 0.4);
    ctx.fillStyle = Math.random() < 0.7 ? 'rgba(255,220,150,0.9)' : 'rgba(255,90,90,0.9)';
    ctx.fillRect(x, y, 2, 2);
  }
  return c;
}
