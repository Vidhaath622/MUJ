import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-white text-black hover:bg-[var(--rule-2)] shadow-sm font-semibold',
        primary: 'bg-[var(--accent)] text-[var(--ink)] hover:bg-[var(--accent)] shadow-md shadow-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]',
        secondary: 'bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--rule)] border border-[var(--rule)]',
        outline: 'border border-[var(--rule)] text-[var(--ink-1)] hover:bg-[var(--panel)] hover:text-[var(--ink)]',
        ghost: 'text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--panel)]',
        destructive: 'bg-[var(--gen)] text-[var(--ink)] hover:bg-[var(--gen)] shadow-md shadow-[color:color-mix(in_srgb,var(--gen)_10%,transparent)]',
        glow: 'relative bg-gradient-to-r from-[var(--accent)] to-[var(--accent)] text-[var(--ink)] hover:from-[var(--accent)] hover:to-[var(--accent)] shadow-lg shadow-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]',
        shine: 'relative overflow-hidden bg-[var(--panel)] border border-[var(--rule)] text-[var(--ink)] hover:border-[var(--rule-2)] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs rounded-md',
        sm: 'h-8 px-3 text-xs',
        default: 'h-9 px-4 py-2 text-sm',
        lg: 'h-11 px-6 text-base rounded-xl',
        icon: 'h-9 w-9 p-0',
        iconSm: 'h-7 w-7 p-0 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
