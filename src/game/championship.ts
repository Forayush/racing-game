import { CIRCUITS, circuitById, type CircuitDef } from './circuits';
import { getCircuit } from './circuitBuilder';
import { DRIVERS, TEAMS, driverById, teamOf } from './drivers';
import { aiPace, carPerf, gauss, lapScatter, lapTime, speedProfile, type Difficulty } from './racePhysics';
import type { QualiEntry, RaceEntry, SessionResult } from './race';

/** Points for P1..P10. */
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export type SeasonLength = 'short' | 'standard' | 'full';
export type RaceLength = 'short' | 'medium' | 'long';

export const SEASONS: { id: SeasonLength; label: string; calendar: string[] }[] = [
  { id: 'short', label: 'Short', calendar: ['sahraa', 'riviera', 'northfield', 'parco'] },
  { id: 'standard', label: 'Standard', calendar: ['sahraa', 'isebay', 'riviera', 'alpenring', 'ardennes', 'parco'] },
  { id: 'full', label: 'Full season', calendar: [...CIRCUITS].sort((a, b) => a.round - b.round).map((c) => c.id) },
];

/** Target race distance per setting; laps follow from each circuit's length. */
export const RACE_LENGTHS: { id: RaceLength; label: string; km: number }[] = [
  { id: 'short', label: 'Sprint', km: 10 },
  { id: 'medium', label: 'Feature', km: 20 },
  { id: 'long', label: 'Grand Prix', km: 40 },
];

export function lapsFor(c: CircuitDef, length: RaceLength): number {
  const km = RACE_LENGTHS.find((r) => r.id === length)!.km;
  return Math.max(3, Math.min(30, Math.round(km / c.lengthKm)));
}

export interface ClassifiedEntry extends RaceEntry {
  points: number;
}

export interface RoundResult {
  circuitId: string;
  /** Qualifying order = starting grid. */
  grid: QualiEntry[];
  race: ClassifiedEntry[];
  fastestLap: { driverId: string; time: number } | null;
}

export interface Championship {
  version: 1;
  playerId: string;
  difficulty: Difficulty;
  season: SeasonLength;
  raceLength: RaceLength;
  calendar: string[];
  results: RoundResult[];
  /** Qualifying of the round in progress, once it has been run. */
  grid: QualiEntry[] | null;
  startedAt: number;
}

const STORAGE_KEY = 'apexgp.championship.v1';

export function newChampionship(playerId: string, season: SeasonLength, raceLength: RaceLength, difficulty: Difficulty): Championship {
  return {
    version: 1,
    playerId,
    difficulty,
    season,
    raceLength,
    calendar: SEASONS.find((s) => s.id === season)!.calendar,
    results: [],
    grid: null,
    startedAt: Date.now(),
  };
}

export function loadChampionship(): Championship | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Championship;
    if (c?.version !== 1 || !driverById(c.playerId) || !Array.isArray(c.calendar) || !c.calendar.every((id) => circuitById(id))) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveChampionship(c: Championship | null) {
  try {
    if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const isComplete = (c: Championship) => c.results.length >= c.calendar.length;

export function currentCircuit(c: Championship): CircuitDef | null {
  const id = c.calendar[c.results.length];
  return id ? circuitById(id)! : null;
}

/** Applies the points table to a race classification (retirements score nothing). */
export function classify(race: RaceEntry[]): ClassifiedEntry[] {
  return race.map((e, i) => ({ ...e, points: e.time !== null && i < POINTS.length ? POINTS[i] : 0 }));
}

export function withQualifying(c: Championship, result: SessionResult): Championship {
  return { ...c, grid: result.quali ?? null };
}

export function withRace(c: Championship, result: SessionResult): Championship {
  const circuit = currentCircuit(c);
  if (!circuit || !result.race) return c;
  return {
    ...c,
    grid: null,
    results: [...c.results, { circuitId: circuit.id, grid: c.grid ?? [], race: classify(result.race), fastestLap: result.fastestLap }],
  };
}

/** Qualifying for someone who skips the session: the player's lap is simulated like an AI driver's. */
export function simulateQualifying(c: Championship): QualiEntry[] {
  const circuit = getCircuit(currentCircuit(c)!);
  const entries = DRIVERS.map((d) => {
    const profile = speedProfile(circuit.track.segments, carPerf(d), aiPace(d, c.difficulty));
    const base = lapTime(profile);
    const sc = lapScatter(d);
    return { driverId: d.id, best: Math.min(base * (1 + gauss() * sc), base * (1 + gauss() * sc)) };
  });
  return entries.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
}

export interface DriverStanding {
  driverId: string;
  points: number;
  wins: number;
  podiums: number;
  /** Finishing positions per round (null = retired / not raced). */
  finishes: (number | null)[];
}

/** Points, then most wins, most seconds, ... (F1 countback). */
function countback(a: (number | null)[], b: (number | null)[]): number {
  for (let p = 1; p <= DRIVERS.length; p++) {
    const ca = a.filter((x) => x === p).length;
    const cb = b.filter((x) => x === p).length;
    if (ca !== cb) return cb - ca;
  }
  return 0;
}

export function driverStandings(c: Championship): DriverStanding[] {
  const table = new Map<string, DriverStanding>(DRIVERS.map((d) => [d.id, { driverId: d.id, points: 0, wins: 0, podiums: 0, finishes: [] }]));
  for (const round of c.results) {
    const seen = new Set<string>();
    round.race.forEach((e, i) => {
      const s = table.get(e.driverId);
      if (!s) return;
      seen.add(e.driverId);
      const pos = e.time !== null ? i + 1 : null;
      s.points += e.points;
      s.finishes.push(pos);
      if (pos === 1) s.wins++;
      if (pos !== null && pos <= 3) s.podiums++;
    });
    for (const s of table.values()) if (!seen.has(s.driverId)) s.finishes.push(null);
  }
  return [...table.values()].sort((a, b) => b.points - a.points || countback(a.finishes, b.finishes));
}

export interface TeamStanding {
  teamId: string;
  points: number;
  wins: number;
}

export function constructorStandings(c: Championship): TeamStanding[] {
  const drivers = driverStandings(c);
  return TEAMS.map((t) => {
    const mine = drivers.filter((d) => teamOf(driverById(d.driverId)!).id === t.id);
    return { teamId: t.id, points: mine.reduce((s, d) => s + d.points, 0), wins: mine.reduce((s, d) => s + d.wins, 0) };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/** Main-menu summary of a season in progress. */
export function seasonSummary(c: Championship) {
  const standings = driverStandings(c);
  const me = standings.findIndex((s) => s.driverId === c.playerId);
  const next = currentCircuit(c);
  return {
    round: Math.min(c.results.length + 1, c.calendar.length),
    rounds: c.calendar.length,
    nextRace: next ? next.gp : 'Season complete',
    driverName: driverById(c.playerId)!.name,
    position: me + 1,
    points: standings[me]?.points ?? 0,
  };
}
