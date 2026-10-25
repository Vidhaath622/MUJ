import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Bot,
  Briefcase,
  Check,
  ChevronDown,
  FileText,
  GraduationCap,
  IndianRupee,
  Landmark,
  Library,
  Loader2,
  LucideIcon,
  MapPin,
  Minus,
  Percent,
  Plug,
  Receipt,
  Smartphone,
  Stethoscope,
  X,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { API_BASE_URL, ApiError, checkBackendHealth, HealthResponse, loadPackBackend } from '../../../lib/api';
import { PackId } from '../../../types/ragseal';
import { LabChunk, LabPack, LabResult, LabTestCase } from '../lab/useLabData';
import { AMBER, pct, PASS, RED, verdictStyle, tint } from '../lab/verdict';
import { CaseDrawer } from '../shared/CaseDrawer';
import { BotConfig, errorText, getRun, listProfiles, listRuns, RagProfile } from '../shared/apiExtra';
import { PACK_GROUPS, PackOption, usePacks } from '../shared/packs';
import { ErrorBanner } from '../shared/ui';

/**
 * Try a chatbot, in two steps: choose the bot (our sample RAG bot, or the one saved on Connect
 * your bot), then the documents it answers from. The left pane is the chat; the right pane
 * X-rays the selected reply: what it read, three checks, the verdict and the replay proof.
 */

type Source = 'fictional' | 'public' | 'summarised' | 'own';

interface DataMeta {
  domain: string;
  name: string;
  icon: LucideIcon;
  accent: string;
  /** One plain sentence: what this data is, before the document list. */
  about: string;
  source: Source;
}

// What each pack's documents are, in words a first-time visitor understands.
const DATA_META: Record<string, DataMeta> = {
  banking: { domain: 'Bank', name: 'Harbor Ridge', icon: Landmark, accent: 'var(--accent)', about: 'A fictional bank’s help desk for fees and accounts.', source: 'fictional' },
  healthcare: { domain: 'Hospital', name: 'Mercy Vale', icon: Stethoscope, accent: 'var(--teal)', about: 'A fictional hospital’s patient help desk.', source: 'fictional' },
  recruitment: { domain: 'Recruiting', name: 'Northwind Talent', icon: Briefcase, accent: 'var(--violet)', about: 'A fictional recruiting firm’s HR policy assistant.', source: 'fictional' },
  income_tax_india: { domain: 'Income tax', name: 'India', icon: IndianRupee, accent: 'var(--accent)', about: 'India’s new-regime income tax slabs, FY 2024-25 vs FY 2025-26.', source: 'summarised' },
  gst_india: { domain: 'GST', name: 'India', icon: Percent, accent: 'var(--teal)', about: 'GST rates before and after the September 2025 revision.', source: 'summarised' },
  gst_reform_overview: { domain: 'GST reform', name: 'India', icon: Receipt, accent: 'var(--teal)', about: 'A separate summary of the September 2025 GST changes.', source: 'summarised' },
  telecom_india: { domain: 'Telecom', name: 'India', icon: Smartphone, accent: 'var(--violet)', about: 'Prepaid mobile tariffs before and after the July 2024 price rises.', source: 'summarised' },
  rishihood_rules: { domain: 'University', name: 'Rishihood', icon: GraduationCap, accent: 'var(--retr)', about: 'A university’s academic rules, 2023-24 vs 2025-26.', source: 'summarised' },
  travel_jaipur_goa: { domain: 'Travel', name: 'Jaipur & Goa', icon: MapPin, accent: 'var(--retr)', about: 'Entry fees and timings in Jaipur and Goa, a 2022 edition vs today’s.', source: 'summarised' },
  realworld: { domain: 'Tax news', name: 'IRS (USA)', icon: FileText, accent: 'var(--accent)', about: 'Real IRS news releases on mileage rates and retirement limits.', source: 'public' },
  synthetic_public: { domain: 'Public documents', name: 'Mix', icon: Library, accent: 'var(--accent)', about: 'Real public documents searched together: IRS releases and RAGSeal’s guide.', source: 'public' },
  ragseal: { domain: 'Product guide', name: 'RAGSeal', icon: BookOpen, accent: 'var(--retr)', about: 'Questions about RAGSeal itself, answered from its own docs; its answers get X-rayed too.', source: 'own' },
};

const SOURCE_CHIP: Record<Source, { label: string; title: string }> = {
  fictional: { label: 'Fictional demo data', title: 'Made-up company documents, written to contain traps.' },
  public: { label: 'Real public info', title: 'Real, public documents, copied as published.' },
  summarised: { label: 'Public info, summarised', title: 'Written by our team from public sources; figures were not re-checked against the originals.' },
  own: { label: 'Our own docs', title: 'RAGSeal’s own documentation.' },
};

function dataMeta(p: { id: string; label: string }): DataMeta {
  return DATA_META[p.id] ?? { domain: p.label, name: '', icon: FileText, accent: 'var(--accent)', about: '', source: 'public' };
}

const dataTitle = (m: DataMeta) => (m.name ? `${m.domain} · ${m.name}` : m.domain);

const TRAP: Record<string, { badge: string; teaser: string }> = {
  stale: { badge: 'Old version exists', teaser: 'There is an outdated copy of this in the documents too.' },
  distractor: { badge: 'Look-alike document', teaser: 'A different document talks about something very similar.' },
  unanswerable: { badge: 'Not in the documents', teaser: 'The honest answer is “I don’t know”. Will it make one up?' },
  factoid: { badge: 'Straight question', teaser: 'The answer is in the documents. Does it find it and stick to it?' },
  multi_hop: { badge: 'Needs two documents', teaser: 'The answer is split across documents. Does it put it together?' },
};

