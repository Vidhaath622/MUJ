import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Keyboard, PenLine, SkipForward, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { TopBarControls } from '../shell/AppShell';
import { PASS, RED, tint, verdictStyle } from '../lab/verdict';
import {
  Agreement,
  DisagreementItem,
  errorText,
  getAgreement,
  getDisagreements,
  getLabelQueue,
  getProgress,
  getRun,
  LabelItem,
  listRuns,
  postLabel,
  RunProgress,
} from '../shared/apiExtra';
import { usePacks } from '../shared/packs';
import { FAILURE_TYPES, FailureType, failureLabel, STAGE_COLOR } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, fmtDuration, LoadState, PACKS, PackSwitcher } from '../shared/ui';

const LABELERS = ['Sarthak', 'Vidhaath'];
const LABELER_KEY = 'ragseal.labeler';

/** Two teammates labelled these three packs; every other pack is scored by RAGSeal alone. */
const LABELLED_PACKS = PACKS;

const pct = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);

function readLabeler(): string | null {
  try {
    return localStorage.getItem(LABELER_KEY);
  } catch {
    return null;
  }
}

function saveLabeler(name: string | null) {
  try {
    if (name) localStorage.setItem(LABELER_KEY, name);
    else localStorage.removeItem(LABELER_KEY);
  } catch {
    // private mode: the name just isn't remembered
  }
}

/** A stored label as the value the page tracks: 'correct', a failure type, or 'wrong' (reason unknown). */
function labelValue(l: { correct: boolean; failure_type?: string | null } | null | undefined): string | undefined {
  if (!l) return undefined;
  return l.correct ? 'correct' : l.failure_type || 'wrong';
}

function describeLabel(value: string): string {
  if (value === 'correct') return 'Correct';
  return value === 'wrong' ? 'Wrong' : `Wrong · ${failureLabel(value)}`;
}

/** The backend's accepted failure types, in its order, with our labels and stages. */
function typesFrom(ids: string[] | undefined): FailureType[] {
  if (!ids?.length) return FAILURE_TYPES.filter((f) => f.id !== 'OTHER');
  return ids.map(
    (id) => FAILURE_TYPES.find((f) => f.id === id) ?? { id, label: failureLabel(id), stage: 'none', hint: '' }
  );
}

interface LabelStudioPageProps {
  token: string | null;
  packId: PackId;
  onPackChange: (p: PackId) => void;
}

/**
 * Human labeling, built for speed: one answer per screen, 1 = correct, 2 = wrong then
 * a number for the failure type. The pipeline's own verdict is never shown, so it can't
 * anchor the labeler.
 *
 * Without a chosen labeller (anyone on the public site) the page is read-only: it shows what
 * both teammates said and RAGSeal's verdict, and labelling as a teammate takes a confirm.
 */
const PACK_NAME: Record<string, string> = { recruitment: 'Recruitment', banking: 'Banking', healthcare: 'Healthcare' };
const NEXT_PACK: Record<string, string | undefined> = { recruitment: 'banking', banking: 'healthcare', healthcare: 'recruitment' };

/** Read-only view of one answer: each teammate's label and RAGSeal's verdict. */
interface TeamView {
  labels: Record<string, string | undefined>;
  verdict?: string;
}

