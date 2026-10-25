import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Info, Play, SlidersHorizontal, Trophy } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { AMBER, PASS, tint } from '../lab/verdict';
import {
  ChunkingLabResult,
  ChunkingLabRow,
  errorText,
  getChunkingLab,
  listPacks,
  PackInfo,
  startChunkingLab,
} from '../shared/apiExtra';
import { ALL_PACKS, ErrorBanner, fmtDuration, fmtTime, Panel, PrimaryButton } from '../shared/ui';

/**
 * Chunking lab (R2): run one pack's questions through several chunk sizes and search setups and
 * see which one finds the gold passages most often. Retrieval only: no chatbot or grading calls,
 * unless reranking is switched on (that uses the grading model).
 */

const POLL_MS = 1500;
const SIZE_CHOICES = [300, 500, 700, 1000, 1200, 2000];
const MAX_SIZES = 5;
// Today's engine defaults; the row that matches them is marked "current".
const CURRENT = { chunk_chars: 700, mode: 'dense', rerank: false, overlap: 0 };
const STORE_KEY = 'ragseal.chunkingLab';

type Mode = 'dense' | 'hybrid';

const MODE_NAME: Record<Mode, string> = { dense: 'Meaning search', hybrid: 'Hybrid' };

interface LabForm {
  pack_id: string;
  sizes: number[];
  modes: Mode[];
  rerank: boolean;
  k: number;
  overlap: number;
}

const DEFAULT_FORM: LabForm = { pack_id: 'banking', sizes: [300, 700, 1200], modes: ['dense', 'hybrid'], rerank: false, k: 4, overlap: 0 };

function loadForm(): LabForm {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved) return { ...DEFAULT_FORM, ...saved };
  } catch {
    // storage unavailable or corrupt: defaults
  }
  return DEFAULT_FORM;
}

/** Real numbers from the synthetic_public pack (9 public documents, 129 questions), shown before a first run. */
const EXAMPLE: { label: string; recall: number; mrr: number; tag?: 'current' | 'best' }[] = [
  { label: 'Hybrid · 1200 chars · rerank', recall: 1.0, mrr: 0.891, tag: 'best' },
  { label: 'Hybrid · 1200 chars', recall: 0.984, mrr: 0.775 },
  { label: 'Hybrid · 700 chars', recall: 0.961, mrr: 0.782 },
  { label: 'Meaning search · 700 chars', recall: 0.93, mrr: 0.748, tag: 'current' },
];

function rowLabel(r: ChunkingLabRow): string {
  const parts = [MODE_NAME[r.mode] ?? r.mode, `${r.chunk_chars} chars`];
  if (r.rerank) parts.push('rerank');
  if (r.overlap) parts.push(`${r.overlap} overlap`);
  return parts.join(' · ');
}

// Labs from before the backend flagged today's row fall back to matching the defaults.
const isCurrent = (r: ChunkingLabRow) =>
  r.is_today ??
  (r.chunk_chars === CURRENT.chunk_chars && r.mode === CURRENT.mode && r.rerank === CURRENT.rerank && (r.overlap ?? 0) === CURRENT.overlap);

const sameRow = (a?: ChunkingLabRow, b?: ChunkingLabRow) =>
  !!a && !!b && a.chunk_chars === b.chunk_chars && a.mode === b.mode && a.rerank === b.rerank && (a.overlap ?? 0) === (b.overlap ?? 0);

const pct1 = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

// Retrieval alone is milliseconds; fmtDuration would round it to "0s".
const perQuestion = (ms: number) => (ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : fmtDuration(ms));

interface ChunkingLabPageProps {
  token: string | null;
}

