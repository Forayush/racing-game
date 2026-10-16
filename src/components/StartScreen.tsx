import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { DRIVERS, driverColor, inkOn, type Driver } from '@/game/drivers';
import type { ScoreEntry } from '@/game/highscores';
import CarPreview from './CarPreview';
import DriverPicker from './DriverPicker';
import HighScoreTable from './HighScoreTable';
import { Icon, Kbd, RaceButton, SoundButton, StatMeter, fmt } from './ui';
import { cn } from '@/utils/cn';

interface Props {
  selected: Driver;
  onSelect: (d: Driver) => void;
  onStart: () => void;
  onBack: () => void;
  scores: ScoreEntry[];
  onClearScores: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}

type Tab = 'board' | 'howto';

const STAT_ROWS = [
  ['speed', 'Top speed'],
  ['accel', 'Acceleration'],
  ['grip', 'Grip'],
] as const;

function Logo() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="stripes-red h-10 w-2.5 shrink-0 skew-x-[-16deg] roomy:h-14 roomy:w-3" />
      <div className="min-w-0">
        <h1 className="font-display text-4xl italic leading-none tracking-tight text-glow-red roomy:text-6xl">
          APEX<span className="text-f1red">GP</span>
        </h1>
        <p className="mt-1.5 truncate text-[10px] font-bold uppercase tracking-[0.3em] text-white/55 sm:text-[11px]">Formula Rush · Beat the clock</p>
      </div>
    </div>
  );
}

function NavArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous driver' : 'Next driver'}
      className={cn(
        'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-xl text-white/80 transition hover:border-white/40 hover:bg-white/10 hover:text-white active:scale-90',
        dir === 'prev' ? 'left-0' : 'right-0',
      )}
    >
      {dir === 'prev' ? <Icon.ChevronLeft /> : <Icon.ChevronRight />}
    </button>
  );
}

