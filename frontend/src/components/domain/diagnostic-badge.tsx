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
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
      classes: 'bg-emerald-950/80 text-emerald-300 border-emerald-800 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      dotClass: 'bg-emerald-400',
    },
    RETRIEVAL_FAILURE: {
      label: 'RETRIEVAL FAILURE',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
      classes: 'bg-amber-950/80 text-amber-300 border-amber-800 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      dotClass: 'bg-amber-400',
    },
    GENERATION_HALLUCINATION: {
      label: 'GENERATION HALLUCINATION',
      icon: <Flame className="w-3.5 h-3.5 text-rose-400" />,
      classes: 'bg-rose-950/80 text-rose-300 border-rose-800 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
      dotClass: 'bg-rose-400',
    },
    COMPOUND_FAILURE: {
      label: 'COMPOUND FAILURE',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />,
      classes: 'bg-purple-950/80 text-purple-300 border-purple-800 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
      dotClass: 'bg-purple-400',
    },
    NEEDS_REVIEW: {
      label: 'NEEDS REVIEW',
      icon: <HelpCircle className="w-3.5 h-3.5 text-amber-400" />,
      classes: 'bg-amber-950/60 text-amber-300 border-amber-700 shadow-[0_0_12px_rgba(245,158,11,0.12)]',
      dotClass: 'bg-amber-400',
    },
    UNRESOLVED: {
      label: 'UNRESOLVED CONFLICT',
      icon: <FileQuestion className="w-3.5 h-3.5 text-slate-300" />,
      classes: 'bg-slate-900 text-slate-300 border-slate-700 shadow-[0_0_12px_rgba(148,163,184,0.1)]',
      dotClass: 'bg-slate-400',
    },
    PARTIAL_CONTEXT_MISMATCH: {
      label: 'PARTIAL MISMATCH',
      icon: <AlertOctagon className="w-3.5 h-3.5 text-sky-400" />,
      classes: 'bg-sky-950/80 text-sky-300 border-sky-800 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
      dotClass: 'bg-sky-400',
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
