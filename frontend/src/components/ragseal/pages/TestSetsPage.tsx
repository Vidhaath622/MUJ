import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FileText, ListChecks, Play, Sparkles, Upload } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { DocumentResponse, fetchDocuments, generateSynthetic, uploadDocument } from '../../../lib/api';
import { LabResult } from '../lab/useLabData';
import { pct, VERDICT_ORDER, VERDICTS, verdictStyle } from '../lab/verdict';
import { CaseDrawer } from '../shared/CaseDrawer';
import { DocumentDetail, errorText, evaluateTestSet, GeneratedCase, getDocument, RunProgress, RunSummary } from '../shared/apiExtra';
import { EmptyState, ErrorBanner, LoadState, PACK_LABEL, PrimaryButton } from '../shared/ui';

const COUNTS = [5, 10, 15];
const ACCEPT = '.pdf,.md,.txt,.markdown';

const TYPE_LABEL: Record<string, string> = {
  factoid: 'Normal question',
  unanswerable: 'Trick: not in the document',
  stale: 'Trick: outdated version',
  distractor: 'Trick: similar text elsewhere',
};

interface TestSetsPageProps {
  token: string | null;
}

/**
 * Documents & questions (deliverable #2): drop a document in, read it, generate test
 * questions with known answers from it, then check the bot on those questions.
 */
