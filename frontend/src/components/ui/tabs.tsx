import React, { createContext, useContext, useState } from 'react';
import { cn } from '../../lib/utils';

interface TabsContextType {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string;
  value?: string;
  onValueChange?: (val: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  children,
  ...props
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = (val: string) => {
    if (controlledValue === undefined) setInternalValue(val);
    onValueChange?.(val);
  };

  return (
    <TabsContext.Provider value={{ value: activeValue, onValueChange: handleValueChange }}>
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'pills' | 'underline' }
>(({ className, variant = 'pills', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      variant === 'pills'
        ? 'inline-flex items-center justify-center rounded-xl bg-[var(--panel)] border border-[var(--rule)] p-1 text-[var(--ink-2)] gap-1'
        : 'flex items-center gap-6 border-b border-[var(--rule)] text-[var(--ink-2)] pb-px',
      className
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  badge?: string | number;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, badge, children, ...props }, ref) => {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error('TabsTrigger must be used within Tabs');
    const isActive = ctx.value === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => ctx.onValueChange(value)}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium font-mono transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none gap-2',
          isActive
            ? 'bg-[var(--panel)] text-[var(--ink)] shadow-sm font-semibold'
            : 'text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--panel)]',
          className
        )}
        {...props}
      >
        {children}
        {badge !== undefined && (
          <span
            className={cn(
              'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
              isActive
                ? 'bg-[var(--accent)] text-[var(--accent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]'
                : 'bg-[var(--panel)] text-[var(--ink-2)]'
            )}
          >
            {badge}
          </span>
        )}
      </button>
    );
  }
);
TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = useContext(TabsContext);
    if (!ctx) throw new Error('TabsContent must be used within Tabs');
    if (ctx.value !== value) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn('mt-4 focus-visible:outline-none animate-in fade-in-50 duration-200', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = 'TabsContent';
