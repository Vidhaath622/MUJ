import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { failureLabel, type Stage as FaultStage, STAGE_COLOR as FAULT_COLOR, STAGE_LABEL } from '../shared/taxonomy';
import { LabChunk, LabClaim, LabResult } from './useLabData';
import { CountUp } from './motion';
import { AMBER, GREY, PASS, RED, StageState, pct, tint, verdictStyle } from './verdict';

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
  unanswerable: 'Not in the documents',
  distractor: 'Distractor trap',
};

const ACCURACY_THRESHOLD = 0.7;

/** The full diagnosis for one question: verdict, pipeline trace, evidence beside answer. */
export const CaseReport: React.FC<CaseReportProps> = ({ result, testId, caseType, staleChunkIds, filenames }) => {
  const category = result.root_cause?.category ?? result.category ?? (result.error ? 'UNRESOLVED' : 'NEEDS_REVIEW');
  const v = verdictStyle(category);
  const ft = result.root_cause?.failure_type;
  const stage = result.root_cause?.stage;
  const stageKey = (stage ?? 'none') as FaultStage;
  const m = result.metrics ?? {};
  const gold = new Set(result.gold_chunk_ids ?? []);
  const stale = new Set([...staleChunkIds, ...(result.stale_chunk_ids ?? [])]);
  const cited = new Set(result.citations ?? []);
  const type = caseType ?? result.case_type;
  const chunks = (result.retrieved_chunks ?? []).map((c) => ({
    chunk: c,
    isGold: c.is_gold ?? gold.has(c.chunk_id),
    isStale: c.is_stale ?? stale.has(c.chunk_id),
    isCited: cited.has(c.chunk_id),
  }));
  // Passages that matter stay visible; ones marked not relevant fold away to cut clutter.
  const isOther = (c: (typeof chunks)[number]) => !c.isGold && !c.isStale && !c.isCited && c.chunk.is_relevant === false;
  const mainChunks = chunks.filter((c) => !isOther(c));
  const otherChunks = chunks.filter(isOther);
  const staleCount = chunks.filter((c) => c.isStale).length;
  const accuracy = m.answer_accuracy?.score ?? null;
  const answerWrong = accuracy != null && accuracy < ACCURACY_THRESHOLD;
  const keyFigures = figuresIn(result.generated_answer, result.ground_truth, result.replay?.answer);

  return (
    // key on the case so the entrance motion replays when the selection changes
    <KeyFigures.Provider value={keyFigures}>
    <div key={result.evaluation_id ?? result.query} className="flex h-full min-h-0 flex-col gap-4">
      <header className="lab-fade-up flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 text-xs text-[#8A9099]">
            {testId && <span className="font-mono">{testId}</span>}
            {type && (
              <>
                <Dot />
                <span>{TYPE_LABEL[type] ?? type}</span>
              </>
            )}
            {result.duration_ms != null && (
              <>
                <Dot />
                <span>{(result.duration_ms / 1000).toFixed(1)} s</span>
              </>
            )}
          </div>
          <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-white 2xl:text-[26px]">{result.query}</h1>
        </div>
        {result.ground_truth && (
          <div className="max-w-[34%] shrink-0 text-right">
            <div className="text-[11px] text-[#8A9099]">Known answer</div>
            <div className="mt-0.5 text-[15px] text-[#E8EAED]">{result.ground_truth}</div>
          </div>
        )}
      </header>

      {/* Verdict + pipeline trace */}
      <section
        className="lab-fade-up flex flex-wrap items-center gap-6 rounded-[18px] border px-6 py-5 2xl:gap-8"
        style={{
          animationDelay: '60ms',
          borderColor: tint(v.color, 0.28),
          background: `linear-gradient(180deg, ${tint(v.color, 0.06)}, ${tint(v.color, 0.015)}), #0D0E11`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 30px 60px -30px ${tint(v.color, 0.2)}`,
        }}
      >
        <div className="min-w-0 flex-[1_1_240px]">
          <div className="text-xs font-medium" style={{ color: tint(v.color, 0.75) }}>
            Root cause
          </div>
          <div className="mt-1.5 text-[34px] font-semibold leading-none tracking-[-0.035em] 2xl:text-[40px]" style={{ color: v.color }}>
            {v.label}
          </div>
          {ft && ft !== 'CLEAN_PASS' && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span
                className="rounded-full px-2 py-0.5 font-medium"
                style={{ background: tint(FAULT_COLOR[stageKey] ?? v.color, 0.14), color: FAULT_COLOR[stageKey] ?? v.color }}
              >
                {failureLabel(ft)}
              </span>
              {stage && <span className="text-[#8A9099]">{STAGE_LABEL[stage] ?? stage}</span>}
            </div>
          )}
          <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-[#B4B9C0]">{result.root_cause?.summary ?? v.blame}</p>
          {result.root_cause?.failure_type_text && ft !== 'CLEAN_PASS' && (
            <p className="mt-1.5 max-w-[52ch] text-xs leading-relaxed text-[#8A9099]">{result.root_cause.failure_type_text}</p>
          )}
          {result.error && <p className="mt-2 text-xs text-[#F47783]">{result.error}</p>}
        </div>

        <div className="flex min-w-0 flex-[1.4_1_420px] items-stretch">
          <Stage
            name="Found the right text"
            tech="retriever"
            faultColor={AMBER}
            state={v.stages.retriever}
            value={
              staleCount > 0 ? (
                `${staleCount} outdated`
              ) : result.gold_retrieved === false ? (
                'Missed'
              ) : (
                <CountUp value={m.context_relevance?.score} />
              )
            }
            sub={`context relevance ${pct(m.context_relevance?.score)} · ${chunks.length} passages`}
            delay={120}
          />
          <Link fault={v.stages.retriever === 'fault' ? AMBER : null} delay={260} />
          <Stage
            name="Stuck to the text"
            tech="bot"
            faultColor={RED}
            state={v.stages.generator}
            value={<CountUp value={m.faithfulness?.score} />}
            sub="faithfulness to the passages"
            delay={340}
          />
          <Link fault={v.stages.generator === 'fault' ? RED : null} delay={480} />
          <Stage
            name="Correct answer"
            tech="end to end"
            state={accuracy == null ? 'neutral' : answerWrong ? 'fault' : 'ok'}
            faultColor={RED}
            value={<CountUp value={accuracy} />}
            sub={accuracy == null ? 'no known answer to compare' : 'accuracy vs the known answer'}
            label={accuracy == null ? '' : answerWrong ? 'wrong' : 'right'}
            delay={560}
          />
        </div>
      </section>

      {/* Evidence beside answer */}
      <section className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <Pane title="Text the bot was given" note={`${chunks.length} passages`} delay={120}>
          {mainChunks.map((c) => (
            <ChunkCard key={c.chunk.chunk_id} {...c} filename={c.chunk.filename ?? (c.chunk.document_id ? filenames[c.chunk.document_id] : undefined)} />
          ))}
          {otherChunks.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-[#8A9099] hover:text-white">
                <span className="group-open:hidden">Show {otherChunks.length} other passage{otherChunks.length === 1 ? '' : 's'} (not relevant)</span>
                <span className="hidden group-open:inline">Hide other passages</span>
              </summary>
              <div className="mt-3 space-y-3">
                {otherChunks.map((c) => (
                  <ChunkCard key={c.chunk.chunk_id} {...c} filename={c.chunk.filename ?? (c.chunk.document_id ? filenames[c.chunk.document_id] : undefined)} />
                ))}
              </div>
            </details>
          )}
          {!chunks.length && <p className="text-sm text-[#8A9099]">No chunks were retrieved.</p>}
        </Pane>

        <Pane title="What the bot answered" note={result.generator_model} mono delay={180}>
          <p className="whitespace-pre-wrap text-[17px] leading-normal tracking-[-0.01em] text-[#F4F5F6]">
            {result.generated_answer ? (
              <Figures text={result.generated_answer} color={answerWrong ? RED : undefined} />
            ) : (
              <span className="text-[#8A9099]">No answer.</span>
            )}
          </p>
          <ClaimList claims={m.faithfulness?.claims} />
          {result.replay && <ReplayProof replay={result.replay} before={accuracy} />}
          {result.root_cause?.recommended_action && !result.replay && (
            <p className="text-xs text-[#8A9099]">Fix: {result.root_cause.recommended_action}</p>
          )}
        </Pane>
      </section>
    </div>
    </KeyFigures.Provider>
  );
};

const STAGE_COLOR: Record<StageState, string> = { ok: PASS, fault: AMBER, neutral: GREY };

const Stage: React.FC<{
  name: string;
  tech?: string;
  state: StageState;
  value: React.ReactNode;
  sub: string;
  delay: number;
  label?: string;
  faultColor?: string;
}> = ({ name, tech, state, value, sub, delay, label, faultColor }) => {
  const color = state === 'fault' ? faultColor ?? AMBER : STAGE_COLOR[state];
  const fault = state === 'fault';
  return (
    <div
      className={cn('lab-fade-up min-w-0 flex-1 rounded-[14px] border px-3.5 pb-3 pt-3.5', fault && 'lab-pulse')}
      style={
        {
          animationDelay: `${delay}ms`,
          borderColor: fault ? tint(color, 0.55) : '#1F2228',
          background: fault ? tint(color, 0.08) : '#111317',
          '--pulse': tint(color, 0.45),
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-2 text-xs">
        <span className="min-w-0 leading-tight">
          <span className="block font-medium text-[#E8EAED]">{name}</span>
          {tech && <span className="block text-[10.5px] text-[#6F757E]">{tech}</span>}
        </span>
        <span className="shrink-0" style={{ color }}>
          {label ?? (fault ? 'to blame' : state === 'ok' ? 'yes' : 'unclear')}
        </span>
      </div>
      <div className="mt-2 truncate text-[21px] font-semibold tabular-nums tracking-[-0.02em] 2xl:text-[26px]" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#8A9099]">{sub}</div>
    </div>
  );
};

const Link: React.FC<{ fault: string | null; delay: number }> = ({ fault, delay }) => (
  <div className="flex w-7 shrink-0 items-center">
    <div
      className="lab-draw h-px flex-1"
      style={{
        animationDelay: `${delay}ms`,
        background: fault ? `linear-gradient(90deg, ${tint(fault, 0.6)}, #2A2E35)` : '#2A2E35',
      }}
    />
  </div>
);

const Pane: React.FC<{ title: string; note?: string; mono?: boolean; delay: number; children: React.ReactNode }> = ({
  title,
  note,
  mono,
  delay,
  children,
}) => (
  <div className="lab-panel-flat lab-fade-up flex min-h-0 flex-col overflow-hidden rounded-2xl" style={{ animationDelay: `${delay}ms` }}>
    <div className="flex items-baseline justify-between border-b border-[#17191D] px-[18px] py-3.5 text-[13px]">
      <h3 className="font-medium text-[#E8EAED]">{title}</h3>
      {note && <span className={cn('text-[#8A9099]', mono && 'font-mono text-xs')}>{note}</span>}
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
  </div>
);

const ChunkCard: React.FC<{
  chunk: LabChunk;
  filename?: string;
  isGold: boolean;
  isStale: boolean;
  isCited: boolean;
}> = ({ chunk, filename, isGold, isStale, isCited }) => {
  const color = isStale ? AMBER : isGold ? PASS : null;
  const irrelevant = !color && chunk.is_relevant === false;
  const tag = isStale
    ? isCited
      ? 'Old version · bot used it'
      : 'Old version'
    : isGold
      ? isCited
        ? 'Right text · bot used it'
        : 'Right text'
      : isCited
        ? 'Bot used it'
        : irrelevant
          ? 'not relevant'
          : null;
  return (
    <article
      className={cn('rounded-xl border px-3.5 py-3 transition-opacity', irrelevant && 'opacity-55 hover:opacity-100')}
      style={{
        borderColor: color ? tint(color, isStale ? 0.45 : 0.3) : '#1A1D22',
        background: color ? tint(color, isStale ? 0.05 : 0.04) : 'transparent',
      }}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="truncate text-[#E8EAED]">{filename ?? chunk.document_id ?? 'document'}</span>
        {tag && (
          <span
            className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px]"
            style={color ? { background: tint(color, 0.13), color } : { color: '#8A9099' }}
          >
            {tag}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-[#B4B9C0]">
        <Figures text={stripHeading(chunk.text)} color={color ?? undefined} />
      </p>
    </article>
  );
};

const ClaimList: React.FC<{ claims?: LabClaim[] }> = ({ claims }) => {
  if (!claims?.length) return null;
  const allOk = claims.every((c) => c.supported ?? c.verdict === 'supported');
  return (
    <ul className="space-y-1.5">
      {claims.map((c, i) => {
        const ok = c.supported ?? c.verdict === 'supported';
        return (
          <li key={i} className="flex gap-2.5 text-xs leading-snug">
            {ok ? (
              <Check className="mt-px h-3.5 w-3.5 shrink-0 text-[#3DD68C]" />
            ) : (
              <X className="mt-px h-3.5 w-3.5 shrink-0 text-[#F47783]" />
            )}
            <span className={ok ? 'text-[#8A9099]' : 'text-[#F9B8BF]'}>
              {allOk && claims.length === 1 ? 'Every claim is supported by a retrieved chunk.' : c.claim}
              {!ok && <span className="ml-1 text-[#F47783]">not in context</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

const ReplayProof: React.FC<{ replay: NonNullable<LabResult['replay']>; before: number | null }> = ({ replay, before }) => {
  const fixed = (replay.answer_accuracy ?? 0) >= ACCURACY_THRESHOLD;
  return (
    <div className="lab-panel rounded-[14px] p-4">
      <div className="flex items-center gap-2.5 text-xs">
        <span className="rounded-md bg-[#1E2126] px-2 py-0.5 font-mono text-[11px] text-[#C9CDD3]">REPLAY</span>
        <span className="text-[#C9CDD3]">Same model, only the correct source</span>
        <span className="ml-auto font-medium tabular-nums" style={{ color: fixed ? PASS : RED }}>
          {pct(before)} → {pct(replay.answer_accuracy)}
        </span>
      </div>
      {replay.answer && (
        <p className="mt-3 text-[15px] leading-normal text-[#E8EAED]">
          <Figures text={replay.answer} color={fixed ? PASS : undefined} />
        </p>
      )}
      {replay.verdict_effect && (
        <div className="mt-3 border-t border-[#1E2126] pt-3 text-xs text-[#9AA0A8]">{replay.verdict_effect}</div>
      )}
    </div>
  );
};

// Money, percentages and plain numbers are the facts that differ between versions,
// so they get the chunk's or answer's status colour, but only the ones that appear
// in the answer, the known answer or the replay; other numbers are noise.
// Citation markers like [2] are skipped.
const FIGURE = /(\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|(?<!\[)\b\d[\d,]*(?:\.\d+)?\b(?!\]))/g;

const normFigure = (f: string) => f.replace(/[\s,$]/g, '');

function figuresIn(...texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) for (const f of t?.match(FIGURE) ?? []) out.add(normFigure(f));
  return out;
}

const KeyFigures = React.createContext<Set<string>>(new Set());

const Figures: React.FC<{ text: string; color?: string }> = ({ text, color }) => {
  const keep = React.useContext(KeyFigures);
  if (!color) return <>{text}</>;
  const parts = text.split(FIGURE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 && keep.has(normFigure(p)) ? (
          <span key={i} className="font-medium" style={{ color }}>
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
};

/** Chunks start with their markdown heading; the filename already says where it came from. */
function stripHeading(text: string): string {
  return text
    .replace(/^#+\s.*\n+/, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

const Dot = () => <span className="h-[3px] w-[3px] rounded-full bg-[#3A3E45]" />;
