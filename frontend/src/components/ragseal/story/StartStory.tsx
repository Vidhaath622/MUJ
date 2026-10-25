import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, Check, ChevronDown, MessagesSquare, PlayCircle, ScanSearch } from 'lucide-react';
import { PackId } from '../../../types/ragseal';
import { loadPackBackend } from '../../../lib/api';
import { RunSummary } from '../shared/apiExtra';
import { PACKS } from '../shared/ui';
import { usePacks } from '../shared/packs';
import { easeInOut, easeOut, seg, usePrefersReducedMotion, useScrollStory } from './useScrollStory';

// "Follow one question": a scroll-driven walk through one real failed case from the latest
// banking run. Every number and sentence on the stage comes from that run's stored result.

type Latest = Partial<Record<PackId, RunSummary>>;
type Route = 'bots' | 'diagnose' | 'runs' | 'trust';

interface StoryChunk {
  chunk_id: string;
  filename?: string;
  document_id?: string;
  text: string;
  is_gold?: boolean;
  is_stale?: boolean;
}

interface StoryCase {
  test_id?: string;
  query: string;
  generated_answer?: string;
  ground_truth?: string | null;
  retrieved_chunks?: StoryChunk[];
  citations?: string[];
  metrics?: Record<string, { score?: number | null; threshold?: number } | undefined>;
  root_cause?: { category?: string; summary?: string; recommended_action?: string; failure_type?: string };
  replay?: { answer?: string; answer_accuracy?: number | null } | null;
}

interface StartStoryProps {
  token: string | null;
  latest: Latest | null;
  onOpenPack: (packId: PackId) => void;
  onNavigate: (route: Route) => void;
}

const CHAPTERS = 8;

const CAPTIONS: { eyebrow: string; title: string }[] = [
  { eyebrow: 'A real question', title: 'A customer asks the bank’s chatbot a simple question.' },
  { eyebrow: 'Indexing', title: 'The bank’s documents were split into short passages and indexed.' },
  { eyebrow: 'Retrieval', title: 'The retriever searches every passage and hands the bot the best few.' },
  { eyebrow: 'Generation', title: 'The bot writes its answer from those passages.' },
  { eyebrow: 'Three separate checks', title: 'RAGSeal checks each part of the pipeline on its own.' },
  { eyebrow: 'Replay', title: 'Rewind. Same bot, given only the correct passage.' },
  { eyebrow: 'Verdict', title: 'Now we know which part broke, and we can prove it.' },
  { eyebrow: 'Every answer', title: 'That was one question. RAGSeal does this for every answer.' },
];

// Where "Next" and the chapter dots land: late enough in each chapter that its motion has played,
// early enough that the caption is still fully on (captions fade out from i + 0.88).
const TARGETS = [0, 1.86, 2.87, 3.86, 4.87, 5.87, 6.86, 7.6];

/** The chapter whose caption is showing at position `c`. */
const chapterAt = (c: number) => Math.max(0, Math.min(CHAPTERS - 1, Math.floor(c + 0.04)));

const PERSONA: Partial<Record<PackId, string>> = { banking: 'Harbor Ridge Bank' };

const tint = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;

/** Picks the case the story follows: bank_03 when it is a replay-proven failure, else the first such case. */
function pickHero(run?: RunSummary): StoryCase | null {
  const results = (run?.results ?? []) as StoryCase[];
  const proven = (r: StoryCase) => r.root_cause?.category === 'RETRIEVAL_FAILURE' && !!r.replay?.answer;
  return (
    results.find((r) => r.test_id === 'bank_03' && proven(r)) ??
    results.find((r) => proven(r) && r.root_cause?.failure_type === 'STALE_SOURCE') ??
    results.find(proven) ??
    null
  );
}

const FIGURE = /(\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%)/g;
const norm = (f: string) => f.replace(/[\s,$]/g, '');

