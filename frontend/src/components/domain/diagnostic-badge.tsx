import React from 'react';
import { cn } from '../../lib/utils';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Flame, 
  ShieldAlert, 
  AlertOctagon, 
  HelpCircle,
  FileQuestion 
} from 'lucide-react';
import { RootCauseCategory } from '../../types/ragseal';

export interface DiagnosticBadgeProps {
  category: RootCauseCategory;
  showIcon?: boolean;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const DiagnosticBadge: React.FC<DiagnosticBadgeProps> = ({
  category,
  showIcon = true,
  pulse = false,
  size = 'md',
  className,
}) => {
  const configs: Record<
    RootCauseCategory,
    { label: string; icon: React.ReactNode; classes: string; dotClass: string }
  > = {
    CLEAN_PASS: {
      label: 'CLEAN PASS',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--ok)]" />,
      classes: 'bg-[var(--ok-tint)] text-[var(--ok)] border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      dotClass: 'bg-[var(--ok)]',
    },
    RETRIEVAL_FAILURE: {
      label: 'RETRIEVAL FAILURE',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[var(--retr)]" />,
      classes: 'bg-[var(--retr-tint)] text-[var(--retr)] border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)] shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      dotClass: 'bg-[var(--retr)]',
    },
    GENERATION_HALLUCINATION: {
      label: 'GENERATION HALLUCINATION',
      icon: <Flame className="w-3.5 h-3.5 text-[var(--gen)]" />,
      classes: 'bg-[var(--gen-tint)] text-[var(--gen)] border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] shadow-[0_0_12px_rgba(244,63,94,0.15)]',
      dotClass: 'bg-[var(--gen)]',
    },
    COMPOUND_FAILURE: {
      label: 'COMPOUND FAILURE',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[var(--violet)]" />,
      classes: 'bg-[var(--violet-tint)] text-[var(--violet)] border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)] shadow-[0_0_12px_rgba(168,85,247,0.15)]',
      dotClass: 'bg-[var(--violet)]',
    },
    NEEDS_REVIEW: {
      label: 'NEEDS REVIEW',
      icon: <HelpCircle className="w-3.5 h-3.5 text-[var(--retr)]" />,
      classes: 'bg-[var(--retr-tint)] text-[var(--retr)] border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)] shadow-[0_0_12px_rgba(245,158,11,0.12)]',
      dotClass: 'bg-[var(--retr)]',
    },
    UNRESOLVED: {
      label: 'UNRESOLVED CONFLICT',
      icon: <FileQuestion className="w-3.5 h-3.5 text-[var(--ink-1)]" />,
      classes: 'bg-[var(--panel)] text-[var(--ink-1)] border-[var(--rule)] shadow-[0_0_12px_rgba(148,163,184,0.1)]',
      dotClass: 'bg-[var(--rule-2)]',
    },
    PARTIAL_CONTEXT_MISMATCH: {
      label: 'PARTIAL MISMATCH',
      icon: <AlertOctagon className="w-3.5 h-3.5 text-[var(--accent)]" />,
      classes: 'bg-[var(--accent-tint)] text-[var(--accent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] shadow-[0_0_12px_rgba(56,189,248,0.15)]',
      dotClass: 'bg-[var(--accent)]',
    },
  };

  const config = configs[category] || configs.CLEAN_PASS;

  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5'
      : size === 'lg'
      ? 'text-sm px-4 py-1.5'
      : 'text-xs px-2.5 py-1';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-mono font-bold border select-none transition-all',
        config.classes,
        sizeClasses,
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', config.dotClass)} />
          <span className={cn('relative inline-flex rounded-full h-2 w-2', config.dotClass)} />
        </span>
      )}
      {showIcon && !pulse && config.icon}
      <span>{config.label}</span>
    </div>
  );
};
