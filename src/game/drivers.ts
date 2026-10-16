export interface Livery {
  primary: string;
  secondary: string;
  accent: string;
  helmet: string;
  /** Roll-hoop camera colour — tells team-mates apart on track. */
  tcam?: string;
}

/** 0..100 ratings for the car a team builds. */
export interface CarRatings {
  power: number;
  accel: number;
  handling: number;
}

/** 0..100 ratings for a driver. */
export interface SkillRatings {
  pace: number;
  racecraft: number;
  consistency: number;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  country: string;
  flag: string;
  base: string;
  livery: Livery;
  car: CarRatings;
  /** Overall car rating, 0..100 */
  rating: number;
  /** The two race seats, in car-number order. */
  driverIds: [string, string];
}

export interface Driver {
  id: string;
  number: number;
  name: string;
  short: string;
  teamId: string;
  /** Team display name. */
  team: string;
  country: string;
  flag: string;
  /** Team livery with this driver's helmet and T-cam. */
  livery: Livery;
  skill: SkillRatings;
  /** Car + driver blend that drives the handling model, 0..100. */
  stats: { speed: number; accel: number; grip: number };
  /** Overall driver rating, 0..100 */
  rating: number;
  radio: string;
}

type TeamDef = Omit<Team, 'rating' | 'driverIds'>;
type DriverDef = Omit<Driver, 'team' | 'livery' | 'stats' | 'rating'> & { helmet: string };

const TEAM_DEFS: TeamDef[] = [
  {
    id: 'taurus',
    name: 'Taurus Racing',
    short: 'TAU',
    country: 'Austria',
    flag: '🇦🇹',
    base: 'Salzburg',
    livery: { primary: '#1b2a59', secondary: '#e8112d', accent: '#ffc906', helmet: '#ffc906' },
    car: { power: 94, accel: 93, handling: 96 },
  },
  {
    id: 'argent',
    name: 'Argent Motorsport',
    short: 'ARG',
    country: 'Germany',
    flag: '🇩🇪',
    base: 'Stuttgart',
    livery: { primary: '#c3cad3', secondary: '#101418', accent: '#00d2be', helmet: '#00d2be' },
    car: { power: 96, accel: 91, handling: 90 },
  },
  {
    id: 'vulcano',
    name: 'Scuderia Vulcano',
    short: 'VUL',
    country: 'Italy',
    flag: '🇮🇹',
    base: 'Modena',
    livery: { primary: '#e10600', secondary: '#1a1a1a', accent: '#ffd400', helmet: '#ffd400' },
    car: { power: 95, accel: 90, handling: 89 },
  },
  {
    id: 'solaris',
    name: 'Solaris GP',
    short: 'SOL',
    country: 'Spain',
    flag: '🇪🇸',
    base: 'Valencia',
    livery: { primary: '#ff8c00', secondary: '#111111', accent: '#ffffff', helmet: '#ffffff' },
    car: { power: 90, accel: 94, handling: 94 },
  },
  {
    id: 'verde',
    name: 'Verde Racing',
    short: 'VRD',
    country: 'Brazil',
    flag: '🇧🇷',
    base: 'São Paulo',
    livery: { primary: '#15803d', secondary: '#facc15', accent: '#ffffff', helmet: '#facc15' },
    car: { power: 87, accel: 88, handling: 88 },
  },
  {
    id: 'onyx',
    name: 'Onyx Racing',
    short: 'ONX',
    country: 'United Kingdom',
    flag: '🇬🇧',
    base: 'Silverton',
    livery: { primary: '#0b0b0f', secondary: '#38bdf8', accent: '#38bdf8', helmet: '#38bdf8' },
    car: { power: 91, accel: 85, handling: 82 },
  },
  {
    id: 'nordic',
    name: 'Nordic Blue',
    short: 'NOR',
    country: 'Sweden',
    flag: '🇸🇪',
    base: 'Gothenburg',
    livery: { primary: '#1d4ed8', secondary: '#fbbf24', accent: '#ffffff', helmet: '#fbbf24' },
    car: { power: 92, accel: 84, handling: 80 },
  },
  {
    id: 'sakura',
    name: 'Sakura Motorsport',
    short: 'SAK',
    country: 'Japan',
    flag: '🇯🇵',
    base: 'Nagoya',
    livery: { primary: '#f8f8f8', secondary: '#e23b6f', accent: '#111827', helmet: '#e23b6f' },
    car: { power: 84, accel: 87, handling: 91 },
  },
  {
    id: 'aurora',
    name: 'Aurora Racing',
    short: 'AUR',
    country: 'United States',
    flag: '🇺🇸',
    base: 'Charlotte',
    livery: { primary: '#7c3aed', secondary: '#111111', accent: '#f0abfc', helmet: '#f0abfc' },
    car: { power: 85, accel: 83, handling: 85 },
  },
  {
    id: 'kinetic',
    name: 'Kinetic Racing',
    short: 'KIN',
    country: 'Switzerland',
    flag: '🇨🇭',
    base: 'Basel',
    livery: { primary: '#a3e635', secondary: '#111111', accent: '#ffffff', helmet: '#111111' },
    car: { power: 82, accel: 82, handling: 84 },
  },
];

