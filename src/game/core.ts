import {
  ACCEL,
  CAMERA_DEPTH,
  CAMERA_HEIGHT,
  CAR_WORLD_W,
  COLORS,
  FOG_DENSITY,
  FONT_DISPLAY,
  FONT_UI,
  LANES,
  MAX_SPEED,
  PLAYER_Z,
  ROAD_WIDTH,
  SEGMENT_LENGTH,
  TOP_KMH,
} from './constants';
import { DRIVERS, driverPhysics, type Driver, type DriverPhysics } from './drivers';
import { findSegment, percentRemaining, type Point3, type Segment, type Track, type TrafficCar } from './track';
import { buildSpriteAtlas, drawSun, renderCar, renderHills, renderMountains, renderSky, type SpriteAtlas } from './sprites';
import { FloatingTexts, Particles } from './fx';
import { ARCADE_PALETTE, type Palette } from './themes';
import type { AudioEngine } from './audio';
import type { Input } from './input';

export type Phase = 'attract' | 'countdown' | 'racing' | 'paused' | 'gameover';

export interface EngineEvents {
  onPhase: (phase: Phase) => void;
  onMute: (muted: boolean) => void;
}

/** Ten-cell meter on the right-hand dash (boost in arcade, ERS on circuits). */
export interface DashMeter {
  fill: number;
  state: 'charging' | 'ready' | 'active';
  label: string;
}

/** Charge state for the touch boost button's ring. */
export interface MeterState {
  fill: number;
  active: boolean;
  ready: boolean;
}

export const STEP = 1 / 60;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const overlap = (x1: number, w1: number, x2: number, w2: number, pad = 1) =>
  !(x1 + w1 * pad < x2 - w2 * pad || x1 - w1 * pad > x2 + w2 * pad);
const expFog = (d: number, density: number) => 1 / Math.pow(Math.E, d * d * density);

export function fmt(n: number): string {
  const s = Math.floor(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const idx = s.length - i;
    out = s[idx - 1] + out;
    if (i % 3 === 2 && idx > 1) out = ',' + out;
  }
  return out;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function makeVignette(w: number, h: number, rgb: string, inner: number, outer: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w / 2));
  c.height = Math.max(1, Math.floor(h / 2));
  const ctx = c.getContext('2d')!;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, r * inner, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},${outer})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Shared pseudo-3D racer: frame loop, viewport, road / scenery / car rendering, post-fx,
 * start lights and HUD drawing helpers. Game modes subclass it and supply the rules.
 * Call `start()` once after construction.
 */
export abstract class Engine {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly input: Input;
  protected readonly audio: AudioEngine;
  protected readonly events: EngineEvents;
  protected track: Track;
  protected palette: Palette;
  protected atlas: SpriteAtlas;
  protected carImgs: HTMLCanvasElement[] = [];
  protected playerImg: HTMLCanvasElement;
  protected particles = new Particles(420);
  protected texts = new FloatingTexts(20);
  private raf = 0;
  private last = 0;
  private acc = 0;
  protected frameCount = 0;
  protected destroyed = false;

  // viewport
  protected W = 0;
  protected H = 0;
  protected dpr = 1;
  protected safe = { top: 0, right: 0, bottom: 0, left: 0 };
  protected touchMode = false;
  protected bottomInset = 0;
  protected sx = 1;
  protected sy = 1;
  protected horizon = 1;
  protected ui = 1;
  protected drawDistance = 300;
  private skyImg: HTMLCanvasElement | null = null;
  private mtnImg: HTMLCanvasElement | null = null;
  private hillImg: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private vignetteRed: HTMLCanvasElement | null = null;
  private vignetteBlue: HTMLCanvasElement | null = null;
  /** Draw the sun every frame at `sunBearing` instead of baking it into the sky. */
  protected liveSun = false;
  /** Sun position relative to the car's heading, radians (0 = dead ahead). */
  protected sunBearing = 0;

  phase: Phase = 'attract';
  protected prevPhase: Phase = 'attract';

  // player
  driver: Driver = DRIVERS[0];
  protected phys: DriverPhysics = driverPhysics(DRIVERS[0]);
  protected position = 0;
  protected playerX = 0;
  protected camX = 0;
  protected speed = 0;
  protected steer = 0;
  protected maxSpeed = MAX_SPEED;
  protected accel = ACCEL;
  protected offRoad = false;
  protected playerScreen = { x: 0, y: 0, w: 0, h: 0 };
  protected cars: TrafficCar[] = [];