export const ChunkingLabPage: React.FC<ChunkingLabPageProps> = ({ token }) => {
  const [form, setForm] = useState<LabForm>(loadForm);
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [lab, setLab] = useState<ChunkingLabResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(form));
    } catch {
      // storage unavailable: the form just doesn't survive a refresh
    }
  }, [form]);

  // Every pack the backend has, so the new real-world packs can be tuned too.
  useEffect(() => {
    if (!token) return;
    listPacks(token)
      .then((p) => alive.current && setPacks(p))
      .catch(() => alive.current && setPacks(ALL_PACKS.map((p) => ({ pack_id: p.id, name: p.label }))));
  }, [token]);

  const poll = (labId: string) => {
    if (!token) return;
    const tick = async () => {
      if (!alive.current) return;
      try {
        const res = await getChunkingLab(labId, token);
        if (!alive.current) return;
        setLab(res);
        if (res.status === 'running') setTimeout(tick, POLL_MS);
        else if (res.status === 'failed') setError(res.error ?? 'The lab failed.');
      } catch (err) {
        if (alive.current) setError(errorText(err));
      }
    };
    tick();
  };

  // The latest lab shows straight away; one still running resumes polling.
  useEffect(() => {
    if (!token) return;
    getChunkingLab('latest', token)
      .then((res) => {
        if (!alive.current || res.status === 'none') return;
        setLab(res);
        if (res.status === 'running' && res.lab_id) poll(res.lab_id);
        if (res.status === 'done' && res.pack_id) setForm((f) => ({ ...f, pack_id: res.pack_id! }));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const configs = form.sizes.length * form.modes.length * (form.rerank ? 2 : 1);
  const pack = packs?.find((p) => p.pack_id === form.pack_id);
  const running = lab?.status === 'running';
  const canRun = !!token && form.sizes.length > 0 && form.modes.length > 0 && !running && !starting;

  const run = async () => {
    if (!canRun || !token) return;
    setStarting(true);
    setError(null);
    try {
      const res = await startChunkingLab(
        {
          pack_id: form.pack_id,
          chunk_sizes: [...form.sizes].sort((a, b) => a - b),
          modes: form.modes,
          rerank: form.rerank ? [false, true] : [false],
          k: form.k,
          overlap: form.overlap,
        },
        token
      );
      setLab({ lab_id: res.lab_id, status: 'running', pack_id: form.pack_id, progress: { done: 0, total: res.configs } });
      poll(res.lab_id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  };

  const toggleSize = (s: number) =>
    setForm((f) => {
      if (f.sizes.includes(s)) return { ...f, sizes: f.sizes.filter((x) => x !== s) };
      if (f.sizes.length >= MAX_SIZES) return f;
      return { ...f, sizes: [...f.sizes, s] };
    });

  const toggleMode = (m: Mode) =>
    setForm((f) => ({ ...f, modes: f.modes.includes(m) ? f.modes.filter((x) => x !== m) : [...f.modes, m] }));

  return (
    <div className="mx-auto flex max-w-[77.5rem] 2xl:max-w-[88rem] flex-col gap-5 px-6 py-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="lg:self-start" title="Set up the sweep" note={`${configs} setup${configs === 1 ? '' : 's'}`} bodyClassName="flex flex-col gap-5 p-5">
          <p className="text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
            RAGSeal tunes your bot: try chunk sizes and search modes on the same test questions and see which finds the right text most
            often. Retrieval only, no chatbot or grading cost.
          </p>

          <Field label="Test pack" hint={pack?.test_case_count ? `${pack.test_case_count} questions · ${pack.document_count ?? '?'} documents` : undefined}>
            <select className={INPUT} value={form.pack_id} onChange={(e) => setForm((f) => ({ ...f, pack_id: e.target.value }))}>
              {(packs ?? ALL_PACKS.map((p) => ({ pack_id: p.id, name: p.label }))).map((p) => (
                <option key={p.pack_id} value={p.pack_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Chunk sizes" hint={`Characters per chunk. Pick up to ${MAX_SIZES}. The dot marks 700, what the bot uses today; it is always scored for comparison.`}>
            <div className="grid grid-cols-6 gap-1">
              {SIZE_CHOICES.map((s) => (
                <Chip
                  key={s}
                  compact
                  on={form.sizes.includes(s)}
                  onClick={() => toggleSize(s)}
                  disabled={!form.sizes.includes(s) && form.sizes.length >= MAX_SIZES}
                  title={s === CURRENT.chunk_chars ? `${s} characters: what the bot uses today` : `${s} characters`}
                >
                  {s}
                  {s === CURRENT.chunk_chars && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} />}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Search">
            <div className="flex flex-wrap gap-1.5">
              <Chip on={form.modes.includes('dense')} onClick={() => toggleMode('dense')}>
                Meaning search
              </Chip>
              <Chip on={form.modes.includes('hybrid')} onClick={() => toggleMode('hybrid')}>
                Hybrid: keyword + meaning
              </Chip>
            </div>
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--rule)] px-3.5 py-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--ink)]"
              checked={form.rerank}
              onChange={(e) => setForm((f) => ({ ...f, rerank: e.target.checked }))}
            />
            <span className="text-[0.875rem] leading-relaxed">
              <span className="font-medium text-[var(--ink)]">Also try reranking</span>
              <span className="block text-xs text-[var(--ink-2)]">
                Fetches 20 passages and lets the grading model pick the best {form.k}. Slower: about 2–5 s per question for each chunk size,
                and it uses grading calls.
              </span>
            </span>
          </label>

          <details className="group">
            <summary className="cursor-pointer list-none text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
              <span className="group-open:hidden">Advanced: passages per question and overlap</span>
              <span className="hidden group-open:inline">Hide advanced</span>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Passages per question (k)">
                <input
                  className={INPUT}
                  type="number"
                  min={1}
                  max={10}
                  value={form.k}
                  onChange={(e) => setForm((f) => ({ ...f, k: Math.min(10, Math.max(1, Number(e.target.value) || 4)) }))}
                />
              </Field>
              <Field label="Overlap (chars)">
                <input
                  className={INPUT}
                  type="number"
                  min={0}
                  max={500}
                  step={50}
                  value={form.overlap}
                  onChange={(e) => setForm((f) => ({ ...f, overlap: Math.min(500, Math.max(0, Number(e.target.value) || 0)) }))}
                />
              </Field>
            </div>
          </details>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--ink-2)]">
              {form.rerank ? 'Several minutes on a big pack' : 'About a minute on a big pack'}
            </span>
            <PrimaryButton onClick={run} busy={starting} disabled={!canRun}>
              {!starting && <Play className="h-3.5 w-3.5" />}
              Run the lab
            </PrimaryButton>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          {running ? (
            <Running lab={lab!} packName={packName(packs, lab?.pack_id)} />
          ) : lab?.status === 'done' && lab.rows?.length ? (
            <Results
              lab={lab}
              packName={packName(packs, lab.pack_id)}
              suggestedPack={lab.suggested_pack ? { id: lab.suggested_pack, name: packName(packs, lab.suggested_pack), info: packs?.find((p) => p.pack_id === lab.suggested_pack) } : null}
              onSwitchPack={(id) => setForm((f) => ({ ...f, pack_id: id }))}
            />
          ) : (
            <Example />
          )}
          <MetricHelp k={lab?.k ?? form.k} />
        </div>
      </div>
    </div>
  );
};

function packName(packs: PackInfo[] | null, id?: string): string {
  return packs?.find((p) => p.pack_id === id)?.name ?? ALL_PACKS.find((p) => p.id === id)?.label ?? id ?? '';
}

const Running: React.FC<{ lab: ChunkingLabResult; packName: string }> = ({ lab, packName }) => {
  const done = lab.progress?.done ?? 0;
  const total = lab.progress?.total ?? 0;
  const share = total ? done / total : 0;
  return (
    <Panel title="Running" note={packName}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between text-[0.875rem]">
          <span className="text-[var(--ink)]">
            {done} of {total || '…'} setups tried
          </span>
          {lab.progress?.eta_ms ? <span className="text-xs text-[var(--ink-2)]">about {fmtDuration(lab.progress.eta_ms)} left</span> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-2)]">
          <div className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-500" style={{ width: `${Math.max(4, share * 100)}%` }} />
        </div>
        <p className="text-xs text-[var(--ink-2)]">
          Each setup re-chunks the pack's documents and searches them once per question. Nothing is generated or graded.
        </p>
      </div>
    </Panel>
  );
};

const Results: React.FC<{
  lab: ChunkingLabResult;
  packName: string;
  suggestedPack: { id: string; name: string; info?: PackInfo } | null;
  onSwitchPack: (id: string) => void;
}> = ({ lab, packName, suggestedPack, onSwitchPack }) => {
  const metric = lab.metric ?? `context_recall_at_${lab.k ?? 4}`;
  const recall = (r: ChunkingLabRow) => (typeof r[metric] === 'number' ? (r[metric] as number) : 0);
  const rows = useMemo(
    () => [...(lab.rows ?? [])].sort((a, b) => recall(b) - recall(a) || b.mrr - a.mrr || (a.rerank_calls ?? 0) - (b.rerank_calls ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lab]
  );
  const best = lab.best ?? rows[0];
  const recommended = lab.recommended ?? best;
  const current = rows.find(isCurrent);
  const k = lab.k ?? 4;
  // When every setup ties on recall the bars would all be equal; MRR (how high the right passage ranks) still separates them.
  const recallTies = rows.length > 1 && rows.every((r) => recall(r) === recall(rows[0]));
  const [chart, setChart] = useState<'recall' | 'mrr'>(recallTies ? 'mrr' : 'recall');
  useEffect(() => setChart(recallTies ? 'mrr' : 'recall'), [lab.lab_id, recallTies]);
  const chartRows = chart === 'mrr' ? [...rows].sort((a, b) => b.mrr - a.mrr || recall(b) - recall(a)) : rows;

  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5" /> {packName}
          </span>
        }
        note={`${lab.questions ?? '?'} questions · ${rows.length} setups${lab.created_at ? ` · ${fmtTime(lab.created_at)}` : ''}`}
        bodyClassName="flex flex-col gap-5 p-5"
      >
        {lab.warnings?.length ? <Warnings warnings={lab.warnings} suggested={suggestedPack} onSwitchPack={onSwitchPack} /> : null}
        {lab.recommendation_reason ? (
          <Recommendation recommended={recommended} current={current} notes={lab.recommendation_notes ?? [lab.recommendation_reason]} recall={recall} />
        ) : (
          <Verdict best={best} current={current} recall={recall} />
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--ink-2)]">
            {chart === 'mrr' ? 'MRR: how high the first right passage ranks (1.0 = always first)' : `Recall@${k}: right passages found in the top ${k}`}
          </span>
          <div className="inline-flex rounded-[9px] border border-[var(--rule-2)] p-0.5 text-[0.8125rem]" role="tablist" aria-label="Chart metric">
            {(['recall', 'mrr'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={chart === m}
                onClick={() => setChart(m)}
                className={cn(
                  'rounded-[7px] px-2.5 py-1 transition-colors',
                  chart === m ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                )}
              >
                {m === 'recall' ? `Recall@${k}` : 'MRR'}
              </button>
            ))}
          </div>
        </div>
        <Bars rows={chartRows} best={best} recommended={recommended} value={chart === 'mrr' ? (r) => r.mrr : recall} label={chart === 'mrr' ? 'MRR' : `recall@${k}`} />
        <ApplySnippet row={recommended} />
      </Panel>

      <Panel title="Every setup" note={`recall@${k} = right passages found in the top ${k}`} bodyClassName="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-[0.84375rem]">
          <thead>
            <tr className="border-b border-[var(--rule)] text-left text-[0.78125rem] text-[var(--ink-2)]">
              <th className="px-5 py-2.5 font-medium">Setup</th>
              <th className="px-3 py-2.5 text-right font-medium">Recall@{k}</th>
              <th className="px-3 py-2.5 text-right font-medium">MRR</th>
              <th className="px-3 py-2.5 text-right font-medium">Fully covered</th>
              <th className="px-3 py-2.5 text-right font-medium">Chunks</th>
              <th className="px-3 py-2.5 text-right font-medium">Avg size</th>
              <th className="px-5 py-2.5 text-right font-medium">Per question</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={rowLabel(r)} className="border-b border-[var(--rule)] last:border-0">
                <td className="px-5 py-2.5 text-[var(--ink)]">
                  {rowLabel(r)}
                  {sameRow(r, recommended) && <Tag tone="best">recommended</Tag>}
                  {sameRow(r, best) && !sameRow(best, recommended) && <Tag tone="neutral">best</Tag>}
                  {isCurrent(r) && <Tag tone="current">today</Tag>}
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--ink)]">{pct1(recall(r))}</td>
                <td className="px-3 py-2.5 text-right text-[var(--ink-1)]">{r.mrr.toFixed(3)}</td>
                <td className="px-3 py-2.5 text-right text-[var(--ink-1)]">
                  {r.questions_fully_covered ?? '—'}
                  {lab.questions ? <span className="text-[var(--ink-2)]"> / {lab.questions}</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--ink-1)]">{r.chunks ?? '—'}</td>
                <td className="px-3 py-2.5 text-right text-[var(--ink-1)]">{r.avg_chunk_chars != null ? Math.round(r.avg_chunk_chars) : '—'}</td>
                <td className="px-5 py-2.5 text-right text-[var(--ink-1)]">
                  {r.ms_per_question != null ? perQuestion(r.ms_per_question) : '—'}
                  {r.rerank_calls ? <span className="block text-[0.75rem] text-[var(--ink-2)]">{r.rerank_calls} grading calls</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lab.note && <p className="border-t border-[var(--rule)] px-5 py-3 text-xs leading-relaxed text-[var(--ink-2)]">{lab.note}</p>}
      </Panel>
    </>
  );
};

