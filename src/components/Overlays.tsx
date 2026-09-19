import { useEffect, useState } from 'react';
import type { RunStats } from '@/game/engine';
import type { Driver } from '@/game/drivers';
import type { ScoreEntry } from '@/game/highscores';
import HighScoreTable from './HighScoreTable';
import CarPreview from './CarPreview';
import { driverColor } from './StartScreen';
import { cn } from '@/utils/cn';

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

function Backdrop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-night/70 p-4 animate-fade-in', className)}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('btn-race bg-f1red px-8 py-3 font-display text-base tracking-[0.18em] text-white hover:brightness-110 sm:text-lg', className)}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, className }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'btn-race border border-white/25 bg-white/5 px-6 py-3 font-display text-sm tracking-[0.18em] text-white/85 hover:bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

interface PauseProps {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

export function PauseOverlay({ onResume, onRestart, onQuit, muted, onToggleMute, isTouch }: PauseProps) {
  return (
    <Backdrop>
      <div className="carbon w-full max-w-sm animate-pop rounded-2xl border border-white/10 p-6 text-center shadow-2xl">
        <div className="stripes-red mx-auto mb-4 h-1.5 w-24 skew-x-[-16deg]" />
        <h2 className="font-display text-4xl italic tracking-tight">PAUSED</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/50">Race suspended · Red flag</p>
        <div className="mt-6 flex flex-col gap-3">
          <PrimaryButton onClick={onResume}>RESUME {isTouch ? '' : '(P)'}</PrimaryButton>
          <GhostButton onClick={onRestart}>RESTART {isTouch ? '' : '(R)'}</GhostButton>
          <GhostButton onClick={onQuit}>QUIT TO PIT LANE</GhostButton>
          <button type="button" onClick={onToggleMute} className="mt-1 text-xs font-bold tracking-widest text-white/60 hover:text-white">
            {muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ---------------------------------------------------------------------------

interface GameOverProps {
  stats: RunStats;
  driver: Driver;
  rank: number;
  scores: ScoreEntry[];
  newEntryId?: string;
  onRestart: () => void;
  onMenu: () => void;
  isTouch: boolean;
}

function useCountUp(target: number, duration = 1300) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export function GameOverOverlay({ stats, driver, rank, scores, newEntryId, onRestart, onMenu, isTouch }: GameOverProps) {
  const shown = useCountUp(stats.score);
  const color = driverColor(driver);
  const headline = rank === 1 ? 'NEW TRACK RECORD!' : rank > 0 ? `P${rank} ON THE BOARD` : 'CHEQUERED FLAG';
  const items: [string, string][] = [
    ['DISTANCE', `${stats.distanceKm.toFixed(2)} km`],
    ['OVERTAKES', `${stats.overtakes}`],
    ['CLOSE CALLS', `${stats.nearMisses}`],
    ['MAX COMBO', `×${stats.maxCombo}`],
    ['TOP SPEED', `${stats.topKmh} km/h`],
    ['SECTORS', `${stats.checkpoints}`],
  ];
  return (
    <Backdrop className="items-start">
      <div className="carbon my-auto w-full max-w-2xl animate-slide-up rounded-2xl border border-white/10 shadow-2xl">
        {/* header */}
        <div className="relative overflow-hidden rounded-t-2xl border-b border-white/10 px-5 pb-4 pt-5 sm:px-7">
          <div className="checkered absolute inset-x-0 top-0 h-1.5 opacity-80" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">TIME'S UP</div>
              <h2 className={cn('font-display text-3xl italic leading-none tracking-tight sm:text-4xl', rank === 1 ? 'text-gold text-glow-gold' : 'text-white')}>
                {headline}
              </h2>
              <div className="mt-1 text-xs text-white/60">
                {driver.name} · <span style={{ color }}>{driver.team}</span>
              </div>
            </div>
            <CarPreview livery={driver.livery} className="hidden w-32 drop-shadow-[0_8px_10px_rgba(0,0,0,0.6)] sm:block" />
          </div>
          <div className="mt-4 flex items-end gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">Final score</div>
              <div className="font-display text-5xl leading-none text-white sm:text-6xl">{fmt(shown)}</div>
            </div>
            {rank > 0 && (
              <span className="mb-1 animate-pop rounded-md bg-gold px-2 py-1 font-display text-xs text-black [animation-delay:900ms]">TOP {rank}</span>
            )}
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-px bg-white/10 sm:grid-cols-6">
          {items.map(([k, v]) => (
            <div key={k} className="bg-carbon/95 px-3 py-3 text-center">
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">{k}</div>
              <div className="font-display text-base text-white sm:text-lg">{v}</div>
            </div>
          ))}
        </div>

        {/* actions */}
        <div className="flex flex-col items-center gap-3 px-5 py-5 sm:flex-row sm:justify-center sm:px-7">
          <PrimaryButton onClick={onRestart} className="animate-pulse-glow w-full sm:w-auto">
            RACE AGAIN {isTouch ? '' : '(ENTER)'}
          </PrimaryButton>
          <GhostButton onClick={onMenu} className="w-full sm:w-auto">
            CHANGE DRIVER
          </GhostButton>
        </div>

        <div className="px-5 pb-5 sm:px-7">
          <HighScoreTable scores={scores} highlightId={newEntryId} limit={5} />
        </div>
      </div>
    </Backdrop>
  );
}