export const TestSetsPage: React.FC<TestSetsPageProps> = ({ token }) => {
  const [docs, setDocs] = useState<DocumentResponse[] | null>(null);
  const [docsErr, setDocsErr] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [detailErr, setDetailErr] = useState<unknown>(null);
  const [tab, setTab] = useState<'read' | 'questions'>('read');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(5);
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

  useEffect(() => {
    if (!token || !selected) return;
    let cancelled = false;
    setDetail(null);
    setDetailErr(null);
    getDocument(selected, token)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setDetailErr(err));
    return () => {
      cancelled = true;
    };
  }, [selected, token]);

  const doc = docs?.find((d) => d.document_id === selected);
  const filenames = useMemo(() => Object.fromEntries((docs ?? []).map((d) => [d.document_id, d.filename])), [docs]);
  // Your uploads first, then the sample packs' documents.
  const sorted = useMemo(
    () => [...(docs ?? [])].sort((a, b) => Number(!!(a as { pack_id?: string }).pack_id) - Number(!!(b as { pack_id?: string }).pack_id)),
    [docs]
  );

  const pick = (id: string) => {
    setSelected(id);
    setCases(null);
    setRun(null);
    setTab('read');
  };

  const upload = async (file: File) => {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const d = await uploadDocument(file, token);
      await refreshDocs(d.document_id);
      setCases(null);
      setRun(null);
      setTab('read');
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
    setTab('questions');
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
    <div className="mx-auto flex h-full min-h-0 max-w-[1320px] flex-col gap-4 px-6 py-5">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        {/* Left: drop zone + document list */}
        <div className="flex min-h-0 flex-col gap-3">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) upload(f);
            }}
            disabled={!token || uploading}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors',
              dragging ? 'border-[#F4F5F6] bg-white/[0.04]' : 'border-[#2A2E35] hover:border-[#3A3E45] hover:bg-white/[0.02]'
            )}
          >
            <Upload className="h-5 w-5 text-[#C9CDD3]" />
            <span className="text-[13px] font-medium text-white">{uploading ? 'Uploading…' : 'Drop a document here'}</span>
            <span className="text-xs text-[#8A9099]">or click to choose · PDF, Markdown or text</span>
          </button>

          <div className="lab-panel-flat flex min-h-0 flex-1 flex-col rounded-2xl">
            <div className="border-b border-[#17191D] px-4 py-3 text-[13px] font-medium text-[#E8EAED]">
              Documents {docs && <span className="font-normal text-[#8A9099]">· {docs.length}</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {!docs ? (
                <LoadState loading={!docsErr} error={docsErr} what="documents" />
              ) : docs.length === 0 ? (
                <EmptyState title="No documents yet">Drop one above to get started.</EmptyState>
              ) : (
                <ul className="space-y-0.5">
                  {sorted.map((d) => {
                    const active = d.document_id === selected;
                    const pack = (d as { pack_id?: string | null }).pack_id;
                    return (
                      <li key={d.document_id}>
                        <button
                          onClick={() => pick(d.document_id)}
                          className={cn(
                            'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                            active ? 'bg-[#16181C]' : 'hover:bg-white/[0.02]'
                          )}
                        >
                          <FileText className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-white' : 'text-[#6F757E]')} />
                          <span className="min-w-0">
                            <span className={cn('block truncate text-[13px]', active ? 'text-white' : 'text-[#C9CDD3]')}>{d.filename}</span>
                            <span className="text-[11px] text-[#8A9099]">
                              {pack ? `Sample · ${PACK_LABEL[pack] ?? pack}` : 'Your upload'} · {d.chunk_count} passages
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right: read the document, or its generated questions */}
        <section className="lab-panel-flat flex min-h-0 flex-col rounded-2xl">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#17191D] px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-white">{doc?.filename ?? 'Pick a document'}</div>
              <div className="text-xs text-[#8A9099]">
                Questions come with a known answer and the passage that contains it; a few trick questions are mixed in.
              </div>
            </div>
            <div className="flex items-center gap-0.5 rounded-[10px] border border-[#1C1F24] p-[3px] text-[13px]" role="radiogroup" aria-label="How many questions">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={count === c}
                  onClick={() => setCount(c)}
                  className={cn(
                    'rounded-[7px] px-2.5 py-[5px] tabular-nums transition-colors',
                    count === c ? 'bg-[#1C1F24] text-white' : 'text-[#8A9099] hover:text-[#E8EAED]'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <PrimaryButton onClick={generate} busy={generating} disabled={!selected || !token}>
              {!generating && <Sparkles className="h-3.5 w-3.5" />}
              {generating ? 'Writing questions…' : 'Generate test questions'}
            </PrimaryButton>
          </div>

          <div className="flex gap-1 border-b border-[#17191D] px-4 text-[13px]">
            <TabButton active={tab === 'read'} onClick={() => setTab('read')} icon={<BookOpen className="h-3.5 w-3.5" />}>
              Read the document
            </TabButton>
            <TabButton active={tab === 'questions'} onClick={() => setTab('questions')} icon={<ListChecks className="h-3.5 w-3.5" />}>
              Test questions{cases ? ` (${cases.length})` : ''}
            </TabButton>
            {tab === 'questions' && cases && cases.length > 0 && (
              <div className="ml-auto flex items-center gap-3 py-1.5">
                {run && <RunStrip run={run} />}
                <PrimaryButton onClick={evaluate} busy={evaluating} className="h-[30px]">
                  {!evaluating && <Play className="h-3 w-3 fill-current" />}
                  {evaluating
                    ? progress?.total
                      ? `Checking ${progress.done ?? 0}/${progress.total}`
                      : 'Checking…'
                    : run
                      ? 'Check again'
                      : 'Check these questions'}
                </PrimaryButton>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'read' ? (
              !selected ? (
                <EmptyState className="m-5" title="No document selected">Pick one on the left, or drop a new one in.</EmptyState>
              ) : !detail ? (
                <div className="p-5">
                  <LoadState loading={!detailErr} error={detailErr} what="document" />
                </div>
              ) : !detail.chunks?.length ? (
                <EmptyState className="m-5" title="No readable text">This document has no extracted text.</EmptyState>
              ) : (
                <article className="mx-auto max-w-[760px] space-y-4 px-6 py-6">
                  {detail.chunks.map((c, i) => (
                    <div key={c.chunk_id} className="group relative">
                      <span className="absolute -left-6 top-0.5 font-mono text-[10.5px] text-[#4A4F57]">{i + 1}</span>
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#C9CDD3]">{c.text.replace(/^#+\s*/gm, '')}</p>
                    </div>
                  ))}
                  <p className="pt-2 text-xs text-[#6F757E]">
                    Split into {detail.chunks.length} passages; the numbers on the left are what the bot can retrieve.
                  </p>
                </article>
              )
            ) : !cases ? (
              <EmptyState className="m-5" title={generating ? 'Reading the document and writing questions…' : 'No questions yet'}>
                {!generating && 'Press “Generate test questions” above. It takes a few seconds per question.'}
              </EmptyState>
            ) : cases.length === 0 ? (
              <EmptyState className="m-5" title="No questions came back">Try a longer document or a larger count.</EmptyState>
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
                          {c.type && <span className="text-[11px] text-[#8A9099]">{TYPE_LABEL[c.type] ?? c.type}</span>}
                          <span className="mt-0.5 block text-[14px] text-[#E8EAED]">{c.question}</span>
                          <span className="mt-1 block text-[13px] text-[#8A9099]">
                            Correct answer: <span className="text-[#C9CDD3]">{c.ground_truth_answer || 'the bot should say it’s not in the document'}</span>
                          </span>
                          {c.context_snippet && (
                            <span className="mt-1.5 block truncate border-l-2 border-[#22252B] pl-2.5 text-xs text-[#6F757E]">
                              From: “{c.context_snippet}”
                            </span>
                          )}
                        </span>
                        <span className="w-[130px] text-right text-xs">
                          {v ? (
                            <>
                              <span className="flex items-center justify-end gap-1.5 font-medium" style={{ color: v.color }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                                {v.label}
                              </span>
                              <span className="mt-1 block text-[#8A9099]">click for details</span>
                            </>
                          ) : (
                            <span className="text-[#5A5F67]">not checked yet</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <CaseDrawer result={open} filenames={filenames} onClose={() => setOpen(null)} />
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({
  active,
  onClick,
  icon,
  children,
}) => (
  <button
    onClick={onClick}
    className={cn(
      '-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 transition-colors',
      active ? 'border-white text-white' : 'border-transparent text-[#8A9099] hover:text-[#E8EAED]'
    )}
  >
    {icon}
    {children}
  </button>
);

const RunStrip: React.FC<{ run: RunSummary }> = ({ run }) => {
  const b = run.root_cause_breakdown ?? {};
  return (
    <span className="flex items-center gap-2.5 text-xs">
      <span className="font-semibold tabular-nums text-white">{pct(run.aggregates?.pass_rate)}</span>
      <span className="text-[#8A9099]">correct</span>
      {VERDICT_ORDER.filter((k) => b[k] && k !== 'CLEAN_PASS').map((k) => (
        <span key={k} style={{ color: VERDICTS[k].color }}>
          {b[k]} {VERDICTS[k].short.toLowerCase()}
        </span>
      ))}
    </span>
  );
};
