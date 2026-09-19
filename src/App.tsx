import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import StartScreen from './components/StartScreen';
import TouchControls from './components/TouchControls';
import { GameOverOverlay, PauseOverlay } from './components/Overlays';
import type { Game, Phase, RunStats } from './game/engine';
import { Input } from './game/input';
import { AudioEngine } from './game/audio';
import { DRIVERS, type Driver } from './game/drivers';
import { bestScore, loadScores, saveScore, type ScoreEntry } from './game/highscores';
import { STORAGE_KEY_DRIVER } from './game/constants';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover';

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

  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [driver, setDriver] = useState<Driver>(loadDriver);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  const [stats, setStats] = useState<RunStats | null>(null);
  const [rank, setRank] = useState(0);
  const [newEntryId, setNewEntryId] = useState<string | undefined>(undefined);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [muted, setMuted] = useState(audio.muted);

  const onPhase = useCallback((p: Phase) => {
    setScreen(p === 'attract' ? 'menu' : p === 'paused' ? 'paused' : p === 'gameover' ? 'gameover' : 'playing');
  }, []);

  const onGameOver = useCallback((s: RunStats) => {
    const d = DRIVERS.find((x) => x.id === s.driverId) ?? DRIVERS[0];
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
    setScores(result.scores);
    setNewEntryId(result.rank > 0 ? result.scores[result.rank - 1]?.id : undefined);
    if (gameRef.current) gameRef.current.best = result.scores[0]?.score ?? 0;
  }, []);

  const onReady = useCallback((g: Game) => {
    gameRef.current = g;
    g.best = bestScore();
    g.setDriver(driverRef.current);
    setGame(g);
  }, []);

  const selectDriver = useCallback(
    (d: Driver) => {
      setDriver(d);
      try {
        localStorage.setItem(STORAGE_KEY_DRIVER, d.id);
      } catch {
        /* ignore */
      }
      gameRef.current?.setDriver(d);
      audio.unlock();
      audio.playSelect();
    },
    [audio],
  );

  const startRace = useCallback(() => {
    audio.unlock();
    audio.playClick();
    gameRef.current?.startRace(driverRef.current);
  }, [audio]);

  const toggleMute = useCallback(() => {
    audio.unlock();
    setMuted(audio.toggleMuted());
  }, [audio]);

  const goMenu = useCallback(() => {
    audio.playClick();
    gameRef.current?.startAttract();
  }, [audio]);

  // auto-pause when the tab is hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && gameRef.current && (gameRef.current.phase === 'racing' || gameRef.current.phase === 'countdown')) {
        gameRef.current.pause();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-night font-ui text-white">
      <GameCanvas
        input={input}
        audio={audio}
        steerEnabled={screen === 'playing' && isTouch}
        onReady={onReady}
        onGameOver={onGameOver}
        onPhase={onPhase}
        onMute={setMuted}
      />

      {screen === 'playing' && game && (
        <>
          <button
            type="button"
            aria-label="Pause"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              audio.playClick();
              game.pause();
            }}
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-black/50 font-display text-base text-white/90 hover:bg-white/15"
          >
            ❚❚
          </button>
          {isTouch && <TouchControls input={input} />}
        </>
      )}

      {screen === 'menu' && (
        <StartScreen
          selected={driver}
          onSelect={selectDriver}
          onStart={startRace}
          scores={scores}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {screen === 'paused' && game && (
        <PauseOverlay
          onResume={() => {
            audio.playClick();
            game.resume();
          }}
          onRestart={() => {
            audio.playClick();
            game.restart();
          }}
          onQuit={goMenu}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {screen === 'gameover' && game && stats && (
        <GameOverOverlay
          stats={stats}
          driver={DRIVERS.find((d) => d.id === stats.driverId) ?? driver}
          rank={rank}
          scores={scores}
          newEntryId={newEntryId}
          onRestart={() => {
            audio.playClick();
            game.restart();
          }}
          onMenu={goMenu}
          isTouch={isTouch}
        />
      )}
    </div>
  );
}
