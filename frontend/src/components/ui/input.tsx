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
          <div className="absolute left-3 pointer-events-none text-[#5E5B53]">
            {icon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-xl border border-[#E3DED3] bg-[#FBF9F4] px-3 py-2 text-sm text-[#1B1B18] placeholder:text-[#6E6A62] transition-colors focus:border-[#2F5D8A]/40 focus:outline-none focus:ring-1 focus:ring-[#2F5D8A]/40 disabled:cursor-not-allowed disabled:opacity-50 font-sans',
            icon && 'pl-9',
            shortcut && 'pr-12',
            className
          )}
          {...props}
        />
        {shortcut && (
          <span className="absolute right-3 text-[10px] font-mono bg-[#FBF9F4] text-[#5E5B53] px-1.5 py-0.5 rounded border border-[#E3DED3] pointer-events-none">
            {shortcut}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
