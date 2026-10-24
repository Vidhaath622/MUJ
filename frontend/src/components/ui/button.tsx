import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-white text-black hover:bg-neutral-200 shadow-sm font-semibold',
        primary: 'bg-sky-600 text-white hover:bg-sky-500 shadow-md shadow-sky-600/20',
        secondary: 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700 border border-neutral-700',
        outline: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800/80 hover:text-white',
        ghost: 'text-neutral-400 hover:text-white hover:bg-neutral-800/60',
        destructive: 'bg-rose-600/90 text-white hover:bg-rose-600 shadow-md shadow-rose-900/30',
        glow: 'relative bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-400 hover:to-indigo-500 shadow-lg shadow-sky-500/25 border border-sky-400/30',
        shine: 'relative overflow-hidden bg-neutral-900 border border-neutral-700 text-white hover:border-neutral-500 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
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
