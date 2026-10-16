import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { Game } from '@/game/engine';
import type { Input, TouchKey } from '@/game/input';
import { Icon } from './ui';
import { cn } from '@/utils/cn';

interface Props {
  input: Input;
  game: Game;
}

function TouchButton({
  input,
  action,
  className,
  children,
  label,
  buttonRef,
}: {
  input: Input;
  action: TouchKey;
  className?: string;
  children: ReactNode;
  label: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const [active, setActive] = useState(false);
  const press = (down: boolean) => {
    setActive(down);
    input.setTouch(action, down);
  };
  // never leave a button "held" if we unmount mid-press (e.g. time runs out while braking)
  useEffect(() => () => input.setTouch(action, false), [input, action]);
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      data-active={active}
      className={cn(
        'touch-btn pointer-events-auto flex select-none flex-col items-center justify-center rounded-2xl border-2 font-display text-white/95',
        active ? 'border-white bg-white/35' : 'border-white/35 bg-black/40',
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        press(false);
      }}
      onPointerCancel={() => press(false)}
      onLostPointerCapture={() => press(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchControls({ input, game }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boostRef = useRef<HTMLButtonElement>(null);

  // tell the renderer how much of the bottom edge we cover so it keeps the car above the buttons
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => game.setTouchMode(true, el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [game]);

  // mirror the boost meter on the button's ring without re-rendering React every frame
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = boostRef.current;
      if (el) {
        const s = game.snapshot();
        el.style.setProperty('--fill', s.boostFill.toFixed(3));
        const state = s.boosting ? 'boosting' : s.boostReady ? 'ready' : 'charging';
        if (el.dataset.state !== state) el.dataset.state = state;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
    >
      <div className="flex gap-3">
        <TouchButton input={input} action="left" label="Steer left" className="h-[72px] w-[72px] text-4xl">
          <Icon.ChevronLeft />
        </TouchButton>
        <TouchButton input={input} action="right" label="Steer right" className="h-[72px] w-[72px] text-4xl">
          <Icon.ChevronRight />
        </TouchButton>
      </div>
      <div className="flex items-end gap-4">
        <TouchButton input={input} action="brake" label="Brake" className="h-[60px] w-[68px] text-[11px] tracking-widest">
          BRAKE
        </TouchButton>
        <TouchButton
          input={input}
          action="boost"
          label="Boost"
          buttonRef={boostRef}
          className="boost-btn h-[80px] w-[80px] gap-0.5 rounded-full border-boost/50 text-[11px] tracking-widest text-boost"
        >
          <Icon.Bolt className="text-2xl" />
          BOOST
        </TouchButton>
      </div>
    </div>
  );
}