/** One sentence: what the best setup buys over today's, in percentage points of passages found. */
const Verdict: React.FC<{ best?: ChunkingLabRow; current?: ChunkingLabRow; recall: (r: ChunkingLabRow) => number }> = ({
  best,
  current,
  recall,
}) => {
  if (!best) return null;
  const gain = current ? (recall(best) - recall(current)) * 100 : null;
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: tint(PASS, 0.14), color: PASS }}>
        <Trophy className="h-4 w-4" />
      </span>
      <p className="text-[1.125rem] leading-snug text-[var(--ink)]">
        <span className="font-medium">{rowLabel(best)}</span> finds {pct1(recall(best))} of the right passages
        {current && !sameRow(best, current) && gain != null ? (
          <>
            {' '}
            vs {pct1(recall(current))} with today's setup{' '}
            <span className="font-medium" style={{ color: gain > 0 ? PASS : 'var(--ink-2)' }}>
              ({gain >= 0 ? '+' : ''}
              {gain.toFixed(1)} pts)
            </span>
            .
          </>
        ) : current && sameRow(best, current) ? (
          <>. Today's setup is already the best of these.</>
        ) : (
          <>, the best of these setups.</>
        )}
      </p>
    </div>
  );
};

/**
 * Horizontal bars, sorted. The scores usually cluster near the top, so the axis starts just under
 * the lowest one (and says so) instead of hiding every difference in a 0–100% scale.
 */
