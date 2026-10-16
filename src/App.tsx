import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import StartScreen from './components/StartScreen';
import TitleScreen from './components/TitleScreen';
import MainMenu from './components/MainMenu';
import Paddock, { type Tab as PaddockTab } from './components/Paddock';
import ChampionshipSetup from './components/ChampionshipSetup';
import ChampionshipHub from './components/ChampionshipHub';
import TouchControls from './components/TouchControls';
import { GameOverOverlay, PauseOverlay } from './components/Overlays';
import { QualifyingResults, RacePauseOverlay, RaceResults } from './components/RaceOverlays';
import { Icon } from './components/ui';
import type { Engine, Phase } from './game/core';
import { ArcadeGame, type RunStats } from './game/arcade';
import { RaceGame, type SessionResult } from './game/race';
import { Input } from './game/input';
import { AudioEngine } from './game/audio';
import { CIRCUITS, circuitById } from './game/circuits';
import { getCircuit } from './game/circuitBuilder';
import { DRIVERS, TEAMS, driverById, type Driver } from './game/drivers';
import { bestScore, clearScores, loadScores, saveScore, type ScoreEntry } from './game/highscores';
import {
  currentCircuit,
  driverStandings,
  lapsFor,
  loadChampionship,
  newChampionship,
  saveChampionship,
  seasonSummary,
  simulateQualifying,
  withQualifying,
  withRace,
  type Championship,
  type RaceLength,
  type SeasonLength,
} from './game/championship';
import type { Difficulty } from './game/racePhysics';
import { STORAGE_KEY_DRIVER } from './game/constants';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover';
/** Which front-end screen shows while the engine idles. */
type View = 'title' | 'menu' | 'arcade' | 'paddock' | 'champ-setup' | 'champ-hub' | 'session';

/** What the canvas is running. */
type Session =
  | { kind: 'arcade' }
  | { kind: 'showcase'; circuitId: string }
  | {
      kind: 'qualifying' | 'race';
      circuitId: string;
      driverId: string;
      laps: number;
      difficulty: Difficulty;
      grid?: string[];
      /** Part of a championship weekend (vs a paddock test drive). */
      weekend: boolean;
    };

const QUALI_LAPS = 2;
const TEST_LAPS = 3;

function loadDriver(): Driver {
  try {
    const id = localStorage.getItem(STORAGE_KEY_DRIVER);
    return DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
  } catch {
    return DRIVERS[0];
  }
}

