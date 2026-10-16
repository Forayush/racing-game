import {
  ACCEL,
  BOOST_DURATION,
  BOOST_FROM_NEAR_MISS,
  BOOST_FROM_OVERTAKE,
  BOOST_SPEED_MULT,
  BRAKING,
  CAMERA_DEPTH,
  CAMERA_HEIGHT,
  CAR_HALF_W,
  CAR_WORLD_W,
  CENTRIFUGAL,
  CHECKPOINT_BONUS_MIN,
  CHECKPOINT_BONUS_START,
  CHECKPOINT_SEGMENTS,
  COLLIDE_HALF_W,
  COLORS,
  COMBO_WINDOW,
  DECEL,
  FOG_DENSITY,
  FONT_DISPLAY,
  FONT_UI,
  LANES,
  MAX_SPEED,
  METERS_PER_SEGMENT,
  NEAR_MISS_DIST,
  OFF_ROAD_DECEL,
  OFF_ROAD_LIMIT,
  PLAYER_Z,
  ROAD_WIDTH,
  SCORE_CHECKPOINT,
  SCORE_NEAR_MISS,
  SCORE_OVERTAKE,
  SCORE_PER_SEGMENT,
  SEGMENT_LENGTH,
  START_TIME,
  STEER_FLOOR,
  TOP_KMH,
  TRAFFIC_BASE,
  TRAFFIC_MAX,
  TRAFFIC_PER_LEVEL,
} from './constants';
import { DRIVERS, TRAFFIC_LIVERIES, driverPhysics, type Driver, type DriverPhysics } from './drivers';
import { buildTrack, findSegment, percentRemaining, wrapZ, type Point3, type Segment, type Track, type TrafficCar } from './track';
import { buildSpriteAtlas, renderCar, renderHills, renderMountains, renderSky, type SpriteAtlas } from './sprites';
import { FloatingTexts, Particles } from './fx';
import type { AudioEngine } from './audio';
import type { Input } from './input';

export type Phase = 'attract' | 'countdown' | 'racing' | 'paused' | 'gameover';

export interface RunStats {
  score: number;
  distanceKm: number;
  overtakes: number;
  nearMisses: number;
  maxCombo: number;
  topKmh: number;
  checkpoints: number;
  time: number;
  driverId: string;
}

/** Live run state for DOM UI (pause card, touch boost ring). */
export interface HudSnapshot {
  score: number;
  timeLeft: number;
  sector: number;
  combo: number;
  /** Meter charge 0..1, or the remaining burn while boosting. */
  boostFill: number;
  boosting: boolean;
  boostReady: boolean;
}

export interface GameCallbacks {
  onGameOver: (stats: RunStats) => void;
  onPhase: (phase: Phase) => void;
  onMute: (muted: boolean) => void;
}

const STEP = 1 / 60;
const LANE_CENTERS = [-0.667, 0, 0.667];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const overlap = (x1: number, w1: number, x2: number, w2: number, pad = 1) =>
  !(x1 + w1 * pad < x2 - w2 * pad || x1 - w1 * pad > x2 + w2 * pad);
const expFog = (d: number, density: number) => 1 / Math.pow(Math.E, d * d * density);

