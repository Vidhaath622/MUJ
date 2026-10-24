import React from 'react';
import { cn } from '../../lib/utils';

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  label,
  description,
  checked,
  onChange,
  className,
  disabled,
  ...props
}) => {
  return (
    <label className={cn('inline-flex items-center gap-3 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-50', className)}>
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          {...props}
        />
        <div
          className={cn(
            'w-10 h-6 bg-neutral-800 rounded-full transition-colors',
            checked && 'bg-sky-600'
          )}
        />
        <div
          className={cn(
            'absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform',
            checked && 'transform translate-x-4'
          )}
        />
      </div>
      {(label || description) && (
        <div className="flex flex-col text-xs">
          {label && <span className="font-medium text-neutral-200">{label}</span>}
          {description && <span className="text-neutral-400">{description}</span>}
        </div>
      )}
    </label>
  );
};
