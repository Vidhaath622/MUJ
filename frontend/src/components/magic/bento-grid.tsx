import React from 'react';
import { cn } from '../../lib/utils';

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto',
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoCard = ({
  className,
  title,
  description,
  header,
  icon,
  children,
}: {
  className?: string;
  title?: string;
  description?: string;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        'row-span-1 rounded-2xl group/bento hover:shadow-2xl transition duration-200 shadow-input p-5 bg-[var(--panel)] border border-[var(--rule)] hover:border-[var(--rule)] flex flex-col justify-between space-y-4',
        className
      )}
    >
      {header && <div className="w-full">{header}</div>}
      <div className="group-hover/bento:translate-x-1 transition duration-200 space-y-2">
        {icon && <div className="text-[var(--accent)] mb-1">{icon}</div>}
        {title && (
          <div className="font-bold text-[var(--ink)] text-sm md:text-base tracking-tight">
            {title}
          </div>
        )}
        {description && (
          <div className="font-normal text-[var(--ink-2)] text-xs leading-relaxed">
            {description}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