// Six of these keep the ids of the original arcade roster so saved high scores still resolve.
const DRIVER_DEFS: DriverDef[] = [
  { id: 'visser', number: 1, name: 'Sander Visser', short: 'VIS', teamId: 'taurus', country: 'Netherlands', flag: '🇳🇱', helmet: '#ff6b00', skill: { pace: 96, racecraft: 94, consistency: 92 }, radio: 'Tyres are fine. Tell the others to hurry up.' },
  { id: 'alvarez', number: 22, name: 'Diego Alvarez', short: 'ALV', teamId: 'taurus', country: 'Argentina', flag: '🇦🇷', helmet: '#7dd3fc', skill: { pace: 85, racecraft: 82, consistency: 84 }, radio: 'Give me a clean start and I’ll do the rest.' },
  { id: 'hartmann', number: 3, name: 'Felix Hartmann', short: 'HAR', teamId: 'argent', country: 'Germany', flag: '🇩🇪', helmet: '#f5f5f5', skill: { pace: 92, racecraft: 90, consistency: 93 }, radio: 'Every tenth is a decision. I make good decisions.' },
  { id: 'bennett', number: 10, name: 'Noah Bennett', short: 'BEN', teamId: 'argent', country: 'United Kingdom', flag: '🇬🇧', helmet: '#facc15', skill: { pace: 89, racecraft: 86, consistency: 87 }, radio: 'Gap ahead? Copy. Closing it now.' },
  { id: 'ferrante', number: 27, name: 'Luca Ferrante', short: 'FER', teamId: 'vulcano', country: 'Italy', flag: '🇮🇹', helmet: '#ffd400', skill: { pace: 91, racecraft: 88, consistency: 86 }, radio: 'Give me the clean air and I will give you the win.' },
  { id: 'dubois', number: 16, name: 'Antoine Dubois', short: 'DUB', teamId: 'vulcano', country: 'France', flag: '🇫🇷', helmet: '#2563eb', skill: { pace: 88, racecraft: 84, consistency: 88 }, radio: 'Smooth is fast. Fast is smooth. Allez.' },
  { id: 'reyes', number: 7, name: 'Mateo Reyes', short: 'REY', teamId: 'solaris', country: 'Spain', flag: '🇪🇸', helmet: '#ffffff', skill: { pace: 91, racecraft: 90, consistency: 87 }, radio: 'Lights out and we are already gone.' },
  { id: 'thornton', number: 81, name: 'Jack Thornton', short: 'THO', teamId: 'solaris', country: 'Australia', flag: '🇦🇺', helmet: '#16a34a', skill: { pace: 90, racecraft: 86, consistency: 89 }, radio: 'No worries — just point me at the apex.' },
  { id: 'marchetti', number: 5, name: 'Sofia Marchetti', short: 'MAR', teamId: 'verde', country: 'Brazil', flag: '🇧🇷', helmet: '#facc15', skill: { pace: 87, racecraft: 86, consistency: 85 }, radio: 'Every gap is an invitation.' },
  { id: 'brenner', number: 19, name: 'Lukas Brenner', short: 'BRE', teamId: 'verde', country: 'Germany', flag: '🇩🇪', helmet: '#e5e7eb', skill: { pace: 84, racecraft: 85, consistency: 90 }, radio: 'Fifteen seasons. I know where the grip is.' },
  { id: 'okafor', number: 44, name: 'Nadia Okafor', short: 'OKA', teamId: 'onyx', country: 'Nigeria', flag: '🇳🇬', helmet: '#38bdf8', skill: { pace: 89, racecraft: 88, consistency: 84 }, radio: 'Nobody out-drags the Onyx on a straight.' },
  { id: 'costa', number: 12, name: 'Rafael Costa', short: 'COS', teamId: 'onyx', country: 'Portugal', flag: '🇵🇹', helmet: '#dc2626', skill: { pace: 83, racecraft: 81, consistency: 82 }, radio: 'Late on the brakes. Later than you.' },
  { id: 'lindqvist', number: 63, name: 'Erik Lindqvist', short: 'LIN', teamId: 'nordic', country: 'Sweden', flag: '🇸🇪', helmet: '#fbbf24', skill: { pace: 85, racecraft: 82, consistency: 89 }, radio: 'Calm hands. Fast car. Simple.' },
  { id: 'mehta', number: 23, name: 'Arjun Mehta', short: 'MEH', teamId: 'nordic', country: 'India', flag: '🇮🇳', helmet: '#f97316', skill: { pace: 82, racecraft: 84, consistency: 80 }, radio: 'Points today. Podium tomorrow.' },
  { id: 'nakamura', number: 11, name: 'Kai Nakamura', short: 'NAK', teamId: 'sakura', country: 'Japan', flag: '🇯🇵', helmet: '#e23b6f', skill: { pace: 86, racecraft: 83, consistency: 90 }, radio: 'Precision beats power. Watch the apex.' },
  { id: 'doyle', number: 30, name: 'Sean Doyle', short: 'DOY', teamId: 'sakura', country: 'Ireland', flag: '🇮🇪', helmet: '#22c55e', skill: { pace: 82, racecraft: 80, consistency: 84 }, radio: 'Rain or shine, I’ll find the line.' },
  { id: 'brooks', number: 8, name: 'Tyler Brooks', short: 'BRO', teamId: 'aurora', country: 'United States', flag: '🇺🇸', helmet: '#f0abfc', skill: { pace: 83, racecraft: 85, consistency: 80 }, radio: 'Full send. Always full send.' },
  { id: 'zhang', number: 88, name: 'Wei Zhang', short: 'ZHA', teamId: 'aurora', country: 'China', flag: '🇨🇳', helmet: '#ef4444', skill: { pace: 81, racecraft: 79, consistency: 84 }, radio: 'Patience. The race is long.' },
  { id: 'koskinen', number: 9, name: 'Elias Koskinen', short: 'KOS', teamId: 'kinetic', country: 'Finland', flag: '🇫🇮', helmet: '#111111', skill: { pace: 83, racecraft: 80, consistency: 87 }, radio: 'Hmm. Yes. Fast.' },
  { id: 'diallo', number: 42, name: 'Amara Diallo', short: 'DIA', teamId: 'kinetic', country: 'Senegal', flag: '🇸🇳', helmet: '#16a34a', skill: { pace: 80, racecraft: 82, consistency: 78 }, radio: 'Rookie? Watch the timing screen.' },
];

