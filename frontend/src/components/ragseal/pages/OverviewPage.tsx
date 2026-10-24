import React, { useEffect, useState } from 'react';
import { ArrowRight, Database, ListChecks, PlayCircle, ScanSearch, Sparkles } from 'lucide-react';
import { PackId } from '../../../types/ragseal';
import { HealthResponse } from '../../../lib/api';
import { TopBarControls } from '../shell/AppShell';
import { CountUp } from '../lab/motion';
import { AMBER, pct, PASS, RED, VERDICT_ORDER, VERDICTS } from '../lab/verdict';
import { getRun, listRuns, RunSummary } from '../shared/apiExtra';
import { EmptyState, GhostButton, LoadState, PACKS } from '../shared/ui';

interface OverviewPageProps {
  token: string | null;
  health: HealthResponse | null;
  onOpenPack: (packId: PackId) => void;
  onNavigate: (route: 'diagnose' | 'runs' | 'trust') => void;
  onOpenDocuments: () => void;
  onOpenGenerator: () => void;
}

type Latest = Partial<Record<PackId, RunSummary>>;

export const OverviewPage: React.FC<OverviewPageProps> = ({
  token,
  health,
  onOpenPack,
  onNavigate,
  onOpenDocuments,
  onOpenGenerator,
}) => {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const runs = (await listRuns(token)).filter((r) => (r.status ?? 'done') === 'done');
        const out: Latest = {};
        await Promise.all(
          PACKS.map(async (p) => {
            const run = runs.filter((r) => r.pack_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            if (!run) return;
            const detail = await getRun(run.batch_id, token);
            if ('aggregates' in detail || 'results' in detail) out[p.id] = detail as RunSummary;
          })
        );
        if (!cancelled) setLatest(out);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const summaries = Object.values(latest ?? {}) as RunSummary[];
  const totals = summaries.reduce(
    (acc, s) => {
      const b = s.root_cause_breakdown ?? {};
      acc.questions += s.total_evaluated ?? 0;
      acc.pass += b.CLEAN_PASS ?? 0;
      acc.retrieval += (b.RETRIEVAL_FAILURE ?? 0) + (b.COMPOUND_FAILURE ?? 0);
      acc.generation += (b.GENERATION_HALLUCINATION ?? 0) + (b.COMPOUND_FAILURE ?? 0);
      acc.review += (b.NEEDS_REVIEW ?? 0) + (b.UNRESOLVED ?? 0);
      return acc;
    },
    { questions: 0, pass: 0, retrieval: 0, generation: 0, review: 0 }
  );

  const judge = (health?.models?.judge?.name ?? health?.judge_model ?? '').split('/').pop();
  const generator = health?.models?.generator?.name ?? health?.generator_model;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <GhostButton onClick={onOpenDocuments}>
          <Database className="h-3.5 w-3.5 text-[#8A9099]" /> Documents
        </GhostButton>
        <GhostButton onClick={onOpenGenerator}>
          <Sparkles className="h-3.5 w-3.5 text-[#8A9099]" /> Generate questions
        </GhostButton>
      </TopBarControls>

      {/* Headline: what the latest runs say, across every pack */}
      <section className="lab-panel lab-fade-up rounded-2xl p-6">
        <div className="text-xs text-[#8A9099]">Latest run of every pack</div>
        {!latest ? (
          <LoadState className="mt-4" loading={!error} error={error} what="runs" />
        ) : summaries.length === 0 ? (
          <EmptyState className="mt-4" title="Nothing evaluated yet">
            Open Runs and score a pack. Its results show up here.
          </EmptyState>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-x-12 gap-y-5">
            <div>
              <div className="text-[56px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                <CountUp value={totals.questions ? totals.pass / totals.questions : null} />
              </div>
              <div className="mt-2 text-[13px] text-[#8A9099]">
                of {totals.questions} questions answered accurately
              </div>
            </div>
            <Split label="Retriever at fault" value={totals.retrieval} color={AMBER} />
            <Split label="Generator at fault" value={totals.generation} color={RED} />
            <Split label="Needs a human" value={totals.review} color="#9AA0A8" />
            <div className="ml-auto text-right text-xs leading-relaxed text-[#8A9099]">
              <div>
                Generator <span className="font-mono text-[#C9CDD3]">{generator ?? '—'}</span>
              </div>
              <div>
                Judge <span className="font-mono text-[#C9CDD3]">{judge || '—'}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* One card per pack */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PACKS.map((p, i) => {
          const s = latest?.[p.id];
          const b = s?.root_cause_breakdown ?? {};
          const n = Object.values(b).reduce((a, v) => a + v, 0);
          return (
            <button
              key={p.id}
              onClick={() => onOpenPack(p.id)}
              className="lab-panel-flat lab-fade-up group rounded-2xl p-5 text-left transition-colors hover:border-[#2A2E35]"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-[#E8EAED]">{p.label}</span>
                <ArrowRight className="h-4 w-4 text-[#5A5F67] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C9CDD3]" />
              </div>
              {s ? (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                      {pct(s.aggregates?.pass_rate)}
                    </span>
                    <span className="text-xs text-[#8A9099]">accurate · {s.total_evaluated} questions</span>
                  </div>
                  {n > 0 && (
                    <div className="mt-4 flex h-1.5 gap-[3px]">
                      {VERDICT_ORDER.filter((k) => b[k]).map((k) => (
                        <div key={k} className="rounded-[3px]" style={{ flex: b[k], background: VERDICTS[k].color }} />
                      ))}
                    </div>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {VERDICT_ORDER.filter((k) => b[k]).map((k) => (
                      <span key={k} style={{ color: VERDICTS[k].color }}>
                        {b[k]} {VERDICTS[k].short.toLowerCase()}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[#1A1D22] pt-3.5 text-xs">
                    <Cell label="Retriever" value={pct(s.aggregates?.avg_context_relevance)} />
                    <Cell label="Generator" value={pct(s.aggregates?.avg_faithfulness)} />
                    <Cell label="Gold found" value={pct(s.gold_retrieval_rate)} />
                  </dl>
                </>
              ) : (
                <p className="mt-3 text-[13px] text-[#8A9099]">{latest ? 'No finished run yet.' : 'Loading…'}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Where to go next */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <NextCard
          icon={<ScanSearch className="h-4 w-4" />}
          title="Diagnose a failure"
          body="See retrieved text beside the answer, and the replay that proves which stage was at fault."
          onClick={() => onNavigate('diagnose')}
        />
        <NextCard
          icon={<PlayCircle className="h-4 w-4" />}
          title="Run a pack"
          body="Score every question live, with progress and the 200-questions-in-15-minutes budget."
          onClick={() => onNavigate('runs')}
        />
        <NextCard
          icon={<ListChecks className="h-4 w-4" />}
          title="Check the evaluator"
          body="Human agreement, failure-type confusion matrix, and stability when the judge is swapped."
          onClick={() => onNavigate('trust')}
        />
      </div>
    </div>
  );
};

const Split: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div>
    <div className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums" style={{ color: value ? color : PASS }}>
      {value}
    </div>
    <div className="mt-2 text-xs text-[#8A9099]">{label}</div>
  </div>
);

const Cell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-[#8A9099]">{label}</dt>
    <dd className="mt-0.5 text-[15px] font-medium tabular-nums text-[#E8EAED]">{value}</dd>
  </div>
);

const NextCard: React.FC<{ icon: React.ReactNode; title: string; body: string; onClick: () => void }> = ({
  icon,
  title,
  body,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="group flex items-start gap-3.5 rounded-2xl border border-[#1A1D22] p-5 text-left transition-colors hover:border-[#2A2E35] hover:bg-white/[0.015]"
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#22252B] text-[#C9CDD3]">
      {icon}
    </span>
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#E8EAED]">
        {title}
        <ArrowRight className="h-3.5 w-3.5 text-[#5A5F67] transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="mt-1 block text-[13px] leading-relaxed text-[#8A9099]">{body}</span>
    </span>
  </button>
);
