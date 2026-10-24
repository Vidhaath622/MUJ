import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F5D8A]/40 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-white text-black hover:bg-[#D6D0C3] shadow-sm font-semibold',
        primary: 'bg-[#2F5D8A] text-[#1B1B18] hover:bg-[#2F5D8A] shadow-md shadow-[#2F5D8A]/10',
        secondary: 'bg-[#FBF9F4] text-[#1B1B18] hover:bg-[#E3DED3] border border-[#E3DED3]',
        outline: 'border border-[#E3DED3] text-[#33322D] hover:bg-[#FBF9F4] hover:text-[#1B1B18]',
        ghost: 'text-[#5E5B53] hover:text-[#1B1B18] hover:bg-[#FBF9F4]',
        destructive: 'bg-[#B3261E] text-[#1B1B18] hover:bg-[#B3261E] shadow-md shadow-[#B3261E]/10',
        glow: 'relative bg-gradient-to-r from-[#2F5D8A] to-[#2F5D8A] text-[#1B1B18] hover:from-[#2F5D8A] hover:to-[#2F5D8A] shadow-lg shadow-[#2F5D8A]/10 border border-[#2F5D8A]/40',
        shine: 'relative overflow-hidden bg-[#FBF9F4] border border-[#E3DED3] text-[#1B1B18] hover:border-[#D6D0C3] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
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