const Bars: React.FC<{
  rows: ChunkingLabRow[];
  best?: ChunkingLabRow;
  recommended?: ChunkingLabRow;
  value: (r: ChunkingLabRow) => number;
  label: string;
}> = ({ rows, best, recommended, value, label }) => {
  const lowest = Math.min(...rows.map(value));
  const floor = Math.max(0, Math.floor((lowest - 0.05) * 10) / 10);
  const scale = (v: number) => (1 - floor > 0 ? ((v - floor) / (1 - floor)) * 100 : 100);
  const isMrr = label === 'MRR';
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const v = value(r);
        const isRecommended = sameRow(r, recommended);
        const color = isRecommended ? PASS : isCurrent(r) ? AMBER : 'var(--ink-2)';
        return (
          <div key={rowLabel(r)} className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_56px] items-center gap-3 text-[0.84375rem]">
            <span className="truncate text-[var(--ink-1)]" title={rowLabel(r)}>
              {rowLabel(r)}
            </span>
            <div className="relative h-6 overflow-hidden rounded-md bg-[var(--panel)]">
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-700"
                style={{ width: `${Math.max(2, scale(v))}%`, background: tint(color, isRecommended ? 0.55 : 0.32) }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center gap-1.5 text-[0.75rem]">
                {isRecommended && <Tag tone="best">recommended</Tag>}
                {sameRow(r, best) && !sameRow(best, recommended) && <Tag tone="neutral">best</Tag>}
                {isCurrent(r) && <Tag tone="current">today</Tag>}
              </span>
              {r.rerank_calls ? (
                <span className="absolute inset-y-0 right-2 flex items-center text-[0.75rem] text-[var(--ink-1)]">{r.rerank_calls} grading calls</span>
              ) : null}
            </div>
            <span className="text-right font-medium tabular-nums text-[var(--ink)]">{isMrr ? v.toFixed(3) : pct1(v)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_56px] gap-3 text-[0.75rem] text-[var(--ink-2)]">
        <span />
        <span className="flex justify-between">
          <span>{isMrr ? floor.toFixed(1) : `${Math.round(floor * 100)}%`}</span>
          <span>
            {label}
            {floor > 0 ? ` · axis starts at ${isMrr ? floor.toFixed(1) : `${Math.round(floor * 100)}%`}` : ''}
          </span>
          <span>{isMrr ? '1.0' : '100%'}</span>
        </span>
        <span />
      </div>
    </div>
  );
};

