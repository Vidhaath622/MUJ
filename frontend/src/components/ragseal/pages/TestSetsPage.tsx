import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Play, Sparkles, Upload } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { DocumentResponse, fetchDocuments, generateSynthetic, uploadDocument } from '../../../lib/api';
import { TopBarControls } from '../shell/AppShell';
import { LabResult } from '../lab/useLabData';
import { pct, VERDICT_ORDER, VERDICTS, verdictStyle } from '../lab/verdict';
import { CaseDrawer } from '../shared/CaseDrawer';
import { errorText, evaluateTestSet, GeneratedCase, RunProgress, RunSummary } from '../shared/apiExtra';
import { EmptyState, ErrorBanner, GhostButton, LoadState, Panel, PrimaryButton } from '../shared/ui';

const COUNTS = [5, 10, 15];

const TYPE_LABEL: Record<string, string> = {
  factoid: 'Factual',
  unanswerable: 'Not in documents',
  stale: 'Outdated-version trap',
  distractor: 'Distractor trap',
};

interface TestSetsPageProps {
  token: string | null;
}

/** Deliverable #2: upload documents, generate test questions with known answers, evaluate them. */
export const TestSetsPage: React.FC<TestSetsPageProps> = ({ token }) => {
  const [docs, setDocs] = useState<DocumentResponse[] | null>(null);
  const [docsErr, setDocsErr] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [count, setCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [cases, setCases] = useState<GeneratedCase[] | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [open, setOpen] = useState<LabResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshDocs = async (selectId?: string) => {
    if (!token) return;
    try {
      const list = await fetchDocuments(token);
      setDocs(list);
      setDocsErr(null);
      if (selectId) setSelected(selectId);
      else if (!selected && list.length) setSelected(list[0].document_id);
    } catch (err) {
      setDocsErr(err);
    }
  };

  useEffect(() => {
    refreshDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doc = docs?.find((d) => d.document_id === selected);
  const filenames = useMemo(() => Object.fromEntries((docs ?? []).map((d) => [d.document_id, d.filename])), [docs]);

  const upload = async (file: File) => {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const d = await uploadDocument(file, token);
      await refreshDocs(d.document_id);
      setCases(null);
      setRun(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const generate = async () => {
    if (!token || !selected) return;
    setGenerating(true);
    setError(null);
    setRun(null);
    try {
      const res = await generateSynthetic(selected, count, token);
      setCases(res.test_cases as GeneratedCase[]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGenerating(false);
    }
  };

  const evaluate = async () => {
    if (!token || !selected || !cases?.length) return;
    setEvaluating(true);
    setProgress(null);
    setError(null);
    try {
      setRun(await evaluateTestSet([selected], cases, token, setProgress));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setEvaluating(false);
      setProgress(null);
    }
  };

  const results = (run?.results ?? []) as LabResult[];
  const resultFor = (testId: string) => results.find((r) => r.test_id === testId);

  return (
    <div className="mx-auto flex h-full max-w-[1320px] min-h-0 flex-col gap-5 px-6 py-6">
      <TopBarControls>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.md,.txt,.markdown,.html,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
        />
        <GhostButton onClick={() => fileInput.current?.click()} disabled={!token || uploading}>
          <Upload className="h-3.5 w-3.5 text-[#8A9099]" />
          {uploading ? 'Uploading…' : 'Upload document'}
        </GhostButton>
      </TopBarControls>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* Documents */}
        <Panel title="Documents" note={docs ? `${docs.length}` : undefined} bodyClassName="min-h-0 overflow-y-auto p-2">
          {!docs ? (
            <LoadState loading={!docsErr} error={docsErr} what="documents" />
          ) : docs.length === 0 ? (
            <EmptyState title="No documents yet">Upload a PDF, Markdown or text file to generate questions from it.</EmptyState>
          ) : (
            <ul className="space-y-0.5">
              {docs.map((d) => {
                const active = d.document_id === selected;
                return (
                  <li key={d.document_id}>
                    <button
                      onClick={() => {
                        setSelected(d.document_id);
                        setCases(null);
                        setRun(null);
                      }}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-[#16181C]' : 'hover:bg-white/[0.02]'
                      )}
                    >
                      <FileText className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-white' : 'text-[#6F757E]')} />
                      <span className="min-w-0">
                        <span className={cn('block truncate text-[13px]', active ? 'text-white' : 'text-[#C9CDD3]')}>{d.filename}</span>
                        <span className="text-[11px] text-[#8A9099]">
                          {d.chunk_count} chunks · <span className="font-mono">{d.document_id}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Generator + results */}
        <div className="flex min-h-0 flex-col gap-4">
          <section className="lab-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-[#8A9099]">Generate test questions from</div>
                <div className="mt-1 truncate text-[17px] font-semibold tracking-[-0.01em]">{doc?.filename ?? 'Pick a document'}</div>
                <div className="mt-1 text-xs text-[#8A9099]">
                  Each question has a known answer and the chunk it comes from; traps (not in the document) are mixed in.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 rounded-[10px] border border-[#1C1F24] p-[3px] text-[13px]" role="radiogroup" aria-label="How many questions">
                  {COUNTS.map((c) => (
                    <button
                      key={c}
                      role="radio"
                      aria-checked={count === c}
                      onClick={() => setCount(c)}
                      className={cn(
                        'rounded-[7px] px-3 py-[5px] tabular-nums transition-colors',
                        count === c ? 'bg-[#1C1F24] text-white' : 'text-[#8A9099] hover:text-[#E8EAED]'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <PrimaryButton onClick={generate} busy={generating} disabled={!selected || !token}>
                  {!generating && <Sparkles className="h-3.5 w-3.5" />}
                  {generating ? 'Generating…' : 'Generate questions'}
                </PrimaryButton>
              </div>
            </div>
          </section>

          <Panel
            title={cases ? `${cases.length} generated questions` : 'Generated questions'}
            note={
              cases?.length ? (
                <span className="flex items-center gap-3">
                  {run && <RunStrip run={run} />}
                  <PrimaryButton onClick={evaluate} busy={evaluating} className="h-[30px]">
                    {!evaluating && <Play className="h-3 w-3 fill-current" />}
                    {evaluating
                      ? progress?.total
                        ? `Scoring ${progress.done ?? 0}/${progress.total}`
                        : 'Scoring…'
                      : run
                        ? 'Evaluate again'
                        : 'Evaluate these'}
                  </PrimaryButton>
                </span>
              ) : undefined
            }
            className="min-h-0 flex-1"
            bodyClassName="min-h-0 overflow-y-auto p-0"
          >
            {!cases ? (
              <EmptyState className="m-5" title={generating ? 'Reading the document and writing questions…' : 'No questions yet'}>
                {!generating && 'Pick a document and generate. Takes a few seconds per question.'}
              </EmptyState>
            ) : cases.length === 0 ? (
              <EmptyState className="m-5" title="The generator returned no questions">
                Try a longer document or a larger count.
              </EmptyState>
            ) : (
              <ul>
                {cases.map((c) => {
                  const r = resultFor(c.test_id);
                  const v = r ? verdictStyle(r.root_cause?.category ?? r.category) : null;
                  return (
                    <li key={c.test_id} className="border-b border-[#14161A] last:border-0">
                      <button
                        disabled={!r}
                        onClick={() => r && setOpen(r)}
                        className={cn('grid w-full grid-cols-[1fr_auto] gap-6 px-5 py-3.5 text-left', r && 'hover:bg-white/[0.02]')}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[11px] text-[#8A9099]">
                            <span className="font-mono">{c.test_id}</span>
                            {c.type && <span>· {TYPE_LABEL[c.type] ?? c.type}</span>}
                          </span>
                          <span className="mt-1 block text-[14px] text-[#E8EAED]">{c.question}</span>
                          <span className="mt-1 block text-[13px] text-[#8A9099]">
                            Known answer: <span className="text-[#C9CDD3]">{c.ground_truth_answer || '— (should abstain)'}</span>
                          </span>
                          {c.context_snippet && (
                            <span className="mt-1.5 block truncate border-l-2 border-[#22252B] pl-2.5 text-xs text-[#6F757E]">
                              {c.context_snippet}
                            </span>
                          )}
                        </span>
                        <span className="w-[120px] text-right text-xs">
                          {v ? (
                            <>
                              <span className="flex items-center justify-end gap-1.5 font-medium" style={{ color: v.color }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                                {v.label}
                              </span>
                              <span className="mt-1 block tabular-nums text-[#8A9099]">acc {pct(r?.metrics?.answer_accuracy?.score)}</span>
                            </>
                          ) : (
                            <span className="text-[#5A5F67]">not scored</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <CaseDrawer result={open} filenames={filenames} onClose={() => setOpen(null)} />
    </div>
  );
};

const RunStrip: React.FC<{ run: RunSummary }> = ({ run }) => {
  const b = run.root_cause_breakdown ?? {};
  return (
    <span className="flex items-center gap-2.5 text-xs">
      <span className="font-semibold tabular-nums text-white">{pct(run.aggregates?.pass_rate)}</span>
      <span className="text-[#8A9099]">accurate</span>
      {VERDICT_ORDER.filter((k) => b[k] && k !== 'CLEAN_PASS').map((k) => (
        <span key={k} style={{ color: VERDICTS[k].color }}>
          {b[k]} {VERDICTS[k].short.toLowerCase()}
        </span>
      ))}
    </span>
  );
};