// The bot saved on Connect your bot (header values are never stored, so a keyed bot asks for its key here).
const BOT_STORE_KEY = 'ragseal.bot';
const SETUP_SEEN_KEY = 'ragseal.chat.setup';

interface SavedBot {
  name: string;
  url: string;
  headers: { name: string; value: string }[];
  accepts_contexts: boolean;
  question_field?: string;
  contexts_field?: string;
  answer_path?: string;
  contexts_path?: string;
  timeout_s?: number;
}

function loadSavedBot(): SavedBot | null {
  try {
    const saved = JSON.parse(localStorage.getItem(BOT_STORE_KEY) ?? 'null');
    return saved?.url ? saved : null;
  } catch {
    return null;
  }
}

function botHost(url: string): string {
  try {
    return new URL(url, window.location.origin).host;
  } catch {
    return url;
  }
}

/** The saved bot as a request config. Our own sample endpoint follows the chosen data. */
function savedBotConfig(bot: SavedBot, packId: string, keys: Record<string, string>): BotConfig {
  let url = bot.url.trim();
  if (url.includes('/bots/builtin')) url = url.replace(/pack_id=[^&]*/, `pack_id=${encodeURIComponent(packId)}`);
  return {
    url,
    headers: Object.fromEntries(bot.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), keys[h.name] ?? ''])),
    accepts_contexts: bot.accepts_contexts,
    question_field: bot.question_field || 'question',
    contexts_field: bot.contexts_field || 'contexts',
    answer_path: bot.answer_path || 'answer',
    contexts_path: bot.contexts_path || 'contexts',
    timeout_s: bot.timeout_s || 30,
    ...(bot.name?.trim() ? { name: bot.name.trim() } : {}),
  };
}

