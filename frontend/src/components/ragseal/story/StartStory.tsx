import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, MessagesSquare, PlayCircle, ScanSearch } from 'lucide-react';
import { PackId } from '../../../types/ragseal';
import { loadPackBackend } from '../../../lib/api';
import { RunSummary } from '../shared/apiExtra';
import { PACKS } from '../shared/ui';
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
  const { sectionRef, viewport, chapter } = useScrollStory(CHAPTERS);
  const [docs, setDocs] = useState<{ filename: string; chunk_count?: number }[] | null>(null);

  const hero = useMemo(() => pickHero(latest?.banking), [latest]);

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
          <Stage c={chapter} hero={hero} docs={docs} height={height} />
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
        {hero && <Rail c={chapter} />}
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
}> = ({ c, hero, docs, height, still }) => {
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

  // Phases.
  const qIn = easeOut(seg(c, 0.05, 0.6));
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
      className="relative mx-auto flex h-full max-w-[1240px] flex-col px-8 pb-8 pt-7"
      style={{ opacity: 1 - outro, transform: `translateX(${jitter}px) scale(${1 - 0.03 * outro})` }}
    >
      {/* Progress bar */}
      {!still && (
        <div className="absolute left-8 right-8 top-0 h-[2px] origin-left" style={{ background: 'var(--ink)', transform: `scaleX(${Math.min(1, c / CHAPTERS)})` }} />
      )}

      {/* Caption: one per chapter, cross-faded */}
      <div className="relative h-[112px] shrink-0">
        {CAPTIONS.slice(0, 7).map((cap, i) => {
          // Strictly sequential: chapter i fades out over i+0.88..0.95, chapter i+1 fades in from i+0.96.
          const fadeOut = 1 - seg(c, i + 0.88, i + 0.95);
          const o = still ? (Math.floor(c) === i ? 1 : 0) : i === 0 ? fadeOut : seg(c, i - 0.04, i + 0.05) * fadeOut;
          return (
            <div key={i} className="absolute inset-0" style={{ opacity: o, transform: `translateY(${(1 - o) * 8}px)` }}>
              <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-2)' }}>
                <span>{String(i + 1).padStart(2, '0')} / {String(CHAPTERS).padStart(2, '0')}</span>
                <span>{cap.eyebrow}</span>
                {i === 1 && docCount > 0 && (
                  <span style={{ color: 'var(--ink)' }}>
                    · {docCount} documents{passageCount ? ` · ${passageCount} passages` : ''}
                  </span>
                )}
              </div>
              <h2 className="mt-2 max-w-[1120px] text-[31px] leading-[1.15]" style={{ color: 'var(--ink)' }}>
                {cap.title}
              </h2>
            </div>
          );
        })}
      </div>

      {/* Scene */}
      <div
        className="grid min-h-0 flex-1 gap-6"
        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr) minmax(0,0.85fr)', opacity: 1 - 0.55 * easeOut(stampIn) }}
      >
        {/* Chat */}
        <div className="flex min-h-0 flex-col gap-3 rounded-2xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--rule)', opacity: qIn }}>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--ok)' }} />
            {PERSONA.banking} · chatbot
          </div>
          <div
            className="ml-auto max-w-[92%] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-snug"
            style={{ background: 'var(--ink)', color: 'var(--paper)', transform: `translateY(${(1 - qIn) * 12}px)` }}
          >
            {hero.query}
          </div>

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
        <div className="relative min-h-0 overflow-hidden rounded-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--rule)', opacity: c < 1 ? 0.35 * qIn : 1 }}>
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
        <div className="flex min-h-0 flex-col gap-3 rounded-2xl p-5" style={{ background: 'var(--panel)', border: '1px solid var(--rule)', opacity: c < 4 ? 0.35 * qIn : 1 }}>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-2)' }}>
            RAGSeal’s checks
          </div>
          {checks.map((k, i) => {
            const t = easeOut(seg(dials, i * 0.2, i * 0.2 + 0.6));
            const replayFill = i === 2 ? easeOut(seg(c, 5.6, 6.0)) : 0;
            const value = i === 2 && replayFill > 0 ? (k.score ?? 0) + ((hero.replay?.answer_accuracy ?? 0) - (k.score ?? 0)) * replayFill : k.score ?? 0;
            const good = value >= k.thr;
            return (
              <div key={k.label} className="flex items-center gap-3" style={{ opacity: c < 4 ? 0 : 0.25 + 0.75 * t }}>
                <Dial value={value * t} color={good ? 'var(--ok)' : 'var(--gen)'} />
                <div className="min-w-0">
                  <div className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                    {k.label}
                  </div>
                  <div className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                    {k.tech} · <span style={{ color: good ? 'var(--ok)' : 'var(--gen)' }}>{Math.round(value * t * 100)}%</span>
                    {replayFill > 0.95 && <span> · after replay</span>}
                  </div>
                </div>
              </div>
            );
          })}
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

      {!still && c < 0.6 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[12px]" style={{ color: 'var(--ink-2)', opacity: 1 - seg(c, 0.2, 0.6) }}>
          Scroll to follow the question ↓
        </div>
      )}
    </div>
  );
};

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

/** Chapter rail on the right edge. */
const Rail: React.FC<{ c: number }> = ({ c }) => (
  <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 flex-col gap-2 xl:flex" style={{ opacity: 1 - seg(c, 7, 7.3) }}>
    {CAPTIONS.map((_, i) => (
      <span
        key={i}
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: Math.floor(c) === i ? 'var(--ink)' : 'var(--rule)', transform: `scale(${Math.floor(c) === i ? 1.4 : 1})` }}
      />
    ))}
  </div>
);

const Outro: React.FC<{
  latest: Latest | null;
  onOpenPack: (p: PackId) => void;
  onNavigate: (r: Route) => void;
  style: React.CSSProperties;
}> = ({ latest, onOpenPack, onNavigate, style }) => (
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Cta icon={<MessagesSquare className="h-5 w-5" />} title="Try a chatbot" body="Ask anything and watch each reply get X-rayed." onClick={() => onNavigate('bots')} primary />
        <Cta icon={<ScanSearch className="h-5 w-5" />} title="Diagnose answers" body="Open any wrong answer and its replay proof." onClick={() => onNavigate('diagnose')} />
        <Cta icon={<PlayCircle className="h-5 w-5" />} title="Run a full test" body="Check every question in a pack, live." onClick={() => onNavigate('runs')} />
      </div>
    </div>
  </div>
);

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
