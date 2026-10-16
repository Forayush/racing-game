import { useEffect, useState } from 'react';
import type { ScoreEntry } from '@/game/highscores';
import { DRIVERS, driverColor } from '@/game/drivers';
import { Icon, fmt } from './ui';
import { cn } from '@/utils/cn';

interface Props {
  scores: ScoreEntry[];
  highlightId?: string;
  limit?: number;
  className?: string;
  /** Drop the outer frame and title bar (when embedded in a tab panel). */
  bare?: boolean;
  /** Shows a two-step "clear board" control in the footer. */
  onClear?: () => void;
}

const MEDALS = ['bg-gold text-black', 'bg-zinc-200 text-black', 'bg-amber-700 text-white'];

export default function HighScoreTable({ scores, highlightId, limit = 10, className, bare, onClear }: Props) {
  const rows = scores.slice(0, limit);
  const [confirming, setConfirming] = useState(false);

  // the confirm state times out so a stray tap later can't wipe the board
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  return (
    <div className={cn(!bare && 'overflow-hidden rounded-2xl border border-white/10 bg-black/45', className)}>
      {!bare && (
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
          <span className="flex items-center gap-2 font-display text-xs tracking-[0.25em] text-white/85">
            <Icon.Trophy className="text-sm text-gold" />
            LEADERBOARD
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Local · top {limit}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <Icon.Flag className="mb-3 text-3xl text-white/25" />
          <div className="font-display text-sm tracking-[0.15em] text-white/75">NO TIMES SET YET</div>
          <p className="mt-1 text-xs text-white/45">Finish a run to put the first score on the board.</p>
        </div>
      ) : (
        <ol>
          {rows.map((e, i) => {
            const d = DRIVERS.find((x) => x.id === e.driverId);
            const color = d ? driverColor(d) : '#888888';
            const hl = e.id === highlightId;
            return (
              <li
                key={e.id}
                className={cn(
                  'flex items-center gap-3 border-t border-white/[0.06] px-3 py-2 first:border-t-0 sm:px-4',
                  hl ? 'bg-gold/[0.13]' : i === 0 && 'bg-white/[0.03]',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-xs',
                    MEDALS[i] ?? 'bg-white/[0.08] text-white/70',
                  )}
                >
                  {i + 1}
                </span>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className={cn('flex items-center gap-2 text-sm font-bold', hl ? 'text-gold' : 'text-white')}>
                    <span className="truncate">{e.driver}</span>
                    {hl && <span className="shrink-0 rounded bg-gold px-1.5 py-px text-[9px] font-black tracking-wider text-black">NEW</span>}
                  </div>
                  <div className="truncate text-[10px] uppercase tracking-wider text-white/40">
                    {e.team}
                    <span className="hidden sm:inline">
                      {' '}
                      · {e.distanceKm.toFixed(1)} km · {e.overtakes} {e.overtakes === 1 ? 'pass' : 'passes'}
                    </span>
                  </div>
                </div>
                <div className={cn('font-display text-base tabular-nums', hl ? 'text-gold' : 'text-white')}>{fmt(e.score)}</div>
              </li>
            );
          })}
        </ol>
      )}

      {onClear && (
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5">
          <span className="text-[10px] uppercase tracking-widest text-white/30">Saved on this device</span>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!confirming) return setConfirming(true);
                setConfirming(false);
                onClear();
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] transition',
                confirming ? 'bg-f1red/25 text-red-200' : 'text-white/35 hover:bg-white/5 hover:text-white/75',
              )}
            >
              <Icon.Trash className="text-xs" />
              {confirming ? 'Tap again to clear' : 'Clear board'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
