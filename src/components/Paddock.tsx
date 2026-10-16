import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { DRIVERS, TEAMS, driverById, driverColor, inkOn, teamOf, type Driver, type SkillRatings, type Team } from '@/game/drivers';
import { CIRCUITS, type CircuitDef } from '@/game/circuits';
import { lapsFor } from '@/game/championship';
import { PALETTES } from '@/game/themes';
import CarPreview from './CarPreview';
import CircuitMap from './CircuitMap';
import { Icon, RaceButton, SoundButton, StatMeter } from './ui';
import { useHotkeys } from './hooks';
import { cn } from '@/utils/cn';

interface Props {
  onBack: () => void;
  /** Starts a timed solo session on a circuit. */
  onTestDrive?: (circuitId: string) => void;
  initialTab?: Tab;
  muted: boolean;
  onToggleMute: () => void;
}

export type Tab = 'teams' | 'drivers' | 'circuits';
type SortKey = 'rating' | keyof SkillRatings;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rating', label: 'Overall' },
  { key: 'pace', label: 'Pace' },
  { key: 'racecraft', label: 'Racecraft' },
  { key: 'consistency', label: 'Consistency' },
];

function Rating({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-8 min-w-[2.75rem] flex-col items-center justify-center rounded-md px-1.5 leading-none', className)}
      style={{ background: color ?? 'rgba(255,255,255,0.1)', color: color ? inkOn(color) : '#fff' }}
      title="Overall rating"
    >
      <span className="text-[7px] font-black tracking-[0.2em] opacity-70">OVR</span>
      <span className="font-display text-sm">{value}</span>
    </span>
  );
}

