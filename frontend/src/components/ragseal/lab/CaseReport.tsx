import React from 'react';
import { ArrowRight, Check, FlaskConical, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { LabChunk, LabClaim, LabMetric, LabResult } from './useLabData';
import { pct, scoreTone, verdictStyle } from './verdict';

interface CaseReportProps {
  result: LabResult;
  testId?: string;
  caseType?: string;
  staleChunkIds: string[];
  filenames: Record<string, string>;
}

const TYPE_LABEL: Record<string, string> = {
  factoid: 'Factual',
  stale: 'Outdated-version trap',
  unanswerable: 'Not in documents',
  distractor: 'Distractor trap',
};

/** The full diagnosis for one question: verdict, three component scores, evidence beside answer. */
export const CaseReport: React.FC<CaseReportProps> = ({ result, testId, caseType, staleChunkIds, filenames }) => {
  const category = result.root_cause?.category ?? result.category ?? (result.error ? 'UNRESOLVED' : 'NEEDS_REVIEW');
  const v = verdictStyle(category);
  const m = result.metrics ?? {};
  const gold = new Set(result.gold_chunk_ids ?? []);
  const stale = new Set([...staleChunkIds, ...(result.stale_chunk_ids ?? [])]);
  const cited = new Set(result.citations ?? []);
  const type = caseType ?? result.case_type;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Question + verdict */}
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500">
            {testId && <span className="font-mono">{testId}</span>}
            {type && <span>· {TYPE_LABEL[type] ?? type}</span>}
          </div>
          <h2 className="text-xl font-semibold leading-snug text-slate-50">{result.query}</h2>
          {result.ground_truth && (
            <p className="mt-1 text-sm text-slate-400">
              Expected: <span className="text-slate-200">{result.ground_truth}</span>
            </p>
          )}
        </div>
        <div className={cn('shrink-0 rounded-lg border px-4 py-2.5 text-right', v.border, v.bg)}>
          <div className={cn('text-lg font-semibold leading-tight', v.text)}>{v.label}</div>
          <div className="mt-0.5 text-xs text-slate-400">root cause</div>
        </div>
      </header>

      {/* Diagnosis sentence + component scores */}
      <section className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-3">
        <div className={cn('rounded-lg border-l-2 bg-slate-900/60 px-4 py-3', v.border)}>
          <p className="text-sm leading-relaxed text-slate-200">{result.root_cause?.summary ?? v.blame}</p>
          {result.root_cause?.recommended_action && (
            <p className="mt-1.5 text-xs text-slate-400">Fix: {result.root_cause.recommended_action}</p>
          )}
          {result.error && <p className="mt-1.5 text-xs text-rose-300">{result.error}</p>}
        </div>
        <ScoreCard label="Retriever" sub="Context relevance" metric={m.context_relevance} threshold={0.7} />
        <ScoreCard label="Generator" sub="Faithfulness to context" metric={m.faithfulness} threshold={0.75} />
        <ScoreCard label="End to end" sub="Answer accuracy" metric={m.answer_accuracy} threshold={0.7} />
      </section>

      {/* Evidence beside answer */}
      <section className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <Pane title="What the retriever found" note={`${result.retrieved_chunks?.length ?? 0} chunks`}>
          {(result.retrieved_chunks ?? []).map((c) => (
            <ChunkRow
              key={c.chunk_id}
              chunk={c}
              filename={c.document_id ? filenames[c.document_id] : undefined}
              isGold={c.is_gold ?? gold.has(c.chunk_id)}
              isStale={c.is_stale ?? stale.has(c.chunk_id)}
              isCited={cited.has(c.chunk_id)}
            />
          ))}
          {!result.retrieved_chunks?.length && <Empty>No chunks were retrieved.</Empty>}
        </Pane>

        <Pane title="What the model answered" note={result.generator_model}>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-100">
            {result.generated_answer || <span className="text-slate-500">No answer.</span>}
          </p>
          <ClaimList claims={m.faithfulness?.claims} />
          {result.replay && <ReplayProof replay={result.replay} />}
        </Pane>
      </section>
    </div>
  );
};

const ScoreCard: React.FC<{ label: string; sub: string; metric?: LabMetric; threshold: number }> = ({
  label,
  sub,
  metric,
  threshold,
}) => {
  const score = metric?.score ?? null;
  const t = metric?.threshold ?? threshold;
  const pass = score != null && score >= t;
  return (
    <div
      className={cn(
        'rounded-lg border bg-slate-900/60 px-4 py-3',
        score == null ? 'border-slate-800' : pass ? 'border-emerald-500/30' : 'border-rose-500/40'
      )}
      title={metric?.details}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-xs text-slate-500">≥ {Math.round(t * 100)}%</span>
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', scoreTone(score, t))}>{pct(score)}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
};

const Pane: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <div className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-900/40">
    <div className="flex items-baseline justify-between border-b border-slate-800 px-4 py-2.5">
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      {note && <span className="font-mono text-xs text-slate-500">{note}</span>}
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
  </div>
);

const ChunkRow: React.FC<{
  chunk: LabChunk;
  filename?: string;
  isGold: boolean;
  isStale: boolean;
  isCited: boolean;
}> = ({ chunk, filename, isGold, isStale, isCited }) => (
  <article
    className={cn(
      'rounded-md border px-3 py-2.5',
      isStale ? 'border-amber-500/50 bg-amber-500/5' : isGold ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800'
    )}
  >
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="truncate text-slate-300">{filename ?? chunk.document_id ?? 'document'}</span>
      <span className="font-mono text-slate-600">{chunk.chunk_id}</span>
      <span className="ml-auto flex items-center gap-1.5">
        {isGold && <Tag className="text-emerald-300 bg-emerald-500/10">Correct source</Tag>}
        {isStale && <Tag className="text-amber-300 bg-amber-500/10">Outdated version</Tag>}
        {isCited && <Tag className="text-sky-300 bg-sky-500/10">Model cited</Tag>}
        {chunk.relevance_score != null && (
          <span className="tabular-nums text-slate-500">rel {pct(chunk.relevance_score)}</span>
        )}
      </span>
    </div>
    <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">{chunk.text}</p>
  </article>
);

const ClaimList: React.FC<{ claims?: LabClaim[] }> = ({ claims }) => {
  if (!claims?.length) return null;
  return (
    <ul className="space-y-1.5 border-t border-slate-800 pt-3">
      {claims.map((c, i) => {
        const ok = c.supported ?? c.verdict === 'supported';
        return (
          <li key={i} className="flex gap-2 text-[13px] leading-snug">
            {ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
            )}
            <span className={ok ? 'text-slate-400' : 'text-rose-200'}>
              {c.claim}
              {!ok && <span className="ml-1 text-xs text-rose-400">not in context</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

const ReplayProof: React.FC<{ replay: NonNullable<LabResult['replay']> }> = ({ replay }) => {
  const fixed = (replay.answer_accuracy ?? 0) >= 0.7;
  return (
    <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-sky-300">
        <FlaskConical className="h-3.5 w-3.5" />
        Replay with only the correct source
        <ArrowRight className="h-3 w-3" />
        <span className={fixed ? 'text-emerald-300' : 'text-rose-300'}>
          accuracy {pct(replay.answer_accuracy)}
        </span>
      </div>
      {replay.answer && <p className="text-[13px] leading-relaxed text-slate-200">{replay.answer}</p>}
      {replay.verdict_effect && <p className="mt-1.5 text-xs text-slate-400">{replay.verdict_effect}</p>}
    </div>
  );
};

const Tag: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', className)}>{children}</span>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-slate-500">{children}</p>
);
