import {
  ACCEL,
  BOOST_DURATION,
  BOOST_FROM_NEAR_MISS,
  BOOST_FROM_OVERTAKE,
  BOOST_SPEED_MULT,
  BRAKING,
  CAR_HALF_W,
  CENTRIFUGAL,
  CHECKPOINT_BONUS_MIN,
  CHECKPOINT_BONUS_START,
  CHECKPOINT_SEGMENTS,
  COLLIDE_HALF_W,
  COLORS,
  COMBO_WINDOW,
  DECEL,
  FONT_DISPLAY,
  FONT_UI,
  LANES,
  MAX_SPEED,
  METERS_PER_SEGMENT,
  NEAR_MISS_DIST,
  OFF_ROAD_DECEL,
  OFF_ROAD_LIMIT,
  PLAYER_Z,
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
import { TRAFFIC_LIVERIES, type Driver } from './drivers';
import { buildTrack, findSegment, wrapZ, type Segment, type TrafficCar } from './track';
import { renderCar } from './sprites';
import { Engine, clamp, fmt, overlap, rand, type EngineEvents, type MeterState } from './core';
import type { AudioEngine } from './audio';
import type { Input } from './input';

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

/** Live run state for DOM UI (pause card). */
export interface HudSnapshot {
  score: number;
  timeLeft: number;
  sector: number;
  combo: number;
}

export interface ArcadeEvents extends EngineEvents {
  onGameOver: (stats: RunStats) => void;
}

const LANE_CENTERS = [-0.667, 0, 0.667];

/** The high-score mode: weave through slower traffic against the clock. */
export class ArcadeGame extends Engine {
  private cb: ArcadeEvents;

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
  private boostReadyAnnounced = false;
  private boostHintTimer = 0;
  private carId = 0;
  private level = 0;
  private lowTimePulse = 0;
  private autopilotTarget = 0;
  private autopilotTimer = 0;

  best = 0;

  constructor(canvas: HTMLCanvasElement, input: Input, audio: AudioEngine, cb: ArcadeEvents) {
    super(canvas, input, audio, cb, buildTrack());
    this.cb = cb;
    this.carImgs = TRAFFIC_LIVERIES.map((l) => renderCar(l));
  }

  protected onStart() {
    this.startAttract();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  snapshot(): HudSnapshot {
    return {
      score: Math.floor(this.score),
      timeLeft: Math.max(0, this.timeLeft),
      sector: this.checkpoints + 1,
      combo: this.combo,
    };
  }

  meter(): MeterState {
    const boosting = this.boostTime > 0;
    return { fill: boosting ? this.boostTime / BOOST_DURATION : this.boostMeter, active: boosting, ready: !boosting && this.boostMeter >= 1 };
  }

  startRace(driver: Driver) {
    this.setDriver(driver);
    this.audio.unlock();
    this.resetRun();
    this.phase = 'countdown';
    this.beginLights();
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

  restart() {
    this.startRace(this.driver);
  }

  protected onPause() {
    // settle the score ticker so the frozen HUD matches the pause card
    this.displayScore = this.score;
  }

  protected pausedInput() {
    super.pausedInput();
    if (this.input.consume('restart')) this.restart();
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
  // Update
  // ---------------------------------------------------------------------------

  protected update(dt: number) {
    const input = this.input;
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
        this.updateLights(dt);
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
      if (speedPct > 0.5 && this.frameCount % 3 === 0) this.brakeSmoke();
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
      this.offRoadFx(wasOff, speedPct, !auto);
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
      car.offset += this.carSteer(car, findSegment(this.track, car.z), playerSeg);
      this.advanceCar(car, dt * car.speed);

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
    this.showBanner(`SECTOR ${this.checkpoints} CLEAR`, `+${bonus}s   +${fmt(pts)} pts`, '#4ade80');
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

  protected updateFx(dt: number) {
    super.updateFx(dt);
    this.boostHintTimer = Math.max(0, this.boostHintTimer - dt);
    this.lowTimePulse = Math.max(0, this.lowTimePulse - dt * 2);
    this.warnPulse = this.phase === 'racing' && this.timeLeft < 10 ? 0.25 + this.lowTimePulse * 0.4 : 0;
    // score ticker
    const diff = this.score - this.displayScore;
    this.displayScore += diff * Math.min(1, dt * 8);
    if (Math.abs(diff) < 1) this.displayScore = this.score;
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  protected drawOverlay() {
    if (this.phase === 'attract') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    this.drawScore();
    this.drawTimer();
    const boosting = this.boostTime > 0;
    const m = this.meter();
    this.drawDash({
      fill: m.fill,
      state: boosting ? 'active' : m.ready ? 'ready' : 'charging',
      label: boosting ? 'BOOSTING  ·  ×2 SCORE' : m.ready ? `BOOST READY  ·  ${this.touchMode ? 'TAP' : 'SPACE'}` : `BOOST ${Math.floor(m.fill * 100)}%`,
    });
    this.drawOffTrack();
    ctx.restore();
    this.texts.draw(ctx, FONT_DISPLAY);
    if (this.phase === 'countdown' || this.goTimer > 0) this.drawLights();
    this.drawBanner();
  }

  // ---- score + combo (top-left)
  private drawScore() {
    const ctx = this.ctx;
    const u = this.ui;
    const compact = this.compact;
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
  private drawTimer() {
    const ctx = this.ctx;
    const u = this.ui;
    const W = this.W;
    const compact = this.compact;
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
}
