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
          <div className="absolute left-3 pointer-events-none text-[var(--ink-2)]">
            {icon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-xl border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] transition-colors focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 font-sans',
            icon && 'pl-9',
            shortcut && 'pr-12',
            className
          )}
          {...props}
        />
        {shortcut && (
          <span className="absolute right-3 text-[10px] font-mono bg-[var(--panel)] text-[var(--ink-2)] px-1.5 py-0.5 rounded border border-[var(--rule)] pointer-events-none">
            {shortcut}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
