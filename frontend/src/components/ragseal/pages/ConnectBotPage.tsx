import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, Play, Plus, Plug, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { loadPackBackend } from '../../../lib/api';
import { PackId } from '../../../types/ragseal';
import { usePacks } from '../shared/packs';
import { LabTestCase } from '../lab/useLabData';
import { AMBER, PASS, RED, pct, tint, VERDICT_ORDER, VERDICTS } from '../lab/verdict';
import {
  BotConfig,
  BotTestResult,
  builtinBotUrl,
  errorText,
  getProgress,
  getRun,
  RunProgress,
  RunSummary,
  startRun,
  testBot,
} from '../shared/apiExtra';
import { ErrorBanner, fmtDuration, GhostButton, PACK_LABEL, PackSwitcher, Panel, PrimaryButton } from '../shared/ui';

/**
 * Connect your own bot (R2): point RAGSeal at any RAG endpoint that takes {question} and
 * returns {answer, contexts}. Test the connection, then run a pack's questions through it;
 * the results open in Diagnose like any other run.
 */

const STORE_KEY = 'ragseal.bot';
const RUNS_KEY = 'ragseal.botRuns';
const QUICK_SIZE = 5;
const POLL_MS = 1500;

interface HeaderRow {
  name: string;
  value: string;
}

interface BotForm {
  name: string;
  url: string;
  headers: HeaderRow[];
  accepts_contexts: boolean;
  question_field: string;
  contexts_field: string;
  answer_path: string;
  contexts_path: string;
  timeout_s: number;
}

interface BotRun {
  batch_id: string;
  pack_id: string;
  bot: string;
  size: number;
  created_at: string;
}

const EMPTY: BotForm = {
  name: '',
  url: '',
  headers: [],
  accepts_contexts: false,
  question_field: 'question',
  contexts_field: 'contexts',
  answer_path: 'answer',
  contexts_path: 'contexts',
  timeout_s: 30,
};

// Header values (API keys) are never written to the browser's storage; names are, so the form comes back shaped.
function loadForm(): BotForm {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved) return { ...EMPTY, ...saved, headers: (saved.headers ?? []).map((h: HeaderRow) => ({ name: h.name, value: '' })) };
  } catch {
    // storage unavailable or corrupt: start blank
  }
  return EMPTY;
}

function saveForm(form: BotForm) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...form, headers: form.headers.map((h) => ({ name: h.name, value: '' })) }));
  } catch {
    // storage unavailable: the form just resets on refresh
  }
}

function loadRuns(): BotRun[] {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function toConfig(form: BotForm): BotConfig {
  return {
    url: form.url.trim(),
    headers: Object.fromEntries(form.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value])),
    accepts_contexts: form.accepts_contexts,
    question_field: form.question_field || 'question',
    contexts_field: form.contexts_field || 'contexts',
    answer_path: form.answer_path || 'answer',
    contexts_path: form.contexts_path || 'contexts',
    timeout_s: form.timeout_s || 30,
    ...(form.name.trim() ? { name: form.name.trim() } : {}),
  };
}

/** A quick run takes one question of each trap type in turn, so five questions still cover stale, look-alike and unanswerable. */
function quickPick(cases: LabTestCase[], n: number): string[] {
  const byType = new Map<string, LabTestCase[]>();
  cases.forEach((c) => byType.set(c.type ?? 'factoid', [...(byType.get(c.type ?? 'factoid') ?? []), c]));
  const queues = [...byType.values()];
  const out: string[] = [];
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      const c = q.shift();
      if (c && out.length < n) out.push(c.test_id);
    }
  }
  return out;
}

interface ConnectBotPageProps {
  token: string | null;
  initialPack: PackId;
  onOpenRun: (batchId: string, packId?: string) => void;
}

