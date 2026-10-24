import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Keyboard, SkipForward, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PackId } from '../../../types/ragseal';
import { TopBarControls } from '../shell/AppShell';
import { PASS, RED, tint } from '../lab/verdict';
import { errorText, getLabelQueue, LabelItem, postLabel } from '../shared/apiExtra';
import { FAILURE_TYPES, STAGE_COLOR } from '../shared/taxonomy';
import { EmptyState, ErrorBanner, LoadState, PackSwitcher } from '../shared/ui';

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
export const LabelStudioPage: React.FC<LabelStudioPageProps> = ({ token, packId, onPackChange }) => {
  const [labeler, setLabeler] = useState<string | null>(readLabeler);
  const [items, setItems] = useState<LabelItem[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Record<string, 'correct' | string>>({});
  const [pickingType, setPickingType] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !labeler) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setDone({});
    setPickingType(false);
    getLabelQueue(packId, labeler, token)
      .then((q) => {
        if (cancelled) return;
        setItems(q.items);
        const already: Record<string, string> = {};
        q.items.forEach((it) => it.labeled && (already[it.test_id] = 'labeled'));
        setDone(already);
        const firstOpen = q.items.findIndex((it) => !it.labeled);
        setIndex(firstOpen === -1 ? 0 : firstOpen);
      })
      .catch((err) => !cancelled && setLoadError(err));
    return () => {
      cancelled = true;
    };
  }, [token, labeler, packId]);

  const item = items?.[index];
  const labeledCount = Object.keys(done).length;

  const advance = useCallback(() => {
    if (!items) return;
    setPickingType(false);
    setNote('');
    // Next unlabeled item after this one, wrapping around; stay put when all are done.
    for (let step = 1; step <= items.length; step++) {
      const j = (index + step) % items.length;
      if (!done[items[j].test_id] || step === items.length) {
        setIndex(j);
        return;
      }
    }
  }, [items, index, done]);

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
        setDone((d) => ({ ...d, [item.test_id]: correct ? 'correct' : failureType ?? 'wrong' }));
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
        if (n >= 1 && n <= FAILURE_TYPES.length) {
          e.preventDefault();
          submit(false, FAILURE_TYPES[n - 1].id);
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
        setPickingType(false);
        setIndex((i) => (i - 1 + items.length) % items.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, items, pickingType, submit, advance]);

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
            className="text-xs text-[#8A9099] hover:text-white"
          >
            Labeling as <span className="font-medium text-[#E8EAED]">{labeler}</span> · switch
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
      ) : items.length === 0 ? (
        <div className="p-6">
          <EmptyState title="Nothing to label for this pack">
            The queue fills from the pack's latest finished run. Run the pack first, then come back.
          </EmptyState>
        </div>
      ) : (
        item && (
          <div className="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col gap-4 px-6 py-5">
            <Progress labeled={labeledCount} total={items.length} index={index} />
            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            <div key={item.test_id} className="lab-fade-up grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
              <section className="lab-panel flex min-h-0 flex-col rounded-2xl p-6">
                <div className="flex items-center gap-2 text-xs text-[#8A9099]">
                  <span className="font-mono">{item.test_id}</span>
                  {done[item.test_id] && <span className="text-[#3DD68C]">· labeled</span>}
                </div>
                <h2 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.02em] text-white">{item.question}</h2>

                <div className="mt-6 text-xs text-[#8A9099]">Known answer</div>
                <p className="mt-1 text-[15px] leading-relaxed text-[#C9CDD3]">{knownAnswer || '— (none given)'}</p>

                <div className="mt-6 text-xs text-[#8A9099]">Model answer</div>
                <p className="mt-1 overflow-y-auto whitespace-pre-wrap text-[17px] leading-relaxed tracking-[-0.01em] text-[#F4F5F6]">
                  {item.generated_answer || '— (no answer)'}
                </p>

                <div className="mt-auto pt-6">
                  <label className="flex h-9 items-center gap-2 rounded-[9px] border border-[#22252B] bg-[#08090B] px-3">
                    <span className="sr-only">Note</span>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note (Esc to leave the field)"
                      className="h-full flex-1 bg-transparent text-[13px] text-[#E8EAED] placeholder:text-[#6F757E] focus:outline-none"
                    />
                  </label>
                </div>
              </section>

              <section className="lab-panel-flat flex min-h-0 flex-col overflow-hidden rounded-2xl">
                <div className="flex items-baseline justify-between border-b border-[#17191D] px-5 py-3.5 text-[13px]">
                  <span className="font-medium">What the model was given</span>
                  <span className="text-xs text-[#8A9099]">{item.retrieved_chunks?.length ?? 0} chunks</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                  {(item.retrieved_chunks ?? []).map((c, i) => (
                    <article key={c.chunk_id ?? i} className="rounded-xl border border-[#1A1D22] px-3.5 py-3">
                      <div className="flex gap-2 text-xs">
                        <span className="truncate text-[#C9CDD3]">{c.filename ?? c.document_name ?? c.document_id ?? 'document'}</span>
                        <span className="font-mono text-[#6F757E]">{c.chunk_id}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#B4B9C0]">
                        {c.text.replace(/^#+\s.*\n+/, '')}
                      </p>
                    </article>
                  ))}
                  {!item.retrieved_chunks?.length && <p className="text-sm text-[#8A9099]">No chunks were retrieved.</p>}
                </div>
              </section>
            </div>

            <ActionBar
              picking={pickingType}
              saving={saving}
              onCorrect={() => submit(true, null)}
              onWrong={() => setPickingType(true)}
              onType={(id) => submit(false, id)}
              onCancel={() => setPickingType(false)}
              onSkip={advance}
              onBack={() => {
                setPickingType(false);
                setIndex((i) => (i - 1 + items.length) % items.length);
              }}
            />
          </div>
        )
      )}
    </div>
  );
};