function Showroom({ driver, onStep, onStart, isTouch }: { driver: Driver; onStep: (dir: number) => void; onStart: () => void; isTouch: boolean }) {
  const color = driverColor(driver);
  const [first, ...rest] = driver.name.split(' ');
  const idx = DRIVERS.findIndex((d) => d.id === driver.id);
  return (
    <div className="glass relative isolate overflow-hidden rounded-3xl">
      <div aria-hidden className="absolute -right-24 -top-32 -z-10 h-96 w-96 rounded-full bg-team/25 blur-3xl transition-colors duration-500" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
      <div
        aria-hidden
        key={`n-${driver.id}`}
        className="text-outline absolute -right-2 top-1/2 -z-10 -translate-y-1/2 animate-fade-in select-none font-display text-[9rem] italic leading-none sm:text-[13rem] lg:text-[15rem]"
      >
        {driver.number}
      </div>

      <div className="grid items-center gap-2 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-4 md:p-7">
        {/* car on its stage */}
        <div className="relative md:order-2">
          <div className="relative mx-auto w-[76%] max-w-[520px] py-3 md:w-[86%]">
            <div className="stage-floor" />
            <div key={driver.id} className="relative animate-car-in">
              <CarPreview livery={driver.livery} res={960} className="h-auto w-full animate-float drop-shadow-[0_18px_16px_rgba(0,0,0,0.55)]" />
            </div>
          </div>
          <NavArrow dir="prev" onClick={() => onStep(-1)} />
          <NavArrow dir="next" onClick={() => onStep(1)} />
        </div>

        {/* driver card */}
        <div key={driver.id} className="min-w-0 animate-slide-up md:order-1">
          <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.3em] text-white/55">
            <span className="rounded-[4px] bg-team px-1.5 py-0.5 font-display text-xs tracking-normal" style={{ color: inkOn(color) }}>
              #{driver.number}
            </span>
            <span className="truncate">{driver.country}</span>
            <span className="ml-auto flex items-center gap-1.5 rounded-md border border-white/15 bg-black/40 px-2 py-1 tracking-[0.2em]" title="Overall driver rating">
              OVR <b className="font-display text-sm tracking-normal text-white">{driver.rating}</b>
            </span>
            <span className="font-display tracking-[0.15em] text-white/35">
              {idx + 1}/{DRIVERS.length}
            </span>
          </div>
          <h2 className="mt-2 font-display text-[2rem] italic leading-[0.95] tracking-tight sm:text-5xl">
            <span className="block text-white/90">{first}</span>
            <span className="block text-team-soft">{rest.join(' ')}</span>
          </h2>
          <div className="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-white/50">{driver.team}</div>
          <p className="mt-3 border-l-2 border-team pl-3 text-sm italic text-white/75">“{driver.radio}”</p>
          <div className="mt-4 grid max-w-sm gap-2">
            {STAT_ROWS.map(([k, label]) => (
              <StatMeter key={k} label={label} value={driver.stats[k]} color={color} />
            ))}
          </div>
          <div className="mt-6 hidden flex-wrap items-center gap-x-5 gap-y-3 roomy:flex">
            <div className="cta-glow">
              <RaceButton size="lg" icon={<Icon.Play />} onClick={onStart}>
                Start race
              </RaceButton>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-white/50">
              {isTouch ? (
                'Tap to launch'
              ) : (
                <>
                  Press <Kbd>Enter</Kbd> to launch
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Roster({ selected, onSelect, isTouch }: { selected: Driver; onSelect: (d: Driver) => void; isTouch: boolean }) {
  return (
    <div className="glass rounded-2xl p-2 sm:p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="font-display text-[11px] tracking-[0.3em] text-white/60">THE GRID</h3>
        {!isTouch && (
          <span className="hidden items-center gap-1 text-[11px] text-white/40 sm:flex">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> to browse
          </span>
        )}
      </div>
      <DriverPicker selectedId={selected.id} onSelect={onSelect} />
    </div>
  );
}

function Tip({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 rounded-[1px]" style={{ background: color }} />
      <div>
        <div className="text-sm font-bold" style={{ color }}>
          {title}
        </div>
        <div className="text-xs leading-relaxed text-white/60">{children}</div>
      </div>
    </li>
  );
}

function ControlRow({ keys, label }: { keys: ReactNode; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-white/75">{label}</span>
      <span className="flex items-center gap-1 text-[11px] text-white/35">{keys}</span>
    </li>
  );
}

function HowToPlay({ isTouch }: { isTouch: boolean }) {
  return (
    <div className="space-y-5 p-4 sm:p-5">
      <section>
        <h3 className="mb-2.5 font-display text-[11px] tracking-[0.25em] text-white/50">CONTROLS</h3>
        {isTouch ? (
          <ul className="grid gap-2 text-sm">
            <ControlRow label="Steer — or hold either side of the road" keys={<><Kbd>◀</Kbd><Kbd>▶</Kbd></>} />
            <ControlRow label="Brake for tight corners" keys={<Kbd>BRAKE</Kbd>} />
            <ControlRow label="Boost when the ring is full" keys={<Kbd className="text-boost">BOOST</Kbd>} />
          </ul>
        ) : (
          <ul className="grid gap-2 text-sm">
            <ControlRow label="Steer" keys={<><Kbd>←</Kbd><Kbd>→</Kbd> or <Kbd>A</Kbd><Kbd>D</Kbd></>} />
            <ControlRow label="Brake" keys={<><Kbd>↓</Kbd> or <Kbd>S</Kbd></>} />
            <ControlRow label="Boost" keys={<><Kbd>Space</Kbd> or <Kbd>Shift</Kbd></>} />
            <ControlRow label="Pause" keys={<><Kbd>P</Kbd> or <Kbd>Esc</Kbd></>} />
            <ControlRow label="Mute" keys={<Kbd>M</Kbd>} />
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2.5 font-display text-[11px] tracking-[0.25em] text-white/50">SCORING</h3>
        <ul className="grid gap-3">
          <Tip color="#ffffff" title="Throttle is automatic">
            You just have to survive the clock — steer through the traffic.
          </Tip>
          <Tip color="var(--color-gold)" title="Close calls">
            Chain them into a combo: 250 × combo points each.
          </Tip>
          <Tip color="var(--color-boost)" title="Boost">
            Near misses charge it — fire it for ×2 score.
          </Tip>
          <Tip color="#4ade80" title="Sector gates">
            Every gate adds time. Crashes kill your combo.
          </Tip>
        </ul>
      </section>
    </div>
  );
}

function SidePanel({ tab, onTab, scores, onClearScores, isTouch }: { tab: Tab; onTab: (t: Tab) => void; scores: ScoreEntry[]; onClearScores: () => void; isTouch: boolean }) {
  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'board', label: 'Leaderboard', icon: <Icon.Trophy className={tab === 'board' ? 'text-gold' : undefined} /> },
    { id: 'howto', label: 'How to play', icon: <Icon.Help className={tab === 'howto' ? 'text-boost' : undefined} /> },
  ];
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div role="tablist" aria-label="Race info" className="grid grid-cols-2 gap-1 border-b border-white/10 p-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => onTab(t.id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-display text-[11px] uppercase tracking-[0.16em] transition',
              tab === t.id ? 'bg-white/[0.1] text-white' : 'text-white/45 hover:bg-white/[0.05] hover:text-white/80',
            )}
          >
            <span className="text-sm">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} className="animate-fade-in">
        {tab === 'board' ? <HighScoreTable bare scores={scores} onClear={onClearScores} /> : <HowToPlay isTouch={isTouch} />}
      </div>
    </div>
  );
}

