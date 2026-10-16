import type { CSSProperties } from 'react';
import { TEAMS, driverById, driverColor, type Driver } from '@/game/drivers';
import CarPreview from './CarPreview';
import { cn } from '@/utils/cn';

interface Props {
  selectedId: string;
  onSelect: (d: Driver) => void;
  /** Hide the per-team car art (dense layouts). */
  hideCars?: boolean;
  className?: string;
}

/** The 20-car grid, grouped by team: one cell per constructor with its two seats. */
export default function DriverPicker({ selectedId, onSelect, hideCars, className }: Props) {
  return (
    <div className={cn('grid grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-2.5', className)}>
      {TEAMS.map((team) => {
        const c = driverColor(team);
        const seats = team.driverIds.map((id) => driverById(id)!);
        const teamSelected = seats.some((d) => d.id === selectedId);
        return (
          <div
            key={team.id}
            className={cn(
              'relative min-w-0 overflow-hidden rounded-xl border px-1.5 pb-1.5 pt-2.5 transition duration-200',
              teamSelected ? 'border-white/45 bg-white/[0.08] shadow-[0_0_26px_-10px_var(--c)]' : 'border-white/[0.08] bg-black/35',
            )}
            style={{ '--c': c } as CSSProperties}
          >
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: c, opacity: teamSelected ? 1 : 0.6 }} />
            <div className="truncate px-1 font-display text-[10px] uppercase tracking-[0.16em] text-white/65" title={team.name}>
              {team.name}
            </div>
            {!hideCars && <CarPreview livery={team.livery} className={cn('mx-auto mt-1 hidden h-auto w-[78%] sm:block', !teamSelected && 'opacity-80')} />}
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {seats.map((d) => {
                const sel = d.id === selectedId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-driver
                    aria-pressed={sel}
                    aria-label={`${d.name}, ${d.team}`}
                    title={d.name}
                    onClick={() => onSelect(d)}
                    className={cn(
                      'flex min-w-0 flex-col items-center rounded-lg border px-1 py-1.5 leading-none transition',
                      sel ? 'border-white/80 bg-white/[0.16]' : 'border-transparent bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]',
                    )}
                  >
                    <span className="font-display text-base italic" style={{ color: c }}>
                      {d.number}
                    </span>
                    <span className={cn('mt-1 text-[10px] font-bold tracking-[0.16em]', sel ? 'text-white' : 'text-white/60')}>{d.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
