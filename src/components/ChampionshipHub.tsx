import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { driverById, driverColor, teamById, teamOf } from '@/game/drivers';
import { circuitById } from '@/game/circuits';
import { constructorStandings, currentCircuit, driverStandings, isComplete, lapsFor, RACE_LENGTHS, type Championship } from '@/game/championship';
import { DIFFICULTIES } from '@/game/racePhysics';
import { fmtLap } from '@/game/race';
import CarPreview from './CarPreview';
import CircuitMap from './CircuitMap';
import { Icon, Kbd, RaceButton, SoundButton } from './ui';
import { useHotkeys } from './hooks';
import { cn } from '@/utils/cn';

interface Props {
  champ: Championship;
  onStartQualifying: () => void;
  onSkipQualifying: () => void;
  onStartRace: () => void;
  onNewSeason: () => void;
  onAbandon: () => void;
  onBack: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-carbon/95 px-1.5 py-2 text-center sm:px-3">
      <dt className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">{k}</dt>
      <dd className="whitespace-nowrap font-display text-[13px] sm:text-sm">{v}</dd>
    </div>
  );
}

function Standings({ champ }: { champ: Championship }) {
  const [tab, setTab] = useState<'drivers' | 'teams'>('drivers');
  const drivers = useMemo(() => driverStandings(champ), [champ]);
  const teams = useMemo(() => constructorStandings(champ), [champ]);
  const myTeam = teamOf(driverById(champ.playerId)!).id;
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div role="tablist" aria-label="Standings" className="grid grid-cols-2 gap-1 border-b border-white/10 p-1.5">
        {(
          [
            ['drivers', 'Drivers'],
            ['teams', 'Constructors'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn('rounded-lg px-3 py-2.5 font-display text-[11px] uppercase tracking-[0.16em] transition', tab === id ? 'bg-white/[0.1] text-white' : 'text-white/45 hover:text-white/80')}
          >
            {label}
          </button>
        ))}
      </div>
      <ol className="max-h-[32rem] overflow-y-auto">
        {tab === 'drivers'
          ? drivers.map((s, i) => {
              const d = driverById(s.driverId)!;
              const me = d.id === champ.playerId;
              return (
                <li key={d.id} className={cn('flex items-center gap-3 border-t border-white/[0.05] px-4 py-2 first:border-t-0', me && 'bg-gold/[0.12]')}>
                  <span className={cn('w-6 text-center font-display text-xs', i === 0 ? 'text-gold' : 'text-white/55')}>{i + 1}</span>
                  <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: driverColor(d) }} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className={cn('truncate text-sm font-bold', me && 'text-gold')}>{d.name}</div>
                    <div className="truncate text-[10px] uppercase tracking-wider text-white/40">
                      {d.team}
                      {s.wins > 0 && ` · ${s.wins} win${s.wins > 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <span className="font-display text-sm tabular-nums">{s.points}</span>
                </li>
              );
            })
          : teams.map((s, i) => {
              const t = teamById(s.teamId)!;
              const mine = t.id === myTeam;
              return (
                <li key={t.id} className={cn('flex items-center gap-3 border-t border-white/[0.05] px-4 py-2 first:border-t-0', mine && 'bg-gold/[0.12]')}>
                  <span className={cn('w-6 text-center font-display text-xs', i === 0 ? 'text-gold' : 'text-white/55')}>{i + 1}</span>
                  <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: driverColor(t) }} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className={cn('truncate text-sm font-bold', mine && 'text-gold')}>{t.name}</div>
                    <div className="truncate text-[10px] uppercase tracking-wider text-white/40">
                      {t.driverIds.map((id) => driverById(id)!.short).join(' · ')}
                    </div>
                  </div>
                  <span className="font-display text-sm tabular-nums">{s.points}</span>
                </li>
              );
            })}
      </ol>
    </div>
  );
}

function Calendar({ champ }: { champ: Championship }) {
  const next = champ.results.length;
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <h3 className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-display text-xs tracking-[0.25em] text-white/70">
        <Icon.Calendar className="text-sm text-team-soft" /> CALENDAR
      </h3>
      <ol>
        {champ.calendar.map((id, i) => {
          const c = circuitById(id)!;
          const res = champ.results[i];
          const winner = res ? driverById(res.race[0]?.driverId) : null;
          const myIdx = res ? res.race.findIndex((e) => e.driverId === champ.playerId) : -1;
          const mine = res ? res.race[myIdx] : null;
          return (
            <li key={id} className={cn('flex items-center gap-3 border-t border-white/[0.05] px-4 py-2.5 first:border-t-0', i === next && 'bg-white/[0.06]')}>
              <span className={cn('w-6 text-center font-display text-xs', i === next ? 'text-f1red' : 'text-white/45')}>{i + 1}</span>
              <CircuitMap circuit={c} showStart={false} className={cn('h-8 w-8 shrink-0', res ? 'text-white/45' : 'text-white/80')} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className={cn('truncate text-sm font-bold', !res && i !== next && 'text-white/70')}>{c.gp}</div>
                <div className="truncate text-[10px] uppercase tracking-wider text-white/40">{res && winner ? `Won by ${winner.name}` : i === next ? 'Next up' : c.circuit}</div>
              </div>
              {res && <span className={cn('font-display text-xs', mine?.time === null ? 'text-red-300' : myIdx === 0 ? 'text-gold' : 'text-white/75')}>{mine?.time === null ? 'DNF' : `P${myIdx + 1}`}</span>}
              {!res && i === next && <Icon.Play className="text-f1red" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function ChampionshipHub(props: Props) {
  const { champ, onStartQualifying, onSkipQualifying, onStartRace, onNewSeason, onAbandon, onBack, muted, onToggleMute, isTouch } = props;
  const me = driverById(champ.playerId)!;
  const team = teamOf(me);
  const color = driverColor(me);
  const circuit = currentCircuit(champ);
  const done = isComplete(champ);
  const standings = useMemo(() => driverStandings(champ), [champ]);
  const myPos = standings.findIndex((s) => s.driverId === me.id) + 1;
  const myPts = standings[myPos - 1]?.points ?? 0;
  const gridPos = champ.grid ? champ.grid.findIndex((g) => g.driverId === me.id) + 1 : 0;
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirm]);

  const primary = done ? onNewSeason : champ.grid ? onStartRace : onStartQualifying;
  useHotkeys({ Escape: onBack, Enter: primary, KeyM: onToggleMute });

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overflow-x-hidden animate-fade-in" style={{ '--team': color, touchAction: 'pan-y' } as CSSProperties}>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-night/45 via-night/80 to-night/95" />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pt-7">
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
              <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">
                <span className="hidden sm:inline">Championship · </span>
                {done ? 'season complete' : `round ${champ.results.length + 1} of ${champ.calendar.length}`}
              </div>
              <h1 className="truncate font-display text-2xl italic tracking-tight sm:text-4xl">Season 2026</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="glass hidden items-center gap-3 rounded-full py-1.5 pl-2 pr-4 sm:flex">
              <CarPreview livery={me.livery} className="h-7 w-auto" />
              <div className="leading-tight">
                <div className="text-xs font-bold">{me.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/45">
                  {ord(myPos)} · {myPts} pts
                </div>
              </div>
            </div>
            <SoundButton muted={muted} onToggle={onToggleMute} />
          </div>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            {!done && circuit ? (
              <section className="glass relative isolate animate-slide-up overflow-hidden rounded-3xl">
                <div aria-hidden className="absolute -right-24 -top-28 -z-10 h-96 w-96 rounded-full bg-team/20 blur-3xl" />
                <div className="grid gap-4 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">
                      Round {champ.results.length + 1} · {circuit.city}, {circuit.country}
                    </div>
                    <h2 className="mt-1.5 font-display text-3xl italic leading-[0.95] tracking-tight sm:text-5xl">{circuit.gp}</h2>
                    <div className="mt-1 text-sm font-semibold text-team-soft">{circuit.circuit}</div>
                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/65">{circuit.description}</p>
                    <dl className="mt-4 grid max-w-md grid-cols-4 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
                      <Fact k="Length" v={`${circuit.lengthKm.toFixed(2)} km`} />
                      <Fact k="Corners" v={String(circuit.turns)} />
                      <Fact k="Laps" v={String(lapsFor(circuit, champ.raceLength))} />
                      <Fact k="Type" v={circuit.walls ? 'Street' : 'Road'} />
                    </dl>

                    <ol className="mt-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]">
                      <li className={cn('flex items-center gap-2 rounded-full px-3 py-1.5', champ.grid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.1] text-white')}>
                        {champ.grid ? '✓' : '●'} Qualifying
                      </li>
                      <li className="h-px w-5 bg-white/20" />
                      <li className={cn('flex items-center gap-2 rounded-full px-3 py-1.5', champ.grid ? 'bg-white/[0.1] text-white' : 'text-white/40')}>● Race</li>
                    </ol>

                    {champ.grid ? (
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <div className="cta-glow">
                          <RaceButton size="lg" icon={<Icon.Flag />} onClick={onStartRace}>
                            Start race
                          </RaceButton>
                        </div>
                        <span className="text-sm text-white/60">
                          You start <b className="font-display text-white">P{gridPos}</b> · {lapsFor(circuit, champ.raceLength)} laps
                          {!isTouch && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-white/40">
                              <Kbd>Enter</Kbd>
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <div className="cta-glow">
                          <RaceButton size="lg" icon={<Icon.Stopwatch />} onClick={onStartQualifying}>
                            Qualifying
                          </RaceButton>
                        </div>
                        <RaceButton variant="ghost" onClick={onSkipQualifying}>
                          Skip · simulate
                        </RaceButton>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="relative rounded-2xl bg-black/30 p-4">
                      <CircuitMap circuit={circuit} className="mx-auto aspect-square w-full max-w-[280px] text-white" />
                    </div>
                    {champ.grid && (
                      <ol className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                        {champ.grid.slice(0, 6).map((g, i) => {
                          const d = driverById(g.driverId)!;
                          const mine = d.id === me.id;
                          return (
                            <li key={g.driverId} className={cn('flex items-center gap-2.5 border-t border-white/[0.05] px-3 py-1.5 text-sm first:border-t-0', mine && 'bg-gold/[0.12]')}>
                              <span className="w-5 font-display text-xs text-white/55">{i + 1}</span>
                              <span className="h-4 w-1 rounded-full" style={{ background: driverColor(d) }} />
                              <span className={cn('flex-1 truncate font-bold', mine && 'text-gold')}>{d.name}</span>
                              <span className="font-display text-xs tabular-nums text-white/60">{fmtLap(g.best)}</span>
                            </li>
                          );
                        })}
                        {gridPos > 6 && (
                          <li className="flex items-center gap-2.5 border-t border-white/[0.05] bg-gold/[0.12] px-3 py-1.5 text-sm">
                            <span className="w-5 font-display text-xs text-white/55">{gridPos}</span>
                            <span className="h-4 w-1 rounded-full" style={{ background: color }} />
                            <span className="flex-1 truncate font-bold text-gold">{me.name}</span>
                            <span className="font-display text-xs tabular-nums text-white/60">{fmtLap(champ.grid[gridPos - 1]?.best)}</span>
                          </li>
                        )}
                      </ol>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className="glass relative isolate animate-slide-up overflow-hidden rounded-3xl p-6 text-center sm:p-10">
                <div className="checkered-sm absolute inset-x-0 top-0 h-2.5 opacity-70" />
                <Icon.Trophy className="mx-auto text-7xl text-gold drop-shadow-[0_10px_24px_rgba(255,212,0,0.4)]" />
                <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">World champion</div>
                <h2 className={cn('mt-1 font-display text-4xl italic tracking-tight sm:text-6xl', myPos === 1 && 'text-gold text-glow-gold')}>
                  {driverById(standings[0].driverId)!.name}
                </h2>
                <p className="mt-2 text-sm text-white/65">
                  {myPos === 1 ? 'That’s you — champion of the world!' : `You finished ${ord(myPos)} with ${myPts} points.`} Constructors’ title:{' '}
                  <b className="text-white">{teamById(constructorStandings(champ)[0].teamId)!.name}</b>.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <div className="cta-glow">
                    <RaceButton icon={<Icon.Restart />} onClick={onNewSeason}>
                      New season
                    </RaceButton>
                  </div>
                  <RaceButton variant="ghost" icon={<Icon.Back />} onClick={onBack}>
                    Main menu
                  </RaceButton>
                </div>
              </section>
            )}
            <Calendar champ={champ} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Standings champ={champ} />
            <div className="glass rounded-2xl px-4 py-3 text-[11px] text-white/50">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {me.name} · {team.name}
                </span>
                <span className="text-white/25">|</span>
                <span>{DIFFICULTIES.find((d) => d.id === champ.difficulty)?.label} rivals</span>
                <span className="text-white/25">|</span>
                <span>{RACE_LENGTHS.find((r) => r.id === champ.raceLength)?.label} distance</span>
              </div>
              {!done && (
                <button
                  type="button"
                  onClick={() => (confirm ? onAbandon() : setConfirm(true))}
                  className={cn(
                    'mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] transition',
                    confirm ? 'bg-f1red/25 text-red-200' : 'text-white/35 hover:bg-white/5 hover:text-white/75',
                  )}
                >
                  <Icon.Trash className="text-xs" />
                  {confirm ? 'Tap again to abandon' : 'Abandon season'}
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