export const LabelStudioPage: React.FC<LabelStudioPageProps> = ({ token, packId, onPackChange }) => {
  const [labeler, setLabeler] = useState<string | null>(readLabeler);
  // Choosing (or switching) who labels; a teammate needs a confirm before any write.
  const [choosing, setChoosing] = useState(false);
  // Guest only: the summary first, then "Browse answers" steps through them read-only.
  const [guestBrowsing, setGuestBrowsing] = useState(false);
  const [team, setTeam] = useState<Record<string, TeamView>>({});
  const [items, setItems] = useState<LabelItem[] | null>(null);
  // Review mode: only the answers the two labellers disagreed on, for a second look.
  const [review, setReview] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [index, setIndex] = useState(0);
  // After everything is labelled the queue shows a completion card; "Review my labels" browses 1..N.
  const [browsing, setBrowsing] = useState(false);
  const [done, setDone] = useState<Record<string, 'correct' | string>>({});
  // This labeller's own current label per item ('correct', a failure type or 'wrong'), from the
  // backend's my_label and updated on every save, so an existing label can be seen and changed.
  const [mine, setMine] = useState<Record<string, string>>({});
  // Short confirmation after changing an existing label ("Label updated").
  const [flash, setFlash] = useState<string | null>(null);
  const [pickingType, setPickingType] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<FailureType[]>(() => typesFrom(undefined));
  // A newer run of this pack still in progress: labelling waits for it, so both people
  // label the full question set and not an older, smaller run.
  const [waitingFor, setWaitingFor] = useState<RunProgress | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setDone({});
    setMine({});
    setTeam({});
    setFlash(null);
    setPickingType(false);
    (async () => {
      try {
        if (!labeler) {
          // Guest: the same queue, read through each teammate's eyes, plus RAGSeal's verdicts.
          const queues = await Promise.all(LABELERS.map((name) => getLabelQueue(packId, name, token)));
          const batchId = queues[0].batch_id;
          const run = batchId ? ((await getRun(batchId, token).catch(() => null)) as { results?: unknown[] } | null) : null;
          if (cancelled) return;
          const verdicts: Record<string, string> = {};
          (run?.results ?? []).forEach((r) => {
            const res = r as { test_id?: string; category?: string; root_cause?: { category?: string } };
            if (res.test_id) verdicts[res.test_id] = res.root_cause?.category ?? res.category ?? 'UNRESOLVED';
          });
          const view: Record<string, TeamView> = {};
          queues[0].items.forEach((it) => {
            view[it.test_id] = { labels: {}, verdict: verdicts[it.test_id] };
          });
          queues.forEach((q, i) =>
            q.items.forEach((it) => {
              if (view[it.test_id]) view[it.test_id].labels[LABELERS[i]] = labelValue(it.my_label);
            })
          );
          setTypes(typesFrom(queues[0].failure_types));
          setWaitingFor(null);
          setTeam(view);
          // Pack order, not "unlabelled first": a guest browses, nothing is open.
          setItems([...queues[0].items].sort((a, b) => a.test_id.localeCompare(b.test_id, undefined, { numeric: true })));
          setIndex(0);
          return;
        }
        if (review) {
          const d = await getDisagreements(packId, token, labeler);
          if (cancelled) return;
          if (d.failure_types) setTypes(typesFrom(d.failure_types));
          setWaitingFor(null);
          const own: Record<string, string> = {};
          d.items.forEach((it) => {
            const v = labelValue(it.my_label ?? it.labels?.[labeler]);
            if (v) own[it.test_id] = v;
          });
          setMine(own);
          setItems(d.items);
          setIndex(0);
          return;
        }
        const [q, runs] = await Promise.all([getLabelQueue(packId, labeler, token), listRuns(token)]);
        if (cancelled) return;
        setTypes(typesFrom(q.failure_types));
        const queueRun = runs.find((r) => r.batch_id === q.batch_id);
        const newer = runs
          .filter((r) => r.pack_id === packId && r.status === 'running')
          .filter((r) => !queueRun || r.created_at > queueRun.created_at)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        // Labels already on the queue's run mean labelling has begun there: stay on it.
        if (newer && !q.labeled && (q.total ?? 0) < (newer.total_evaluated ?? Infinity)) {
          const p = await getProgress(newer.batch_id, token);
          if (cancelled) return;
          setWaitingFor(p);
          setItems([]);
          return;
        }
        setWaitingFor(null);
        setItems(q.items);
        const already: Record<string, string> = {};
        const own: Record<string, string> = {};
        q.items.forEach((it) => {
          const v = labelValue(it.my_label);
          if (v) own[it.test_id] = v;
          // Older backends only say "labeled" without the label itself.
          if (it.labeled || v) already[it.test_id] = v ?? 'labeled';
        });
        setDone(already);
        setMine(own);
        const firstOpen = q.items.findIndex((it) => !it.labeled);
        setIndex(firstOpen === -1 ? 0 : firstOpen);
      } catch (err) {
        if (!cancelled) setLoadError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, labeler, packId, reload, review]);

  // While waiting, re-check every 5 s; the queue loads itself once the run is done.
  useEffect(() => {
    if (!waitingFor || !token) return;
    const id = window.setTimeout(async () => {
      try {
        const p = await getProgress(waitingFor.batch_id, token);
        if (p.status === 'running') setWaitingFor(p);
        else setReload((r) => r + 1);
      } catch {
        setReload((r) => r + 1);
      }
    }, 5000);
    return () => window.clearTimeout(id);
  }, [waitingFor, token]);

  const item = items?.[index];
  const labeledCount = Object.keys(done).length;
  const allDone = !!items && items.length > 0 && labeledCount >= items.length;
  const showComplete = allDone && !browsing && !review;

  useEffect(() => setBrowsing(false), [packId, labeler, review]);
  useEffect(() => setGuestBrowsing(false), [packId, labeler]);

  const goTo = useCallback(
    (i: number) => {
      if (!items?.length) return;
      setPickingType(false);
      setNote('');
      setIndex(Math.max(0, Math.min(items.length - 1, i)));
    },
    [items]
  );

  // Next unlabelled item after this one (no wrap-around). When browsing a finished pack, step forward by one.
  const advance = useCallback(() => {
    if (!items) return;
    setPickingType(false);
    setNote('');
    if (browsing) {
      setIndex((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    for (let j = index + 1; j < items.length; j++) {
      if (!done[items[j].test_id]) {
        setIndex(j);
        return;
      }
    }
    const firstOpen = items.findIndex((it) => !done[it.test_id]);
    if (firstOpen !== -1) setIndex(firstOpen);
    else setIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items, index, done, browsing]);

  // Changing a label you already gave keeps you on the item with a confirmation; a first label
  // (and every answer in disagreement review) moves on to the next item.
  const submit = useCallback(
    async (correct: boolean, failureType: string | null) => {
      if (!item || !token || !labeler || saving) return;
      const previous = mine[item.test_id] ?? (done[item.test_id] && done[item.test_id] !== 'labeled' ? done[item.test_id] : undefined);
      const editing = !review && (previous !== undefined || done[item.test_id] === 'labeled');
      setSaving(true);
      setError(null);
      try {
        await postLabel(
          { test_id: item.test_id, batch_id: item.batch_id, labeler, correct, failure_type: failureType, note: note.trim() || undefined },
          token
        );
        const value = correct ? 'correct' : failureType ?? 'wrong';
        setDone((d) => ({ ...d, [item.test_id]: value }));
        setMine((m) => ({ ...m, [item.test_id]: value }));
        setPickingType(false);
        if (editing) setFlash(previous === value ? 'Saved, unchanged' : 'Label updated');
        else advance();
      } catch (err) {
        setError(errorText(err));
      } finally {
        setSaving(false);
      }
    },
    [item, token, labeler, saving, note, advance, mine, done, review]
  );

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(id);
  }, [flash]);

  // The confirmation belongs to the item it was shown on.
  useEffect(() => setFlash(null), [index]);

  // Keyboard: 1 correct, 2 wrong → 1-9 failure type, Esc back, S skip, ← previous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !item) return;
      if (!labeler) {
        // Read-only: only ← → to step through answers.
        if (e.key === 'ArrowLeft') goTo(index - 1);
        else if (e.key === 'ArrowRight') goTo(index + 1);
        return;
      }
      if (pickingType) {
        const n = Number(e.key);
        if (e.key === '0' || e.key === 'Enter') {
          e.preventDefault();
          submit(false, null);
        } else if (n >= 1 && n <= types.length) {
          e.preventDefault();
          submit(false, types[n - 1].id);
        } else if (e.key === 'Escape' || e.key === 'Backspace') {
          setPickingType(false);
        }
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        submit(true, null);
      } else if (e.key === '2') {
        e.preventDefault();
        setPickingType(true);
      } else if (e.key.toLowerCase() === 's') {
        advance();
      } else if (e.key === 'ArrowLeft' && items) {
        goTo(index - 1);
      } else if (e.key === 'ArrowRight' && items) {
        goTo(index + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, items, pickingType, submit, advance, types, goTo, index, labeler]);

  const knownAnswer = item?.ground_truth ?? item?.ground_truth_answer;
  // What this labeller currently has on the item: the backend's my_label, or what they just saved.
  const current = item
    ? mine[item.test_id] ?? (done[item.test_id] && done[item.test_id] !== 'labeled' && !review ? done[item.test_id] : undefined)
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBarControls>
        {labeler ? (
          <button
            onClick={() => setChoosing(true)}
            className="shrink-0 whitespace-nowrap text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            Labelling as <span className="font-medium text-[var(--ink)]">{labeler}</span> · switch
          </button>
        ) : (
          <button
            onClick={() => setChoosing(true)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            <Eye className="h-3.5 w-3.5" /> Read-only · <span className="font-medium text-[var(--ink)]">label as a teammate</span>
          </button>
        )}
        {labeler && (
          <button
            onClick={() => setReview((r) => !r)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition-colors',
              review
                ? 'border-[var(--retr)] bg-[color:color-mix(in_srgb,var(--retr)_12%,transparent)] text-[var(--ink)]'
                : 'border-[var(--rule)] text-[var(--ink-2)] hover:text-[var(--ink)]'
            )}
          >
            {review ? 'Reviewing disagreements · back to labelling' : 'Review disagreements'}
          </button>
        )}
        {/* Only the human-labelled packs: picking any other pack here had nothing to label. */}
        <PackSwitcher value={packId} onChange={onPackChange} packs={LABELLED_PACKS} />
      </TopBarControls>

      {choosing ? (
        <ChooseLabeler
          current={labeler}
          onChoose={(name) => {
            saveLabeler(name);
            setLabeler(name);
            setChoosing(false);
          }}
          onGuest={() => {
            saveLabeler(null);
            setLabeler(null);
            setChoosing(false);
          }}
          onCancel={() => setChoosing(false)}
        />
      ) : !items ? (
        <div className="p-6">
          <LoadState loading={!loadError} error={loadError} what="the labeling queue" />
        </div>
      ) : waitingFor ? (
        <div className="p-6">
          <WaitingForRun p={waitingFor} />
        </div>
      ) : items.length === 0 && review ? (
        <div className="p-6">
          <EmptyState title="No disagreements for this pack">
            You and your teammate agree on every answer you both labelled here.
          </EmptyState>
        </div>
      ) : items.length === 0 ? (
        <div className="p-6">
          <EmptyState title="Nothing to label for this pack">
            The queue fills from the pack's latest finished run. Run the pack first, then come back.
          </EmptyState>
        </div>
      ) : !labeler && !guestBrowsing ? (
        <PackSummary
          token={token}
          packId={packId}
          labeler={null}
          total={items.length}
          onBrowse={() => {
            setGuestBrowsing(true);
            goTo(0);
          }}
          onLabel={() => setChoosing(true)}
          onPackChange={onPackChange}
        />
      ) : showComplete && labeler ? (
        <PackSummary
          token={token}
          packId={packId}
          labeler={labeler}
          labelled={labeledCount}
          total={items.length}
          onBrowse={() => {
            setBrowsing(true);
            goTo(0);
          }}
          onReview={() => setReview(true)}
          onPackChange={onPackChange}
        />
      ) : (
        item && (
          <div className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 flex-col gap-4 px-6 py-5">
            {!labeler ? (
              <GuestNote index={index} total={items.length} onBack={() => setGuestBrowsing(false)} onLabel={() => setChoosing(true)} />
            ) : review ? (
              <ReviewNote item={item as DisagreementItem} labeler={labeler} left={items.length - labeledCount} />
            ) : (
              <Progress
                labeled={labeledCount}
                total={items.length}
                index={index}
                onSummary={allDone && browsing ? () => setBrowsing(false) : undefined}
              />
            )}
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            {/* Rows are minmax(0, 1fr) so long chunk lists scroll inside their pane instead of
                stretching the grid and pushing the action bar below the screen. */}
            <div
              key={item.test_id}
              className="page-enter grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[minmax(0,1fr)]"
            >
              <section className="lab-panel flex min-h-0 flex-col overflow-hidden rounded-2xl">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-[var(--ink-2)]">
                    <span className="font-mono">{item.test_id}</span>
                    {current ? (
                      <span
                        className="rounded-full px-2.5 py-0.5 font-medium"
                        style={{ color: current === 'correct' ? PASS : RED, background: tint(current === 'correct' ? PASS : RED, 0.12) }}
                      >
                        Your label: {describeLabel(current)}
                      </span>
                    ) : (
                      done[item.test_id] === 'labeled' && <span>already labelled</span>
                    )}
                    {(current || done[item.test_id]) && !flash && (
                      <span className="text-[var(--muted)]">Click Correct or Wrong below to change it</span>
                    )}
                    {flash && (
                      <span className="flex items-center gap-1 font-medium text-[var(--ok)]" role="status">
                        <Check className="h-3.5 w-3.5" /> {flash}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-[1.375rem] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">{item.question}</h2>

                  <div className="mt-5 text-xs text-[var(--ink-2)]">Known answer</div>
                  <p className="mt-1 text-[1rem] leading-relaxed text-[var(--ink-1)]">
                    {item.expected_abstain
                      ? 'Not in the documents. The right reply is to say so, not to answer.'
                      : knownAnswer || '— (none given)'}
                  </p>

                  <div className="mt-5 text-xs text-[var(--ink-2)]">Model answer</div>
                  <p className="mt-1 whitespace-pre-wrap text-[1.125rem] leading-relaxed tracking-[-0.01em] text-[var(--ink)]">
                    {item.generated_answer || '— (no answer)'}
                  </p>
                </div>

                <div className={cn('shrink-0 border-t border-[var(--rule)] px-6 py-3', !labeler && 'hidden')}>
                  <label className="flex h-9 items-center gap-2 rounded-[9px] border border-[var(--rule-2)] bg-[var(--paper)] px-3">
                    <span className="sr-only">Note</span>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note (Esc to leave the field)"
                      className="h-full flex-1 bg-transparent text-[0.875rem] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
                    />
                  </label>
                </div>
              </section>

              <section className="lab-panel-flat flex min-h-0 flex-col overflow-hidden rounded-2xl">
                <div className="flex items-baseline justify-between border-b border-[var(--rule)] px-5 py-3.5 text-[0.875rem]">
                  <span className="font-medium">What the model was given</span>
                  <span className="text-xs text-[var(--ink-2)]">{item.retrieved_chunks?.length ?? 0} chunks</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                  {(item.retrieved_chunks ?? []).map((c, i) => (
                    <article key={c.chunk_id ?? i} className="rounded-xl border border-[var(--rule)] px-3.5 py-3">
                      <div className="flex gap-2 text-xs">
                        <span className="truncate text-[var(--ink-1)]">{c.filename ?? c.document_name ?? c.document_id ?? 'document'}</span>
                        <span className="font-mono text-[var(--muted)]">{c.chunk_id}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-[var(--ink-1)]">
                        {c.text.replace(/^#+\s.*\n+/, '')}
                      </p>
                    </article>
                  ))}
                  {!item.retrieved_chunks?.length && <p className="text-sm text-[var(--ink-2)]">No chunks were retrieved.</p>}
                </div>
              </section>
            </div>

            {!labeler ? (
              <GuestBar
                view={team[item.test_id]}
                onBack={() => goTo(index - 1)}
                backDisabled={index === 0}
                onNext={() => goTo(index + 1)}
                nextDisabled={index >= items.length - 1}
              />
            ) : (
            <ActionBar
              types={types}
              picking={pickingType}
              saving={saving}
              current={current}
              labelled={!!current || !!done[item.test_id]}
              onCorrect={() => submit(true, null)}
              onWrong={() => setPickingType(true)}
              onType={(id) => submit(false, id)}
              onUnsure={() => submit(false, null)}
              onCancel={() => setPickingType(false)}
              onSkip={advance}
              onBack={() => goTo(index - 1)}
              backDisabled={index === 0}
              onNext={() => goTo(index + 1)}
              nextDisabled={index >= items.length - 1}
            />
            )}
          </div>
        )
      )}
    </div>
  );
};

/** Review mode header: what you said, and that your teammate said the opposite. Names stay out of it. */
const ReviewNote: React.FC<{ item: DisagreementItem; labeler: string; left: number }> = ({ item, labeler, left }) => {
  const mine = item.labels?.[labeler];
  const said = mine == null ? 'nothing yet' : mine.correct ? 'Correct' : `Wrong${mine.failure_type ? ` (${failureLabel(mine.failure_type)})` : ''}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--retr)] bg-[color:color-mix(in_srgb,var(--retr)_8%,transparent)] px-4 py-2.5 text-[0.875rem]">
      <span className="text-[var(--ink)]">
        You said <span className="font-semibold">{said}</span>. Your teammate disagreed. Look again: press{' '}
        <span className="font-mono">1</span> for correct or <span className="font-mono">2</span> for wrong. Your new answer replaces the old one.
      </span>
      <span className="font-semibold tabular-nums text-[var(--ink)]">{Math.max(0, left)} disagreements left</span>
    </div>
  );
};

/**
 * Who labels. The labels are the team's ground truth, so a teammate's name takes a confirm,
 * and "Just browse" keeps the page read-only.
 */
const ChooseLabeler: React.FC<{
  current: string | null;
  onChoose: (name: string) => void;
  onGuest: () => void;
  onCancel: () => void;
}> = ({ current, onChoose, onGuest, onCancel }) => {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="lab-panel lab-fade-up w-full max-w-xl rounded-2xl p-7">
        {pending ? (
          <>
            <div className="flex items-center gap-2 text-[0.875rem] font-medium text-[var(--retr)]">
              <PenLine className="h-4 w-4" /> Confirm
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.01em]">You're about to label as {pending}</h2>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
              Every label you give replaces {pending}'s label on that answer, and changes the team's live agreement numbers.
              The headline agreement on Checker trust comes from a stored snapshot of the first labels, so it won't move.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button
                onClick={() => onChoose(pending)}
                className="rounded-[9px] bg-[var(--ink)] px-4 py-2 text-[0.875rem] font-medium text-[var(--paper)] hover:opacity-90"
              >
                Label as {pending}
              </button>
              <button
                onClick={() => setPending(null)}
                className="rounded-[9px] border border-[var(--rule-2)] px-4 py-2 text-[0.875rem] text-[var(--ink)] hover:bg-[var(--panel-2)]"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Who is labelling?</h2>
            <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
              Two teammates labelled the same answers independently. Only answers they both agree on count as ground truth for
              checking RAGSeal. If you're not one of them, browse read-only.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {LABELERS.map((name) => (
                <button
                  key={name}
                  onClick={() => (name === current ? onCancel() : setPending(name))}
                  className="h-12 rounded-xl border border-[var(--rule-2)] text-[1rem] font-medium text-[var(--ink)] transition-colors hover:border-[var(--rule-3)] hover:bg-[color:color-mix(in_srgb,var(--ink)_2%,transparent)]"
                >
                  {name}
                  {name === current && <span className="ml-1.5 text-xs font-normal text-[var(--ink-2)]">(current)</span>}
                </button>
              ))}
            </div>
            <button
              onClick={onGuest}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--rule-2)] text-[0.9375rem] text-[var(--ink-1)] transition-colors hover:border-[var(--rule-3)] hover:text-[var(--ink)]"
            >
              <Eye className="h-4 w-4" /> Just browse, read-only
            </button>
            <button onClick={onCancel} className="mt-4 text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const Progress: React.FC<{ labeled: number; total: number; index: number; onSummary?: () => void }> = ({
  labeled,
  total,
  index,
  onSummary,
}) => (
  <div className="flex items-center gap-4">
    <div className="text-[0.875rem] text-[var(--ink-1)]">
      <span className="font-semibold tabular-nums text-[var(--ink)]">{labeled}</span>
      <span className="text-[var(--ink-2)]"> of {total} labeled</span>
    </div>
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-3)]">
      <div className="h-full rounded-full bg-[var(--ok)] transition-[width] duration-500" style={{ width: `${(labeled / total) * 100}%` }} />
    </div>
    <div className="text-xs tabular-nums text-[var(--ink-2)]">
      item {index + 1} / {total}
    </div>
    {onSummary && (
      <button onClick={onSummary} className="shrink-0 text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
        Pack summary
      </button>
    )}
  </div>
);

/** Read-only header: where you are, and the way to label for real. */
const GuestNote: React.FC<{ index: number; total: number; onBack: () => void; onLabel: () => void }> = ({ index, total, onBack, onLabel }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule)] bg-[var(--panel)] px-4 py-2.5 text-[0.875rem]">
    <span className="flex items-center gap-2 text-[var(--ink-1)]">
      <Eye className="h-4 w-4 text-[var(--ink-2)]" /> Read-only. You see what both teammates said and RAGSeal's verdict.
    </span>
    <span className="flex items-center gap-4">
      <span className="text-xs tabular-nums text-[var(--ink-2)]">
        answer {index + 1} / {total}
      </span>
      <button onClick={onBack} className="text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
        Pack summary
      </button>
      <button onClick={onLabel} className="text-xs font-medium text-[var(--ink)] hover:opacity-70">
        Label as a teammate →
      </button>
    </span>
  </div>
);

/** In place of the Correct/Wrong buttons for a guest: each teammate's call and RAGSeal's. */
const GuestBar: React.FC<{
  view?: TeamView;
  onBack: () => void;
  backDisabled?: boolean;
  onNext: () => void;
  nextDisabled?: boolean;
}> = ({ view, onBack, backDisabled, onNext, nextDisabled }) => {
  const verdict = view?.verdict ? verdictStyle(view.verdict) : null;
  return (
    <div className="flex shrink-0 items-stretch gap-3">
      <NavButton onClick={onBack} disabled={backDisabled} label="Previous answer">
        <ArrowLeft className="h-4 w-4" />
      </NavButton>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 rounded-xl border border-[var(--rule)] px-4 py-2">
        {LABELERS.map((name) => {
          const v = view?.labels[name];
          const color = v == null ? 'var(--muted)' : v === 'correct' ? PASS : RED;
          return (
            <span key={name} className="rounded-full px-3 py-1 text-[0.875rem]" style={{ color, background: tint(color, 0.1) }}>
              <span className="text-[var(--ink-2)]">{name}: </span>
              <span className="font-medium">{v ? describeLabel(v) : 'not labelled'}</span>
            </span>
          );
        })}
        <span className="mx-1 hidden h-5 w-px bg-[var(--rule)] sm:block" />
        <span className="rounded-full px-3 py-1 text-[0.875rem]" style={verdict ? { color: verdict.color, background: tint(verdict.color, 0.1) } : undefined}>
          <span className="text-[var(--ink-2)]">RAGSeal: </span>
          <span className="font-medium">{verdict ? verdict.label : '—'}</span>
        </span>
      </div>
      <NavButton onClick={onNext} disabled={nextDisabled} label="Next answer">
        <ArrowRight className="h-4 w-4" />
      </NavButton>
    </div>
  );
};

/**
 * One pack's labelling at a glance: progress, how often the two teammates agreed, how often
 * RAGSeal agreed with them, where they split, and the other labelled packs. Shown when a
 * labeller finishes a pack, and as the landing for anyone browsing read-only.
 */
const PackSummary: React.FC<{
  token: string | null;
  packId: PackId;
  labeler: string | null;
  labelled?: number;
  total: number;
  onBrowse: () => void;
  onReview?: () => void;
  onLabel?: () => void;
  onPackChange: (p: PackId) => void;
}> = ({ token, packId, labeler, labelled, total, onBrowse, onReview, onLabel, onPackChange }) => {
  const packs = usePacks();
  // Agreement per labelled pack (each call answers for its pack, from the first-labels snapshot when stored).
  const [agreements, setAgreements] = useState<Record<string, Agreement> | null>(null);
  const [openNow, setOpenNow] = useState<number | null>(null);
  // This labeller's done/total in each labelled pack.
  const [mineByPack, setMineByPack] = useState<Record<string, { done: number; total: number }>>({});
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setOpenNow(null);
    (async () => {
      try {
        const [rows, d] = await Promise.all([
          Promise.all(LABELLED_PACKS.map(async (p) => [p.id, await getAgreement(token, p.id)] as const)),
          getDisagreements(packId, token),
        ]);
        if (cancelled) return;
        setAgreements(Object.fromEntries(rows));
        setOpenNow(d.total ?? d.items.length);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, packId]);

  useEffect(() => {
    if (!token || !labeler) return;
    let cancelled = false;
    Promise.all(
      LABELLED_PACKS.map(async (p) => {
        const q = await getLabelQueue(p.id, labeler, token);
        return [p.id, { done: q.labeled ?? q.items.filter((i) => i.labeled).length, total: q.total ?? q.items.length }] as const;
      })
    )
      .then((rows) => !cancelled && setMineByPack(Object.fromEntries(rows)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, labeler]);

  const name = PACK_NAME[packId] ?? packId;
  const next = NEXT_PACK[packId];
  const agreement = agreements?.[packId] ?? null;
  // The stored first-labels snapshot (what Checker trust headlines) when the server has it; live labels otherwise.
  const first = (p: string) => agreements?.[p]?.original?.by_pack?.[p];
  const snap = first(packId);
  const hh = snap?.human_human ?? agreement?.human_human;
  const pc = snap?.pipeline_vs_consensus ?? agreement?.pipeline_vs_consensus;
  const hhN = snap?.n ?? agreement?.human_human?.n;
  const splitAtFirst = snap?.n != null && snap.human_human?.agreement != null ? Math.round(snap.n * (1 - snap.human_human.agreement)) : null;
  const when = snap ? 'first labels, before anyone reviewed a disagreement' : 'current labels';
  const split = agreement?.disagreements ?? [];
  const humanSplits = split.filter((d) => d.kind === 'human_vs_human');
  const pipelineSplits = split.filter((d) => d.kind === 'pipeline_vs_consensus');
  const otherPacks = Math.max(0, packs.length - LABELLED_PACKS.length);
  const complete = labeler != null && labelled != null && labelled >= total;

  const btn = 'rounded-[9px] border border-[var(--rule-2)] px-3.5 py-2 text-[0.875rem] text-[var(--ink)] hover:bg-[var(--panel-2)]';
  const primary = 'rounded-[9px] bg-[var(--ink)] px-3.5 py-2 text-[0.875rem] font-medium text-[var(--paper)] hover:opacity-90';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="lab-fade-up mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 py-8 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <div className={cn('text-[0.875rem] font-medium', complete ? 'text-[var(--ok)]' : 'text-[var(--ink-2)]')}>
              {complete ? 'Pack complete' : labeler ? `Labelling as ${labeler}` : 'Human labels · read-only'}
            </div>
            <h2 className="mt-1.5 text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">
              {complete ? `All ${total} labelled in ${name}` : `${name}: what two people said, and whether RAGSeal agreed`}
            </h2>
            <p className="mt-2 text-[0.90625rem] leading-relaxed text-[var(--ink-2)]">
              {complete
                ? 'Thanks. Here is how your labels compare with your teammate’s and with RAGSeal’s verdicts.'
                : `Two teammates marked each of the ${total} answers right or wrong without seeing RAGSeal’s verdict. Their agreed answers are the ground truth RAGSeal is checked against.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button onClick={onBrowse} className={labeler ? btn : primary}>
              {labeler ? 'Review my labels' : 'Browse answers'}
            </button>
            {onReview && (
              <button onClick={onReview} className={btn}>
                Review disagreements
              </button>
            )}
            {onLabel && (
              <button onClick={onLabel} className={btn}>
                Label as a teammate
              </button>
            )}
            {labeler && next && (
              <button onClick={() => onPackChange(next as PackId)} className={primary}>
                Next pack: {PACK_NAME[next]}
              </button>
            )}
          </div>
        </div>

        {error && !agreement ? (
          <LoadState loading={false} error={error} what="the agreement numbers" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SummaryStat
                value={labeler && labelled != null ? `${labelled} / ${total}` : `${agreement?.n_double_labeled ?? '—'}`}
                label={labeler ? 'answers you labelled' : 'answers labelled by both teammates'}
                bar={labeler && labelled != null ? labelled / Math.max(1, total) : undefined}
                note={labeler ? 'Every answer in the pack’s labelling run.' : 'Each one labelled twice, independently.'}
              />
              <SummaryStat
                value={pct(hh?.agreement)}
                label="teammates agree"
                note={`On ${hhN ?? '—'} answers · ${when}.`}
              />
              <SummaryStat
                value={pct(pc?.agreement)}
                label="RAGSeal agrees with the humans"
                tone={PASS}
                note={`On the ${pc?.n ?? '—'} answers both teammates agreed on · ${pc?.false_pass ?? 0} false passes · ${pc?.false_fail ?? 0} false fails · ${when}.`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
              <section className="lab-panel rounded-2xl p-5">
                <h3 className="text-[1rem] font-semibold tracking-[-0.01em]">Where people split</h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <SplitCount
                    n={openNow ?? humanSplits.length}
                    label="teammates still split"
                    hint={splitAtFirst != null ? `${splitAtFirst} at first labelling, before review` : 'after review'}
                  />
                  <SplitCount n={pipelineSplits.length} label="RAGSeal vs both teammates" hint="on answers both teammates agreed on" />
                </div>
                {split.length > 0 && (
                  <ul className="mt-4 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                    {split.slice(0, 4).map((d) => (
                      <li key={`${d.kind}-${d.test_id}`} className="flex items-start justify-between gap-3 py-2.5 text-[0.875rem]">
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-[var(--muted)]">{d.test_id}</span>{' '}
                          <span className="text-[var(--ink-1)]">{d.question}</span>
                          {d.humans && <span className="block text-xs text-[var(--ink-2)]">{d.humans}</span>}
                        </span>
                        <span className="shrink-0 rounded-full border border-[var(--rule)] px-2 py-0.5 text-[0.75rem] text-[var(--ink-2)]">
                          {d.kind === 'human_vs_human' ? 'humans split' : `RAGSeal: ${d.pipeline ? verdictStyle(d.pipeline).short : '—'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="lab-panel rounded-2xl p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[1rem] font-semibold tracking-[-0.01em]">Labelled packs</h3>
                  <span className="pr-[68px] text-[0.75rem] text-[var(--muted)]">teammates agree</span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {LABELLED_PACKS.map((p) => {
                    const mine = mineByPack[p.id];
                    const n = agreements?.[p.id]?.n_double_labeled;
                    const packTotal = packs.find((x) => x.id === p.id)?.questions;
                    const frac = mine ? mine.done / Math.max(1, mine.total) : n && packTotal ? Math.min(1, n / packTotal) : n ? 1 : 0;
                    const here = p.id === packId;
                    return (
                      <li key={p.id} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-[0.875rem] text-[var(--ink)]">{p.label}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-3)]">
                          <span className="block h-full rounded-full bg-[var(--ok)]" style={{ width: `${frac * 100}%` }} />
                        </span>
                        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-[var(--ink-2)]">
                          {mine ? `you ${mine.done} / ${mine.total}` : n != null ? `${n} double-labelled` : '—'}
                        </span>
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--ink-1)]" title="Teammates agree (first labels)">
                          {pct(first(p.id)?.human_human?.agreement ?? agreements?.[p.id]?.human_human?.agreement)}
                        </span>
                        <button
                          onClick={() => onPackChange(p.id)}
                          disabled={here}
                          className="w-14 shrink-0 rounded-md border border-[var(--rule)] py-1 text-xs text-[var(--ink-1)] hover:text-[var(--ink)] disabled:border-transparent disabled:text-[var(--muted)]"
                        >
                          {here ? 'Here' : 'Open'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 border-t border-[var(--rule)] pt-3 text-xs leading-relaxed text-[var(--ink-2)]">
                  Only these three packs have human labels: two teammates each labelled every answer in one run of each.
                  {otherPacks > 0 && ` The other ${otherPacks} packs are scored by RAGSeal alone.`} The headline agreement on
                  Checker trust is a stored snapshot of these first labels, so later edits here don’t change it.
                </p>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const SummaryStat: React.FC<{ value: string; label: string; note?: string; bar?: number; tone?: string }> = ({ value, label, note, bar, tone }) => (
  <div className="lab-panel rounded-2xl p-5">
    <div className="text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums" style={tone ? { color: tone } : undefined}>
      {value}
    </div>
    <div className="mt-2 text-[0.875rem] font-medium text-[var(--ink)]">{label}</div>
    {bar != null && (
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
        <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${Math.min(1, bar) * 100}%` }} />
      </div>
    )}
    {note && <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">{note}</p>}
  </div>
);

const SplitCount: React.FC<{ n: number; label: string; hint: string }> = ({ n, label, hint }) => (
  <div className="rounded-xl border border-[var(--rule)] px-4 py-3">
    <div className="text-2xl font-semibold tabular-nums tracking-[-0.02em]">{n}</div>
    <div className="mt-0.5 text-[0.875rem] text-[var(--ink)]">{label}</div>
    <div className="text-xs text-[var(--ink-2)]">{hint}</div>
  </div>
);

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-current px-1 font-mono text-[0.75rem] opacity-80">
    {children}
  </kbd>
);

const ActionBar: React.FC<{
  types: FailureType[];
  picking: boolean;
  saving: boolean;
  /** This labeller's current label on the item, if any: 'correct', a failure type or 'wrong'. */
  current?: string;
  labelled: boolean;
  onCorrect: () => void;
  onWrong: () => void;
  onType: (id: string) => void;
  onUnsure: () => void;
  onCancel: () => void;
  onSkip: () => void;
  onBack: () => void;
  backDisabled?: boolean;
  onNext: () => void;
  nextDisabled?: boolean;
}> = ({
  types,
  picking,
  saving,
  current,
  labelled,
  onCorrect,
  onWrong,
  onType,
  onUnsure,
  onCancel,
  onSkip,
  onBack,
  backDisabled,
  onNext,
  nextDisabled,
}) => {
  const currentType = current && current !== 'correct' && current !== 'wrong' ? current : undefined;
  const groups = useMemo(() => {
    const keyed = types.map((f, i) => ({ ...f, key: i + 1 }));
    return [
      { stage: 'Retriever', items: keyed.filter((f) => f.stage === 'retriever') },
      { stage: 'Generator', items: keyed.filter((f) => f.stage === 'generator') },
      { stage: '', items: keyed.filter((f) => f.stage !== 'retriever' && f.stage !== 'generator') },
    ].filter((g) => g.items.length);
  }, [types]);

  if (picking) {
    return (
      <div className="lab-panel lab-fade-up shrink-0 rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-4 text-[0.875rem]">
          <span className="text-[var(--ink)]">
            Why is it wrong? <span className="text-[var(--ink-2)]">Pick the closest reason. Not sure is a fine answer.</span>
          </span>
          <button onClick={onCancel} className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
            <Key>Esc</Key> back
          </button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {groups.map((g) => (
            <div key={g.stage || 'other'} className="flex flex-wrap items-center gap-2">
              {g.stage && <span className="mr-1 text-[0.75rem] text-[var(--muted)]">{g.stage}</span>}
              {g.items.map((f) => {
                const chosen = f.id === currentType;
                return (
                  <button
                    key={f.id}
                    onClick={() => onType(f.id)}
                    disabled={saving}
                    title={f.hint}
                    aria-pressed={chosen}
                    className="flex min-h-[52px] items-center gap-2.5 rounded-[9px] border px-3 py-2 text-left text-[0.875rem] text-[var(--ink)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] disabled:opacity-50"
                    style={{
                      borderColor: chosen ? STAGE_COLOR[f.stage] : tint(STAGE_COLOR[f.stage], 0.35),
                      background: chosen ? tint(STAGE_COLOR[f.stage], 0.12) : undefined,
                    }}
                  >
                    <span style={{ color: STAGE_COLOR[f.stage] }}>
                      <Key>{f.key}</Key>
                    </span>
                    <span className="flex flex-col items-start leading-tight">
                      <span>
                        {f.plain ?? f.label}
                        {chosen && <span className="ml-1.5 text-[0.75rem] text-[var(--ink-2)]">(your label)</span>}
                      </span>
                      <span className="text-[0.75rem] text-[var(--ink-2)]">{f.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <button
            onClick={onUnsure}
            disabled={saving}
            aria-pressed={current === 'wrong'}
            className="flex min-h-[52px] items-center gap-2.5 rounded-[9px] border border-[var(--rule-2)] px-3 py-2 text-left text-[0.875rem] text-[var(--ink)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] disabled:opacity-50"
            style={current === 'wrong' ? { borderColor: 'var(--ink-2)', background: 'color-mix(in srgb, var(--ink) 6%, transparent)' } : undefined}
          >
            <span className="text-[var(--ink-2)]">
              <Key>0</Key>
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span>
                Wrong, not sure why
                {current === 'wrong' && <span className="ml-1.5 text-[0.75rem] text-[var(--ink-2)]">(your label)</span>}
              </span>
              <span className="text-[0.75rem] text-[var(--ink-2)]">Still counts as wrong.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const isCorrect = current === 'correct';
  const isWrong = !!current && !isCorrect;
  return (
    <div className="flex shrink-0 items-stretch gap-3">
      <NavButton onClick={onBack} disabled={backDisabled} label="Previous answer">
        <ArrowLeft className="h-4 w-4" />
      </NavButton>
      <BigChoice color={PASS} onClick={onCorrect} disabled={saving} hotkey="1" selected={isCorrect} icon={<Check className="h-5 w-5" />}>
        Correct
      </BigChoice>
      <BigChoice color={RED} onClick={onWrong} disabled={saving} hotkey="2" selected={isWrong} icon={<X className="h-5 w-5" />}>
        Wrong
      </BigChoice>
      {labelled ? (
        <NavButton onClick={onNext} disabled={nextDisabled} label="Next answer">
          <ArrowRight className="h-4 w-4" />
        </NavButton>
      ) : (
        <button
          onClick={onSkip}
          className="flex h-14 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule)] px-4 text-[0.875rem] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <SkipForward className="h-4 w-4" /> Skip <span className="text-[var(--muted)]"><Key>S</Key></span>
        </button>
      )}
      <div className="ml-1 hidden items-center gap-1.5 self-center text-xs text-[var(--muted)] xl:flex">
        <Keyboard className="h-3.5 w-3.5" /> 1 · 2 · ← →
      </div>
    </div>
  );
};

const NavButton: React.FC<{ onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }> = ({
  onClick,
  disabled,
  label,
  children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--rule)] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35"
  >
    {children}
  </button>
);

const BigChoice: React.FC<{
  color: string;
  hotkey: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}> = ({ color, hotkey, icon, onClick, disabled, selected, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-pressed={selected}
    className={cn(
      'flex h-14 min-w-0 flex-1 items-center justify-center gap-3 rounded-xl border text-[1rem] font-semibold transition-colors disabled:opacity-50'
    )}
    style={{
      borderColor: selected ? color : tint(color, 0.45),
      borderWidth: selected ? 2 : 1,
      background: tint(color, selected ? 0.18 : 0.07),
      color,
    }}
  >
    {icon}
    {children}
    {selected && <span className="text-[0.8125rem] font-medium opacity-80">· your label</span>}
    <Key>{hotkey}</Key>
  </button>
);

const WaitingForRun: React.FC<{ p: RunProgress }> = ({ p }) => {
  const frac = p.total ? Math.min(1, (p.done ?? 0) / p.total) : 0;
  return (
    <div className="lab-panel mx-auto max-w-xl rounded-2xl p-7">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">Waiting for this pack's run to finish</h2>
      <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
        A run over the full question set is still scoring answers. Labelling starts on that run so both of you label the
        same answers. This page refreshes on its own.
      </p>
      <div className="mt-5 flex items-baseline justify-between text-[0.875rem]">
        <span className="font-mono text-xs text-[var(--ink-2)]">{p.batch_id}</span>
        <span className="tabular-nums text-[var(--ink-1)]">
          {p.done ?? 0} / {p.total ?? '—'} answers
          {p.eta_ms != null && <span className="text-[var(--ink-2)]"> · about {fmtDuration(p.eta_ms)} left</span>}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
        <div className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-700" style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
};
