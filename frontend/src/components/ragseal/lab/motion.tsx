import React, { useEffect, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Counts a 0..1 score up to its value as a percentage; static under reduced motion. */
export const CountUp: React.FC<{ value: number | null | undefined; duration?: number }> = ({
  value,
  duration = 700,
}) => {
  const target = value == null ? null : Math.round(value * 100);
  const [shown, setShown] = useState(target ?? 0);

  useEffect(() => {
    if (target == null) return;
    if (prefersReducedMotion()) {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // rAF stalls in background tabs; always land on the real value.
    const settle = setTimeout(() => setShown(target), duration + 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [target, duration]);

  return <>{target == null ? '—' : `${shown}%`}</>;
};
