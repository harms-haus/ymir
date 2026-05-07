import { useEffect, useRef, useCallback } from 'react';

const FADE_TIMEOUT_MS = 5000;

export function useScrollbarFade(containerRef: React.RefObject<HTMLElement | null>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseMove = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    el.classList.add('scrollbar-visible');

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      el.classList.remove('scrollbar-visible');
    }, FADE_TIMEOUT_MS);
  }, [containerRef]);

  const handleMouseLeave = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    el.classList.remove('scrollbar-visible');
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [containerRef, handleMouseMove, handleMouseLeave]);
}