const carRating = (c: CarRatings) => Math.round(c.power * 0.4 + c.accel * 0.3 + c.handling * 0.3);
const driverRating = (s: SkillRatings) => Math.round(s.pace * 0.5 + s.racecraft * 0.3 + s.consistency * 0.2);

export const TEAMS: Team[] = TEAM_DEFS.map((t) => {
  const seats = DRIVER_DEFS.filter((d) => d.teamId === t.id);
  return { ...t, rating: carRating(t.car), driverIds: [seats[0].id, seats[1].id] };
});

const TEAM_INDEX = new Map(TEAMS.map((t) => [t.id, t]));

export const DRIVERS: Driver[] = DRIVER_DEFS.map(({ helmet, ...d }) => {
  const t = TEAM_INDEX.get(d.teamId)!;
  const firstSeat = t.driverIds[0] === d.id;
  return {
    ...d,
    team: t.name,
    // F1 convention: black roll-hoop camera on the first car, fluorescent yellow on the second
    livery: { ...t.livery, helmet, tcam: firstSeat ? '#0a0a0a' : '#e8ff00' },
    stats: {
      speed: Math.round(t.car.power * 0.8 + d.skill.pace * 0.2),
      accel: Math.round(t.car.accel * 0.8 + d.skill.racecraft * 0.2),
      grip: Math.round(t.car.handling * 0.75 + d.skill.consistency * 0.25),
    },
    rating: driverRating(d.skill),
  };
});

export function teamOf(d: Driver): Team {
  return TEAM_INDEX.get(d.teamId)!;
}

export function teamById(id: string): Team | undefined {
  return TEAM_INDEX.get(id);
}

export function driverById(id: string): Driver | undefined {
  return DRIVERS.find((d) => d.id === id);
}

/** Car + driver strength used to rank AI pace, 0..100 — the car matters more, as it does in F1. */
export function packageRating(d: Driver): number {
  return teamOf(d).rating * 0.65 + d.rating * 0.35;
}

/** Liveries for arcade traffic so the road looks like a full grid. */
export const TRAFFIC_LIVERIES: Livery[] = DRIVERS.map((d) => d.livery);

const chroma = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
};

/** The livery colour that identifies a team on dark UI (skips near-black / near-white primaries). */
export function liveryColor(l: Livery): string {
  if (chroma(l.primary) >= 100) return l.primary;
  return [l.secondary, l.accent].reduce((best, c) => (chroma(c) > chroma(best) ? c : best), l.primary);
}

export function driverColor(d: { livery: Livery }): string {
  return liveryColor(d.livery);
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

/** Maps the 0..100 blend onto the handling model; the field spans roughly 78..95. */
export function driverPhysics(d: Driver): DriverPhysics {
  const t = (v: number) => Math.min(1, Math.max(0, (v - 70) / 30));
  const s = d.stats;
  return {
    maxSpeedMult: 0.94 + t(s.speed) * 0.12,
    accelMult: 0.85 + t(s.accel) * 0.44,
    steerMult: 0.92 + t(s.grip) * 0.32,
    centrifugalMult: 1.12 - t(s.grip) * 0.28,
  };
}