  // shared fx
  protected boostTime = 0;
  protected crashTimer = 0;
  protected shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flashA = 0;
  private flashColor = '255,255,255';
  protected redVignette = 0;
  /** 0..1 red edge pulse a mode can drive (low clock, damage...). */
  protected warnPulse = 0;
  protected skyOffset = 0;
  protected hillOffset = 0;
  protected fovMod = 1;
  protected speedLines = 0;

  // start lights + banner
  protected countdown = 0;
  protected lightsLit = 0;
  protected goAt = 3;
  protected goTimer = 0;
  protected bannerTimer = 0;
  protected bannerText = '';
  protected bannerSub = '';
  protected bannerColor = '#fff';

  constructor(canvas: HTMLCanvasElement, input: Input, audio: AudioEngine, events: EngineEvents, track: Track, palette: Palette = ARCADE_PALETTE) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.input = input;
    this.audio = audio;
    this.events = events;
    this.track = track;
    this.palette = palette;
    this.atlas = buildSpriteAtlas(palette);
    this.playerImg = renderCar(this.driver.livery, 480, 260);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start() {
    this.input.attach();
    this.onStart();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    // once the display fonts arrive, rebuild text-bearing sprites (gates / billboards)
    try {
      if (document.fonts) {
        Promise.all([document.fonts.load(`700 40px ${FONT_DISPLAY}`), document.fonts.load(`700 16px ${FONT_UI}`)])
          .then(() => {
            if (!this.destroyed) this.atlas = buildSpriteAtlas(this.palette);
          })
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.audio.stopEngine();
  }

  protected abstract onStart(): void;
  protected abstract update(dt: number): void;
  /** HUD and anything else drawn on top of the scene after post-fx. */
  protected abstract drawOverlay(): void;
  /** Boost / ERS charge for the touch button ring. */
  abstract meter(): MeterState;

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  resize(w: number, h: number, dpr: number) {
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // portrait phones get a slightly narrower projection so the car doesn't swallow the screen
    this.sx = h > w ? w * 0.42 : Math.min(w / 2, h * 0.55);
    this.sy = h / 2;
    // the car's wheels sit at horizon + sy - 2.5% of the height; on portrait touch screens raise
    // the whole view so they clear the on-screen buttons (landscape already has room between them)
    const lift = h > w && this.bottomInset > 0 ? clamp(this.bottomInset - h * 0.025 + 8, 0, h * 0.16) : 0;
    this.horizon = Math.round(h * 0.5 - lift);
    this.ui = clamp(Math.min(w, h) / 430, 0.8, 1.45);
    this.drawDistance = w < 700 ? 220 : 300;
    this.skyImg = renderSky(w, h, this.horizon, this.palette, !this.liveSun);
    this.mtnImg = renderMountains(w, h, this.palette);
    this.hillImg = renderHills(w, h, this.palette);
    this.vignette = makeVignette(w, h, '0,0,0', 0.55, 0.55);
    this.vignetteRed = makeVignette(w, h, '225,6,0', 0.25, 0.85);
    this.vignetteBlue = makeVignette(w, h, '56,189,248', 0.4, 0.6);
    // keep a frame on screen if we're frozen (paused) while the viewport changes
    if (this.phase === 'paused') this.render();
  }

  /** Device safe-area insets in CSS px; the HUD keeps clear of them. */
  setSafeArea(top: number, right: number, bottom: number, left: number) {
    this.safe = { top, right, bottom, left };
  }

  /** Touch layout: tap prompts in the HUD, and room for on-screen controls `bottomInset` px tall. */
  setTouchMode(on: boolean, bottomInset = 0) {
    const inset = on ? Math.max(0, Math.round(bottomInset)) : 0;
    if (on === this.touchMode && inset === this.bottomInset) return;
    this.touchMode = on;
    this.bottomInset = inset;
    if (this.W > 0 && this.H > 0) this.resize(this.W, this.H, this.dpr);
  }

  setDriver(d: Driver) {
    this.driver = d;
    this.phys = driverPhysics(d);
    this.playerImg = renderCar(d.livery, 480, 260);
  }

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------

  pause() {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return;
    this.prevPhase = this.phase;
    this.phase = 'paused';
    this.audio.stopEngine();
    this.input.releaseAll();
    this.onPause();
    if (this.W > 0 && this.H > 0) this.render();
    this.events.onPhase(this.phase);
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.prevPhase;
    this.audio.unlock();
    this.input.clearQueue();
    this.last = performance.now();
    this.acc = 0;
    this.events.onPhase(this.phase);
  }

  togglePause() {
    if (this.phase === 'paused') this.resume();
    else this.pause();
  }

  /** Last chance to settle HUD values before the frozen pause frame is drawn. */
  protected onPause() {}

  /** Keys honoured while paused. */
  protected pausedInput() {
    if (this.input.consume('pause')) this.resume();
    if (this.input.consume('mute')) this.events.onMute(this.audio.toggleMuted());
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private frame = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;

    if (this.phase === 'paused') {
      this.pausedInput();
      return; // frozen frame stays on screen
    }

    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) {
      this.frameCount++;
      // the menus own the keyboard while we're in attract mode
      if (this.phase !== 'attract' && this.input.consume('mute')) this.events.onMute(this.audio.toggleMuted());
      this.update(STEP);
      this.updateFx(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 4) this.acc = 0;
    if (this.W > 0 && this.H > 0) this.render();
  };

  // ---------------------------------------------------------------------------
  // Shared update helpers
  // ---------------------------------------------------------------------------

  protected beginLights() {
    this.countdown = 0;
    this.lightsLit = 0;
    this.goAt = 5 * 0.42 + rand(0.35, 0.9);
  }

  /** Five reds, a random hold, lights out. Returns true on the frame the race starts. */
  protected updateLights(dt: number): boolean {
    this.countdown += dt;
    const lit = Math.min(5, Math.floor(this.countdown / 0.42));
    if (lit > this.lightsLit) {
      this.lightsLit = lit;
      this.audio.playLight();
      this.addShake(1.5);
    }
    if (this.countdown < this.goAt) return false;
    this.phase = 'racing';
    this.goTimer = 1.2;
    this.lightsLit = 0;
    this.audio.playGo();
    this.addShake(6);
    this.flash('255,255,255', 0.35);
    const p = this.playerScreen;
    for (let i = 0; i < 14; i++) {
      this.particles.emitSmoke(p.x - p.w * 0.36, p.y);
      this.particles.emitSmoke(p.x + p.w * 0.36, p.y);
    }
    this.texts.add('LIGHTS OUT!', this.W / 2, this.H * 0.4, COLORS.gold, 44 * this.ui, 'GO GO GO', 1.3);
    this.events.onPhase(this.phase);
    return true;
  }

  /** Dust, rumble and shake while the car is on the grass. */
  protected offRoadFx(wasOff: boolean, speedPct: number, audible: boolean) {
    if (!wasOff && audible) this.audio.playOffroadHit();
    const p = this.playerScreen;
    const side = this.playerX > 0 ? 1 : -1;
    this.particles.emitDust(p.x + side * p.w * 0.36, p.y, side, speedPct);
    if (this.frameCount % 2 === 0) this.particles.emitDust(p.x - side * p.w * 0.36, p.y, -side * 0.3, speedPct * 0.5);
    this.shake = Math.max(this.shake, 1.2 + speedPct * 2.2);
  }

  protected brakeSmoke() {
    const p = this.playerScreen;
    this.particles.emitSmoke(p.x - p.w * 0.36, p.y);
    this.particles.emitSmoke(p.x + p.w * 0.36, p.y);
  }

  /** Moves a car along the track and keeps the per-segment buckets the renderer reads in sync. */
  protected advanceCar(car: TrafficCar, dz: number) {
    const oldSeg = findSegment(this.track, car.z);
    let z = (car.z + dz) % this.track.length;
    if (z < 0) z += this.track.length;
    car.z = z;
    car.percent = percentRemaining(car.z, SEGMENT_LENGTH);
    const newSeg = findSegment(this.track, car.z);
    if (oldSeg !== newSeg) {
      const idx = oldSeg.cars.indexOf(car);
      if (idx >= 0) oldSeg.cars.splice(idx, 1);
      newSeg.cars.push(car);
    }
  }

  protected updateFx(dt: number) {
    this.particles.update(dt);
    this.texts.update(dt);
    if (this.shake > 0) {
      this.shakeX = rand(-1, 1) * this.shake;
      this.shakeY = rand(-1, 1) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 22 - this.shake * dt * 4);
    } else {
      this.shakeX = this.shakeY = 0;
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.redVignette = Math.max(0, this.redVignette - dt * 1.6);
    this.crashTimer = Math.max(0, this.crashTimer - dt);
    this.goTimer = Math.max(0, this.goTimer - dt);
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    const targetFov = this.boostTime > 0 ? 0.88 : 1;
    this.fovMod += (targetFov - this.fovMod) * Math.min(1, dt * 4);
    const targetLines = this.boostTime > 0 ? 1 : 0;
    this.speedLines += (targetLines - this.speedLines) * Math.min(1, dt * 5);
  }

  protected addShake(n: number) {
    this.shake = Math.max(this.shake, n);
  }

  protected flash(rgb: string, a: number) {
    this.flashColor = rgb;
    this.flashA = Math.max(this.flashA, a);
  }

  protected showBanner(text: string, sub: string, color: string, seconds = 1.8) {
    this.bannerText = text;
    this.bannerSub = sub;
    this.bannerColor = color;
    this.bannerTimer = seconds;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private project(p: Point3, camX: number, camY: number, camZ: number, camDepth: number) {
    p.camera.x = p.world.x - camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = p.world.z - camZ;
    p.screen.scale = camDepth / p.camera.z;
    p.screen.x = Math.round(this.W / 2 + p.screen.scale * p.camera.x * this.sx);
    p.screen.y = Math.round(this.horizon - p.screen.scale * p.camera.y * this.sy);
    p.screen.w = Math.round(p.screen.scale * ROAD_WIDTH * this.sx);
  }

  protected render() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const track = this.track;
    const segs = track.segments;
    const N = segs.length;
    const camDepth = CAMERA_DEPTH * this.fovMod;

    const base = findSegment(track, this.position);
    const basePercent = percentRemaining(this.position, SEGMENT_LENGTH);
    const playerSeg = findSegment(track, this.position + PLAYER_Z);
    const playerPercent = percentRemaining(this.position + PLAYER_Z, SEGMENT_LENGTH);
    const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent);

    ctx.save();
    ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));

