import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Send } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { CaseReport } from './CaseReport';
import { LabCase, LabRun, useLabData } from './useLabData';
import { pct, VERDICT_ORDER, VERDICTS, verdictStyle } from './verdict';

interface LabScreenProps {
  packId: PackId;
  token: string | null;
}

const AD_HOC = '__ad_hoc__';

/**
 * Single-screen Lab: pick a test question on the left, read the diagnosis on the
 * right. Everything shown comes from the backend; nothing is mocked.
 */
export const LabScreen: React.FC<LabScreenProps> = ({ packId, token }) => {
  const lab = useLabData(packId, token);
  const [selected, setSelected] = useState<string | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const pick = (id: string) => {
    setUserPicked(true);
    setSelected(id);
  };

  useEffect(() => setUserPicked(false), [packId]);

  // Open the most telling case first: an outdated-version trap that failed, else any failure.
  // Re-picks when run results arrive, until the user has chosen a case themselves.
  useEffect(() => {
    if (!lab.cases.length || userPicked) return;
    const failures = lab.cases.filter((c) => c.result && verdictOf(c) !== 'CLEAN_PASS');
    const hero = failures.find((c) => c.type === 'stale') ?? failures[0] ?? lab.cases[0];
    setSelected(hero.test_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.cases.length, lab.run?.batch_id, userPicked]);

  const filenames = useMemo(
    () => Object.fromEntries((lab.pack?.documents ?? []).map((d) => [d.document_id, d.filename])),
    [lab.pack]
  );

  const current = lab.cases.find((c) => c.test_id === selected);
  const showAdHoc = selected === AD_HOC && lab.adHoc;

  if (!token) {
    return <Centered>Connecting to the backend at localhost:8000…</Centered>;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_1fr] gap-5">
      <aside className="flex min-h-0 flex-col gap-4">
        <PackSummary run={lab.run} onRun={lab.runPack} running={lab.runningPack} startedAt={lab.runStartedAt} total={lab.cases.length} />

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-800 bg-slate-900/40">
          <div className="flex items-baseline justify-between border-b border-slate-800 px-4 py-2.5">
            <h3 className="text-sm font-medium text-slate-200">Test questions</h3>
            <span className="text-xs text-slate-500">{lab.cases.length} with known answers</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {lab.loading && <li className="px-4 py-3 text-sm text-slate-500">Loading pack…</li>}
            {lab.cases.map((c) => (
              <CaseRow key={c.test_id} c={c} active={c.test_id === selected} onClick={() => pick(c.test_id)} />
            ))}
          </ul>
          <AskBox
            busy={lab.asking}
            disabled={!lab.pack}
            onAsk={async (q) => {
              pick(AD_HOC);
              await lab.ask(q);
            }}
          />
        </div>
      </aside>

      <main className="flex min-h-0 flex-col gap-3">
        {lab.error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
            <span>{lab.error}</span>
            <button onClick={lab.clearError} className="text-rose-300 hover:text-white">
              Dismiss
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {selected === AD_HOC ? (
            lab.asking ? (
              <Centered>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Retrieving, answering and judging…
              </Centered>
            ) : showAdHoc ? (
              <CaseReport result={lab.adHoc!} staleChunkIds={[]} filenames={filenames} />
            ) : (
              <Centered>Ask a question to evaluate it live.</Centered>
            )
          ) : current?.result ? (
            <CaseReport
              result={current.result}
              testId={current.test_id}
              caseType={current.type}
              staleChunkIds={current.stale_chunk_ids}
              filenames={filenames}
            />
          ) : current ? (
            <Centered>
              This question hasn't been evaluated yet. Run the pack to score all {lab.cases.length} questions.
            </Centered>
          ) : (
            !lab.loading && <Centered>Pick a pack to begin.</Centered>
          )}
        </div>
      </main>
    </div>
  );
};

function verdictOf(c: LabCase): string {
  return c.result?.root_cause?.category ?? c.result?.category ?? 'UNRESOLVED';
}

const CaseRow: React.FC<{ c: LabCase; active: boolean; onClick: () => void }> = ({ c, active, onClick }) => {
  const v = c.result ? verdictStyle(verdictOf(c)) : null;
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 border-l-2 px-4 py-2 text-left transition-colors',
          active ? 'border-teal-400 bg-slate-800/60' : 'border-transparent hover:bg-slate-800/30'
        )}
      >
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', v ? v.dot : 'bg-slate-700')} />
        <span className="min-w-0 flex-1">
          <span className={cn('line-clamp-2 text-[13px] leading-snug', active ? 'text-slate-50' : 'text-slate-300')}>
            {c.question}
          </span>
          <span className="mt-0.5 flex gap-2 text-[11px] text-slate-500">
            <span className="font-mono">{c.test_id}</span>
            {v && <span className={v.text}>{v.short}</span>}
            {c.type && c.type !== 'factoid' && <span>· {c.type} trap</span>}
          </span>
        </span>
      </button>
    </li>
  );
};

const PackSummary: React.FC<{
  run: LabRun | null;
  onRun: () => void;
  running: boolean;
  startedAt: number | null;
  total: number;
}> = ({ run, onRun, running, startedAt, total }) => {
  const elapsed = useElapsed(startedAt);
  const breakdown = run?.root_cause_breakdown ?? {};
  const n = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-semibold tabular-nums text-slate-50">{pct(run?.aggregates?.pass_rate)}</div>
          <div className="text-xs text-slate-400">
            {run ? `of ${run.total_evaluated} questions answered accurately` : 'No run yet for this pack'}
          </div>
        </div>
        <button
          onClick={onRun}
          disabled={running || !total}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-teal-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? `${elapsed}s` : run ? 'Re-run pack' : 'Run pack'}
        </button>
      </div>

      {running && (
        <p className="mt-2 text-xs text-slate-400">
          Scoring {total} questions, about 10 s each on a cold judge. Cached reruns take seconds.
        </p>
      )}

      {n > 0 && (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-800">
            {VERDICT_ORDER.filter((k) => breakdown[k]).map((k) => (
              <div key={k} className={VERDICTS[k].bar} style={{ width: `${(breakdown[k] / n) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {VERDICT_ORDER.filter((k) => breakdown[k]).map((k) => (
              <span key={k} className={VERDICTS[k].text}>
                {breakdown[k]} {VERDICTS[k].short.toLowerCase()}
              </span>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-xs">
            <Stat label="Retriever" value={pct(run?.aggregates?.avg_context_relevance)} />
            <Stat label="Generator" value={pct(run?.aggregates?.avg_faithfulness)} />
            <Stat label="Accuracy" value={pct(run?.aggregates?.avg_answer_accuracy)} />
          </dl>
          {run?.judge_model && (
            <p className="mt-2 truncate text-[11px] text-slate-500">
              Judge {run.judge_model} · generator {run.generator_model}
            </p>
          )}
        </>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-sm font-medium tabular-nums text-slate-200">{value}</dd>
  </div>
);

const AskBox: React.FC<{ busy: boolean; disabled: boolean; onAsk: (q: string) => void }> = ({ busy, disabled, onAsk }) => {
  const [q, setQ] = useState('');
  const submit = () => {
    const query = q.trim();
    if (query && !busy) onAsk(query);
  };
  return (
    <div className="border-t border-slate-800 p-3">
      <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 focus-within:border-teal-500">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={disabled}
          placeholder="Ask your own question…"
          className="h-9 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button onClick={submit} disabled={disabled || busy || !q.trim()} className="text-teal-400 disabled:text-slate-600">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-400">
    {children}
  </div>
);

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
}
