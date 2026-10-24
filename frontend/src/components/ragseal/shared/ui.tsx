import React from 'react';
import { Loader2, PlugZap } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { NotAvailable } from './apiExtra';

// Small building blocks shared by every page, in the Lab's visual language.

export const PACKS: { id: PackId; label: string }[] = [
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'banking', label: 'Banking' },
  { id: 'healthcare', label: 'Healthcare' },
];

/** The labelled packs above plus the real IRS documents and RAGSeal's own docs (not labelled). */
export const ALL_PACKS: { id: PackId; label: string }[] = [
  ...PACKS,
  { id: 'realworld', label: 'Real documents' },
  { id: 'ragseal', label: 'RAGSeal guide' },
];

export const PACK_LABEL: Record<string, string> = Object.fromEntries(ALL_PACKS.map((p) => [p.id, p.label]));

export const Panel: React.FC<{
  title?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  raised?: boolean;
  children: React.ReactNode;
}> = ({ title, note, className, bodyClassName, raised, children }) => (
  <section className={cn(raised ? 'lab-panel' : 'lab-panel-flat', 'flex min-h-0 flex-col rounded-2xl', className)}>
    {title && (
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule)] px-5 py-3.5 text-[13px]">
        <h2 className="font-medium text-[var(--ink)]">{title}</h2>
        {note && <span className="text-xs text-[var(--ink-2)]">{note}</span>}
      </div>
    )}
    <div className={cn('min-h-0 flex-1', bodyClassName ?? 'p-5')}>{children}</div>
  </section>
);

export const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  big?: boolean;
}> = ({ label, value, sub, color, big }) => (
  <div className="min-w-0">
    <div className="text-xs text-[var(--ink-2)]">{label}</div>
    <div
      className={cn(
        'mt-1 font-semibold tabular-nums tracking-[-0.03em]',
        big ? 'text-[40px] leading-none' : 'text-[22px] leading-tight'
      )}
      style={{ color: color ?? 'var(--ink)' }}
    >
      {value}
    </div>
    {sub && <div className="mt-1 text-xs text-[var(--ink-2)]">{sub}</div>}
  </div>
);

export const PackSwitcher: React.FC<{
  value: PackId;
  onChange: (p: PackId) => void;
  packs?: { id: PackId; label: string }[];
}> = ({ value, onChange, packs = PACKS }) => (
  <div className="flex items-center gap-0.5 rounded-[10px] border border-[var(--panel-2)] p-[3px] text-[13px]" role="tablist">
    {packs.map((p) => (
      <button
        key={p.id}
        role="tab"
        aria-selected={value === p.id}
        onClick={() => onChange(p.id)}
        className={cn(
          'rounded-[7px] px-3 py-[5px] transition-colors',
          value === p.id
            ? 'bg-[var(--panel-2)] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(27,27,24,0.06)]'
            : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
        )}
      >
        {p.label}
      </button>
    ))}
  </div>
);

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }> = ({
  busy,
  className,
  children,
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || busy}
    className={cn(
      'flex h-[34px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-[var(--ink)] px-3.5 text-[13px] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-1)] disabled:cursor-not-allowed disabled:bg-[var(--panel-2)] disabled:text-[var(--ink-2)]',
      className
    )}
  >
    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    {children}
  </button>
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...rest }) => (
  <button
    {...rest}
    className={cn(
      'flex h-[34px] items-center gap-2 whitespace-nowrap rounded-[9px] border border-[var(--rule-2)] px-3 text-[13px] text-[var(--ink-1)] transition-colors hover:border-[var(--rule-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
  >
    {children}
  </button>
);

/** Empty / waiting / error states. A missing endpoint gets its own honest message. */
export const EmptyState: React.FC<{
  title: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, children, icon, className }) => (
  <div
    className={cn(
      'flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--rule)] px-6 py-8 text-center',
      className
    )}
  >
    {icon && <div className="mb-1 text-[var(--muted)]">{icon}</div>}
    <div className="text-sm font-medium text-[var(--ink-1)]">{title}</div>
    {children && <div className="max-w-md text-[13px] leading-relaxed text-[var(--ink-2)]">{children}</div>}
  </div>
);

export const LoadState: React.FC<{ error: unknown; loading?: boolean; what: string; className?: string }> = ({
  error,
  loading,
  what,
  className,
}) => {
  if (loading) {
    return (
      <EmptyState className={className} title={`Loading ${what}…`} icon={<Loader2 className="h-5 w-5 animate-spin" />} />
    );
  }
  if (error instanceof NotAvailable) {
    return (
      <EmptyState className={className} title="Backend endpoint not available yet" icon={<PlugZap className="h-5 w-5" />}>
        This view is wired to <span className="font-mono text-[var(--ink-1)]">{error.message.split(': ')[1]}</span>. It fills
        in as soon as the backend ships it; nothing here is simulated.
      </EmptyState>
    );
  }
  if (error) {
    return (
      <EmptyState className={className} title={`Couldn't load ${what}`}>
        <span className="text-[var(--gen-deep)]">{error instanceof Error ? error.message : String(error)}</span>
      </EmptyState>
    );
  }
  return null;
};

export const ErrorBanner: React.FC<{ message: string | null; onDismiss?: () => void }> = ({ message, onDismiss }) =>
  message ? (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--gen)_10%,transparent)] px-4 py-2.5 text-sm text-[var(--gen-deep)]">
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-[var(--gen)] hover:text-[var(--ink)]">
          Dismiss
        </button>
      )}
    </div>
  ) : null;

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  return v == null || !isFinite(v) ? '—' : v.toFixed(digits);
}

export function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
