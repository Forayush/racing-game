import { useEffect, useRef } from 'react';
import { renderCar } from '@/game/sprites';
import type { Livery } from '@/game/drivers';

interface Props {
  livery: Livery;
  className?: string;
  /** Backing-store width in px; the height follows the sprite's 24:13 ratio. Raise it for large previews. */
  res?: number;
}

/** Draws the procedurally generated rear-view car sprite for a livery. */
export default function CarPreview({ livery, className, res = 480 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const img = renderCar(livery, res, Math.round((res * 13) / 24));
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
  }, [livery, res]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
