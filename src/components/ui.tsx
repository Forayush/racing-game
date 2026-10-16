import type { ButtonHTMLAttributes, ReactNode, SVGProps } from 'react';
import { cn } from '@/utils/cn';

export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Icons (24px grid, stroke = currentColor, sized by font-size)
// ---------------------------------------------------------------------------

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  );
}

const solid = { fill: 'currentColor', stroke: 'none' } as const;

export const Icon = {
  SoundOn: (p: IconProps) => (
    <Svg {...p}>
      <path d="M11 5 6 9H3v6h3l5 4V5z" {...solid} />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Svg>
  ),
  SoundOff: (p: IconProps) => (
    <Svg {...p}>
      <path d="M11 5 6 9H3v6h3l5 4V5z" {...solid} />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </Svg>
  ),
  Pause: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" {...solid} />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" {...solid} />
    </Svg>
  ),
  Play: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 7 5.2z" {...solid} />
    </Svg>
  ),
  Restart: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4.5V9h4.5" />
    </Svg>
  ),
  Exit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M9.5 16.5 5 12l4.5-4.5M5 12h10" />
    </Svg>
  ),
  Flag: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 21V4" />
      <path d="M5 4.5c3-1.6 5.5 1.6 8.5 0s4.5 0 4.5 0v9s-1.5-1.6-4.5 0-5.5-1.6-8.5 0" />
    </Svg>
  ),
  Trophy: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 21h8M12 16.5V21" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16.4 11M7 6H4.5v1.5A3.5 3.5 0 0 0 7.6 11" />
    </Svg>
  ),
  Help: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3" />
      <path d="M12 17.2v.1" />
    </Svg>
  ),
  ChevronLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="m14.5 5-7 7 7 7" />
    </Svg>
  ),
  ChevronRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="m9.5 5 7 7-7 7" />
    </Svg>
  ),
  Bolt: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13.5 2 4.5 13.5H11L10 22l9.5-11.5H13z" {...solid} />
    </Svg>
  ),
  Trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="m6 7 1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4h6v3" />
    </Svg>
  ),
  Road: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 3 4.5 21M16 3l3.5 18M12 4v2.5M12 10.5v3M12 17.5V20" />
    </Svg>
  ),
  Overtake: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 20V9M3 12l3-3 3 3" />
      <path d="M18 20V4M15 7l3-3 3 3" />
    </Svg>
  ),
  Spark: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </Svg>
  ),
  Combo: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  ),
  Gauge: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.2 17.5a9 9 0 1 1 15.6 0" />
      <path d="m12 13.5 4.5-5" />
    </Svg>
  ),
  Gate: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V21" />
      <path d="M4 9h16" />
    </Svg>
  ),
};

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[1.7em] min-w-[1.7em] items-center justify-center rounded-[5px] border border-b-[3px] border-white/25 bg-white/10 px-1.5 font-ui text-[11px] font-bold not-italic leading-none tracking-normal text-white/90',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

interface RaceButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: 'md' | 'lg';
  icon?: ReactNode;
  /** Keyboard hint shown after the label on tablet / desktop widths. */
  hint?: ReactNode;
}

/** Skewed motorsport-style button. */
export function RaceButton({ variant = 'primary', size = 'md', icon, hint, className, children, ...rest }: RaceButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'btn-race inline-flex items-center justify-center gap-2.5 whitespace-nowrap font-display uppercase',
        variant === 'primary'
          ? 'btn-shine bg-f1red text-white hover:bg-[#f5150c]'
          : 'border border-white/20 bg-white/[0.06] text-white/90 hover:border-white/40 hover:bg-white/[0.13] hover:text-white',
        size === 'lg' ? 'px-8 py-4 text-xl tracking-[0.2em] xl:px-10 xl:text-2xl' : 'px-7 py-3 text-sm tracking-[0.18em] sm:text-base',
        className,
      )}
      {...rest}
    >
      {icon && <span className="-ml-1 flex shrink-0 text-[1.05em]">{icon}</span>}
      <span>{children}</span>
      {hint && <span className="ml-1 hidden items-center gap-1 opacity-80 sm:inline-flex">{hint}</span>}
    </button>
  );
}

export function SoundButton({ muted, onToggle, className }: { muted: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Sound"
      aria-pressed={!muted}
      title="Sound on / off (M)"
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 transition hover:border-white/35 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {muted ? <Icon.SoundOff className="text-base text-white/55" /> : <Icon.SoundOn className="text-base text-boost" />}
      <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span>
    </button>
  );
}