function splitChunk(text: string): { heading: string; body: string } {
  const m = text.match(/^#+\s*(.+)\n+/);
  const heading = m ? m[1].trim() : '';
  const body = (m ? text.slice(m[0].length) : text).replace(/\s*\n+\s*/g, ' ').trim();
  return { heading, body };
}

const Figures: React.FC<{ text: string; keep: Set<string>; color: string }> = ({ text, keep, color }) => (
  <>
    {text.split(FIGURE).map((p, i) =>
      i % 2 === 1 && keep.has(norm(p)) ? (
        <span key={i} style={{ color, fontWeight: 600 }}>
          {p}
        </span>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      )
    )}
  </>
);

const stripCitations = (s: string) => s.replace(/\s*\[\d+(?:[-,]\s*\d+)*\]/g, '').trim();

export const StartStory: React.FC<StartStoryProps> = ({ token, latest, onOpenPack, onNavigate }) => {
  const reduced = usePrefersReducedMotion();
  const { sectionRef, viewport, chapter, goTo, skipPast, pinned } = useScrollStory(CHAPTERS);
  const [docs, setDocs] = useState<{ filename: string; chunk_count?: number }[] | null>(null);

  const hero = useMemo(() => pickHero(latest?.banking), [latest]);

  const at = useRef(chapter);
  at.current = chapter;
  const step = useCallback(
    (dir: 1 | -1) => {
      const i = chapterAt(at.current) + dir;
      if (i >= CHAPTERS) skipPast();
      else goTo(TARGETS[Math.max(0, i)]);
    },
    [goTo, skipPast]
  );

  // ↓ / PageDown / Space step forward a chapter while the story is pinned; ↑ / PageUp / Shift+Space step back.
  useEffect(() => {
    if (!hero || reduced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !pinned()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName))) return;
      const fwd = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const back = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (!fwd && !back) return;
      e.preventDefault();
      step(fwd ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hero, reduced, pinned, step]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadPackBackend('banking', token)
      .then((p: { documents?: { filename: string; chunk_count?: number }[] }) => !cancelled && setDocs(p.documents ?? []))
      .catch(() => !cancelled && setDocs([]));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const height = Math.max(560, viewport);

  if (reduced) {
    return (
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6 py-6">
        {hero ? (
          [0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99].map((c) => (
            <div key={c} className="overflow-hidden rounded-2xl" style={{ height: 620, border: '1px solid var(--rule)', background: 'var(--panel)' }}>
              <Stage c={c} hero={hero} docs={docs} height={620} still />
            </div>
          ))
        ) : (
          <EmptyHero latest={latest} />
        )}
        <Outro latest={latest} onOpenPack={onOpenPack} onNavigate={onNavigate} style={{}} />
      </div>
    );
  }

  return (
    <section ref={sectionRef} style={{ height: height + height * CHAPTERS * 0.65, position: 'relative' }}>
      <div className="sticky top-0 overflow-hidden" style={{ height, background: 'var(--paper)' }}>
        {hero ? (
          <Stage c={chapter} hero={hero} docs={docs} height={height} onNext={() => step(1)} onSkip={skipPast} />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <EmptyHero latest={latest} />
          </div>
        )}
        <Outro
          latest={latest}
          onOpenPack={onOpenPack}
          onNavigate={onNavigate}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: hero ? seg(chapter, 7.1, 7.45) : 0,
            transform: `translateY(${(1 - easeOut(seg(chapter, 7.1, 7.5))) * 24}px)`,
            pointerEvents: !hero || chapter > 7.2 ? 'auto' : 'none',
            display: hero ? undefined : 'none',
          }}
        />
        {hero && <Rail c={chapter} onJump={(i) => goTo(TARGETS[i])} onNext={() => step(1)} />}
      </div>
    </section>
  );
};

const EmptyHero: React.FC<{ latest: Latest | null }> = ({ latest }) => (
  <div className="rounded-2xl px-6 py-5 text-[14px]" style={{ border: '1px solid var(--rule)', background: 'var(--panel)', color: 'var(--ink-2)' }}>
    {latest ? 'Run the Banking pack once to see one question followed end to end here.' : 'Loading the latest test run…'}
  </div>
);