/** The backend's plain-words recommendation, led by the setup to use and its gain over today. */
const Recommendation: React.FC<{
  recommended: ChunkingLabRow;
  current?: ChunkingLabRow;
  notes: string[];
  recall: (r: ChunkingLabRow) => number;
}> = ({ recommended, current, notes, recall }) => {
  const gain = current ? (recall(recommended) - recall(current)) * 100 : null;
  const isToday = current && sameRow(recommended, current);
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: tint(PASS, 0.14), color: PASS }}>
        <Trophy className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-[1.125rem] leading-snug text-[var(--ink)]">
          Use <span className="font-medium">{rowLabel(recommended)}</span>
          {isToday ? (
            <span className="text-[var(--ink-2)]">: today's setup is already the right one.</span>
          ) : gain != null && Math.abs(gain) < 0.05 ? (
            // Same recall as today: the only difference is how high the right passage ranks.
            <span className="text-[var(--ink-2)]">
              : the same {pct1(recall(recommended))} as today, ranked {recommended.mrr > current!.mrr ? 'slightly higher' : 'the same'} (MRR{' '}
              {recommended.mrr.toFixed(3)} vs {current!.mrr.toFixed(3)})
            </span>
          ) : gain != null ? (
            <>
              {': '}
              {pct1(recall(recommended))} vs {pct1(recall(current!))} today{' '}
              <span className="font-medium" style={{ color: gain > 0 ? PASS : 'var(--ink-2)' }}>
                ({gain >= 0 ? '+' : ''}
                {gain.toFixed(1)} pts)
              </span>
            </>
          ) : null}
        </p>
        {notes.length > 0 && <p className="text-[0.875rem] leading-relaxed text-[var(--ink-1)]">{notes.join(' ')}</p>}
      </div>
    </div>
  );
};

