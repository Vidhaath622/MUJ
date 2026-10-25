import React from 'react';
import { ChevronDown, Loader2, PlugZap } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { NotAvailable } from './apiExtra';
import { PACK_GROUPS, PACK_NAMES, PackOption, usePacks } from './packs';

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

/** Display names by pack id; every pack the backend serves once the list has loaded (shared/packs.ts). */
export const PACK_LABEL: Record<string, string> = PACK_NAMES;

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
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule)] px-5 py-3.5 text-[0.875rem]">
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
        big ? 'text-[2.5rem] leading-none' : 'text-[1.375rem] leading-tight'
      )}
      style={{ color: color ?? 'var(--ink)' }}
    >
      {value}
    </div>
    {sub && <div className="mt-1 text-xs text-[var(--ink-2)]">{sub}</div>}
  </div>
);

/** Tabs fit a handful of packs; past this many the switcher becomes a grouped menu. */
const MAX_TABS = 6;

export const PackSwitcher: React.FC<{
  value: PackId;
  onChange: (p: PackId) => void;
  /** A fixed list; omitted, the switcher offers every pack the backend serves. */
  packs?: { id: PackId; label: string }[];
}> = ({ value, onChange, packs }) => {
  const all = usePacks();
  const options: (PackOption | { id: PackId; label: string; group?: string; questions?: number })[] = packs ?? all;
  if (options.length > MAX_TABS) return <PackMenu value={value} onChange={onChange} options={options} />;
  return (
    <div className="flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-[10px] border border-[var(--panel-2)] p-[3px] text-xs sm:text-[0.875rem] no-scrollbar" role="tablist">
      {options.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={value === p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-[7px] px-2.5 sm:px-3 py-1 sm:py-[5px] transition-colors',
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
};

/** The grouped form of PackSwitcher: a native select (keyboard and screen-reader friendly) dressed like the tabs. */
const PackMenu: React.FC<{
  value: PackId;
  onChange: (p: PackId) => void;
  options: { id: PackId; label: string; group?: string; questions?: number }[];
}> = ({ value, onChange, options }) => {
  const groups = PACK_GROUPS.map((g) => ({ g, items: options.filter((o) => (o.group ?? 'Other') === g) })).filter((x) => x.items.length);
  const known = options.some((o) => o.id === value);
  return (
    <label className="relative flex shrink-0 items-center rounded-[10px] border border-[var(--panel-2)] text-xs sm:text-[0.875rem]">
      <span className="sr-only">Test pack</span>
      <select
        value={known ? value : ''}
        onChange={(e) => onChange(e.target.value as PackId)}
        className="h-[32px] max-w-[300px] cursor-pointer appearance-none truncate rounded-[10px] bg-transparent pl-3 pr-8 text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--rule-3)]"
      >
        {!known && <option value="">Choose a pack</option>}
        {groups.map(({ g, items }) => (
          <optgroup key={g} label={g}>
            {items.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.questions != null ? ` · ${o.questions} questions` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[var(--ink-2)]" />
    </label>
  );
};

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
      'flex h-[34px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-[var(--ink)] px-3.5 text-[0.875rem] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-1)] disabled:cursor-not-allowed disabled:bg-[var(--panel-2)] disabled:text-[var(--ink-2)]',
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
      'flex h-[34px] items-center gap-2 whitespace-nowrap rounded-[9px] border border-[var(--rule-2)] px-3 text-[0.875rem] text-[var(--ink-1)] transition-colors hover:border-[var(--rule-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50',
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
    {children && <div className="max-w-md text-[0.875rem] leading-relaxed text-[var(--ink-2)]">{children}</div>}
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

/** Marks the demo account's run, which new users see until they run the pack themselves. */
export const SampleBadge: React.FC<{ className?: string }> = ({ className }) => (
  <span
    title="A sample run from the demo account. Run this pack to get your own."
    className={cn(
      'inline-flex items-center rounded-full border border-[var(--rule-2)] px-1.5 py-px text-[0.71875rem] font-medium text-[var(--ink-2)]',
      className
    )}
  >
    Sample
  </span>
);
