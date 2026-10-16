import { useEffect, useRef } from 'react';
import { Game, type Phase, type RunStats } from '@/game/engine';
import type { Input } from '@/game/input';
import type { AudioEngine } from '@/game/audio';

interface Props {
  input: Input;
  audio: AudioEngine;
  steerEnabled: boolean;
  onReady: (game: Game) => void;
  onGameOver: (stats: RunStats) => void;
  onPhase: (phase: Phase) => void;
  onMute: (muted: boolean) => void;
  onTouchDetected: () => void;
}

type Side = 'left' | 'right';

export default function GameCanvas({ input, audio, steerEnabled, onReady, onGameOver, onPhase, onMute, onTouchDetected }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onGameOver, onPhase, onMute, onReady, onTouchDetected });
  cbRef.current = { onGameOver, onPhase, onMute, onReady, onTouchDetected };
  const pointers = useRef(new Map<number, Side>());
  const steerRef = useRef(steerEnabled);
  steerRef.current = steerEnabled;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const game = new Game(canvas, input, audio, {
      onGameOver: (s) => cbRef.current.onGameOver(s),
      onPhase: (p) => cbRef.current.onPhase(p),
      onMute: (m) => cbRef.current.onMute(m),
    });

    const doResize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      // cap the backing store so low-end phones keep 60fps
      const budget = 2_400_000;
      if (w * h * dpr * dpr > budget) dpr = Math.max(1, Math.sqrt(budget / (w * h)));
      // notch / home-indicator insets, resolved by the probe's env() padding
      const probe = safeRef.current;
      if (probe) {
        const cs = getComputedStyle(probe);
        const px = (v: string) => parseFloat(v) || 0;
        game.setSafeArea(px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft));
      }
      game.resize(w, h, dpr);
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);
    window.addEventListener('orientationchange', doResize);
    cbRef.current.onReady(game);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', doResize);
      game.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // release any held steering when controls get disabled (pause / game over)
  useEffect(() => {
    if (!steerEnabled) {
      pointers.current.clear();
      input.setTouch('left', false);
      input.setTouch('right', false);
    }
  }, [steerEnabled, input]);

  const sideFor = (x: number): Side => (x < window.innerWidth / 2 ? 'left' : 'right');

  const release = (id: number) => {
    const cur = pointers.current.get(id);
    if (!cur) return;
    pointers.current.delete(id);
    let stillHeld = false;
    pointers.current.forEach((s) => {
      if (s === cur) stillHeld = true;
    });
    if (!stillHeld) input.setTouch(cur, false);
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden bg-night"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        cbRef.current.onTouchDetected();
        if (!steerRef.current) return;
        const side = sideFor(e.clientX);
        pointers.current.set(e.pointerId, side);
        input.setTouch(side, true);
      }}
      onPointerMove={(e) => {
        const cur = pointers.current.get(e.pointerId);
        if (!cur) return;
        const side = sideFor(e.clientX);
        if (side !== cur) {
          release(e.pointerId);
          pointers.current.set(e.pointerId, side);
          input.setTouch(side, true);
        }
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      <div
        ref={safeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-0 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]"
      />
    </div>
  );
}
