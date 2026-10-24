import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Radar } from 'lucide-react';
import { fetchDocuments, loadPackBackend } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import { CaseDrawer } from '../shared/CaseDrawer';
import { errorText, getImpact, ImpactChange, ImpactResult, ImpactTest, startImpact } from '../shared/apiExtra';
import { failureLabel } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, fmtTime, LoadState, Panel, PrimaryButton } from '../shared/ui';
import { LabResult } from '../lab/useLabData';
import { tint, verdictStyle } from '../lab/verdict';

// Change impact radar: pick an old and a new version of a document. The backend diffs them,
// writes one test per changed fact and runs the bot with both versions indexed, so we can see
// which answers would still give users the old fact today. Everything shown comes from it.

interface DocOption {
  document_id: string;
  filename: string;
}

interface Source {
  id: string;
  label: string;
}

const SOURCES: Source[] = [
  { id: 'banking', label: 'Banking' },
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'realworld', label: 'Real documents (IRS)' },
  { id: 'uploads', label: 'All my documents' },
];

/** Longest shared filename prefix: pairs fee_schedule_v1.md with fee_schedule_v2.md. */
function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Old = a superseded document, new = the current document whose name matches it best. */
function defaultPair(docs: DocOption[], superseded: string[]): [string, string] | null {
  for (const oldId of superseded) {
    const old = docs.find((d) => d.document_id === oldId);
    if (!old) continue;
    const candidates = docs.filter((d) => !superseded.includes(d.document_id));
    const best = candidates.sort((x, y) => sharedPrefix(y.filename, old.filename) - sharedPrefix(x.filename, old.filename))[0];
    if (best) return [old.document_id, best.document_id];
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A number as the backend reports it ("1500") also matches how prose writes it ("1,500"). */
const valuePattern = (v: string) =>
  /^\d[\d.]*$/.test(v) ? v.split('').map((ch) => (/\d/.test(ch) ? ch : escapeRe(ch))).join(',?') : escapeRe(v);

/** Marks the given numbers inside a sentence: old values struck through, new values highlighted. */
const Marked: React.FC<{ text: string; values: string[]; tone: 'old' | 'new' }> = ({ text, values, tone }) => {
  const wanted = values.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!wanted.length) return <>{text}</>;
  const source = `(?<![\\d.,])(?:${wanted.map(valuePattern).join('|')})(?![\\d])`;
  const color = tone === 'old' ? 'var(--gen)' : 'var(--ok)';
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(source, 'g'))) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <span
        key={at}
        className={cn('rounded px-0.5 font-semibold', tone === 'old' && 'line-through decoration-2')}
        style={{ color, background: tint(color, 0.12) }}
      >
        {m[0]}
      </span>
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};

const RadarDial: React.FC<{ running: boolean; atRisk: number | null; tests: number | null }> = ({ running, atRisk, tests }) => {
  const color = atRisk == null ? 'var(--muted)' : atRisk > 0 ? 'var(--gen)' : 'var(--ok)';
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
        {[54, 38, 22].map((r) => (
          <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="var(--rule)" strokeWidth="1" />
        ))}
        <line x1="6" y1="60" x2="114" y2="60" stroke="var(--rule)" strokeWidth="1" />
        <line x1="60" y1="6" x2="60" y2="114" stroke="var(--rule)" strokeWidth="1" />
        {running && (
          <g className="radar-sweep">
            <path d="M60 60 L60 6 A54 54 0 0 1 106.8 33 Z" fill={tint('var(--accent)', 0.22)} />
            <line x1="60" y1="60" x2="60" y2="6" stroke="var(--accent)" strokeWidth="1.5" />
          </g>
        )}
        {!running && atRisk != null && atRisk > 0 && (
          <>
            <circle cx="82" cy="38" r="5" fill="var(--gen)" className="radar-ping" />
            <circle cx="82" cy="38" r="3.5" fill="var(--gen)" />
          </>
        )}
      </svg>
      {!running && atRisk != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[30px] font-semibold leading-none tabular-nums" style={{ color }}>
            {atRisk}
          </span>
          <span className="mt-0.5 text-[11px] text-[var(--ink-2)]">of {tests ?? 0} at risk</span>
        </div>
      )}
    </div>
  );
};

