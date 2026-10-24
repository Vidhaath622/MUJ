import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Keyboard, SkipForward, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { TopBarControls } from '../shell/AppShell';
import { PASS, RED, tint } from '../lab/verdict';
import { DisagreementItem, errorText, getDisagreements, getLabelQueue, getProgress, LabelItem, listRuns, postLabel, RunProgress } from '../shared/apiExtra';
import { FAILURE_TYPES, FailureType, failureLabel, STAGE_COLOR } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, fmtDuration, LoadState, PackSwitcher } from '../shared/ui';

const LABELERS = ['Sarthak', 'Vidhaath'];
const LABELER_KEY = 'ragseal.labeler';

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
 */
const PACK_NAME: Record<string, string> = { recruitment: 'Recruitment', banking: 'Banking', healthcare: 'Healthcare' };
const NEXT_PACK: Record<string, string | undefined> = { recruitment: 'banking', banking: 'healthcare', healthcare: 'recruitment' };

export const LabelStudioPage: React.FC<LabelStudioPageProps> = ({ token, packId, onPackChange }) => {
  const [labeler, setLabeler] = useState<string | null>(readLabeler);
  const [items, setItems] = useState<LabelItem[] | null>(null);
  // Review mode: only the answers the two labellers disagreed on, for a second look.
  const [review, setReview] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [index, setIndex] = useState(0);
  // After everything is labelled the queue shows a completion card; "Review my labels" browses 1..N.
  const [browsing, setBrowsing] = useState(false);
  const [done, setDone] = useState<Record<string, 'correct' | string>>({});
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
    if (!token || !labeler) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setDone({});
    setPickingType(false);
    (async () => {
      try {
        if (review) {
          const d = await getDisagreements(packId, token);
          if (cancelled) return;
          if (d.failure_types) setTypes(typesFrom(d.failure_types));
          setWaitingFor(null);
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
        q.items.forEach((it) => it.labeled && (already[it.test_id] = 'labeled'));
        setDone(already);
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

  const submit = useCallback(
    async (correct: boolean, failureType: string | null) => {
      if (!item || !token || !labeler || saving) return;
      setSaving(true);
      setError(null);
      try {
        await postLabel(
          { test_id: item.test_id, batch_id: item.batch_id, labeler, correct, failure_type: failureType, note: note.trim() || undefined },
          token
        );
        const value = correct ? 'correct' : failureType ?? 'wrong';
        setDone((d) => ({ ...d, [item.test_id]: value }));
        advance();
      } catch (err) {
        setError(errorText(err));
      } finally {
        setSaving(false);
      }
    },
    [item, token, labeler, saving, note, advance]
  );

  // Keyboard: 1 correct, 2 wrong → 1-9 failure type, Esc back, S skip, ← previous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !item) return;
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
  }, [item, items, pickingType, submit, advance, types, goTo, index]);

  const knownAnswer = item?.ground_truth ?? item?.ground_truth_answer;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBarControls>
        {labeler && (
          <button
            onClick={() => {
              saveLabeler(null);
              setLabeler(null);
            }}
            className="text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            Labeling as <span className="font-medium text-[var(--ink)]">{labeler}</span> · switch
          </button>
        )}
        {labeler && (
          <button
            onClick={() => setReview((r) => !r)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition-colors',
              review
                ? 'border-[var(--retr)] bg-[color:color-mix(in_srgb,var(--retr)_12%,transparent)] text-[var(--ink)]'
                : 'border-[var(--rule)] text-[var(--ink-2)] hover:text-[var(--ink)]'
            )}
          >
            {review ? 'Reviewing disagreements · back to labelling' : 'Review disagreements'}
          </button>
        )}
        <PackSwitcher value={packId} onChange={onPackChange} />
      </TopBarControls>

      {!labeler ? (
        <ChooseLabeler
          onChoose={(name) => {
            saveLabeler(name);
            setLabeler(name);
          }}
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
      ) : showComplete ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="lab-panel lab-fade-up w-full max-w-lg rounded-2xl p-7 text-center">
            <div className="text-xs uppercase tracking-[0.12em] text-[var(--ok)]">Pack complete</div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.01em] text-[var(--ink)]">
              All {items.length} labelled in {PACK_NAME[packId] ?? packId}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              Thanks. You can go back over your labels, check the answers you and your teammate disagreed on, or move on.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <button
                onClick={() => {
                  setBrowsing(true);
                  goTo(0);
                }}
                className="rounded-[9px] border border-[var(--rule-2)] px-3.5 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--panel-2)]"
              >
                Review my labels
              </button>
              <button
                onClick={() => setReview(true)}
                className="rounded-[9px] border border-[var(--rule-2)] px-3.5 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--panel-2)]"
              >
                Review disagreements
              </button>
              {NEXT_PACK[packId] && (
                <button
                  onClick={() => onPackChange(NEXT_PACK[packId] as PackId)}
                  className="rounded-[9px] bg-[var(--ink)] px-3.5 py-2 text-[13px] font-medium text-[var(--paper)] hover:opacity-90"
                >
                  Next pack: {PACK_NAME[NEXT_PACK[packId] as string]}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        item && (
          <div className="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col gap-4 px-6 py-5">
            {review ? (
              <ReviewNote item={item as DisagreementItem} labeler={labeler} left={items.length - labeledCount} />
            ) : (
              <Progress labeled={labeledCount} total={items.length} index={index} />
            )}
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            <div key={item.test_id} className="page-enter grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
              <section className="lab-panel flex min-h-0 flex-col rounded-2xl p-6">
                <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
                  <span className="font-mono">{item.test_id}</span>
                  {done[item.test_id] && (
                    <span className="text-[var(--ok)]">
                      · {done[item.test_id] === 'labeled' ? 'already labelled' : `you said ${done[item.test_id] === 'correct' ? 'Correct' : `Wrong${done[item.test_id] === 'wrong' ? '' : ` · ${failureLabel(done[item.test_id])}`}`}`}
                      <span className="text-[var(--ink-2)]"> (press 1 / 2 to change)</span>
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">{item.question}</h2>

                <div className="mt-6 text-xs text-[var(--ink-2)]">Known answer</div>
                <p className="mt-1 text-[15px] leading-relaxed text-[var(--ink-1)]">
                  {item.expected_abstain
                    ? 'Not in the documents. The right reply is to say so, not to answer.'
                    : knownAnswer || '— (none given)'}
                </p>

                <div className="mt-6 text-xs text-[var(--ink-2)]">Model answer</div>
                <p className="mt-1 overflow-y-auto whitespace-pre-wrap text-[17px] leading-relaxed tracking-[-0.01em] text-[var(--ink)]">
                  {item.generated_answer || '— (no answer)'}
                </p>

                <div className="mt-auto pt-6">
                  <label className="flex h-9 items-center gap-2 rounded-[9px] border border-[var(--rule-2)] bg-[var(--paper)] px-3">
                    <span className="sr-only">Note</span>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note (Esc to leave the field)"
                      className="h-full flex-1 bg-transparent text-[13px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
                    />
                  </label>
                </div>
              </section>

              <section className="lab-panel-flat flex min-h-0 flex-col overflow-hidden rounded-2xl">
                <div className="flex items-baseline justify-between border-b border-[var(--rule)] px-5 py-3.5 text-[13px]">
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
                      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink-1)]">
                        {c.text.replace(/^#+\s.*\n+/, '')}
                      </p>
                    </article>
                  ))}
                  {!item.retrieved_chunks?.length && <p className="text-sm text-[var(--ink-2)]">No chunks were retrieved.</p>}
                </div>
              </section>
            </div>

            <ActionBar
              types={types}
              picking={pickingType}
              saving={saving}
              onCorrect={() => submit(true, null)}
              onWrong={() => setPickingType(true)}
              onType={(id) => submit(false, id)}
              onCancel={() => setPickingType(false)}
              onSkip={advance}
              onBack={() => goTo(index - 1)}
              backDisabled={index === 0}
            />
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--retr)] bg-[color:color-mix(in_srgb,var(--retr)_8%,transparent)] px-4 py-2.5 text-[13px]">
      <span className="text-[var(--ink)]">
        You said <span className="font-semibold">{said}</span>. Your teammate disagreed. Look again: press{' '}
        <span className="font-mono">1</span> for correct or <span className="font-mono">2</span> for wrong. Your new answer replaces the old one.
      </span>
      <span className="font-semibold tabular-nums text-[var(--ink)]">{Math.max(0, left)} disagreements left</span>
    </div>
  );
};

