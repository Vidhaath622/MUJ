import React, { useEffect, useState } from 'react';
import { ArrowRight, ListChecks, MessagesSquare, PlayCircle, ScanSearch } from 'lucide-react';
import { PackId } from '../../../types/ragseal';
import { HealthResponse } from '../../../lib/api';
import { AMBER, pct, PASS, RED, VERDICT_ORDER, VERDICTS } from '../lab/verdict';
import { getRun, listRuns, RunSummary } from '../shared/apiExtra';
import { LoadState, PACKS } from '../shared/ui';
import { RagFigure } from '../shared/RagFigure';

interface OverviewPageProps {
  token: string | null;
  health: HealthResponse | null;
  onOpenPack: (packId: PackId) => void;
  onNavigate: (route: 'bots' | 'diagnose' | 'runs' | 'trust') => void;
  onOpenDocuments?: () => void;
  onOpenGenerator?: () => void;
}

type Latest = Partial<Record<PackId, RunSummary>>;

const GREY = '#6B675E';

/** Start here: one picture of how RAGSeal works, the latest results in one row, and where to go next. */
export const OverviewPage: React.FC<OverviewPageProps> = ({ token, health, onOpenPack, onNavigate }) => {
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

  const judge = (health?.models?.judge?.name ?? health?.judge_model ?? '').split('/').pop();
  const generator = health?.models?.generator?.name ?? health?.generator_model;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      {/* The whole idea in one picture */}
      <section className="lab-panel lab-fade-up rounded-2xl p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#5E5B53]">Fig. 1</div>
            <h2 className="mt-1 text-[26px] leading-tight text-[#1B1B18]">How a RAG chatbot answers, and where RAGSeal checks it</h2>
          </div>
          <span className="text-xs text-[#5E5B53]">
            Chatbot <span className="font-mono text-[#33322D]">{generator ?? '—'}</span> · grading model{' '}
            <span className="font-mono text-[#33322D]">{judge || '—'}</span>
          </span>
        </div>

        <div className="mt-4">
          <RagFigure caption={false} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-[#E3DED3] pt-4 md:grid-cols-[1.4fr_1fr]">
          <p className="text-[13px] leading-relaxed text-[#33322D]">
            <span className="text-[#1B1B18]">Read it left to right.</span> Documents are indexed once. For each question the retriever pulls a few
            chunks and the bot writes an answer from them. RAGSeal checks the retriever (1), the bot (2) and the final answer (3) separately. Then
            it replays a wrong answer with only the correct text: fixed means the retriever was at fault, still wrong means the bot was.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <Legend color={PASS} label="Correct" />
            <Legend color={AMBER} label="Retriever's fault" />
            <Legend color={RED} label="Bot made it up" />
            <Legend color={GREY} label="Needs a human" />
          </div>
        </div>
      </section>

      {/* Latest results, one compact row */}
      <section className="lab-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="mb-2 text-xs text-[#5E5B53]">Latest full test of each sample pack (click to open)</div>
        {!latest ? (
          <LoadState loading={!error} error={error} what="runs" />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PACKS.map((p) => {
              const s = latest[p.id];
              const b = s?.root_cause_breakdown ?? {};
              return (
                <button
                  key={p.id}
                  onClick={() => onOpenPack(p.id)}
                  className="group flex items-center gap-4 rounded-xl border border-[#E3DED3] bg-[#FBF9F4] px-4 py-3 text-left transition-colors hover:border-[#D6D0C3]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#1B1B18]">{p.label}</div>
                    {s ? (
                      <div className="mt-1.5 flex h-1.5 gap-[2px]">
                        {VERDICT_ORDER.filter((k) => b[k]).map((k) => (
                          <div key={k} className="rounded-[2px]" style={{ flex: b[k], background: VERDICTS[k].color }} />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-[#5E5B53]">No finished test yet</div>
                    )}
                  </div>
                  {s && (
                    <div className="text-right">
                      <div className="text-[22px] font-semibold leading-none tabular-nums">{pct(s.aggregates?.pass_rate)}</div>
                      <div className="mt-1 text-[11px] text-[#5E5B53]">correct of {s.total_evaluated}</div>
                    </div>
                  )}
                  <ArrowRight className="h-4 w-4 text-[#6E6A62] transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Where to start */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StartCard
          icon={<MessagesSquare className="h-5 w-5" />}
          title="Try a chatbot"
          body="Ask a sample bot a question and watch every reply get checked live."
          onClick={() => onNavigate('bots')}
        />
        <StartCard
          icon={<ScanSearch className="h-5 w-5" />}
          title="Diagnose answers"
          body="Open one wrong answer: the text the bot found, its reply, and the replay proof."
          onClick={() => onNavigate('diagnose')}
        />
        <StartCard
          icon={<PlayCircle className="h-5 w-5" />}
          title="Run a full test"
          body="Check every question in a pack at once, with live progress."
          onClick={() => onNavigate('runs')}
        />
      </div>

      <button
        onClick={() => onNavigate('trust')}
        className="flex items-center gap-2 self-start text-[13px] text-[#5E5B53] transition-colors hover:text-[#1B1B18]"
      >
        <ListChecks className="h-4 w-4" /> Why trust the checker? See how it agrees with humans
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="flex items-center gap-1.5 text-[#33322D]">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

const StartCard: React.FC<{ icon: React.ReactNode; title: string; body: string; onClick: () => void }> = ({
  icon,
  title,
  body,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="group flex flex-col gap-3 rounded-2xl border border-[#E3DED3] bg-[#FBF9F4] p-5 text-left transition-colors hover:border-[#D6D0C3] hover:bg-[#FBF9F4]"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D6D0C3] text-[#1B1B18]">{icon}</span>
    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[#1B1B18]">
      {title}
      <ArrowRight className="h-4 w-4 text-[#6E6A62] transition-transform group-hover:translate-x-0.5 group-hover:text-[#1B1B18]" />
    </span>
    <span className="text-[13px] leading-relaxed text-[#5E5B53]">{body}</span>
  </button>
);