/** The pinned scene. `c` is the chapter position (0 → 8); everything else is derived from it. */
const Stage: React.FC<{
  c: number;
  hero: StoryCase;
  docs: { filename: string; chunk_count?: number }[] | null;
  height: number;
  still?: boolean;
  onNext?: () => void;
  onSkip?: () => void;
}> = ({ c, hero, docs, height, still, onNext, onSkip }) => {
  const chunks = hero.retrieved_chunks ?? [];
  const cited = new Set(hero.citations ?? []);
  const answer = stripCitations(hero.generated_answer ?? '');
  const replay = stripCitations(hero.replay?.answer ?? '');
  const keep = useMemo(() => {
    const s = new Set<string>();
    for (const t of [hero.generated_answer, hero.ground_truth, hero.replay?.answer]) for (const f of t?.match(FIGURE) ?? []) s.add(norm(f));
    return s;
  }, [hero]);
  const m = hero.metrics ?? {};
  const checks = [
    { label: 'Found the right text', tech: 'context relevance', score: m.context_relevance?.score ?? null, thr: 0.7 },
    { label: 'Stuck to the text', tech: 'faithfulness', score: m.faithfulness?.score ?? null, thr: 0.75 },
    { label: 'Correct answer', tech: 'answer accuracy', score: m.answer_accuracy?.score ?? null, thr: 0.7 },
  ];
  const faithfulButWrong = (checks[1].score ?? 0) >= 0.75 && (checks[2].score ?? 1) < 0.7;
  const docCount = docs?.length ?? new Set(chunks.map((ch) => ch.filename ?? ch.document_id)).size;
  const passageCount = docs?.reduce((n, d) => n + (d.chunk_count ?? 0), 0) ?? 0;

  // Phases. Chapter 0 is fully set before any scroll: the question is on screen and the stages
  // ahead wait, faint, with a line on what each will do. Each "waiting" note leaves as its stage starts.
  const waitRetriever = 1 - seg(c, 0.75, 1.0);
  const waitGenerator = 1 - seg(c, 2.85, 3.05);
  const waitChecks = 1 - seg(c, 3.85, 4.05);
  const cue = still ? 0 : 1 - seg(c, 0.12, 0.45);
  const docsIn = seg(c, 1.0, 1.45);
  const split = easeInOut(seg(c, 1.45, 1.9));
  const sweep = seg(c, 1.95, 2.65);
  const pick = seg(c, 2.55, 2.98);
  const typing = seg(c, 3.05, 3.8);
  const dials = seg(c, 4.05, 4.7);
  const rewind = seg(c, 5.0, 5.45);
  const retype = seg(c, 5.5, 5.95);
  const bump = Math.sin(Math.PI * rewind);
  const stampIn = seg(c, 6.0, 6.35);
  const causeIn = easeOut(seg(c, 6.3, 6.7));
  const outro = seg(c, 7.0, 7.3);

  const shownAnswer = c < 5 ? answer.slice(0, Math.round(answer.length * typing)) : answer.slice(0, Math.round(answer.length * (1 - seg(c, 5.0, 5.35))));
  const shownReplay = replay.slice(0, Math.round(replay.length * retype));
  const jitter = still ? 0 : bump * Math.sin(c * 220) * 3;

  return (
    <div
      className="relative mx-auto flex h-full max-w-[1240px] 2xl:max-w-[1520px] flex-col justify-center px-4 sm:px-8 lg:pr-14 pb-4 sm:pb-6 pt-5 sm:pt-7"
      style={{ opacity: 1 - outro, transform: `translateX(${jitter}px) scale(${1 - 0.03 * outro})` }}
    >
      {/* Progress bar */}
      {!still && (
        <div className="absolute left-4 right-4 sm:left-8 sm:right-8 top-0 h-[2px] origin-left" style={{ background: 'var(--ink)', transform: `scaleX(${Math.min(1, c / CHAPTERS)})` }} />
      )}

      {/* Caption: one per chapter, cross-faded */}
      <div className="relative min-h-[90px] sm:h-[112px] shrink-0">
        {CAPTIONS.slice(0, 7).map((cap, i) => {
          // Strictly sequential: chapter i fades out over i+0.88..0.95, chapter i+1 fades in from i+0.96.
          const fadeOut = 1 - seg(c, i + 0.88, i + 0.95);
          const o = still ? (Math.floor(c) === i ? 1 : 0) : i === 0 ? fadeOut : seg(c, i - 0.04, i + 0.05) * fadeOut;
          return (
            <div key={i} className="absolute inset-0" style={{ opacity: o, transform: `translateY(${(1 - o) * 8}px)` }}>
              <div className="flex items-baseline gap-2 sm:gap-3 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-2)' }}>
                <span>{String(i + 1).padStart(2, '0')} / {String(CHAPTERS).padStart(2, '0')}</span>
                <span>{cap.eyebrow}</span>
                {i === 1 && docCount > 0 && (
                  <span className="hidden sm:inline" style={{ color: 'var(--ink)' }}>
                    · {docCount} documents{passageCount ? ` · ${passageCount} passages` : ''}
                  </span>
                )}
              </div>
              <h2 className="mt-1 sm:mt-2 max-w-[1120px] text-[20px] sm:text-[26px] md:text-[31px] leading-[1.15]" style={{ color: 'var(--ink)' }}>
                {cap.title}
              </h2>
            </div>
          );
        })}
      </div>

      {/* Scene */}
      <div
        className="grid min-h-0 flex-1 max-h-[580px] 2xl:max-h-[660px] gap-4 lg:gap-6 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.85fr)] overflow-y-auto lg:overflow-visible"
        style={{ opacity: 1 - 0.55 * easeOut(stampIn) }}
      >
        {/* Chat */}
        <div className="lab-fade-up flex min-h-0 flex-col gap-3 rounded-2xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
          <div className="flex items-center gap-2.5 text-[12px]" style={{ color: 'var(--ink-2)' }}>
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full" style={{ background: tint('--ink', 8), color: 'var(--ink)' }}>
              <Bot className="h-4 w-4" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full" style={{ background: 'var(--ok)', border: '2px solid var(--panel)' }} />
            </span>
            <span>
              <span style={{ color: 'var(--ink)' }}>{PERSONA.banking}</span> · chatbot
            </span>
          </div>
          <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-snug" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
            {hero.query}
          </div>
          {c < 3.05 && (
            <div className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--ink-2)', opacity: waitGenerator }}>
              <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md px-3 py-2.5" style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={still ? '' : 'typing-dot'} style={{ animationDelay: `${i * 0.15}s` }}>
                    <span className="block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ink-2)' }} />
                  </span>
                ))}
              </span>
              The bot will answer from what the retriever hands it.
            </div>
          )}

          {c >= 3.05 && (
            <div
              className="relative max-w-[94%] rounded-2xl rounded-bl-md px-4 py-3 text-[15px] leading-snug"
              style={{
                background: 'var(--paper)',
                border: `1px solid ${c >= 5.5 ? tint('--ok', 45) : c >= 4 ? tint('--gen', 40) : 'var(--rule)'}`,
                color: 'var(--ink)',
              }}
            >
              {c < 5.45 ? (
                <>
                  <Figures text={shownAnswer} keep={keep} color={c >= 4 ? 'var(--gen)' : 'var(--ink)'} />
                  {!still && typing < 1 && c < 5 && <Caret />}
                  {typing >= 1 && c < 5 && cited.size > 0 && (
                    <div className="mt-2 font-mono text-[11px]" style={{ color: 'var(--ink-2)' }}>
                      cites {chunks.filter((ch) => cited.has(ch.chunk_id)).map((ch) => ch.filename ?? ch.chunk_id).join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: 'var(--ok)' }}>
                    Replay
                  </div>
                  <Figures text={shownReplay} keep={keep} color="var(--ok)" />
                  {!still && retype < 1 && <Caret />}
                  {retype >= 1 && (hero.replay?.answer_accuracy ?? 0) >= 0.7 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full align-middle" style={{ background: 'var(--ok)', color: 'var(--paper)' }}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                  {retype >= 1 && answer && (
                    <div className="mt-2 text-[12px] line-through" style={{ color: 'var(--ink-2)' }}>
                      {answer}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {c >= 3.05 && hero.ground_truth && (
            <div className="mt-auto text-[12px]" style={{ color: 'var(--ink-2)', opacity: seg(c, 3.8, 4.1) }}>
              Known answer: <span style={{ color: 'var(--ink)' }}>{hero.ground_truth}</span>
            </div>
          )}
        </div>

        {/* Documents → passages → retrieved */}
        <div className="relative min-h-[220px] lg:min-h-0 overflow-hidden rounded-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
          {/* Waiting: what the retriever is about to do, over a faint field of passages */}
          {c < 1 && (
            <div className="absolute inset-0 flex flex-col p-5" style={{ opacity: waitRetriever }}>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-2)' }}>
                Retriever · waiting
              </div>
              <div className="mt-4 grid flex-1 content-start gap-[6px] opacity-60" style={{ gridTemplateColumns: 'repeat(6, minmax(0,1fr))' }}>
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className="h-7 rounded-md"
                    style={{ border: '1px dashed var(--rule)', background: chunks.length && i % 7 === 3 ? tint('--accent', 6) : 'transparent' }}
                  />
                ))}
              </div>
              <p className="mt-3 max-w-[440px] text-[13.5px] leading-snug" style={{ color: 'var(--ink-2)' }}>
                Next, it searches {passageCount ? `${passageCount} passages from ` : ''}
                {docCount ? `${docCount} bank documents` : 'the bank’s documents'} and hands the bot the best {chunks.length || 4}. One of them is out of date.
              </p>
            </div>
          )}
          {/* Document tiles falling in, then splitting */}
          <div className="absolute inset-0 grid content-start gap-3 p-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', opacity: c < 1 ? 0 : 1 - seg(split, 0, 0.45) }}>
            {(docs ?? []).slice(0, 6).map((d, i) => {
              const t = easeOut(seg(docsIn, i * 0.1, i * 0.1 + 0.5));
              return (
                <div
                  key={d.filename}
                  className="rounded-xl px-3 py-3"
                  style={{ border: '1px solid var(--rule)', background: 'var(--paper)', opacity: t, transform: `translateY(${(1 - t) * -28}px)` }}
                >
                  <div className="truncate font-mono text-[12px]" style={{ color: 'var(--ink)' }}>
                    {d.filename}
                  </div>
                  <div className="mt-2 flex gap-[3px]">
                    {Array.from({ length: Math.min(d.chunk_count ?? 4, 12) }).map((_, j) => (
                      <span key={j} className="h-1.5 flex-1 rounded-sm" style={{ background: 'var(--rule)' }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Passage grid + retriever beam */}
          <div className="absolute inset-0 p-5" style={{ opacity: split * (1 - easeOut(pick)) }}>
            <div className="grid h-full content-start gap-[6px]" style={{ gridTemplateColumns: 'repeat(6, minmax(0,1fr))' }}>
              {Array.from({ length: Math.max(passageCount, 24) }).map((_, i) => {
                const t = seg(split, 0.45 + (i % 24) * 0.012, 0.75 + (i % 24) * 0.012);
                return <span key={i} className="h-7 rounded-md" style={{ background: 'var(--paper)', border: '1px solid var(--rule)', opacity: t }} />;
              })}
            </div>
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-24"
              style={{
                left: 0,
                background: `linear-gradient(90deg, transparent, ${tint('--accent', 28)}, transparent)`,
                opacity: Math.sin(Math.PI * sweep),
                transform: `translateX(${sweep * 520}px)`,
              }}
            />
          </div>

          {/* Retrieved passages */}
          <div className="absolute inset-0 flex flex-col gap-2.5 overflow-hidden p-5">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-2)', opacity: pick }}>
              <span>What the bot read</span>
              <span>top {chunks.length}</span>
            </div>
            {chunks.map((ch, i) => {
              const t = easeOut(seg(pick, i * 0.15, i * 0.15 + 0.55));
              const { heading, body } = splitChunk(ch.text);
              const tag = ch.is_gold ? 'Current version' : ch.is_stale ? 'Outdated version' : 'Not relevant';
              const tone = ch.is_gold ? '--ok' : ch.is_stale ? '--retr' : '--review';
              const out = ch.is_stale ? easeInOut(seg(c, 5.05, 5.4)) : 0;
              const dim = !ch.is_gold && !ch.is_stale ? 0.55 : 1;
              return (
                <div
                  key={ch.chunk_id}
                  className="relative rounded-xl px-3.5 py-2.5"
                  style={{
                    border: `1px solid ${ch.is_gold || ch.is_stale ? tint(tone, 50) : 'var(--rule)'}`,
                    background: ch.is_gold || ch.is_stale ? tint(tone, 7) : 'var(--paper)',
                    opacity: t * dim * (1 - 0.75 * out),
                    transform: `translateY(${(1 - t) * 16}px) translateX(${out * 36}px)`,
                  }}
                >
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <span className="truncate font-mono" style={{ color: 'var(--ink)' }}>
                      {ch.filename ?? ch.document_id}
                    </span>
                    {heading && (
                      <span className="truncate" style={{ color: 'var(--ink-2)' }}>
                        · {heading}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ color: `var(${tone})`, background: tint(tone, 12) }}>
                      {out > 0.5 ? 'Removed for replay' : tag}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug" style={{ color: 'var(--ink-2)' }}>
                    <Figures text={body} keep={keep} color={`var(${tone})`} />
                  </p>
                  {out > 0 && (
                    <span className="absolute left-3 right-3 top-1/2 h-[1.5px] origin-left" style={{ background: 'var(--retr)', transform: `scaleX(${out})` }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Checks */}
        <div className="flex min-h-0 flex-col gap-3 rounded-2xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--rule)', opacity: c < 1 ? 0.75 : c < 4 ? 0.5 : 1 }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-2)' }}>
            RAGSeal’s checks{c < 4 ? ' · waiting' : ''}
          </div>
          {checks.map((k, i) => {
            const t = easeOut(seg(dials, i * 0.2, i * 0.2 + 0.6));
            const replayFill = i === 2 ? easeOut(seg(c, 5.6, 6.0)) : 0;
            const value = i === 2 && replayFill > 0 ? (k.score ?? 0) + ((hero.replay?.answer_accuracy ?? 0) - (k.score ?? 0)) * replayFill : k.score ?? 0;
            const good = value >= k.thr;
            return (
              <div key={k.label} className="flex items-center gap-3" style={{ opacity: c < 4 ? 0.45 : 0.25 + 0.75 * t }}>
                <Dial value={value * t} color={good ? 'var(--ok)' : 'var(--gen)'} />
                <div className="min-w-0">
                  <div className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                    {k.label}
                  </div>
                  <div className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                    {k.tech} ·{' '}
                    {c < 4 ? (
                      'not scored yet'
                    ) : (
                      <span style={{ color: good ? 'var(--ok)' : 'var(--gen)' }}>{Math.round(value * t * 100)}%</span>
                    )}
                    {replayFill > 0.95 && <span> · after replay</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {c < 4.05 && (
            <p className="mt-auto text-[13px] leading-snug" style={{ color: 'var(--ink-2)', opacity: waitChecks }}>
              Once the bot answers, RAGSeal scores the retriever, the generator and the final answer separately.
            </p>
          )}
          {faithfulButWrong && (
            <div
              className="mt-auto rounded-xl px-3.5 py-3 text-[14px] leading-snug"
              style={{ background: tint('--gen', 8), border: `1px solid ${tint('--gen', 35)}`, color: 'var(--ink)', opacity: seg(c, 4.65, 4.95) * (1 - seg(c, 5.4, 5.6)) }}
            >
              <span style={{ fontWeight: 600 }}>Faithful, and still wrong.</span> It stuck to the text it was given. The text was the problem.
            </div>
          )}
        </div>
      </div>

      {/* Rewind: scanlines and a sweeping band */}
      {!still && bump > 0.01 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: bump }}>
          <div
            className="absolute inset-0"
            style={{ background: `repeating-linear-gradient(0deg, ${tint('--ink', 6)} 0px, ${tint('--ink', 6)} 1px, transparent 1px, transparent 4px)` }}
          />
          <div className="absolute left-0 right-0 h-16" style={{ top: 0, background: tint('--ink', 8), transform: `translateY(${(1 - rewind) * (height - 64)}px)` }} />
          <div className="absolute right-10 top-8 font-mono text-[18px] font-semibold tracking-[0.24em]" style={{ color: 'var(--ink)' }}>
            ◀◀ REWIND
          </div>
        </div>
      )}

      {/* Verdict stamp */}
      {stampIn > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5">
          <div
            className="rounded-lg px-7 py-3 font-mono text-[44px] font-bold uppercase tracking-[0.08em]"
            style={{
              color: 'var(--retr)',
              border: '5px double var(--retr)',
              background: 'var(--paper)',
              opacity: Math.min(1, stampIn * 3),
              transform: `rotate(-3deg) scale(${1 + 1.3 * (1 - easeOut(stampIn))})`,
            }}
          >
            {(hero.root_cause?.category ?? 'RETRIEVAL_FAILURE').replace(/_/g, ' ')}
          </div>
          <div
            className="max-w-[640px] rounded-2xl px-6 py-4 text-center text-[15px] leading-relaxed"
            style={{ background: 'var(--panel)', border: '1px solid var(--rule)', color: 'var(--ink)', opacity: causeIn, transform: `translateY(${(1 - causeIn) * 10}px)` }}
          >
            {hero.root_cause?.summary && (
              <div>
                <span style={{ color: 'var(--ink-2)' }}>Cause: </span>
                {hero.root_cause.summary}
              </div>
            )}
            {hero.root_cause?.recommended_action && (
              <div className="mt-1">
                <span style={{ color: 'var(--ink-2)' }}>Fix: </span>
                {hero.root_cause.recommended_action}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll cue + skip, directly under the stage (kept in the layout so nothing jumps when it fades) */}
      {!still && (
        <div className="relative mt-4 flex h-11 shrink-0 items-center justify-center" style={{ opacity: 1 - seg(c, 6.9, 7.1) }}>
          <div
            className="flex items-center gap-3 rounded-full py-1.5 pl-3 pr-1.5 text-[13.5px]"
            style={{ opacity: cue, pointerEvents: cue > 0.2 ? 'auto' : 'none', background: 'var(--panel)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
          >
            <ScrollMouse />
            <span>Scroll to follow the question</span>
            <button
              onClick={onNext}
              className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-85"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              Next <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onSkip}
            className="absolute right-0 hidden items-center gap-1 text-[12.5px] transition-opacity hover:opacity-70 sm:inline-flex"
            style={{ color: 'var(--ink-2)' }}
          >
            Skip to results <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

/** A mouse outline whose wheel rolls down, on a loop: the universal "scroll" hint. */
const ScrollMouse: React.FC = () => (
  <svg width="16" height="24" viewBox="0 0 16 24" aria-hidden="true" className="story-bob shrink-0">
    <rect x="1" y="1" width="14" height="22" rx="7" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
    <rect className="story-wheel" x="7" y="5" width="2" height="5" rx="1" fill="var(--ink)" />
  </svg>
);

const Caret: React.FC = () => <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse" style={{ background: 'var(--ink)' }} />;

const Dial: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0" aria-hidden="true">
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--rule)" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - Math.max(0, Math.min(1, value)))}
        transform="rotate(-90 26 26)"
      />
    </svg>
  );
};

/** Chapter rail on the right edge: one dot per chapter (hover for its name, click to jump), then "next". */
const Rail: React.FC<{ c: number; onJump: (i: number) => void; onNext: () => void }> = ({ c, onJump, onNext }) => {
  const now = chapterAt(c);
  const hidden = seg(c, 7, 7.3);
  return (
    <nav
      aria-label="Story chapters"
      className="absolute right-2 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-1 lg:flex"
      style={{ opacity: 1 - hidden, pointerEvents: hidden > 0.5 ? 'none' : 'auto' }}
    >
      {CAPTIONS.map((cap, i) => (
        <button
          key={i}
          onClick={() => onJump(i)}
          aria-label={`Chapter ${i + 1}: ${cap.eyebrow}`}
          aria-current={now === i ? 'step' : undefined}
          className="group relative flex h-6 w-6 items-center justify-center"
        >
          <span
            className="block h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-125"
            style={{
              background: now === i ? 'var(--ink)' : i < now ? 'var(--ink-2)' : 'transparent',
              border: `1.5px solid ${now === i ? 'var(--ink)' : 'var(--ink-2)'}`,
              transform: now === i ? 'scale(1.25)' : undefined,
            }}
          />
          <span
            className="pointer-events-none absolute right-7 whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ background: 'var(--panel)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
          >
            {String(i + 1).padStart(2, '0')} · {cap.eyebrow}
          </span>
        </button>
      ))}
      <button
        onClick={onNext}
        aria-label="Next chapter"
        className="mt-1 flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-70"
        style={{ border: '1px solid var(--rule)', color: 'var(--ink-2)' }}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </nav>
  );
};

const Outro: React.FC<{
  latest: Latest | null;
  onOpenPack: (p: PackId) => void;
  onNavigate: (r: Route) => void;
  style: React.CSSProperties;
}> = ({ latest, onOpenPack, onNavigate, style }) => {
  const more = usePacks().filter((p) => !PACKS.some((q) => q.id === p.id));
  return (
  <div className="flex items-center justify-center px-8" style={style}>
    <div className="flex w-full max-w-[1100px] flex-col gap-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-2)' }}>
          08 / 08 · Every answer
        </div>
        <h2 className="mt-2 text-[34px] leading-[1.12]" style={{ color: 'var(--ink)' }}>
          {CAPTIONS[7].title}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PACKS.map((p) => {
          const s = latest?.[p.id];
          const b = s?.root_cause_breakdown ?? {};
          const parts: [string, string][] = [
            ['CLEAN_PASS', '--ok'],
            ['RETRIEVAL_FAILURE', '--retr'],
            ['GENERATION_HALLUCINATION', '--gen'],
            ['COMPOUND_FAILURE', '--gen'],
            ['NEEDS_REVIEW', '--review'],
            ['UNRESOLVED', '--review'],
          ];
          return (
            <button
              key={p.id}
              onClick={() => onOpenPack(p.id)}
              className="group flex flex-col gap-2 rounded-2xl px-5 py-4 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                  {p.label}
                </span>
                <span className="text-[26px] font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {s?.aggregates?.pass_rate != null ? `${Math.round(s.aggregates.pass_rate * 100)}%` : '—'}
                </span>
              </div>
              <div className="flex h-1.5 gap-[2px]">
                {parts
                  .filter(([k]) => b[k])
                  .map(([k, v]) => (
                    <span key={k} className="rounded-[2px]" style={{ flex: b[k], background: `var(${v})` }} />
                  ))}
              </div>
              <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                {s ? `correct of ${s.total_evaluated} questions · open the diagnosis →` : 'No finished test yet'}
              </span>
            </button>
          );
        })}
      </div>
      {more.length > 0 && (
        <p className="-mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Plus {more.length} more test packs, including{' '}
          {more
            .slice(0, 4)
            .map((p) => p.label)
            .join(', ')}
          .{' '}
          <button onClick={() => onNavigate('runs')} className="underline underline-offset-2 hover:text-[var(--ink)]">
            Run any of them →
          </button>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Cta icon={<MessagesSquare className="h-5 w-5" />} title="Try a chatbot" body="Ask anything and watch each reply get X-rayed." onClick={() => onNavigate('bots')} primary />
        <Cta icon={<ScanSearch className="h-5 w-5" />} title="Diagnose answers" body="Open any wrong answer and its replay proof." onClick={() => onNavigate('diagnose')} />
        <Cta icon={<PlayCircle className="h-5 w-5" />} title="Run a full test" body="Check every question in a pack, live." onClick={() => onNavigate('runs')} />
      </div>
    </div>
  </div>
  );
};

const Cta: React.FC<{ icon: React.ReactNode; title: string; body: string; onClick: () => void; primary?: boolean }> = ({ icon, title, body, onClick, primary }) => (
  <button
    onClick={onClick}
    className="group flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-transform hover:-translate-y-0.5"
    style={primary ? { background: 'var(--ink)', color: 'var(--paper)' } : { background: 'var(--panel)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
  >
    <span className="shrink-0">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold">{title}</span>
      <span className="block text-[12.5px]" style={{ opacity: 0.75 }}>
        {body}
      </span>
    </span>
    <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
  </button>
);