const ChooseLabeler: React.FC<{ onChoose: (name: string) => void }> = ({ onChoose }) => (
  <div className="flex h-full items-center justify-center p-6">
    <div className="lab-panel lab-fade-up w-full max-w-md rounded-2xl p-7">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">Who is labeling?</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
        Two people label the same answers independently. Only answers you both agree on count as ground truth for
        checking the pipeline.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {LABELERS.map((name) => (
          <button
            key={name}
            onClick={() => onChoose(name)}
            className="h-12 rounded-xl border border-[var(--rule-2)] text-[15px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--rule-3)] hover:bg-[color:color-mix(in_srgb,var(--ink)_2%,transparent)]"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  </div>
);

const Progress: React.FC<{ labeled: number; total: number; index: number }> = ({ labeled, total, index }) => (
  <div className="flex items-center gap-4">
    <div className="text-[13px] text-[var(--ink-1)]">
      <span className="font-semibold tabular-nums text-[var(--ink)]">{labeled}</span>
      <span className="text-[var(--ink-2)]"> of {total} labeled</span>
    </div>
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-3)]">
      <div className="h-full rounded-full bg-[var(--ok)] transition-[width] duration-500" style={{ width: `${(labeled / total) * 100}%` }} />
    </div>
    <div className="text-xs tabular-nums text-[var(--ink-2)]">
      item {index + 1} / {total}
    </div>
  </div>
);

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-current px-1 font-mono text-[11px] opacity-80">
    {children}
  </kbd>
);