function fmt(n: number): string {
  const s = Math.floor(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const idx = s.length - i;
    out = s[idx - 1] + out;
    if (i % 3 === 2 && idx > 1) out = ',' + out;
  }
  return out;
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

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private audio: AudioEngine;
  private cb: GameCallbacks;
  private track: Track;
  private atlas: SpriteAtlas;
  private carImgs: HTMLCanvasElement[];
  private playerImg: HTMLCanvasElement;
  private particles = new Particles(420);
  private texts = new FloatingTexts(20);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frameCount = 0;
  private destroyed = false;

  // viewport
  private W = 0;
  private H = 0;
  private dpr = 1;
  private safe = { top: 0, right: 0, bottom: 0, left: 0 };
  private touchMode = false;
  private bottomInset = 0;
  private sx = 1;
  private sy = 1;
  private horizon = 1;
  private ui = 1;
  private drawDistance = 300;
  private skyImg: HTMLCanvasElement | null = null;
  private mtnImg: HTMLCanvasElement | null = null;
  private hillImg: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private vignetteRed: HTMLCanvasElement | null = null;
  private vignetteBlue: HTMLCanvasElement | null = null;

  phase: Phase = 'attract';
  private prevPhase: Phase = 'attract';

  // player
  driver: Driver = DRIVERS[0];
  private phys: DriverPhysics = driverPhysics(DRIVERS[0]);
  private position = 0;
  private playerX = 0;
  private camX = 0;
  private speed = 0;
  private steer = 0;
  private maxSpeed = MAX_SPEED;
  private accel = ACCEL;
  private offRoad = false;
  private playerScreen = { x: 0, y: 0, w: 0, h: 0 };

  // run state
  private score = 0;
  private displayScore = 0;
  private timeLeft = 0;
  private distance = 0; // segments
  private overtakes = 0;
  private nearMisses = 0;
  private combo = 0;
  private comboTimer = 0;
  private maxCombo = 0;
  private topSpeed = 0;
  private checkpoints = 0;
  private nextCheckpoint = CHECKPOINT_SEGMENTS;
  private raceTime = 0;
  private lastTick = -1;
  private boostMeter = 0;
  private boostTime = 0;
  private boostReadyAnnounced = false;
  private boostHintTimer = 0;
  private crashTimer = 0;
  private countdown = 0;
  private lightsLit = 0;
  private goAt = 3;
  private goTimer = 0;
  private bannerTimer = 0;
  private bannerText = '';
  private bannerSub = '';
  private bannerColor = '#fff';
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flashA = 0;
  private flashColor = '255,255,255';
  private redVignette = 0;
  private skyOffset = 0;
  private hillOffset = 0;
  private fovMod = 1;
  private speedLines = 0;
  private cars: TrafficCar[] = [];
  private carId = 0;
  private level = 0;
  private lowTimePulse = 0;
  private autopilotTarget = 0;
  private autopilotTimer = 0;

  best = 0;

  constructor(canvas: HTMLCanvasElement, input: Input, audio: AudioEngine, cb: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.input = input;
    this.audio = audio;
    this.cb = cb;
    this.track = buildTrack();
    this.atlas = buildSpriteAtlas();
    this.carImgs = TRAFFIC_LIVERIES.map((l) => renderCar(l));
    this.playerImg = renderCar(DRIVERS[0].livery, 480, 260);
    this.input.attach();
    this.startAttract();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);

    // once the display fonts arrive, rebuild text-bearing sprites (gates / billboards)
    try {
      if (document.fonts) {
        Promise.all([
          document.fonts.load(`700 40px ${FONT_DISPLAY}`),
          document.fonts.load(`700 16px ${FONT_UI}`),
        ])
          .then(() => {
            if (!this.destroyed) this.atlas = buildSpriteAtlas();
          })
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
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
    this.skyImg = renderSky(w, h, this.horizon);
    this.mtnImg = renderMountains(w, h);
    this.hillImg = renderHills(w, h);
    this.vignette = makeVignette(w, h, '0,0,0', 0.55, 0.55);
    this.vignetteRed = makeVignette(w, h, '225,6,0', 0.25, 0.85);
    this.vignetteBlue = makeVignette(w, h, '56,189,248', 0.4, 0.6);
    // keep a frame on screen if we're frozen (paused) while the viewport changes
    if (this.phase === 'paused' && this.track) this.render();
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

  snapshot(): HudSnapshot {
    const boosting = this.boostTime > 0;
    return {
      score: Math.floor(this.score),
      timeLeft: Math.max(0, this.timeLeft),
      sector: this.checkpoints + 1,
      combo: this.combo,
      boostFill: boosting ? this.boostTime / BOOST_DURATION : this.boostMeter,
      boosting,
      boostReady: !boosting && this.boostMeter >= 1,
    };
  }

  setDriver(d: Driver) {
    this.driver = d;
    this.phys = driverPhysics(d);
    this.playerImg = renderCar(d.livery, 480, 260);
  }

  startRace(driver: Driver) {
    this.setDriver(driver);
    this.audio.unlock();
    this.resetRun();
    this.phase = 'countdown';
    this.countdown = 0;
    this.lightsLit = 0;
    this.goAt = 5 * 0.42 + rand(0.35, 0.9);
    this.input.clearQueue();
    this.cb.onPhase(this.phase);
  }

  startAttract() {
    this.resetRun();
    this.phase = 'attract';
    this.position = rand(0, this.track.length);
    this.speed = this.maxSpeed * 0.7;
    this.autopilotTarget = 0;
    this.audio.stopEngine();
    this.cb.onPhase(this.phase);
  }

  pause() {
    if (this.phase !== 'racing' && this.phase !== 'countdown') return;
    this.prevPhase = this.phase;
    this.phase = 'paused';
    this.audio.stopEngine();
    this.input.releaseAll();
    // settle the score ticker and repaint, so the frozen HUD matches the pause card
    this.displayScore = this.score;
    if (this.W > 0 && this.H > 0) this.render();
    this.cb.onPhase(this.phase);
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.prevPhase;
    this.audio.unlock();
    this.input.clearQueue();
    this.last = performance.now();
    this.acc = 0;
    this.cb.onPhase(this.phase);
  }

  togglePause() {
    if (this.phase === 'paused') this.resume();
    else this.pause();
  }

  restart() {
    this.startRace(this.driver);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.audio.stopEngine();
  }

  // ---------------------------------------------------------------------------
  // Setup helpers
  // ---------------------------------------------------------------------------

  private resetRun() {
    this.maxSpeed = MAX_SPEED * this.phys.maxSpeedMult;
    this.accel = ACCEL * this.phys.accelMult;
    this.position = 0;
    this.playerX = 0;
    this.camX = 0;
    this.speed = 0;
    this.steer = 0;
    this.score = 0;
    this.displayScore = 0;
    this.timeLeft = START_TIME;
    this.distance = 0;
    this.overtakes = 0;
    this.nearMisses = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.topSpeed = 0;
    this.checkpoints = 0;
    this.nextCheckpoint = CHECKPOINT_SEGMENTS;
    this.raceTime = 0;
    this.lastTick = -1;
    this.boostMeter = 0;
    this.boostTime = 0;
    this.boostReadyAnnounced = false;
    this.crashTimer = 0;
    this.goTimer = 0;
    this.bannerTimer = 0;
    this.shake = 0;
    this.flashA = 0;
    this.redVignette = 0;
    this.fovMod = 1;
    this.speedLines = 0;
    this.level = 0;
    this.offRoad = false;
    this.particles.clear();
    this.texts.clear();
    this.resetTraffic(TRAFFIC_BASE);
  }

  private resetTraffic(count: number) {
    for (const seg of this.track.segments) seg.cars.length = 0;
    this.cars = [];
    const n = this.track.segments.length;
    for (let i = 0; i < count; i++) {
      // keep the first stretch clear so the launch is clean
      const segIdx = Math.floor(rand(60, n - 20));
      this.spawnCar(segIdx * SEGMENT_LENGTH);
    }
  }

  private spawnCar(z: number) {
    const lane = LANE_CENTERS[Math.floor(Math.random() * LANES)];
    const offset = clamp(lane + rand(-0.12, 0.12), -0.85, 0.85);
    const seg = findSegment(this.track, z);
    // avoid stacking two cars in the same lane of one segment
    for (const other of seg.cars) if (Math.abs(other.offset - offset) < 0.5) return;
    const zz = wrapZ(z, this.track.length);
    let rel = zz - (this.position + PLAYER_Z);
    const half = this.track.length / 2;
    if (rel > half) rel -= this.track.length;
    if (rel < -half) rel += this.track.length;
    const car: TrafficCar = {
      id: this.carId++,
      offset,
      z: zz,
      speed: MAX_SPEED * rand(0.36, 0.64),
      livery: Math.floor(Math.random() * this.carImgs.length),
      percent: 0,
      halfW: CAR_HALF_W,
      wasAhead: rel > 0,
      passedTimer: 0,
    };
    seg.cars.push(car);
    this.cars.push(car);
  }

  private topUpTraffic(target: number) {
    const playerZ = this.position + PLAYER_Z;
    let attempts = 0;
    while (this.cars.length < target && attempts++ < 200) {
      const ahead = rand(400, this.track.length / SEGMENT_LENGTH - 400) * SEGMENT_LENGTH;
      this.spawnCar(wrapZ(playerZ + ahead, this.track.length));
    }
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
      if (this.input.consume('pause')) this.resume();
      if (this.input.consume('restart')) this.restart();
      if (this.input.consume('mute')) this.cb.onMute(this.audio.toggleMuted());
      return; // frozen frame stays on screen
    }

    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 4) this.acc = 0;
    if (this.W > 0 && this.H > 0) this.render();
  };

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  private update(dt: number) {
    this.frameCount++;
    const input = this.input;

    // the menu owns the keyboard while we're in attract mode
    if (this.phase !== 'attract' && input.consume('mute')) this.cb.onMute(this.audio.toggleMuted());

    switch (this.phase) {
      case 'attract':
        input.clearQueue();
        this.autopilot(dt);
        this.updatePhysics(dt, true);
        this.updateTraffic(dt);
        break;
      case 'countdown':
        if (input.consume('pause')) {
          this.pause();
          return;
        }
        this.updateCountdown(dt);
        this.audio.setEngine(0.05, true, false, false, 0.35 + 0.25 * Math.sin(this.countdown * 22));
        break;
      case 'racing':
        if (input.consume('pause')) {
          this.pause();
          return;
        }
        if (input.consume('boost')) this.tryBoost();
        this.updatePhysics(dt, false);
        this.updateTraffic(dt);
        this.updateRun(dt);
        break;
      case 'gameover':
        if (input.consume('confirm') || input.consume('restart')) this.restart();
        else if (input.consume('escape')) this.startAttract();
        this.speed = Math.max(0, this.speed - MAX_SPEED * 0.6 * dt);
        this.position = wrapZ(this.position + this.speed * dt, this.track.length);
        break;
    }

    this.updateFx(dt);
  }

  private updateCountdown(dt: number) {
    this.countdown += dt;
    const lit = Math.min(5, Math.floor(this.countdown / 0.42));
    if (lit > this.lightsLit) {
      this.lightsLit = lit;
      this.audio.playLight();
      this.addShake(1.5);
    }
    if (this.countdown >= this.goAt) {
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
      this.cb.onPhase(this.phase);
    }
  }

  private autopilot(dt: number) {
    this.autopilotTimer -= dt;
    const playerSeg = findSegment(this.track, this.position + PLAYER_Z);
    if (this.autopilotTimer <= 0) {
      this.autopilotTimer = 0.25;
      // choose the lane with the longest free run ahead
      let bestLane = this.autopilotTarget;
      let bestFree = -1;
      for (const lane of LANE_CENTERS) {
        let free = 60;
        for (let i = 1; i < 60; i++) {
          const seg = this.track.segments[(playerSeg.index + i) % this.track.segments.length];
          if (seg.cars.some((c) => Math.abs(c.offset - lane) < 0.5)) {
            free = i;
            break;
          }
        }
        if (free > bestFree || (free === bestFree && lane === this.autopilotTarget)) {
          bestFree = free;
          bestLane = lane;
        }
      }
      this.autopilotTarget = bestLane;
    }
    const diff = this.autopilotTarget - this.playerX;
    const target = clamp(diff * 5, -1, 1);
    this.steer += (target - this.steer) * Math.min(1, dt * 10);
  }

  private updatePhysics(dt: number, auto: boolean) {
    const input = this.input;
    const playerSeg = findSegment(this.track, this.position + PLAYER_Z);
    const speedPct = this.speed / this.maxSpeed;
    const boosting = this.boostTime > 0;

    if (!auto) {
      const target = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      this.steer += (target - this.steer) * Math.min(1, dt * 16);
    }

    this.position = wrapZ(this.position + this.speed * dt, this.track.length);

    const dx = dt * 2 * (STEER_FLOOR + (1 - STEER_FLOOR) * Math.min(1, speedPct)) * this.phys.steerMult;
    this.playerX += this.steer * dx;
    this.playerX -= dt * 2 * speedPct * speedPct * playerSeg.curve * CENTRIFUGAL * this.phys.centrifugalMult;

    const curMax = boosting ? this.maxSpeed * BOOST_SPEED_MULT : this.maxSpeed;
    const braking = !auto && input.brake;
    if (braking) {
      this.speed += BRAKING * dt;
      if (speedPct > 0.5 && this.frameCount % 3 === 0) {
        const p = this.playerScreen;
        this.particles.emitSmoke(p.x - p.w * 0.36, p.y);
        this.particles.emitSmoke(p.x + p.w * 0.36, p.y);
      }
    } else if (auto && this.speed > this.maxSpeed * 0.82) {
      this.speed += DECEL * dt;
    } else if (this.speed < curMax) {
      this.speed += this.accel * (boosting ? 2.2 : 1) * dt;
    } else {
      this.speed += DECEL * dt;
    }

    // off-road
    const wasOff = this.offRoad;
    this.offRoad = Math.abs(this.playerX) > 1.02;
    if (this.offRoad) {
      if (this.speed > OFF_ROAD_LIMIT) this.speed += OFF_ROAD_DECEL * dt;
      if (!wasOff && !auto) this.audio.playOffroadHit();
      const p = this.playerScreen;
      const side = this.playerX > 0 ? 1 : -1;
      this.particles.emitDust(p.x + side * p.w * 0.36, p.y, side, speedPct);
      if (this.frameCount % 2 === 0) this.particles.emitDust(p.x - side * p.w * 0.36, p.y, -side * 0.3, speedPct * 0.5);
      this.shake = Math.max(this.shake, 1.2 + speedPct * 2.2);
    }

    // player collisions with traffic in the same segment
    for (const car of playerSeg.cars) {
      if (this.speed > car.speed && overlap(this.playerX, COLLIDE_HALF_W, car.offset, COLLIDE_HALF_W)) {
        this.crash(car);
        break;
      }
    }

    // soft walls beyond the run-off
    if (this.playerX < -2.4) {
      this.playerX = -2.4;
      this.steer = Math.max(this.steer, 0);
    } else if (this.playerX > 2.4) {
      this.playerX = 2.4;
      this.steer = Math.min(this.steer, 0);
    }

    // above-limit speed (after a boost ends) bleeds off naturally via DECEL
    this.speed = clamp(this.speed, 0, this.maxSpeed * BOOST_SPEED_MULT * 1.02);

    // camera follows with a hint of lag for feel
    this.camX += (this.playerX - this.camX) * Math.min(1, dt * 14);

    // parallax
    const curveFactor = playerSeg.curve * speedPct * dt;
    this.skyOffset += curveFactor * 0.045;
    this.hillOffset += curveFactor * 0.085;
  }

  private updateTraffic(dt: number) {
    const playerZ = this.position + PLAYER_Z;
    const playerSeg = findSegment(this.track, playerZ);
    const half = this.track.length / 2;

    for (const car of this.cars) {
      const oldSeg = findSegment(this.track, car.z);
      car.offset += this.carSteer(car, oldSeg, playerSeg);
      car.z = wrapZ(car.z + dt * car.speed, this.track.length);
      car.percent = percentRemaining(car.z, SEGMENT_LENGTH);
      const newSeg = findSegment(this.track, car.z);
      if (oldSeg !== newSeg) {
        const idx = oldSeg.cars.indexOf(car);
        if (idx >= 0) oldSeg.cars.splice(idx, 1);
        newSeg.cars.push(car);
      }

      // ahead/behind bookkeeping → overtakes and near misses
      let rel = car.z - playerZ;
      if (rel > half) rel -= this.track.length;
      if (rel < -half) rel += this.track.length;
      const ahead = rel > 0;
      if (car.wasAhead && !ahead && rel > -SEGMENT_LENGTH * 6) {
        if (this.phase === 'racing') this.onPass(car);
      }
      car.wasAhead = ahead;
    }
  }

  private carSteer(car: TrafficCar, seg: Segment, playerSeg: Segment): number {
    const segs = this.track.segments;
    const n = segs.length;
    const lookahead = 20;
    // skip cars far from the player – nobody will notice
    const dist = (seg.index - playerSeg.index + n) % n;
    if (dist > this.drawDistance && dist < n - 40) return 0;

    for (let i = 1; i < lookahead; i++) {
      const s = segs[(seg.index + i) % n];
      if (s === playerSeg && car.speed > this.speed && overlap(this.playerX, CAR_HALF_W, car.offset, car.halfW, 1.2)) {
        let dir: number;
        if (this.playerX > 0.5) dir = -1;
        else if (this.playerX < -0.5) dir = 1;
        else dir = car.offset > this.playerX ? 1 : -1;
        return (dir * (1 / i) * (car.speed - this.speed)) / MAX_SPEED;
      }
      for (const other of s.cars) {
        if (car.speed > other.speed && overlap(car.offset, car.halfW, other.offset, other.halfW, 1.2)) {
          let dir: number;
          if (other.offset > 0.5) dir = -1;
          else if (other.offset < -0.5) dir = 1;
          else dir = car.offset > other.offset ? 1 : -1;
          return (dir * (1 / i) * (car.speed - other.speed)) / MAX_SPEED;
        }
      }
    }
    if (car.offset < -0.9) return 0.1;
    if (car.offset > 0.9) return -0.1;
    return 0;
  }

  private onPass(car: TrafficCar) {
    const mult = this.boostTime > 0 ? 2 : 1;
    this.overtakes++;
    this.score += SCORE_OVERTAKE * mult;
    this.addBoost(BOOST_FROM_OVERTAKE);
    const lateral = Math.abs(car.offset - this.playerX);
    const p = this.playerScreen;
    const side = car.offset > this.playerX ? 1 : -1;
    if (lateral < NEAR_MISS_DIST) {
      this.nearMisses++;
      this.combo++;
      this.comboTimer = COMBO_WINDOW;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = SCORE_NEAR_MISS * this.combo * mult;
      this.score += pts;
      this.addBoost(BOOST_FROM_NEAR_MISS);
      this.audio.playNearMiss(this.combo);
      this.addShake(2.5 + Math.min(this.combo, 6) * 0.4);
      this.particles.emitWind(p.x + side * p.w * 0.55, p.y - p.h * 0.6, side);
      const label = this.combo >= 5 ? 'INSANE!' : this.combo >= 3 ? 'CLOSE CALL!' : 'NEAR MISS';
      this.texts.add(
        `+${fmt(pts)}`,
        p.x + side * p.w * 0.7,
        p.y - p.h * 1.5,
        this.combo >= 3 ? COLORS.gold : '#ffffff',
        (26 + Math.min(this.combo, 8) * 2) * this.ui,
        this.combo > 1 ? `${label} ×${this.combo}` : label,
      );
    } else {
      this.audio.playOvertake();
      this.texts.add(`+${SCORE_OVERTAKE * mult}`, p.x + side * p.w * 0.5, p.y - p.h * 1.3, 'rgba(255,255,255,0.85)', 18 * this.ui, '', 0.7);
    }
  }

  private crash(car: TrafficCar) {
    const boosting = this.boostTime > 0;
    const live = this.phase === 'racing';
    this.speed = Math.min(this.speed, car.speed * 0.55);
    this.position = wrapZ(car.z - PLAYER_Z - SEGMENT_LENGTH * 0.5, this.track.length);
    this.crashTimer = 0.6;
    this.boostTime = 0;
    this.boostMeter = Math.max(0, this.boostMeter - 0.3);
    this.addShake(live ? (boosting ? 18 : 13) : 5);
    const p = this.playerScreen;
    const side = car.offset > this.playerX ? 1 : -1;
    this.particles.emitSparks(p.x + side * p.w * 0.3, p.y - p.h * 0.5, live ? 36 : 14, -side);
    if (live) {
      this.redVignette = 1;
      this.flash('255,120,80', 0.25);
      this.audio.playCrash();
      if (this.combo > 1) {
        this.texts.add('COMBO LOST', this.W / 2, this.H * 0.34, '#ff6b6b', 24 * this.ui, `×${this.combo} streak ended`, 1.1);
      }
    }
    this.combo = 0;
    this.comboTimer = 0;
  }

  private addBoost(amount: number) {
    const before = this.boostMeter;
    this.boostMeter = clamp(this.boostMeter + amount, 0, 1);
    if (before < 1 && this.boostMeter >= 1 && !this.boostReadyAnnounced) {
      this.boostReadyAnnounced = true;
      this.audio.playBoostReady();
      this.texts.add('BOOST READY', this.W / 2, this.H * 0.3, COLORS.boost, 26 * this.ui, this.touchMode ? 'tap BOOST' : 'press SPACE', 1.2);
    }
  }

  private tryBoost() {
    if (this.boostTime > 0) return;
    if (this.boostMeter < 1) {
      if (this.boostHintTimer <= 0) {
        this.boostHintTimer = 0.8;
        this.audio.playClick();
        this.texts.add(`BOOST ${Math.floor(this.boostMeter * 100)}%`, this.W / 2, this.H * 0.3, 'rgba(125,211,252,0.9)', 18 * this.ui, 'chain close calls to charge', 0.8);
      }
      return;
    }
    this.boostMeter = 0;
    this.boostReadyAnnounced = false;
    this.boostTime = BOOST_DURATION;
    this.audio.playBoost();
    this.addShake(7);
    this.flash('56,189,248', 0.3);
    this.texts.add('BOOST!', this.W / 2, this.H * 0.36, COLORS.boost, 40 * this.ui, '×2 SCORE', 1.0);
  }

  private checkpoint() {
    this.checkpoints++;
    this.level = this.checkpoints;
    const bonus = Math.max(CHECKPOINT_BONUS_MIN, CHECKPOINT_BONUS_START - this.checkpoints + 1);
    this.timeLeft += bonus;
    const pts = SCORE_CHECKPOINT + Math.floor(this.timeLeft) * 20;
    this.score += pts;
    this.nextCheckpoint += CHECKPOINT_SEGMENTS;
    this.bannerTimer = 1.8;
    this.bannerText = `SECTOR ${this.checkpoints} CLEAR`;
    this.bannerSub = `+${bonus}s   +${fmt(pts)} pts`;
    this.bannerColor = '#4ade80';
    this.audio.playCheckpoint();
    this.addShake(4);
    this.flash('255,255,255', 0.4);
    this.particles.emitConfetti(this.W / 2, this.H * 0.2, 70);
    this.topUpTraffic(Math.min(TRAFFIC_MAX, TRAFFIC_BASE + this.level * TRAFFIC_PER_LEVEL));
  }

  private updateRun(dt: number) {
    const boosting = this.boostTime > 0;
    const mult = boosting ? 2 : 1;
    const segsMoved = (this.speed * dt) / SEGMENT_LENGTH;
    this.distance += segsMoved;
    this.score += segsMoved * SCORE_PER_SEGMENT * mult;
    this.raceTime += dt;
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    if (this.distance >= this.nextCheckpoint) this.checkpoint();

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (boosting) {
      this.boostTime -= dt;
      const p = this.playerScreen;
      this.particles.emitFlame(p.x, p.y - p.h * 0.28, 1);
      this.shake = Math.max(this.shake, 1.6);
    }

    this.timeLeft -= dt;
    if (this.timeLeft < 10) {
      const sec = Math.ceil(this.timeLeft);
      if (sec !== this.lastTick && sec > 0) {
        this.lastTick = sec;
        this.audio.playLight();
        this.lowTimePulse = 1;
      }
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameOver();
      return;
    }

    const speedPct = this.speed / this.maxSpeed;
    this.audio.setEngine(Math.min(1, speedPct / (boosting ? BOOST_SPEED_MULT : 1)), true, boosting, this.offRoad);
    this.shake = Math.max(this.shake, speedPct * speedPct * 0.7);
  }

  private gameOver() {
    this.phase = 'gameover';
    this.audio.stopEngine();
    this.audio.playGameOver();
    this.addShake(6);
    this.flash('225,6,0', 0.35);
    const stats: RunStats = {
      score: Math.floor(this.score),
      distanceKm: (this.distance * METERS_PER_SEGMENT) / 1000,
      overtakes: this.overtakes,
      nearMisses: this.nearMisses,
      maxCombo: this.maxCombo,
      topKmh: Math.round((this.topSpeed / MAX_SPEED) * TOP_KMH),
      checkpoints: this.checkpoints,
      time: this.raceTime,
      driverId: this.driver.id,
    };
    this.displayScore = this.score;
    this.input.clearQueue();
    this.cb.onGameOver(stats);
    this.cb.onPhase(this.phase);
  }

  private updateFx(dt: number) {
    this.particles.update(dt);
    this.texts.update(dt);
    // shake decay
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
    this.boostHintTimer = Math.max(0, this.boostHintTimer - dt);
    this.lowTimePulse = Math.max(0, this.lowTimePulse - dt * 2);
    const targetFov = this.boostTime > 0 ? 0.88 : 1;
    this.fovMod += (targetFov - this.fovMod) * Math.min(1, dt * 4);
    const targetLines = this.boostTime > 0 ? 1 : 0;
    this.speedLines += (targetLines - this.speedLines) * Math.min(1, dt * 5);
    // score ticker
    const diff = this.score - this.displayScore;
    this.displayScore += diff * Math.min(1, dt * 8);
    if (Math.abs(diff) < 1) this.displayScore = this.score;
  }

  private addShake(n: number) {
    this.shake = Math.max(this.shake, n);
  }

  private flash(rgb: string, a: number) {
    this.flashColor = rgb;
    this.flashA = Math.max(this.flashA, a);
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

  private render() {
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
      ctx.fillStyle = COLORS.skyMid;
      ctx.fillRect(-2, -2, W + 4, this.horizon + 4);
    }
    this.drawParallax(this.mtnImg, this.skyOffset);
    this.drawParallax(this.hillImg, this.hillOffset);
    // horizon haze
    const hazeH = Math.max(8, H * 0.05);
    const haze = ctx.createLinearGradient(0, this.horizon - hazeH, 0, this.horizon);
    haze.addColorStop(0, 'rgba(214,121,106,0)');
    haze.addColorStop(1, 'rgba(214,121,106,0.9)');
    ctx.fillStyle = haze;
    ctx.fillRect(-2, this.horizon - hazeH, W + 4, hazeH);
    ctx.fillStyle = COLORS.fog;
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
        const scale = lerp(s1.scale, s2.scale, car.percent);
        const spriteX = lerp(s1.x, s2.x, car.percent) + scale * car.offset * ROAD_WIDTH * this.sx;
        const spriteY = lerp(s1.y, s2.y, car.percent);
        this.drawSprite(img, img.width, img.height, CAR_WORLD_W, scale, spriteX, spriteY, -0.5, seg.clip);
      }
      if (seg === playerSeg) this.drawPlayer(playerSeg, playerPercent, camDepth);
    }

    this.particles.draw(ctx);
    ctx.restore();

    // --- post fx ------------------------------------------------------------
    this.drawPostFx();

    if (this.phase !== 'attract') {
      this.drawHud();
      this.texts.draw(ctx, FONT_DISPLAY);
      if (this.phase === 'countdown' || this.goTimer > 0) this.drawLights();
      if (this.bannerTimer > 0) this.drawBanner();
    }
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
    const c = COLORS[seg.colorKey];

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
    if (detailed && seg.colorKey === 'light') {
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
      ctx.fillStyle = COLORS.fog;
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
    if (this.phase === 'racing' && this.timeLeft < 10 && this.vignetteRed) {
      ctx.globalAlpha = 0.25 + this.lowTimePulse * 0.4;
      ctx.drawImage(this.vignetteRed, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flashA})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private panel(x: number, y: number, w: number, h: number, skew = 10) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - skew, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
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

  private text(str: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  /** Top edge for HUD panels, clear of any notch / status bar. */
  private hudTop() {
    return Math.max(12 * this.ui, this.safe.top + 6);
  }

  private drawHud() {
    const ctx = this.ctx;
    // narrow screens get slimmer panels so score / time / dash never collide
    const compact = this.W < 600;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    this.drawScore(compact);
    this.drawTimer(compact);
    this.drawDash(compact);
    this.drawOffTrack();
    ctx.restore();
  }

  // ---- score + combo (top-left)
  private drawScore(compact: boolean) {
    const ctx = this.ctx;
    const u = this.ui;
    const x = Math.max(8 * u, this.safe.left + 4);
    const y = this.hudTop();
    const w = (compact ? 118 : 150) * u;
    const hasBest = this.best > 0;
    const h = (hasBest ? 64 : 50) * u;
    const boosting = this.boostTime > 0;

    ctx.fillStyle = 'rgba(8,8,14,0.66)';
    this.panel(x, y, w, h, 12 * u);
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(x, y, 4 * u, h);

    const tx = x + 12 * u;
    this.text('SCORE', tx, y + 15 * u, `700 ${10 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.6)');
    if (boosting) {
      // ×2 multiplier tag beside the label
      const bx = tx + 42 * u;
      const by = y + 5.5 * u;
      ctx.fillStyle = COLORS.boost;
      this.roundRect(bx, by, 24 * u, 12 * u, 3 * u);
      ctx.fill();
      this.text('×2', bx + 12 * u, by + 10 * u, `${9 * u}px ${FONT_DISPLAY}`, '#04121c', 'center');
    }
    this.text(fmt(this.displayScore), tx, y + 41 * u, `${(compact ? 22 : 26) * u}px ${FONT_DISPLAY}`, boosting ? COLORS.boost : '#ffffff');
    if (hasBest) {
      const beating = this.score > this.best;
      this.text(
        beating ? '★ NEW BEST' : `BEST ${fmt(this.best)}`,
        tx,
        y + 57 * u,
        `700 ${9.5 * u}px ${FONT_UI}`,
        beating ? COLORS.gold : 'rgba(255,255,255,0.5)',
      );
    }

    if (this.combo > 1) {
      const cy = y + h + 26 * u;
      const pulse = 1 + 0.08 * Math.sin(performance.now() / 90);
      const label = `×${this.combo}`;
      ctx.save();
      ctx.translate(tx, cy);
      ctx.scale(pulse, pulse);
      this.text(label, 0, 0, `${22 * u}px ${FONT_DISPLAY}`, COLORS.gold);
      const cw = ctx.measureText(label).width;
      this.text('COMBO', cw + 6 * u, 0, `700 ${11 * u}px ${FONT_UI}`, '#ffffff');
      ctx.restore();
      // combo window
      const bw = 92 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(tx, cy + 7 * u, bw, 4 * u);
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(tx, cy + 7 * u, bw * clamp(this.comboTimer / COMBO_WINDOW, 0, 1), 4 * u);
    }
  }

  // ---- clock + sector progress (top-centre)
  private drawTimer(compact: boolean) {
    const ctx = this.ctx;
    const u = this.ui;
    const W = this.W;
    const y = this.hudTop();
    const tw = (compact ? 104 : 132) * u;
    const th = 56 * u;
    const x = W / 2 - tw / 2;
    const low = this.timeLeft < 10 && this.phase === 'racing';

    ctx.fillStyle = low ? 'rgba(120,0,0,0.74)' : 'rgba(8,8,14,0.66)';
    this.panel(x, y, tw, th, 12 * u);
    this.text('TIME', W / 2, y + 15 * u, `700 ${10 * u}px ${FONT_UI}`, low ? 'rgba(255,205,205,0.9)' : 'rgba(255,255,255,0.6)', 'center');
    const t = Math.max(0, this.timeLeft);
    const s = low ? 1 + this.lowTimePulse * 0.25 : 1;
    ctx.save();
    ctx.translate(W / 2, y + 45 * u);
    ctx.scale(s, s);
    this.text(t < 10 ? t.toFixed(1) : Math.ceil(t).toString(), 0, 0, `${(compact ? 28 : 32) * u}px ${FONT_DISPLAY}`, low ? '#ff5252' : '#ffffff', 'center');
    ctx.restore();

    // progress to the next gate, tucked under the clock
    const segToGo = Math.max(0, this.nextCheckpoint - this.distance);
    const prog = clamp(1 - segToGo / CHECKPOINT_SEGMENTS, 0, 1);
    const px = x + 2 * u;
    const pw = tw - 10 * u;
    const py = y + th + 5 * u;
    const ph = 4 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.panel(px, py, pw, ph, 3 * u);
    if (prog > 0) {
      ctx.fillStyle = '#4ade80';
      this.panel(px, py, Math.max(3 * u, pw * prog), ph, 3 * u);
    }
    this.text(
      `SECTOR ${this.checkpoints + 1}  ·  ${((segToGo * METERS_PER_SEGMENT) / 1000).toFixed(2)} KM`,
      W / 2,
      py + ph + 13 * u,
      `700 ${9.5 * u}px ${FONT_UI}`,
      'rgba(255,255,255,0.62)',
      'center',
    );
  }

  // ---- dash: shift lights, speed, gear, boost meter (right, under the DOM pause button)
  private drawDash(compact: boolean) {
    const ctx = this.ctx;
    const u = this.ui;
    const boosting = this.boostTime > 0;
    const dw = (compact ? 128 : 156) * u;
    const dh = 84 * u;
    const x = this.W - Math.max(12 * u, this.safe.right + 4) - dw;
    // the pause button in App.tsx is 44px tall at top: max(12px, safe-area-inset-top)
    const y = Math.max(12, this.safe.top) + 44 + 8;
    ctx.fillStyle = 'rgba(8,8,14,0.66)';
    this.panel(x, y, dw + 4 * u, dh, 12 * u);

    // shift lights track revs within the current gear
    const speedPct = this.speed / this.maxSpeed;
    const gearF = clamp(speedPct, 0, 0.9999) * 8;
    const gear = this.speed < 1 ? 0 : Math.floor(gearF) + 1;
    const rpm = gearF - Math.floor(gearF);
    const leds = 12;
    // full strip at the limiter (where the car spends most of a run) rather than a distracting blink
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

    // boost meter: ten cells that fill, glow when ready and drain while burning
    const fill = boosting ? this.boostTime / BOOST_DURATION : this.boostMeter;
    const ready = !boosting && this.boostMeter >= 1;
    const cells = 10;
    const bx0 = x + 14 * u;
    const gap = 2 * u;
    const cw = (dw - 22 * u - gap * (cells - 1)) / cells;
    const by = y + 61 * u;
    const bh = 7 * u;
    const alpha = ready ? 0.7 + 0.3 * Math.sin(performance.now() / 110) : 1;
    for (let i = 0; i < cells; i++) {
      const f = clamp(fill * cells - i, 0, 1);
      const cx = bx0 + i * (cw + gap);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      this.panel(cx, by, cw, bh, 2 * u);
      if (f > 0) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = boosting ? '#fb923c' : ready ? '#7dd3fc' : COLORS.boost;
        this.panel(cx, by, Math.max(2 * u, cw * f), bh, 2 * u);
        ctx.globalAlpha = 1;
      }
    }
    const status = boosting ? 'BOOSTING  ·  ×2 SCORE' : ready ? `BOOST READY  ·  ${this.touchMode ? 'TAP' : 'SPACE'}` : `BOOST ${Math.floor(fill * 100)}%`;
    this.text(status, bx0, by + bh + 11 * u, `700 ${8.5 * u}px ${FONT_UI}`, ready ? '#e0f2fe' : boosting ? '#fed7aa' : 'rgba(255,255,255,0.6)');
  }

  private drawOffTrack() {
    if (!this.offRoad || this.phase !== 'racing') return;
    const ctx = this.ctx;
    const u = this.ui;
    const label = 'OFF TRACK';
    const font = `${15 * u}px ${FONT_DISPLAY}`;
    ctx.font = font;
    const icon = 16 * u;
    const h = 32 * u;
    const w = ctx.measureText(label).width + icon + 38 * u;
    const x = this.W / 2 - w / 2;
    const y = this.H * 0.6 - h / 2;
    ctx.save();
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
    this.text('!', ix + icon / 2, iy + icon * 0.34, `${10 * u}px ${FONT_DISPLAY}`, '#141000', 'center');
    this.text(label, ix + icon + 9 * u, iy + 5.5 * u, font, COLORS.gold);
    ctx.restore();
  }

  /** Free-standing start-light board, placed below the HUD so nothing crosses the clock. */
  private drawLights() {
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

    if (this.phase === 'countdown') {
      this.text(this.lightsLit >= 5 ? 'WAIT FOR IT…' : 'GET READY', W / 2, by + bh + 24 * u, `700 ${13 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.8)', 'center');
    }
  }

  private drawBanner() {
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
    ctx.font = `${26 * u}px ${FONT_DISPLAY}`;
    ctx.fillStyle = this.bannerColor;
    ctx.fillText(this.bannerText, 0, 0);
    ctx.font = `700 ${15 * u}px ${FONT_UI}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.bannerSub, 0, 26 * u);
    ctx.restore();
  }
}
