export interface Livery {
  primary: string;
  secondary: string;
  accent: string;
  helmet: string;
}

export interface Driver {
  id: string;
  number: number;
  name: string;
  short: string; // 3-letter code
  team: string;
  country: string;
  flag: string;
  livery: Livery;
  /** 1..5 star ratings */
  stats: { speed: number; accel: number; grip: number };
  radio: string;
}

export const DRIVERS: Driver[] = [
  {
    id: 'ferrante',
    number: 27,
    name: 'Luca Ferrante',
    short: 'FER',
    team: 'Scuderia Vulcano',
    country: 'Italy',
    flag: '🇮🇹',
    livery: { primary: '#e10600', secondary: '#1a1a1a', accent: '#ffd400', helmet: '#ffd400' },
    stats: { speed: 4, accel: 4, grip: 3 },
    radio: 'Give me the clean air and I will give you the win.',
  },
  {
    id: 'nakamura',
    number: 11,
    name: 'Kai Nakamura',
    short: 'NAK',
    team: 'Sakura Motorsport',
    country: 'Japan',
    flag: '🇯🇵',
    livery: { primary: '#f8f8f8', secondary: '#e23b6f', accent: '#111827', helmet: '#e23b6f' },
    stats: { speed: 3, accel: 3, grip: 5 },
    radio: 'Precision beats power. Watch the apex.',
  },
  {
    id: 'reyes',
    number: 7,
    name: 'Mateo Reyes',
    short: 'REY',
    team: 'Solaris GP',
    country: 'Spain',
    flag: '🇪🇸',
    livery: { primary: '#ff8c00', secondary: '#111111', accent: '#ffffff', helmet: '#ffffff' },
    stats: { speed: 3, accel: 5, grip: 3 },
    radio: 'Lights out and we are already gone.',
  },
  {
    id: 'okafor',
    number: 44,
    name: 'Nadia Okafor',
    short: 'OKA',
    team: 'Onyx Racing',
    country: 'Nigeria',
    flag: '🇳🇬',
    livery: { primary: '#0b0b0f', secondary: '#38bdf8', accent: '#38bdf8', helmet: '#38bdf8' },
    stats: { speed: 5, accel: 3, grip: 2 },
    radio: 'Nobody out-drags the Onyx on a straight.',
  },
  {
    id: 'lindqvist',
    number: 63,
    name: 'Erik Lindqvist',
    short: 'LIN',
    team: 'Nordic Blue',
    country: 'Sweden',
    flag: '🇸🇪',
    livery: { primary: '#1d4ed8', secondary: '#fbbf24', accent: '#ffffff', helmet: '#fbbf24' },
    stats: { speed: 4, accel: 3, grip: 4 },
    radio: 'Calm hands. Fast car. Simple.',
  },
  {
    id: 'marchetti',
    number: 5,
    name: 'Sofia Marchetti',
    short: 'MAR',
    team: 'Verde Racing',
    country: 'Brazil',
    flag: '🇧🇷',
    livery: { primary: '#15803d', secondary: '#facc15', accent: '#ffffff', helmet: '#facc15' },
    stats: { speed: 3, accel: 4, grip: 4 },
    radio: 'Every gap is an invitation.',
  },
];

/** Extra liveries used for AI traffic so the grid feels full. */
export const TRAFFIC_LIVERIES: Livery[] = [
  ...DRIVERS.map((d) => d.livery),
  { primary: '#7c3aed', secondary: '#111111', accent: '#f0abfc', helmet: '#f0abfc' },
  { primary: '#f43f5e', secondary: '#0f172a', accent: '#ffffff', helmet: '#ffffff' },
  { primary: '#0ea5e9', secondary: '#f8fafc', accent: '#0f172a', helmet: '#f97316' },
  { primary: '#a3e635', secondary: '#111111', accent: '#ffffff', helmet: '#111111' },
];

const chroma = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
};

/** The livery colour that identifies a team on dark UI (skips near-black / near-white primaries). */
export function driverColor(d: Driver): string {
  const l = d.livery;
  if (chroma(l.primary) >= 100) return l.primary;
  return [l.secondary, l.accent, l.helmet].reduce((best, c) => (chroma(c) > chroma(best) ? c : best), l.primary);
}

/** Black or white — whichever reads better on top of the given colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.179 ? '#000000' : '#ffffff';
}

export interface DriverPhysics {
  maxSpeedMult: number;
  accelMult: number;
  steerMult: number;
  centrifugalMult: number;
}

export function driverPhysics(d: Driver): DriverPhysics {
  const s = d.stats;
  return {
    maxSpeedMult: 0.94 + (s.speed - 1) * 0.03, // 0.94 .. 1.06
    accelMult: 0.85 + (s.accel - 1) * 0.11, // 0.85 .. 1.29
    steerMult: 0.92 + (s.grip - 1) * 0.08, // 0.92 .. 1.24
    centrifugalMult: 1.12 - (s.grip - 1) * 0.07, // 1.12 .. 0.84
  };
}