export const ConnectBotPage: React.FC<ConnectBotPageProps> = ({ token, initialPack, onOpenRun }) => {
  usePacks(); // re-render with the backend's pack names once they load
  const [form, setForm] = useState<BotForm>(loadForm);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<BotTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packId, setPackId] = useState<PackId>(initialPack);
  const [quick, setQuick] = useState(true);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [runs, setRuns] = useState<BotRun[]>(loadRuns);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => saveForm(form), [form]);

  const set = <K extends keyof BotForm>(key: K, value: BotForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTest(null);
  };

  const useSample = () => {
    if (!token) return;
    setForm({
      ...EMPTY,
      name: 'RAGSeal sample bot',
      url: builtinBotUrl(packId),
      headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
      accepts_contexts: true,
    });
    setTest(null);
    setError(null);
  };

  // The sample bot answers from one pack's documents, so it follows the pack being tested.
  const choosePack = (p: PackId) => {
    setPackId(p);
    if (form.url.includes('/bots/builtin?pack_id=')) setForm((f) => ({ ...f, url: builtinBotUrl(p) }));
  };

  const runTest = async () => {
    if (!token || !form.url.trim()) return;
    setTesting(true);
    setError(null);
    setTest(null);
    try {
      const res = await testBot(toConfig(form), token);
      if (alive.current) setTest(res);
    } catch (err) {
      if (alive.current) setError(errorText(err));
    } finally {
      if (alive.current) setTesting(false);
    }
  };

  const runPack = async () => {
    if (!token || !form.url.trim()) return;
    setStarting(true);
    setError(null);
    setSummary(null);
    try {
      const pack = await loadPackBackend(packId, token);
      const testIds = quick ? quickPick(pack.test_cases ?? [], QUICK_SIZE) : undefined;
      const res = await startRun(packId, token, { bot: toConfig(form), testIds });
      const total = res.total ?? testIds?.length ?? pack.test_cases?.length ?? 0;
      const entry: BotRun = {
        batch_id: res.batch_id,
        pack_id: packId,
        bot: form.name.trim() || hostOf(form.url),
        size: total,
        created_at: new Date().toISOString(),
      };
      const next = [entry, ...runs].slice(0, 10);
      setRuns(next);
      try {
        localStorage.setItem(RUNS_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: the list just doesn't survive a refresh
      }
      if (res.status === 'running') {
        setProgress({ batch_id: res.batch_id, status: 'running', done: 0, total });
        poll(res.batch_id);
      } else if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  };

  const poll = (batchId: string) => {
    if (!token) return;
    const tick = async () => {
      if (!alive.current) return;
      try {
        const p = await getProgress(batchId, token);
        if (!alive.current) return;
        setProgress(p);
        if (p.status === 'running') {
          setTimeout(tick, POLL_MS);
          return;
        }
        if (p.status === 'failed') setError(p.error ?? 'The run failed.');
        else setSummary((await getRun(batchId, token)) as RunSummary);
        setProgress(null);
      } catch (err) {
        if (alive.current) {
          setError(errorText(err));
          setProgress(null);
        }
      }
    };
    tick();
  };

  const canRun = !!token && !!form.url.trim() && !progress && !starting;

  return (
    <div className="mx-auto flex max-w-[77.5rem] 2xl:max-w-[88rem] flex-col gap-5 px-6 py-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          raised
          title="Your bot"
          note={
            <button onClick={useSample} disabled={!token} className="text-xs text-[var(--accent)] hover:opacity-75 disabled:opacity-50">
              Use our sample bot
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Name" hint="Shown on the results.">
              <input className={INPUT} value={form.name} placeholder="Campus help bot" onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Endpoint URL" hint="RAGSeal sends a POST with the question and reads the answer and the passages it used.">
              <input
                className={cn(INPUT, 'font-mono text-[0.84375rem]')}
                value={form.url}
                placeholder="https://your-bot.example.com/ask"
                spellCheck={false}
                onChange={(e) => set('url', e.target.value)}
              />
            </Field>

            <Field label="Headers" hint="For an API key. Values are sent to your bot only; RAGSeal never stores them.">
              <div className="flex flex-col gap-2">
                {form.headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={cn(INPUT, 'w-[40%] font-mono text-[0.84375rem]')}
                      value={h.name}
                      placeholder="Authorization"
                      aria-label="Header name"
                      onChange={(e) => set('headers', form.headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      className={cn(INPUT, 'min-w-0 flex-1 font-mono text-[0.84375rem]')}
                      type="password"
                      value={h.value}
                      placeholder="value"
                      aria-label="Header value"
                      autoComplete="off"
                      onChange={(e) => set('headers', form.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <button
                      aria-label="Remove header"
                      onClick={() => set('headers', form.headers.filter((_, j) => j !== i))}
                      className="rounded-md p-1.5 text-[var(--ink-2)] hover:text-[var(--ink)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {form.headers.length < 5 && (
                  <button
                    onClick={() => set('headers', [...form.headers, { name: '', value: '' }])}
                    className="flex items-center gap-1.5 self-start text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add header
                  </button>
                )}
              </div>
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--rule)] px-3.5 py-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--ink)]"
                checked={form.accepts_contexts}
                onChange={(e) => set('accepts_contexts', e.target.checked)}
              />
              <span className="text-[0.875rem] leading-relaxed">
                <span className="font-medium text-[var(--ink)]">Accepts contexts (enables replay)</span>
                <span className="block text-xs text-[var(--ink-2)]">
                  If your bot answers from passages sent in <span className="font-mono">{form.contexts_field || 'contexts'}</span>, RAGSeal
                  replays wrong answers with the correct text to prove which half broke. Without it, causes are a best guess.
                </span>
              </span>
            </label>

            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
                <span className="group-open:hidden">Advanced: field names and timeout</span>
                <span className="hidden group-open:inline">Hide advanced</span>
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Question field">
                  <input className={cn(INPUT, 'font-mono text-[0.84375rem]')} value={form.question_field} onChange={(e) => set('question_field', e.target.value)} />
                </Field>
                <Field label="Contexts field">
                  <input className={cn(INPUT, 'font-mono text-[0.84375rem]')} value={form.contexts_field} onChange={(e) => set('contexts_field', e.target.value)} />
                </Field>
                <Field label="Answer path" hint="e.g. data.reply">
                  <input className={cn(INPUT, 'font-mono text-[0.84375rem]')} value={form.answer_path} onChange={(e) => set('answer_path', e.target.value)} />
                </Field>
                <Field label="Passages path" hint="e.g. sources[*].text">
                  <input className={cn(INPUT, 'font-mono text-[0.84375rem]')} value={form.contexts_path} onChange={(e) => set('contexts_path', e.target.value)} />
                </Field>
                <Field label="Timeout (seconds)">
                  <input
                    className={INPUT}
                    type="number"
                    min={1}
                    max={120}
                    value={form.timeout_s}
                    onChange={(e) => set('timeout_s', Number(e.target.value))}
                  />
                </Field>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--panel)] px-3.5 py-3 font-mono text-[0.78125rem] leading-relaxed text-[var(--ink-1)]">
{`POST ${form.url.trim() || '<your url>'}
{ "${form.question_field || 'question'}": "…"${form.accepts_contexts ? `, "${form.contexts_field || 'contexts'}": ["…"]` : ''} }

→ { "${form.answer_path || 'answer'}": "…", "${form.contexts_path || 'contexts'}": ["passage", …] }`}
              </pre>
            </details>

            <PrimaryButton onClick={runTest} busy={testing} disabled={!token || !form.url.trim()} className="self-start">
              {!testing && <Plug className="h-3.5 w-3.5" />}
              Test connection
            </PrimaryButton>
          </div>
        </Panel>

        <Panel raised title="Connection" note={test?.latency_ms != null ? `${Math.round(test.latency_ms)} ms` : undefined}>
          {testing ? (
            <div className="flex h-full min-h-[200px] items-center justify-center gap-2 text-sm text-[var(--ink-2)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Asking your bot a sample question…
            </div>
          ) : test ? (
            <TestReport test={test} />
          ) : (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
              <Plug className="h-5 w-5 text-[var(--muted)]" />
              <div className="text-sm font-medium text-[var(--ink-1)]">Not tested yet</div>
              <p className="max-w-sm text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
                Fill in your bot&rsquo;s URL and press Test connection. No bot handy? Use our sample bot to see how it works.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Panel raised title="Run a test pack against this bot" note="the same questions, traps and replay as our own bot">
        <div className="flex flex-wrap items-center gap-3">
          <PackSwitcher value={packId} onChange={choosePack} />
          <div className="flex items-center gap-0.5 rounded-[10px] border border-[var(--panel-2)] p-[3px] text-[0.875rem]">
            {[true, false].map((q) => (
              <button
                key={String(q)}
                onClick={() => setQuick(q)}
                aria-pressed={quick === q}
                className={cn(
                  'whitespace-nowrap rounded-[7px] px-3 py-[5px] transition-colors',
                  quick === q ? 'bg-[var(--panel-2)] text-[var(--ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                )}
              >
                {q ? `Quick check (${QUICK_SIZE})` : 'Full pack'}
              </button>
            ))}
          </div>
          <PrimaryButton onClick={runPack} busy={starting} disabled={!canRun} className="ml-auto">
            {!starting && <Play className="h-3 w-3 fill-current" />}
            Run {PACK_LABEL[packId] ?? packId} questions
          </PrimaryButton>
        </div>
        {!test?.ok && form.url.trim() && !progress && !summary && (
          <p className="mt-3 text-xs text-[var(--ink-2)]">Tip: test the connection first, so a typo in the URL doesn&rsquo;t cost a whole run.</p>
        )}

        {progress && <RunProgressBar progress={progress} />}
        {summary && <RunResult summary={summary} onOpen={() => onOpenRun(summary.batch_id, summary.pack_id)} />}

        {runs.length > 0 && (
          <div className="mt-5 border-t border-[var(--rule)] pt-4">
            <div className="mb-2 text-xs text-[var(--ink-2)]">Your bot runs on this device</div>
            <ul className="divide-y divide-[var(--panel)]">
              {runs.map((r) => (
                <li key={r.batch_id}>
                  <button
                    onClick={() => onOpenRun(r.batch_id, r.pack_id)}
                    className="flex w-full items-center gap-3 py-2 text-left text-[0.875rem] hover:text-[var(--ink)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{r.bot}</span>
                    <span className="text-[var(--ink-2)]">
                      {PACK_LABEL[r.pack_id] ?? r.pack_id} · {r.size} questions
                    </span>
                    <span className="font-mono text-xs text-[var(--ink-2)]">{r.batch_id}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
};

const INPUT =
  'h-10 w-full rounded-[10px] border border-[var(--rule-2)] bg-[var(--paper)] px-3 text-[0.90625rem] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--rule-3)]';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-[var(--ink-1)]">{label}</span>
    {children}
    {hint && <span className="text-[0.78125rem] leading-snug text-[var(--ink-2)]">{hint}</span>}
  </div>
);

/** The test round trip in plain words: did it answer, what passages came back, can replay run. */
const TestReport: React.FC<{ test: BotTestResult }> = ({ test }) => {
  const replay = test.replay === 'available';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.875rem]">
        <span className="flex items-center gap-2 font-medium" style={{ color: test.ok ? PASS : RED }}>
          {test.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {test.ok ? 'Connected' : 'Couldn’t reach your bot'}
        </span>
        {test.status_code != null && <span className="text-[var(--ink-2)]">HTTP {test.status_code}</span>}
        {test.n_contexts != null && (
          <span className="text-[var(--ink-2)]">
            {test.n_contexts} passage{test.n_contexts === 1 ? '' : 's'} returned
          </span>
        )}
        {test.ok && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: tint(replay ? PASS : AMBER, 0.14), color: replay ? PASS : AMBER }}
          >
            Replay {replay ? 'available' : 'unavailable'}
          </span>
        )}
      </div>

      {test.question && test.ok && (
        <div>
          <div className="text-xs text-[var(--ink-2)]">Asked: {test.question}</div>
          <p className="mt-1.5 whitespace-pre-wrap text-[1rem] leading-normal text-[var(--ink)]">{test.answer || 'Empty answer.'}</p>
        </div>
      )}

      {!!test.contexts?.length && (
        <div className="flex flex-col gap-2">
          {test.contexts.map((c, i) => (
            <div key={i} className="rounded-xl border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 text-xs leading-relaxed text-[var(--ink-1)]">
              {c}
              {c.length >= 300 && '…'}
            </div>
          ))}
        </div>
      )}

      {test.ok && !replay && (
        <p className="text-xs leading-relaxed text-[var(--ink-2)]">
          {test.contexts_override?.claimed
            ? 'Your bot was sent a made-up passage but didn’t answer from it, so replay would not be trustworthy.'
            : 'Turn on “accepts contexts” if your bot can answer from passages we send; replay then proves the cause of each failure.'}
        </p>
      )}

      {test.errors.length > 0 && (
        <ul className="space-y-1 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed" style={{ background: tint(test.ok ? AMBER : RED, 0.08), color: test.ok ? AMBER : RED }}>
          {test.errors.map((e) => (
            <li key={e}>{plain(e)}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Backend messages are written for developers; the first letter capitalised and a full stop read better here. */
function plain(message: string): string {
  const m = message.trim();
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.');
}

const RunProgressBar: React.FC<{ progress: RunProgress }> = ({ progress }) => {
  const done = progress.done ?? 0;
  const total = progress.total ?? 0;
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between text-[0.875rem]">
        <span className="text-[var(--ink)]">
          <span className="font-semibold tabular-nums">{done}</span>
          <span className="text-[var(--ink-2)]"> / {total || '—'} questions scored</span>
        </span>
        <span className="text-xs text-[var(--ink-2)]">
          {progress.eta_ms == null ? 'estimating…' : `${fmtDuration(progress.eta_ms)} left`}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--panel-3)]">
        <div
          className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-700 ease-out"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
};

const RunResult: React.FC<{ summary: RunSummary; onOpen: () => void }> = ({ summary, onOpen }) => {
  const breakdown = summary.root_cause_breakdown ?? {};
  const shown = VERDICT_ORDER.filter((k) => breakdown[k]);
  const n = shown.reduce((a, k) => a + breakdown[k], 0);
  return (
    <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
      <div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-[2.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--ink)]">
            {pct(summary.aggregates?.pass_rate)}
          </span>
          <span className="text-[0.875rem] text-[var(--ink-2)]">answered accurately · {summary.total_evaluated ?? n} questions</span>
        </div>
        {n > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs">
            {shown.map((k) => (
              <span key={k} style={{ color: VERDICTS[k].color }}>
                {breakdown[k]} {VERDICTS[k].short.toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </div>
      <GhostButton onClick={onOpen}>
        Open in Diagnose <ArrowRight className="h-3.5 w-3.5" />
      </GhostButton>
    </div>
  );
};
