import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { HudSnapshot, RunStats } from '@/game/engine';
import { driverColor, type Driver } from '@/game/drivers';
import type { ScoreEntry } from '@/game/highscores';
import HighScoreTable from './HighScoreTable';
import CarPreview from './CarPreview';
import { Icon, Kbd, RaceButton, SoundButton, fmt } from './ui';
import { cn } from '@/utils/cn';

function Backdrop({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cn(
        'absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(7,6,31,0.55),rgba(7,6,31,0.92))] p-4 animate-fade-in',
        className,
      )}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}

function DriverLine({ driver }: { driver: Driver }) {
  return (
    <div className="mt-2 truncate text-xs text-white/55">
      #{driver.number} {driver.name} · <span className="text-team-soft">{driver.team}</span>
    </div>
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
  driver: Driver;
  run: HudSnapshot | null;
}

function RunStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-carbon/95 px-3 py-2.5 text-center">
      <dt className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/45">{label}</dt>
      <dd className={cn('mt-0.5 font-display text-lg tabular-nums text-white', className)}>{value}</dd>
    </div>
  );
}

export function PauseOverlay({ onResume, onRestart, onQuit, muted, onToggleMute, isTouch, driver, run }: PauseProps) {
  const titleId = useId();
  return (
    <Backdrop labelledBy={titleId}>
      <div className="glass w-full max-w-md animate-pop overflow-hidden rounded-3xl" style={{ '--team': driverColor(driver) } as CSSProperties}>
        <div className="stripes-red h-1.5" />
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">
                <span className="h-2 w-2 animate-pulse rounded-full bg-f1red" />
                Red flag
              </div>
              <h2 id={titleId} className="mt-1 font-display text-4xl italic tracking-tight sm:text-5xl">
                PAUSED
              </h2>
              <DriverLine driver={driver} />
            </div>
            <SoundButton muted={muted} onToggle={onToggleMute} />
          </div>

          {run && (
            <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
              <RunStat label="Score" value={fmt(run.score)} />
              <RunStat label="Time left" value={`${run.timeLeft.toFixed(1)}s`} className={run.timeLeft < 10 ? 'text-red-400' : undefined} />
              <RunStat label="Sector" value={String(run.sector)} />
            </dl>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <RaceButton icon={<Icon.Play />} hint={!isTouch && <Kbd>P</Kbd>} onClick={onResume} className="w-full py-3.5">
              Resume
            </RaceButton>
            <RaceButton variant="ghost" icon={<Icon.Restart />} hint={!isTouch && <Kbd>R</Kbd>} onClick={onRestart} className="w-full">
              Restart
            </RaceButton>
            <RaceButton variant="ghost" icon={<Icon.Exit />} onClick={onQuit} className="w-full">
              Quit to pit lane
            </RaceButton>
          </div>

          {!isTouch && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-[11px] text-white/45">
              <span className="flex items-center gap-1">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> steer
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↓</Kbd> brake
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Space</Kbd> boost
              </span>
              <span className="flex items-center gap-1">
                <Kbd>M</Kbd> mute
              </span>
            </div>
          )}
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
  /** Best score on the board before this run (0 if the board was empty). */
  prevBest: number;
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

function BestDelta({ score, prevBest }: { score: number; prevBest: number }) {
  const diff = score - prevBest;
  if (prevBest <= 0) return <p className="mt-2 text-sm text-white/60">First score on the board — now go and beat it.</p>;
  if (diff > 0)
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
        <span aria-hidden>▲</span> {fmt(diff)} over the previous record
      </p>
    );
  if (diff === 0) return <p className="mt-2 text-sm font-semibold text-gold">Matched the track record!</p>;
  return (
    <p className="mt-2 text-sm text-white/55">
      <span className="font-semibold text-white/85">{fmt(-diff)}</span> short of the record ({fmt(prevBest)})
    </p>
  );
}

export function GameOverOverlay({ stats, driver, rank, prevBest, scores, newEntryId, onRestart, onMenu, isTouch }: GameOverProps) {
  const titleId = useId();
  const shown = useCountUp(stats.score);
  const record = rank === 1;
  const headline = record ? 'NEW TRACK RECORD!' : rank > 0 ? `P${rank} ON THE BOARD` : 'CHEQUERED FLAG';
  const items: { label: string; value: string; icon: ReactNode }[] = [
    { label: 'Distance', value: `${stats.distanceKm.toFixed(2)} km`, icon: <Icon.Road /> },
    { label: 'Overtakes', value: `${stats.overtakes}`, icon: <Icon.Overtake /> },
    { label: 'Close calls', value: `${stats.nearMisses}`, icon: <Icon.Spark /> },
    { label: 'Max combo', value: stats.maxCombo > 0 ? `×${stats.maxCombo}` : '—', icon: <Icon.Combo /> },
    { label: 'Top speed', value: `${stats.topKmh} km/h`, icon: <Icon.Gauge /> },
    { label: 'Sectors', value: `${stats.checkpoints}`, icon: <Icon.Gate /> },
  ];

  return (
    <Backdrop className="items-start" labelledBy={titleId}>
      <div className="glass my-auto w-full max-w-3xl animate-slide-up overflow-hidden rounded-3xl" style={{ '--team': driverColor(driver) } as CSSProperties}>
        <div className="checkered-sm h-2.5 opacity-80" />

        <div className="relative isolate overflow-hidden px-5 pb-5 pt-5 sm:px-8 sm:pt-7">
          <div aria-hidden className="absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-team/20 blur-3xl" />
          <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">
                <Icon.Flag className="text-sm" />
                Time's up
              </div>
              <h2
                id={titleId}
                className={cn('mt-1.5 font-display text-3xl italic leading-[0.95] tracking-tight sm:text-5xl', record ? 'text-gold text-glow-gold' : 'text-white')}
              >
                {headline}
              </h2>
              <DriverLine driver={driver} />

              <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">Final score</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="font-display text-6xl leading-none tabular-nums sm:text-7xl">{fmt(shown)}</div>
                {rank > 1 && <span className="animate-pop rounded-md bg-white/90 px-2 py-1 font-display text-xs text-black [animation-delay:900ms]">P{rank}</span>}
              </div>
              <BestDelta score={stats.score} prevBest={prevBest} />
            </div>
            <div className="relative hidden w-44 sm:block md:w-52">
              <div className="stage-floor" />
              <CarPreview livery={driver.livery} res={720} className="relative h-auto w-full drop-shadow-[0_10px_12px_rgba(0,0,0,0.6)]" />
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-px border-y border-white/10 bg-white/10 sm:grid-cols-6">
          {items.map((it) => (
            <div key={it.label} className="bg-carbon/95 px-2 py-3 text-center">
              <dt className="flex flex-col items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">
                <span className="text-base text-white/30">{it.icon}</span>
                {it.label}
              </dt>
              <dd className="mt-0.5 font-display text-base tabular-nums text-white sm:text-lg">{it.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col items-stretch gap-3 px-5 py-5 sm:flex-row sm:justify-center sm:px-8">
          <div className="cta-glow sm:min-w-[270px]">
            <RaceButton icon={<Icon.Restart />} hint={!isTouch && <Kbd>Enter</Kbd>} onClick={onRestart} className="w-full py-3.5">
              Race again
            </RaceButton>
          </div>
          <RaceButton variant="ghost" icon={<Icon.Exit />} hint={!isTouch && <Kbd>Esc</Kbd>} onClick={onMenu}>
            Change driver
          </RaceButton>
        </div>

        <div className="px-5 pb-6 sm:px-8">
          <HighScoreTable scores={scores} highlightId={newEntryId} limit={5} />
        </div>
      </div>
    </Backdrop>
  );
}
