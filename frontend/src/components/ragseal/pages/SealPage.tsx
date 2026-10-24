import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Agreement, getAgreement, getRun, listRuns, RunListItem, RunSummary } from '../shared/apiExtra';
import { LoadState } from '../shared/ui';
import { TopBarControls } from '../shell/AppShell';

// The Seal: a certificate for one bot, built from its latest finished pack run, plus a badge
// snippet a team could paste into a README. Every figure comes from the backend.

const BOT: Record<string, { name: string; role: string }> = {
  banking: { name: 'Harbor Ridge Bank', role: 'Fees & accounts assistant' },
  recruitment: { name: 'Northwind Talent', role: 'HR policy assistant' },
  healthcare: { name: 'Mercy Vale General Hospital', role: 'Patient help desk' },
  realworld: { name: 'Public tax guidance', role: 'Answers from IRS news releases' },
};

const PACK_NAME: Record<string, string> = {
  banking: 'Banking',
  recruitment: 'Recruitment',
  healthcare: 'Healthcare',
  realworld: 'Real documents',
};

/** Human agreement below this many double-labelled answers is shown as pending. */
const MIN_AGREEMENT_N = 20;

type Grade = { word: string; tone: '--ok' | '--retr' | '--gen' };

function grade(passRate: number): Grade {
  if (passRate >= 0.85) return { word: 'Sealed', tone: '--ok' };
  if (passRate >= 0.7) return { word: 'Conditional', tone: '--retr' };
  return { word: 'Not sealed', tone: '--gen' };
}

const tint = (v: string, pct: number) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;

