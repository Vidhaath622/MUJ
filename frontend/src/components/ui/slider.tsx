import React from 'react';
import { cn } from '../../lib/utils';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  valueDisplay?: string | number;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  valueDisplay,
  className,
  value,
  min = 0,
  max = 100,
  step = 1,
  ...props
}) => {
  return (
    <div className="w-full space-y-1.5 font-sans">
      {(label || valueDisplay !== undefined) && (
        <div className="flex justify-between items-center text-xs">
          {label && <span className="text-[#5E5B53] font-medium">{label}</span>}
          {valueDisplay !== undefined && (
            <span className="font-mono font-bold text-[#2F5D8A] text-xs">
              {valueDisplay}
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className={cn(
          'w-full h-1.5 bg-[#FBF9F4] rounded-lg appearance-none cursor-pointer accent-[#2F5D8A] focus:outline-none',
          className
        )}
        {...props}
      />
    </div>
  );
};
