import { BOOST_DURATION, COLORS, FONT_DISPLAY, FONT_UI, PLAYER_Z, SEGMENT_LENGTH } from './constants';
import { DRIVERS, driverById, driverColor, type Driver } from './drivers';
import { percentRemaining, type TrafficCar } from './track';
import { renderCar } from './sprites';
import { ARCADE_PALETTE, PALETTES } from './themes';
import { Engine, clamp, lerp, rand, type EngineEvents, type MeterState } from './core';
import { UNITS_PER_M, type BuiltCircuit } from './circuitBuilder';
import {
  BRAKE_DECEL,
  SEG_M,
  accelAt,
  botControls,
  mustBrake,
  racingLine,
  stepPlayerCar,
  aiPace,
  carPerf,
  gauss,
  gripAt,
  lapScatter,
  lapTime,
  speedProfile,
  splitTime,
  type CarPerf,
  type Difficulty,
} from './racePhysics';
import type { AudioEngine } from './audio';
import type { Input } from './input';

export type SessionKind = 'showcase' | 'qualifying' | 'race';

export interface SessionConfig {
  kind: SessionKind;
  circuit: BuiltCircuit;
  /** The player's driver (the camera car in showcase). */
  playerId: string;
  /** Race starting order, pole first. Defaults to every driver with the player last. */
  grid?: string[];
  /** Race distance, or timed laps in qualifying. */
  laps: number;
  difficulty: Difficulty;
}

export interface QualiEntry {
  driverId: string;
  best: number | null;
}

export interface RaceEntry {
  driverId: string;
  laps: number;
  /** Race time, or null for a retirement. */
  time: number | null;
  bestLap: number | null;
}

export interface SessionResult {
  kind: 'qualifying' | 'race';
  quali?: QualiEntry[];
  race?: RaceEntry[];
  playerBest: number | null;
  fastestLap: { driverId: string; time: number } | null;
}

/** Snapshot for the pause card. */
export interface SessionInfo {
  kind: SessionKind;
  position: number;
  total: number;
  lap: number;
  laps: number;
  best: number | null;
  last: number | null;
  outLap: boolean;
}

export interface RaceEvents extends EngineEvents {
  onSessionEnd: (result: SessionResult) => void;
}

interface Runner {
  idx: number;
  driver: Driver;
  isPlayer: boolean;
  /** Render proxy in the segment buckets (AI only). */
  car: TrafficCar | null;
  perf: CarPerf;
  profile: Float32Array;
  /** Distance from the start line in world units (negative on the grid). */
  dist: number;
  /** Speed, m/s. */
  v: number;
  x: number;
  speedNoise: number;
  scatter: number;
  laps: number;
  lapStart: number;
  lastLap: number | null;
  bestLap: number | null;
  finished: boolean;
  finishTime: number | null;
  lineBias: number;
  passX: number;
  passTimer: number;
  launchDelay: number;
}

const U = UNITS_PER_M;
const GRID_FRONT = 2 * SEGMENT_LENGTH;
const GRID_ROW = 9 * SEGMENT_LENGTH;
/** Bumper-to-bumper length used for contact checks. */
const CAR_LEN = 5.2 * U;
const CAR_HALF = 0.21;

