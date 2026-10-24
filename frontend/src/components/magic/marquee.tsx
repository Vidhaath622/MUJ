import React from 'react';
import { cn } from '../../lib/utils';

export interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  pauseOnHover?: boolean;
  reverse?: boolean;
}

export const Marquee: React.FC<MarqueeProps> = ({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)] select-none',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'flex shrink-0 justify-around [gap:var(--gap)] animate-marquee',
          reverse && '[animation-direction:reverse]',
          pauseOnHover && 'group-hover:[animation-play-state:paused]'
        )}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'flex shrink-0 justify-around [gap:var(--gap)] animate-marquee',
          reverse && '[animation-direction:reverse]',
          pauseOnHover && 'group-hover:[animation-play-state:paused]'
        )}
      >
        {children}
      </div>
    </div>
  );
};
