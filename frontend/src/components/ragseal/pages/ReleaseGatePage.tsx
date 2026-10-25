import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, KeyRound, Play, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PASS, RED, tint, verdictStyle } from '../lab/verdict';
import {
  ApiToken,
  BotConfig,
  builtinBotUrl,
  createApiToken,
  errorText,
  GateCase,
  GateResult,
  getGate,
  listApiTokens,
  listPacks,
  listRuns,
  PackInfo,
  revokeApiToken,
  RunListItem,
  startGate,
} from '../shared/apiExtra';
import { ALL_PACKS, ErrorBanner, fmtDuration, fmtTime, GhostButton, Panel, PrimaryButton } from '../shared/ui';

/**
 * Release gate (R2): say pass or fail for a bot release. A finished run is checked at once; a new
 * test runs the pack first. Fails when the pass rate is under the bar or questions that passed in the
 * baseline (the previous run of the pack) now fail. Also where CI tokens are made.
 */

const POLL_MS = 1500;
const DEMO_EMAIL = 'demo@ragseal.dev';
const BOT_KEY = 'ragseal.bot'; // the Connect-your-bot page's saved settings (header values never stored)

type Mode = 'existing' | 'new';
type BotChoice = 'builtin' | 'saved';

interface SavedBot {
  name?: string;
  url?: string;
  headers?: { name: string; value: string }[];
  accepts_contexts?: boolean;
  question_field?: string;
  contexts_field?: string;
  answer_path?: string;
  contexts_path?: string;
  timeout_s?: number;
}

function loadSavedBot(): SavedBot | null {
  try {
    const saved = JSON.parse(localStorage.getItem(BOT_KEY) ?? 'null');
    return saved?.url ? saved : null;
  } catch {
    return null;
  }
}

function hostOf(url?: string): string {
  try {
    return new URL(url ?? '').host;
  } catch {
    return url ?? '';
  }
}

function botConfig(choice: BotChoice, packId: string, saved: SavedBot | null): BotConfig | undefined {
  if (choice === 'builtin') return { url: builtinBotUrl(packId), headers: {}, accepts_contexts: true, name: 'RAGSeal sample bot' };
  if (!saved?.url) return undefined;
  return {
    url: saved.url,
    // Values aren't kept in the browser, so a bot that needs a key is gated from CI, where secrets live.
    headers: Object.fromEntries((saved.headers ?? []).filter((h) => h.name?.trim()).map((h) => [h.name.trim(), h.value ?? ''])),
    accepts_contexts: !!saved.accepts_contexts,
    question_field: saved.question_field || 'question',
    contexts_field: saved.contexts_field || 'contexts',
    answer_path: saved.answer_path || 'answer',
    contexts_path: saved.contexts_path || 'contexts',
    timeout_s: saved.timeout_s || 30,
    ...(saved.name?.trim() ? { name: saved.name.trim() } : {}),
  };
}

