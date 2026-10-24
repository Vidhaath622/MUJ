import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, GitCompareArrows } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { TopBarControls } from '../shell/AppShell';
import { AMBER, PASS, pct, RED, tint } from '../lab/verdict';
import {
  CompareResult,
  errorText,
  getCompare,
  listProfiles,
  NotAvailable,
  RagProfile,
  startCompare,
} from '../shared/apiExtra';
import { failureLabel } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, fmtNum, LoadState, Metric, PACK_LABEL, PACKS, Panel, PrimaryButton } from '../shared/ui';

interface ComparePageProps {
  token: string | null;
}

/** Runs two RAG versions on the same questions and says whether the difference is real. */
export const ComparePage: React.FC<ComparePageProps> = ({ token }) => {
  const [profiles, setProfiles] = useState<RagProfile[] | null>(null);
  const [profilesErr, setProfilesErr] = useState<unknown>(null);
  const [base, setBase] = useState('');
  const [candidate, setCandidate] = useState('');
  const [packs, setPacks] = useState<string[]>(PACKS.map((p) => p.id));
  const [result, setResult] = useState<CompareResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;
    listProfiles(token)
      .then((ps) => {
        setProfiles(ps);
        setBase(ps[0]?.id ?? '');
        setCandidate(ps[1]?.id ?? ps[0]?.id ?? '');
      })
      .catch(setProfilesErr);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [token]);

  // Follows an async comparison until it finishes, updating the page as it goes.
  const follow = (id: string) => {
    if (!token) return;
    setRunning(true);
    const tick = async () => {
      try {
        const r = await getCompare(id, token);
        setResult(r);
        if (r.status === 'running') {
          timer.current = window.setTimeout(tick, 2000);
          return;
        }
      } catch (err) {
        setError(errorText(err));
      }
      setRunning(false);
    };
    timer.current = window.setTimeout(tick, 2000);
  };

  // Show the latest comparison on arrival, so a finished result survives a page change.
  useEffect(() => {
    if (!token) return;
    getCompare('latest', token)
      .then((r) => {
        if (!r || r.status === 'none' || !r.compare_id) return;
        setResult(r);
        if (r.status === 'running') follow(r.compare_id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const run = async () => {
    if (!token || !base || !candidate) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const first = await startCompare(base, candidate, packs, token);
      setResult(first);
      if (first.status === 'running' && first.compare_id) {
        follow(first.compare_id);
        return;
      }
    } catch (err) {
      if (err instanceof NotAvailable) setProfilesErr(err);
      else setError(errorText(err));
    }
    setRunning(false);
  };

  const finished = result && result.status !== 'running';
  const flips = result?.flips ?? [];
  const regressions = flips.filter((f) => f.direction === 'pass_to_fail');
  const fixes = flips.filter((f) => f.direction === 'fail_to_pass');

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <PrimaryButton onClick={run} busy={running} disabled={!token || !base || !candidate || base === candidate || !packs.length}>
          {!running && <GitCompareArrows className="h-3.5 w-3.5" />}
          Compare on the same questions
        </PrimaryButton>
      </TopBarControls>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {!profiles ? (
        <Panel title="RAG versions">
          <LoadState loading={!profilesErr} error={profilesErr} what="RAG versions" />
        </Panel>
      ) : (
        <section className="lab-panel rounded-2xl p-5">
          <div className="flex flex-wrap items-stretch gap-4">
            <ProfilePicker label="Base version" value={base} onChange={setBase} profiles={profiles} />
            <div className="flex items-center text-[#5A5F67]">
              <ArrowRight className="h-5 w-5" />
            </div>
            <ProfilePicker label="Candidate version" value={candidate} onChange={setCandidate} profiles={profiles} />
            <div className="ml-auto min-w-[220px]">
              <div className="text-xs text-[#8A9099]">Question sets</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PACKS.map((p) => {
                  const on = packs.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPacks((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                      aria-pressed={on}
                      className={cn(
                        'h-8 rounded-lg border px-3 text-[13px] transition-colors',
                        on ? 'border-[#3A3E45] bg-[#1C1F24] text-white' : 'border-[#1F2228] text-[#8A9099] hover:text-[#E8EAED]'
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {base === candidate && base && <p className="mt-3 text-xs text-[#F5A524]">Pick two different versions.</p>}
        </section>
      )}

      {running && !finished && (
        <Panel title="Running both versions…">
          <div className="text-[13px] text-[#8A9099]">
            {result?.progress
              ? `${result.progress.done ?? 0} / ${result.progress.total ?? '—'} questions scored`
              : 'Scoring every selected question under both versions.'}
          </div>
          {result?.progress?.total ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#16181C]">
              <div
                className="h-full rounded-full bg-[#F4F5F6] transition-[width] duration-700"
                style={{ width: `${((result.progress.done ?? 0) / result.progress.total) * 100}%` }}
              />
            </div>
          ) : null}
        </Panel>
      )}

      {!running && !result && profiles && (
        <EmptyState title="No comparison yet">
          Pick a base and a candidate version, then compare them on the same questions. Questions that flip are
          listed, and a significance test says whether the change is real.
        </EmptyState>
      )}

      {finished && (
        <>
          <Verdict r={result!} regressions={regressions.length} fixes={fixes.length} />
          <Panel title="Questions that changed" note={`${flips.length} of ${result!.n ?? '—'} flipped`} bodyClassName="p-0">
            {flips.length === 0 ? (
              <EmptyState className="m-5" title="No question changed outcome" />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#17191D] text-left text-xs text-[#8A9099]">
                    <th className="px-5 py-2.5 font-normal">Question</th>
                    <th className="px-3 py-2.5 font-normal">Set</th>
                    <th className="px-3 py-2.5 font-normal">Base</th>
                    <th className="px-3 py-2.5 font-normal">Candidate</th>
                    <th className="px-5 py-2.5 text-right font-normal">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[...regressions, ...fixes].map((f) => {
                    const bad = f.direction === 'pass_to_fail';
                    const color = bad ? RED : PASS;
                    return (
                      <tr key={`${f.test_id}-${f.direction}`} className="border-b border-[#14161A] last:border-0">
                        <td className="max-w-[460px] px-5 py-3">
                          <div className="truncate text-[#E8EAED]">{f.question ?? f.test_id}</div>
                          <div className="font-mono text-[11px] text-[#6F757E]">{f.test_id}</div>
                        </td>
                        <td className="px-3 py-3 text-[#8A9099]">{PACK_LABEL[f.pack_id ?? ''] ?? f.pack_id ?? '—'}</td>
                        <td className="px-3 py-3 text-[#C9CDD3]">{f.base_verdict ? failureLabel(f.base_verdict) : '—'}</td>
                        <td className="px-3 py-3 text-[#C9CDD3]">{f.candidate_verdict ? failureLabel(f.candidate_verdict) : '—'}</td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className="rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{ background: tint(color, 0.12), color }}
                          >
                            {bad ? 'Pass → fail' : 'Fail → pass'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};

const ProfilePicker: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  profiles: RagProfile[];
}> = ({ label, value, onChange, profiles }) => {
  const p = profiles.find((x) => x.id === value);
  return (
    <label className="block min-w-[240px] flex-1">
      <span className="text-xs text-[#8A9099]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-9 w-full rounded-[9px] border border-[#22252B] bg-[#08090B] px-3 text-[13px] text-[#E8EAED] focus:border-[#3A3E45] focus:outline-none"
      >
        {profiles.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name ?? x.id}
          </option>
        ))}
      </select>
      <span className="mt-1.5 block truncate text-xs text-[#8A9099]">
        {p?.description ??
          (p?.params
            ? Object.entries(p.params)
                .map(([k, v]) => `${k} ${String(v)}`)
                .join(' · ')
            : '')}
      </span>
    </label>
  );
};

/** The headline: is the candidate meaningfully worse, better, or no different? */
const Verdict: React.FC<{ r: CompareResult; regressions: number; fixes: number }> = ({ r, regressions, fixes }) => {
  const delta = r.accuracy_delta ?? null;
  const meaningful = !!r.meaningful;
  const worse = meaningful && delta != null && delta < 0;
  const better = meaningful && delta != null && delta > 0;
  const color = worse ? RED : better ? PASS : AMBER;
  const headline = r.verdict ?? (worse ? 'Meaningful regression' : better ? 'Meaningful improvement' : 'No meaningful difference');
  return (
    <section
      className="lab-fade-up rounded-2xl border p-6"
      style={{ borderColor: tint(color, 0.3), background: `linear-gradient(180deg, ${tint(color, 0.06)}, ${tint(color, 0.015)}), #0D0E11` }}
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-xs" style={{ color }}>
            {r.base ?? 'base'} → {r.candidate ?? 'candidate'}
          </div>
          <div className="mt-1.5 text-[36px] font-semibold leading-none tracking-[-0.035em]" style={{ color }}>
            {headline}
          </div>
          <p className="mt-3 max-w-[56ch] text-[13px] leading-relaxed text-[#B4B9C0]">
            {regressions} question{regressions === 1 ? '' : 's'} went from pass to fail and {fixes} from fail to pass.{' '}
            {meaningful
              ? 'The change is larger than chance would explain on this many questions.'
              : 'The difference is within what chance alone produces on this many questions.'}
          </p>
        </div>
        <div className="flex gap-8">
          <Metric label="Base accurate" value={pct(r.base_pass_rate)} />
          <Metric label="Candidate accurate" value={pct(r.candidate_pass_rate)} />
          <Metric
            label="Change"
            value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pts`}
            sub={r.ci ? `95% CI ${(r.ci[0] * 100).toFixed(1)} to ${(r.ci[1] * 100).toFixed(1)}` : undefined}
            color={color}
          />
          <Metric label="McNemar p" value={fmtNum(r.mcnemar_p, 3)} sub={meaningful ? 'significant' : 'not significant'} />
        </div>
      </div>
    </section>
  );
};
