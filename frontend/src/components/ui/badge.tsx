import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-mono border transition-colors select-none',
  {
    variants: {
      variant: {
        default: 'bg-[#FBF9F4] text-[#33322D] border-[#E3DED3]',
        success: 'bg-[#E6F0E8] text-[#1F7A4D] border-[#1F7A4D]/40',
        danger: 'bg-[#F6E3E0] text-[#B3261E] border-[#B3261E]/40',
        warning: 'bg-[#F5EBD8] text-[#B26B00] border-[#B26B00]/40',
        info: 'bg-[#E3EAF2] text-[#2F5D8A] border-[#2F5D8A]/40',
        purple: 'bg-[#ECE6F3] text-[#6B4C9A] border-[#6B4C9A]/40',
        outline: 'bg-transparent text-[#33322D] border-[#E3DED3]',
        neon: 'bg-[#2F5D8A] text-[#2F5D8A] border-[#2F5D8A]/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]',
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
      ? 'bg-[#1F7A4D]'
      : variant === 'danger'
      ? 'bg-[#B3261E]'
      : variant === 'warning'
      ? 'bg-[#B26B00]'
      : variant === 'info' || variant === 'neon'
      ? 'bg-[#2F5D8A]'
      : variant === 'purple'
      ? 'bg-[#6B4C9A]'
      : 'bg-[#D6D0C3]';

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
