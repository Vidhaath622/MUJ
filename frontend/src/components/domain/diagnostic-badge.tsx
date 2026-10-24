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
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-[#1F7A4D]" />,
      classes: 'bg-[#E6F0E8] text-[#1F7A4D] border-[#1F7A4D]/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      dotClass: 'bg-[#1F7A4D]',
    },
    RETRIEVAL_FAILURE: {
      label: 'RETRIEVAL FAILURE',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[#B26B00]" />,
      classes: 'bg-[#F5EBD8] text-[#B26B00] border-[#B26B00]/40 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      dotClass: 'bg-[#B26B00]',
    },
    GENERATION_HALLUCINATION: {
      label: 'GENERATION HALLUCINATION',
      icon: <Flame className="w-3.5 h-3.5 text-[#B3261E]" />,
      classes: 'bg-[#F6E3E0] text-[#B3261E] border-[#B3261E]/40 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
      dotClass: 'bg-[#B3261E]',
    },
    COMPOUND_FAILURE: {
      label: 'COMPOUND FAILURE',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-[#6B4C9A]" />,
      classes: 'bg-[#ECE6F3] text-[#6B4C9A] border-[#6B4C9A]/40 shadow-[0_0_12px_rgba(168,85,247,0.15)]',
      dotClass: 'bg-[#6B4C9A]',
    },
    NEEDS_REVIEW: {
      label: 'NEEDS REVIEW',
      icon: <HelpCircle className="w-3.5 h-3.5 text-[#B26B00]" />,
      classes: 'bg-[#F5EBD8] text-[#B26B00] border-[#B26B00]/40 shadow-[0_0_12px_rgba(245,158,11,0.12)]',
      dotClass: 'bg-[#B26B00]',
    },
    UNRESOLVED: {
      label: 'UNRESOLVED CONFLICT',
      icon: <FileQuestion className="w-3.5 h-3.5 text-[#33322D]" />,
      classes: 'bg-[#FBF9F4] text-[#33322D] border-[#E3DED3] shadow-[0_0_12px_rgba(148,163,184,0.1)]',
      dotClass: 'bg-[#D6D0C3]',
    },
    PARTIAL_CONTEXT_MISMATCH: {
      label: 'PARTIAL MISMATCH',
      icon: <AlertOctagon className="w-3.5 h-3.5 text-[#2F5D8A]" />,
      classes: 'bg-[#E3EAF2] text-[#2F5D8A] border-[#2F5D8A]/40 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
      dotClass: 'bg-[#2F5D8A]',
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
