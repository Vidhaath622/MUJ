import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, Check, Loader2, Minus, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { loadPackBackend } from '../../../lib/api';
import { PackId } from '../../../types/ragseal';
import { evaluateAcrossDocs, LabChunk, LabPack, LabResult, LabTestCase } from '../lab/useLabData';
import { AMBER, pct, PASS, RED, verdictStyle } from '../lab/verdict';
import { CaseDrawer } from '../shared/CaseDrawer';
import { errorText, getRun, listRuns } from '../shared/apiExtra';
import { ErrorBanner } from '../shared/ui';

/**
 * Bots under test. Each persona is a RAG chatbot answering from one sample pack's
 * documents (the companies named in those documents). The left pane is the chat;
 * the right pane X-rays the selected reply: what it read, three checks, the verdict
 * and the replay proof.
 */
interface Persona {
  pack: PackId;
  org: string;
  role: string;
  initials: string;
  accent: string;
}

const PERSONAS: Persona[] = [
  { pack: 'banking', org: 'Harbor Ridge Bank', role: 'Fees & accounts assistant', initials: 'HR', accent: '#5BA8FF' },
  { pack: 'recruitment', org: 'Northwind Talent', role: 'HR policy assistant', initials: 'NT', accent: '#B48CFF' },
  { pack: 'healthcare', org: 'Mercy Vale General Hospital', role: 'Patient help desk', initials: 'MV', accent: '#2DD4BF' },
];

const TRAP: Record<string, { badge: string; teaser: string }> = {
  stale: { badge: 'Old version exists', teaser: 'There is an outdated copy of this policy in the documents too.' },
  distractor: { badge: 'Look-alike document', teaser: 'A different document talks about something very similar.' },
  unanswerable: { badge: 'Not in the documents', teaser: 'The honest answer is “I don’t know”. Will it make one up?' },
};

interface Turn {
  id: number;
  question: string;
  result?: LabResult;
  error?: string;
  pending?: boolean;
  example?: boolean;
}

interface BotsPageProps {
  token: string | null;
  initialPack: PackId;
}

