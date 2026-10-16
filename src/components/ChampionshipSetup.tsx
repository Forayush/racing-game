import { useState, type CSSProperties, type ReactNode } from 'react';
import { DRIVERS, driverColor, inkOn, teamOf, type Driver } from '@/game/drivers';
import { circuitById } from '@/game/circuits';
import { RACE_LENGTHS, SEASONS, lapsFor, type RaceLength, type SeasonLength } from '@/game/championship';
import { DIFFICULTIES, type Difficulty } from '@/game/racePhysics';
import CarPreview from './CarPreview';
import CircuitMap from './CircuitMap';
import DriverPicker from './DriverPicker';
import { Icon, Kbd, RaceButton, SoundButton, StatMeter } from './ui';
import { useHotkeys } from './hooks';
import { cn } from '@/utils/cn';

interface Props {
  initialDriver: Driver;
  onCreate: (driverId: string, season: SeasonLength, raceLength: RaceLength, difficulty: Difficulty) => void;
  onBack: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; title: string; sub: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-xl border px-3 py-2.5 text-left transition',
            value === o.id ? 'border-white/70 bg-white/[0.12]' : 'border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/[0.05]',
          )}
        >
          <div className={cn('font-display text-sm tracking-wide', value === o.id ? 'text-white' : 'text-white/75')}>{o.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-white/50">{o.sub}</div>
        </button>
      ))}
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2.5 font-display text-xs tracking-[0.25em] text-white/70">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-f1red text-[11px] tracking-normal text-white">{step}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function ChampionshipSetup({ initialDriver, onCreate, onBack, muted, onToggleMute, isTouch }: Props) {
  const [driver, setDriver] = useState<Driver>(initialDriver);
  const [season, setSeason] = useState<SeasonLength>('standard');
  const [raceLength, setRaceLength] = useState<RaceLength>('short');
  const [difficulty, setDifficulty] = useState<Difficulty>('pro');
  const team = teamOf(driver);
  const color = driverColor(driver);
  const calendar = SEASONS.find((s) => s.id === season)!.calendar.map((id) => circuitById(id)!);
  const start = () => onCreate(driver.id, season, raceLength, difficulty);
  const idx = DRIVERS.indexOf(driver);
  useHotkeys({
    Escape: onBack,
    Enter: start,
    KeyM: onToggleMute,
    ArrowLeft: () => setDriver(DRIVERS[(idx - 1 + DRIVERS.length) % DRIVERS.length]),
    ArrowRight: () => setDriver(DRIVERS[(idx + 1) % DRIVERS.length]),
  });

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overflow-x-hidden animate-fade-in" style={{ '--team': color, touchAction: 'pan-y' } as CSSProperties}>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-night/70 via-night/85 to-night/95" />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pt-7 roomy:pb-10">
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
              <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">Championship</div>
              <h1 className="truncate font-display text-2xl italic tracking-tight sm:text-4xl">New season</h1>
            </div>
          </div>
          <SoundButton muted={muted} onToggle={onToggleMute} />
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6">
          <Section step={1} title="CHOOSE YOUR SEAT">
            <div className="glass relative isolate mb-4 grid items-center gap-4 overflow-hidden rounded-2xl p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] sm:p-5">
              <div aria-hidden className="absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-team/25 blur-3xl" />
              <div key={driver.id} className="min-w-0 animate-slide-up">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-white/55">
                  <span className="rounded-[4px] px-1.5 py-0.5 font-display text-xs tracking-normal" style={{ background: color, color: inkOn(color) }}>
                    #{driver.number}
                  </span>
                  {driver.country}
                  <span className="ml-auto rounded-md border border-white/15 bg-black/40 px-2 py-1 tracking-[0.2em]">
                    OVR <b className="font-display text-sm tracking-normal text-white">{driver.rating}</b>
                  </span>
                </div>
                <h2 className="mt-2 font-display text-3xl italic leading-none tracking-tight sm:text-4xl">{driver.name}</h2>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-team-soft">
                  {team.name} · car OVR {team.rating}
                </div>
                <div className="mt-4 grid gap-1.5">
                  <StatMeter label="Pace" value={driver.skill.pace} color={color} />
                  <StatMeter label="Racecraft" value={driver.skill.racecraft} color={color} />
                  <StatMeter label="Consistency" value={driver.skill.consistency} color={color} />
                </div>
              </div>
              <div className="relative">
                <div className="stage-floor" />
                <CarPreview key={driver.id} livery={driver.livery} res={720} className="relative h-auto w-full animate-car-in drop-shadow-[0_14px_14px_rgba(0,0,0,0.55)]" />
              </div>
            </div>
            <DriverPicker selectedId={driver.id} onSelect={setDriver} />
            {!isTouch && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/40">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> browse the grid · <Kbd>Enter</Kbd> start the season
              </p>
            )}
          </Section>

          <div className="flex flex-col gap-4">
            <Section step={2} title="SEASON LENGTH">
              <Segmented
                label="Season length"
                value={season}
                onChange={setSeason}
                options={SEASONS.map((s) => ({ id: s.id, title: s.label, sub: `${s.calendar.length} rounds` }))}
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {calendar.map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 py-1 pl-1 pr-2 text-[11px] text-white/70" title={c.circuit}>
                    <CircuitMap circuit={c} showStart={false} className="h-5 w-5 text-white/70" />
                    {c.country}
                  </span>
                ))}
              </div>
            </Section>
            <Section step={3} title="RACE DISTANCE">
              <Segmented
                label="Race distance"
                value={raceLength}
                onChange={setRaceLength}
                options={RACE_LENGTHS.map((r) => ({
                  id: r.id,
                  title: r.label,
                  sub: `≈${r.km} km · ${lapsFor(circuitById('riviera')!, r.id)} laps in Monaco`,
                }))}
              />
              <p className="mt-2 text-[11px] text-white/45">Lap counts follow each circuit’s length, like a real Grand Prix distance.</p>
            </Section>
            <Section step={4} title="RIVALS">
              <Segmented label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTIES.map((d) => ({ id: d.id, title: d.label, sub: d.blurb }))} />
            </Section>
            <div className="glass hidden rounded-2xl p-4 roomy:block">
              <div className="cta-glow">
                <RaceButton size="lg" icon={<Icon.Play />} onClick={start} className="w-full">
                  Start season
                </RaceButton>
              </div>
              <p className="mt-3 text-center text-[11px] text-white/45">
                {driver.name} · {team.name} · {calendar.length} rounds
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden bg-gradient-to-t from-night via-night/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 compact:block">
        <div className="cta-glow pointer-events-auto mx-auto max-w-md">
          <RaceButton size="lg" icon={<Icon.Play />} onClick={start} className="w-full">
            Start season
          </RaceButton>
        </div>
      </div>
    </div>
  );
}
