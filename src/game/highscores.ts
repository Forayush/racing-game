import { STORAGE_KEY_SCORES } from './constants';

export interface ScoreEntry {
  id: string;
  driverId: string;
  driver: string;
  team: string;
  score: number;
  distanceKm: number;
  overtakes: number;
  nearMisses: number;
  date: number;
}

export const MAX_ENTRIES = 10;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCORES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => typeof e.score === 'number').sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Saves the entry and returns its 1-based rank (or 0 if it did not make the table). */
export function saveScore(entry: Omit<ScoreEntry, 'id' | 'date'>): { rank: number; scores: ScoreEntry[] } {
  const scores = loadScores();
  const newEntry: ScoreEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: Date.now() };
  const full: ScoreEntry[] = [...scores, newEntry];
  full.sort((a, b) => b.score - a.score);
  const trimmed = full.slice(0, MAX_ENTRIES);
  const rankIdx = trimmed.indexOf(newEntry);
  try {
    localStorage.setItem(STORAGE_KEY_SCORES, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable */
  }
  return { rank: rankIdx >= 0 ? rankIdx + 1 : 0, scores: trimmed };
}

export function bestScore(): number {
  const s = loadScores();
  return s.length ? s[0].score : 0;
}

export function clearScores() {
  try {
    localStorage.removeItem(STORAGE_KEY_SCORES);
  } catch {
    /* ignore */
  }
}
