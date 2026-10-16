import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, Kbd, SoundButton, fmt } from './ui';
import { useHotkeys } from './hooks';
import { cn } from '@/utils/cn';

export interface SeasonSummary {
  round: number;
  rounds: number;
  nextRace: string;
  driverName: string;
  position: number;
  points: number;
}

interface Props {
  onChampionship: () => void;
  onNewChampionship: () => void;
  onArcade: () => void;
  onPaddock?: () => void;
  onBack: () => void;
  bestScore: number;
  season: SeasonSummary | null;
  /** Optional circuit outline (SVG path, 0..100 box) for the championship card art. */
  trackPath?: string;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

type Mode = {
  id: 'championship' | 'arcade' | 'multiplayer';
  kicker: string;
  title: string;
  desc: string;
  bullets: string[];
  art: ReactNode;
  cta: string;
  meta?: ReactNode;
  locked?: boolean;
  primary: () => void;
  secondary?: { label: string; onClick: () => void };
};

const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

function ChampionshipArt({ trackPath }: { trackPath?: string }) {
  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,#8a1212_0%,#2c0709_55%,#0d0510_100%)]">
      <svg
        viewBox="0 0 100 100"
        className="absolute -right-2 top-1/2 h-[120%] -translate-y-1/2 text-white/20"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinejoin="round"
        strokeLinecap="round"
        aria-hidden
      >
        <path d={trackPath ?? 'M12 78 L64 80 Q80 80 84 66 L90 36 Q92 22 80 20 L58 18 Q46 18 44 30 L42 44 Q40 54 30 52 L18 48 Q8 46 8 60 Z'} />
      </svg>
      <div className="checkered-sm absolute inset-x-0 bottom-0 h-2.5 opacity-40" />
      <Icon.Trophy className="absolute bottom-6 left-5 text-[4.5rem] text-gold drop-shadow-[0_8px_18px_rgba(255,212,0,0.35)]" />
      <span className="absolute left-5 top-4 font-display text-[11px] tracking-[0.3em] text-white/60">SEASON 2026</span>
    </div>
  );
}

function ArcadeArt() {
  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,#0c4a6e_0%,#071a33_55%,#070614_100%)]">
      <div aria-hidden className="absolute inset-0 opacity-25 [background:repeating-linear-gradient(115deg,transparent_0_22px,rgba(125,211,252,0.45)_22px_24px)]" />
      <span aria-hidden className="text-outline absolute -right-1 -top-5 font-display text-[9.5rem] italic leading-none">40</span>
      <Icon.Stopwatch className="absolute bottom-6 left-5 text-[4.5rem] text-boost drop-shadow-[0_8px_18px_rgba(56,189,248,0.35)]" />
      <span className="absolute left-5 top-4 font-display text-[11px] tracking-[0.3em] text-white/60">BEAT THE CLOCK</span>
    </div>
  );
}

function MultiplayerArt() {
  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(120%_120%_at_85%_0%,#3b1d5e_0%,#190f2c_55%,#0a0814_100%)]">
      <div aria-hidden className="absolute inset-0 flex items-center justify-center gap-4 opacity-55">
        <Icon.Helmet className="-scale-x-100 text-[4.5rem] text-white/75" />
        <span className="font-display text-2xl italic text-white/60">VS</span>
        <Icon.Helmet className="text-[4.5rem] text-white/75" />
      </div>
      <div className="absolute -right-12 top-6 rotate-45 bg-gold px-14 py-1 font-display text-[10px] tracking-[0.2em] text-black shadow-lg">COMING SOON</div>
      <span className="absolute left-5 top-4 font-display text-[11px] tracking-[0.3em] text-white/60">ONLINE</span>
    </div>
  );
}