/** Amber note when the pack is too small to tell setups apart, with a one-click switch to a bigger pack. */
const Warnings: React.FC<{
  warnings: string[];
  suggested: { id: string; name: string; info?: PackInfo } | null;
  onSwitchPack: (id: string) => void;
}> = ({ warnings, suggested, onSwitchPack }) => (
  <div className="flex items-start gap-3 rounded-xl border px-4 py-3" style={{ borderColor: tint(AMBER, 0.4), background: tint(AMBER, 0.08) }}>
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: AMBER }} />
    <div className="flex min-w-0 flex-1 flex-col gap-2 text-[0.875rem] leading-relaxed text-[var(--ink)]">
      {warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
      {suggested && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSwitchPack(suggested.id)}
            className="rounded-[9px] border border-[var(--rule-3)] px-3 py-1.5 text-[0.84375rem] text-[var(--ink)] transition-colors hover:bg-[var(--panel-2)]"
          >
            Try {suggested.name}
            {suggested.info?.test_case_count
              ? ` (${suggested.info.test_case_count} questions${suggested.info.document_count ? `, ${suggested.info.document_count} documents` : ''})`
              : ''}{' '}
            →
          </button>
          <span className="text-xs text-[var(--ink-2)]">picks it on the left; then run the lab</span>
        </div>
      )}
    </div>
  </div>
);

/** Copyable backend settings for the recommended setup. */
const ApplySnippet: React.FC<{ row: ChunkingLabRow }> = ({ row }) => {
  const [copied, setCopied] = useState(false);
  const lines = [`RAGSEAL_RETRIEVAL=${row.mode}`, `RAGSEAL_CHUNK_CHARS=${row.chunk_chars}`];
  if (row.overlap) lines.push(`RAGSEAL_CHUNK_OVERLAP=${row.overlap}`);
  if (row.rerank) lines.push('RAGSEAL_RERANK=1');
  const text = lines.join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--ink-1)]">Apply it</span>
        <span className="text-xs text-[var(--ink-2)]">set in backend/.env and restart; new uploads use it</span>
      </div>
      <div className="flex items-start justify-between gap-3 rounded-[10px] border border-[var(--rule)] bg-[var(--panel)] px-3.5 py-2.5">
        <pre className="select-all whitespace-pre-wrap font-mono text-[0.84375rem] leading-relaxed text-[var(--ink)]">{text}</pre>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

