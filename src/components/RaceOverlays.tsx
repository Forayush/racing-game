import { useId, type CSSProperties, type ReactNode } from 'react';
import { driverById, driverColor, type Driver } from '@/game/drivers';
import type { CircuitDef } from '@/game/circuits';
import { fmtLap, type SessionInfo, type SessionResult } from '@/game/race';
import { POINTS } from '@/game/championship';
import CircuitMap from './CircuitMap';
import { Icon, Kbd, RaceButton, SoundButton } from './ui';
import { useHotkeys } from './hooks';
import { cn } from '@/utils/cn';

const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function Backdrop({ children, labelledBy, className }: { children: ReactNode; labelledBy: string; className?: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cn(
        'absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(7,6,31,0.6),rgba(7,6,31,0.93))] p-4 animate-fade-in sm:items-center',
        className,
      )}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}

function DriverCell({ d, me }: { d: Driver; me: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: driverColor(d) }} />
      <span className="w-7 shrink-0 font-display text-sm italic" style={{ color: driverColor(d) }}>
        {d.number}
      </span>
      <div className="min-w-0 leading-tight">
        <div className={cn('truncate text-sm font-bold', me && 'text-gold')}>{d.name}</div>
        <div className="truncate text-[10px] uppercase tracking-wider text-white/45">{d.team}</div>
      </div>
      {me && <span className="ml-1 shrink-0 rounded bg-gold px-1.5 py-px text-[9px] font-black tracking-wider text-black">YOU</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface PauseProps {
  info: SessionInfo;
  circuit: CircuitDef;
  driver: Driver;
  onResume: () => void;
  onRestart: () => void;
  onEnd: () => void;
  onQuit: () => void;
  quitLabel: string;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

export function RacePauseOverlay({ info, circuit, driver, onResume, onRestart, onEnd, onQuit, quitLabel, muted, onToggleMute, isTouch }: PauseProps) {
  const titleId = useId();
  const quali = info.kind === 'qualifying';
  return (
    <Backdrop labelledBy={titleId}>
      <div className="glass my-auto w-full max-w-md animate-pop overflow-hidden rounded-3xl" style={{ '--team': driverColor(driver) } as CSSProperties}>
        <div className="stripes-red h-1.5" />
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">
                <span className="h-2 w-2 animate-pulse rounded-full bg-f1red" />
                {quali ? 'Qualifying' : 'Race'} paused
              </div>
              <h2 id={titleId} className="mt-1 truncate font-display text-3xl italic tracking-tight sm:text-4xl">
                {circuit.gp.replace(' Grand Prix', ' GP')}
              </h2>
              <div className="mt-1 truncate text-xs text-white/55">{circuit.circuit}</div>
            </div>
            <SoundButton muted={muted} onToggle={onToggleMute} />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
            {[
              [quali ? 'Provisional' : 'Position', quali && info.best === null ? '—' : `P${info.position}`],
              [quali ? 'Lap' : 'Lap', info.outLap ? 'Out' : `${info.lap}/${info.laps}`],
              ['Best lap', fmtLap(info.best)],
            ].map(([k, v]) => (
              <div key={k} className="bg-carbon/95 px-3 py-2.5 text-center">
                <dt className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/45">{k}</dt>
                <dd className="mt-0.5 font-display text-lg tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col gap-3">
            <RaceButton icon={<Icon.Play />} hint={!isTouch && <Kbd>P</Kbd>} onClick={onResume} className="w-full py-3.5">
              Resume
            </RaceButton>
            <RaceButton variant="ghost" icon={<Icon.Restart />} hint={!isTouch && <Kbd>R</Kbd>} onClick={onRestart} className="w-full">
              Restart {quali ? 'session' : 'race'}
            </RaceButton>
            <RaceButton variant="ghost" icon={<Icon.Flag />} onClick={onEnd} className="w-full">
              {quali ? 'End session' : 'Retire from race'}
            </RaceButton>
            <button type="button" onClick={onQuit} className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/45 transition hover:text-white">
              {quitLabel}
            </button>
          </div>
          <p className="mt-4 text-center text-[11px] text-white/40">
            {quali ? 'Ending keeps your best lap; with no lap you start from the back.' : 'Retiring scores no points for this round.'}
          </p>
        </div>
      </div>
    </Backdrop>
  );
}

// ---------------------------------------------------------------------------

interface QualiProps {
  result: SessionResult;
  circuit: CircuitDef;
  playerId: string;
  /** Championship weekend (vs a test drive from the paddock). */
  weekend: boolean;
  onPrimary: () => void;
  primaryLabel: string;
  onSecondary: () => void;
  secondaryLabel: string;
}

export function QualifyingResults({ result, circuit, playerId, weekend, onPrimary, primaryLabel, onSecondary, secondaryLabel }: QualiProps) {
  const titleId = useId();
  const rows = result.quali ?? [];
  const pole = rows[0]?.best ?? null;
  const myPos = rows.findIndex((r) => r.driverId === playerId) + 1;
  const me = rows[myPos - 1];
  useHotkeys({ Enter: onPrimary, Escape: onSecondary });
  const headline = !me || me.best === null ? 'NO TIME SET' : myPos === 1 ? 'POLE POSITION!' : weekend ? `P${myPos} ON THE GRID` : `P${myPos} OF ${rows.length}`;
  return (
    <Backdrop labelledBy={titleId}>
      <div className="glass my-auto w-full max-w-3xl animate-slide-up overflow-hidden rounded-3xl">
        <div className="checkered-sm h-2.5 opacity-70" />
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:p-7">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">{weekend ? 'Qualifying · classification' : 'Test drive · session over'}</div>
            <h2 id={titleId} className={cn('mt-1.5 font-display text-3xl italic leading-none tracking-tight sm:text-5xl', myPos === 1 && me?.best != null ? 'text-gold text-glow-gold' : 'text-white')}>
              {headline}
            </h2>
            <p className="mt-2 text-sm text-white/60">
              {circuit.gp} · your best <b className="font-display text-white tabular-nums">{fmtLap(me?.best)}</b>
              {me?.best != null && pole !== null && myPos > 1 && <span> · +{(me.best - pole).toFixed(3)} to pole</span>}
            </p>
          </div>
          <CircuitMap circuit={circuit} className="hidden h-28 w-36 text-white/80 sm:block" />
        </div>

        <ol className="max-h-[46vh] overflow-y-auto border-y border-white/10">
          {rows.map((r, i) => {
            const d = driverById(r.driverId)!;
            const mine = r.driverId === playerId;
            return (
              <li key={r.driverId} className={cn('grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.05] px-4 py-1.5 first:border-t-0 sm:px-7', mine && 'bg-gold/[0.12]')}>
                <span className={cn('font-display text-sm', i === 0 ? 'text-gold' : 'text-white/60')}>{i + 1}</span>
                <DriverCell d={d} me={mine} />
                <span className="text-right font-display text-sm tabular-nums">
                  {r.best === null ? <span className="text-white/40">No time</span> : i === 0 ? fmtLap(r.best) : <span className="text-white/70">+{(r.best - (pole ?? 0)).toFixed(3)}</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col items-stretch gap-3 px-5 py-5 sm:flex-row sm:justify-center sm:px-7">
          <div className="cta-glow sm:min-w-[260px]">
            <RaceButton icon={weekend ? <Icon.Flag /> : <Icon.Restart />} hint={<Kbd>Enter</Kbd>} onClick={onPrimary} className="w-full py-3.5">
              {primaryLabel}
            </RaceButton>
          </div>
          <RaceButton variant="ghost" icon={<Icon.Back />} hint={<Kbd>Esc</Kbd>} onClick={onSecondary}>
            {secondaryLabel}
          </RaceButton>
        </div>
      </div>
    </Backdrop>
  );
}

// ---------------------------------------------------------------------------

interface RaceResultProps {
  result: SessionResult;
  circuit: CircuitDef;
  playerId: string;
  /** Championship position before and after this round. */
  standing?: { before: number; after: number; points: number };
  onContinue: () => void;
  continueLabel: string;
}

export function RaceResults({ result, circuit, playerId, standing, onContinue, continueLabel }: RaceResultProps) {
  const titleId = useId();
  const rows = result.race ?? [];
  const winner = rows[0];
  const myPos = rows.findIndex((r) => r.driverId === playerId) + 1;
  const me = rows[myPos - 1];
  const dnf = !me || me.time === null;
  useHotkeys({ Enter: onContinue });
  const headline = dnf ? 'DID NOT FINISH' : myPos === 1 ? 'RACE WINNER!' : myPos <= 3 ? `PODIUM · P${myPos}` : myPos <= 10 ? `P${myPos} · IN THE POINTS` : `P${myPos}`;
  const gap = (i: number) => {
    const r = rows[i];
    if (r.time === null) return <span className="text-red-300/80">DNF</span>;
    if (i === 0) return fmtLap(r.time);
    if (r.laps < winner.laps) return <span className="text-white/60">+{winner.laps - r.laps} lap{winner.laps - r.laps > 1 ? 's' : ''}</span>;
    return <span className="text-white/70">+{((r.time ?? 0) - (winner.time ?? 0)).toFixed(3)}</span>;
  };
  return (
    <Backdrop labelledBy={titleId}>
      <div className="glass my-auto w-full max-w-3xl animate-slide-up overflow-hidden rounded-3xl">
        <div className="checkered-sm h-2.5 opacity-80" />
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:p-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">
              <Icon.Flag className="text-sm" /> {circuit.gp} · result
            </div>
            <h2 id={titleId} className={cn('mt-1.5 font-display text-3xl italic leading-none tracking-tight sm:text-5xl', myPos === 1 && !dnf ? 'text-gold text-glow-gold' : 'text-white')}>
              {headline}
            </h2>
            <p className="mt-2 text-sm text-white/60">
              {dnf ? 'No points this weekend.' : myPos <= POINTS.length ? `+${POINTS[myPos - 1]} points` : 'Outside the points this time.'}
              {result.fastestLap && (
                <span>
                  {' '}
                  · fastest lap <b className="text-[#c084fc]">{driverById(result.fastestLap.driverId)?.short}</b> {fmtLap(result.fastestLap.time)}
                </span>
              )}
            </p>
            {standing && (
              <p className="mt-1 text-sm text-white/60">
                Championship: <b className="text-white">{ord(standing.after)}</b> with {standing.points} pts
                {standing.after !== standing.before && (
                  <span className={standing.after < standing.before ? 'text-emerald-400' : 'text-red-300'}>
                    {' '}
                    ({standing.after < standing.before ? '▲' : '▼'} {Math.abs(standing.before - standing.after)})
                  </span>
                )}
              </p>
            )}
          </div>
          <CircuitMap circuit={circuit} className="hidden h-28 w-36 text-white/80 sm:block" />
        </div>

        <ol className="max-h-[46vh] overflow-y-auto border-y border-white/10">
          {rows.map((r, i) => {
            const d = driverById(r.driverId)!;
            const mine = r.driverId === playerId;
            const pts = r.time !== null ? POINTS[i] ?? 0 : 0;
            return (
              <li
                key={r.driverId}
                className={cn('grid grid-cols-[2rem_minmax(0,1fr)_auto_2.5rem] items-center gap-3 border-t border-white/[0.05] px-4 py-1.5 first:border-t-0 sm:px-7', mine && 'bg-gold/[0.12]')}
              >
                <span className={cn('font-display text-sm', i === 0 ? 'text-gold' : i < 3 ? 'text-white' : 'text-white/60')}>{r.time === null ? '—' : i + 1}</span>
                <DriverCell d={d} me={mine} />
                <span className="flex items-center justify-end gap-2 text-right font-display text-sm tabular-nums">
                  {result.fastestLap?.driverId === r.driverId && <span className="rounded bg-[#a855f7] px-1 text-[9px] font-black tracking-wide text-white">FL</span>}
                  {gap(i)}
                </span>
                <span className={cn('text-right font-display text-sm', pts ? 'text-emerald-400' : 'text-white/25')}>{pts ? `+${pts}` : '0'}</span>
              </li>
            );
          })}
        </ol>

        <div className="flex justify-center px-5 py-5 sm:px-7">
          <div className="cta-glow w-full sm:w-auto sm:min-w-[280px]">
            <RaceButton icon={<Icon.Play />} hint={<Kbd>Enter</Kbd>} onClick={onContinue} className="w-full py-3.5">
              {continueLabel}
            </RaceButton>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
