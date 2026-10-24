import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  shortcut?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, shortcut, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {icon && (
          <div className="absolute left-3 pointer-events-none text-neutral-400">
            {icon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-xl border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 transition-colors focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 font-sans',
            icon && 'pl-9',
            shortcut && 'pr-12',
            className
          )}
          {...props}
        />
        {shortcut && (
          <span className="absolute right-3 text-[10px] font-mono bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700 pointer-events-none">
            {shortcut}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