    // --- backdrop --------------------------------------------------------
    if (this.skyImg) ctx.drawImage(this.skyImg, -2, -2, W + 4, this.horizon + 4);
    else {
      ctx.fillStyle = this.palette.sky[0][1];
      ctx.fillRect(-2, -2, W + 4, this.horizon + 4);
    }
    const sun = this.palette.sun;
    if (this.liveSun && sun && Math.abs(this.sunBearing) < 1.9) {
      const r = Math.min(W, H) * sun.size;
      drawSun(ctx, W / 2 + this.sunBearing * CAMERA_DEPTH * this.sx, this.horizon - r * 0.9, r, sun);
    }
    this.drawParallax(this.mtnImg, this.skyOffset);
    this.drawParallax(this.hillImg, this.hillOffset);
    const hazeH = Math.max(8, H * 0.05);
    const haze = ctx.createLinearGradient(0, this.horizon - hazeH, 0, this.horizon);
    haze.addColorStop(0, hexA(this.palette.haze, 0));
    haze.addColorStop(1, hexA(this.palette.haze, 0.9));
    ctx.fillStyle = haze;
    ctx.fillRect(-2, this.horizon - hazeH, W + 4, hazeH);
    ctx.fillStyle = this.palette.fog;
    ctx.fillRect(-2, this.horizon, W + 4, H - this.horizon + 4);

