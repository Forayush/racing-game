import { CHECKPOINT_SEGMENTS, RUMBLE_LENGTH, SEGMENT_LENGTH } from './constants';

export type SpriteKind =
  | 'tree'
  | 'treeSmall'
  | 'billboard0'
  | 'billboard1'
  | 'billboard2'
  | 'billboard3'
  | 'grandstand'
  | 'pole'
  | 'tirewall'
  | 'gate'
  | 'gateStart'
  | 'flag'
  | 'pine'
  | 'palm'
  | 'building0'
  | 'building1'
  | 'building2'
  | 'wall0'
  | 'wall1'
  | 'wall2'
  | 'wall3';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Point3 {
  world: Vec3;
  camera: Vec3;
  screen: { x: number; y: number; w: number; scale: number };
}

export interface RoadSprite {
  kind: SpriteKind;
  offset: number; // normalised road units (-1..1 is the road)
  anchor: number; // -1 = right edge at offset, 0 = left edge at offset, -0.5 = centred
}

export interface TrafficCar {
  id: number;
  offset: number;
  z: number;
  speed: number;
  livery: number;
  percent: number;
  halfW: number;
  wasAhead: boolean;
  passedTimer: number;
}

export type ColorKey = 'light' | 'dark' | 'start' | 'finish';

export interface Segment {
  index: number;
  p1: Point3;
  p2: Point3;
  /** Visual bend for the renderer. */
  curve: number;
  /** Physical curvature, 1/m (+ = right). 0 on the arcade road. */
  kappa: number;
  /** Compass heading at the segment start, radians (circuits only). */
  heading: number;
  colorKey: ColorKey;
  sprites: RoadSprite[];
  cars: TrafficCar[];
  clip: number;
  fog: number;
  looped: boolean;
  checkpoint: boolean;
}

export interface Track {
  segments: Segment[];
  length: number; // world units
}

const LEN = { SHORT: 25, MEDIUM: 50, LONG: 100 };
const HILL = { NONE: 0, LOW: 20, MEDIUM: 40, HIGH: 60 };
const CURVE = { NONE: 0, EASY: 2, MEDIUM: 3.4, HARD: 5 };

const easeIn = (a: number, b: number, p: number) => a + (b - a) * Math.pow(p, 2);
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

function newPoint(y: number, z: number): Point3 {
  return {
    world: { x: 0, y, z },
    camera: { x: 0, y: 0, z: 0 },
    screen: { x: 0, y: 0, w: 0, scale: 0 },
  };
}

class Builder {
  segments: Segment[] = [];

  lastY() {
    const s = this.segments;
    return s.length === 0 ? 0 : s[s.length - 1].p2.world.y;
  }

