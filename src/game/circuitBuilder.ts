import { METERS_PER_SEGMENT, RUMBLE_LENGTH, SEGMENT_LENGTH } from './constants';
import type { CircuitDef, PathStep } from './circuits';
import type { Point3, Segment, SpriteKind, Track } from './track';

/** World units per metre (a segment is 200 units / 1.57 m). */
export const UNITS_PER_M = SEGMENT_LENGTH / METERS_PER_SEGMENT;
/** Renderer bend per unit curvature: c = 1 draws a 314 m radius (see Engine.render). */
const VISUAL_CURVE = 314;
const MAX_VISUAL_CURVE = 16;
/** Hills read better a little taller than life in pseudo-3D. */
const ELEVATION_GAIN = 1.6;
/** Where the street-circuit barriers stop the car's centre (road half-width = 1). */
export const WALL_LIMIT = 1.0;

export interface BuiltCircuit {
  def: CircuitDef;
  track: Track;
  /** Centreline per segment, interleaved x,y in a 0..1 box (aspect kept). */
  map: Float32Array;
  /** Outline for menus as an SVG path in a 0 0 100 100 viewBox. */
  svg: string;
  /** Segment indices where sectors 2 and 3 begin. */
  sectors: [number, number];
  /** Lateral limit of the barriers, or null where there is run-off. */
  wallAt: number | null;
}

interface Prim {
  len: number;
  /** Signed curvature, 1/m; positive turns right. */
  kappa: number;
  straight: boolean;
}

interface Pose {
  x: number;
  y: number;
  th: number;
}

function primitives(path: PathStep[]): Prim[] {
  return path.map((s) =>
    s[0] === 'S'
      ? { len: s[1], kappa: 0, straight: true }
      : { len: (s[2] * s[1] * Math.PI) / 180, kappa: (s[0] === 'R' ? 1 : -1) / s[2], straight: false },
  );
}

/** Scale rights and lefts in opposite directions so the lap turns exactly `winding` full circles. */
function fixWinding(prims: Prim[], winding: number) {
  let sumR = 0;
  let sumL = 0;
  for (const p of prims) {
    if (p.straight) continue;
    const a = p.kappa * p.len;
    if (a > 0) sumR += a;
    else sumL -= a;
  }
  const delta = (sumR - sumL - winding * Math.PI * 2) / (sumR + sumL);
  for (const p of prims) if (!p.straight) p.len *= p.kappa > 0 ? 1 - delta : 1 + delta;
}

/** Pose after travelling `t` metres along a primitive from `from` (y-down plane, right turns clockwise). */
function advance(from: Pose, p: Prim, t: number): Pose {
  if (p.kappa === 0) return { x: from.x + Math.cos(from.th) * t, y: from.y + Math.sin(from.th) * t, th: from.th };
  const th = from.th + p.kappa * t;
  return {
    x: from.x + (Math.sin(th) - Math.sin(from.th)) / p.kappa,
    y: from.y + (Math.cos(from.th) - Math.cos(th)) / p.kappa,
    th,
  };
}

function trace(prims: Prim[], start: Pose): Pose[] {
  const poses: Pose[] = [start];
  for (const p of prims) poses.push(advance(poses[poses.length - 1], p, p.len));
  return poses;
}

/** Smallest length-weighted change to the straights that closes the loop (keeps every heading). */
function closeLoop(prims: Prim[], start: Pose) {
  for (let pass = 0; pass < 3; pass++) {
    const poses = trace(prims, start);
    const end = poses[poses.length - 1];
    const ex = end.x - start.x;
    const ey = end.y - start.y;
    if (Math.hypot(ex, ey) < 0.01) return;
    let a = 0;
    let b = 0;
    let c = 0;
    prims.forEach((p, i) => {
      if (!p.straight) return;
      const ux = Math.cos(poses[i].th);
      const uy = Math.sin(poses[i].th);
      a += p.len * ux * ux;
      b += p.len * ux * uy;
      c += p.len * uy * uy;
    });
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-9) return;
    const lx = (c * ex - b * ey) / det;
    const ly = (a * ey - b * ex) / det;
    prims.forEach((p, i) => {
      if (!p.straight) return;
      const ux = Math.cos(poses[i].th);
      const uy = Math.sin(poses[i].th);
      p.len = Math.max(8, p.len - p.len * (ux * lx + uy * ly));
    });
  }
}

/** Deterministic RNG so a circuit's scenery is the same every visit. */
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function point(y: number, z: number): Point3 {
  return { world: { x: 0, y, z }, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, scale: 0 } };
}

