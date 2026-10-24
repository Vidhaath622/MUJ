import React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  thresholdPass?: number;
  thresholdWarn?: number;
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  thresholdPass = 70,
  thresholdWarn = 50,
  showLabel = false,
  variant,
  size = 'md',
  className,
  ...props
}) => {
  const clamped = Math.min(100, Math.max(0, value));

  let barColor: string;
  if (variant === 'success') {
    barColor = 'bg-emerald-500';
  } else if (variant === 'warning') {
    barColor = 'bg-amber-500';
  } else if (variant === 'danger') {
    barColor = 'bg-rose-500';
  } else {
    barColor =
      clamped >= thresholdPass
        ? 'bg-emerald-500'
        : clamped >= thresholdWarn
        ? 'bg-amber-500'
        : 'bg-rose-500';
  }

  const heightClass = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';

  return (
    <div className={cn('w-full space-y-1', className)} {...props}>
      <div className={cn('w-full bg-neutral-800 rounded-full overflow-hidden', heightClass)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-[11px] font-mono text-neutral-400">
          <span>Score</span>
          <span className="font-bold text-white">{clamped.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
};

export interface CircularProgressProps extends React.SVGAttributes<SVGSVGElement> {
  value: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  thresholdPass?: number;
  thresholdWarn?: number;
  label?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 72,
  strokeWidth = 6,
  thresholdPass = 70,
  thresholdWarn = 50,
  label,
  className,
  ...props
}) => {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    clamped >= thresholdPass
      ? 'text-emerald-400 stroke-emerald-500'
      : clamped >= thresholdWarn
      ? 'text-amber-400 stroke-amber-500'
      : 'text-rose-400 stroke-rose-500';

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        className={cn('-rotate-90', className)}
        {...props}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-800 fill-transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn('fill-transparent transition-all duration-700 ease-out', strokeColor)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-bold font-mono text-white leading-none">
          {clamped.toFixed(0)}%
        </span>
        {label && (
          <span className="text-[9px] font-mono text-neutral-400 uppercase mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
