import { useMemo } from 'react';
import { getCircuit } from '@/game/circuitBuilder';
import type { CircuitDef } from '@/game/circuits';
import { cn } from '@/utils/cn';

interface Props {
  circuit: CircuitDef;
  className?: string;
  /** Stroke colour of the track line. */
  color?: string;
  /** Mark the start / finish line. */
  showStart?: boolean;
}

/** Circuit outline from the same geometry the game drives on. */
export default function CircuitMap({ circuit, className, color = 'currentColor', showStart = true }: Props) {
  const built = useMemo(() => getCircuit(circuit), [circuit]);
  const sx = 6 + built.map[0] * 88;
  const sy = 6 + built.map[1] * 88;
  return (
    <svg viewBox="0 0 100 100" className={cn('overflow-visible', className)} aria-label={`${circuit.circuit} layout`} role="img">
      <path d={built.svg} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
      <path d={built.svg} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      {showStart && <circle cx={sx} cy={sy} r={3.2} fill="#ffd400" stroke="#000" strokeWidth={0.8} />}
    </svg>
  );
}
