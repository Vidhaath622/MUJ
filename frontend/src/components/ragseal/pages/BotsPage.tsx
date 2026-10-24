import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Building2, HeartPulse, Landmark, Loader2, ScanSearch } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { loadPackBackend } from '../../../lib/api';
import { PackId } from '../../../types/ragseal';
import { evaluateAcrossDocs, LabPack, LabResult } from '../lab/useLabData';
import { pct, scoreColor, verdictStyle } from '../lab/verdict';
import { CaseDrawer } from '../shared/CaseDrawer';
import { errorText } from '../shared/apiExtra';
import { ErrorBanner } from '../shared/ui';

/** Three RAG bots under test, each answering from one pack's documents. */
const BOTS: { pack: PackId; name: string; blurb: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    pack: 'healthcare',
    name: 'Hospital help desk',
    blurb: 'Visiting hours, departments, clinical protocols.',
    icon: HeartPulse,
  },
  {
    pack: 'recruitment',
    name: 'HR policy assistant',
    blurb: 'Hiring policy, job descriptions, referral rules.',
    icon: Building2,
  },
  {
    pack: 'banking',
    name: 'Bank fee & terms bot',
    blurb: 'Fee schedules, account terms, disputes.',
    icon: Landmark,
  },
];

interface Turn {
  id: number;
  question: string;
  result?: LabResult;
  error?: string;
  pending?: boolean;
}

interface BotsPageProps {
  token: string | null;
  initialPack: PackId;
}

/**
 * The working RAG app: chat with a bot, and every reply is scored as it arrives,
 * retriever and generator separately, with a one-click full diagnosis.
 */
