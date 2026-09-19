import { useEffect } from 'react';
import { DRIVERS, type Driver } from '@/game/drivers';
import type { ScoreEntry } from '@/game/highscores';
import CarPreview from './CarPreview';
import HighScoreTable from './HighScoreTable';
import { cn } from '@/utils/cn';

interface Props {
  selected: Driver;
  onSelect: (d: Driver) => void;
  onStart: () => void;
  scores: ScoreEntry[];
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

function isDark(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 70;
}

export function driverColor(d: Driver) {
  return isDark(d.livery.primary) ? d.livery.accent : d.livery.primary;
}

function StatBars({ d, size = 'sm' }: { d: Driver; size?: 'sm' | 'lg' }) {
  const rows: [string, number][] = [
    ['SPD', d.stats.speed],
    ['ACC', d.stats.accel],
    ['GRP', d.stats.grip],
  ];
  const color = driverColor(d);
  return (
    <div className={cn('grid gap-1', size === 'lg' ? 'mt-3 gap-1.5' : 'mt-2')}>
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2">
          <span className={cn('font-display text-white/50', size === 'lg' ? 'w-10 text-xs' : 'w-8 text-[9px]')}>{label}</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={cn('skew-x-[-16deg] rounded-[2px]', size === 'lg' ? 'h-2.5 w-5' : 'h-1.5 w-3.5')}
                style={{ background: i <= v ? color : 'rgba(255,255,255,0.12)' }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/90 shadow-[0_2px_0_rgba(255,255,255,0.15)]">
      {children}
    </kbd>
  );
}

export default function StartScreen({ selected, onSelect, onStart, scores, muted, onToggleMute, isTouch }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = DRIVERS.findIndex((d) => d.id === selected.id);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        onSelect(DRIVERS[(idx - 1 + DRIVERS.length) % DRIVERS.length]);
        e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        onSelect(DRIVERS[(idx + 1) % DRIVERS.length]);
        e.preventDefault();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        onStart();
        e.preventDefault();
      } else if (e.code === 'KeyM') {
        onToggleMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect, onStart, onToggleMute]);

  const color = driverColor(selected);

  return (
    <div
      className="absolute inset-0 z-30 overflow-y-auto bg-gradient-to-b from-night/60 via-night/55 to-night/95 animate-fade-in"
      style={{ touchAction: 'pan-y' }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pb-8">
        {/* header */}
        <header className="flex items-start justify-between gap-4">
          <div className="animate-slide-up">
            <div className="flex items-center gap-3">
              <span className="stripes-red h-12 w-3 skew-x-[-16deg] sm:h-16" />
              <h1 className="font-display text-5xl italic leading-none tracking-tight text-glow-red sm:text-7xl">
                APEX<span className="text-f1red">GP</span>
              </h1>
            </div>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60 sm:text-xs">Formula Rush · Beat the clock</p>
          </div>
          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-xs font-bold tracking-widest text-white/80 hover:bg-white/10"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇 MUTED' : '🔊 SOUND'}
          </button>
        </header>
        <div className="checkered mt-3 h-2 w-full opacity-70" />

        {/* body */}
        <div className="mt-5 grid flex-1 gap-6 lg:grid-cols-[1fr_320px]">
          <section className="animate-slide-up [animation-delay:80ms]">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-sm tracking-[0.3em] text-white/80">SELECT YOUR DRIVER</h2>
              <span className="hidden text-[11px] text-white/40 sm:block">← → to browse</span>
            </div>

            {/* driver cards */}
            <div className="scroll-thin -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
              {DRIVERS.map((d) => {
                const isSel = d.id === selected.id;
                const c = driverColor(d);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d)}
                    className={cn(
                      'group w-[148px] shrink-0 snap-start rounded-xl border-2 p-3 text-left transition-all duration-150 sm:w-[166px]',
                      isSel ? 'scale-[1.03] border-white bg-white/10' : 'border-white/10 bg-black/40 hover:border-white/40 hover:bg-black/60',
                    )}
                    style={{ boxShadow: isSel ? `0 0 28px ${c}66, inset 0 0 0 1px ${c}55` : undefined }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-2xl italic" style={{ color: c }}>
                        {d.number}
                      </span>
                      <span className="text-lg">{d.flag}</span>
                    </div>
                    <CarPreview livery={d.livery} className="my-1 w-full drop-shadow-[0_6px_6px_rgba(0,0,0,0.5)] transition-transform group-hover:-translate-y-0.5" />
                    <div className="truncate text-sm font-bold leading-tight">{d.name}</div>
                    <div className="truncate text-[10px] uppercase tracking-wider text-white/50">{d.team}</div>
                    <StatBars d={d} />
                  </button>
                );
              })}
            </div>

