import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-mono border transition-colors select-none',
  {
    variants: {
      variant: {
        default: 'bg-[var(--panel)] text-[var(--ink-1)] border-[var(--rule)]',
        success: 'bg-[var(--ok-tint)] text-[var(--ok)] border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]',
        danger: 'bg-[var(--gen-tint)] text-[var(--gen)] border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)]',
        warning: 'bg-[var(--retr-tint)] text-[var(--retr)] border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)]',
        info: 'bg-[var(--accent-tint)] text-[var(--accent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]',
        purple: 'bg-[var(--violet-tint)] text-[var(--violet)] border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)]',
        outline: 'bg-transparent text-[var(--ink-1)] border-[var(--rule)]',
        neon: 'bg-[var(--accent)] text-[var(--accent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_0_12px_rgba(56,189,248,0.2)]',
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
      ? 'bg-[var(--ok)]'
      : variant === 'danger'
      ? 'bg-[var(--gen)]'
      : variant === 'warning'
      ? 'bg-[var(--retr)]'
      : variant === 'info' || variant === 'neon'
      ? 'bg-[var(--accent)]'
      : variant === 'purple'
      ? 'bg-[var(--violet)]'
      : 'bg-[var(--rule-2)]';

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