  addSegment(curve: number, y: number) {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: newPoint(this.lastY(), n * SEGMENT_LENGTH),
      p2: newPoint(y, (n + 1) * SEGMENT_LENGTH),
      curve,
      kappa: 0,
      heading: 0,
      colorKey: Math.floor(n / RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
      sprites: [],
      cars: [],
      clip: 0,
      fog: 1,
      looped: false,
      checkpoint: false,
    });
  }

  addRoad(enter: number, hold: number, leave: number, curve: number, y = 0) {
    const startY = this.lastY();
    const endY = startY + Math.round(y) * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++)
      this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }

  addStraight(num = LEN.MEDIUM) {
    this.addRoad(num, num, num, 0, 0);
  }
  addHill(num = LEN.MEDIUM, height = HILL.MEDIUM) {
    this.addRoad(num, num, num, 0, height);
  }
  addCurve(num = LEN.MEDIUM, curve = CURVE.MEDIUM, height = HILL.NONE) {
    this.addRoad(num, num, num, curve, height);
  }
  addLowRollingHills(num = LEN.SHORT, height = HILL.LOW) {
    this.addRoad(num, num, num, 0, height / 2);
    this.addRoad(num, num, num, 0, -height);
    this.addRoad(num, num, num, CURVE.EASY, height);
    this.addRoad(num, num, num, 0, 0);
    this.addRoad(num, num, num, -CURVE.EASY, height / 2);
    this.addRoad(num, num, num, 0, 0);
  }
  addSCurves() {
    this.addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, -CURVE.EASY, HILL.NONE);
    this.addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, CURVE.MEDIUM, HILL.MEDIUM);
    this.addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, CURVE.EASY, -HILL.LOW);
    this.addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, -CURVE.EASY, HILL.MEDIUM);
    this.addRoad(LEN.MEDIUM, LEN.MEDIUM, LEN.MEDIUM, -CURVE.MEDIUM, -HILL.MEDIUM);
  }
  addBumps() {
    const b = 10;
    this.addRoad(b, b, b, 0, 5);
    this.addRoad(b, b, b, 0, -2);
    this.addRoad(b, b, b, 0, -5);
    this.addRoad(b, b, b, 0, 8);
    this.addRoad(b, b, b, 0, 5);
    this.addRoad(b, b, b, 0, -7);
    this.addRoad(b, b, b, 0, 5);
    this.addRoad(b, b, b, 0, -2);
  }
  addDownhillToEnd(num = 200) {
    this.addRoad(num, num, num, -CURVE.EASY, -this.lastY() / SEGMENT_LENGTH);
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function addSprite(segments: Segment[], idx: number, kind: SpriteKind, offset: number, anchor?: number) {
  const seg = segments[idx % segments.length];
  const a = anchor ?? (offset < 0 ? -1 : 0);
  seg.sprites.push({ kind, offset, anchor: a });
}

function decorate(segments: Segment[]) {
  const N = segments.length;

  // Start / checkpoint gantries
  for (let i = 0; i < N; i += CHECKPOINT_SEGMENTS) {
    addSprite(segments, i, i === 0 ? 'gateStart' : 'gate', 0, -0.5);
    segments[i].checkpoint = i !== 0;
    // flag posts near the gate
    addSprite(segments, i + 6, 'flag', -1.35);
    addSprite(segments, i + 6, 'flag', 1.35);
  }

  // Grandstands + poles along the pit straight
  for (let i = 12; i < 290; i += 34) {
    addSprite(segments, i, 'grandstand', -1.55);
    if (i % 68 === 12) addSprite(segments, i + 17, 'grandstand', 1.55);
  }

  // Everything else driven by curvature & position
  let treeCooldown = 0;
  let billboardCooldown = 0;
  let tireCooldown = 0;
  for (let i = 300; i < N; i++) {
    const seg = segments[i];
    const c = seg.curve;
    const absC = Math.abs(c);

    // floodlight poles on the right at a fixed cadence
    if (i % 64 === 0) addSprite(segments, i, 'pole', 1.28);

    if (absC > 1.2) {
      // billboards on the outside of a corner
      if (billboardCooldown-- <= 0) {
        const side = c > 0 ? -1 : 1;
        const kind = pick<SpriteKind>(['billboard0', 'billboard1', 'billboard2', 'billboard3']);
        addSprite(segments, i, kind, side * rand(1.5, 1.9));
        billboardCooldown = 26;
      }
      // tyre walls hugging the outside kerb
      if (absC > 2.6 && tireCooldown-- <= 0) {
        const side = c > 0 ? -1 : 1;
        addSprite(segments, i, 'tirewall', side * 1.22);
        tireCooldown = 5;
      }
    } else if (treeCooldown-- <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1;
      addSprite(segments, i, Math.random() < 0.6 ? 'tree' : 'treeSmall', side * rand(1.5, 2.6));
      if (Math.random() < 0.35) addSprite(segments, i + 2, 'treeSmall', -side * rand(1.6, 2.4));
      treeCooldown = Math.floor(rand(4, 10));
    }

    // occasional grandstands on long straights beyond the pits
    if (absC < 0.3 && i % 220 === 0) {
      addSprite(segments, i, 'grandstand', Math.random() < 0.5 ? -1.6 : 1.6);
    }
  }
}

export function buildTrack(): Track {
  const b = new Builder();

  b.addStraight(LEN.LONG); // pit straight
  b.addCurve(LEN.MEDIUM, CURVE.EASY, HILL.LOW); // T1
  b.addSCurves();
  b.addStraight(LEN.MEDIUM);
  b.addCurve(LEN.LONG, CURVE.MEDIUM, HILL.NONE);
  b.addLowRollingHills();
  b.addStraight(LEN.LONG);
  b.addCurve(LEN.MEDIUM, -CURVE.HARD, HILL.MEDIUM);
  b.addHill(LEN.MEDIUM, HILL.HIGH);
  b.addSCurves();
  b.addStraight(LEN.SHORT);
  b.addCurve(LEN.LONG, -CURVE.EASY, HILL.NONE);
  b.addBumps();
  b.addCurve(LEN.MEDIUM, CURVE.HARD, -HILL.LOW);
  b.addStraight(LEN.MEDIUM);
  b.addCurve(LEN.LONG, -CURVE.MEDIUM, HILL.LOW);
  b.addHill(LEN.LONG, -HILL.MEDIUM);
  b.addCurve(LEN.MEDIUM, CURVE.MEDIUM, HILL.NONE);
  b.addStraight(LEN.LONG);
  b.addCurve(LEN.SHORT, -CURVE.HARD, HILL.NONE);
  b.addCurve(LEN.SHORT, CURVE.HARD, HILL.NONE);
  b.addStraight(LEN.SHORT);
  b.addDownhillToEnd(150);

  // pad to a multiple of the checkpoint distance so gates line up on every lap
  const remainder = b.segments.length % CHECKPOINT_SEGMENTS;
  if (remainder !== 0) {
    const pad = CHECKPOINT_SEGMENTS - remainder;
    const third = Math.floor(pad / 3);
    b.addRoad(third, pad - third * 2, third, 0, 0);
  }
  // force a perfectly closed loop
  const segs = b.segments;
  segs[segs.length - 1].p2.world.y = 0;

  // start / finish markings
  for (let i = 0; i < 3; i++) segs[i].colorKey = i % 2 ? 'finish' : 'start';

  decorate(segs);

  return { segments: segs, length: segs.length * SEGMENT_LENGTH };
}

export function findSegment(track: Track, z: number): Segment {
  const n = track.segments.length;
  return track.segments[((Math.floor(z / SEGMENT_LENGTH) % n) + n) % n];
}

export function wrapZ(z: number, length: number) {
  z %= length;
  return z < 0 ? z + length : z;
}

export function percentRemaining(n: number, total: number) {
  return (n % total) / total;
}
