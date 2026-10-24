import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-mono border transition-colors select-none',
  {
    variants: {
      variant: {
        default: 'bg-neutral-900 text-neutral-300 border-neutral-700',
        success: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
        danger: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        warning: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        info: 'bg-sky-950/80 text-sky-300 border-sky-800/80',
        purple: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
        outline: 'bg-transparent text-neutral-300 border-neutral-700',
        neon: 'bg-sky-500/10 text-sky-400 border-sky-500/30 shadow-[0_0_12px_rgba(56,189,248,0.2)]',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.2',
        default: 'text-xs px-2.5 py-0.5',
        lg: 'text-sm px-3.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size,
  dot,
  pulse,
  children,
  ...props
}) => {
  const dotColorClass =
    variant === 'success'
      ? 'bg-emerald-400'
      : variant === 'danger'
      ? 'bg-rose-400'
      : variant === 'warning'
      ? 'bg-amber-400'
      : variant === 'info' || variant === 'neon'
      ? 'bg-sky-400'
      : variant === 'purple'
      ? 'bg-purple-400'
      : 'bg-neutral-400';

  return (
    <div className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                dotColorClass
              )}
            />
          )}
          <span className={cn('relative inline-flex rounded-full h-2 w-2', dotColorClass)} />
        </span>
      )}
      {children}
    </div>
  );
};