    // --- road ------------------------------------------------------------
    let maxy = H + 2;
    let x = 0;
    let dx = -(base.curve * basePercent);
    const camY = playerY + CAMERA_HEIGHT;
    const camXWorld = this.camX * ROAD_WIDTH;

    for (let n = 0; n < this.drawDistance; n++) {
      const seg = segs[(base.index + n) % N];
      seg.looped = seg.index < base.index;
      seg.fog = expFog(n / this.drawDistance, FOG_DENSITY);
      seg.clip = maxy;
      const camZ = this.position - (seg.looped ? track.length : 0);
      this.project(seg.p1, camXWorld - x, camY, camZ, camDepth);
      this.project(seg.p2, camXWorld - x - dx, camY, camZ, camDepth);
      x += dx;
      dx += seg.curve;

      if (seg.p1.camera.z <= camDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      this.drawSegment(seg, maxy);
      maxy = seg.p2.screen.y;
    }

    // --- sprites & cars (far → near) --------------------------------------
    for (let n = this.drawDistance - 1; n >= 0; n--) {
      const seg = segs[(base.index + n) % N];
      if (seg.p1.camera.z <= camDepth) {
        if (seg === playerSeg) this.drawPlayer(playerSeg, playerPercent, camDepth);
        continue;
      }
      const s1 = seg.p1.screen;
      const s2 = seg.p2.screen;
      for (const spr of seg.sprites) {
        const img = this.atlas[spr.kind];
        const scale = s1.scale;
        const spriteX = s1.x + scale * spr.offset * ROAD_WIDTH * this.sx;
        this.drawSprite(img.canvas, img.w, img.h, img.worldW, scale, spriteX, s1.y, spr.anchor, seg.clip);
      }
      for (const car of seg.cars) {
        const img = this.carImgs[car.livery];
        if (!img) continue;
        const scale = lerp(s1.scale, s2.scale, car.percent);
        const spriteX = lerp(s1.x, s2.x, car.percent) + scale * car.offset * ROAD_WIDTH * this.sx;
        const spriteY = lerp(s1.y, s2.y, car.percent);
        this.drawSprite(img, img.width, img.height, CAR_WORLD_W, scale, spriteX, spriteY, -0.5, seg.clip);
      }
      if (seg === playerSeg) this.drawPlayer(playerSeg, playerPercent, camDepth);
    }

    this.particles.draw(ctx);
    ctx.restore();

    this.drawPostFx();
    this.drawOverlay();
  }