export default function MainMenu(props: Props) {
  const { onChampionship, onNewChampionship, onArcade, onPaddock, onBack, bestScore, season, trackPath, muted, onToggleMute, isTouch } = props;
  const [focus, setFocus] = useState(0);
  const [toast, setToast] = useState(false);
  const [shake, setShake] = useState(0);
  const primaries = useRef<(HTMLButtonElement | null)[]>([]);

  const lockedNotice = () => {
    setToast(true);
    setShake((s) => s + 1);
  };
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 2600);
    return () => window.clearTimeout(t);
  }, [toast, shake]);

  const modes: Mode[] = [
    {
      id: 'championship',
      kicker: 'Career',
      title: 'Championship',
      desc: 'Take a seat on the 20-car grid and fight for the drivers’ and constructors’ titles across a season of Grands Prix.',
      bullets: ['Qualifying sets your grid slot', 'Circuits modelled on real tracks', 'Points from P1 to P10'],
      art: <ChampionshipArt trackPath={trackPath} />,
      cta: season ? 'Continue season' : 'New season',
      meta: season ? (
        <span className="text-xs text-white/60">
          Round <b className="text-white">{season.round}</b>/{season.rounds} · {season.driverName} · <b className="text-white">{ord(season.position)}</b>, {season.points} pts
        </span>
      ) : undefined,
      primary: season ? onChampionship : onNewChampionship,
      secondary: season ? { label: 'New season', onClick: onNewChampionship } : undefined,
    },
    {
      id: 'arcade',
      kicker: 'High score',
      title: 'Arcade',
      desc: 'Weave through traffic against the clock. Chain close calls, fire boost and chase the leaderboard.',
      bullets: ['40 seconds + sector bonuses', 'Combos and boost for big scores', 'Local top-10 leaderboard'],
      art: <ArcadeArt />,
      cta: 'Play arcade',
      meta:
        bestScore > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-white/60">
            <Icon.Trophy className="text-gold" /> Best <b className="font-display text-white tabular-nums">{fmt(bestScore)}</b>
          </span>
        ) : undefined,
      primary: onArcade,
    },
    {
      id: 'multiplayer',
      kicker: 'Online',
      title: 'Multiplayer',
      desc: 'Race your friends wheel-to-wheel. We’re building it now.',
      bullets: ['Head-to-head races', 'Private lobbies', 'Shared leaderboards'],
      art: <MultiplayerArt />,
      cta: 'Coming soon',
      locked: true,
      primary: lockedNotice,
    },
  ];

  const move = (dir: number) => {
    const next = (focus + dir + modes.length) % modes.length;
    setFocus(next);
    primaries.current[next]?.focus();
  };
  useHotkeys({
    ArrowLeft: () => move(-1),
    ArrowUp: () => move(-1),
    ArrowRight: () => move(1),
    ArrowDown: () => move(1),
    Enter: () => modes[focus].primary(),
    Space: () => modes[focus].primary(),
    Escape: onBack,
    KeyM: onToggleMute,
  });

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overflow-x-hidden animate-fade-in" style={{ touchAction: 'pan-y' }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-night/60 via-night/80 to-night/95" />
      <div className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pt-7">
        <header className="flex animate-slide-up items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="group flex min-w-0 items-center gap-3 text-left" aria-label="Back to title screen">
            <span className="stripes-red h-10 w-2.5 shrink-0 skew-x-[-16deg]" />
            <span className="min-w-0">
              <span className="block font-display text-3xl italic leading-none tracking-tight text-glow-red sm:text-4xl">
                APEX<span className="text-f1red">GP</span>
              </span>
              <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.3em] text-white/50 group-hover:text-white/70">Formula racing</span>
            </span>
          </button>
          <SoundButton muted={muted} onToggle={onToggleMute} />
        </header>

        <div className="mt-6 flex animate-slide-up items-end justify-between gap-4 [animation-delay:60ms] sm:mt-10">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-f1red">Main menu</div>
            <h2 className="mt-1 font-display text-3xl italic tracking-tight sm:text-4xl">Choose your mode</h2>
          </div>
          {!isTouch && (
            <div className="hidden items-center gap-1.5 text-[11px] text-white/40 md:flex">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> choose <span className="mx-1 text-white/20">·</span>
              <Kbd>Enter</Kbd> select <span className="mx-1 text-white/20">·</span>
              <Kbd>Esc</Kbd> back
            </div>
          )}
        </div>

        <div className="mt-5 grid flex-1 content-start gap-4 md:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr] lg:gap-5">
          {modes.map((m, i) => (
            <div
              key={m.id}
              onClick={m.primary}
              onMouseEnter={() => setFocus(i)}
              className={cn(
                'glass group relative cursor-pointer overflow-hidden rounded-3xl transition duration-200 animate-slide-up',
                m.id === 'championship' && 'md:col-span-2 lg:col-span-1',
                focus === i ? 'ring-2 ring-white/70 lg:-translate-y-1' : 'ring-1 ring-transparent',
                m.locked && 'cursor-not-allowed',
              )}
              style={{ animationDelay: `${100 + i * 70}ms` }}
            >
              {/* keyed by the shake count so the "locked" wobble replays on every attempt */}
              <div key={m.locked ? shake : 0} className={cn('flex h-full flex-col', m.locked && shake > 0 && 'animate-shake')}>
              <div className={cn('h-32 shrink-0 sm:h-48', m.locked && 'grayscale-[0.4]')}>{m.art}</div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">{m.kicker}</div>
                <h3 className="mt-1 flex items-center gap-2 font-display text-2xl italic tracking-tight sm:text-3xl">
                  {m.title}
                  {m.locked && <Icon.Lock className="text-xl text-white/50" />}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{m.desc}</p>
                <ul className="mt-3 space-y-1.5">
                  {m.bullets.map((b) => (
                    <li key={b} className={cn('flex items-center gap-2.5 text-xs', m.locked ? 'text-white/35' : 'text-white/60')}>
                      <span className={cn('h-1 w-3 shrink-0 skew-x-[-20deg]', m.locked ? 'bg-white/25' : 'bg-f1red')} />
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  {m.meta && <div className="mb-3">{m.meta}</div>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      ref={(el) => {
                        primaries.current[i] = el;
                      }}
                      type="button"
                      onFocus={() => setFocus(i)}
                      onClick={(e) => {
                        e.stopPropagation();
                        m.primary();
                      }}
                      aria-disabled={m.locked || undefined}
                      className={cn(
                        'btn-race inline-flex items-center gap-2.5 whitespace-nowrap px-6 py-3 font-display text-sm uppercase tracking-[0.18em]',
                        m.locked ? 'border border-white/15 bg-white/[0.05] text-white/50' : 'btn-shine bg-f1red text-white hover:bg-[#f5150c]',
                      )}
                    >
                      {m.locked ? <Icon.Lock /> : <Icon.Play />}
                      {m.cta}
                    </button>
                    {m.secondary && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          m.secondary?.onClick();
                        }}
                        className="btn-race whitespace-nowrap border border-white/20 bg-white/[0.06] px-5 py-3 font-display text-xs uppercase tracking-[0.18em] text-white/85 hover:bg-white/[0.13]"
                      >
                        {m.secondary.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          ))}
        </div>

        {onPaddock && (
          <div className="mt-5 flex animate-slide-up flex-wrap items-center gap-3 [animation-delay:320ms]">
            <button
              type="button"
              onClick={onPaddock}
              className="glass inline-flex items-center gap-2.5 rounded-xl px-4 py-3 font-display text-xs uppercase tracking-[0.2em] text-white/85 transition hover:text-white"
            >
              <Icon.Garage className="text-base text-team-soft" />
              Paddock <span className="font-ui text-[10px] font-bold normal-case tracking-[0.12em] text-white/45">drivers · teams · circuits</span>
            </button>
          </div>
        )}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4 transition duration-300',
          toast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <div className="glass flex items-center gap-3 rounded-2xl px-5 py-3 text-sm">
          <Icon.Lock className="text-gold" />
          <span>
            <b className="font-display tracking-wide">Multiplayer</b> is coming soon — stay tuned!
          </span>
        </div>
      </div>
    </div>
  );
}