export function buildCircuit(def: CircuitDef): BuiltCircuit {
  const prims = primitives(def.path);
  fixWinding(prims, def.winding);
  const start: Pose = { x: 0, y: 0, th: -Math.PI / 2 };
  closeLoop(prims, start);

  // scale the closed layout to the in-game lap length
  const target = def.lengthKm * 1000;
  const scale = target / prims.reduce((s, p) => s + p.len, 0);
  for (const p of prims) {
    p.len *= scale;
    p.kappa /= scale;
  }
  const poses = trace(prims, start);
  const n = Math.round(target / METERS_PER_SEGMENT);
  const segLen = target / n;

  // exact pose at every segment boundary
  const bx = new Float32Array(n + 1);
  const by = new Float32Array(n + 1);
  const bth = new Float64Array(n + 1);
  let pi = 0;
  let pStart = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(i * segLen, target);
    while (pi < prims.length - 1 && s > pStart + prims[pi].len) {
      pStart += prims[pi].len;
      pi++;
    }
    const pose = advance(poses[pi], prims[pi], s - pStart);
    bx[i] = pose.x;
    by[i] = pose.y;
    bth[i] = pose.th;
  }

  // curvature per segment = heading change / length, softened so corners ease in and out
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = (bth[i + 1] - bth[i]) / segLen;
  const half = 6;
  const kappa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -half; k <= half; k++) acc += raw[(i + k + n) % n];
    kappa[i] = acc / (half * 2 + 1);
  }

  // elevation keyframes (real metres) → world units, eased between keys
  const keys = def.elevation.length ? def.elevation : [[0, 0] as [number, number]];
  const elevAt = (f: number) => {
    let k = 0;
    while (k < keys.length - 1 && f > keys[k + 1][0]) k++;
    const [f0, h0] = keys[k];
    const [f1, h1] = keys[Math.min(k + 1, keys.length - 1)];
    const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
    const e = 0.5 - Math.cos(t * Math.PI) / 2;
    return (h0 + (h1 - h0) * e) * scale * ELEVATION_GAIN * UNITS_PER_M;
  };
  const y0 = elevAt(0);
  const ys = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) ys[i] = elevAt(i / n) - y0;
  ys[n] = ys[0];

  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    segments.push({
      index: i,
      p1: point(ys[i], i * SEGMENT_LENGTH),
      p2: point(ys[i + 1], (i + 1) * SEGMENT_LENGTH),
      curve: Math.max(-MAX_VISUAL_CURVE, Math.min(MAX_VISUAL_CURVE, kappa[i] * VISUAL_CURVE)),
      kappa: kappa[i],
      heading: bth[i],
      colorKey: Math.floor(i / RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
      sprites: [],
      cars: [],
      clip: 0,
      fog: 1,
      looped: false,
      checkpoint: false,
    });
  }
  for (let i = 0; i < 3; i++) segments[i].colorKey = i % 2 ? 'finish' : 'start';
  decorate(segments, def);

  // map outline: rotate onto its long axis, fit a unit box
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += bx[i];
    my += by[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = bx[i] - mx;
    const dy = by[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const rot = -0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = bx[i] - mx;
    const dy = by[i] - my;
    px[i] = dx * cr - dy * sr;
    py[i] = dx * sr + dy * cr;
    minX = Math.min(minX, px[i]);
    maxX = Math.max(maxX, px[i]);
    minY = Math.min(minY, py[i]);
    maxY = Math.max(maxY, py[i]);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const offX = (1 - (maxX - minX) / span) / 2;
  const offY = (1 - (maxY - minY) / span) / 2;
  const map = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    map[i * 2] = offX + (px[i] - minX) / span;
    map[i * 2 + 1] = offY + (py[i] - minY) / span;
  }
  const stride = Math.max(1, Math.ceil(n / 260));
  const pad = 6;
  const pts: string[] = [];
  for (let i = 0; i < n; i += stride) pts.push(`${(pad + map[i * 2] * (100 - pad * 2)).toFixed(1)} ${(pad + map[i * 2 + 1] * (100 - pad * 2)).toFixed(1)}`);
  const svg = `M${pts.join('L')}Z`;

  return {
    def,
    track: { segments, length: n * SEGMENT_LENGTH },
    map,
    svg,
    sectors: [Math.round(n / 3), Math.round((n * 2) / 3)],
    wallAt: def.walls ? WALL_LIMIT : null,
  };
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

function decorate(segs: Segment[], def: CircuitDef) {
  const N = segs.length;
  const rnd = seeded(def.id);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const add = (i: number, kind: SpriteKind, offset: number, anchor?: number) => {
    segs[((i % N) + N) % N].sprites.push({ kind, offset, anchor: anchor ?? (offset < 0 ? -1 : 0) });
  };
  const street = def.scenery === 'street';
  const walls = def.walls;

  // start gantry, flags and grandstands along the pit straight
  add(0, 'gateStart', 0, -0.5);
  add(6, 'flag', -1.35);
  add(6, 'flag', 1.35);
  for (let i = -150; i < 90; i += 26) {
    add(i, 'grandstand', walls ? -1.95 : -1.6);
    if (i % 52 === 0) add(i + 13, 'grandstand', walls ? 1.95 : 1.6);
  }

  // barriers line street circuits; ads ride on them
  if (walls) {
    for (let i = 8; i < N - 4; i += 3) {
      const v = Math.floor(i / 21) % 4;
      add(i, `wall${v}` as SpriteKind, -1.22);
      add(i + 1, `wall${(v + 2) % 4}` as SpriteKind, 1.22);
    }
  }

  let billboardCooldown = 0;
  let tireCooldown = 0;
  let sceneCooldown = 0;
  let poleCooldown = 0;
  for (let i = 90; i < N - 150; i++) {
    const c = segs[i].curve;
    const absC = Math.abs(c);
    const outside = c > 0 ? -1 : 1;

    // corners: boards and tyre walls on the outside
    if (absC > 2.2 && !walls && billboardCooldown-- <= 0) {
      add(i, (['billboard0', 'billboard1', 'billboard2', 'billboard3'] as SpriteKind[])[Math.floor(rnd() * 4)], outside * between(1.55, 1.9));
      billboardCooldown = 28;
    }
    if (absC > 6 && !walls && tireCooldown-- <= 0) {
      add(i, 'tirewall', outside * 1.24);
      tireCooldown = 4;
    }

    // floodlights at night and in the desert
    if ((def.palette === 'nightcity' || def.scenery === 'desert') && poleCooldown-- <= 0) {
      add(i, 'pole', (i % 2 ? 1 : -1) * (walls ? 1.42 : 1.32));
      poleCooldown = def.palette === 'nightcity' ? 16 : 38;
    }

    if (sceneCooldown-- > 0) continue;
    const side = rnd() < 0.5 ? -1 : 1;
    switch (def.scenery) {
      case 'street': {
        add(i, `building${Math.floor(rnd() * 3)}` as SpriteKind, side * between(1.95, 2.5));
        if (rnd() < 0.5) add(i + 2, `building${Math.floor(rnd() * 3)}` as SpriteKind, -side * between(2.0, 2.6));
        if (def.palette === 'riviera' && rnd() < 0.25) add(i + 1, 'palm', side * 1.6);
        sceneCooldown = Math.floor(between(4, 8));
        break;
      }
      case 'forest': {
        add(i, rnd() < 0.8 ? 'pine' : 'tree', side * between(1.4, 2.6));
        add(i + 1, 'pine', -side * between(1.5, 3));
        sceneCooldown = Math.floor(between(2, 5));
        break;
      }
      case 'alpine': {
        add(i, rnd() < 0.55 ? 'pine' : 'tree', side * between(1.5, 2.8));
        if (rnd() < 0.4) add(i + 2, 'pine', -side * between(1.6, 2.8));
        sceneCooldown = Math.floor(between(4, 9));
        break;
      }
      case 'airfield': {
        add(i, rnd() < 0.7 ? 'treeSmall' : 'tree', side * between(2.2, 3.2));
        if (rnd() < 0.08) add(i + 3, 'grandstand', -side * 1.65);
        sceneCooldown = Math.floor(between(12, 22));
        break;
      }
      case 'desert': {
        add(i, 'palm', side * between(1.6, 2.6));
        if (rnd() < 0.07) add(i + 4, 'grandstand', -side * 1.65);
        sceneCooldown = Math.floor(between(14, 26));
        break;
      }
      default: {
        add(i, rnd() < 0.6 ? 'tree' : 'treeSmall', side * between(walls ? 1.8 : 1.5, 2.8));
        if (rnd() < 0.35) add(i + 2, 'treeSmall', -side * between(walls ? 1.9 : 1.6, 2.5));
        if (rnd() < 0.05) add(i + 5, 'grandstand', side * (walls ? 1.95 : 1.65));
        sceneCooldown = Math.floor(between(4, 10));
      }
    }
  }
  // keep streets dense right up to the line
  if (street) {
    for (let i = N - 150; i < N; i += 6) add(i, `building${Math.floor(rnd() * 3)}` as SpriteKind, (i % 12 ? 1 : -1) * 2.3);
  }
}

const built = new Map<string, BuiltCircuit>();

/** Builds a circuit once and reuses it (geometry, scenery and map outline are deterministic). */
export function getCircuit(def: CircuitDef): BuiltCircuit {
  let c = built.get(def.id);
  if (!c) {
    c = buildCircuit(def);
    built.set(def.id, c);
  }
  return c;
}
