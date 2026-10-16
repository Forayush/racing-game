// Car model for circuit racing: real lateral grip (so corners have a speed limit), braking and
// traction. The player and the AI share it; the AI follows a precomputed ideal-speed profile.
import { MAX_SPEED, SEGMENT_LENGTH } from './constants';
import { UNITS_PER_M } from './circuitBuilder';
import type { Driver } from './drivers';
import type { Segment } from './track';

/** 100% top speed in m/s (matches the 342 km/h dash scale). */
export const V_MAX = MAX_SPEED / UNITS_PER_M;
/** Metres per road segment. */
export const SEG_M = SEGMENT_LENGTH / UNITS_PER_M;
/** Lateral grip a(v) = (GRIP0 + GRIP1·v²)·grip — downforce makes fast corners easier (m/s²). */
export const GRIP0 = 45.8;
export const GRIP1 = 0.0063;
export const BRAKE_DECEL = 42;
export const ACCEL0 = 17;
/**
 * Lateral motion in road half-widths per second per m/s² of lateral acceleration. Corners push the
 * car wide by v²κ; full steering lock pushes back with the tyres' grip, so a corner taken at the
 * limit needs full lock and anything faster slides wide.
 */
export const LAT_K = 0.0185;
/** Grass caps speed at this share of top speed. */
export const OFFROAD_LIMIT = 0.45;
/** ERS deployment: extra top speed and traction while it burns. */
export const ERS_TOP = 1.06;
export const ERS_ACCEL = 1.5;

export interface CarPerf {
  /** Top speed, m/s. */
  vTop: number;
  /** Launch acceleration, m/s². */
  accel: number;
  /** Multiplier on lateral grip. */
  grip: number;
}

const band = (v: number) => Math.min(1, Math.max(0, (v - 70) / 30));

/**
 * Performance of a driver's car (team car blended with the driver, see Driver.stats). The bands are
 * narrower than the arcade handling model so the field spans a few percent, as it does in F1.
 */
export function carPerf(d: Driver): CarPerf {
  const s = d.stats;
  return {
    vTop: V_MAX * (0.965 + band(s.speed) * 0.07),
    accel: ACCEL0 * (0.9 + band(s.accel) * 0.25),
    grip: 0.95 + band(s.grip) * 0.1,
  };
}

export function gripAt(v: number, perf: CarPerf): number {
  return (GRIP0 + GRIP1 * v * v) * perf.grip;
}

export function accelAt(v: number, perf: CarPerf, ers = false): number {
  const top = perf.vTop * (ers ? ERS_TOP : 1);
  const r = v / top;
  return perf.accel * (ers ? ERS_ACCEL : 1) * Math.max(0.06, 1 - r * r);
}

/** Highest speed (m/s) that holds curvature k (1/m) without sliding. */
export function cornerSpeed(k: number, perf: CarPerf): number {
  const a = Math.abs(k);
  const g1 = GRIP1 * perf.grip;
  if (a <= g1 + 1e-6) return Infinity;
  return Math.sqrt((GRIP0 * perf.grip) / (a - g1));
}

/**
 * Ideal speed (m/s) for every segment when driven at `pace` (1 = on the limit everywhere):
 * corner limits, then braking zones walked backwards and traction walked forwards round the loop.
 */
export function speedProfile(segs: Segment[], perf: CarPerf, pace = 1): Float32Array {
  const n = segs.length;
  const cap = new Float32Array(n);
  for (let i = 0; i < n; i++) cap[i] = Math.min(perf.vTop, cornerSpeed(segs[i].kappa, perf)) * pace;

  const back = Float32Array.from(cap);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = back[(i + 1) % n];
      const lim = Math.sqrt(next * next + 2 * BRAKE_DECEL * pace * SEG_M);
      if (back[i] > lim) back[i] = lim;
    }
  }
  const fwd = Float32Array.from(back);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cur = fwd[i];
      const lim = Math.sqrt(cur * cur + 2 * accelAt(cur, perf) * pace * SEG_M);
      if (fwd[j] > lim) fwd[j] = lim;
    }
  }
  return fwd;
}

export function lapTime(profile: Float32Array): number {
  let t = 0;
  for (let i = 0; i < profile.length; i++) t += SEG_M / Math.max(1, profile[i]);
  return t;
}

/** Time to cover segments [from, to) along a profile. */
export function splitTime(profile: Float32Array, from: number, to: number): number {
  let t = 0;
  for (let i = from; i < to; i++) t += SEG_M / Math.max(1, profile[i]);
  return t;
}

export type Difficulty = 'rookie' | 'pro' | 'legend';

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string; base: number }[] = [
  { id: 'rookie', label: 'Rookie', blurb: 'The field leaves the door open.', base: 0.88 },
  { id: 'pro', label: 'Pro', blurb: 'A proper fight for points.', base: 0.93 },
  { id: 'legend', label: 'Legend', blurb: 'They brake late and never blink.', base: 0.975 },
];

/** Share of the ideal lap an AI driver extracts. */
export function aiPace(d: Driver, difficulty: Difficulty): number {
  const base = DIFFICULTIES.find((x) => x.id === difficulty)!.base;
  return base + ((d.skill.pace - 80) / 16) * 0.02;
}

