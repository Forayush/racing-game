import { useEffect, useRef } from 'react';

type Handler = (e: KeyboardEvent) => void;

/**
 * Window-level shortcuts for the screen that is currently showing, keyed by `KeyboardEvent.code`.
 * Enter / Space are left alone while a button or link has focus (it activates itself), and
 * auto-repeat is ignored for them and Escape so a held key can't skip through several screens.
 */
export function useHotkeys(map: Record<string, Handler | undefined>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const activation = e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter';
      if ((activation || e.code === 'Escape') && e.repeat) return;
      if (activation && target?.closest('button, a')) return;
      const h = ref.current[e.code];
      if (!h) return;
      h(e);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
