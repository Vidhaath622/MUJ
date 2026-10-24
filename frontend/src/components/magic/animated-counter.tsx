import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  precision?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 800,
  precision = 0,
  suffix = '',
  prefix = '',
  className,
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const difference = value - startValue;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out quad
      const easeProgress = 1 - (1 - progress) * (1 - progress);
      const current = startValue + difference * easeProgress;
      setDisplayValue(current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]);

  return (
    <span className={cn('font-mono font-bold tracking-tight', className)}>
      {prefix}
      {displayValue.toFixed(precision)}
      {suffix}
    </span>
  );
};