export const ImpactPage: React.FC<{ token: string | null }> = ({ token }) => {
  const [source, setSource] = useState('banking');
  const [docs, setDocs] = useState<DocOption[] | null>(null);
  const [docsError, setDocsError] = useState<unknown>(null);
  const [oldId, setOldId] = useState('');
  const [newId, setNewId] = useState('');
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState<ImpactTest | null>(null);
  const filenamesRef = useRef<Record<string, string>>({});

  // Documents for the chosen pack (or every document the user has), with the superseded pair preselected.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setDocs(null);
    setDocsError(null);
    (async () => {
      try {
        let list: DocOption[];
        let superseded: string[] = [];
        if (source === 'uploads') {
          list = (await fetchDocuments(token)).map((d) => ({ document_id: d.document_id, filename: d.filename }));
        } else {
          const pack = await loadPackBackend(source, token);
          list = (pack.documents ?? []).map((d: DocOption) => ({ document_id: d.document_id, filename: d.filename }));
          superseded = pack.superseded_document_ids ?? [];
        }
        if (cancelled) return;
        list.forEach((d) => (filenamesRef.current[d.document_id] = d.filename));
        setDocs(list);
        const pair = defaultPair(list, superseded);
        setOldId(pair?.[0] ?? list[0]?.document_id ?? '');
        setNewId(pair?.[1] ?? list[1]?.document_id ?? '');
      } catch (err) {
        if (!cancelled) setDocsError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, token]);

  // Show the latest impact run on arrival, if there is one.
  useEffect(() => {
    if (!token) return;
    getImpact('latest', token)
      .then((r) => setResult(r.status === 'none' ? null : r))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoadingLatest(false));
  }, [token]);

  // Poll while a run is in progress.
  const running = result?.status === 'running';
  useEffect(() => {
    if (!token || !running || !result?.impact_id) return;
    const id = window.setInterval(async () => {
      try {
        setResult(await getImpact(result.impact_id!, token));
      } catch (err) {
        setError(errorText(err));
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [token, running, result?.impact_id]);

  const run = useCallback(async () => {
    if (!token || !oldId || !newId) return;
    setStarting(true);
    setError(null);
    try {
      const started = await startImpact(oldId, newId, token);
      setResult({ ...started, status: 'running' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  }, [token, oldId, newId]);

  const done = result?.status === 'done';
  const changes = useMemo(() => (result?.changes ?? []).filter((c) => c.kind === 'changed' || c.numbers_changed?.length), [result]);
  const otherChanges = (result?.changes ?? []).length - changes.length;
  const tests = result?.tests ?? [];
  const atRisk = done ? result?.at_risk ?? result?.summary?.at_risk ?? tests.filter((t) => t.at_risk).length : null;
  if (result?.old_document) filenamesRef.current[result.old_document.document_id] = result.old_document.filename;
  if (result?.new_document) filenamesRef.current[result.new_document.document_id] = result.new_document.filename;

  if (!token) return <LoadState error={null} loading what="your session" className="m-6" />;

  return (
    <div className="space-y-5 px-6 py-5">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <section className="lab-panel flex flex-wrap items-center gap-6 rounded-2xl p-5">
        <RadarDial running={running || starting} atRisk={atRisk} tests={done ? tests.length : null} />
        <div className="min-w-[260px] flex-1">
          {done && atRisk != null ? (
            <>
              <h2 className="font-serif text-[28px] leading-tight text-[var(--ink)]">
                {atRisk > 0 ? (
                  <>
                    <span style={{ color: 'var(--gen)' }}>{atRisk} {atRisk === 1 ? 'answer' : 'answers'} at risk:</span> users would
                    get the old fact today
                  </>
                ) : (
                  <span style={{ color: 'var(--ok)' }}>No answers at risk: the bot already gives the new facts</span>
                )}
              </h2>
              <p className="mt-1.5 text-[13px] text-[var(--ink-2)]">
                <span className="font-mono">{result?.old_document?.filename}</span>
                <ArrowRight className="mx-1.5 inline h-3.5 w-3.5" />
                <span className="font-mono">{result?.new_document?.filename}</span> · {result?.summary?.changed ?? changes.length}{' '}
                changed facts, {tests.length} tested · {fmtTime(result?.created_at)}
              </p>
            </>
          ) : running ? (
            <>
              <h2 className="font-serif text-[26px] leading-tight text-[var(--ink)]">Scanning the update…</h2>
              <p className="mt-1.5 text-[13px] text-[var(--ink-2)]">
                Comparing the two versions, writing a test for each changed fact and asking the bot.{' '}
                {result?.progress?.total ? `${result.progress.done ?? 0} of ${result.progress.total} tests done.` : ''}
              </p>
            </>
          ) : result?.status === 'failed' ? (
            <h2 className="font-serif text-[24px] text-[var(--gen)]">The last impact run failed: {result.error}</h2>
          ) : (
            <>
              <h2 className="font-serif text-[26px] leading-tight text-[var(--ink)]">What does a document update break?</h2>
              <p className="mt-1.5 max-w-xl text-[13px] text-[var(--ink-2)]">
                When a policy changes, the bot can keep quoting the old version. Pick the old and the new file and RAGSeal shows
                which answers still give the old fact, before your users find out.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-2)]">
            Documents from
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-[34px] rounded-[9px] border border-[var(--rule-2)] bg-[var(--panel)] px-2 text-[13px] text-[var(--ink)]"
            >
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <DocSelect label="Old version" value={oldId} onChange={setOldId} docs={docs} />
          <DocSelect label="New version" value={newId} onChange={setNewId} docs={docs} />
          <PrimaryButton onClick={run} busy={starting} disabled={running || !oldId || !newId || oldId === newId}>
            <Radar className="h-3.5 w-3.5" /> {running ? 'Scanning…' : 'Scan the update'}
          </PrimaryButton>
        </div>
      </section>
      {docsError ? <LoadState error={docsError} what="documents" /> : null}

      {loadingLatest ? (
        <LoadState error={null} loading what="the latest impact scan" />
      ) : !result ? (
        <EmptyState title="No update scanned yet" icon={<Radar className="h-5 w-5" />}>
          Try Banking (fee schedule v1 → v2) or the real IRS releases (2025 → 2026 mileage rates).
        </EmptyState>
      ) : done ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
          <Panel title="What changed" note={otherChanges > 0 ? `${otherChanges} added or removed sentences not shown` : undefined} bodyClassName="p-0">
            <ol className="divide-y divide-[var(--rule)]">
              {changes.map((c, i) => (
                <ChangeRow key={i} change={c} />
              ))}
              {!changes.length && <li className="px-5 py-4 text-[13px] text-[var(--ink-2)]">No changed sentences found.</li>}
            </ol>
          </Panel>
          <Panel title="Would users get the old fact?" note={result.judge_model ? `graded by ${result.judge_model}` : undefined} bodyClassName="p-0">
            <ol className="divide-y divide-[var(--rule)]">
              {tests.map((t) => (
                <TestRow key={t.test_id} test={t} onOpen={() => setOpen(t)} />
              ))}
              {!tests.length && <li className="px-5 py-4 text-[13px] text-[var(--ink-2)]">No tests were generated.</li>}
            </ol>
          </Panel>
        </div>
      ) : null}

      <CaseDrawer
        result={(open?.evaluation as LabResult | undefined) ?? null}
        testId={open?.test_id}
        caseType="stale"
        filenames={filenamesRef.current}
        onClose={() => setOpen(null)}
      />
    </div>
  );
};

const DocSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; docs: DocOption[] | null }> = ({
  label,
  value,
  onChange,
  docs,
}) => (
  <label className="flex flex-col gap-1 text-xs text-[var(--ink-2)]">
    {label}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!docs}
      className="h-[34px] max-w-[260px] rounded-[9px] border border-[var(--rule-2)] bg-[var(--panel)] px-2 font-mono text-[12px] text-[var(--ink)]"
    >
      {(docs ?? []).map((d) => (
        <option key={d.document_id} value={d.document_id}>
          {d.filename}
        </option>
      ))}
    </select>
  </label>
);

const ChangeRow: React.FC<{ change: ImpactChange }> = ({ change }) => {
  const nums = change.numbers_changed ?? [];
  return (
    <li className="space-y-1.5 px-5 py-3.5 text-[13px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[var(--ink-2)]">
        <span>{change.kind}</span>
        {nums.map((n, i) => (
          <span key={i} className="rounded-full border border-[var(--rule)] px-2 py-0.5 font-mono normal-case tracking-normal">
            {n.old ? (
              <>
                <span className="line-through" style={{ color: 'var(--gen)' }}>{n.old}</span> →{' '}
              </>
            ) : (
              '+ '
            )}
            {n.new ? <span style={{ color: 'var(--ok)' }}>{n.new}</span> : <span style={{ color: 'var(--gen)' }}>removed</span>}
          </span>
        ))}
        {change.tested && <span className="normal-case tracking-normal text-[var(--accent)]">· tested</span>}
      </div>
      {change.old && (
        <p className="text-[var(--ink-2)]">
          <span className="mr-1.5 font-mono text-[11px] text-[var(--muted)]">old</span>
          <Marked text={change.old} values={nums.map((n) => n.old)} tone="old" />
        </p>
      )}
      {change.new && (
        <p className="text-[var(--ink)]">
          <span className="mr-1.5 font-mono text-[11px] text-[var(--muted)]">new</span>
          <Marked text={change.new} values={nums.map((n) => n.new)} tone="new" />
        </p>
      )}
    </li>
  );
};

const TestRow: React.FC<{ test: ImpactTest; onOpen: () => void }> = ({ test, onOpen }) => {
  const v = verdictStyle(test.verdict);
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[var(--panel-2)]">
        <div className="min-w-0 flex-1 space-y-1 text-[13px] leading-relaxed">
          <div className="font-medium text-[var(--ink)]">{test.question}</div>
          <div className="text-[var(--ink-2)]">
            <span className="text-[var(--muted)]">Expected:</span> {test.expected_answer ?? test.gold}
          </div>
          <div className="text-[var(--ink-1)]">
            <span className="text-[var(--muted)]">Bot said:</span> {test.answer || '—'}
          </div>
          {test.failure_type && test.failure_type !== 'CLEAN_PASS' && (
            <div className="text-xs text-[var(--ink-2)]">{failureLabel(test.failure_type)}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={
              test.at_risk
                ? { color: 'var(--gen)', background: tint('var(--gen)', 0.12) }
                : { color: 'var(--ok)', background: tint('var(--ok)', 0.12) }
            }
          >
            {test.at_risk ? 'At risk' : 'Up to date'}
          </span>
          <span className="stamp text-[12px] leading-none" style={{ color: v.color }}>
            {v.label}
          </span>
        </div>
      </button>
    </li>
  );
};