  private drawParallax(img: HTMLCanvasElement | null, offset: number) {
    if (!img) return;
    const ctx = this.ctx;
    const tileW = img.width;
    let x0 = -(((offset * tileW) % tileW) + tileW) % tileW;
    if (x0 > 0) x0 -= tileW;
    const y = this.horizon - img.height;
    ctx.drawImage(img, x0, y);
    ctx.drawImage(img, x0 + tileW, y);
    if (x0 + tileW * 2 < this.W) ctx.drawImage(img, x0 + tileW * 2, y);
  }

  private drawSegment(seg: Segment, maxy: number) {
    const ctx = this.ctx;
    const W = this.W;
    const p1 = seg.p1.screen;
    const p2 = seg.p2.screen;
    let x1 = p1.x;
    let y1 = p1.y;
    let w1 = p1.w;
    if (y1 > maxy) {
      const t = (y1 - maxy) / (y1 - p2.y);
      x1 = lerp(x1, p2.x, t);
      w1 = lerp(w1, p2.w, t);
      y1 = maxy;
    }
    const x2 = p2.x;
    const y2 = p2.y;
    const w2 = p2.w;
    const c = this.palette[seg.colorKey];

    // grass
    ctx.fillStyle = c.grass;
    ctx.fillRect(-2, y2, W + 4, y1 - y2);

    const r1 = w1 / 6;
    const r2 = w2 / 6;
    // kerbs
    ctx.fillStyle = c.rumble;
    ctx.beginPath();
    ctx.moveTo(x1 - w1 - r1, y1);
    ctx.lineTo(x1 - w1, y1);
    ctx.lineTo(x2 - w2, y2);
    ctx.lineTo(x2 - w2 - r2, y2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x1 + w1 + r1, y1);
    ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x2 + w2 + r2, y2);
    ctx.closePath();
    ctx.fill();

