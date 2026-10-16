import { COLORS, FONT_DISPLAY } from './constants';
import type { Livery } from './drivers';
import type { SpriteKind } from './track';
import { ARCADE_PALETTE, type Palette, type SunStyle } from './themes';

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
  if (l.tcam) {
    ctx.fillStyle = l.tcam;
    roundRect(ctx, 111, 25, 18, 5, 1.5);
    ctx.fill();
  }
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

// ---------------------------------------------------------------------------
// Circuit scenery
// ---------------------------------------------------------------------------
function renderPine(): HTMLCanvasElement {
  const W = 120;
  const H = 280;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(W * 0.46, H * 0.78, W * 0.08, H * 0.22);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y0 = H * (0.03 + t * 0.6);
    const y1 = y0 + H * 0.26;
    const half = W * (0.16 + t * 0.33);
    const g = ctx.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
    g.addColorStop(0, '#24543a');
    g.addColorStop(0.55, '#173f27');
    g.addColorStop(1, '#0c2717');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(W / 2, y0);
    ctx.lineTo(W / 2 + half, y1);
    ctx.lineTo(W / 2 - half, y1);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

function renderPalm(): HTMLCanvasElement {
  const W = 200;
  const H = 300;
  const [c, ctx] = makeCanvas(W, H);
  const cx = W * 0.54;
  const cy = H * 0.26;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(W * 0.48, H);
  ctx.quadraticCurveTo(W * 0.4, H * 0.6, cx, cy);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const x = (1 - t) * (1 - t) * W * 0.48 + 2 * (1 - t) * t * W * 0.4 + t * t * cx;
    const y = (1 - t) * (1 - t) * H + 2 * (1 - t) * t * H * 0.6 + t * t * cy;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y - 2);
    ctx.stroke();
  }
  const fronds: [number, number][] = [
    [-2.9, 0.95],
    [-2.3, 1],
    [-1.75, 0.8],
    [-1.25, 0.8],
    [-0.75, 1],
    [-0.15, 0.95],
    [0.35, 0.85],
    [2.75, 0.85],
  ];
  for (const [a, len] of fronds) {
    const L = W * 0.46 * len;
    const ex = cx + Math.cos(a) * L;
    const ey = cy + Math.sin(a) * L * 0.55 + L * 0.42;
    const mx = cx + Math.cos(a) * L * 0.55;
    const my = cy + Math.sin(a) * L * 0.55 - L * 0.12;
    ctx.strokeStyle = '#1f6b34';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = '#3f9a52';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(mx, my - 2, ex, ey - 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a3d22';
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 7, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function renderBuilding(variant: number, night: boolean): HTMLCanvasElement {
  const W = 260;
  const H = 420;
  const [c, ctx] = makeCanvas(W, H);
  const dayBodies = ['#eadcc2', '#d8a27b', '#f1eee8'];
  const nightBodies = ['#151b36', '#1c1731', '#101a2d'];
  const body = night ? nightBodies[variant % 3] : dayBodies[variant % 3];
  const top = H * [0.06, 0.24, 0.14][variant % 3];
  ctx.fillStyle = body;
  ctx.fillRect(0, top, W, H - top);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(W * 0.72, top, W * 0.28, H - top);
  ctx.fillStyle = night ? '#2a3260' : 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, top, W, 7);
  const cols = 5;
  const rows = Math.floor((H - top - 70) / 34);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 16 + col * 48;
      const y = top + 24 + r * 34;
      if (night) {
        const lit = Math.random() < 0.55;
        ctx.fillStyle = lit ? (Math.random() < 0.75 ? '#ffd98a' : '#9bd8ff') : '#0a0e1d';
        ctx.fillRect(x, y, 28, 18);
      } else {
        ctx.fillStyle = '#5b7a93';
        ctx.fillRect(x, y, 28, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(x, y, 28, 4);
        if (variant % 3 === 1) {
          // shutters, Riviera style
          ctx.fillStyle = '#3f7a52';
          ctx.fillRect(x - 5, y, 5, 18);
          ctx.fillRect(x + 28, y, 5, 18);
        }
      }
    }
  }
  // street level
  ctx.fillStyle = night ? '#ffb347' : '#3a3f47';
  ctx.globalAlpha = night ? 0.55 : 1;
  ctx.fillRect(0, H - 46, W, 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = night ? '#0a0d1a' : '#2a2e35';
  ctx.fillRect(0, H - 16, W, 16);
  return c;
}

const BARRIER_ADS = [
  { bg: '#e10600', fg: '#ffffff', text: 'APEX' },
  { bg: '#111111', fg: '#ffd400', text: 'TURBO 9' },
  { bg: '#1d4ed8', fg: '#ffffff', text: 'VELOCE' },
  { bg: '#f59e0b', fg: '#111111', text: 'GRIDLINE' },
];

function renderWall(variant: number): HTMLCanvasElement {
  const W = 400;
  const H = 96;
  const [c, ctx] = makeCanvas(W, H);
  // catch fence
  ctx.strokeStyle = '#8b919b';
  ctx.lineWidth = 3;
  for (let x = 14; x < W; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(170,178,190,0.55)';
  ctx.lineWidth = 1.5;
  for (let y = 6; y < 40; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // concrete + advertising band
  ctx.fillStyle = '#d6d7dc';
  ctx.fillRect(0, 38, W, 58);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, 84, W, 12);
  const ad = BARRIER_ADS[variant % BARRIER_ADS.length];
  ctx.fillStyle = ad.bg;
  ctx.fillRect(0, 46, W, 30);
  ctx.fillStyle = ad.fg;
  ctx.font = `700 22px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ad.text, W / 2, 62);
  return c;
}

export type SpriteAtlas = Record<SpriteKind, SpriteImage>;

export function buildSpriteAtlas(p: Palette = ARCADE_PALETTE): SpriteAtlas {
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
    pine: wrap(renderPine(), 900),
    palm: wrap(renderPalm(), 1300),
    building0: wrap(renderBuilding(0, p.night), 3000),
    building1: wrap(renderBuilding(1, p.night), 3000),
    building2: wrap(renderBuilding(2, p.night), 3000),
    wall0: wrap(renderWall(0), 2600),
    wall1: wrap(renderWall(1), 2600),
    wall2: wrap(renderWall(2), 2600),
    wall3: wrap(renderWall(3), 2600),
  };
}

// ---------------------------------------------------------------------------
// Backdrop layers
// ---------------------------------------------------------------------------

/** Sun disc with glow; drawn into the sky image (arcade) or per frame so it tracks the heading (circuits). */
export function drawSun(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, sun: SunStyle) {
  const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 2.4);
  glow.addColorStop(0, sun.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - r * 2.4, sy - r * 2.4, r * 4.8, r * 4.8);
  const body = ctx.createLinearGradient(0, sy - r, 0, sy + r);
  body.addColorStop(0, sun.core);
  body.addColorStop(0.5, sun.color);
  body.addColorStop(1, sun.bands ? '#ff6b3d' : sun.color);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  if (sun.bands) {
    ctx.fillStyle = 'rgba(138,45,92,0.55)';
    for (let i = 0; i < 5; i++) {
      const by = sy + r * (0.15 + i * 0.17);
      ctx.fillRect(sx - r, by, r * 2, 2 + i * 1.3);
    }
  }
}

export function renderSky(W: number, H: number, horizon: number, p: Palette = ARCADE_PALETTE, withSun = true): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(Math.max(1, W), Math.max(1, horizon + 2));
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  for (const [t, col] of p.sky) g.addColorStop(t, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizon + 2);

  const stars = Math.round(90 * p.stars);
  for (let i = 0; i < stars; i++) {
    const x = Math.random() * W;
    const y = Math.random() * horizon * 0.55;
    const a = 0.25 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const r = Math.random() < 0.15 ? 1.8 : 1.1;
    ctx.fillRect(x, y, r, r);
  }

  if (withSun && p.sun) {
    const r = Math.min(W, H) * p.sun.size;
    drawSun(ctx, W * 0.66, horizon - r * 0.25, r, p.sun);
  }
  return c;
}

/** Periodic ridge profile in 0..1 so the tile wraps seamlessly. */
function ridge(t: number, terms: [number, number, number][], base: number) {
  let f = base;
  for (const [amp, freq, phase] of terms) f += amp * Math.sin(t * freq + phase);
  return f;
}

export function renderMountains(W: number, H: number, p: Palette = ARCADE_PALETTE): HTMLCanvasElement {
  const tileW = Math.max(2, W * 2);
  if (p.horizon === 'skyline') return renderSkyline(tileW, H, p);
  const tall = p.horizon === 'alps' ? 0.3 : p.horizon === 'dunes' ? 0.11 : 0.2;
  const mh = Math.max(2, Math.floor(H * tall));
  const [c, ctx] = makeCanvas(tileW, mh);
  const terms: [number, number, number][] =
    p.horizon === 'alps'
      ? [
          [0.2, 3, 1.2],
          [0.16, 7, 2.1],
          [0.12, 13, 0.4],
          [0.07, 29, 3.3],
          [0.04, 53, 1.1],
        ]
      : p.horizon === 'dunes'
        ? [
            [0.25, 2, 0.6],
            [0.12, 5, 2.2],
            [0.05, 9, 1.4],
          ]
        : [
            [0.22, 3, 1.2],
            [0.16, 7, 2.1],
            [0.09, 13, 0.4],
            [0.05, 29, 3.3],
          ];
  const base = p.horizon === 'dunes' ? 0.45 : 0.42;
  ctx.beginPath();
  ctx.moveTo(0, mh);
  for (let x = 0; x <= tileW; x += 3) {
    const t = (x / tileW) * Math.PI * 2;
    ctx.lineTo(x, mh - ridge(t, terms, base) * mh);
  }
  ctx.lineTo(tileW, mh);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, mh);
  g.addColorStop(0, p.mountains[0]);
  g.addColorStop(1, p.mountains[1]);
  ctx.fillStyle = g;
  ctx.fill();
  if (p.horizon === 'alps') {
    // snow above a wavy line, clipped to the peaks
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(245,250,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= tileW; x += 6) {
      const t = (x / tileW) * Math.PI * 2;
      ctx.lineTo(x, mh * (0.34 + 0.05 * Math.sin(t * 17) + 0.03 * Math.sin(t * 41)));
    }
    ctx.lineTo(tileW, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    ctx.strokeStyle = p.ridge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return c;
}

function renderSkyline(tileW: number, H: number, p: Palette): HTMLCanvasElement {
  const mh = Math.max(2, Math.floor(H * 0.22));
  const [c, ctx] = makeCanvas(tileW, mh);
  // far hazy layer then near blocks; buildings that cross the right edge repeat on the left
  for (const layer of [0, 1]) {
    let x = 0;
    while (x < tileW) {
      const w = 30 + Math.random() * 70;
      const h = mh * (layer ? 0.25 + Math.random() * 0.55 : 0.4 + Math.random() * 0.5);
      const col = layer ? p.mountains[1] : p.mountains[0];
      for (const ox of x + w > tileW ? [x, x - tileW] : [x]) {
        ctx.fillStyle = col;
        ctx.fillRect(ox, mh - h, w, h);
        if (p.night) {
          for (let wy = mh - h + 6; wy < mh - 4; wy += 7) {
            for (let wx = ox + 4; wx < ox + w - 4; wx += 6) {
              if (Math.random() < 0.28) {
                ctx.fillStyle = Math.random() < 0.8 ? 'rgba(255,214,140,0.85)' : 'rgba(150,210,255,0.85)';
                ctx.fillRect(wx, wy, 2, 3);
              }
            }
          }
        }
        if (Math.random() < 0.2) {
          ctx.fillStyle = p.night ? '#ff4d4d' : 'rgba(0,0,0,0.25)';
          ctx.fillRect(ox + w / 2 - 1, mh - h - 8, 2, 8);
        }
      }
      x += w + (layer ? 2 + Math.random() * 10 : 6 + Math.random() * 24);
    }
  }
  return c;
}

export function renderHills(W: number, H: number, p: Palette = ARCADE_PALETTE): HTMLCanvasElement {
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
  ctx.fillStyle = p.hills;
  ctx.fill();
  for (let i = 0; i < p.hillLights; i++) {
    const x = Math.random() * tileW;
    const y = hh * (0.55 + Math.random() * 0.4);
    ctx.fillStyle = p.night
      ? ['rgba(255,220,150,0.9)', 'rgba(150,210,255,0.9)', 'rgba(255,255,255,0.85)'][i % 3]
      : Math.random() < 0.7
        ? 'rgba(255,220,150,0.9)'
        : 'rgba(255,90,90,0.9)';
    ctx.fillRect(x, y, 2, 2);
  }
  return c;
}
