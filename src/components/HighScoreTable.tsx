import type { ScoreEntry } from '@/game/highscores';
import { DRIVERS } from '@/game/drivers';
import { cn } from '@/utils/cn';

interface Props {
  scores: ScoreEntry[];
  highlightId?: string;
  limit?: number;
  className?: string;
}

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

export default function HighScoreTable({ scores, highlightId, limit = 10, className }: Props) {
  const rows = scores.slice(0, limit);
  return (
    <div className={cn('overflow-hidden rounded-xl border border-white/10 bg-black/40', className)}>
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="font-display text-xs tracking-[0.25em] text-white/80">LEADERBOARD</span>
        <span className="text-[10px] uppercase tracking-widest text-white/40">local · top {limit}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-white/50">
          No times set yet.
          <br />
          <span className="text-white/70">Be the first on the board.</span>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-white/40">
              <th className="px-3 py-1.5 font-semibold">Pos</th>
              <th className="px-2 py-1.5 font-semibold">Driver</th>
              <th className="px-2 py-1.5 text-right font-semibold">Score</th>
              <th className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell">km</th>
              <th className="hidden px-3 py-1.5 text-right font-semibold sm:table-cell">Passes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const d = DRIVERS.find((x) => x.id === e.driverId);
              const color = d?.livery.primary ?? '#888';
              const hl = e.id === highlightId;
              return (
                <tr
                  key={e.id}
                  className={cn(
                    'border-t border-white/5 transition-colors',
                    hl ? 'bg-gold/15 text-gold' : i === 0 ? 'text-white' : 'text-white/80',
                  )}
                >
                  <td className="px-3 py-1.5 font-display text-xs">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-md',
                        i === 0 ? 'bg-gold text-black' : i === 1 ? 'bg-white/80 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-white/10',
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-1.5 rounded-sm" style={{ background: color }} />
                      <div className="leading-tight">
                        <div className="font-semibold">{e.driver}</div>
                        <div className="text-[10px] uppercase tracking-wider text-white/40">{e.team}</div>
                      </div>
                      {hl && <span className="ml-1 rounded bg-gold px-1.5 py-0.5 text-[9px] font-bold text-black">NEW</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-display text-sm">{fmt(e.score)}</td>
                  <td className="hidden px-2 py-1.5 text-right text-white/60 sm:table-cell">{e.distanceKm.toFixed(1)}</td>
                  <td className="hidden px-3 py-1.5 text-right text-white/60 sm:table-cell">{e.overtakes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