export const SealPage: React.FC<{ token: string | null }> = ({ token }) => {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [pack, setPack] = useState<string>('banking');
  const [run, setRun] = useState<RunSummary | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    listRuns(token)
      .then((r) => setRuns(r.filter((x) => (x.status ?? 'done') === 'done' && x.pack_id)))
      .catch(setError);
  }, [token]);

  const packs = useMemo(() => {
    // Only bot packs get a seal; injection and other internal runs are left out.
    const have = new Set((runs ?? []).map((r) => r.pack_id as string));
    return Object.keys(BOT).filter((id) => have.has(id));
  }, [runs]);

  useEffect(() => {
    if (!token || !runs) return;
    const candidates = runs.filter((r) => r.pack_id === pack).sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRun(null);
    setAgreement(null);
    if (!candidates.length) return;
    let cancelled = false;
    (async () => {
      // The seal certifies the baseline bot, so skip comparison runs of other profiles (v2…).
      for (const c of candidates.slice(0, 4)) {
        const d = (await getRun(c.batch_id, token)) as RunSummary & { profile?: string };
        if (!('aggregates' in d || 'results' in d)) continue;
        if (d.profile && d.profile !== 'v1') continue;
        if (!cancelled) setRun(d);
        return;
      }
    })().catch((e) => !cancelled && setError(e));
    getAgreement(token, pack)
      .then((a) => !cancelled && setAgreement(a))
      .catch(() => !cancelled && setAgreement(null));
    return () => {
      cancelled = true;
    };
  }, [token, runs, pack]);

  const passRate = run?.aggregates?.pass_rate ?? null;
  const b = run?.root_cause_breakdown ?? {};
  const ft = ((run as unknown as { failure_type_breakdown?: Record<string, number> } | null)?.failure_type_breakdown ?? {}) as Record<string, number>;
  const retrieverFaults = (b.RETRIEVAL_FAILURE ?? 0) + (b.COMPOUND_FAILURE ?? 0);
  const generatorFaults = (b.GENERATION_HALLUCINATION ?? 0) + (b.COMPOUND_FAILURE ?? 0);
  const stale = ft.STALE_SOURCE ?? null;
  const pvc = agreement?.pipeline_vs_consensus;
  const agreementShown = pvc?.agreement != null && (pvc.n ?? 0) >= MIN_AGREEMENT_N;
  const date = (run?.created_at ?? '').slice(0, 10);
  const g = passRate != null ? grade(passRate) : null;
  const bot = BOT[pack] ?? { name: PACK_NAME[pack] ?? pack, role: '' };

  const copyBadge = async () => {
    if (passRate == null) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || 'black';
    const paper = css.getPropertyValue('--paper').trim() || 'white';
    const tone = css.getPropertyValue(g?.tone ?? '--ok').trim() || ink;
    const svg = badgeSvg(`RAGSeal verified · ${Math.round(passRate * 100)}% · ${date}`, ink, paper, tone);
    try {
      await navigator.clipboard.writeText(svg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = svg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ border: '1px solid var(--rule)' }}>
          {packs.map((p) => (
            <button
              key={p}
              onClick={() => setPack(p)}
              className="rounded-md px-3 py-1 text-[13px] transition-colors"
              style={p === pack ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-2)' }}
            >
              {PACK_NAME[p] ?? p}
            </button>
          ))}
        </div>
      </TopBarControls>

      {!run ? (
        <LoadState loading={!error} error={error} what="the latest run" />
      ) : (
        <>
          {/* The certificate */}
          <article
            className="relative overflow-hidden rounded-[22px] px-10 py-9"
            style={{ background: 'var(--panel)', border: '1px solid var(--rule)', boxShadow: `inset 0 0 0 10px var(--panel), inset 0 0 0 11px var(--rule)` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-8">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--ink-2)' }}>
                  Certificate of evaluation · {run.batch_id}
                </div>
                <h2 className="mt-3 text-[40px] leading-[1.05]" style={{ color: 'var(--ink)' }}>
                  {bot.name}
                </h2>
                <div className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
                  {bot.role} · {PACK_NAME[pack] ?? pack} pack · evaluated {date}
                </div>
                <p className="mt-5 max-w-[520px] text-[14px] leading-relaxed" style={{ color: 'var(--ink-1, var(--ink))' }}>
                  RAGSeal asked this bot {run.total_evaluated} questions with known answers, including outdated-version, look-alike and
                  not-in-the-documents traps, and checked its retriever and its generator separately.
                </p>
              </div>
              <SealEmblem passRate={passRate ?? 0} grade={g!} />
            </div>

            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl md:grid-cols-5" style={{ background: 'var(--rule)', border: '1px solid var(--rule)' }}>
              <Stat label="Answered correctly" value={passRate != null ? `${Math.round(passRate * 100)}%` : '—'} sub={`of ${run.total_evaluated}`} tone={g?.tone} />
              <Stat label="Retriever at fault" value={String(retrieverFaults)} sub="wrong or outdated text" tone="--retr" />
              <Stat label="Generator at fault" value={String(generatorFaults)} sub="made up or misread" tone="--gen" />
              <Stat label="Stale-source risk" value={stale != null ? String(stale) : '—'} sub="quoted an old version" tone="--retr" />
              <Stat
                label="Agrees with humans"
                value={agreementShown ? `${Math.round((pvc!.agreement as number) * 100)}%` : 'pending'}
                sub={agreementShown ? `on ${pvc!.n} double-labelled` : `${pvc?.n ?? 0} of ${MIN_AGREEMENT_N} labelled so far`}
                tone={agreementShown ? '--ok' : '--review'}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[12px]" style={{ color: 'var(--ink-2)' }}>
              <span>
                Bot <span className="font-mono">{run.generator_model ?? '—'}</span> · graded by <span className="font-mono">{(run.judge_model ?? '—').split('/').pop()}</span>
              </span>
              <span className="font-mono">ragseal · AI-04</span>
            </div>
          </article>

          {/* Badge */}
          <section className="flex flex-wrap items-center gap-4 rounded-2xl px-6 py-5" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>
                Embeddable badge
              </div>
              <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                Paste into a README or status page. It states the pass rate and the date of this run, nothing more.
              </div>
            </div>
            <BadgePreview text={`RAGSeal verified · ${passRate != null ? Math.round(passRate * 100) : '—'}% · ${date}`} tone={g?.tone ?? '--ok'} />
            <button
              onClick={copyBadge}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy badge'}
            </button>
          </section>
        </>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub: string; tone?: string }> = ({ label, value, sub, tone }) => (
  <div className="flex flex-col gap-1 px-4 py-4" style={{ background: 'var(--panel)' }}>
    <span className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
      {label}
    </span>
    <span className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: tone ? `var(${tone})` : 'var(--ink)' }}>
      {value}
    </span>
    <span className="text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
      {sub}
    </span>
  </div>
);

/** Round wax-seal style emblem: text on a circular path around the pass rate. */
const SealEmblem: React.FC<{ passRate: number; grade: Grade }> = ({ passRate, grade: g }) => {
  const color = `var(${g.tone})`;
  return (
    <div className="relative shrink-0" style={{ transform: 'rotate(-6deg)' }}>
      <svg width="196" height="196" viewBox="0 0 200 200" role="img" aria-label={`${g.word}, ${Math.round(passRate * 100)} percent correct`}>
        <defs>
          <path id="seal-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" />
        </defs>
        <circle cx="100" cy="100" r="96" fill={tint(g.tone, 8)} stroke={color} strokeWidth="2" />
        <circle cx="100" cy="100" r="88" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 4" />
        <circle cx="100" cy="100" r="60" fill="none" stroke={color} strokeWidth="2" />
        <text fontSize="12" fill={color} fontFamily="ui-monospace, monospace" fontWeight="700" textLength={2 * Math.PI * 74 - 8} lengthAdjust="spacing">
          <textPath href="#seal-ring" textLength={2 * Math.PI * 74 - 8} lengthAdjust="spacing">
            RAGSEAL · RETRIEVER + GENERATOR · TESTED APART ·
          </textPath>
        </text>
        <text x="100" y="98" textAnchor="middle" fontSize="34" fontWeight="700" fill={color} fontFamily="ui-sans-serif, system-ui">
          {Math.round(passRate * 100)}%
        </text>
        <text x="100" y="120" textAnchor="middle" fontSize="12" letterSpacing="2" fill={color} fontFamily="ui-monospace, monospace" fontWeight="700">
          {g.word.toUpperCase()}
        </text>
      </svg>
    </div>
  );
};

const BadgePreview: React.FC<{ text: string; tone: string }> = ({ text, tone }) => (
  <span className="inline-flex items-center overflow-hidden rounded-md font-mono text-[12px]" style={{ border: `1px solid var(${tone})` }}>
    <span className="px-2 py-1" style={{ background: `var(${tone})`, color: 'var(--paper)' }}>
      ✓
    </span>
    <span className="px-2.5 py-1" style={{ color: 'var(--ink)', background: 'var(--paper)' }}>
      {text}
    </span>
  </span>
);

/** Self-contained SVG badge; colours are resolved from the live theme so the snippet stands alone. */
function badgeSvg(text: string, ink: string, paper: string, tone: string): string {
  const w = Math.round(28 + text.length * 7.2 + 16);
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" role="img" aria-label="${esc}">`,
    `<rect width="${w}" height="24" rx="5" fill="${paper}" stroke="${tone}"/>`,
    `<rect width="24" height="24" rx="5" fill="${tone}"/>`,
    `<text x="12" y="16.5" text-anchor="middle" font-family="monospace" font-size="13" fill="${paper}">✓</text>`,
    `<text x="32" y="16.5" font-family="monospace" font-size="12" fill="${ink}">${esc}</text>`,
    `</svg>`,
  ].join('');
}
