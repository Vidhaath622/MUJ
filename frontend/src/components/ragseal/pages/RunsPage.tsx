import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Play, Timer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { TopBarControls } from '../shell/AppShell';
import { AMBER, PASS, RED, pct } from '../lab/verdict';
import { errorText, getProgress, listRuns, RunListItem, RunProgress, startRun } from '../shared/apiExtra';
import {
  EmptyState,
  ErrorBanner,
  fmtDuration,
  fmtTime,
  LoadState,
  PACK_LABEL,
  PackSwitcher,
  Panel,
  PrimaryButton,
} from '../shared/ui';

/** PS requirement: 200 questions evaluated in 15 minutes or less. */
const BUDGET_QUESTIONS = 200;
const BUDGET_MS = 15 * 60 * 1000;
const POLL_MS = 1500;

interface RunsPageProps {
  token: string | null;
  packId: PackId;
  onPackChange: (p: PackId) => void;
  onOpenRun: (batchId: string, packId?: string) => void;
}

export const RunsPage: React.FC<RunsPageProps> = ({ token, packId, onPackChange, onOpenRun }) => {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<Record<string, RunProgress>>({});
  const polling = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const list = await listRuns(token);
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRuns(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const poll = useCallback(
    (batchId: string) => {
      if (!token || polling.current.has(batchId)) return;
      polling.current.add(batchId);
      const tick = async () => {
        try {
          const p = await getProgress(batchId, token);
          setProgress((prev) => ({ ...prev, [batchId]: p }));
          if (p.status === 'running') {
            setTimeout(tick, POLL_MS);
            return;
          }
          if (p.status === 'failed' && p.error) setError(p.error);
        } catch (err) {
          setError(errorText(err));
        }
        polling.current.delete(batchId);
        refresh();
      };
      tick();
    },
    [token, refresh]
  );

  // Pick up runs that were already in flight (e.g. started from another tab).
  useEffect(() => {
    runs?.filter((r) => r.status === 'running').forEach((r) => poll(r.batch_id));
  }, [runs, poll]);

  const start = async () => {
    if (!token) return;
    setStarting(true);
    setError(null);
    try {
      const res = await startRun(packId, token);
      if (res.status === 'running') {
        setProgress((prev) => ({
          ...prev,
          [res.batch_id]: { batch_id: res.batch_id, status: 'running', done: 0, total: res.total },
        }));
        poll(res.batch_id);
      }
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  };

  const active = Object.values(progress).filter((p) => p.status === 'running');
  const lastFinished = runs?.find((r) => (r.status ?? 'done') === 'done' && r.timing?.cases_per_min);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <PackSwitcher value={packId} onChange={onPackChange} />
        <PrimaryButton onClick={start} busy={starting} disabled={!token}>
          {!starting && <Play className="h-3 w-3 fill-current" />}
          Run {PACK_LABEL[packId]} pack
        </PrimaryButton>
      </TopBarControls>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {active.length > 0 ? (
        active.map((p) => <LiveRun key={p.batch_id} progress={p} packId={runs?.find((r) => r.batch_id === p.batch_id)?.pack_id} />)
      ) : (
        <SpeedBudget cpm={lastFinished?.timing?.cases_per_min ?? null} source={lastFinished} />
      )}

      <Panel title="Run history" note={runs ? `${runs.length} runs` : undefined} bodyClassName="p-0">
        {!runs ? (
          <LoadState className="m-5" loading={!loadError} error={loadError} what="runs" />
        ) : runs.length === 0 ? (
          <EmptyState className="m-5" title="No runs yet">
            Run a pack to score every question and see where the retriever or generator failed.
          </EmptyState>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#17191D] text-left text-xs text-[#8A9099]">
                <th className="px-5 py-2.5 font-normal">Run</th>
                <th className="px-3 py-2.5 font-normal">Pack</th>
                <th className="px-3 py-2.5 font-normal">Status</th>
                <th className="px-3 py-2.5 text-right font-normal">Questions</th>
                <th className="px-3 py-2.5 text-right font-normal">Accurate</th>
                <th className="px-3 py-2.5 text-right font-normal">Speed</th>
                <th className="px-3 py-2.5 text-right font-normal">Started</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const status = progress[r.batch_id]?.status ?? r.status ?? 'done';
                const openable = status === 'done';
                return (
                  <tr
                    key={r.batch_id}
                    onClick={() => openable && onOpenRun(r.batch_id, r.pack_id)}
                    className={cn(
                      'border-b border-[#14161A] last:border-0',
                      openable ? 'cursor-pointer hover:bg-white/[0.02]' : 'opacity-80'
                    )}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[#C9CDD3]">{r.batch_id}</td>
                    <td className="px-3 py-3 text-[#E8EAED]">{PACK_LABEL[r.pack_id ?? ''] ?? r.pack_id ?? '—'}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={status} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#C9CDD3]">{r.total_evaluated ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#E8EAED]">{pct(r.pass_rate)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#8A9099]">
                      {r.timing?.cases_per_min ? `${r.timing.cases_per_min.toFixed(1)}/min` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#8A9099]">{fmtTime(r.created_at)}</td>
                    <td className="pr-4 text-[#5A5F67]">{openable && <ChevronRight className="h-4 w-4" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'running' ? AMBER : status === 'failed' ? RED : PASS;
  const label = status === 'running' ? 'Running' : status === 'failed' ? 'Failed' : 'Done';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color }}>
      <span className={cn('h-1.5 w-1.5 rounded-full', status === 'running' && 'animate-pulse')} style={{ background: color }} />
      {label}
    </span>
  );
};

/** One in-flight run: progress, timing, and whether this pace meets the 200-in-15-minutes budget. */
const LiveRun: React.FC<{ progress: RunProgress; packId?: string }> = ({ progress, packId }) => {
  const done = progress.done ?? 0;
  const total = progress.total ?? 0;
  const frac = total ? done / total : 0;
  return (
    <Panel raised title={packId ? `Running ${PACK_LABEL[packId] ?? packId} pack` : 'Running pack'} note={<span className="font-mono">{progress.batch_id}</span>}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-baseline gap-2">
          <span className="text-[44px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{done}</span>
          <span className="text-lg text-[#8A9099] tabular-nums">/ {total || '—'} questions</span>
          {!!progress.failed && <span className="ml-2 text-sm text-[#F47783]">{progress.failed} not judged</span>}
        </div>
        <div className="flex gap-8 text-right">
          <Mini label="Elapsed" value={fmtDuration(progress.elapsed_ms)} />
          <Mini label="Time left" value={progress.eta_ms == null ? 'estimating…' : fmtDuration(progress.eta_ms)} />
          <Mini label="Pace" value={progress.cases_per_min ? `${progress.cases_per_min.toFixed(1)}/min` : '—'} />
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#16181C]">
        <div className="h-full rounded-full bg-[#F4F5F6] transition-[width] duration-700 ease-out" style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="mt-6 border-t border-[#17191D] pt-5">
        <BudgetBar cpm={progress.cases_per_min ?? null} />
      </div>
    </Panel>
  );
};

const SpeedBudget: React.FC<{ cpm: number | null; source?: RunListItem }> = ({ cpm, source }) => (
  <Panel
    raised
    title="Speed budget"
    note={source ? `pace from ${source.batch_id}` : 'run a pack to measure pace'}
  >
    <BudgetBar cpm={cpm} />
  </Panel>
);

/** Projects the current pace onto 200 questions against the 15-minute line. */
const BudgetBar: React.FC<{ cpm: number | null }> = ({ cpm }) => {
  const projected = cpm ? (BUDGET_QUESTIONS / cpm) * 60_000 : null;
  const within = projected != null && projected <= BUDGET_MS;
  const scale = Math.max(BUDGET_MS * 1.35, projected ?? 0);
  const color = projected == null ? '#3A3E45' : within ? PASS : RED;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] text-[#C9CDD3]">
          <Timer className="h-4 w-4 text-[#6F757E]" />
          {BUDGET_QUESTIONS} questions at this pace
        </div>
        <div className="text-[13px]">
          {projected == null ? (
            <span className="text-[#8A9099]">No pace measured yet</span>
          ) : (
            <span style={{ color }}>
              <span className="text-lg font-semibold tabular-nums">{fmtDuration(projected)}</span>{' '}
              {within ? 'within' : 'over'} the 15-minute budget
            </span>
          )}
        </div>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-[#16181C]">
        {projected != null && (
          <div
            className="lab-draw absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.min(100, (projected / scale) * 100)}%`, background: color }}
          />
        )}
        <div className="absolute -top-1.5 bottom-[-6px] w-px bg-[#C9CDD3]" style={{ left: `${(BUDGET_MS / scale) * 100}%` }} />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-[#8A9099]">
        <span className="absolute -translate-x-1/2" style={{ left: `${(BUDGET_MS / scale) * 100}%` }}>
          15:00
        </span>
      </div>
    </div>
  );
};

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-xs text-[#8A9099]">{label}</div>
    <div className="mt-0.5 text-[17px] font-medium tabular-nums text-[#E8EAED]">{value}</div>
  </div>
);