export const BotsPage: React.FC<BotsPageProps> = ({ token, initialPack }) => {
  const [botPack, setBotPack] = useState<PackId>(BOTS.some((b) => b.pack === initialPack) ? initialPack : 'healthcare');
  const [pack, setPack] = useState<LabPack | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Partial<Record<PackId, Turn[]>>>({});
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<LabResult | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const bot = BOTS.find((b) => b.pack === botPack)!;
  const turns = threads[botPack] ?? [];
  const busy = turns.some((t) => t.pending);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setPack(null);
    setPackError(null);
    loadPackBackend(botPack, token)
      .then((p: LabPack) => !cancelled && setPack(p))
      .catch((err: unknown) => !cancelled && setPackError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [botPack, token]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, turns[turns.length - 1]?.pending]);

  const filenames = useMemo(
    () => Object.fromEntries((pack?.documents ?? []).map((d) => [d.document_id, d.filename])),
    [pack]
  );

  // A few real pack questions as starters: traps first, they make the best demo.
  const starters = useMemo(() => {
    const cases = pack?.test_cases ?? [];
    const rank = (t?: string) => (t === 'stale' ? 0 : t === 'distractor' ? 1 : t === 'unanswerable' ? 2 : 3);
    return [...cases].sort((a, b) => rank(a.type) - rank(b.type)).slice(0, 4);
  }, [pack]);

  const ask = async (question: string, known?: { answer?: string; gold?: string[]; stale?: string[]; type?: string }) => {
    const q = question.trim();
    if (!q || !token || !pack || busy) return;
    const id = nextId.current++;
    const forPack = botPack;
    setDraft('');
    setThreads((t) => ({ ...t, [forPack]: [...(t[forPack] ?? []), { id, question: q, pending: true }] }));
    let update: Partial<Turn>;
    try {
      const result = await evaluateAcrossDocs(q, pack.document_ids, token, known?.answer, {
        gold_chunk_ids: known?.gold,
        stale_chunk_ids: known?.stale,
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
      {/* Bot picker */}
      <aside className="flex w-[264px] shrink-0 flex-col gap-2 border-r border-[#17191D] p-4">
        <div className="px-1 pb-1 text-xs text-[#8A9099]">Choose a bot</div>
        {BOTS.map((b) => {
          const active = b.pack === botPack;
          const Icon = b.icon;
          return (
            <button
              key={b.pack}
              onClick={() => setBotPack(b.pack)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                active ? 'border-[#2A2E35] bg-[#111317]' : 'border-transparent hover:bg-white/[0.02]'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                  active ? 'border-[#3A3E45] text-white' : 'border-[#1F2228] text-[#8A9099]'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-[13px] font-medium', active ? 'text-white' : 'text-[#C9CDD3]')}>{b.name}</span>
                <span className="mt-0.5 block text-xs leading-snug text-[#8A9099]">{b.blurb}</span>
              </span>
            </button>
          );
        })}
        <p className="mt-auto px-1 text-xs leading-relaxed text-[#6F757E]">
          Every reply is scored live: did the retriever find the right passage, and did the model stay faithful to it?
        </p>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-6 py-6">
            <ErrorBanner message={packError} onDismiss={() => setPackError(null)} />
            {turns.length === 0 ? (
              <Welcome
                name={bot.name}
                docs={pack?.documents.length}
                loading={!pack && !packError}
                starters={starters.map((s) => ({ q: s.question, type: s.type }))}
                onPick={(i) => {
                  const s = starters[i];
                  ask(s.question, { answer: s.ground_truth_answer, gold: s.gold_chunk_ids, stale: s.stale_chunk_ids, type: s.type });
                }}
              />
            ) : (
              turns.map((t) => <TurnView key={t.id} turn={t} filenames={filenames} onOpen={setOpen} />)
            )}
          </div>
        </div>

        <div className="border-t border-[#17191D] px-6 py-4">
          <form
            className="mx-auto flex max-w-[1080px] items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <label className="flex min-h-[46px] flex-1 items-center rounded-xl border border-[#22252B] bg-[#0D0E11] px-4 focus-within:border-[#3A3E45]">
              <span className="sr-only">Message {bot.name}</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!pack}
                placeholder={`Message ${bot.name}…`}
                className="h-11 flex-1 bg-transparent text-[14px] text-[#E8EAED] placeholder:text-[#6F757E] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={!draft.trim() || busy || !pack}
              aria-label="Send"
              className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-[#F4F5F6] text-[#0A0B0D] transition-colors hover:bg-white disabled:bg-[#1C1F24] disabled:text-[#6F757E]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </section>

      <CaseDrawer result={open} filenames={filenames} onClose={() => setOpen(null)} />
    </div>
  );
};

const Welcome: React.FC<{
  name: string;
  docs?: number;
  loading: boolean;
  starters: { q: string; type?: string }[];
  onPick: (i: number) => void;
}> = ({ name, docs, loading, starters, onPick }) => (
  <div className="lab-fade-up flex flex-col items-center gap-6 pt-[8vh] text-center">
    <div>
      <h2 className="text-[26px] font-semibold tracking-[-0.025em] text-white">{name}</h2>
      <p className="mt-2 text-[14px] text-[#8A9099]">
        {loading ? 'Loading its documents…' : `Answers from ${docs ?? 0} documents. Each reply gets scored as it arrives.`}
      </p>
    </div>
    {starters.length > 0 && (
      <div className="grid w-full max-w-[760px] grid-cols-1 gap-2.5 sm:grid-cols-2">
        {starters.map((s, i) => (
          <button
            key={s.q}
            onClick={() => onPick(i)}
            className="rounded-xl border border-[#1F2228] bg-[#0D0E11] px-4 py-3 text-left text-[13px] leading-snug text-[#C9CDD3] transition-colors hover:border-[#2E3238] hover:text-white"
          >
            {s.q}
            {s.type && s.type !== 'factoid' && <span className="mt-1 block text-[11px] text-[#6F757E]">{s.type} trap</span>}
          </button>
        ))}
      </div>
    )}
  </div>
);

const TurnView: React.FC<{
  turn: Turn;
  filenames: Record<string, string>;
  onOpen: (r: LabResult) => void;
}> = ({ turn, filenames, onOpen }) => {
  const r = turn.result;
  const cited = new Set(r?.citations ?? []);
  const sources = (r?.retrieved_chunks ?? []).filter((c) => cited.has(c.chunk_id));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-br-md bg-[#16181C] px-4 py-2.5 text-[14px] leading-relaxed text-[#E8EAED]">
          {turn.question}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {turn.pending ? (
            <div className="flex items-center gap-2.5 py-2 text-[13px] text-[#8A9099]">
              <Loader2 className="h-4 w-4 animate-spin" /> Retrieving, answering and judging…
            </div>
          ) : turn.error ? (
            <div className="rounded-xl border border-[#F47783]/40 bg-[#F47783]/10 px-4 py-2.5 text-[13px] text-[#F9B8BF]">
              {turn.error}
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#F4F5F6]">
                {r?.generated_answer || <span className="text-[#8A9099]">No answer.</span>}
              </p>
              {sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sources.map((c) => (
                    <span
                      key={c.chunk_id}
                      title={c.text}
                      className="max-w-[320px] truncate rounded-lg border border-[#1F2228] px-2.5 py-1 text-xs text-[#8A9099]"
                    >
                      <span className="text-[#C9CDD3]">{filenames[c.document_id ?? ''] ?? c.document_id}</span>{' '}
                      <span className="font-mono">{c.chunk_id}</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {r && <Scorecard r={r} onOpen={() => onOpen(r)} />}
      </div>
    </div>
  );
};

/** Compact live score for one reply: verdict, the three component scores, one line of cause. */
const Scorecard: React.FC<{ r: LabResult; onOpen: () => void }> = ({ r, onOpen }) => {
  const v = verdictStyle(r.root_cause?.category ?? r.category);
  const m = r.metrics ?? {};
  const scores: [string, number | null | undefined, number][] = [
    ['Retriever', m.context_relevance?.score, 0.7],
    ['Generator', m.faithfulness?.score, 0.75],
    ['Accuracy', m.answer_accuracy?.score, 0.7],
  ];
  return (
    <div className="lab-fade-up rounded-xl border p-3.5" style={{ borderColor: `${v.color}55`, background: `${v.color}0d` }}>
      <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: v.color }}>
        <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
        {v.label}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {scores.map(([label, score, threshold]) => (
          <div key={label}>
            <div className="text-[11px] text-[#8A9099]">{label}</div>
            <div className="text-[15px] font-semibold tabular-nums" style={{ color: scoreColor(score, threshold) }}>
              {pct(score)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-[#B4B9C0]">{r.root_cause?.summary ?? v.blame}</p>
      <button onClick={onOpen} className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-[#E8EAED] hover:text-white">
        <ScanSearch className="h-3.5 w-3.5" /> Open in Diagnose
      </button>
    </div>
  );
};