const ChooseLabeler: React.FC<{ onChoose: (name: string) => void }> = ({ onChoose }) => (
  <div className="flex h-full items-center justify-center p-6">
    <div className="lab-panel lab-fade-up w-full max-w-md rounded-2xl p-7">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">Who is labeling?</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#8A9099]">
        Two people label the same answers independently. Only answers you both agree on count as ground truth for
        checking the pipeline.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {LABELERS.map((name) => (
          <button
            key={name}
            onClick={() => onChoose(name)}
            className="h-12 rounded-xl border border-[#22252B] text-[15px] font-medium text-[#E8EAED] transition-colors hover:border-[#3A3E45] hover:bg-white/[0.02]"
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
    <div className="text-[13px] text-[#C9CDD3]">
      <span className="font-semibold tabular-nums text-white">{labeled}</span>
      <span className="text-[#8A9099]"> of {total} labeled</span>
    </div>
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#16181C]">
      <div className="h-full rounded-full bg-[#3DD68C] transition-[width] duration-500" style={{ width: `${(labeled / total) * 100}%` }} />
    </div>
    <div className="text-xs tabular-nums text-[#8A9099]">
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
  picking: boolean;
  saving: boolean;
  onCorrect: () => void;
  onWrong: () => void;
  onType: (id: string) => void;
  onCancel: () => void;
  onSkip: () => void;
  onBack: () => void;
}> = ({ picking, saving, onCorrect, onWrong, onType, onCancel, onSkip, onBack }) => {
  const groups = useMemo(
    () => [
      { stage: 'Retriever', items: FAILURE_TYPES.map((f, i) => ({ ...f, key: i + 1 })).filter((f) => f.stage === 'retriever') },
      { stage: 'Generator', items: FAILURE_TYPES.map((f, i) => ({ ...f, key: i + 1 })).filter((f) => f.stage === 'generator') },
      { stage: '', items: FAILURE_TYPES.map((f, i) => ({ ...f, key: i + 1 })).filter((f) => f.stage === 'none') },
    ],
    []
  );

  if (picking) {
    return (
      <div className="lab-panel lab-fade-up rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between text-[13px]">
          <span className="text-[#E8EAED]">
            What went wrong? <span className="text-[#8A9099]">Press the number.</span>
          </span>
          <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-[#8A9099] hover:text-white">
            <Key>Esc</Key> back
          </button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {groups.map((g) => (
            <div key={g.stage || 'other'} className="flex flex-wrap items-center gap-2">
              {g.stage && <span className="mr-1 text-[11px] text-[#6F757E]">{g.stage}</span>}
              {g.items.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onType(f.id)}
                  disabled={saving}
                  title={f.hint}
                  className="flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[13px] text-[#E8EAED] transition-colors hover:bg-white/[0.03] disabled:opacity-50"
                  style={{ borderColor: tint(STAGE_COLOR[f.stage], 0.35) }}
                >
                  <span style={{ color: STAGE_COLOR[f.stage] }}>
                    <Key>{f.key}</Key>
                  </span>
                  {f.label}
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
        className="flex h-14 items-center gap-2 rounded-xl border border-[#1A1D22] px-4 text-[13px] text-[#8A9099] hover:text-white"
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
        className="flex h-14 items-center gap-2 rounded-xl border border-[#1A1D22] px-4 text-[13px] text-[#8A9099] hover:text-white"
      >
        <SkipForward className="h-4 w-4" /> Skip <span className="text-[#6F757E]"><Key>S</Key></span>
      </button>
      <div className="ml-2 hidden items-center gap-1.5 text-xs text-[#6F757E] xl:flex">
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
