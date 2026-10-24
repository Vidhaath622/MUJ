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
  listRuns,
  NotAvailable,
  runStability,
  Stability,
  startInjectionRun,
} from '../shared/apiExtra';
import { failureLabel } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, fmtNum, GhostButton, LoadState, Metric, Panel, PrimaryButton } from '../shared/ui';

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
  const timer = useRef<number | null>(null);

  const primaryJudge = (health?.models?.judge?.name ?? health?.judge_model ?? 'openai/gpt-oss-120b');
  const [judgeA, setJudgeA] = useState(primaryJudge);
  const [judgeB, setJudgeB] = useState('qwen3:8b');
  useEffect(() => setJudgeA(primaryJudge), [primaryJudge]);

  useEffect(() => {
    if (!token) return;
    getAgreement(token).then(setAgreement).catch(setAgreementErr);
    getConfusion(token)
      .then(setConfusion)
      // 404 with a detail = endpoint exists but nothing has been run yet.
      .catch((err) => (err instanceof ApiError && err.status === 404 ? setConfusion({ labels: [], matrix: [] }) : setConfusionErr(err)));
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [token]);

  const runInjection = useCallback(async () => {
    if (!token) return;
    setInjecting(true);
    setError(null);
    try {
      const { run_id } = await startInjectionRun(token);
      // The injection run may finish later; poll until the matrix for it is ready.
      const tick = async () => {
        try {
          const c = await getConfusion(token, run_id || undefined);
          if (c.matrix?.length) {
            setConfusion(c);
            setConfusionErr(null);
            setInjecting(false);
            return;
          }
        } catch (err) {
          if (err instanceof NotAvailable) {
            setConfusionErr(err);
            setInjecting(false);
            return;
          }
        }
        timer.current = window.setTimeout(tick, 3000);
      };
      tick();
    } catch (err) {
      if (err instanceof NotAvailable) setConfusionErr(err);
      else setError(errorText(err));
      setInjecting(false);
    }
  }, [token]);

  const runStabilityCheck = useCallback(async () => {
    if (!token) return;
    setChecking(true);
    setError(null);
    try {
      const runs = (await listRuns(token)).filter((r) => (r.status ?? 'done') === 'done');
      const latest = runs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!latest) throw new Error('Run a pack first; stability is measured on a finished run.');
      setStability(await runStability(latest.batch_id, [judgeA, judgeB], token));
      setStabilityErr(null);
    } catch (err) {
      if (err instanceof NotAvailable) setStabilityErr(err);
      else setError(errorText(err));
    } finally {
      setChecking(false);
    }
  }, [token, judgeA, judgeB]);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <GhostButton onClick={runInjection} disabled={injecting || !token}>
          <FlaskConical className="h-3.5 w-3.5 text-[#8A9099]" />
          {injecting ? 'Injecting failures…' : 'Run failure-injection test'}
        </GhostButton>
      </TopBarControls>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <AgreementSection agreement={agreement} error={agreementErr} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Failure types: predicted vs true"
          note={confusion?.n != null ? `${confusion.n} cases with a known failure type` : 'injected failures with known types'}
        >
          {confusion?.matrix?.length ? (
            <ConfusionMatrix c={confusion} />
          ) : confusionErr || !confusion ? (
            <LoadState loading={!confusionErr} error={confusionErr} what="the confusion matrix" />
          ) : (
            <EmptyState title="No failure-injection run yet">
              Run the failure-injection test: it plants failures of every type (dropped chunk, outdated version,
              fabricated claim…) and checks the pipeline names each one correctly.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Stability" note="same answers, different judge or order">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5">
              <JudgeInput label="Judge A" value={judgeA} onChange={setJudgeA} />
              <JudgeInput label="Judge B" value={judgeB} onChange={setJudgeB} />
            </div>
            <PrimaryButton onClick={runStabilityCheck} busy={checking} disabled={!token || !judgeA || !judgeB}>
              {!checking && <Scale className="h-3.5 w-3.5" />}
              Swap judge and shuffle
            </PrimaryButton>
            {stability ? (
              <StabilityResult s={stability} />
            ) : stabilityErr ? (
              <LoadState error={stabilityErr} what="stability" />
            ) : (
              <p className="text-[13px] leading-relaxed text-[#8A9099]">
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
    <Panel raised title="Agreement with human labels" note={`${n} of ${LABEL_TARGET}+ answers labeled by both people`}>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Metric big label="Pipeline agrees with humans" value={pct(pv.agreement)} sub={`Cohen's κ ${fmtNum(pv.kappa)}`} color={tone(pv.agreement)} />
        <Metric big label="Humans agree with each other" value={pct(hh.agreement)} sub={`Cohen's κ ${fmtNum(hh.cohen_kappa)}`} />
        <Metric
          big
          label="False pass"
          value={pv.false_pass ?? '—'}
          sub="pipeline said fine, humans said wrong"
          color={pv.false_pass ? RED : undefined}
        />
        <Metric big label="False fail" value={pv.false_fail ?? '—'} sub="pipeline flagged a correct answer" color={pv.false_fail ? AMBER : undefined} />
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#16181C]">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.min(100, (n / LABEL_TARGET) * 100)}%`, background: n >= LABEL_TARGET ? PASS : '#F4F5F6' }}
        />
      </div>
      {!!agreement.disagreements?.length && (
        <div className="mt-5 border-t border-[#17191D] pt-4">
          <div className="mb-2 text-xs text-[#8A9099]">Where the pipeline and the humans disagree</div>
          <ul className="space-y-1.5 text-[13px]">
            {agreement.disagreements.slice(0, 4).map((d) => (
              <li key={d.test_id} className="flex gap-3">
                <span className="w-16 shrink-0 font-mono text-xs text-[#8A9099]">{d.test_id}</span>
                <span className="min-w-0 flex-1 truncate text-[#C9CDD3]">{d.question ?? d.note}</span>
                <span className="shrink-0 text-xs text-[#8A9099]">
                  humans <span className="text-[#E8EAED]">{d.humans ?? '—'}</span> · pipeline{' '}
                  <span className="text-[#E8EAED]">{d.pipeline ?? '—'}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
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
        <span className="text-[13px] text-[#8A9099]">of failures named correctly</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[11px]">
          <thead>
            <tr>
              <th className="pr-2 text-right align-bottom font-normal text-[#6F757E]">true ↓ / predicted →</th>
              {c.labels.map((l) => (
                <th key={l} className="h-[92px] w-11 align-bottom font-normal text-[#8A9099]">
                  <span className="inline-block origin-bottom-left translate-x-5 -rotate-45 whitespace-nowrap">{short(l)}</span>
                </th>
              ))}
              <th className="pl-3 text-left align-bottom font-normal text-[#6F757E]">recall</th>
            </tr>
          </thead>
          <tbody>
            {c.labels.map((row, i) => (
              <tr key={row}>
                <th className="whitespace-nowrap pr-2 text-right font-normal text-[#C9CDD3]">{short(row)}</th>
                {c.matrix[i]?.map((v, j) => {
                  const diag = i === j;
                  const color = diag ? PASS : RED;
                  return (
                    <td
                      key={j}
                      className="h-9 w-11 rounded-md text-center tabular-nums"
                      style={{
                        background: v ? tint(color, 0.12 + 0.6 * (v / max)) : '#111317',
                        color: v ? '#F4F5F6' : '#3A3E45',
                      }}
                      title={`true ${short(row)} → predicted ${short(c.labels[j])}: ${v}`}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="pl-3 tabular-nums text-[#C9CDD3]">{pct(c.per_class?.[row]?.recall)}</td>
              </tr>
            ))}
            <tr>
              <th className="pr-2 pt-1 text-right font-normal text-[#6F757E]">precision</th>
              {c.labels.map((l) => (
                <td key={l} className="pt-1 text-center tabular-nums text-[#C9CDD3]">
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
    <span className="text-xs text-[#8A9099]">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 h-9 w-full rounded-[9px] border border-[#22252B] bg-[#08090B] px-3 font-mono text-[12px] text-[#E8EAED] focus:border-[#3A3E45] focus:outline-none"
    />
  </label>
);

const StabilityResult: React.FC<{ s: Stability }> = ({ s }) => {
  const corr = s.judge_swap?.correlation ?? {};
  const stable = s.stable ?? s.shuffle?.stable;
  return (
    <div className="flex flex-col gap-4 border-t border-[#17191D] pt-4">
      {stable != null && (
        <div className="text-[15px] font-semibold" style={{ color: stable ? PASS : RED }}>
          {stable ? 'Stable' : 'Unstable'} under judge swap and shuffling
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-[#8A9099]">
          <Scale className="h-3.5 w-3.5" /> Judge swap {s.judges?.length ? `· ${s.judges.map((j) => j.split('/').pop()).join(' vs ')}` : ''}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          {Object.entries(corr).map(([metric, v]) => (
            <Row key={metric} label={`${metric.replace(/_/g, ' ')} correlation`} value={fmtNum(v)} />
          ))}
          <Row label="Verdict agreement" value={pct(s.judge_swap?.verdict_agreement)} />
          <Row label="Verdict κ" value={fmtNum(s.judge_swap?.verdict_kappa)} />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-[#8A9099]">
          <Shuffle className="h-3.5 w-3.5" /> Shuffle × {s.shuffle?.runs ?? '—'}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <Row label="Largest score change" value={fmtNum(s.shuffle?.max_delta)} />
          <Row label="Mean score change" value={fmtNum(s.shuffle?.mean_delta, 3)} />
          <Row label="Cases that moved" value={s.shuffle?.unstable_cases ?? '—'} />
          <Row label="Tolerance" value={fmtNum(s.shuffle?.threshold)} />
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-[#14161A] pb-1.5">
    <span className="capitalize text-[#8A9099]">{label}</span>
    <span className="tabular-nums text-[#E8EAED]">{value}</span>
  </div>
);
