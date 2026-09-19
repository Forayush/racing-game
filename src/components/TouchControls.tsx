import { useEffect, useState, type ReactNode } from 'react';
import type { Input, TouchKey } from '@/game/input';
import { cn } from '@/utils/cn';

interface Props {
  input: Input;
}

function TouchButton({
  input,
  action,
  className,
  children,
  label,
}: {
  input: Input;
  action: TouchKey;
  className?: string;
  children: ReactNode;
  label: string;
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
      type="button"
      aria-label={label}
      data-active={active}
      className={cn(
        'touch-btn pointer-events-auto flex select-none items-center justify-center rounded-2xl border-2 font-display text-white/95 backdrop-blur-[2px]',
        active ? 'border-white bg-white/35' : 'border-white/40 bg-black/35',
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

export default function TouchControls({ input }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex gap-3">
        <TouchButton input={input} action="left" label="Steer left" className="h-[74px] w-[74px] text-3xl">
          ◀
        </TouchButton>
        <TouchButton input={input} action="right" label="Steer right" className="h-[74px] w-[74px] text-3xl">
          ▶
        </TouchButton>
      </div>
      <div className="flex items-end gap-3">
        <TouchButton input={input} action="brake" label="Brake" className="h-[62px] w-[70px] text-[11px] tracking-widest">
          BRAKE
        </TouchButton>
        <TouchButton
          input={input}
          action="boost"
          label="Boost"
          className="h-[84px] w-[84px] rounded-full border-boost/70 text-sm tracking-widest text-boost shadow-[0_0_24px_rgba(56,189,248,0.35)]"
        >
          BOOST
        </TouchButton>
      </div>
    </div>
  );
}
