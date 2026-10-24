import React, { useEffect, useState } from 'react';
import { ArrowRight, Bot, FileText, FlaskConical, Gavel, ListChecks, MessagesSquare, PlayCircle, Repeat, Scale, ScanSearch, Search } from 'lucide-react';
import { PackId } from '../../../types/ragseal';
import { HealthResponse } from '../../../lib/api';
import { AMBER, pct, PASS, RED, VERDICT_ORDER, VERDICTS } from '../lab/verdict';
import { getRun, listRuns, RunSummary } from '../shared/apiExtra';
import { LoadState, PACKS } from '../shared/ui';

interface OverviewPageProps {
  token: string | null;
  health: HealthResponse | null;
  onOpenPack: (packId: PackId) => void;
  onNavigate: (route: 'bots' | 'diagnose' | 'runs' | 'trust') => void;
  onOpenDocuments?: () => void;
  onOpenGenerator?: () => void;
}

type Latest = Partial<Record<PackId, RunSummary>>;

const GREY = '#9AA0A8';
const SKY = '#7CC4FA';

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
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">How RAGSeal checks a chatbot</h2>
          <span className="text-xs text-[#8A9099]">
            Chatbot <span className="font-mono text-[#C9CDD3]">{generator ?? '—'}</span> · grading model{' '}
            <span className="font-mono text-[#C9CDD3]">{judge || '—'}</span>
          </span>
        </div>

        <div className="mt-5 flex items-stretch">
          <Step delay={0} n={1} icon={<FileText className="h-4 w-4" />} title="Your documents" body="Policies, fee lists, manuals" />
          <Arrow i={0} />
          <Step delay={90} n={2} icon={<FlaskConical className="h-4 w-4" />} title="Test questions" body="Each with a known correct answer" />
          <Arrow i={1} />
          <Step delay={180} n={3} icon={<Search className="h-4 w-4" />} title="Retriever finds text" body="Picks the passages to read" color={AMBER} tag="retriever" />
          <Arrow i={2} />
          <Step delay={270} n={4} icon={<Bot className="h-4 w-4" />} title="Bot writes answer" body="From the text it was given" color={RED} tag="generator" />
          <Arrow i={3} />
          <Step delay={360} n={5} icon={<Scale className="h-4 w-4" />} title="Grading model checks" body="Right text? Stuck to it? Correct?" />
          <Arrow i={4} />
          <Step delay={450} n={6} icon={<Repeat className="h-4 w-4" />} title="Replay" body="If wrong, rerun with only the correct text" color={SKY} tag="proof" />
          <Arrow i={5} />
          <Step delay={540} n={7} icon={<Gavel className="h-4 w-4" />} title="Verdict" body="Who is to blame, and how to fix it" />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-[#1A1D22] pt-4 md:grid-cols-[1.4fr_1fr]">
          <p className="text-[13px] leading-relaxed text-[#B4B9C0]">
            <span className="text-white">The replay is the proof.</span> If the bot gets it right once it&apos;s handed the correct text, the
            retriever caused the mistake. If it&apos;s still wrong with the correct text in front of it, the bot made it up.
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
        <div className="mb-2 text-xs text-[#8A9099]">Latest full test of each sample pack (click to open)</div>
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
                  className="group flex items-center gap-4 rounded-xl border border-[#1A1D22] bg-[#0D0E11] px-4 py-3 text-left transition-colors hover:border-[#2A2E35]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#E8EAED]">{p.label}</div>
                    {s ? (
                      <div className="mt-1.5 flex h-1.5 gap-[2px]">
                        {VERDICT_ORDER.filter((k) => b[k]).map((k) => (
                          <div key={k} className="rounded-[2px]" style={{ flex: b[k], background: VERDICTS[k].color }} />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-[#8A9099]">No finished test yet</div>
                    )}
                  </div>
                  {s && (
                    <div className="text-right">
                      <div className="text-[22px] font-semibold leading-none tabular-nums">{pct(s.aggregates?.pass_rate)}</div>
                      <div className="mt-1 text-[11px] text-[#8A9099]">correct of {s.total_evaluated}</div>
                    </div>
                  )}
                  <ArrowRight className="h-4 w-4 text-[#5A5F67] transition-transform group-hover:translate-x-0.5" />
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
        className="flex items-center gap-2 self-start text-[13px] text-[#8A9099] transition-colors hover:text-white"
      >
        <ListChecks className="h-4 w-4" /> Why trust the checker? See how it agrees with humans
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const Step: React.FC<{ delay: number; n: number; icon: React.ReactNode; title: string; body: string; color?: string; tag?: string }> = ({
  delay,
  n,
  icon,
  title,
  body,
  color,
  tag,
}) => (
  <div
    className="lab-fade-up flex min-w-0 flex-1 flex-col rounded-xl border px-3 py-3"
    style={{ animationDelay: `${delay}ms`, borderColor: color ? `${color}55` : '#22252B', background: color ? `${color}0D` : '#111317' }}
  >
    <div className="flex items-center justify-between">
      <span style={{ color: color ?? '#C9CDD3' }}>{icon}</span>
      <span className="font-mono text-[11px] text-[#6F757E]">{n}</span>
    </div>
    <div className="mt-2 text-[13px] font-medium leading-snug text-[#F4F5F6]">{title}</div>
    <div className="mt-1 text-[11.5px] leading-snug text-[#8A9099]">{body}</div>
    {tag && (
      <div className="mt-auto pt-2 text-[10.5px] uppercase tracking-[0.06em]" style={{ color }}>
        {tag}
      </div>
    )}
  </div>
);

/** Arrow between steps; a light pulse hops along arrow i at second i of a 6 s loop, so it travels the whole flow. */
const Arrow: React.FC<{ i: number }> = ({ i }) => (
  <svg width="22" viewBox="0 0 22 12" className="shrink-0 self-center" aria-hidden="true">
    <path d="M1 6h16M13 2l4 4-4 4" fill="none" stroke="#4A4F57" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M1 6h16"
      fill="none"
      stroke="#F4F5F6"
      strokeWidth="2"
      strokeLinecap="round"
      className="flow-hop"
      style={{ animationDelay: `${800 + i * 1000}ms` }}
    />
  </svg>
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="flex items-center gap-1.5 text-[#B4B9C0]">
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
    className="group flex flex-col gap-3 rounded-2xl border border-[#1F2228] bg-[#0D0E11] p-5 text-left transition-colors hover:border-[#2F333A] hover:bg-[#111317]"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2A2E35] text-white">{icon}</span>
    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-white">
      {title}
      <ArrowRight className="h-4 w-4 text-[#5A5F67] transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
    </span>
    <span className="text-[13px] leading-relaxed text-[#8A9099]">{body}</span>
  </button>
);