const ActionBar: React.FC<{
  types: FailureType[];
  picking: boolean;
  saving: boolean;
  onCorrect: () => void;
  onWrong: () => void;
  onType: (id: string) => void;
  onCancel: () => void;
  onSkip: () => void;
  onBack: () => void;
  backDisabled?: boolean;
}> = ({ types, picking, saving, onCorrect, onWrong, onType, onCancel, onSkip, onBack, backDisabled }) => {
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
      <div className="lab-panel lab-fade-up rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between text-[13px]">
          <span className="text-[var(--ink)]">
            Why is it wrong? <span className="text-[var(--ink-2)]">Press a number, or <Key>0</Key> if you're not sure (that still counts).</span>
          </span>
          <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
            <Key>Esc</Key> back
          </button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {groups.map((g) => (
            <div key={g.stage || 'other'} className="flex flex-wrap items-center gap-2">
              {g.stage && <span className="mr-1 text-[11px] text-[var(--muted)]">{g.stage}</span>}
              {g.items.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onType(f.id)}
                  disabled={saving}
                  title={f.hint}
                  className="flex min-h-[52px] items-center gap-2.5 rounded-[9px] border px-3 py-2 text-left text-[13px] text-[var(--ink)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] disabled:opacity-50"
                  style={{ borderColor: tint(STAGE_COLOR[f.stage], 0.35) }}
                >
                  <span style={{ color: STAGE_COLOR[f.stage] }}>
                    <Key>{f.key}</Key>
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span>{f.plain ?? f.label}</span>
                    <span className="text-[11px] text-[var(--ink-2)]">{f.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        disabled={backDisabled}
        className="flex h-14 items-center gap-2 rounded-xl border border-[var(--rule)] px-4 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Previous item"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <BigChoice color={PASS} onClick={onCorrect} disabled={saving} hotkey="1" icon={<Check className="h-5 w-5" />}>
        Correct
      </BigChoice>
      <BigChoice color={RED} onClick={onWrong} disabled={saving} hotkey="2" icon={<X className="h-5 w-5" />}>
        Wrong
      </BigChoice>
      <button
        onClick={onSkip}
        className="flex h-14 items-center gap-2 rounded-xl border border-[var(--rule)] px-4 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink)]"
      >
        <SkipForward className="h-4 w-4" /> Skip <span className="text-[var(--muted)]"><Key>S</Key></span>
      </button>
      <div className="ml-2 hidden items-center gap-1.5 text-xs text-[var(--muted)] xl:flex">
        <Keyboard className="h-3.5 w-3.5" /> ← previous
      </div>
    </div>
  );
};

const BigChoice: React.FC<{
  color: string;
  hotkey: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ color, hotkey, icon, onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn('flex h-14 flex-1 items-center justify-center gap-3 rounded-xl border text-[15px] font-semibold transition-colors disabled:opacity-50')}
    style={{ borderColor: tint(color, 0.45), background: tint(color, 0.08), color }}
  >
    {icon}
    {children}
    <Key>{hotkey}</Key>
  </button>
);

const WaitingForRun: React.FC<{ p: RunProgress }> = ({ p }) => {
  const frac = p.total ? Math.min(1, (p.done ?? 0) / p.total) : 0;
  return (
    <div className="lab-panel mx-auto max-w-xl rounded-2xl p-7">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">Waiting for this pack's run to finish</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
        A run over the full question set is still scoring answers. Labelling starts on that run so both of you label the
        same answers. This page refreshes on its own.
      </p>
      <div className="mt-5 flex items-baseline justify-between text-[13px]">
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