export default function App() {
  const input = useMemo(() => new Input(), []);
  const audio = useMemo(() => new AudioEngine(), []);
  // primary pointer is coarse → phone / tablet. Upgraded on the fly if a touch ever lands on the canvas.
  const [isTouch, setIsTouch] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const onTouchDetected = useCallback(() => setIsTouch(true), []);

  const gameRef = useRef<Engine | null>(null);
  const [game, setGame] = useState<Engine | null>(null);
  const arcade = game instanceof ArcadeGame ? game : null;
  const race = game instanceof RaceGame ? game : null;
  const arcadeRef = () => (gameRef.current instanceof ArcadeGame ? gameRef.current : null);

  const [screen, setScreen] = useState<Screen>('menu');
  const [view, setView] = useState<View>('title');
  const [paddockTab, setPaddockTab] = useState<PaddockTab>('teams');
  const [driver, setDriver] = useState<Driver>(loadDriver);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  const [muted, setMuted] = useState(audio.muted);

  // arcade results
  const [stats, setStats] = useState<RunStats | null>(null);
  const [rank, setRank] = useState(0);
  const [prevBest, setPrevBest] = useState(0);
  const [newEntryId, setNewEntryId] = useState<string | undefined>(undefined);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());

  // sessions + championship
  const [session, setSession] = useState<Session>({ kind: 'arcade' });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [sessionKey, setSessionKey] = useState('s0');
  const seq = useRef(0);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [champ, setChamp] = useState<Championship | null>(() => loadChampionship());
  const champRef = useRef(champ);
  champRef.current = champ;
  const [standingBefore, setStandingBefore] = useState(0);

  const commitChamp = useCallback((c: Championship | null) => {
    saveChampionship(c);
    champRef.current = c;
    setChamp(c);
  }, []);

  const startSession = useCallback((s: Session) => {
    seq.current += 1;
    sessionRef.current = s;
    setSession(s);
    setSessionKey(`s${seq.current}`);
    setSessionResult(null);
  }, []);

  const onPhase = useCallback((p: Phase) => {
    setScreen(p === 'attract' ? 'menu' : p === 'paused' ? 'paused' : p === 'gameover' ? 'gameover' : 'playing');
  }, []);

  const onGameOver = useCallback((s: RunStats) => {
    const d = DRIVERS.find((x) => x.id === s.driverId) ?? DRIVERS[0];
    const before = bestScore();
    const result = saveScore({
      driverId: d.id,
      driver: d.name,
      team: d.team,
      score: s.score,
      distanceKm: s.distanceKm,
      overtakes: s.overtakes,
      nearMisses: s.nearMisses,
    });
    setStats(s);
    setRank(result.rank);
    setPrevBest(before);
    setScores(result.scores);
    setNewEntryId(result.rank > 0 ? result.scores[result.rank - 1]?.id : undefined);
    const a = arcadeRef();
    if (a) a.best = result.scores[0]?.score ?? 0;
  }, []);

  const onSessionEnd = useCallback(
    (r: SessionResult) => {
      const s = sessionRef.current;
      setSessionResult(r);
      if ((s.kind !== 'qualifying' && s.kind !== 'race') || !s.weekend) return;
      const c = champRef.current;
      if (!c) return;
      if (r.kind === 'qualifying') commitChamp(withQualifying(c, r));
      else {
        setStandingBefore(driverStandings(c).findIndex((x) => x.driverId === c.playerId) + 1);
        commitChamp(withRace(c, r));
      }
    },
    [commitChamp],
  );

  const createEngine = useCallback(
    (canvas: HTMLCanvasElement): Engine => {
      const s = sessionRef.current;
      if (s.kind === 'arcade') {
        const g = new ArcadeGame(canvas, input, audio, { onGameOver, onPhase, onMute: setMuted });
        g.best = bestScore();
        g.setDriver(driverRef.current);
        return g;
      }
      const circuit = getCircuit(circuitById(s.circuitId) ?? CIRCUITS[0]);
      const events = { onPhase, onMute: setMuted, onSessionEnd };
      if (s.kind === 'showcase') return new RaceGame(canvas, input, audio, events, { kind: 'showcase', circuit, playerId: DRIVERS[0].id, laps: 1, difficulty: 'pro' });
      return new RaceGame(canvas, input, audio, events, { kind: s.kind, circuit, playerId: s.driverId, laps: s.laps, difficulty: s.difficulty, grid: s.grid });
    },
    [input, audio, onGameOver, onPhase, onSessionEnd],
  );

  const onReady = useCallback((g: Engine) => {
    gameRef.current = g;
    setGame(g);
  }, []);

  const click = useCallback(() => {
    audio.unlock();
    audio.playSelect();
  }, [audio]);

  const toggleMute = useCallback(() => {
    audio.unlock();
    setMuted(audio.toggleMuted());
  }, [audio]);

  // ---- navigation
  const showArcadeBackdrop = useCallback(() => {
    if (sessionRef.current.kind !== 'arcade') startSession({ kind: 'arcade' });
  }, [startSession]);

  const goto = useCallback(
    (v: View) => {
      click();
      setView(v);
      if (v === 'title' || v === 'menu' || v === 'arcade' || v === 'paddock') showArcadeBackdrop();
    },
    [click, showArcadeBackdrop],
  );

  const openHub = useCallback(
    (c: Championship | null = champRef.current) => {
      if (!c) return;
      click();
      setView('champ-hub');
      const next = currentCircuit(c) ?? circuitById(c.calendar[c.calendar.length - 1])!;
      startSession({ kind: 'showcase', circuitId: next.id });
    },
    [click, startSession],
  );

  const openSetup = useCallback(() => {
    click();
    setView('champ-setup');
    startSession({ kind: 'showcase', circuitId: CIRCUITS[0].id });
  }, [click, startSession]);

  // ---- arcade
  const selectDriver = useCallback(
    (d: Driver) => {
      setDriver(d);
      try {
        localStorage.setItem(STORAGE_KEY_DRIVER, d.id);
      } catch {
        /* ignore */
      }
      arcadeRef()?.setDriver(d);
      audio.unlock();
      audio.playSelect();
    },
    [audio],
  );

  const startArcadeRun = useCallback(() => {
    audio.unlock();
    audio.playClick();
    arcadeRef()?.startRace(driverRef.current);
  }, [audio]);

  const arcadeToSelect = useCallback(() => {
    audio.playClick();
    arcadeRef()?.startAttract();
  }, [audio]);

  const clearBoard = useCallback(() => {
    clearScores();
    setScores([]);
    const a = arcadeRef();
    if (a) a.best = 0;
    audio.playClick();
  }, [audio]);

  // ---- championship
  const createSeason = useCallback(
    (driverId: string, season: SeasonLength, raceLength: RaceLength, difficulty: Difficulty) => {
      const c = newChampionship(driverId, season, raceLength, difficulty);
      commitChamp(c);
      openHub(c);
    },
    [commitChamp, openHub],
  );

  const startQualifying = useCallback(() => {
    const c = champRef.current;
    const def = c && currentCircuit(c);
    if (!c || !def) return;
    click();
    setView('session');
    startSession({ kind: 'qualifying', circuitId: def.id, driverId: c.playerId, laps: QUALI_LAPS, difficulty: c.difficulty, weekend: true });
  }, [click, startSession]);

  const skipQualifying = useCallback(() => {
    const c = champRef.current;
    if (!c || !currentCircuit(c)) return;
    click();
    commitChamp({ ...c, grid: simulateQualifying(c) });
  }, [click, commitChamp]);

  const startRaceSession = useCallback(() => {
    const c = champRef.current;
    const def = c && currentCircuit(c);
    if (!c || !def || !c.grid) return;
    click();
    setView('session');
    startSession({
      kind: 'race',
      circuitId: def.id,
      driverId: c.playerId,
      laps: lapsFor(def, c.raceLength),
      difficulty: c.difficulty,
      grid: c.grid.map((g) => g.driverId),
      weekend: true,
    });
  }, [click, startSession]);

  const abandonSeason = useCallback(() => {
    commitChamp(null);
    goto('menu');
  }, [commitChamp, goto]);

  const testDrive = useCallback(
    (circuitId: string) => {
      click();
      setPaddockTab('circuits');
      setView('session');
      startSession({ kind: 'qualifying', circuitId, driverId: driverRef.current.id, laps: TEST_LAPS, difficulty: champRef.current?.difficulty ?? 'pro', weekend: false });
    },
    [click, startSession],
  );

  const leaveSession = useCallback(() => {
    const s = sessionRef.current;
    if (s.kind !== 'qualifying' && s.kind !== 'race') return;
    if (s.weekend) openHub();
    else goto('paddock');
  }, [openHub, goto]);

  // the run as it stood when the pause landed (the engine is frozen while paused)
  const pausedRun = useMemo(() => (screen === 'paused' && arcade ? arcade.snapshot() : null), [screen, arcade]);
  const pausedSession = useMemo(() => (screen === 'paused' && race ? race.info() : null), [screen, race]);

  // auto-pause when the tab is hidden
  useEffect(() => {
    const onVis = () => {
      const g = gameRef.current;
      if (document.hidden && g && (g.phase === 'racing' || g.phase === 'countdown')) g.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const raceSession = session.kind === 'qualifying' || session.kind === 'race' ? session : null;
  const sessionCircuit = raceSession ? circuitById(raceSession.circuitId)! : null;
  const summary = champ ? seasonSummary(champ) : null;
  const menuTrack = getCircuit((champ && currentCircuit(champ)) || circuitById('parco')!).svg;
  const idle = screen === 'menu';

  return (
    <div className="relative h-full w-full overflow-hidden bg-night font-ui text-white">
      <GameCanvas input={input} create={createEngine} session={sessionKey} steerEnabled={screen === 'playing' && isTouch} onReady={onReady} onTouchDetected={onTouchDetected} />

      {screen === 'playing' && game && (session.kind === 'arcade' || raceSession) && (
        <>
          {/* the engine's dash panel is laid out just below this button — keep the size / offsets in sync */}
          <button
            type="button"
            aria-label="Pause"
            title={isTouch ? 'Pause' : 'Pause (P)'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              audio.playClick();
              game.pause();
            }}
            className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-lg text-white/90 transition hover:border-white/40 hover:bg-white/15"
          >
            <Icon.Pause />
          </button>
          {isTouch && <TouchControls input={input} game={game} boostLabel={raceSession ? 'ERS' : 'BOOST'} />}
        </>
      )}

      {idle && view === 'title' && (
        <TitleScreen
          onContinue={() => goto('menu')}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
          facts={{ drivers: DRIVERS.length, teams: TEAMS.length, circuits: CIRCUITS.length }}
        />
      )}

      {idle && view === 'menu' && (
        <MainMenu
          onChampionship={() => openHub()}
          onNewChampionship={openSetup}
          onArcade={() => goto('arcade')}
          onPaddock={() => {
            setPaddockTab('teams');
            goto('paddock');
          }}
          onBack={() => goto('title')}
          bestScore={scores[0]?.score ?? 0}
          season={summary}
          trackPath={menuTrack}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {idle && view === 'paddock' && <Paddock initialTab={paddockTab} onTestDrive={testDrive} onBack={() => goto('menu')} muted={muted} onToggleMute={toggleMute} />}

      {idle && view === 'arcade' && (
        <StartScreen
          selected={driver}
          onSelect={selectDriver}
          onStart={startArcadeRun}
          onBack={() => goto('menu')}
          scores={scores}
          onClearScores={clearBoard}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {idle && view === 'champ-setup' && (
        <ChampionshipSetup initialDriver={driver} onCreate={createSeason} onBack={() => goto('menu')} muted={muted} onToggleMute={toggleMute} isTouch={isTouch} />
      )}

      {idle && view === 'champ-hub' && champ && (
        <ChampionshipHub
          champ={champ}
          onStartQualifying={startQualifying}
          onSkipQualifying={skipQualifying}
          onStartRace={startRaceSession}
          onNewSeason={openSetup}
          onAbandon={abandonSeason}
          onBack={() => goto('menu')}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {/* ---- arcade overlays */}
      {screen === 'paused' && arcade && (
        <PauseOverlay
          onResume={() => {
            audio.playClick();
            arcade.resume();
          }}
          onRestart={() => {
            audio.playClick();
            arcade.restart();
          }}
          onQuit={arcadeToSelect}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
          driver={driver}
          run={pausedRun}
        />
      )}

      {screen === 'gameover' && arcade && stats && (
        <GameOverOverlay
          stats={stats}
          driver={DRIVERS.find((d) => d.id === stats.driverId) ?? driver}
          rank={rank}
          prevBest={prevBest}
          scores={scores}
          newEntryId={newEntryId}
          onRestart={() => {
            audio.playClick();
            arcade.restart();
          }}
          onMenu={arcadeToSelect}
          isTouch={isTouch}
        />
      )}

      {/* ---- circuit session overlays */}
      {screen === 'paused' && race && raceSession && sessionCircuit && pausedSession && (
        <RacePauseOverlay
          info={pausedSession}
          circuit={sessionCircuit}
          driver={driverById(raceSession.driverId) ?? driver}
          onResume={() => {
            audio.playClick();
            race.resume();
          }}
          onRestart={() => {
            audio.playClick();
            race.restartSession();
          }}
          onEnd={() => {
            audio.playClick();
            race.endSession();
          }}
          onQuit={leaveSession}
          quitLabel={raceSession.weekend ? 'Quit to championship hub' : 'Back to paddock'}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {sessionResult && raceSession && sessionCircuit && sessionResult.kind === 'qualifying' && (
        <QualifyingResults
          result={sessionResult}
          circuit={sessionCircuit}
          playerId={raceSession.driverId}
          weekend={raceSession.weekend}
          primaryLabel={raceSession.weekend ? 'Start the race' : 'Drive again'}
          onPrimary={raceSession.weekend ? startRaceSession : () => testDrive(raceSession.circuitId)}
          secondaryLabel={raceSession.weekend ? 'Championship hub' : 'Back to paddock'}
          onSecondary={leaveSession}
        />
      )}

      {sessionResult && raceSession && sessionCircuit && sessionResult.kind === 'race' && (
        <RaceResults
          result={sessionResult}
          circuit={sessionCircuit}
          playerId={raceSession.driverId}
          standing={
            champ && raceSession.weekend
              ? {
                  before: standingBefore,
                  after: driverStandings(champ).findIndex((x) => x.driverId === champ.playerId) + 1,
                  points: driverStandings(champ).find((x) => x.driverId === champ.playerId)?.points ?? 0,
                }
              : undefined
          }
          continueLabel={raceSession.weekend ? 'Continue' : 'Back to paddock'}
          onContinue={leaveSession}
        />
      )}
    </div>
  );
}