/** Lap-to-lap scatter (std-dev as a fraction of lap time) from consistency. */
export function lapScatter(d: Driver): number {
  return (100 - d.skill.consistency) * 0.0004;
}

/** Normally distributed sample (Box–Muller). */
export function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// ---------------------------------------------------------------------------
// Player car step — pure, so the game and offline calibration share it
// ---------------------------------------------------------------------------

export interface Controls {
  left: boolean;
  right: boolean;
  brake: boolean;
}

export interface PlayerCar {
  /** Speed, m/s. */
  v: number;
  /** Lateral position, road half-widths (±1 = the white lines). */
  x: number;
  /** Smoothed steering, -1..1. */
  steer: number;
}

export interface StepOut {
  /** Lateral demand above the grip limit, m/s² (0 when within it). */
  over: number;
  offRoad: boolean;
  /** Side of a barrier strike this step (-1 / 1), or 0. */
  wallHit: number;
}

/** Share of speed kept after hitting a barrier. */
export const WALL_KEEP = 0.62;
/** The BRAKE marker aims for this share of the limit speed, so a keyboard driver can hold the line. */
export const MARKER_MARGIN = 0.97;

/**
 * Advances the player's car by dt along road curvature `k` (1/m). Throttle is automatic; brake and
 * steering come from `c`. `wallAt` is the barrier limit on street circuits (null = run-off), and
 * `wallCooldown` (owned by the caller) stops one strike from counting twice.
 */
export function stepPlayerCar(car: PlayerCar, c: Controls, k: number, perf: CarPerf, ers: boolean, wallAt: number | null, wallCooldown: number, dt: number): StepOut {
  const target = (c.left ? -1 : 0) + (c.right ? 1 : 0);
  car.steer += (target - car.steer) * Math.min(1, dt * 14);

  const top = perf.vTop * (ers ? ERS_TOP : 1);
  let v = car.v;
  if (c.brake) v = Math.max(0, v - BRAKE_DECEL * dt);
  else if (v < top) v = Math.min(top, v + accelAt(v, perf, ers) * dt);
  else v = Math.max(top, v - 5 * dt);

  const offRoad = wallAt === null && Math.abs(car.x) > 1.02;
  if (offRoad && v > perf.vTop * OFFROAD_LIMIT) v -= 30 * dt;

  // the corner pushes the car wide by v²κ; steering pushes back with up to the tyres' grip
  const demand = v * v * k;
  const grip = gripAt(v, perf) * (offRoad ? 0.6 : 1);
  const authority = grip * Math.min(1, 0.25 + v / 30);
  car.x += LAT_K * (car.steer * authority - demand) * dt;
  const over = Math.max(0, Math.abs(demand) - grip);
  // fighting the slide scrubs speed
  if (over > 0 && car.steer * Math.sign(k) > 0.5) v -= over * 0.1 * dt;

  let wallHit = 0;
  if (wallAt !== null && Math.abs(car.x) > wallAt) {
    const side = Math.sign(car.x);
    car.x = side * (wallAt - 0.04);
    car.steer *= 0.3;
    if (wallCooldown <= 0) {
      v *= WALL_KEEP;
      wallHit = side;
    }
  }
  car.x = Math.max(-2.4, Math.min(2.4, car.x));
  car.v = Math.max(0, v);
  return { over, offRoad, wallHit };
}

/** True when the slowest point ahead can only be made by braking now (drives the BRAKE marker). */
export function mustBrake(v: number, i: number, profile: Float32Array): boolean {
  const n = profile.length;
  const vv = v * v;
  for (let j = 1; j < 90; j++) {
    const lim = profile[(i + j) % n] * MARKER_MARGIN;
    if (vv > lim * lim + 2 * BRAKE_DECEL * 0.92 * j * SEG_M) return true;
  }
  return false;
}

/** Outside–apex–outside line, as a lateral target per segment. */
export function racingLine(segs: { kappa: number }[]): Float32Array {
  const n = segs.length;
  const cl = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const here = cl(segs[i].kappa * 45, -0.75, 0.75);
    const ahead = cl(segs[(i + 35) % n].kappa * 45, -0.65, 0.65);
    raw[i] = here - ahead * 0.8;
  }
  const out = new Float32Array(n);
  const half = 20;
  let acc = 0;
  for (let k = -half; k <= half; k++) acc += raw[(k + n) % n];
  for (let i = 0; i < n; i++) {
    out[i] = cl(acc / (half * 2 + 1), -0.8, 0.8);
    acc += raw[(i + half + 1) % n] - raw[(i - half + n) % n];
  }
  return out;
}

/** Test bot: on/off steering towards the racing line and braking on the marker, like a keyboard player. */
export function botControls(car: PlayerCar, i: number, segs: { kappa: number }[], line: Float32Array, profile: Float32Array, perf: CarPerf): Controls {
  const n = segs.length;
  const k = segs[i].kappa;
  const authority = gripAt(car.v, perf) * Math.min(1, 0.25 + car.v / 30);
  const want = line[(i + 4) % n] * 0.8;
  const s = (car.v * car.v * k) / Math.max(1, authority) + (want - car.x) * 5;
  return { left: s < -0.3, right: s > 0.3, brake: mustBrake(car.v, i, profile) };
}
