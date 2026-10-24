import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Scale, Shuffle } from 'lucide-react';
import { ApiError, HealthResponse } from '../../../lib/api';
import { TopBarControls } from '../shell/AppShell';
import { AMBER, PASS, pct, RED, tint } from '../lab/verdict';
import {
  Agreement,
  Confusion,
  errorText,
  getAgreement,
  getConfusion,
  getStability,
  judgePool,
  listRuns,
  NotAvailable,
  RunProgress,
  Stability,
  startInjectionRun,
  startStability,
} from '../shared/apiExtra';
import { failureLabel } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, fmtDuration, fmtNum, GhostButton, LoadState, Metric, Panel, PrimaryButton } from '../shared/ui';

/** PS: hand-label 150+ question-answer pairs with two people agreeing. */
const LABEL_TARGET = 150;

interface TrustPageProps {
  token: string | null;
  health: HealthResponse | null;
}

/** How far can the evaluator itself be trusted: humans, known failures, judge swaps. */
export const TrustPage: React.FC<TrustPageProps> = ({ token, health }) => {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [agreementErr, setAgreementErr] = useState<unknown>(null);
  const [confusion, setConfusion] = useState<Confusion | null>(null);
  const [confusionErr, setConfusionErr] = useState<unknown>(null);
  const [injecting, setInjecting] = useState(false);
  const [stability, setStability] = useState<Stability | null>(null);
  const [stabilityErr, setStabilityErr] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectProgress, setInjectProgress] = useState<RunProgress | null>(null);
  const [stabilityProgress, setStabilityProgress] = useState<RunProgress | null>(null);
  const confusionTimer = useRef<number | null>(null);
  const stabilityTimer = useRef<number | null>(null);

  // The backend's default pair; the judge-swap result is also the evidence that overflow
  // to the second judge is safe. Names are "provider:model".
  const pool = judgePool(health);
  const defaultA = poolName(pool.members.find((m) => m.role === 'primary')) ?? 'groq:openai/gpt-oss-120b';
  const defaultB = poolName(pool.members.find((m) => m.role === 'overflow')) ?? 'groq:qwen/qwen3.8-27b';
  const [judgeA, setJudgeA] = useState(defaultA);
  const [judgeB, setJudgeB] = useState(defaultB);
  useEffect(() => setJudgeA(defaultA), [defaultA]);
  useEffect(() => setJudgeB(defaultB), [defaultB]);

  useEffect(
    () => () => {
      if (confusionTimer.current) window.clearTimeout(confusionTimer.current);
      if (stabilityTimer.current) window.clearTimeout(stabilityTimer.current);
    },
    []
  );

  // Poll the confusion matrix until its injection run is done (HTTP 202 while running).
  const pollConfusion = useCallback(
    (runId?: string) => {
      if (!token) return;
      const tick = async () => {
        try {
          const c = await getConfusion(token, runId);
          if (c.status === 'running') {
            setInjecting(true);
            setInjectProgress(c.progress ?? null);
            confusionTimer.current = window.setTimeout(tick, 3000);
            return;
          }
          setInjecting(false);
          setInjectProgress(null);
          if (c.status === 'failed') setError(`Failure-injection run failed: ${c.error ?? 'unknown error'}`);
          setConfusion(c);
          setConfusionErr(null);
        } catch (err) {
          setInjecting(false);
          setInjectProgress(null);
          if (err instanceof ApiError && err.status === 404) setConfusion({ labels: [], matrix: [] });
          else setConfusionErr(err);
        }
      };
      tick();
    },
    [token]
  );

  const pollStability = useCallback(
    (id: string, quietIfMissing: boolean) => {
      if (!token) return;
      const tick = async () => {
        try {
          const st = await getStability(id, token);
          if (st.status === 'running') {
            setChecking(true);
            setStabilityProgress(st.progress ?? null);
            stabilityTimer.current = window.setTimeout(tick, 3000);
            return;
          }
          setChecking(false);
          setStabilityProgress(null);
          if (st.status === 'failed') setError(`Stability check failed: ${st.error ?? 'unknown error'}`);
          else setStability(st);
          setStabilityErr(null);
        } catch (err) {
          setChecking(false);
          setStabilityProgress(null);
          // No check has been run yet: keep the explainer instead of an error.
          if (quietIfMissing) return;
          if (err instanceof NotAvailable) setStabilityErr(err);
          else setError(errorText(err));
        }
      };
      tick();
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    getAgreement(token).then(setAgreement).catch(setAgreementErr);
    pollConfusion();
    pollStability('latest', true);
  }, [token, pollConfusion, pollStability]);

  const runInjection = useCallback(async () => {
    if (!token) return;
    setInjecting(true);
    setError(null);
    try {
      const { run_id } = await startInjectionRun(token);
      pollConfusion(run_id || undefined);
    } catch (err) {
      if (err instanceof NotAvailable) setConfusionErr(err);
      else setError(errorText(err));
      setInjecting(false);
    }
  }, [token, pollConfusion]);

  const runStabilityCheck = useCallback(async () => {
    if (!token) return;
    setChecking(true);
    setError(null);
    try {
      // Stability is measured on a finished pack run (not a fault-injection run).
      const runs = (await listRuns(token)).filter((r) => (r.status ?? 'done') === 'done' && r.pack_id !== 'injection');
      const latest = runs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!latest) throw new Error('Run a pack first; stability is measured on a finished run.');
      const { stability_id } = await startStability(latest.batch_id, token, { judges: [judgeA, judgeB] });
      pollStability(stability_id, false);
    } catch (err) {
      if (err instanceof NotAvailable) setStabilityErr(err);
      else setError(errorText(err));
      setChecking(false);
    }
  }, [token, judgeA, judgeB, pollStability]);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <GhostButton onClick={runInjection} disabled={injecting || !token}>
          <FlaskConical className="h-3.5 w-3.5 text-[var(--ink-2)]" />
          {injecting ? injectLabel(injectProgress) : 'Run failure-injection test'}
        </GhostButton>
      </TopBarControls>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <AgreementSection agreement={agreement} error={agreementErr} />

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Failure types: predicted vs true"
          note={confusion?.n != null ? `${confusion.n} cases with a known failure type` : 'injected failures with known types'}
        >
          {confusion?.matrix?.length ? (
            <ConfusionMatrix c={confusion} />
          ) : injecting ? (
            <ProgressNote what="Planting failures and diagnosing them" p={injectProgress} />
          ) : confusionErr || !confusion ? (
            <LoadState loading={!confusionErr} error={confusionErr} what="the confusion matrix" />
          ) : (
            <EmptyState title="No failure-injection run yet">
              Run the failure-injection test: it plants failures of every type (dropped chunk, outdated version,
              fabricated claim…) and checks the pipeline names each one correctly.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Stability" note="same answers, different grading model or order">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5">
              <JudgeInput label="Grading model A" value={judgeA} onChange={setJudgeA} />
              <JudgeInput label="Grading model B" value={judgeB} onChange={setJudgeB} />
            </div>
            <PrimaryButton onClick={runStabilityCheck} busy={checking} disabled={!token || !judgeA || !judgeB}>
              {!checking && <Scale className="h-3.5 w-3.5" />}
              Swap grading model and shuffle
            </PrimaryButton>
            {checking ? (
              <ProgressNote what="Re-scoring with both judges and shuffled orders" p={stabilityProgress} />
            ) : stability ? (
              <StabilityResult s={stability} />
            ) : stabilityErr ? (
              <LoadState error={stabilityErr} what="stability" />
            ) : (
              <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
                Re-scores the latest run with both judges and with chunks and cases in shuffled order (cache bypassed).
                Scores should barely move.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
};

const AgreementSection: React.FC<{ agreement: Agreement | null; error: unknown }> = ({ agreement, error }) => {
  if (!agreement) {
    return (
      <Panel title="Agreement with human labels">
        <LoadState loading={!error} error={error} what="agreement" />
      </Panel>
    );
  }
  const n = agreement.n_double_labeled ?? 0;
  const hh = agreement.human_human ?? {};
  const pv = agreement.pipeline_vs_consensus ?? {};
  return (
    <Panel
      raised
      title="Agreement with human labels"
      note={`${n} of ${LABEL_TARGET}+ answers labeled by both people${agreement.labelers?.length ? ` · ${agreement.labelers.join(', ')}` : ''}`}
    >
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Metric big label="Pipeline agrees with humans" value={pct(pv.agreement)} sub={`Cohen's κ ${fmtNum(pv.kappa)}`} color={tone(pv.agreement)} />
        <Metric
          big
          label="Humans agree with each other"
          value={pct(hh.agreement)}
          sub={`Cohen's κ ${fmtNum(hh.cohen_kappa)}${
            hh.failure_type_n ? ` · same failure type ${pct(hh.failure_type_agreement)} of ${hh.failure_type_n}` : ''
          }`}
        />
        <Metric
          big
          label="False pass"
          value={pv.false_pass ?? '—'}
          sub="pipeline said fine, humans said wrong"
          color={pv.false_pass ? RED : undefined}
        />
        <Metric big label="False fail" value={pv.false_fail ?? '—'} sub="pipeline flagged a correct answer" color={pv.false_fail ? AMBER : undefined} />
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.min(100, (n / LABEL_TARGET) * 100)}%`, background: n >= LABEL_TARGET ? PASS : 'var(--ink)' }}
        />
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {agreement.n_labels ?? 0} labels on {agreement.n_items_labeled ?? 0} answers so far. Pipeline numbers use only the{' '}
        {pv.n ?? 0} answers where both people agree.
      </p>
      {!!agreement.disagreements?.length && (
        <div className="mt-5 border-t border-[var(--rule)] pt-4">
          <div className="mb-2 text-xs text-[var(--ink-2)]">Disagreements ({agreement.disagreements.length})</div>
          <ul className="space-y-1.5 text-[13px]">
            {agreement.disagreements.slice(0, 4).map((d) => (
              <li key={`${d.batch_id}-${d.test_id}-${d.kind}`} className="flex gap-3">
                <span className="w-16 shrink-0 font-mono text-xs text-[var(--ink-2)]">{d.test_id}</span>
                <span className="shrink-0 text-xs" style={{ color: d.kind === 'human_vs_human' ? AMBER : RED }}>
                  {d.kind === 'human_vs_human' ? 'humans split' : 'pipeline differs'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--ink-1)]">{d.question ?? d.note}</span>
                <span className="shrink-0 text-xs text-[var(--ink-2)]">
                  humans <span className="text-[var(--ink)]">{d.humans ?? '—'}</span> · pipeline{' '}
                  <span className="text-[var(--ink)]">{d.pipeline ?? '—'}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
};

function poolName(m?: { name: string; provider?: string }): string | undefined {
  return m ? `${m.provider ?? 'groq'}:${m.name}` : undefined;
}

function injectLabel(p: RunProgress | null): string {
  return p?.total ? `Injecting failures… ${p.done ?? 0}/${p.total}` : 'Injecting failures…';
}

const ProgressNote: React.FC<{ what: string; p: RunProgress | null }> = ({ what, p }) => {
  const frac = p?.total ? Math.min(1, (p.done ?? 0) / p.total) : null;
  return (
    <div className="flex flex-col gap-2.5 py-2">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-[var(--ink-1)]">{what}…</span>
        <span className="tabular-nums text-[var(--ink-2)]">
          {p?.total ? `${p.done ?? 0} / ${p.total}` : 'starting'}
          {p?.eta_ms != null && ` · ${fmtDuration(p.eta_ms)} left`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
        <div
          className={frac == null ? 'h-full w-1/3 animate-pulse rounded-full bg-[var(--rule-3)]' : 'h-full rounded-full bg-[var(--ink)] transition-[width] duration-700'}
          style={frac == null ? undefined : { width: `${frac * 100}%` }}
        />
      </div>
      <p className="text-xs text-[var(--muted)]">This shares the grading model's rate limit with other runs, so it can take a few minutes.</p>
    </div>
  );
};

function tone(v: number | null | undefined): string | undefined {
  if (v == null) return undefined;
  return v >= 0.8 ? PASS : v >= 0.6 ? AMBER : RED;
}

/** Rows = true type, columns = predicted. The diagonal is "named the failure correctly". */
const ConfusionMatrix: React.FC<{ c: Confusion }> = ({ c }) => {
  const max = Math.max(1, ...c.matrix.flat());
  const short = (id: string) => failureLabel(id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums" style={{ color: tone(c.accuracy) }}>
          {pct(c.accuracy)}
        </span>
        <span className="text-[13px] text-[var(--ink-2)]">of failures named correctly</span>
        {c.stage_accuracy != null && (
          <span className="ml-auto text-[13px] text-[var(--ink-2)]">
            right stage blamed{' '}
            <span className="font-semibold tabular-nums" style={{ color: tone(c.stage_accuracy) }}>
              {pct(c.stage_accuracy)}
            </span>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[11px]">
          <thead>
            <tr>
              <th className="pr-2 text-right align-bottom font-normal text-[var(--muted)]">true ↓ / predicted →</th>
              {c.labels.map((l) => (
                <th key={l} className="h-[92px] w-11 align-bottom font-normal text-[var(--ink-2)]">
                  <span className="inline-block origin-bottom-left translate-x-5 -rotate-45 whitespace-nowrap">{short(l)}</span>
                </th>
              ))}
              <th className="pl-3 text-left align-bottom font-normal text-[var(--muted)]">recall</th>
            </tr>
          </thead>
          <tbody>
            {c.labels.map((row, i) => (
              <tr key={row}>
                <th className="whitespace-nowrap pr-2 text-right font-normal text-[var(--ink-1)]">{short(row)}</th>
                {c.matrix[i]?.map((v, j) => {
                  const diag = i === j;
                  const color = diag ? PASS : RED;
                  return (
                    <td
                      key={j}
                      className="h-9 w-11 rounded-md text-center tabular-nums"
                      style={{
                        background: v ? tint(color, 0.12 + 0.6 * (v / max)) : 'var(--panel)',
                        color: v ? 'var(--ink)' : 'var(--rule-3)',
                      }}
                      title={`true ${short(row)} → predicted ${short(c.labels[j])}: ${v}`}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="pl-3 tabular-nums text-[var(--ink-1)]">{pct(c.per_class?.[row]?.recall)}</td>
              </tr>
            ))}
            <tr>
              <th className="pr-2 pt-1 text-right font-normal text-[var(--muted)]">precision</th>
              {c.labels.map((l) => (
                <td key={l} className="pt-1 text-center tabular-nums text-[var(--ink-1)]">
                  {pct(c.per_class?.[l]?.precision)}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

const JudgeInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-xs text-[var(--ink-2)]">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 h-9 w-full rounded-[9px] border border-[var(--rule-2)] bg-[var(--paper)] px-3 font-mono text-[12px] text-[var(--ink)] focus:border-[var(--rule-3)] focus:outline-none"
    />
  </label>
);

const StabilityResult: React.FC<{ s: Stability }> = ({ s }) => {
  const corr = s.judge_swap?.correlation ?? {};
  const stable = s.stable ?? s.shuffle?.stable;
  return (
    <div className="flex flex-col gap-4 border-t border-[var(--rule)] pt-4">
      {stable != null && (
        <div className="text-[15px] font-semibold" style={{ color: stable ? PASS : RED }}>
          {stable ? 'Stable' : 'Unstable'} when the grading model is swapped or the order shuffled
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ink-2)]">
          <Scale className="h-3.5 w-3.5" /> Judge swap {s.judges?.length ? `· ${s.judges.map((j) => j.split('/').pop()).join(' vs ')}` : ''}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          {Object.entries(corr).map(([metric, v]) => (
            <Row key={metric} label={`${metric.replace(/_/g, ' ')} correlation`} value={fmtNum(v)} />
          ))}
          <Row label="Verdict agreement" value={pct(s.judge_swap?.verdict_agreement)} />
          <Row label="Verdict κ" value={fmtNum(s.judge_swap?.verdict_kappa)} />
          <Row label="Cases compared" value={s.judge_swap?.n ?? s.n_cases ?? '—'} />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ink-2)]">
          <Shuffle className="h-3.5 w-3.5" /> Shuffle × {s.shuffle?.runs ?? '—'}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <Row label="Largest score change" value={fmtNum(s.shuffle?.max_delta)} />
          <Row label="Mean score change" value={fmtNum(s.shuffle?.mean_delta, 3)} />
          <Row label="Cases that moved" value={s.shuffle?.unstable_cases ?? '—'} />
          <Row label="Verdicts that changed" value={s.shuffle?.verdict_changes ?? '—'} />
          <Row label="Tolerance" value={fmtNum(s.shuffle?.threshold)} />
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-[var(--panel)] pb-1.5">
    <span className="capitalize text-[var(--ink-2)]">{label}</span>
    <span className="tabular-nums text-[var(--ink)]">{value}</span>
  </div>
);