export const BotsPage: React.FC<BotsPageProps> = ({ token, initialPack }) => {
  const [botPack, setBotPack] = useState<PackId>(PERSONAS.some((p) => p.pack === initialPack) ? initialPack : 'banking');
  const [packs, setPacks] = useState<Partial<Record<PackId, LabPack>>>({});
  const [examples, setExamples] = useState<Partial<Record<PackId, LabResult | null>>>({});
  const [packError, setPackError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Partial<Record<PackId, Turn[]>>>({});
  const [selectedTurn, setSelectedTurn] = useState<Partial<Record<PackId, number>>>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<LabResult | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const persona = PERSONAS.find((p) => p.pack === botPack)!;
  const pack = packs[botPack] ?? null;
  const userTurns = threads[botPack] ?? [];
  const example = examples[botPack];
  const exampleTurn: Turn | null = example ? { id: 0, question: example.query, result: example, example: true } : null;
  const turns: Turn[] = exampleTurn ? [exampleTurn, ...userTurns] : userTurns;
  const busy = userTurns.some((t) => t.pending);
  const selectedId = selectedTurn[botPack] ?? turns[turns.length - 1]?.id;
  const xrayTurn = turns.find((t) => t.id === selectedId) ?? turns[turns.length - 1];

  // Load the pack (documents + its test questions) and an example exchange from its latest run.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setPackError(null);
    if (!packs[botPack]) {
      loadPackBackend(botPack, token)
        .then((p: LabPack) => !cancelled && setPacks((m) => ({ ...m, [botPack]: p })))
        .catch((err: unknown) => !cancelled && setPackError(errorText(err)));
    }
    if (examples[botPack] === undefined) {
      (async () => {
        try {
          const runs = (await listRuns(token)).filter((r) => r.pack_id === botPack && (r.status ?? 'done') === 'done');
          const latest = runs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          if (!latest) throw new Error('no run');
          const detail = (await getRun(latest.batch_id, token)) as { results?: LabResult[] };
          const results = detail.results ?? [];
          const failed = results.filter((r) => (r.root_cause?.category ?? r.category) !== 'CLEAN_PASS' && r.replay);
          const pick =
            failed.find((r) => r.case_type === 'stale' && (r.root_cause?.category ?? r.category) === 'RETRIEVAL_FAILURE') ??
            failed[0] ??
            null;
          if (!cancelled) setExamples((m) => ({ ...m, [botPack]: pick }));
        } catch {
          if (!cancelled) setExamples((m) => ({ ...m, [botPack]: null }));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botPack, token]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [userTurns.length, userTurns[userTurns.length - 1]?.pending]);

  const filenames = useMemo(
    () => Object.fromEntries((pack?.documents ?? []).map((d) => [d.document_id, d.filename])),
    [pack]
  );

  // "Can you trick it?": one question per trap kind from the pack's real test set.
  const tricks = useMemo(() => {
    const cases = pack?.test_cases ?? [];
    return (['stale', 'distractor', 'unanswerable'] as const)
      .map((t) => cases.find((c) => c.type === t && c.test_id !== example?.test_id))
      .filter((c): c is LabTestCase => !!c);
  }, [pack, example]);

  const ask = async (question: string, known?: LabTestCase) => {
    const q = question.trim();
    if (!q || !token || !pack || busy) return;
    const id = nextId.current++;
    const forPack = botPack;
    setDraft('');
    setHighlight(null);
    setThreads((t) => ({ ...t, [forPack]: [...(t[forPack] ?? []), { id, question: q, pending: true }] }));
    setSelectedTurn((s) => ({ ...s, [forPack]: id }));
    let update: Partial<Turn>;
    try {
      const result = await evaluateAcrossDocs(q, pack.document_ids, token, known?.ground_truth_answer, {
        gold_chunk_ids: known?.gold_chunk_ids,
        stale_chunk_ids: known?.stale_chunk_ids,
        type: known?.type,
      });
      update = { result, pending: false };
    } catch (err) {
      update = { error: errorText(err), pending: false };
    }
    setThreads((t) => ({
      ...t,
      [forPack]: (t[forPack] ?? []).map((turn) => (turn.id === id ? { ...turn, ...update } : turn)),
    }));
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Chat */}
      <section className="flex min-w-0 flex-[55] flex-col">
        <div className="flex items-center gap-2 border-b border-[#17191D] px-5 py-3">
          {PERSONAS.map((p) => {
            const active = p.pack === botPack;
            return (
              <button
                key={p.pack}
                onClick={() => {
                  setBotPack(p.pack);
                  setHighlight(null);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors',
                  active ? 'text-white' : 'border-transparent text-[#8A9099] hover:text-[#E8EAED]'
                )}
                style={active ? { borderColor: `${p.accent}66`, background: `${p.accent}14` } : undefined}
              >
                <Avatar persona={p} size={24} />
                {p.org.split(' ').slice(0, 2).join(' ')}
              </button>
            );
          })}
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-6 py-5">
            <ErrorBanner message={packError} onDismiss={() => setPackError(null)} />

            {/* Persona header */}
            <div className="flex items-center gap-3.5">
              <Avatar persona={persona} size={44} />
              <div className="min-w-0">
                <div className="text-[17px] font-semibold tracking-[-0.01em] text-white">{persona.org}</div>
                <div className="flex items-center gap-2 text-xs text-[#8A9099]">
                  {persona.role}
                  <span className="h-1 w-1 rounded-full bg-[#3A3E45]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3DD68C]" />
                  {pack ? `Online · reads ${pack.documents.length} documents` : 'Connecting…'}
                </div>
              </div>
            </div>

            {example === undefined && !userTurns.length && (
              <div className="flex items-center gap-2 text-[13px] text-[#8A9099]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading a real exchange from the latest test…
              </div>
            )}

            {turns.map((t) => (
              <React.Fragment key={t.id}>
                {t.example && (
                  <div className="-mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[#6F757E]">
                    <span className="h-px flex-1 bg-[#1A1D22]" /> From the latest test run <span className="h-px flex-1 bg-[#1A1D22]" />
                  </div>
                )}
                <TurnView
                  turn={t}
                  persona={persona}
                  selected={t.id === xrayTurn?.id}
                  filenames={filenames}
                  onSelect={() => setSelectedTurn((s) => ({ ...s, [botPack]: t.id }))}
                  onCite={(chunkId) => {
                    setSelectedTurn((s) => ({ ...s, [botPack]: t.id }));
                    setHighlight(chunkId);
                  }}
                />
                {t.example && (
                  <div className="mt-1 flex items-center gap-2 text-[13px] font-medium text-[#C9CDD3]">
                    Try it yourself <span aria-hidden="true">↓</span>
                  </div>
                )}
              </React.Fragment>
            ))}

            {tricks.length > 0 && !busy && (
              <div>
                <div className="mb-2 text-[13px] font-semibold text-white">Can you trick it?</div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {tricks.map((c) => {
                    const trap = TRAP[c.type ?? ''] ?? { badge: 'Trick', teaser: '' };
                    return (
                      <button
                        key={c.test_id}
                        onClick={() => ask(c.question, c)}
                        className="group flex flex-col gap-2 rounded-xl border border-[#1F2228] bg-[#0D0E11] p-3 text-left transition-colors hover:border-[#2F333A] hover:bg-[#111317]"
                      >
                        <span
                          className="self-start rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                          style={{ background: `${persona.accent}1A`, color: persona.accent }}
                        >
                          {trap.badge}
                        </span>
                        <span className="line-clamp-3 text-[13px] leading-snug text-[#E8EAED]">{c.question}</span>
                        <span className="text-[11px] leading-snug text-[#6F757E]">{trap.teaser}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[#17191D] px-6 py-3.5">
          <form
            className="mx-auto flex max-w-[760px] items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <label className="flex h-11 flex-1 items-center rounded-xl border border-[#22252B] bg-[#0D0E11] px-4 focus-within:border-[#3A3E45]">
              <span className="sr-only">Message {persona.org}</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!pack}
                placeholder={`Ask ${persona.org} anything…`}
                className="h-10 flex-1 bg-transparent text-[14px] text-[#E8EAED] placeholder:text-[#6F757E] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={!draft.trim() || busy || !pack}
              aria-label="Send"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[#0A0B0D] transition-opacity disabled:opacity-30"
              style={{ background: persona.accent }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </section>

      {/* X-ray */}
      <aside className="flex min-w-0 flex-[45] flex-col border-l border-[#17191D] bg-[#0A0B0D]">
        <div className="flex items-center justify-between border-b border-[#17191D] px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-white">X-ray of this reply</div>
            <div className="text-[11px] text-[#8A9099]">What the bot read, three checks, and who is to blame</div>
          </div>
          {xrayTurn?.example && (
            <span className="rounded-full border border-[#2A2E35] px-2 py-0.5 text-[10.5px] text-[#9AA0A8]">From the latest test run</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!xrayTurn ? (
            <XrayEmpty />
          ) : xrayTurn.pending ? (
            <XrayPending />
          ) : xrayTurn.error ? (
            <p className="text-[13px] text-[#F9B8BF]">{xrayTurn.error}</p>
          ) : xrayTurn.result ? (
            <Xray
              key={xrayTurn.id}
              r={xrayTurn.result}
              filenames={filenames}
              highlight={highlight}
              onOpen={() => setOpen(xrayTurn.result!)}
            />
          ) : null}
        </div>
      </aside>

      <CaseDrawer result={open} filenames={filenames} onClose={() => setOpen(null)} />
    </div>
  );
};

const Avatar: React.FC<{ persona: Persona; size: number }> = ({ persona, size }) => (
  <span
    className="flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[-0.02em]"
    style={{
      width: size,
      height: size,
      fontSize: size * 0.38,
      color: persona.accent,
      background: `radial-gradient(circle at 30% 25%, ${persona.accent}38, ${persona.accent}12)`,
      boxShadow: `inset 0 0 0 1px ${persona.accent}55`,
    }}
  >
    {persona.initials}
  </span>
);

/** The chunk a citation number points to: [n] is the n-th retrieved passage. */
function citedChunks(r: LabResult): { n: number; chunk: LabChunk }[] {
  const chunks = r.retrieved_chunks ?? [];
  const cited = new Set(r.citations ?? []);
  return chunks.map((chunk, i) => ({ n: i + 1, chunk })).filter((c) => cited.has(c.chunk.chunk_id));
}

const TurnView: React.FC<{
  turn: Turn;
  persona: Persona;
  selected: boolean;
  filenames: Record<string, string>;
  onSelect: () => void;
  onCite: (chunkId: string) => void;
}> = ({ turn, persona, selected, filenames, onSelect, onCite }) => {
  const r = turn.result;
  const v = r ? verdictStyle(r.root_cause?.category ?? r.category) : null;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#1C1F24] px-4 py-2.5 text-[14px] leading-relaxed text-[#F4F5F6]">
          {turn.question}
        </div>
      </div>
      <div className="flex items-end gap-2.5">
        <Avatar persona={persona} size={28} />
        {turn.pending ? (
          <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[#1F2228] bg-[#111317] px-4 py-3.5" aria-label="Typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-[#9AA0A8]" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </div>
        ) : turn.error ? (
          <div className="rounded-2xl rounded-bl-md border border-[#F47783]/40 bg-[#F47783]/10 px-4 py-2.5 text-[13px] text-[#F9B8BF]">
            Couldn’t answer: {turn.error}
          </div>
        ) : (
          <button
            onClick={onSelect}
            className={cn(
              'max-w-[86%] rounded-2xl rounded-bl-md border px-4 py-3 text-left transition-colors',
              selected ? 'bg-[#14161A]' : 'border-[#1F2228] bg-[#111317] hover:border-[#2A2E35]'
            )}
            style={selected && v ? { borderColor: `${v.color}66` } : undefined}
          >
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#F4F5F6]">
              {(r?.generated_answer ?? '').replace(/\s*\[\d+(?:[-,]\s*\d+)*\]/g, '') || <span className="text-[#8A9099]">No answer.</span>}
            </p>
            {r && (
              <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {citedChunks(r).map(({ n, chunk }) => (
                  <span
                    key={chunk.chunk_id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCite(chunk.chunk_id);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && onCite(chunk.chunk_id)}
                    className="rounded-md border border-[#2A2E35] px-1.5 py-0.5 text-[11px] text-[#9AA0A8] hover:border-[#3A3E45] hover:text-white"
                  >
                    [{n}] {chunk.filename ?? filenames[chunk.document_id ?? ''] ?? 'document'}
                  </span>
                ))}
                {v && (
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium" style={{ color: v.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                    {v.label}
                  </span>
                )}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

/** The animated X-ray: passages slide in, checks tick one by one, the verdict stamps, the replay proves it. */
const Xray: React.FC<{ r: LabResult; filenames: Record<string, string>; highlight: string | null; onOpen: () => void }> = ({
  r,
  filenames,
  highlight,
  onOpen,
}) => {
  const v = verdictStyle(r.root_cause?.category ?? r.category);
  const m = r.metrics ?? {};
  const gold = new Set(r.gold_chunk_ids ?? []);
  const stale = new Set(r.stale_chunk_ids ?? []);
  const cited = new Set(r.citations ?? []);
  const chunks = (r.retrieved_chunks ?? []).map((c, i) => {
    const isGold = c.is_gold ?? gold.has(c.chunk_id);
    const isStale = c.is_stale ?? stale.has(c.chunk_id);
    const tag = isStale ? 'Old version' : isGold ? 'Right text' : c.is_relevant === false ? 'Not relevant' : 'Related';
    const color = isStale ? AMBER : isGold ? PASS : null;
    return { c, n: i + 1, tag, color, used: cited.has(c.chunk_id) };
  });
  const shown = chunks.filter((x) => x.color || x.used || x.c.is_relevant !== false);
  const hidden = chunks.length - shown.length;
  const checks: [string, string, number | null | undefined, number][] = [
    ['Found the right text', 'retriever', m.context_relevance?.score, 0.7],
    ['Stuck to the text', 'bot', m.faithfulness?.score, 0.75],
    ['Correct answer', 'end to end', m.answer_accuracy?.score, 0.7],
  ];
  const base = shown.length * 110;
  const replay = r.replay;
  const fixed = replay ? (replay.answer_accuracy ?? 0) >= 0.7 : false;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionLabel n={1}>What the bot read</SectionLabel>
        <div className="mt-2 space-y-2">
          {shown.map(({ c, n, tag, color, used }, i) => (
            <div
              key={c.chunk_id}
              className={cn('xray-in rounded-xl border px-3 py-2.5 transition-shadow', highlight === c.chunk_id && 'ring-2 ring-white/40')}
              style={{
                animationDelay: `${i * 110}ms`,
                borderColor: color ? `${color}66` : '#1F2228',
                background: color ? `${color}0F` : '#0D0E11',
              }}
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-[#6F757E]">[{n}]</span>
                <span className="truncate text-[#C9CDD3]">{c.filename ?? filenames[c.document_id ?? ''] ?? 'document'}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {used && <span className="text-[#9AA0A8]">bot used it</span>}
                  <span className="rounded-full px-1.5 py-0.5" style={color ? { background: `${color}22`, color } : { color: '#8A9099' }}>
                    {tag}
                  </span>
                </span>
              </div>
              <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-[#B4B9C0]">
                {c.text.replace(/^#+\s.*\n+/, '').replace(/\s*\n+\s*/g, ' ')}
              </p>
            </div>
          ))}
          {hidden > 0 && <p className="text-[11px] text-[#6F757E]">+ {hidden} unrelated passage{hidden === 1 ? '' : 's'} hidden</p>}
        </div>
      </section>

      <section>
        <SectionLabel n={2}>Three checks</SectionLabel>
        <ul className="mt-2 divide-y divide-[#17191D] rounded-xl border border-[#1F2228] bg-[#0D0E11]">
          {checks.map(([label, tech, score, threshold], i) => {
            const ok = score == null ? null : score >= threshold;
            return (
              <li
                key={label}
                className="xray-in flex items-center gap-3 px-3.5 py-2.5"
                style={{ animationDelay: `${base + 150 + i * 220}ms` }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: ok == null ? '#1C1F24' : ok ? `${PASS}22` : `${RED}22` }}
                >
                  {ok == null ? (
                    <Minus className="h-3.5 w-3.5 text-[#6F757E]" />
                  ) : ok ? (
                    <Check className="h-3.5 w-3.5" style={{ color: PASS }} />
                  ) : (
                    <X className="h-3.5 w-3.5" style={{ color: RED }} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-[#E8EAED]">{label}</span>
                  <span className="block text-[10.5px] text-[#6F757E]">{ok == null ? 'no known answer to compare' : tech}</span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: ok == null ? '#6F757E' : ok ? PASS : RED }}>
                  {pct(score)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="stamp-land" style={{ animationDelay: `${base + 900}ms` }}>
        <SectionLabel n={3}>Verdict</SectionLabel>
        <div className="mt-2 rounded-xl border-2 px-4 py-3" style={{ borderColor: `${v.color}88`, background: `${v.color}12` }}>
          <div className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: v.color }}>
            {v.label}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#C9CDD3]">{r.root_cause?.summary ?? v.blame}</p>
        </div>
      </section>

      {replay && (
        <section className="xray-in" style={{ animationDelay: `${base + 1300}ms` }}>
          <SectionLabel n={4}>Replay: the proof</SectionLabel>
          <div className="mt-2 rounded-xl border border-[#23262C] bg-[#111317] px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] text-[#9AA0A8]">
              With only the right text
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium" style={{ color: fixed ? PASS : RED }}>
                {fixed ? 'fixed' : 'still wrong'} ({pct(replay.answer_accuracy)})
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#E8EAED]">
              {(replay.answer ?? '').replace(/\s*\[\d+(?:[-,]\s*\d+)*\]/g, '')}
            </p>
            <p className="mt-1.5 text-[11.5px] text-[#8A9099]">
              {fixed ? 'So the retriever caused it: the bot was fine once it had the right text.' : 'So the bot is at fault: even the right text didn’t help.'}
            </p>
          </div>
        </section>
      )}

      <button onClick={onOpen} className="flex items-center gap-1.5 self-start text-[13px] font-medium text-white hover:underline">
        Open full diagnosis <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const SectionLabel: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A9099]">
    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#2A2E35] font-mono text-[9.5px] text-[#C9CDD3]">{n}</span>
    {children}
  </div>
);

const XrayPending: React.FC = () => (
  <div className="flex flex-col gap-3">
    {['Finding the text to read…', 'Writing the answer…', 'Checking it three ways…'].map((s, i) => (
      <div key={s} className="xray-in flex items-center gap-2.5 text-[13px] text-[#8A9099]" style={{ animationDelay: `${i * 600}ms` }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {s}
      </div>
    ))}
  </div>
);

const XrayEmpty: React.FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
    <div className="text-[13px] text-[#C9CDD3]">Ask the bot something</div>
    <p className="max-w-[300px] text-xs leading-relaxed text-[#6F757E]">
      Each reply is X-rayed here: the text it read, whether it found and stuck to the right text, and whether the answer is correct.
    </p>
  </div>
);