export default function StartScreen({ selected, onSelect, onStart, onBack, scores, onClearScores, muted, onToggleMute, isTouch }: Props) {
  // first-timers land on the instructions, returning players on their times
  const [tab, setTab] = useState<Tab>(() => (scores.length > 0 ? 'board' : 'howto'));
  const idx = Math.max(0, DRIVERS.findIndex((d) => d.id === selected.id));
  const color = driverColor(selected);
  const best = scores[0]?.score ?? 0;

  useEffect(() => {
    const step = (dir: number) => onSelect(DRIVERS[(idx + dir + DRIVERS.length) % DRIVERS.length]);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          step(-1);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'KeyD':
          step(1);
          e.preventDefault();
          break;
        case 'Enter':
        case 'Space': {
          if (e.repeat) return;
          // a focused control (tab, sound, an unselected driver) activates itself instead of launching
          const control = target?.closest('button');
          if (control && !(control.hasAttribute('data-driver') && control.getAttribute('aria-pressed') === 'true')) return;
          onStart();
          e.preventDefault();
          break;
        }
        case 'KeyM':
          if (!e.repeat) onToggleMute();
          break;
        case 'Escape':
          if (e.repeat) return;
          onBack();
          e.preventDefault();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, onSelect, onStart, onBack, onToggleMute]);

  return (
    <div
      data-shot="menu-scroll"
      className="absolute inset-0 z-30 overflow-y-auto overflow-x-hidden animate-fade-in"
      style={{ '--team': color, touchAction: 'pan-y' } as CSSProperties}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-night/55 via-night/80 to-night/95" />

      <div className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-10 roomy:pb-8 roomy:lg:pt-7">
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
            <Logo />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {best > 0 && (
              <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 sm:flex">
                <Icon.Trophy className="text-sm text-gold" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/45">Best</span>
                <span className="font-display text-sm tabular-nums">{fmt(best)}</span>
              </div>
            )}
            <SoundButton muted={muted} onToggle={onToggleMute} />
          </div>
        </header>
        <div className="checkered-sm mt-4 h-2.5 w-full opacity-60 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" />

        <main className="mt-5 grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-6">
          <section aria-label="Driver selection" className="flex min-w-0 animate-slide-up flex-col gap-4 [animation-delay:60ms]">
            <Showroom driver={selected} onStep={(dir) => onSelect(DRIVERS[(idx + dir + DRIVERS.length) % DRIVERS.length])} onStart={onStart} isTouch={isTouch} />
            <Roster selected={selected} onSelect={onSelect} isTouch={isTouch} />
          </section>
          <aside className="min-w-0 animate-slide-up [animation-delay:120ms]">
            <SidePanel tab={tab} onTab={setTab} scores={scores} onClearScores={onClearScores} isTouch={isTouch} />
          </aside>
        </main>
      </div>

      {/* sticky launch bar (phones, either orientation) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden bg-gradient-to-t from-night via-night/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 compact:block">
        <div className="cta-glow pointer-events-auto mx-auto max-w-md">
          <RaceButton size="lg" icon={<Icon.Play />} onClick={onStart} className="w-full">
            Start race
          </RaceButton>
        </div>
      </div>
    </div>
  );
}