            {/* compact selected strip (phones) */}
            <div
              key={`m-${selected.id}`}
              className="mt-2 flex animate-pop items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-3 py-2 sm:hidden"
              style={{ borderColor: `${color}55` }}
            >
              <span className="font-display text-2xl italic" style={{ color }}>
                {selected.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-base leading-tight">{selected.name}</div>
                <div className="truncate text-[11px] italic text-white/60">“{selected.radio}”</div>
              </div>
            </div>

            {/* selected detail */}
            <div
              key={selected.id}
              className="mt-3 hidden animate-pop items-center gap-4 rounded-2xl border border-white/10 bg-black/50 p-4 sm:flex sm:flex-row sm:p-5"
              style={{ borderColor: `${color}55` }}
            >
              <CarPreview livery={selected.livery} className="w-44 drop-shadow-[0_10px_12px_rgba(0,0,0,0.6)] sm:w-56" />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">
                  #{selected.number} · {selected.team} · {selected.country}
                </div>
                <div className="font-display text-2xl leading-tight sm:text-3xl" style={{ color }}>
                  {selected.name}
                </div>
                <p className="mt-1 text-sm italic text-white/70">“{selected.radio}”</p>
                <div className="flex justify-center sm:justify-start">
                  <StatBars d={selected} size="lg" />
                </div>
              </div>
            </div>

            {/* start (inline on tablets / desktop) */}
            <div className="mt-5 hidden items-center gap-6 sm:flex">
              <button
                type="button"
                onClick={onStart}
                className="btn-race animate-pulse-glow bg-f1red px-12 py-4 font-display text-xl tracking-[0.2em] text-white sm:text-2xl"
              >
                START RACE
              </button>
              <p className="text-left text-xs text-white/50">
                {isTouch ? (
                  <>Tap to launch. Steer by tapping the left / right side of the road.</>
                ) : (
                  <>
                    Press <Key>ENTER</Key> to launch
                  </>
                )}
              </p>
            </div>

            {/* how to play */}
            <div className="mt-5 grid gap-3 text-xs text-white/70 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-2 font-display text-[11px] tracking-[0.25em] text-white/60">CONTROLS</div>
                {isTouch ? (
                  <ul className="space-y-1">
                    <li>◀ ▶ or tap either side of the screen to steer</li>
                    <li><b className="text-white">BRAKE</b> for tight corners</li>
                    <li><b className="text-boost">BOOST</b> when the blue bar is full</li>
                  </ul>
                ) : (
                  <ul className="space-y-1.5">
                    <li className="flex items-center gap-2"><Key>←</Key><Key>→</Key><span className="text-white/50">or</span><Key>A</Key><Key>D</Key> Steer</li>
                    <li className="flex items-center gap-2"><Key>↓</Key><span className="text-white/50">or</span><Key>S</Key> Brake</li>
                    <li className="flex items-center gap-2"><Key>SPACE</Key><span className="text-white/50">or</span><Key>SHIFT</Key> Boost</li>
                    <li className="flex items-center gap-2"><Key>P</Key> Pause <span className="mx-1 text-white/30">·</span> <Key>M</Key> Mute</li>
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-2 font-display text-[11px] tracking-[0.25em] text-white/60">HOW TO SCORE</div>
                <ul className="space-y-1">
                  <li><span className="text-white">Throttle is automatic</span> — you just have to survive the clock.</li>
                  <li><span className="text-gold">Close calls</span> chain a combo: 250 × combo points each.</li>
                  <li>Near misses charge <span className="text-boost">BOOST</span> — fire it for ×2 score.</li>
                  <li>Every <span className="text-green-400">sector gate</span> adds time. Crashes kill your combo.</li>
                </ul>
              </div>
            </div>
          </section>

          <aside className="animate-slide-up [animation-delay:160ms]">
            <HighScoreTable scores={scores} />
            <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-white/30">Scores are saved on this device</p>
          </aside>
        </div>
      </div>

      {/* sticky launch bar (phones) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-night via-night/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 sm:hidden">
        <button
          type="button"
          onClick={onStart}
          className="btn-race animate-pulse-glow pointer-events-auto w-full bg-f1red py-4 font-display text-xl tracking-[0.2em] text-white"
        >
          START RACE
        </button>
      </div>
    </div>
  );
}
