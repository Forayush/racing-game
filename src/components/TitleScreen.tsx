import { useEffect, useState } from 'react';
import { SoundButton } from './ui';
import { cn } from '@/utils/cn';

interface Props {
  onContinue: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
  /** Grid / calendar size for the footer line. */
  facts?: { drivers: number; teams: number; circuits: number };
}

const IGNORED = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab', 'CapsLock']);

export default function TitleScreen({ onContinue, muted, onToggleMute, isTouch, facts }: Props) {
  // five red lights fill one by one, hold, then go out — on a loop
  const [lit, setLit] = useState(0);
  useEffect(() => {
    let step = 0;
    const id = window.setInterval(() => {
      step = (step + 1) % 9;
      setLit(step <= 5 ? step : step === 6 ? 5 : 0);
    }, 520);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || IGNORED.has(e.code)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if ((e.code === 'Enter' || e.code === 'Space') && target?.closest('[data-keep-focus]')) return;
      if (e.code === 'KeyM') return onToggleMute();
      e.preventDefault();
      onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onContinue, onToggleMute]);

  return (
    <div className="absolute inset-0 z-30 animate-fade-in">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(7,6,31,0.45),rgba(7,6,31,0.9)_72%)]" />
      {/* soft dark band so the wordmark and prompts read over the busy scene */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-[26rem] -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(5,4,20,0.75),transparent)]" />
      {/* the whole screen is the start button */}
      <button type="button" aria-label="Start" onClick={onContinue} className="absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none" />

      <div className="pointer-events-none relative flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex animate-slide-up items-center gap-3 sm:gap-5">
          <span className="stripes-red h-16 w-4 skew-x-[-16deg] sm:h-28 sm:w-6" />
          <h1 className="font-display text-7xl italic leading-none tracking-tight text-glow-red sm:text-[9rem]">
            APEX<span className="text-f1red">GP</span>
          </h1>
        </div>
        <div className="mt-4 flex animate-slide-up items-center gap-4 text-[11px] font-bold uppercase tracking-[0.5em] text-white/80 [animation-delay:120ms] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)] sm:text-sm">
          <span className="h-px w-8 bg-white/30 sm:w-20" />
          Formula racing
          <span className="h-px w-8 bg-white/30 sm:w-20" />
        </div>

        <div aria-hidden className="mt-14 flex gap-3 rounded-2xl border border-white/10 bg-black/60 px-4 py-3 sm:gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-5 w-5 rounded-full transition-[background-color,box-shadow] duration-100 sm:h-6 sm:w-6',
                i < lit ? 'bg-[#ff2424] shadow-[0_0_16px_3px_rgba(255,36,36,0.65)]' : 'bg-[#2a0d0f]',
              )}
            />
          ))}
        </div>
        <p className="mt-7 animate-blink font-display text-sm tracking-[0.35em] text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.9)] sm:text-base">{isTouch ? 'TAP TO START' : 'PRESS ANY KEY'}</p>
      </div>

      {facts && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[10px] font-bold uppercase tracking-[0.35em] text-white/40 sm:text-[11px]">
          {facts.drivers} drivers · {facts.teams} teams · {facts.circuits} circuits
        </div>
      )}
      <div data-keep-focus className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]">
        <SoundButton muted={muted} onToggle={onToggleMute} />
      </div>
    </div>
  );
}