export function fmtLap(t: number | null | undefined): string {
  if (t == null || !isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

/** Circuit racing: qualifying hot laps, full races against the AI grid, and a showcase loop for menus. */
export class RaceGame extends Engine {
  private cb: RaceEvents;
  readonly cfg: SessionConfig;
  readonly circuit: BuiltCircuit;
  private N: number;
  private L: number;
  private line: Float32Array;
  private runners: Runner[] = [];
  private player!: Runner;
  private order: Runner[] = [];
  private raceTime = 0;
  private sessionOver = false;
  private endTimer = -1;
  private flagOut = false;
  private flagTime = 0;
  private retired = false;
  private ers = 0;
  private wallTimer = 0;
  private brakeWarn = 0;
  private lastPos = 0;
  private fastest: { driverId: string; time: number } | null = null;
  private mapPath: Path2D | null = null;
  /** Dev builds only: `?autodrive` lets a bot drive the player's car with keyboard-style inputs (automated checks). */
  private readonly autodrive = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('autodrive');
  /** Race time at which the leader last passed each segment — gaps are read off it. */
  private leadPass = new Float64Array(0);
  private lastLeadSeg = 0;

  // qualifying
  private aiQuali: QualiEntry[] = [];
  private bestSectors: [number, number, number] = [Infinity, Infinity, Infinity];
  private mySectors: (number | null)[] = [null, null, null];
  private myBestSectors: [number, number, number] = [Infinity, Infinity, Infinity];
  private sectorMark = 0;
  private sectorIdx = 0;
  private lapTrace = new Float32Array(0);
  private bestTrace: Float32Array | null = null;
  private timedLaps = 0;
  private flying = false;

  constructor(canvas: HTMLCanvasElement, input: Input, audio: AudioEngine, cb: RaceEvents, cfg: SessionConfig) {
    super(canvas, input, audio, cb, cfg.circuit.track, PALETTES[cfg.circuit.def.palette] ?? ARCADE_PALETTE);
    this.cb = cb;
    this.cfg = cfg;
    this.circuit = cfg.circuit;
    this.liveSun = true;
    this.N = this.track.segments.length;
    this.L = this.track.length;
    this.line = racingLine(this.track.segments);
    this.setDriver(driverById(cfg.playerId) ?? DRIVERS[0]);
  }

  protected onStart() {
    this.setupSession();
    if (this.autodrive) (window as unknown as { __race?: RaceGame }).__race = this;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  meter(): MeterState {
    const active = this.boostTime > 0;
    return { fill: active ? this.boostTime / BOOST_DURATION : this.ers, active, ready: !active && this.ers >= 1 };
  }

  info(): SessionInfo {
    const pos = this.cfg.kind === 'qualifying' ? this.qualiPosition() : this.order.indexOf(this.player) + 1;
    return {
      kind: this.cfg.kind,
      position: pos,
      total: this.cfg.kind === 'qualifying' ? this.aiQuali.length + 1 : this.runners.length,
      lap: Math.min(this.cfg.laps, this.player.laps + 1),
      laps: this.cfg.laps,
      best: this.player.bestLap,
      last: this.player.lastLap,
      outLap: this.cfg.kind === 'qualifying' && this.player.dist < 0,
    };
  }

  restartSession() {
    this.setupSession();
  }

  /** Quit early: qualifying keeps the best lap so far; in a race the player retires. */
  endSession() {
    if (this.sessionOver) return;
    this.finishSession(true);
  }

  protected pausedInput() {
    super.pausedInput();
    if (this.input.consume('restart')) this.restartSession();
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private makeRunner(d: Driver, idx: number, isPlayer: boolean, pace: number): Runner {
    const perf = carPerf(d);
    let car: TrafficCar | null = null;
    if (!isPlayer) {
      car = { id: idx, offset: 0, z: 0, speed: 0, livery: idx, percent: 0, halfW: CAR_HALF, wasAhead: false, passedTimer: 0 };
    }
    return {
      idx,
      driver: d,
      isPlayer,
      car,
      perf,
      profile: speedProfile(this.track.segments, perf, pace),
      dist: 0,
      v: 0,
      x: 0,
      speedNoise: 1,
      scatter: lapScatter(d),
      laps: 0,
      lapStart: 0,
      lastLap: null,
      bestLap: null,
      finished: false,
      finishTime: null,
      lineBias: rand(0.55, 0.95),
      passX: 0,
      passTimer: 0,
      launchDelay: rand(0.12, 0.38),
    };
  }

  private setupSession() {
    const cfg = this.cfg;
    for (const seg of this.track.segments) seg.cars.length = 0;
    this.cars = [];
    this.runners = [];
    this.raceTime = 0;
    this.sessionOver = false;
    this.endTimer = -1;
    this.flagOut = false;
    this.retired = false;
    this.brakeWarn = 0;
    this.fastest = null;
    this.boostTime = 0;
    this.crashTimer = 0;
    this.goTimer = 0;
    this.bannerTimer = 0;
    this.wallTimer = 0;
    this.steer = 0;
    this.offRoad = false;
    this.particles.clear();
    this.texts.clear();
    this.input.clearQueue();

    if (cfg.kind === 'showcase') {
      // a dozen cars spread round the lap, camera riding along with the first
      const field = DRIVERS.slice(0, 12);
      field.forEach((d, i) => {
        const r = this.makeRunner(d, i, i === 0, 0.9 + Math.random() * 0.04);
        r.dist = (i / field.length) * this.L;
        r.v = r.profile[Math.floor(r.dist / SEGMENT_LENGTH) % this.N] ?? 40;
        r.x = this.line[Math.floor(r.dist / SEGMENT_LENGTH) % this.N] ?? 0;
        this.runners.push(r);
      });
      this.player = this.runners[0];
      this.setDriver(this.player.driver);
      this.phase = 'attract';
    } else if (cfg.kind === 'qualifying') {
      const me = this.makeRunner(this.driver, 0, true, 1);
      me.dist = -0.14 * this.L;
      const seg = Math.floor((this.L + me.dist) / SEGMENT_LENGTH) % this.N;
      me.v = me.profile[seg] * 0.82;
      me.x = this.line[seg];
      this.runners.push(me);
      this.player = me;
      this.ers = 1;
      this.timedLaps = 0;
      this.flying = false;
      this.mySectors = [null, null, null];
      this.myBestSectors = [Infinity, Infinity, Infinity];
      this.bestTrace = null;
      this.lapTrace = new Float32Array(this.N + 1).fill(NaN);
      this.sectorIdx = 0;
      this.sectorMark = 0;
      this.simulateQualifying();
      this.phase = 'racing';
    } else {
      const grid = cfg.grid ?? [...DRIVERS.filter((d) => d.id !== this.driver.id).map((d) => d.id), this.driver.id];
      grid.forEach((id, k) => {
        const d = driverById(id) ?? DRIVERS[k % DRIVERS.length];
        const isPlayer = d.id === this.driver.id;
        const r = this.makeRunner(d, k, isPlayer, isPlayer ? 1 : aiPace(d, cfg.difficulty));
        const row = Math.floor(k / 2);
        r.dist = -(GRID_FRONT + row * GRID_ROW + (k % 2) * (GRID_ROW / 2));
        r.x = k % 2 ? 0.42 : -0.42;
        this.runners.push(r);
      });
      this.player = this.runners.find((r) => r.isPlayer) ?? this.runners[0];
      this.ers = 0.5;
      this.phase = 'countdown';
      this.beginLights();
    }

    // car sprites in runner order; the player's own car is drawn separately
    this.carImgs = this.runners.map((r) => renderCar(r.driver.livery));
    for (const r of this.runners) {
      if (r.isPlayer) {
        this.playerX = r.x;
        this.camX = r.x;
        continue;
      }
      this.cars.push(r.car!);
      this.syncCar(r, true);
    }
    this.order = [...this.runners];
    this.lastPos = this.order.indexOf(this.player) + 1;
    this.leadPass = new Float64Array(this.N).fill(NaN);
    this.lastLeadSeg = this.segOf(this.order[0].dist).i;
    this.syncPlayer();
    this.events.onPhase(this.phase);
  }

  /** Pre-run every AI driver's qualifying: two flying laps each, keep the better. */
  private simulateQualifying() {
    const segs = this.track.segments;
    const [s1, s2] = this.circuit.sectors;
    this.bestSectors = [Infinity, Infinity, Infinity];
    this.aiQuali = DRIVERS.filter((d) => d.id !== this.driver.id).map((d) => {
      const profile = speedProfile(segs, carPerf(d), aiPace(d, this.cfg.difficulty));
      const base = lapTime(profile);
      const sc = lapScatter(d);
      const best = Math.min(base * (1 + gauss() * sc), base * (1 + gauss() * sc));
      const k = best / base;
      const splits = [splitTime(profile, 0, s1) * k, splitTime(profile, s1, s2) * k, splitTime(profile, s2, this.N) * k];
      splits.forEach((t, i) => (this.bestSectors[i] = Math.min(this.bestSectors[i], t)));
      return { driverId: d.id, best };
    });
    this.aiQuali.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  protected update(dt: number) {
    const input = this.input;
    switch (this.phase) {
      case 'attract':
        input.clearQueue();
        this.autopilot(this.player, dt, 1);
        this.updateAI(dt);
        break;
      case 'countdown':
        if (input.consume('pause')) {
          this.pause();
          return;
        }
        this.syncPlayer();
        this.audio.setEngine(0.05, true, false, false, 0.35 + 0.25 * Math.sin(this.countdown * 22));
        this.updateLights(dt);
        break;
      case 'racing':
        if (input.consume('pause')) {
          this.pause();
          return;
        }
        if (input.consume('boost')) this.deployErs();
        this.raceTime += dt;
        this.drivePlayer(dt);
        this.updateAI(dt);
        this.updateTiming();
        break;
      case 'gameover':
        this.raceTime += dt;
        this.autopilot(this.player, dt, 0.7);
        this.updateAI(dt);
        this.updateTiming();
        break;
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.emitResult();
    }
  }

  private segOf(dist: number) {
    let z = dist % this.L;
    if (z < 0) z += this.L;
    return { z, i: Math.floor(z / SEGMENT_LENGTH) % this.N };
  }

  private syncPlayer() {
    const p = this.player;
    let pos = (p.dist - PLAYER_Z) % this.L;
    if (pos < 0) pos += this.L;
    this.position = pos;
    this.speed = p.v * U;
    this.maxSpeed = p.perf.vTop * U;
    const { i, z } = this.segOf(p.dist);
    const segs = this.track.segments;
    const t = percentRemaining(z, SEGMENT_LENGTH);
    const next = i + 1 === this.N ? segs[i].heading + segs[i].kappa * SEG_M : segs[i + 1].heading;
    const heading = lerp(segs[i].heading, next, t);
    // one full turn of the lap scrolls the backdrop exactly one tile, so it never jumps at the line
    this.skyOffset = heading / (Math.PI * 2);
    this.hillOffset = heading / (Math.PI * 2);
    if (this.palette.sun) this.sunBearing = wrapAngle(this.palette.sun.azimuth - heading);
  }

  private syncCar(r: Runner, force = false) {
    const car = r.car!;
    const { z } = this.segOf(r.dist);
    car.offset = r.x;
    car.speed = r.v * U;
    if (force) {
      for (const seg of this.track.segments) {
        const k = seg.cars.indexOf(car);
        if (k >= 0) seg.cars.splice(k, 1);
      }
      car.z = z;
      car.percent = percentRemaining(z, SEGMENT_LENGTH);
      this.track.segments[Math.floor(z / SEGMENT_LENGTH) % this.N].cars.push(car);
      return;
    }
    this.advanceCar(car, z - car.z);
  }

  private drivePlayer(dt: number) {
    const p = this.player;
    const segs = this.track.segments;
    const { i, z } = this.segOf(p.dist);
    const k = lerp(segs[i].kappa, segs[(i + 1) % this.N].kappa, percentRemaining(z, SEGMENT_LENGTH));
    const ersOn = this.boostTime > 0;
    const car = { v: p.v, x: this.playerX, steer: this.steer };
    const ctl = this.autodrive ? botControls(car, i, segs, this.line, p.profile, p.perf) : this.input;

    const wasOff = this.offRoad;
    const out = stepPlayerCar(car, ctl, k, p.perf, ersOn, this.circuit.wallAt, this.wallTimer, dt);
    this.steer = car.steer;
    this.playerX = car.x;
    this.offRoad = out.offRoad;

    if (ctl.brake) {
      this.ers = Math.min(1, this.ers + dt * 0.16);
      if (car.v > 30 && this.frameCount % 3 === 0) this.brakeSmoke();
    }
    if (out.offRoad) this.offRoadFx(wasOff, car.v / p.perf.vTop, true);
    if (out.over > gripAt(car.v, p.perf) * 0.15 && this.frameCount % 4 === 0) this.brakeSmoke();
    if (out.wallHit) {
      const hit = Math.min(1, p.v / 40);
      this.wallTimer = 0.5;
      this.crashTimer = 0.45;
      this.redVignette = 0.6 * hit + 0.2;
      this.addShake(5 + hit * 9);
      this.audio.playCrash();
      const ps = this.playerScreen;
      this.particles.emitSparks(ps.x + out.wallHit * ps.w * 0.4, ps.y - ps.h * 0.4, 24, -out.wallHit);
    }

    if (ersOn) {
      this.boostTime -= dt;
      const ps = this.playerScreen;
      this.particles.emitFlame(ps.x, ps.y - ps.h * 0.28, 0.8);
    }
    // passive harvest spread over the lap
    this.ers = Math.min(1, this.ers + ((car.v * dt) / (this.L / U)) * 0.55);

    p.v = car.v;
    p.x = this.playerX;
    p.dist += p.v * U * dt;
    this.camX += (this.playerX - this.camX) * Math.min(1, dt * 14);
    this.syncPlayer();

    // braking marker: would we still make the slowest point ahead at full brakes?
    const need = mustBrake(p.v, this.segOf(p.dist).i, p.profile);
    this.brakeWarn = need && !ctl.brake ? Math.min(1, this.brakeWarn + dt * 8) : Math.max(0, this.brakeWarn - dt * 6);

    const pct = p.v / p.perf.vTop;
    this.audio.setEngine(Math.min(1, pct), true, ersOn, this.offRoad);
    this.shake = Math.max(this.shake, pct * pct * 0.6);
  }

  private deployErs() {
    if (this.boostTime > 0) return;
    if (this.ers < 1) {
      this.audio.playClick();
      this.texts.add(`ERS ${Math.floor(this.ers * 100)}%`, this.W / 2, this.H * 0.3, 'rgba(125,211,252,0.9)', 18 * this.ui, 'brake to harvest energy', 0.8);
      return;
    }
    this.ers = 0;
    this.boostTime = BOOST_DURATION;
    this.audio.playBoost();
    this.addShake(5);
    this.flash('56,189,248', 0.22);
    this.texts.add('ERS DEPLOY', this.W / 2, this.H * 0.34, COLORS.boost, 32 * this.ui, 'overtake mode', 0.9);
  }

  /** Drives a runner along the racing line at a share of its ideal speed (menus, cool-down lap). */
  private autopilot(r: Runner, dt: number, pace: number) {
    const { i } = this.segOf(r.dist);
    const target = r.profile[i] * pace;
    r.v = r.v < target ? Math.min(target, r.v + accelAt(r.v, r.perf) * dt) : Math.max(target, r.v - BRAKE_DECEL * dt);
    const want = this.line[i] * r.lineBias;
    r.x += clamp(want - r.x, -0.9 * dt, 0.9 * dt);
    r.dist += r.v * U * dt;
    if (r.isPlayer) {
      this.steer += (clamp((want - this.playerX) * 4, -1, 1) - this.steer) * Math.min(1, dt * 8);
      this.playerX = r.x;
      this.camX += (this.playerX - this.camX) * Math.min(1, dt * 10);
      this.offRoad = false;
      this.syncPlayer();
    }
  }

  private sideFree(self: Runner, x: number): boolean {
    for (const q of this.runners) {
      if (q === self) continue;
      const gap = q.dist - self.dist;
      if (gap > -CAR_LEN * 1.6 && gap < CAR_LEN * 3.5 && Math.abs(q.x - x) < 0.48) return false;
    }
    return true;
  }

  private updateAI(dt: number) {
    const racing = this.phase === 'racing' || this.phase === 'gameover';
    for (const r of this.runners) {
      if (r.isPlayer) continue;
      if (this.phase === 'countdown') {
        this.syncCar(r);
        continue;
      }
      if (racing && this.raceTime < r.launchDelay && this.cfg.kind === 'race') continue;
      const { i } = this.segOf(r.dist);
      let target = r.profile[i] * r.speedNoise;
      if (r.finished) target *= 0.6;

      // traffic: follow, or pick a side to pass
      let ahead: Runner | null = null;
      let gap = Infinity;
      for (const q of this.runners) {
        if (q === r) continue;
        const g = q.dist - r.dist;
        if (g > 0 && g < 40 * U && g < gap && Math.abs(q.x - r.x) < 0.55) {
          ahead = q;
          gap = g;
        }
      }
      if (ahead) {
        const gapM = gap / U;
        if (target > ahead.v + 0.4 && gapM < 32 && r.passTimer <= 0) {
          const leftX = ahead.x - 0.72;
          const rightX = ahead.x + 0.72;
          const leftOk = leftX > -0.9 && this.sideFree(r, leftX);
          const rightOk = rightX < 0.9 && this.sideFree(r, rightX);
          if (leftOk || rightOk) {
            r.passX = rightOk && (!leftOk || ahead.x < 0) ? rightX : leftX;
            r.passTimer = 2.4;
          }
        }
        if (gapM < 11 && Math.abs(r.x - ahead.x) < 0.45) target = Math.min(target, ahead.v * 0.985);
      }
      r.passTimer = Math.max(0, r.passTimer - dt);

      r.v = r.v < target ? Math.min(target, r.v + accelAt(r.v, r.perf) * dt) : Math.max(target, r.v - BRAKE_DECEL * dt);
      const want = r.passTimer > 0 ? r.passX : this.line[i] * r.lineBias;
      r.x += clamp(want - r.x, -0.85 * dt, 0.85 * dt);
      r.x = clamp(r.x, -0.88, 0.88);
      r.dist += r.v * U * dt;
    }

    // contact: rear car gives way; the player gets bumped if they run into someone
    for (const r of this.runners) {
      for (const q of this.runners) {
        if (r === q) continue;
        const g = q.dist - r.dist;
        if (g <= 0 || g > CAR_LEN || Math.abs(q.x - r.x) > CAR_HALF * 2) continue;
        // r is directly behind q
        if (r.isPlayer) {
          if (r.v > q.v + 1.5 && this.crashTimer <= 0 && this.phase === 'racing') {
            r.v = q.v * 0.9;
            this.crashTimer = 0.5;
            this.addShake(7);
            this.audio.playCrash();
            const ps = this.playerScreen;
            this.particles.emitSparks(ps.x, ps.y - ps.h * 0.6, 18, 0);
          } else r.v = Math.min(r.v, q.v);
          r.dist = Math.min(r.dist, q.dist - CAR_LEN * 0.6);
          this.syncPlayer();
        } else {
          r.v = Math.min(r.v, q.v);
          r.dist = Math.min(r.dist, q.dist - CAR_LEN * 0.6);
          r.x += r.x < q.x ? -0.02 : 0.02;
        }
      }
    }
    for (const r of this.runners) if (!r.isPlayer) this.syncCar(r);
  }

  private updateTiming() {
    const cfg = this.cfg;
    for (const r of this.runners) {
      while (r.dist >= (r.laps + 1) * this.L) this.completeLap(r);
    }
    if (cfg.kind === 'qualifying') {
      this.trackSectors();
      return;
    }
    if (cfg.kind !== 'race') return;
    // a player who stops driving after the flag is classified where they are
    if (this.flagOut && !this.sessionOver && this.raceTime - this.flagTime > 75) this.finishSession(false);
    // running order: finishers by time, then by distance
    this.order = [...this.runners].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.dist - a.dist;
    });
    const lead = this.order[0];
    const li = this.segOf(lead.dist).i;
    for (let k = this.lastLeadSeg, guard = 0; k !== li && guard < 400; guard++) {
      k = (k + 1) % this.N;
      this.leadPass[k] = this.raceTime;
    }
    this.lastLeadSeg = li;
    const pos = this.order.indexOf(this.player) + 1;
    if (this.phase === 'racing' && pos !== this.lastPos && this.raceTime > 2) {
      const gained = pos < this.lastPos;
      const ps = this.playerScreen;
      this.texts.add(`P${pos}`, ps.x, ps.y - ps.h * 1.4, gained ? '#4ade80' : '#f87171', 24 * this.ui, gained ? 'position gained' : 'position lost', 0.9);
      if (gained) this.audio.playOvertake();
    }
    this.lastPos = pos;
  }

  private completeLap(r: Runner) {
    const cfg = this.cfg;
    const t = this.raceTime - r.lapStart;
    r.laps++;
    r.lapStart = this.raceTime;
    if (r.isPlayer && this.sessionOver) return;
    if (cfg.kind === 'qualifying' && r.isPlayer) this.onQualiLine(t);
    if (cfg.kind === 'race') {
      r.lastLap = t;
      if (r.bestLap === null || t < r.bestLap) r.bestLap = t;
      if (!this.fastest || t < this.fastest.time) {
        this.fastest = { driverId: r.driver.id, time: t };
        if (r.isPlayer && r.laps > 1) this.showBanner('FASTEST LAP', fmtLap(t), '#c084fc', 1.8);
      }
    }
    // a fresh lap brings a fresh slice of form
    r.speedNoise = 1 / (1 + gauss() * r.scatter);

    if (cfg.kind !== 'race') return;
    if (!this.flagOut && r.laps >= cfg.laps) {
      this.flagOut = true;
      this.flagTime = this.raceTime;
      if (!r.isPlayer) this.showBanner('CHEQUERED FLAG', `${r.driver.name} wins`, '#ffffff', 2.2);
    }
    if (this.flagOut && !r.finished) {
      r.finished = true;
      r.finishTime = this.raceTime;
      if (r.isPlayer) this.finishSession(false);
    } else if (r.isPlayer && r.laps === cfg.laps - 1) {
      this.showBanner('FINAL LAP', `${cfg.laps} of ${cfg.laps}`, COLORS.gold, 1.8);
      this.audio.playCheckpoint();
    }
  }

  // ---- qualifying timing
  private onQualiLine(t: number) {
    {
      const p = this.player;
      // the line closes sector three
      const s3 = this.raceTime - this.sectorMark;
      this.mySectors[2] = s3;
      this.myBestSectors[2] = Math.min(this.myBestSectors[2], s3);
      this.bestSectors[2] = Math.min(this.bestSectors[2], s3);
      p.lastLap = t;
      const pb = p.bestLap === null || t < p.bestLap;
      if (pb) {
        p.bestLap = t;
        this.bestTrace = Float32Array.from(this.lapTrace);
      }
      this.timedLaps++;
      const pos = this.qualiPosition();
      this.showBanner(pb ? (pos === 1 ? 'PROVISIONAL POLE' : `PROVISIONAL P${pos}`) : 'NO IMPROVEMENT', fmtLap(t), pb ? (pos === 1 ? '#c084fc' : '#4ade80') : '#facc15', 2);
      this.audio.playCheckpoint();
      if (this.timedLaps >= this.cfg.laps) {
        this.finishSession(false);
        return;
      }
    }
    this.lapTrace.fill(NaN);
    this.sectorIdx = 0;
    this.sectorMark = this.raceTime;
  }

  private trackSectors() {
    const p = this.player;
    if (p.dist < 0 || this.sessionOver) return;
    if (!this.flying) {
      // out-lap done: the clock starts as the car crosses the line
      this.flying = true;
      p.lapStart = this.raceTime;
      this.sectorMark = this.raceTime;
      this.sectorIdx = 0;
      this.mySectors = [null, null, null];
      this.lapTrace.fill(NaN);
      this.showBanner('FLYING LAP', 'push now', '#ffffff', 1.4);
    }
    if (this.sectorIdx === 0 && this.mySectors[0] !== null && this.raceTime - p.lapStart < 1) this.mySectors = [null, null, null];
    const { i } = this.segOf(p.dist);
    const elapsed = this.raceTime - p.lapStart;
    if (Number.isNaN(this.lapTrace[i])) this.lapTrace[i] = elapsed;
    const [s1, s2] = this.circuit.sectors;
    const boundary = this.sectorIdx === 0 ? s1 : this.sectorIdx === 1 ? s2 : Infinity;
    if (i >= boundary && i < boundary + 40) {
      const t = this.raceTime - this.sectorMark;
      this.mySectors[this.sectorIdx] = t;
      this.myBestSectors[this.sectorIdx] = Math.min(this.myBestSectors[this.sectorIdx], t);
      this.bestSectors[this.sectorIdx] = Math.min(this.bestSectors[this.sectorIdx], t);
      this.sectorMark = this.raceTime;
      this.sectorIdx++;
    }
  }

  private qualiPosition(): number {
    const best = this.player.bestLap;
    if (best === null) return this.aiQuali.length + 1;
    return this.aiQuali.filter((e) => (e.best ?? Infinity) < best).length + 1;
  }

  // ---------------------------------------------------------------------------
  // Session end
  // ---------------------------------------------------------------------------

  private finishSession(early: boolean) {
    if (this.sessionOver) return;
    this.sessionOver = true;
    this.phase = 'gameover';
    this.boostTime = 0;
    this.brakeWarn = 0;
    this.audio.stopEngine();
    this.input.clearQueue();
    if (this.cfg.kind === 'race') {
      this.retired = early;
      const pos = early ? 0 : this.order.filter((o) => o.finished).length;
      this.showBanner(early ? 'RETIRED' : 'CHEQUERED FLAG', early ? 'out of the race' : `P${Math.max(1, pos)} · ${this.driver.name}`, early ? '#f87171' : '#ffffff', 2.6);
      this.audio.playGameOver();
      this.particles.emitConfetti(this.W / 2, this.H * 0.2, early ? 0 : 60);
    }
    this.endTimer = early ? 0.05 : 2.6;
    this.events.onPhase(this.phase);
  }

  private emitResult() {
    const cfg = this.cfg;
    if (cfg.kind === 'qualifying') {
      const all: QualiEntry[] = [...this.aiQuali, { driverId: this.driver.id, best: this.player.bestLap }];
      all.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
      this.cb.onSessionEnd({ kind: 'qualifying', quali: all, playerBest: this.player.bestLap, fastestLap: null });
      return;
    }
    if (cfg.kind !== 'race') return;
    // project everyone still running to their next crossing of the line
    const entries: (RaceEntry & { sortTime: number })[] = this.runners.map((r) => {
      if (r.isPlayer && this.retired) {
        return { driverId: r.driver.id, laps: r.laps, time: null, bestLap: r.bestLap, sortTime: Infinity };
      }
      if (r.finished) return { driverId: r.driver.id, laps: r.laps, time: r.finishTime, bestLap: r.bestLap, sortTime: r.finishTime ?? Infinity };
      const avg = Math.max(20 * U, r.dist / Math.max(1, this.raceTime));
      // after the flag a car finishes at its next crossing; before it (a retirement) project the full distance
      const target = this.flagOut ? Math.min(cfg.laps, r.laps + 1) : cfg.laps;
      const t = this.raceTime + Math.max(0, target * this.L - r.dist) / avg;
      return { driverId: r.driver.id, laps: target, time: t, bestLap: r.bestLap, sortTime: t };
    });
    entries.sort((a, b) => b.laps - a.laps || a.sortTime - b.sortTime);
    this.cb.onSessionEnd({
      kind: 'race',
      race: entries.map(({ sortTime: _s, ...e }) => e),
      playerBest: this.player.bestLap,
      fastestLap: this.fastest,
    });
  }

  protected updateFx(dt: number) {
    super.updateFx(dt);
    this.wallTimer = Math.max(0, this.wallTimer - dt);
  }
  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  protected drawOverlay() {
    if (this.cfg.kind === 'showcase') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    this.drawStanding();
    this.drawTower();
    this.drawLapClock();
    const m = this.meter();
    this.drawDash({
      fill: m.fill,
      state: m.active ? 'active' : m.ready ? 'ready' : 'charging',
      label: m.active ? 'ERS DEPLOYING' : m.ready ? `ERS READY  ·  ${this.touchMode ? 'TAP' : 'SPACE'}` : `ERS ${Math.floor(m.fill * 100)}%`,
    });
    this.drawMinimap();
    this.drawBrakeMarker();
    this.drawOffTrack();
    ctx.restore();
    this.texts.draw(ctx, FONT_DISPLAY);
    if (this.cfg.kind === 'race' && (this.phase === 'countdown' || this.goTimer > 0)) {
      this.drawLights(true, `STARTING P${this.order.indexOf(this.player) + 1}  ·  ${this.cfg.laps} LAPS`);
    }
    this.drawBanner();
  }

  private get colW() {
    return (this.compact ? 124 : 156) * this.ui;
  }

  // ---- position + lap (top-left)
  private drawStanding() {
    const ctx = this.ctx;
    const u = this.ui;
    const x = Math.max(8 * u, this.safe.left + 4);
    const y = this.hudTop();
    const w = this.colW;
    const h = 52 * u;
    const info = this.info();
    const quali = this.cfg.kind === 'qualifying';
    ctx.fillStyle = 'rgba(8,8,14,0.7)';
    this.panel(x, y, w, h, 12 * u);
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(x, y, 4 * u, h);
    const tx = x + 12 * u;
    this.text(quali ? 'PROVISIONAL' : 'POSITION', tx, y + 14 * u, `700 ${9 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.6)');
    const big = `${(this.compact ? 24 : 28) * u}px ${FONT_DISPLAY}`;
    const posText = quali && this.player.bestLap === null ? '—' : `P${info.position}`;
    this.text(posText, tx, y + 42 * u, big, '#ffffff');
    ctx.font = big;
    // the field size only fits beside the position on wider HUDs
    if (!this.compact) this.text(`/${info.total}`, tx + ctx.measureText(posText).width + 4 * u, y + 42 * u, `700 ${11 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.5)');
    const rx = x + w - 18 * u;
    this.text(info.outLap ? 'OUT LAP' : 'LAP', rx, y + 14 * u, `700 ${9 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.6)', 'right');
    if (!info.outLap) this.text(`${info.lap}/${info.laps}`, rx, y + 40 * u, `${(this.compact ? 17 : 20) * u}px ${FONT_DISPLAY}`, COLORS.gold, 'right');
  }

  /** Lines for the timing tower: the top of the order plus the cars around the player (null = gap). */
  private towerRows(max: number): ({ pos: number; driverId: string; gap: string } | null)[] {
    let list: { pos: number; driverId: string; gap: string }[];
    if (this.cfg.kind === 'qualifying') {
      const all = [...this.aiQuali, { driverId: this.driver.id, best: this.player.bestLap }].sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
      const pole = all[0].best ?? 0;
      list = all.map((e, i) => ({
        pos: i + 1,
        driverId: e.driverId,
        gap: e.best === null ? 'NO TIME' : i === 0 ? fmtLap(e.best) : `+${(e.best - pole).toFixed(3)}`,
      }));
    } else {
      const lead = this.order[0];
      list = this.order.map((r, i) => ({ pos: i + 1, driverId: r.driver.id, gap: i === 0 ? (r.finished ? 'FINISH' : 'LEADER') : this.gapText(r, lead) }));
    }
    const me = list.findIndex((e) => e.driverId === this.driver.id);
    if (me < max - 1) return list.slice(0, max);
    const top = Math.max(1, max - 4);
    return [...list.slice(0, top), null, ...list.slice(me - 1, me + 2)];
  }

  private gapText(r: Runner, lead: Runner): string {
    if (r.finished && r.finishTime !== null && lead.finishTime !== null) return `+${(r.finishTime - lead.finishTime).toFixed(1)}`;
    const down = Math.floor((lead.dist - r.dist) / this.L);
    if (down >= 1) return `+${down} LAP${down > 1 ? 'S' : ''}`;
    const t = this.leadPass[this.segOf(r.dist).i];
    return Number.isNaN(t) || t === undefined ? '—' : `+${Math.max(0, this.raceTime - t).toFixed(1)}`;
  }

  private drawTower() {
    const ctx = this.ctx;
    const u = this.ui;
    const x = Math.max(8 * u, this.safe.left + 4);
    let y = this.hudTop() + 58 * u;
    const w = this.colW;
    const rh = 17 * u;
    const max = this.H < 520 ? 5 : this.compact ? 6 : 8;
    for (const row of this.towerRows(max)) {
      if (row === null) {
        this.text('···', x + 14 * u, y + 8 * u, `700 ${11 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.45)', 'center');
        y += rh * 0.6;
        continue;
      }
      const me = row.driverId === this.driver.id;
      const d = driverById(row.driverId)!;
      ctx.fillStyle = me ? 'rgba(255,255,255,0.92)' : 'rgba(8,8,14,0.66)';
      this.panel(x, y, w, rh - 2 * u, 6 * u);
      this.text(String(row.pos), x + 14 * u, y + 11.5 * u, `${9.5 * u}px ${FONT_DISPLAY}`, me ? '#000000' : 'rgba(255,255,255,0.8)', 'center');
      ctx.fillStyle = driverColor(d);
      ctx.fillRect(x + 25 * u, y + 3 * u, 3 * u, rh - 8 * u);
      this.text(d.short, x + 33 * u, y + 11.5 * u, `700 ${10.5 * u}px ${FONT_UI}`, me ? '#000000' : '#ffffff');
      this.text(row.gap, x + w - 10 * u, y + 11.5 * u, `600 ${9.5 * u}px ${FONT_UI}`, me ? '#111111' : 'rgba(255,255,255,0.65)', 'right');
      y += rh;
    }
  }

  // ---- lap clock, sectors and live delta (top-centre)
  private drawLapClock() {
    const ctx = this.ctx;
    const u = this.ui;
    const W = this.W;
    const y = this.hudTop();
    const tw = (this.compact ? 128 : 170) * u;
    const th = 50 * u;
    const x = W / 2 - tw / 2;
    const p = this.player;
    const quali = this.cfg.kind === 'qualifying';
    const out = quali && !this.flying;
    const running = this.phase === 'racing' && !out;
    const t = running ? this.raceTime - p.lapStart : p.lastLap;
    ctx.fillStyle = 'rgba(8,8,14,0.7)';
    this.panel(x, y, tw, th, 12 * u);
    this.text(out ? 'OUT LAP' : 'LAP TIME', W / 2, y + 14 * u, `700 ${9 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.6)', 'center');
    this.text(out ? 'BUILD SPEED' : fmtLap(t), W / 2, y + 40 * u, `${(this.compact ? 18 : 23) * u}px ${FONT_DISPLAY}`, out ? 'rgba(255,255,255,0.75)' : '#ffffff', 'center');
    this.text(`LAST ${fmtLap(p.lastLap)}   BEST ${fmtLap(p.bestLap)}`, W / 2, y + th + 13 * u, `700 ${8.5 * u}px ${FONT_UI}`, 'rgba(255,255,255,0.62)', 'center');
    if (!quali) return;

    const bw = (tw - 24 * u) / 3;
    const by = y + th + 20 * u;
    for (let k = 0; k < 3; k++) {
      const st = this.mySectors[k];
      let col = 'rgba(255,255,255,0.14)';
      if (st !== null) col = st <= this.bestSectors[k] + 1e-6 ? '#a855f7' : st <= this.myBestSectors[k] + 1e-6 ? '#22c55e' : '#facc15';
      ctx.fillStyle = col;
      this.panel(x + 10 * u + k * (bw + 2 * u), by, bw, 5 * u, 2 * u);
    }
    if (this.bestTrace && running) {
      const ref = this.bestTrace[this.segOf(p.dist).i];
      if (!Number.isNaN(ref) && t !== null) {
        const d = t - ref;
        const dw = 64 * u;
        const dx = x + tw + 6 * u;
        const dy = y + 12 * u;
        ctx.fillStyle = d <= 0 ? 'rgba(22,163,74,0.88)' : 'rgba(220,38,38,0.88)';
        this.roundRect(dx, dy, dw, 22 * u, 5 * u);
        ctx.fill();
        this.text(`${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(3)}`, dx + dw / 2, dy + 15.5 * u, `${12 * u}px ${FONT_DISPLAY}`, '#ffffff', 'center');
      }
    }
  }

  // ---- minimap with every car (right, under the dash)
  private drawMinimap() {
    const ctx = this.ctx;
    const u = this.ui;
    const size = (this.compact ? 92 : 126) * u;
    const x = this.W - Math.max(12 * u, this.safe.right + 4) - size;
    const y = Math.max(12, this.safe.top) + 52 + 92 * u;
    if (y + size > this.H - Math.max(this.bottomInset, 12) - 8) return;
    ctx.fillStyle = 'rgba(8,8,14,0.55)';
    this.roundRect(x, y, size, size, 10 * u);
    ctx.fill();
    const pad = 9 * u;
    const s = size - pad * 2;
    const map = this.circuit.map;
    if (!this.mapPath) {
      const path = new Path2D();
      const step = Math.max(1, Math.floor(this.N / 300));
      for (let i = 0; i < this.N; i += step) {
        const px = map[i * 2] * 1000;
        const py = map[i * 2 + 1] * 1000;
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();
      this.mapPath = path;
    }
    ctx.save();
    ctx.translate(x + pad, y + pad);
    ctx.scale(s / 1000, s / 1000);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = (6 * u * 1000) / s;
    ctx.stroke(this.mapPath);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = (2.2 * u * 1000) / s;
    ctx.stroke(this.mapPath);
    ctx.restore();
    const dot = (dist: number, r: number, fill: string, ring?: string) => {
      const i = this.segOf(dist).i;
      const px = x + pad + map[i * 2] * s;
      const py = y + pad + map[i * 2 + 1] * s;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (ring) {
        ctx.lineWidth = 1.5 * u;
        ctx.strokeStyle = ring;
        ctx.stroke();
      }
    };
    dot(0, 2.4 * u, '#ffffff');
    for (const r of this.runners) if (!r.isPlayer) dot(r.dist, 2.6 * u, driverColor(r.driver));
    dot(this.player.dist, 4 * u, COLORS.gold, '#000000');
  }

  private drawBrakeMarker() {
    if (this.brakeWarn <= 0.02 || this.phase !== 'racing') return;
    const ctx = this.ctx;
    const u = this.ui;
    const w = 118 * u;
    const h = 30 * u;
    const x = this.W / 2 - w / 2;
    const y = Math.min(this.H * 0.56, this.playerScreen.y - this.playerScreen.h - 44 * u);
    ctx.save();
    ctx.globalAlpha = this.brakeWarn * (0.78 + 0.22 * Math.sin(performance.now() / 60));
    ctx.fillStyle = 'rgba(200,16,16,0.88)';
    this.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2 * u;
    for (const side of [-1, 1]) {
      const cx = this.W / 2 + side * (w / 2 - 16 * u);
      ctx.beginPath();
      ctx.moveTo(cx - 5 * u, y + h * 0.3);
      ctx.lineTo(cx, y + h * 0.62);
      ctx.lineTo(cx + 5 * u, y + h * 0.3);
      ctx.stroke();
    }
    ctx.textBaseline = 'alphabetic';
    this.text('BRAKE', this.W / 2, y + h / 2 + 5.5 * u, `${14 * u}px ${FONT_DISPLAY}`, '#ffffff', 'center');
    ctx.restore();
  }
}
