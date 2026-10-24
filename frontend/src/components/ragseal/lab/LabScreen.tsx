import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { CaseReport } from './CaseReport';
import { CountUp } from './motion';
import { LabCase, LabRun, useLabData } from './useLabData';
import { AMBER, pct, tint, VERDICT_ORDER, VERDICTS, verdictStyle } from './verdict';

interface LabScreenProps {
  packId: PackId;
  token: string | null;
  /** Open this run instead of the pack's latest one. */
  batchId?: string | null;
}

const AD_HOC = '__ad_hoc__';

const PACK_NAME: Record<string, string> = {
  recruitment: 'Recruitment',
  banking: 'Banking',
  healthcare: 'Healthcare',
};

/**
 * Single-screen Lab: pick a test question on the left, read the diagnosis on the
 * right. Everything shown comes from the backend; nothing is mocked.
 */
export const LabScreen: React.FC<LabScreenProps> = ({ packId, token, batchId }) => {
  const lab = useLabData(packId, token, batchId);
  const [selected, setSelected] = useState<string | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const pick = (id: string) => {
    setUserPicked(true);
    setSelected(id);
  };

  useEffect(() => setUserPicked(false), [packId, batchId]);

  // Failures first, then review, then passes; questions without results last.
  const sorted = useMemo(
    () =>
      [...lab.cases].sort(
        (a, b) => severity(a) - severity(b) || a.test_id.localeCompare(b.test_id, undefined, { numeric: true })
      ),
    [lab.cases]
  );

  // Open the most telling case first: an outdated-version trap that failed, else any failure.
  // Re-picks when run results arrive, until the user has chosen a case themselves.
  useEffect(() => {
    if (!sorted.length || userPicked) return;
    const failures = sorted.filter((c) => c.result && verdictOf(c) !== 'CLEAN_PASS');
    const hero = failures.find((c) => c.type === 'stale') ?? failures[0] ?? sorted[0];
    setSelected(hero.test_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length, lab.run?.batch_id, userPicked]);

  const filenames = useMemo(
    () => Object.fromEntries((lab.pack?.documents ?? []).map((d) => [d.document_id, d.filename])),
    [lab.pack]
  );

  const current = lab.cases.find((c) => c.test_id === selected);
  const glow = current?.result ? verdictStyle(verdictOf(current)).color : null;

  if (!token) {
    return <Centered>Connecting to the backend at localhost:8000…</Centered>;
  }

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[290px_1fr] gap-5 2xl:grid-cols-[310px_1fr]">
      {/* Verdict-tinted light from above the report */}
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-[30%] right-0 h-[420px] transition-[background] duration-700"
          style={{ background: `radial-gradient(60% 100% at 60% 0%, ${tint(glow, 0.07)}, transparent 70%)` }}
        />
      )}

      <aside className="relative flex min-h-0 flex-col gap-3.5">
        <PackSummary
          packName={PACK_NAME[packId] ?? packId}
          run={lab.run}
          onRun={lab.runPack}
          running={lab.runningPack}
          startedAt={lab.runStartedAt}
          total={lab.cases.length}
        />

        <div className="lab-panel-flat flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3.5 text-xs">
            <h3 className="font-medium text-[#C9CDD3]">Test questions</h3>
            <span className="text-[#8A9099]">failures first</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto pb-1">
            {lab.loading && <li className="px-4 py-3 text-sm text-[#8A9099]">Loading pack…</li>}
            {sorted.map((c) => (
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

      <main className="relative flex min-h-0 flex-col gap-3">
        {lab.error && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-[#F47783]/40 bg-[#F47783]/10 px-4 py-2.5 text-sm text-[#F9B8BF]">
            <span>{lab.error}</span>
            <button onClick={lab.clearError} className="text-[#F47783] hover:text-white">
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
            ) : lab.adHoc ? (
              <CaseReport result={lab.adHoc} staleChunkIds={[]} filenames={filenames} />
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

function severity(c: LabCase): number {
  return c.result ? verdictStyle(verdictOf(c)).severity : 9;
}

const CaseRow: React.FC<{ c: LabCase; active: boolean; onClick: () => void }> = ({ c, active, onClick }) => {
  const v = c.result ? verdictStyle(verdictOf(c)) : null;
  const color = v?.color ?? '#3A3E45';
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-start gap-3 border-l-2 px-4 py-2 text-left transition-colors hover:bg-white/[0.02]"
        style={{
          borderLeftColor: active ? color : 'transparent',
          background: active ? `linear-gradient(90deg, ${tint(v?.color ?? AMBER, 0.09)}, transparent)` : undefined,
        }}
      >
        <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[13px] leading-snug', active ? 'text-white' : 'text-[#B4B9C0]')}>
            {c.question}
          </span>
          <span className="mt-0.5 flex gap-2 text-[11px] text-[#7D838C]">
            <span className="font-mono">{c.test_id}</span>
            {v && <span style={{ color: v.color }}>{v.label}</span>}
            {c.type && c.type !== 'factoid' && <span>· {c.type} trap</span>}
          </span>
        </span>
      </button>
    </li>
  );
};

const PackSummary: React.FC<{
  packName: string;
  run: LabRun | null;
  onRun: () => void;
  running: boolean;
  startedAt: number | null;
  total: number;
}> = ({ packName, run, onRun, running, startedAt, total }) => {
  const elapsed = useElapsed(startedAt);
  const breakdown = run?.root_cause_breakdown ?? {};
  const n = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const shown = VERDICT_ORDER.filter((k) => breakdown[k]);

  return (
    <section className="lab-panel rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-[#8A9099]">
          {packName} pack · {total} questions
        </div>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <span className="text-[52px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-white">
          <CountUp key={run?.batch_id} value={run?.aggregates?.pass_rate} />
        </span>
        <span className="text-[13px] text-[#8A9099]">{run ? 'answered accurately' : 'no run yet'}</span>
      </div>

      {n > 0 && (
        <>
          <div className="mt-4 flex h-1.5 gap-[3px]">
            {shown.map((k) => (
              <div
                key={k}
                className="lab-draw rounded-[3px]"
                style={{ flex: breakdown[k], background: VERDICTS[k].color, animationDelay: '150ms' }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs">
            {shown.map((k) => (
              <span key={k} style={{ color: VERDICTS[k].color }}>
                {breakdown[k]} {VERDICTS[k].short.toLowerCase()}
              </span>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[#1A1D22] pt-3.5">
            <Stat label="Retriever" value={run?.aggregates?.avg_context_relevance} />
            <Stat label="Generator" value={run?.aggregates?.avg_faithfulness} />
            <Stat label="Accuracy" value={run?.aggregates?.avg_answer_accuracy} />
          </dl>
        </>
      )}

      <button
        onClick={onRun}
        disabled={running || !total}
        className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-[9px] bg-[#F4F5F6] text-[13px] font-semibold text-[#0A0B0D] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-[#1C1F24] disabled:text-[#8A9099]"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
        {running ? `Scoring ${total} questions · ${elapsed}s` : run ? 'Re-run pack' : 'Run pack'}
      </button>
      {running && (
        <p className="mt-2 text-[11px] leading-snug text-[#8A9099]">
          About 10 s a question on a cold judge; cached reruns take seconds.
        </p>
      )}
      {!running && run?.judge_model && (
        <p className="mt-2.5 truncate text-[11px] text-[#7D838C]">
          Judge <span className="font-mono">{run.judge_model.split('/').pop()}</span> · {pct(run.gold_retrieval_rate)} gold
          retrieved
        </p>
      )}
    </section>
  );
};

const Stat: React.FC<{ label: string; value: number | null | undefined }> = ({ label, value }) => (
  <div>
    <dt className="text-[11px] text-[#8A9099]">{label}</dt>
    <dd className="mt-0.5 text-[17px] font-medium tabular-nums text-[#E8EAED]">
      <CountUp value={value} />
    </dd>
  </div>
);

const AskBox: React.FC<{ busy: boolean; disabled: boolean; onAsk: (q: string) => void }> = ({ busy, disabled, onAsk }) => {
  const [q, setQ] = useState('');
  const submit = () => {
    const query = q.trim();
    if (query && !busy) onAsk(query);
  };
  return (
    <div className="border-t border-[#1A1D22] p-3">
      <label className="flex h-10 items-center gap-2.5 rounded-[10px] border border-[#22252B] bg-[#08090B] px-3 transition-colors focus-within:border-[#3A3E45]">
        <span className="sr-only">Ask your own question</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={disabled}
          placeholder="Ask your own question…"
          className="h-full flex-1 bg-transparent text-[13px] text-[#E8EAED] placeholder:text-[#7D838C] focus:outline-none"
        />
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#8A9099]" />
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !q.trim()}
            aria-label="Evaluate question"
            className="rounded-[5px] border border-[#22252B] px-1.5 font-mono text-[11px] text-[#8A9099] hover:text-white disabled:opacity-50"
          >
            ↵
          </button>
        )}
      </label>
    </div>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#1A1D22] text-sm text-[#8A9099]">
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