const Example: React.FC = () => (
  <Panel title="What a result looks like" note="before your first run">
    <div className="flex flex-col gap-4">
      <p className="text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
        Real numbers from our public-documents pack (9 IRS releases and guides searched together, 129 questions). Hybrid search at 1200
        characters finds more of the right passages than today's setup, and reranking finds all of them, at the cost of one grading call
        per question.
      </p>
      <div className="flex flex-col gap-2">
        {EXAMPLE.map((r) => {
          const color = r.tag === 'best' ? PASS : r.tag === 'current' ? AMBER : 'var(--ink-2)';
          return (
            <div key={r.label} className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_56px] items-center gap-3 text-[0.84375rem]">
              <span className="truncate text-[var(--ink-1)]">{r.label}</span>
              <div className="relative h-6 overflow-hidden rounded-md bg-[var(--panel)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${((r.recall - 0.8) / 0.2) * 100}%`, background: tint(color, r.tag === 'best' ? 0.55 : 0.32) }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[0.75rem]">
                  {r.tag === 'best' && <Tag tone="best">best</Tag>}
                  {r.tag === 'current' && <Tag tone="current">today</Tag>}
                </span>
              </div>
              <span className="text-right font-medium tabular-nums text-[var(--ink)]">{pct1(r.recall)}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)_56px] gap-3 text-[0.75rem] text-[var(--ink-2)]">
          <span />
          <span className="flex justify-between">
            <span>80%</span>
            <span>recall@4 · axis starts at 80%</span>
            <span>100%</span>
          </span>
          <span />
        </div>
      </div>
      <p className="text-xs text-[var(--ink-2)]">Pick a pack on the left and run the lab to see your own.</p>
    </div>
  </Panel>
);

const MetricHelp: React.FC<{ k: number }> = ({ k }) => (
  <div className="flex items-start gap-2.5 px-1 text-xs leading-relaxed text-[var(--ink-2)]">
    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <p>
      <span className="text-[var(--ink-1)]">Recall@{k}</span> is the share of each question's right passages (its gold quotes) found in the
      top {k} chunks, averaged over the pack. <span className="text-[var(--ink-1)]">MRR</span> is how high the first right passage ranks:
      1.0 means it always comes first. <span className="text-[var(--ink-1)]">Fully covered</span> counts questions where every right passage
      was found. Bigger chunks can score higher partly because more text reaches the bot, so check answers before switching.
    </p>
  </div>
);

const Tag: React.FC<{ tone: 'best' | 'current' | 'neutral'; children: React.ReactNode }> = ({ tone, children }) => {
  const color = tone === 'best' ? PASS : tone === 'current' ? AMBER : 'var(--ink-2)';
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-px text-[0.71875rem] font-medium"
      style={{ background: tint(color, 0.16), color }}
    >
      {children}
    </span>
  );
};

const Chip: React.FC<{ on: boolean; onClick: () => void; disabled?: boolean; compact?: boolean; title?: string; children: React.ReactNode }> = ({
  on,
  onClick,
  disabled,
  compact,
  title,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={on}
    title={title}
    className={cn(
      'relative inline-flex h-8 items-center rounded-[9px] border text-[0.84375rem] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      compact ? 'justify-center px-0' : 'px-3',
      on
        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
        : 'border-[var(--rule-2)] text-[var(--ink-1)] hover:border-[var(--rule-3)] hover:text-[var(--ink)]'
    )}
  >
    {children}
  </button>
);

const INPUT =
  'h-10 w-full rounded-[10px] border border-[var(--rule-2)] bg-[var(--paper)] px-3 text-[0.90625rem] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--rule-3)]';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-[var(--ink-1)]">{label}</span>
    {children}
    {hint && <span className="text-[0.78125rem] leading-snug text-[var(--ink-2)]">{hint}</span>}
  </div>
);