function TeamCard({ team, rank }: { team: Team; rank: number }) {
  const c = driverColor(team);
  const seats = team.driverIds.map((id) => driverById(id)!);
  return (
    <article className="glass relative isolate overflow-hidden rounded-2xl" style={{ '--team': c } as CSSProperties}>
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: c }} />
      <div aria-hidden className="absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-team/20 blur-3xl" />
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">
            P{rank} car · {team.base}, {team.country}
          </div>
          <h3 className="mt-1 truncate font-display text-xl italic tracking-tight">{team.name}</h3>
        </div>
        <Rating value={team.rating} color={c} />
      </div>
      <div className="relative mx-auto w-[64%] max-w-[260px] py-2">
        <div className="stage-floor" />
        <CarPreview livery={team.livery} res={720} className="relative h-auto w-full drop-shadow-[0_10px_10px_rgba(0,0,0,0.55)]" />
      </div>
      <div className="grid gap-1.5 px-5">
        <StatMeter label="Power" value={team.car.power} color={c} />
        <StatMeter label="Acceleration" value={team.car.accel} color={c} />
        <StatMeter label="Handling" value={team.car.handling} color={c} />
      </div>
      <ul className="mt-4 border-t border-white/[0.07]">
        {seats.map((d) => (
          <li key={d.id} className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-2.5 last:border-b-0">
            <span className="w-8 font-display text-lg italic" style={{ color: c }}>
              {d.number}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-bold">{d.name}</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-white/45">
                {d.short} · {d.country}
              </div>
            </div>
            <Rating value={d.rating} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function SkillCell({ value }: { value: number }) {
  // colour the number by how it sits in the field: elite / strong / solid
  return <span className={cn('font-display tabular-nums', value >= 90 ? 'text-gold' : value >= 85 ? 'text-white' : 'text-white/60')}>{value}</span>;
}

function DriverRow({ d, rank, sort }: { d: Driver; rank: number; sort: SortKey }) {
  const c = driverColor(d);
  const t = teamOf(d);
  const head = (k: SortKey) => cn('hidden text-center sm:block', sort === k && 'rounded bg-white/[0.06]');
  return (
    <li className="grid grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-white/[0.06] px-3 py-2 first:border-t-0 sm:grid-cols-[2rem_2.75rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_3.25rem] sm:gap-3 sm:px-4">
      <span className="text-center font-display text-xs text-white/40">{rank}</span>
      <span className="font-display text-lg italic" style={{ color: c }}>
        {d.number}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ background: c }} />
          <span className="truncate">{d.name}</span>
        </div>
        <div className="truncate pl-3 text-[10px] uppercase tracking-wider text-white/45">
          {t.name} · {d.country}
          <span className="sm:hidden">
            {' '}
            · P{d.skill.pace} R{d.skill.racecraft} C{d.skill.consistency}
          </span>
        </div>
      </div>
      <span className={head('pace')}>
        <SkillCell value={d.skill.pace} />
      </span>
      <span className={head('racecraft')}>
        <SkillCell value={d.skill.racecraft} />
      </span>
      <span className={head('consistency')}>
        <SkillCell value={d.skill.consistency} />
      </span>
      <span className="justify-self-end">
        <Rating value={d.rating} color={sort === 'rating' && rank <= 3 ? c : undefined} />
      </span>
    </li>
  );
}

function CircuitCard({ c, onTestDrive }: { c: CircuitDef; onTestDrive?: (id: string) => void }) {
  const sky = PALETTES[c.palette]?.sky ?? [];
  const bg = `linear-gradient(180deg, ${sky.map(([t, col]) => `${col} ${Math.round(t * 100)}%`).join(', ')})`;
  return (
    <article className="glass flex flex-col overflow-hidden rounded-2xl">
      <div className="relative h-44 overflow-hidden" style={{ background: bg }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/10" />
        <CircuitMap circuit={c} className="absolute inset-x-6 inset-y-4 h-[calc(100%-2rem)] w-[calc(100%-3rem)] text-white" />
        <span className="absolute left-4 top-3 rounded-md bg-black/50 px-2 py-1 font-display text-[10px] tracking-[0.2em] text-white/80">ROUND {c.round}</span>
        {c.walls && <span className="absolute right-4 top-3 rounded-md bg-f1red/90 px-2 py-1 font-display text-[10px] tracking-[0.2em]">STREET</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">
          {c.city}, {c.country}
        </div>
        <h3 className="mt-1 font-display text-xl italic tracking-tight">{c.gp}</h3>
        <div className="text-xs font-semibold text-white/60">{c.circuit}</div>
        <p className="mt-2 text-sm leading-relaxed text-white/65">{c.description}</p>
        <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-center">
          {[
            ['Length', `${c.lengthKm.toFixed(2)} km`],
            ['Corners', String(c.turns)],
            ['Race laps', String(lapsFor(c, 'medium'))],
          ].map(([k, v]) => (
            <div key={k} className="bg-carbon/95 px-2 py-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">{k}</dt>
              <dd className="font-display text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        {onTestDrive && (
          <RaceButton variant="ghost" icon={<Icon.Play />} onClick={() => onTestDrive(c.id)} className="mt-4 w-full">
            Test drive
          </RaceButton>
        )}
      </div>
    </article>
  );
}

export default function Paddock({ onBack, onTestDrive, initialTab = 'teams', muted, onToggleMute }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<SortKey>('rating');
  useHotkeys({ Escape: onBack, KeyM: onToggleMute });

  const teams = useMemo(() => [...TEAMS].sort((a, b) => b.rating - a.rating), []);
  const drivers = useMemo(() => {
    const val = (d: Driver) => (sort === 'rating' ? d.rating : d.skill[sort]);
    return [...DRIVERS].sort((a, b) => val(b) - val(a) || b.rating - a.rating);
  }, [sort]);

  const tabs: { id: Tab; label: string; count: number; icon: ReactNode }[] = [
    { id: 'teams', label: 'Constructors', count: TEAMS.length, icon: <Icon.Garage /> },
    { id: 'drivers', label: 'Drivers', count: DRIVERS.length, icon: <Icon.Helmet /> },
    { id: 'circuits', label: 'Circuits', count: CIRCUITS.length, icon: <Icon.Flag /> },
  ];

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overflow-x-hidden animate-fade-in" style={{ touchAction: 'pan-y' }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-night/70 via-night/85 to-night/95" />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pt-7">
        <header className="flex animate-slide-up items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to main menu"
              title="Back (Esc)"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45 text-lg text-white/80 transition hover:border-white/35 hover:bg-white/10 hover:text-white"
            >
              <Icon.Back />
            </button>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">Paddock</div>
              <h1 className="truncate font-display text-2xl italic tracking-tight sm:text-4xl">Drivers &amp; teams</h1>
            </div>
          </div>
          <SoundButton muted={muted} onToggle={onToggleMute} />
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Paddock" className="glass inline-flex gap-1 rounded-xl p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2.5 font-display text-[11px] uppercase tracking-[0.16em] transition',
                  tab === t.id ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/80',
                )}
              >
                <span className="text-sm">{t.icon}</span>
                {t.label}
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tracking-normal text-white/60">{t.count}</span>
              </button>
            ))}
          </div>
          {tab === 'drivers' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sort === s.key}
                  onClick={() => setSort(s.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] transition',
                    sort === s.key ? 'border-white/60 bg-white/[0.12] text-white' : 'border-white/10 text-white/50 hover:text-white/80',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'circuits' ? (
          <div key="circuits" className="mt-5 grid animate-fade-in gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...CIRCUITS].sort((a, b) => a.round - b.round).map((c) => (
              <CircuitCard key={c.id} c={c} onTestDrive={onTestDrive} />
            ))}
          </div>
        ) : tab === 'teams' ? (
          <div key="teams" className="mt-5 grid animate-fade-in gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((t, i) => (
              <TeamCard key={t.id} team={t} rank={i + 1} />
            ))}
          </div>
        ) : (
          <div key="drivers" className="glass mt-5 animate-fade-in overflow-hidden rounded-2xl">
            <div className="hidden grid-cols-[2rem_2.75rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_3.25rem] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 sm:grid">
              <span className="text-center">#</span>
              <span>No.</span>
              <span>Driver</span>
              <span className="text-center">Pace</span>
              <span className="text-center">Racecraft</span>
              <span className="text-center">Consist.</span>
              <span className="text-right">OVR</span>
            </div>
            <ol>
              {drivers.map((d, i) => (
                <DriverRow key={d.id} d={d} rank={i + 1} sort={sort} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