    // asphalt
    ctx.fillStyle = c.road;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x2 - w2, y2);
    ctx.closePath();
    ctx.fill();

    // fine detail is invisible (and costly) on distant slivers
    const detailed = w1 > 14;

    // white track-limit lines
    if (detailed) {
      const e1 = Math.max(1, w1 / 40);
      const e2 = Math.max(1, w2 / 40);
      ctx.fillStyle = c.edge;
      ctx.beginPath();
      ctx.moveTo(x1 - w1, y1);
      ctx.lineTo(x1 - w1 + e1, y1);
      ctx.lineTo(x2 - w2 + e2, y2);
      ctx.lineTo(x2 - w2, y2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x1 + w1, y1);
      ctx.lineTo(x1 + w1 - e1, y1);
      ctx.lineTo(x2 + w2 - e2, y2);
      ctx.lineTo(x2 + w2, y2);
      ctx.closePath();
      ctx.fill();
    }

    // dashed lane markers
    if (detailed && seg.colorKey === 'light' && c.lane) {
      const l1 = Math.max(1, w1 / 32);
      const l2 = Math.max(1, w2 / 32);
      const lanew1 = (w1 * 2) / LANES;
      const lanew2 = (w2 * 2) / LANES;
      let lanex1 = x1 - w1 + lanew1;
      let lanex2 = x2 - w2 + lanew2;
      ctx.fillStyle = c.lane;
      for (let lane = 1; lane < LANES; lane++) {
        ctx.beginPath();
        ctx.moveTo(lanex1 - l1 / 2, y1);
        ctx.lineTo(lanex1 + l1 / 2, y1);
        ctx.lineTo(lanex2 + l2 / 2, y2);
        ctx.lineTo(lanex2 - l2 / 2, y2);
        ctx.closePath();
        ctx.fill();
        lanex1 += lanew1;
        lanex2 += lanew2;
      }
    }

    // fog
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = this.palette.fog;
      ctx.fillRect(-2, y2, W + 4, y1 - y2);
      ctx.globalAlpha = 1;
    }
  }

  private drawSprite(
    img: HTMLCanvasElement,
    w: number,
    h: number,
    worldW: number,
    scale: number,
    spriteX: number,
    spriteY: number,
    anchor: number,
    clipY: number,
  ) {
    const destW = scale * worldW * this.sx;
    if (destW < 1) return;
    const destH = destW * (h / w);
    const destX = spriteX + destW * anchor;
    const destY = spriteY - destH;
    if (destX > this.W + 4 || destX + destW < -4) return;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH < destH) {
      this.ctx.drawImage(img, 0, 0, w, h - (h * clipH) / destH, destX, destY, destW, destH - clipH);
    }
  }

  private drawPlayer(playerSeg: Segment, playerPercent: number, camDepth: number) {
    const ctx = this.ctx;
    const scale = camDepth / PLAYER_Z;
    const camY = lerp(playerSeg.p1.camera.y, playerSeg.p2.camera.y, playerPercent);
    const destW = scale * CAR_WORLD_W * this.sx;
    const destH = destW * (this.playerImg.height / this.playerImg.width);
    const speedPct = this.speed / this.maxSpeed;
    const bounce = (Math.random() - 0.5) * 2 * speedPct * speedPct * 1.5 * this.ui;
    const groundY = this.horizon - scale * camY * this.sy - this.H * 0.025 + bounce;
    const cx = this.W / 2 + (this.playerX - this.camX) * ROAD_WIDTH * scale * this.sx;

    this.playerScreen.x = cx;
    this.playerScreen.y = groundY;
    this.playerScreen.w = destW;
    this.playerScreen.h = destH;

    ctx.save();
    ctx.translate(cx, groundY);
    ctx.rotate(this.steer * 0.1);
    ctx.scale(1 - Math.abs(this.steer) * 0.06, 1);
    if (this.crashTimer > 0 && Math.floor(this.crashTimer * 30) % 2 === 0) ctx.globalAlpha = 0.6;
    ctx.drawImage(this.playerImg, -destW / 2, -destH, destW, destH);
    ctx.restore();

    // boost glow under the car
    if (this.boostTime > 0) {
      const g = ctx.createRadialGradient(cx, groundY - destH * 0.25, 0, cx, groundY - destH * 0.25, destW * 0.5);
      g.addColorStop(0, 'rgba(56,189,248,0.35)');
      g.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - destW * 0.5, groundY - destH * 0.75, destW, destH);
    }
  }

  private drawPostFx() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, W, H);

    if (this.speedLines > 0.02) {
      const cx = W / 2;
      const cy = this.horizon;
      const R = Math.max(W, H) * 0.8;
      ctx.save();
      ctx.globalAlpha = this.speedLines * 0.55;
      ctx.strokeStyle = '#e0f6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 34; i++) {
        const seed = ((i * 9301 + this.frameCount * 4929) % 233280) / 233280;
        const a = (i / 34) * Math.PI * 2 + seed * 0.2;
        const r0 = R * (0.22 + seed * 0.4);
        const r1 = r0 + R * (0.15 + seed * 0.3);
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.restore();
      if (this.vignetteBlue) {
        ctx.globalAlpha = this.speedLines * 0.7;
        ctx.drawImage(this.vignetteBlue, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }

    if (this.redVignette > 0 && this.vignetteRed) {
      ctx.globalAlpha = this.redVignette;
      ctx.drawImage(this.vignetteRed, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.warnPulse > 0 && this.vignetteRed) {
      ctx.globalAlpha = this.warnPulse;
      ctx.drawImage(this.vignetteRed, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flashA})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------------------
  // HUD helpers
  // ---------------------------------------------------------------------------

  /** Skewed parallelogram, the house style for HUD panels. */
  protected panel(x: number, y: number, w: number, h: number, skew = 10) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - skew, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  }

  protected roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  protected text(str: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  /** Top edge for HUD panels, clear of any notch / status bar. */
  protected hudTop() {
    return Math.max(12 * this.ui, this.safe.top + 6);
  }

  /** HUD is laid out more tightly on narrow screens. */
  protected get compact() {
    return this.W < 600;
  }

  /** Right-hand dash: shift lights, speed, gear and a ten-cell meter — sits under the DOM pause button. */
  protected drawDash(meter: DashMeter) {
    const ctx = this.ctx;
    const u = this.ui;
    const compact = this.compact;
    const boosting = this.boostTime > 0;
    const dw = (compact ? 128 : 156) * u;
    const dh = 84 * u;
    const x = this.W - Math.max(12 * u, this.safe.right + 4) - dw;
    // the pause button in App.tsx is 44px tall at top: max(12px, safe-area-inset-top)
    const y = Math.max(12, this.safe.top) + 44 + 8;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(8,8,14,0.66)';
    this.panel(x, y, dw + 4 * u, dh, 12 * u);

    // shift lights track revs within the current gear
    const speedPct = this.speed / this.maxSpeed;
    const gearF = clamp(speedPct, 0, 0.9999) * 8;
    const gear = this.speed < 1 ? 0 : Math.floor(gearF) + 1;
    const rpm = gearF - Math.floor(gearF);
    const leds = 12;
    // full strip at the limiter (where the car spends most of a straight) rather than a distracting blink
    const lit = this.speed < 1 ? 0 : boosting || speedPct > 0.97 ? leds : Math.round(rpm * leds);
    const lx0 = x + 22 * u;
    const step = (dw - 34 * u) / (leds - 1);
    const ly = y + 12 * u;
    const lr = (compact ? 3 : 3.4) * u;
    for (let i = 0; i < leds; i++) {
      const on = i < lit;
      const col = boosting ? COLORS.boost : i < 4 ? '#22c55e' : i < 8 ? '#ef4444' : '#a78bfa';
      const cx = lx0 + i * step;
      if (on) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, ly, lr * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = on ? col : 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(cx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }

    // speed readout + gear box
    const kmh = Math.round((this.speed / MAX_SPEED) * TOP_KMH);
    const jitter = this.speed > this.maxSpeed * 0.97 ? (Math.random() - 0.5) * 1.5 : 0;
    const gx = x + dw - 36 * u;
    this.text(kmh.toString(), gx - 6 * u, y + 52 * u + jitter, `${(compact ? 28 : 32) * u}px ${FONT_DISPLAY}`, boosting ? '#fb923c' : '#ffffff', 'right');
    this.text('KM/H', gx, y + 31 * u, `700 ${8.5 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.55)');
    ctx.strokeStyle = 'rgba(255,212,0,0.5)';
    ctx.lineWidth = Math.max(1, u);
    this.roundRect(gx, y + 36 * u, 22 * u, 18 * u, 4 * u);
    ctx.stroke();
    this.text(gear === 0 ? 'N' : gear.toString(), gx + 11 * u, y + 50.5 * u, `${14 * u}px ${FONT_DISPLAY}`, COLORS.gold, 'center');

    // meter: ten cells that fill, glow when ready and drain while active
    const ready = meter.state === 'ready';
    const active = meter.state === 'active';
    const cells = 10;
    const bx0 = x + 14 * u;
    const gap = 2 * u;
    const cw = (dw - 22 * u - gap * (cells - 1)) / cells;
    const by = y + 61 * u;
    const bh = 7 * u;
    const alpha = ready ? 0.7 + 0.3 * Math.sin(performance.now() / 110) : 1;
    for (let i = 0; i < cells; i++) {
      const f = clamp(meter.fill * cells - i, 0, 1);
      const cx = bx0 + i * (cw + gap);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      this.panel(cx, by, cw, bh, 2 * u);
      if (f > 0) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = active ? '#fb923c' : ready ? '#7dd3fc' : COLORS.boost;
        this.panel(cx, by, Math.max(2 * u, cw * f), bh, 2 * u);
        ctx.globalAlpha = 1;
      }
    }
    this.text(meter.label, bx0, by + bh + 11 * u, `700 ${8.5 * u}px ${FONT_UI}`, ready ? '#e0f2fe' : active ? '#fed7aa' : 'rgba(255,255,255,0.6)');
    ctx.restore();
  }

  protected drawOffTrack() {
    if (!this.offRoad || this.phase !== 'racing') return;
    const ctx = this.ctx;
    const u = this.ui;
    const label = 'OFF TRACK';
    const font = `${15 * u}px ${FONT_DISPLAY}`;
    ctx.save();
    ctx.font = font;
    const icon = 16 * u;
    const h = 32 * u;
    const w = ctx.measureText(label).width + icon + 38 * u;
    const x = this.W / 2 - w / 2;
    const y = this.H * 0.6 - h / 2;
    ctx.globalAlpha = 0.72 + 0.28 * Math.sin(performance.now() / 90);
    ctx.fillStyle = 'rgba(14,11,0,0.74)';
    this.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    // warning triangle
    const ix = x + 14 * u;
    const iy = y + h / 2;
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.moveTo(ix + icon / 2, iy - icon * 0.46);
    ctx.lineTo(ix + icon, iy + icon * 0.42);
    ctx.lineTo(ix, iy + icon * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.textBaseline = 'alphabetic';
    this.text('!', ix + icon / 2, iy + icon * 0.34, `${10 * u}px ${FONT_DISPLAY}`, '#141000', 'center');
    this.text(label, ix + icon + 9 * u, iy + 5.5 * u, font, COLORS.gold);
    ctx.restore();
  }

  /** Free-standing start-light board, placed below the HUD so nothing crosses the clock. */
  protected drawLights(label = true, sub?: string) {
    const ctx = this.ctx;
    const u = this.ui;
    const W = this.W;
    const fade = this.phase === 'countdown' ? 1 : clamp(this.goTimer / 0.5, 0, 1);
    const pods = 5;
    const podW = 26 * u;
    const podH = 54 * u;
    const gap = 7 * u;
    const inner = 9 * u;
    const bw = pods * podW + (pods - 1) * gap + inner * 2;
    const bh = podH + inner * 2;
    const bx = W / 2 - bw / 2;
    const by = Math.max(this.H * 0.2, this.hudTop() + 96 * u);
    const r = 9 * u;
    const lamp = (c: number, row: number) => ({ x: bx + inner + c * (podW + gap) + podW / 2, y: by + inner + podH * (row ? 0.72 : 0.28) });

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.roundRect(bx + 3 * u, by + 6 * u, bw, bh, 12 * u);
    ctx.fill();
    ctx.fillStyle = '#0b0b11';
    this.roundRect(bx, by, bw, bh, 12 * u);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, u);
    ctx.stroke();
    ctx.fillStyle = '#17171f';
    for (let c = 0; c < pods; c++) {
      this.roundRect(bx + inner + c * (podW + gap), by + inner, podW, podH, 7 * u);
      ctx.fill();
    }
    // glows first so no housing paints over a neighbour's halo
    for (let c = 0; c < pods; c++) {
      if (!(c < this.lightsLit && this.phase === 'countdown')) continue;
      for (let row = 0; row < 2; row++) {
        const p = lamp(c, row);
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r * 2.6);
        g.addColorStop(0, 'rgba(255,40,40,0.7)');
        g.addColorStop(1, 'rgba(255,40,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - r * 2.6, p.y - r * 2.6, r * 5.2, r * 5.2);
      }
    }
    for (let c = 0; c < pods; c++) {
      const on = c < this.lightsLit && this.phase === 'countdown';
      for (let row = 0; row < 2; row++) {
        const p = lamp(c, row);
        ctx.fillStyle = on ? '#ff2222' : '#2a0d0f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = on ? 'rgba(255,205,195,0.85)' : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (label && this.phase === 'countdown') {
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      // a dark plate keeps the labels readable over the start gantry
      const pw = 200 * u;
      const ph = (sub ? 44 : 26) * u;
      ctx.fillStyle = 'rgba(8,8,14,0.78)';
      this.roundRect(W / 2 - pw / 2, by + bh + 8 * u, pw, ph, 8 * u);
      ctx.fill();
      this.text(this.lightsLit >= 5 ? 'WAIT FOR IT…' : 'GET READY', W / 2, by + bh + 25 * u, `700 ${12 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.85)', 'center');
      if (sub) this.text(sub, W / 2, by + bh + 43 * u, `${11.5 * u}px ${FONT_DISPLAY}`, COLORS.gold, 'center');
      ctx.restore();
    }
  }

  protected drawBanner() {
    if (this.bannerTimer <= 0) return;
    const ctx = this.ctx;
    const u = this.ui;
    const W = this.W;
    const age = 1.8 - this.bannerTimer;
    const inT = clamp(age / 0.2, 0, 1);
    const outT = clamp(this.bannerTimer / 0.35, 0, 1);
    const scale = 0.7 + 0.3 * (1 - Math.pow(1 - inT, 3));
    ctx.save();
    ctx.globalAlpha = Math.min(inT, outT);
    ctx.translate(W / 2, this.H * 0.3);
    ctx.scale(scale, scale);
    const bw = Math.min(W * 0.9, 380 * u);
    ctx.fillStyle = 'rgba(8,8,14,0.78)';
    this.panel(-bw / 2, -30 * u, bw, 68 * u, 16 * u);
    ctx.fillStyle = this.bannerColor;
    ctx.fillRect(-bw / 2 + 8 * u, -30 * u, 5 * u, 68 * u);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${26 * u}px ${FONT_DISPLAY}`;
    ctx.fillStyle = this.bannerColor;
    ctx.fillText(this.bannerText, 0, 0);
    ctx.font = `700 ${15 * u}px ${FONT_UI}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.bannerSub, 0, 26 * u);
    ctx.restore();
  }
}