const pct1 = (v?: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

function runLabel(r: RunListItem): string {
  const parts = [fmtTime(r.created_at), pct1(r.pass_rate)];
  if (r.profile && r.profile !== 'v1') parts.push(`${r.profile} setup`);
  if (r.answer_source && r.answer_source !== 'builtin') parts.push('your bot');
  if (r.total_evaluated) parts.push(`${r.total_evaluated} questions`);
  return parts.join(' · ');
}

const SNIPPET = `# .github/workflows/ragseal-gate.yml in your bot's repository.
# Secrets: RAGSEAL_URL (https://ragseal.vercel.app), RAGSEAL_TOKEN (an API token below).
name: RAGSeal release gate
on:
  push:
    branches: [main]
jobs:
  gate:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Bot config
        run: |
          cat > bot.json <<EOF
          {"url": "https://your-bot.example.com/ask", "headers": {"Authorization": "Bearer \${{ secrets.BOT_TOKEN }}"},
           "answer_path": "answer", "contexts_path": "contexts", "accepts_contexts": true}
          EOF
      - name: RAGSeal gate
        env:
          RAGSEAL_URL: \${{ secrets.RAGSEAL_URL }}
          RAGSEAL_TOKEN: \${{ secrets.RAGSEAL_TOKEN }}
        run: |
          curl -fsSL -o ragseal_gate.py https://raw.githubusercontent.com/Vidhaath622/MUJ/main/backend/scripts/ragseal_gate.py
          python ragseal_gate.py --pack banking --min-pass-rate 0.8 --max-new-failures 0 --bot-config bot.json`;

const cliCommand = (packId: string, minPass: number, maxNew: number) =>
  `RAGSEAL_URL=https://ragseal.vercel.app RAGSEAL_TOKEN=rsk_... \\
  python ragseal_gate.py --pack ${packId} --min-pass-rate ${minPass} --max-new-failures ${maxNew}`;

interface ReleaseGatePageProps {
  token: string | null;
  userEmail?: string | null;
  onOpenRun: (batchId: string, packId?: string) => void;
}

export const ReleaseGatePage: React.FC<ReleaseGatePageProps> = ({ token, userEmail, onOpenRun }) => {
  const [mode, setMode] = useState<Mode>('existing');
  const [packId, setPackId] = useState('banking');
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [batchId, setBatchId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [minPass, setMinPass] = useState(80);
  const [maxNew, setMaxNew] = useState(0);
  const [botChoice, setBotChoice] = useState<BotChoice>('builtin');
  const [gate, setGate] = useState<GateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedBot = useMemo(loadSavedBot, []);
  const alive = useRef(true);
  const picked = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    listPacks(token)
      .then((p) => alive.current && setPacks(p))
      .catch(() => alive.current && setPacks(ALL_PACKS.map((p) => ({ pack_id: p.id, name: p.label }))));
    listRuns(token)
      .then((all) => alive.current && setRuns(all))
      .catch((err) => alive.current && setError(errorText(err)));
  }, [token]);

  // Only your own finished runs can be gated; samples belong to the demo account.
  const packRuns = useMemo(
    () => (runs ?? []).filter((r) => r.pack_id === packId && (r.status ?? 'done') === 'done' && !r.sample),
    [runs, packId]
  );

  // First visit: open on a version-compare (v2) run if there is one, the case the gate is for.
  // Banking's comes first: its pass rate clears the bar yet 4 answers broke, which a single score hides.
  useEffect(() => {
    if (!runs || picked.current) return;
    picked.current = true;
    const v2runs = runs.filter((r) => r.profile === 'v2' && (r.status ?? 'done') === 'done' && !r.sample && r.pack_id);
    const v2 = v2runs.find((r) => r.pack_id === 'banking') ?? v2runs[0];
    if (v2?.pack_id) {
      setPackId(v2.pack_id);
      setBatchId(v2.batch_id);
    }
  }, [runs]);

  useEffect(() => {
    if (!packRuns.some((r) => r.batch_id === batchId)) setBatchId(packRuns[0]?.batch_id ?? '');
    if (baselineId && !packRuns.some((r) => r.batch_id === baselineId)) setBaselineId('');
  }, [packRuns, batchId, baselineId]);

  const poll = (gateId: string) => {
    if (!token) return;
    const tick = async () => {
      if (!alive.current) return;
      try {
        const res = await getGate(gateId, token);
        if (!alive.current) return;
        setGate({ gate_id: gateId, ...res });
        if (res.status === 'running') setTimeout(tick, POLL_MS);
        else if (res.status === 'failed') setError(res.error ?? 'The gate run failed.');
      } catch (err) {
        if (alive.current) setError(errorText(err));
      }
    };
    tick();
  };

  const bot = mode === 'new' ? botConfig(botChoice, packId, savedBot) : undefined;
  const running = gate?.status === 'running';
  const canRun = !!token && !busy && !running && (mode === 'new' ? !!bot : !!batchId);

  const run = async () => {
    if (!canRun || !token) return;
    setBusy(true);
    setError(null);
    setGate(null);
    try {
      const res = await startGate(
        {
          pack_id: packId,
          min_pass_rate: Math.min(1, Math.max(0, minPass / 100)),
          max_new_failures: Math.max(0, maxNew),
          ...(baselineId ? { baseline_batch_id: baselineId } : {}),
          ...(mode === 'existing' ? { batch_id: batchId } : { bot }),
        },
        token
      );
      setGate(res);
      if (res.status === 'running' && res.gate_id) poll(res.gate_id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const packOptions = packs ?? ALL_PACKS.map((p) => ({ pack_id: p.id, name: p.label }));
  const savedNeedsKey = !!savedBot?.headers?.some((h) => h.name?.trim());

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="lg:self-start" title="Gate a release" bodyClassName="flex flex-col gap-5 p-5">
          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
            Block a bot release that got worse. RAGSeal reruns the test pack and compares it with the last good run.
          </p>

          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[11px] border border-[var(--rule)] p-1">
            {(
              [
                ['existing', 'Check a finished run'],
                ['new', 'Run a new test'],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'h-8 rounded-[8px] text-[12.5px] transition-colors',
                  mode === m ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-1)] hover:text-[var(--ink)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Test pack">
            <select className={INPUT} value={packId} onChange={(e) => setPackId(e.target.value)}>
              {packOptions.map((p) => (
                <option key={p.pack_id} value={p.pack_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          {mode === 'existing' ? (
            <Field
              label="Run to check"
              hint={
                runs && !packRuns.length
                  ? 'No finished run of yours for this pack yet. Run one on Run a full test, or switch to Run a new test.'
                  : 'The answer is instant: nothing is rerun.'
              }
            >
              <select className={INPUT} value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={!packRuns.length}>
                {packRuns.map((r) => (
                  <option key={r.batch_id} value={r.batch_id}>
                    {runLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Bot to test" hint={botChoice === 'saved' && savedNeedsKey ? 'Header values are not saved in the browser, so this bot is sent without its key. Gate it from CI, where the key is a secret.' : undefined}>
              <div className="flex flex-col gap-1.5">
                <Choice on={botChoice === 'builtin'} onClick={() => setBotChoice('builtin')}>
                  RAGSeal's sample bot
                </Choice>
                <Choice on={botChoice === 'saved'} onClick={() => setBotChoice('saved')} disabled={!savedBot}>
                  {savedBot ? `Your bot · ${savedBot.name?.trim() || hostOf(savedBot.url)}` : 'Your bot (set it up on Connect your bot first)'}
                </Choice>
              </div>
            </Field>
          )}

          <Field label="Compare with" hint="Questions that passed there and fail now count as new failures.">
            <select className={INPUT} value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
              <option value="">The previous run of this pack (automatic)</option>
              {packRuns
                .filter((r) => r.batch_id !== batchId)
                .map((r) => (
                  <option key={r.batch_id} value={r.batch_id}>
                    {runLabel(r)}
                  </option>
                ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lowest pass rate (%)">
              <input
                className={INPUT}
                type="number"
                min={0}
                max={100}
                step={5}
                value={minPass}
                onChange={(e) => setMinPass(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
            </Field>
            <Field label="New failures allowed">
              <input
                className={INPUT}
                type="number"
                min={0}
                value={maxNew}
                onChange={(e) => setMaxNew(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--ink-2)]">{mode === 'existing' ? 'Instant' : 'Runs the whole pack: a few minutes'}</span>
            <PrimaryButton onClick={run} busy={busy} disabled={!canRun}>
              {!busy && <Play className="h-3.5 w-3.5" />}
              {mode === 'existing' ? 'Check the gate' : 'Run and gate'}
            </PrimaryButton>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          {running ? (
            <Running gate={gate!} />
          ) : gate?.status === 'done' ? (
            <Result gate={gate} onOpenRun={onOpenRun} />
          ) : (
            <Intro />
          )}
          <CiPanel packId={packId} minPass={minPass / 100} maxNew={maxNew} />
          <TokensPanel token={token} isDemo={userEmail === DEMO_EMAIL} />
        </div>
      </div>
    </div>
  );
};

const Intro: React.FC = () => (
  <Panel title="How the gate decides">
    <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--ink-1)]">
      <p>A release passes only if both hold:</p>
      <ol className="ml-4 list-decimal space-y-1 text-[var(--ink-1)]">
        <li>its pass rate is at or above your bar, and</li>
        <li>no more questions than you allow got worse: they passed in the run you compare with and fail now.</li>
      </ol>
      <p className="text-[var(--ink-2)]">
        The second rule is the one a single score misses: a version can keep a good pass rate while breaking answers that used to be right.
      </p>
    </div>
  </Panel>
);

const Running: React.FC<{ gate: GateResult }> = ({ gate }) => {
  const done = gate.progress?.done ?? 0;
  const total = gate.progress?.total ?? gate.total ?? 0;
  return (
    <Panel title="Running the pack" note={gate.batch_id}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-[var(--ink)]">
            {done} of {total || '…'} questions
          </span>
          {gate.progress?.eta_ms ? <span className="text-xs text-[var(--ink-2)]">about {fmtDuration(gate.progress.eta_ms)} left</span> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-2)]">
          <div
            className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-500"
            style={{ width: `${Math.max(4, total ? (done / total) * 100 : 0)}%` }}
          />
        </div>
        <p className="text-xs text-[var(--ink-2)]">When the run finishes, it is compared with the baseline and the gate decides.</p>
      </div>
    </Panel>
  );
};

const Result: React.FC<{ gate: GateResult; onOpenRun: (batchId: string, packId?: string) => void }> = ({ gate, onOpenRun }) => {
  const passed = !!gate.pass;
  const color = passed ? PASS : RED;
  const newFailures = gate.new_failures ?? [];
  const fixed = gate.fixed ?? [];
  const rate = gate.pass_rate ?? 0;
  const bar = gate.min_pass_rate ?? 0.8;
  const headline = passed
    ? 'Ship it. The pass rate clears the bar and nothing that worked before broke.'
    : gate.pass_rate != null && rate >= bar && newFailures.length
      ? `The pass rate looks fine, but ${newFailures.length} question${newFailures.length === 1 ? '' : 's'} that passed before now fail${newFailures.length === 1 ? 's' : ''}.`
      : 'Blocked. This release would make the bot worse.';

  return (
    <Panel
      title="Verdict"
      note={`${gate.total ?? '?'} questions${gate.baseline_batch_id ? ` · compared with ${gate.baseline_batch_id}` : ' · no earlier run to compare with'}`}
      bodyClassName="flex flex-col gap-5 p-5"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          className="inline-flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-[26px] font-semibold tracking-tight"
          style={{ background: tint(color, 0.14), color, border: `1px solid ${tint(color, 0.4)}` }}
        >
          {passed ? <ShieldCheck className="h-7 w-7" /> : <ShieldX className="h-7 w-7" />}
          {passed ? 'PASS' : 'FAIL'}
        </span>
        <p className="min-w-0 flex-1 text-[16px] leading-snug text-[var(--ink)]">{headline}</p>
      </div>

      {!!gate.reasons?.length && (
        <ul className="flex flex-col gap-1 text-[13px] text-[var(--ink-1)]">
          {gate.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span style={{ color: RED }}>•</span>
              {r[0].toUpperCase() + r.slice(1)}.
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pass rate" value={pct1(rate)} ok={rate >= bar} note={`bar ${pct1(bar)}`}>
          <div className="relative mt-2 h-1.5 rounded-full bg-[var(--panel-2)]">
            <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: tint(rate >= bar ? PASS : RED, 0.7) }} />
            <span className="absolute -top-1 h-3.5 w-px bg-[var(--ink)]" style={{ left: `${bar * 100}%` }} title={`bar ${pct1(bar)}`} />
          </div>
        </Stat>
        <Stat
          label="New failures"
          value={String(newFailures.length)}
          ok={newFailures.length <= (gate.max_new_failures ?? 0)}
          note={`allowed ${gate.max_new_failures ?? 0}`}
        />
        <Stat label="Fixed" value={String(fixed.length)} ok note="failed before, pass now" />
      </div>

      {newFailures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-[var(--ink-1)]">Got worse since the baseline</h3>
          <ul className="flex flex-col divide-y divide-[var(--rule)] rounded-xl border border-[var(--rule)]">
            {newFailures.map((c) => (
              <CaseRow key={c.test_id} c={c} onOpen={gate.batch_id ? () => onOpenRun(gate.batch_id!, gate.pack_id) : undefined} />
            ))}
          </ul>
        </div>
      )}

      {fixed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
            <span className="group-open:hidden">Show the {fixed.length} fixed question{fixed.length === 1 ? '' : 's'}</span>
            <span className="hidden group-open:inline">Hide fixed questions</span>
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-[var(--rule)] rounded-xl border border-[var(--rule)]">
            {fixed.map((c) => (
              <CaseRow key={c.test_id} c={c} />
            ))}
          </ul>
        </details>
      )}

      {gate.batch_id && (
        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={() => onOpenRun(gate.batch_id!, gate.pack_id)}>
            View this run in Diagnose <ArrowRight className="h-3.5 w-3.5" />
          </GhostButton>
          {gate.baseline_batch_id && (
            <GhostButton onClick={() => onOpenRun(gate.baseline_batch_id!, gate.pack_id)}>View the baseline run</GhostButton>
          )}
        </div>
      )}
    </Panel>
  );
};

const Stat: React.FC<{ label: string; value: string; ok: boolean; note?: string; children?: React.ReactNode }> = ({
  label,
  value,
  ok,
  note,
  children,
}) => (
  <div className="rounded-xl border border-[var(--rule)] px-3.5 py-3">
    <div className="text-[11.5px] text-[var(--ink-2)]">{label}</div>
    <div className="mt-0.5 flex items-baseline gap-2">
      <span className="text-[22px] font-medium tabular-nums" style={{ color: ok ? 'var(--ink)' : RED }}>
        {value}
      </span>
      {note && <span className="text-[11.5px] text-[var(--ink-2)]">{note}</span>}
    </div>
    {children}
  </div>
);

const CaseRow: React.FC<{ c: GateCase; onOpen?: () => void }> = ({ c, onOpen }) => {
  const style = verdictStyle(c.category);
  return (
    <li className="flex items-start gap-3 px-3.5 py-2.5">
      <span className="mt-0.5 shrink-0 font-mono text-[11px] text-[var(--ink-2)]">{c.test_id}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-[var(--ink)]">{c.question}</p>
        {c.summary && <p className="mt-0.5 text-xs leading-snug text-[var(--ink-2)]">{c.summary}</p>}
      </div>
      {c.category && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
          style={{ background: tint(style.color, 0.16), color: style.color }}
        >
          {style.short}
        </span>
      )}
      {onOpen && (
        <button onClick={onOpen} className="shrink-0 text-xs text-[var(--ink-2)] hover:text-[var(--ink)]" title="Open the run in Diagnose">
          Diagnose →
        </button>
      )}
    </li>
  );
};

const CiPanel: React.FC<{ packId: string; minPass: number; maxNew: number }> = ({ packId, minPass, maxNew }) => (
  <Panel title="Use it in CI" note="GitHub Actions, or any CI that runs Python">
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
        Every push reruns your bot through the pack; the job fails (exit 1) when the gate says FAIL, so a worse bot never ships. You need an API
        token: make one in{' '}
        {/* Not an #anchor: the hash is the app's route. */}
        <button
          type="button"
          onClick={() => document.getElementById('api-tokens')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="text-[var(--ink-1)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          API tokens
        </button>{' '}
        below.
      </p>
      <CodeBlock label="Command line" code={cliCommand(packId, minPass, maxNew)} />
      <CodeBlock label="GitHub Actions workflow" code={SNIPPET} tall />
    </div>
  </Panel>
);

const CodeBlock: React.FC<{ label: string; code: string; tall?: boolean }> = ({ label, code, tall }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ink-1)]">{label}</span>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
          {copied ? <Check className="h-3.5 w-3.5" style={{ color: PASS }} /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className={cn(
          'overflow-auto rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-[var(--ink-1)]',
          tall && 'max-h-[260px]'
        )}
      >
        {code}
      </pre>
    </div>
  );
};

const TokensPanel: React.FC<{ token: string | null; isDemo: boolean }> = ({ token, isDemo }) => {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState('GitHub Actions');
  const [fresh, setFresh] = useState<(ApiToken & { token: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    listApiTokens(token)
      .then(setTokens)
      .catch((err) => setError(errorText(err)));
  }, [token]);

  const create = async () => {
    if (!token || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const made = await createApiToken(name.trim(), token);
      setFresh(made);
      setTokens((t) => [made, ...(t ?? [])]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (t: ApiToken) => {
    if (!token || !window.confirm(`Revoke "${t.name}" (${t.prefix}…)? Anything using it stops working.`)) return;
    try {
      await revokeApiToken(t.id, token);
      setTokens((list) => (list ?? []).filter((x) => x.id !== t.id));
      if (fresh?.id === t.id) setFresh(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section id="api-tokens" className="scroll-mt-6">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" /> API tokens
          </span>
        }
        note={tokens ? `${tokens.length} of 10` : undefined}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
            A token lets CI call RAGSeal as you. Keep it in your CI's secrets; it works until you revoke it.
          </p>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          {isDemo ? (
            <p className="rounded-xl border border-[var(--rule)] px-3.5 py-3 text-[13px] text-[var(--ink-1)]">
              The demo account is shared, so it can't make tokens. Sign in with your own account (Google or email) to create one.
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                className={INPUT}
                value={name}
                maxLength={60}
                placeholder="Token name, e.g. GitHub Actions"
                onChange={(e) => setName(e.target.value)}
              />
              <PrimaryButton onClick={create} busy={busy} disabled={!token || !name.trim() || (tokens?.length ?? 0) >= 10} className="h-10">
                Create token
              </PrimaryButton>
            </div>
          )}

          {fresh && (
            <div className="flex flex-col gap-2 rounded-xl px-3.5 py-3" style={{ background: tint(PASS, 0.1), border: `1px solid ${tint(PASS, 0.35)}` }}>
              <span className="text-[13px] font-medium text-[var(--ink)]">Copy it now: this is the only time the full token is shown.</span>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--ink)]">{fresh.token}</code>
                <GhostButton
                  onClick={() =>
                    navigator.clipboard?.writeText(fresh.token).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                  }
                >
                  {copied ? <Check className="h-3.5 w-3.5" style={{ color: PASS }} /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </GhostButton>
              </div>
            </div>
          )}

          {tokens && tokens.length > 0 ? (
            <ul className="flex flex-col divide-y divide-[var(--rule)] rounded-xl border border-[var(--rule)]">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="text-[var(--ink)]">{t.name}</span>
                    <span className="ml-2 font-mono text-[11.5px] text-[var(--ink-2)]">{t.prefix}…</span>
                    <span className="block text-[11.5px] text-[var(--ink-2)]">
                      Created {fmtTime(t.created_at)} · {t.last_used_at ? `last used ${fmtTime(t.last_used_at)}` : 'never used'}
                    </span>
                  </span>
                  {!isDemo && (
                    <button
                      onClick={() => revoke(t)}
                      className="flex items-center gap-1 text-xs text-[var(--ink-2)] hover:text-[var(--gen)]"
                      title="Revoke this token"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : tokens ? (
            <p className="text-xs text-[var(--ink-2)]">No tokens yet.</p>
          ) : null}
        </div>
      </Panel>
    </section>
  );
};

const Choice: React.FC<{ on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ on, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={on}
    className={cn(
      'flex h-9 items-center gap-2.5 rounded-[10px] border px-3 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45',
      on ? 'border-[var(--ink)] text-[var(--ink)]' : 'border-[var(--rule-2)] text-[var(--ink-1)] hover:border-[var(--rule-3)]'
    )}
  >
    <span
      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
      style={{ borderColor: on ? 'var(--ink)' : 'var(--rule-3)' }}
    >
      {on && <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]" />}
    </span>
    <span className="truncate">{children}</span>
  </button>
);

const INPUT =
  'h-10 w-full rounded-[10px] border border-[var(--rule-2)] bg-[var(--paper)] px-3 text-[13.5px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--rule-3)] disabled:opacity-50';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-[var(--ink-1)]">{label}</span>
    {children}
    {hint && <span className="text-[11.5px] leading-snug text-[var(--ink-2)]">{hint}</span>}
  </div>
);