/** One question to the chosen bot. A pack question sends its test id so the backend restores its known answer and traps. */
async function askBot(
  token: string,
  body: { query: string; pack_id: string; document_ids: string[]; test_id?: string; bot?: BotConfig }
): Promise<LabResult> {
  const res = await fetch(`${API_BASE_URL}/evaluate/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
      else if (Array.isArray(data?.detail)) detail = data.detail.map((d: { msg?: string }) => d.msg).join('; ');
    } catch {
      // keep status text
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

interface Turn {
  id: number;
  question: string;
  result?: LabResult;
  error?: string;
  pending?: boolean;
  example?: boolean;
}

type BotChoice = 'sample' | 'yours';

interface BotsPageProps {
  token: string | null;
  initialPack: PackId;
}

export const BotsPage: React.FC<BotsPageProps> = ({ token, initialPack }) => {
  const allPacks = usePacks();
  const [botPack, setBotPack] = useState<PackId>(initialPack in DATA_META ? initialPack : 'banking');
  const [botChoice, setBotChoice] = useState<BotChoice>('sample');
  const [savedBot] = useState<SavedBot | null>(loadSavedBot);
  const [botKeys, setBotKeys] = useState<Record<string, string>>({});
  const [setupOpen, setSetupOpen] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem(SETUP_SEEN_KEY);
    } catch {
      return true;
    }
  });
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [profile, setProfile] = useState<RagProfile | null>(null);
  const [packs, setPacks] = useState<Partial<Record<PackId, LabPack>>>({});
  const [examples, setExamples] = useState<Partial<Record<PackId, LabResult | null>>>({});
  const [packError, setPackError] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Turn[]>>({});
  const [selectedTurn, setSelectedTurn] = useState<Record<string, number>>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'chat' | 'xray'>('chat');
  const [docsOpen, setDocsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<LabResult | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const packOption = allPacks.find((p) => p.id === botPack) ?? { id: botPack, label: botPack, group: 'Other' };
  const meta = dataMeta(packOption);
  const pack = packs[botPack] ?? null;
  const usingOwnBot = botChoice === 'yours' && !!savedBot;
  // Each bot + data pair keeps its own conversation.
  const threadKey = `${usingOwnBot ? 'yours' : 'sample'}:${botPack}`;
  const userTurns = threads[threadKey] ?? [];
  const example = usingOwnBot ? null : examples[botPack];
  const exampleTurn: Turn | null = example ? { id: 0, question: example.query, result: example, example: true } : null;
  const turns: Turn[] = exampleTurn ? [exampleTurn, ...userTurns] : userTurns;
  const busy = userTurns.some((t) => t.pending);
  const selectedId = selectedTurn[threadKey] ?? turns[turns.length - 1]?.id;
  const xrayTurn = turns.find((t) => t.id === selectedId) ?? turns[turns.length - 1];
  const missingKeys = usingOwnBot ? savedBot!.headers.filter((h) => h.name.trim() && !botKeys[h.name]) : [];
  const botLabel = usingOwnBot ? savedBot!.name?.trim() || botHost(savedBot!.url) : 'RAGSeal sample bot';

  // The sample bot's real settings: the model from /health, retrieval from the baseline (v1) profile.
  useEffect(() => {
    let cancelled = false;
    checkBackendHealth().then((h) => !cancelled && setHealth(h));
    if (token)
      listProfiles(token)
        .then((ps) => !cancelled && setProfile(ps.find((p) => p.id === 'v1') ?? null))
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Load the pack (documents + its test questions) and an example exchange from its latest run.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setPackError(null);
    setDocsOpen(false);
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

  // Opening or closing the steps starts at the top; a new question scrolls down to the reply.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [setupOpen]);

  useEffect(() => {
    if (!userTurns.length) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTurns.length, userTurns[userTurns.length - 1]?.pending]);

  const filenames = useMemo(
    () => Object.fromEntries((pack?.documents ?? []).map((d) => [d.document_id, d.filename])),
    [pack]
  );

  // "Can you trick it?": one question per trap kind from the pack's real test set.
  const tricks = useMemo(() => {
    const cases = pack?.test_cases ?? [];
    const picked = (['stale', 'distractor', 'unanswerable'] as const)
      .map((t) => cases.find((c) => c.type === t && c.test_id !== example?.test_id))
      .filter((c): c is LabTestCase => !!c);
    // Packs without every trap kind (e.g. the RAGSeal guide) fill up with plain questions.
    for (const c of cases) {
      if (picked.length >= 3) break;
      if (c.test_id !== example?.test_id && !picked.includes(c)) picked.push(c);
    }
    return picked;
  }, [pack, example]);

  const closeSetup = () => {
    setSetupOpen(false);
    try {
      sessionStorage.setItem(SETUP_SEEN_KEY, '1');
    } catch {
      // storage unavailable: the steps just show again next visit
    }
  };

  const ask = async (question: string, known?: LabTestCase) => {
    const q = question.trim();
    if (!q || !token || !pack || busy || missingKeys.length) return;
    closeSetup();
    const id = nextId.current++;
    const key = threadKey;
    setDraft('');
    setHighlight(null);
    setThreads((t) => ({ ...t, [key]: [...(t[key] ?? []), { id, question: q, pending: true }] }));
    setSelectedTurn((s) => ({ ...s, [key]: id }));
    let update: Partial<Turn>;
    try {
      const result = await askBot(token, {
        query: q,
        pack_id: botPack,
        document_ids: pack.document_ids,
        ...(known ? { test_id: known.test_id } : {}),
        ...(usingOwnBot ? { bot: savedBotConfig(savedBot!, botPack, botKeys) } : {}),
      });
      update = { result, pending: false };
    } catch (err) {
      update = { error: errorText(err), pending: false };
    }
    setThreads((t) => ({
      ...t,
      [key]: (t[key] ?? []).map((turn) => (turn.id === id ? { ...turn, ...update } : turn)),
    }));
  };

  const selectTurn = (id: number) => {
    setSelectedTurn((s) => ({ ...s, [threadKey]: id }));
    setMobilePane('xray');
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Mobile pane switcher for screens < lg */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--rule)] bg-[var(--panel-2)] p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane('chat')}
          className={cn(
            'flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition-colors',
            mobilePane === 'chat' ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
          )}
        >
          Chat ({turns.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('xray')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-center text-xs font-medium transition-colors',
            mobilePane === 'xray' ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
          )}
        >
          <span>X-ray of reply</span>
          {xrayTurn?.result && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
        </button>
      </div>

      {/* Chat */}
      <section className={cn('min-w-0 flex-[55] flex-col', mobilePane === 'chat' ? 'flex' : 'hidden lg:flex')}>
        {/* Summary of the two choices; "change" reopens the steps */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--rule)] px-4 py-2.5 sm:px-5">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-[var(--ink)]">
            {usingOwnBot ? <Plug className="h-4 w-4 shrink-0 text-[var(--ink-2)]" /> : <Bot className="h-4 w-4 shrink-0 text-[var(--ink-2)]" />}
            <span className="font-medium">{botLabel}</span>
            <span className="text-[var(--muted)]">answering from</span>
            <DataIcon meta={meta} size={20} />
            <span className="font-medium">{dataTitle(meta)}</span>
          </span>
          <button
            onClick={() => (setupOpen ? closeSetup() : setSetupOpen(true))}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-2)] px-2.5 py-1 text-[0.8125rem] text-[var(--ink-1)] transition-colors hover:border-[var(--rule-3)] hover:text-[var(--ink)]"
          >
            {setupOpen ? 'Done' : 'Change'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', setupOpen && 'rotate-180')} />
          </button>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5">
            <ErrorBanner message={packError} onDismiss={() => setPackError(null)} />

            {setupOpen ? (
              <Setup
                health={health}
                profile={profile}
                savedBot={savedBot}
                botChoice={botChoice}
                onBot={setBotChoice}
                botKeys={botKeys}
                onKey={(name, value) => setBotKeys((k) => ({ ...k, [name]: value }))}
                packs={allPacks}
                packId={botPack}
                onPack={(id) => {
                  setBotPack(id);
                  setHighlight(null);
                }}
                onStart={closeSetup}
              />
            ) : (
              <>
                <DataHeader
                  meta={meta}
                  option={packOption}
                  pack={pack}
                  docsOpen={docsOpen}
                  onToggleDocs={() => setDocsOpen((x) => !x)}
                />

                {missingKeys.length > 0 && (
                  <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--retr)_8%,transparent)] px-3.5 py-2.5 text-[0.84375rem] text-[var(--ink-1)]">
                    {botLabel} needs its {missingKeys.map((h) => h.name).join(', ')} header to answer. Add it under{' '}
                    <button onClick={() => setSetupOpen(true)} className="font-medium text-[var(--ink)] underline underline-offset-2">
                      Change
                    </button>
                    ; it stays in this tab only.
                  </div>
                )}

                {example === undefined && !userTurns.length && (
                  <div className="flex items-center gap-2 text-[0.875rem] text-[var(--ink-2)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading a real exchange from the latest test…
                  </div>
                )}

                {turns.map((t) => (
                  <React.Fragment key={t.id}>
                    {t.example && (
                      <div className="-mb-2 flex items-center gap-2 text-[0.8125rem] text-[var(--ink-2)]">
                        <span className="h-px flex-1 bg-[var(--rule)]" /> From the latest test run <span className="h-px flex-1 bg-[var(--rule)]" />
                      </div>
                    )}
                    <TurnView
                      turn={t}
                      meta={meta}
                      ownBot={usingOwnBot}
                      selected={t.id === xrayTurn?.id}
                      filenames={filenames}
                      onSelect={() => selectTurn(t.id)}
                      onWhy={() => t.result && setOpen(t.result)}
                      onCite={(chunkId) => {
                        selectTurn(t.id);
                        setHighlight(chunkId);
                      }}
                    />
                    {t.example && (
                      <div className="mt-1 flex items-center gap-2 text-[0.875rem] font-medium text-[var(--ink-1)]">
                        Now try it yourself <span aria-hidden="true">↓</span>
                      </div>
                    )}
                  </React.Fragment>
                ))}

                {tricks.length > 0 && !busy && (
                  <div data-tour="tricks">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="text-[0.875rem] font-semibold text-[var(--ink)]">Can you trick it?</span>
                      <span className="text-[0.78125rem] text-[var(--muted)]">Real test questions with a known answer: click one to ask it</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {tricks.map((c) => {
                        const trap = TRAP[c.type ?? ''] ?? { badge: 'Trick', teaser: '' };
                        return (
                          <button
                            key={c.test_id}
                            onClick={() => ask(c.question, c)}
                            disabled={missingKeys.length > 0}
                            className="group flex flex-col gap-2 rounded-xl border border-[var(--rule)] bg-[var(--panel)] p-3 text-left transition-colors hover:border-[var(--rule-2)] disabled:opacity-50"
                          >
                            <span
                              className="self-start rounded-full px-2 py-0.5 text-[0.71875rem] font-medium"
                              style={{ background: `${tint(meta.accent, 0.1)}`, color: meta.accent }}
                            >
                              {trap.badge}
                            </span>
                            <span className="line-clamp-3 text-[0.875rem] leading-snug text-[var(--ink)]">{c.question}</span>
                            <span className="text-[0.75rem] leading-snug text-[var(--muted)]">{trap.teaser}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Composer: sticky so it stays in view while the page scrolls on small screens */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-[var(--rule)] bg-[var(--paper)] px-4 py-3 sm:px-6 sm:py-3.5">
          <form
            className="mx-auto flex max-w-[820px] items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <label className="flex h-12 flex-1 items-center gap-2.5 rounded-xl border border-[var(--rule-2)] bg-[var(--panel)] px-3.5 transition-shadow focus-within:border-[var(--rule-3)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]">
              <DataIcon meta={meta} size={22} />
              <span className="sr-only">Message {botLabel}</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!pack || missingKeys.length > 0}
                placeholder={
                  missingKeys.length
                    ? `${botLabel} needs its key first`
                    : usingOwnBot ? `Ask ${botLabel} anything…` : `Ask the ${meta.domain.toLowerCase()} bot anything…`
                }
                className="h-10 flex-1 bg-transparent text-[0.9375rem] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={!draft.trim() || busy || !pack || missingKeys.length > 0}
              aria-label="Send"
              className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--paper)] transition-opacity disabled:opacity-30"
              style={{ background: meta.accent }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </section>

      {/* X-ray */}
      <aside
        data-tour="xray"
        className={cn(
          'min-w-0 flex-[45] flex-col border-l border-[var(--rule)] bg-[var(--paper)]',
          mobilePane === 'xray' ? 'flex' : 'hidden lg:flex'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobilePane('chat')}
              className="mr-1 inline-flex items-center gap-1 rounded-md border border-[var(--rule)] px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--panel-2)] lg:hidden"
            >
              <ArrowLeft className="h-3 w-3" /> Chat
            </button>
            <div>
              <div className="text-[0.875rem] font-semibold text-[var(--ink)]">X-ray of this reply</div>
              <div className="hidden sm:block text-[0.75rem] text-[var(--ink-2)]">What the bot read, three checks, and who is to blame</div>
            </div>
          </div>
          {xrayTurn?.example && (
            <span className="rounded-full border border-[var(--rule-2)] px-2 py-0.5 text-[0.71875rem] text-[var(--review)]">From latest test</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!xrayTurn ? (
            <XrayEmpty />
          ) : xrayTurn.pending ? (
            <XrayPending />
          ) : xrayTurn.error ? (
            <p className="text-[0.875rem] text-[var(--gen-deep)]">{xrayTurn.error}</p>
          ) : xrayTurn.result ? (
            <Xray
              key={`${threadKey}:${xrayTurn.id}`}
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

const DataIcon: React.FC<{ meta: DataMeta; size: number }> = ({ meta, size }) => {
  const Icon = meta.icon;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        color: meta.accent,
        background: `${tint(meta.accent, 0.1)}`,
        boxShadow: `inset 0 0 0 1px ${tint(meta.accent, 0.33)}`,
      }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
};

const SourceChip: React.FC<{ source: Source }> = ({ source }) => (
  <span
    title={SOURCE_CHIP[source].title}
    className={cn(
      'shrink-0 rounded-full border px-2 py-0.5 text-[0.71875rem] font-medium',
      source === 'fictional' ? 'border-[var(--rule-2)] text-[var(--ink-2)]' : 'border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] text-[var(--ok)]'
    )}
  >
    {SOURCE_CHIP[source].label}
  </span>
);

const StepLabel: React.FC<{ n: number; title: string; hint: string }> = ({ n, title, hint }) => (
  <div className="flex items-baseline gap-2.5">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-mono text-[0.71875rem] text-[var(--paper)]">{n}</span>
    <span className="text-[1rem] font-semibold text-[var(--ink)]">{title}</span>
    <span className="text-[0.8125rem] text-[var(--muted)]">{hint}</span>
  </div>
);

/** Step 1 (which bot) and step 2 (which documents it answers from). */
const Setup: React.FC<{
  health: HealthResponse | null;
  profile: RagProfile | null;
  savedBot: SavedBot | null;
  botChoice: BotChoice;
  onBot: (b: BotChoice) => void;
  botKeys: Record<string, string>;
  onKey: (name: string, value: string) => void;
  packs: PackOption[];
  packId: string;
  onPack: (id: PackId) => void;
  onStart: () => void;
}> = ({ health, profile, savedBot, botChoice, onBot, botKeys, onKey, packs, packId, onPack, onStart }) => {
  const gen = health?.models?.generator;
  const where = gen?.provider === 'ollama' ? 'running on this laptop (Ollama)' : gen?.provider ? `hosted on ${gen.provider}` : null;
  const topK = profile?.params?.top_k as number | undefined;
  const allVersions = profile?.params?.newest_versions_only === false;
  const sampleFeatures = [
    gen?.name ? `Model: ${gen.name}${where ? `, ${where}` : ''}` : 'Model: loading…',
    `Reads the top ${topK ?? 4} passages for each question`,
    'Cites the passages it used, like [1]',
    'Says “I don’t know” when the documents don’t have the answer',
    ...(allVersions ? ['Searches old document versions too, so stale answers can happen'] : []),
  ];
  const grouped = PACK_GROUPS.map((g) => ({ group: g, items: packs.filter((p) => p.group === g) })).filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <StepLabel n={1} title="Choose a bot" hint="the chatbot being tested" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ChoiceCard selected={botChoice === 'sample'} onClick={() => onBot('sample')}>
            <div className="flex items-center gap-2.5">
              <Bot className="h-5 w-5 text-[var(--ink-1)]" />
              <span className="text-[0.90625rem] font-semibold text-[var(--ink)]">RAGSeal sample bot</span>
              <span className="ml-auto rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[0.71875rem] text-[var(--ink-2)]">Default</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {sampleFeatures.map((f) => (
                <li key={f} className="flex gap-2 text-[0.84375rem] leading-snug text-[var(--ink-1)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" /> {f}
                </li>
              ))}
            </ul>
          </ChoiceCard>

          {savedBot ? (
            <ChoiceCard selected={botChoice === 'yours'} onClick={() => onBot('yours')}>
              <div className="flex items-center gap-2.5">
                <Plug className="h-5 w-5 text-[var(--ink-1)]" />
                <span className="truncate text-[0.90625rem] font-semibold text-[var(--ink)]">{savedBot.name?.trim() || 'Your bot'}</span>
                <span className="ml-auto rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-[0.71875rem] text-[var(--ink-2)]">Your bot</span>
              </div>
              <ul className="mt-2.5 space-y-1.5 text-[0.84375rem] leading-snug text-[var(--ink-1)]">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" /> Saved on Connect your bot: <span className="font-mono text-[0.78125rem]">{botHost(savedBot.url)}</span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  {savedBot.accepts_contexts
                    ? 'Replay available: it accepts passages, so RAGSeal can prove which half broke'
                    : 'Replay unavailable: it doesn’t accept passages, so causes are a best guess'}
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" /> The questions and known answers come from the data you pick below
                </li>
              </ul>
              {botChoice === 'yours' &&
                savedBot.headers
                  .filter((h) => h.name.trim())
                  .map((h) => (
                    <label key={h.name} className="mt-2.5 flex items-center gap-2 text-[0.8125rem] text-[var(--ink-2)]" onClick={(e) => e.stopPropagation()}>
                      <span className="shrink-0 font-mono">{h.name}</span>
                      <input
                        type="password"
                        value={botKeys[h.name] ?? ''}
                        onChange={(e) => onKey(h.name, e.target.value)}
                        placeholder="value (kept in this tab only)"
                        className="h-8 flex-1 rounded-lg border border-[var(--rule-2)] bg-[var(--paper)] px-2.5 text-[0.84375rem] text-[var(--ink)] focus:outline-none"
                      />
                    </label>
                  ))}
            </ChoiceCard>
          ) : (
            <a
              href="#/connect"
              className="flex flex-col justify-between gap-3 rounded-xl border border-dashed border-[var(--rule-2)] p-4 text-left transition-colors hover:border-[var(--rule-3)]"
            >
              <span className="flex items-center gap-2.5">
                <Plug className="h-5 w-5 text-[var(--ink-2)]" />
                <span className="text-[0.90625rem] font-semibold text-[var(--ink)]">Your own bot</span>
              </span>
              <span className="text-[0.84375rem] leading-snug text-[var(--ink-2)]">
                Point RAGSeal at your chatbot’s URL and chat with it here, with every reply checked the same way.
              </span>
              <span className="flex items-center gap-1 text-[0.84375rem] font-medium text-[var(--ink)]">
                Connect one <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </a>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <StepLabel n={2} title="Choose the data it answers from" hint="the documents, and test questions with known answers" />
        <div className="flex flex-col gap-4">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              <div className="mb-1.5 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">{group}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => {
                  const m = dataMeta(p);
                  const active = p.id === packId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onPack(p.id)}
                      className={cn(
                        'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-[var(--panel)]' : 'border-[var(--rule)] hover:border-[var(--rule-2)]'
                      )}
                      style={active ? { borderColor: `${tint(m.accent, 0.55)}`, boxShadow: `0 0 0 1px ${tint(m.accent, 0.35)}` } : undefined}
                    >
                      <DataIcon meta={m} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.875rem] font-medium text-[var(--ink)]">{dataTitle(m)}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[0.78125rem] leading-snug text-[var(--ink-2)]">{m.about || p.description}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <SourceChip source={m.source} />
                          {p.questions != null && <span className="text-[0.71875rem] text-[var(--muted)]">{p.questions} questions</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={onStart}
        className="flex items-center gap-2 self-start rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[0.90625rem] font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
      >
        Start chatting <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
};

const ChoiceCard: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, onClick, children }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
    className={cn(
      'cursor-pointer rounded-xl border p-4 text-left transition-colors',
      selected ? 'border-[var(--ink)] bg-[var(--panel)] shadow-[0_0_0_1px_var(--ink)]' : 'border-[var(--rule)] hover:border-[var(--rule-2)]'
    )}
  >
    {children}
  </div>
);

/** What the bot is answering from: one sentence, where the data comes from, and the documents themselves. */
const DataHeader: React.FC<{
  meta: DataMeta;
  option: PackOption;
  pack: LabPack | null;
  docsOpen: boolean;
  onToggleDocs: () => void;
}> = ({ meta, option, pack, docsOpen, onToggleDocs }) => {
  const superseded = new Set(pack?.superseded_document_ids ?? []);
  const distractors = new Set(pack?.distractor_document_ids ?? []);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3.5">
        <DataIcon meta={meta} size={44} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--ink)]">{dataTitle(meta)}</span>
            <SourceChip source={meta.source} />
          </div>
          <div className="mt-0.5 text-[0.875rem] leading-snug text-[var(--ink-1)]">
            {meta.about}{' '}
            {pack ? (
              <>
                It answers only from{' '}
                <button onClick={onToggleDocs} className="inline-flex items-center gap-0.5 font-medium text-[var(--ink)] underline decoration-[var(--rule-3)] underline-offset-2 hover:decoration-[var(--ink)]">
                  {pack.documents.length} documents
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', docsOpen && 'rotate-180')} />
                </button>
                .
              </>
            ) : (
              <span className="text-[var(--muted)]">Loading its documents…</span>
            )}
          </div>
        </div>
      </div>
      {docsOpen && pack && (
        <ul className="xray-in ml-[58px] flex flex-col gap-1 rounded-xl border border-[var(--rule)] bg-[var(--panel)] px-3.5 py-2.5" title={option.description}>
          {pack.documents.map((d) => {
            const tag = superseded.has(d.document_id) ? 'older version' : distractors.has(d.document_id) ? 'look-alike' : null;
            return (
              <li key={d.document_id} className="flex items-center gap-2 text-[0.84375rem] text-[var(--ink-1)]">
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                <span className="truncate font-mono text-[0.78125rem]">{d.filename}</span>
                {tag && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.71875rem]"
                    style={tag === 'older version' ? { background: `${tint(AMBER, 0.13)}`, color: AMBER } : { background: 'var(--panel-2)', color: 'var(--ink-2)' }}
                  >
                    {tag}
                  </span>
                )}
              </li>
            );
          })}
          {option.description && <li className="mt-1 text-[0.78125rem] leading-snug text-[var(--muted)]">{option.description}</li>}
        </ul>
      )}
    </div>
  );
};

/** The chunk a citation number points to: [n] is the n-th retrieved passage. */
function citedChunks(r: LabResult): { n: number; chunk: LabChunk }[] {
  const chunks = r.retrieved_chunks ?? [];
  const cited = new Set(r.citations ?? []);
  return chunks.map((chunk, i) => ({ n: i + 1, chunk })).filter((c) => cited.has(c.chunk.chunk_id));
}

const TurnView: React.FC<{
  turn: Turn;
  meta: DataMeta;
  ownBot: boolean;
  selected: boolean;
  filenames: Record<string, string>;
  onSelect: () => void;
  onWhy: () => void;
  onCite: (chunkId: string) => void;
}> = ({ turn, meta, ownBot, selected, filenames, onSelect, onWhy, onCite }) => {
  const r = turn.result;
  const v = r ? verdictStyle(r.root_cause?.category ?? r.category) : null;
  const passed = (r?.root_cause?.category ?? r?.category) === 'CLEAN_PASS';
  const reason = r?.root_cause?.summary ?? v?.blame;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[var(--panel-2)] px-4 py-2.5 text-[0.9375rem] leading-relaxed text-[var(--ink)]">
          {turn.question}
        </div>
      </div>
      <div className="flex items-end gap-2.5">
        {ownBot ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--rule-2)] text-[var(--ink-2)]">
            <Plug className="h-3.5 w-3.5" />
          </span>
        ) : (
          <DataIcon meta={meta} size={28} />
        )}
        {turn.pending ? (
          <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[var(--rule)] bg-[var(--panel)] px-4 py-3.5" aria-label="Typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--review)]" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </div>
        ) : turn.error ? (
          <div className="rounded-2xl rounded-bl-md border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--gen)_10%,transparent)] px-4 py-2.5 text-[0.875rem] text-[var(--gen-deep)]">
            Couldn’t answer: {turn.error}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => e.key === 'Enter' && onSelect()}
            className={cn(
              'max-w-[86%] cursor-pointer rounded-2xl rounded-bl-md border px-4 py-3 text-left transition-colors',
              selected ? 'bg-[var(--panel)]' : 'border-[var(--rule)] bg-[var(--panel)] hover:border-[var(--rule-2)]'
            )}
            style={selected && v ? { borderColor: `${tint(v.color, 0.4)}` } : undefined}
          >
            <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-[var(--ink)]">
              <AnswerWithCitations text={r?.generated_answer ?? ''} chunks={r?.retrieved_chunks ?? []} filenames={filenames} onCite={onCite} />
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
                    className="rounded-md border border-[var(--rule-2)] px-1.5 py-0.5 text-[0.75rem] text-[var(--review)] hover:border-[var(--rule-3)] hover:text-[var(--ink)]"
                  >
                    [{n}] {chunk.filename ?? filenames[chunk.document_id ?? ''] ?? 'document'}
                  </span>
                ))}
                {v && (
                  <span className="ml-auto flex items-center gap-1.5 text-[0.75rem] font-medium" style={{ color: v.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                    {v.label}
                  </span>
                )}
              </span>
            )}
            {r && v && !passed && reason && (
              <span className="mt-2 flex items-start gap-2 border-t border-[var(--rule)] pt-2 text-[0.8125rem] leading-snug text-[var(--ink-1)]">
                <span className="line-clamp-2 flex-1">{reason}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onWhy();
                  }}
                  className="flex shrink-0 items-center gap-1 font-medium text-[var(--ink)] hover:underline"
                >
                  See why <ArrowRight className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
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
  const [showAll, setShowAll] = React.useState(false);
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
  const relevant = chunks.filter((x) => x.color || x.used || x.c.is_relevant !== false);
  const hidden = chunks.length - relevant.length;
  const shown = showAll ? chunks : relevant;
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
              className={cn('xray-in rounded-xl border px-3 py-2.5 transition-shadow', highlight === c.chunk_id && 'ring-2 ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]')}
              style={{
                animationDelay: `${i * 110}ms`,
                borderColor: color ? `${tint(color, 0.4)}` : 'var(--rule)',
                background: color ? `${tint(color, 0.06)}` : 'var(--panel)',
              }}
            >
              <div className="flex items-center gap-2 text-[0.75rem]">
                <span className="font-mono text-[var(--muted)]">[{n}]</span>
                <span className="truncate text-[var(--ink-1)]">{c.filename ?? filenames[c.document_id ?? ''] ?? 'document'}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {used && <span className="text-[var(--review)]">bot used it</span>}
                  <span className="rounded-full px-1.5 py-0.5" style={color ? { background: `${tint(color, 0.13)}`, color } : { color: 'var(--ink-2)' }}>
                    {tag}
                  </span>
                </span>
              </div>
              <p className="mt-1.5 line-clamp-3 text-[0.84375rem] leading-relaxed text-[var(--ink-1)]">
                {c.text.replace(/^#+\s.*\n+/, '').replace(/\s*\n+\s*/g, ' ')}
              </p>
            </div>
          ))}
          {hidden > 0 && (
            <button onClick={() => setShowAll((x) => !x)} className="text-[0.75rem] text-[var(--ink-2)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:underline">
              {showAll ? 'Hide' : 'Show'} {hidden} unrelated passage{hidden === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </section>

      <section>
        <SectionLabel n={2}>Three checks</SectionLabel>
        <ul className="mt-2 divide-y divide-[var(--rule)] rounded-xl border border-[var(--rule)] bg-[var(--panel)]">
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
                  style={{ background: ok == null ? 'var(--panel-2)' : ok ? `${tint(PASS, 0.13)}` : `${tint(RED, 0.13)}` }}
                >
                  {ok == null ? (
                    <Minus className="h-3.5 w-3.5 text-[var(--muted)]" />
                  ) : ok ? (
                    <Check className="h-3.5 w-3.5" style={{ color: PASS }} />
                  ) : (
                    <X className="h-3.5 w-3.5" style={{ color: RED }} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.875rem] text-[var(--ink)]">{label}</span>
                  <span className="block text-[0.71875rem] text-[var(--muted)]">{ok == null ? 'no known answer to compare' : tech}</span>
                </span>
                <span className="text-[1rem] font-semibold tabular-nums" style={{ color: ok == null ? 'var(--muted)' : ok ? PASS : RED }}>
                  {pct(score)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section data-tour="verdict" className="stamp-land" style={{ animationDelay: `${base + 900}ms` }}>
        <SectionLabel n={3}>Verdict</SectionLabel>
        <div className="mt-2 rounded-xl border px-4 py-3" style={{ borderColor: `${tint(v.color, 0.33)}`, background: 'var(--panel)' }}>
          <div className="stamp my-1 text-[1.125rem] leading-none" style={{ color: v.color }}>
            {v.label}
          </div>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[var(--ink-1)]">{r.root_cause?.summary ?? v.blame}</p>
        </div>
      </section>

      {replay && (
        <section className="xray-in" style={{ animationDelay: `${base + 1300}ms` }}>
          <SectionLabel n={4}>Replay: the proof</SectionLabel>
          <div className="mt-2 rounded-xl border border-[var(--rule-2)] bg-[var(--panel)] px-4 py-3">
            <div className="flex items-center gap-2 text-[0.8125rem] text-[var(--review)]">
              With only the right text
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium" style={{ color: fixed ? PASS : RED }}>
                {fixed ? 'fixed' : 'still wrong'} ({pct(replay.answer_accuracy)})
              </span>
            </div>
            <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--ink)]">
              {(replay.answer ?? '').replace(/\s*\[\d+(?:[-,]\s*\d+)*\]/g, '')}
            </p>
            <p className="mt-1.5 text-[0.78125rem] text-[var(--ink-2)]">
              {replayBlameText(replay.blames, fixed)}
            </p>
          </div>
        </section>
      )}

      <button onClick={onOpen} className="flex items-center gap-1.5 self-start text-[0.875rem] font-medium text-[var(--ink)] hover:underline">
        Open full diagnosis <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const SectionLabel: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div className="flex items-center gap-2 text-[0.84375rem] font-medium text-[var(--ink-1)]">
    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--rule-2)] font-mono text-[0.6875rem] text-[var(--ink-1)]">{n}</span>
    {children}
  </div>
);

const XrayPending: React.FC = () => (
  <div className="flex flex-col gap-3">
    {['Finding the text to read…', 'Writing the answer…', 'Checking it three ways…'].map((s, i) => (
      <div key={s} className="xray-in flex items-center gap-2.5 text-[0.875rem] text-[var(--ink-2)]" style={{ animationDelay: `${i * 600}ms` }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {s}
      </div>
    ))}
  </div>
);

const XrayEmpty: React.FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
    <div className="text-[0.875rem] text-[var(--ink-1)]">Ask the bot something</div>
    <p className="max-w-[300px] text-xs leading-relaxed text-[var(--muted)]">
      Each reply is X-rayed here: the text it read, whether it found and stuck to the right text, and whether the answer is correct.
    </p>
  </div>
);

/**
 * The reply with its [n] citation markers kept as small chips; hovering one shows the passage it
 * points to (the n-th retrieved passage), clicking highlights it in the X-ray. A citation-only
 * reply is shown as-is with a note.
 */
const AnswerWithCitations: React.FC<{
  text: string;
  chunks: LabChunk[];
  filenames: Record<string, string>;
  onCite: (chunkId: string) => void;
}> = ({ text, chunks, filenames, onCite }) => {
  const prose = text.replace(/\s*\[\d+(?:[-,]\s*\d+)*\]/g, '').trim();
  if (!text.trim()) return <span className="text-[var(--ink-2)]">No answer.</span>;
  if (!prose)
    return (
      <>
        <span className="font-mono">{text.trim()}</span>
        <span className="ml-2 text-xs text-[var(--ink-2)]">citation-only reply: the bot gave no answer text</span>
      </>
    );
  const parts = text.split(/(\[\d+(?:[-,]\s*\d+)*\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^\[\d/.test(p)) return <React.Fragment key={i}>{p}</React.Fragment>;
        const chunk = chunks[Number(p.slice(1).split(/[-,]/)[0]) - 1];
        return (
          <span key={i} className="group/cite relative mx-0.5 inline-block">
            <span
              role={chunk ? 'button' : undefined}
              tabIndex={chunk ? 0 : undefined}
              onClick={(e) => {
                if (!chunk) return;
                e.stopPropagation();
                onCite(chunk.chunk_id);
              }}
              className={cn(
                'inline-flex -translate-y-px items-center rounded border border-[var(--rule)] bg-[var(--panel-2)] px-1 font-mono text-[0.71875rem] leading-[16px] text-[var(--ink-1)]',
                chunk && 'cursor-pointer hover:border-[var(--rule-3)] hover:text-[var(--ink)]'
              )}
            >
              {p.slice(1, -1)}
            </span>
            {chunk && (
              <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-[300px] -translate-x-1/2 rounded-xl border border-[var(--rule-2)] bg-[var(--paper)] p-3 text-left opacity-0 shadow-lg transition-opacity group-hover/cite:visible group-hover/cite:opacity-100 group-focus-within/cite:visible group-focus-within/cite:opacity-100">
                <span className="block truncate font-mono text-[0.71875rem] text-[var(--muted)]">
                  {chunk.filename ?? filenames[chunk.document_id ?? ''] ?? 'document'}
                </span>
                <span className="mt-1 line-clamp-5 block whitespace-normal font-sans text-[0.8125rem] leading-relaxed text-[var(--ink-1)]">
                  {chunk.text.replace(/^#+\s.*\n+/, '').replace(/\s*\n+\s*/g, ' ')}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </>
  );
};

/** Who the replay blames comes from the verdict (replay.blames), so the proof never contradicts it. */
function replayBlameText(blames: string | undefined, fixed: boolean): string {
  if (blames === 'retriever') return 'So the retriever caused it: the bot was fine once it had the right text.';
  if (blames === 'both') return 'Both halves contributed: the retriever handed over misleading text and the bot did not stick to the right passage.';
  if (blames === 'generator')
    return fixed
      ? 'The retriever found the right text. With only that passage the bot answered correctly, so the other retrieved chunks distracted it: the bot is at fault.'
      : 'So the bot is at fault: even the right text didn’t help.';
  return fixed ? 'So the retriever caused it: the bot was fine once it had the right text.' : 'So the bot is at fault: even the right text didn’t help.';
}
