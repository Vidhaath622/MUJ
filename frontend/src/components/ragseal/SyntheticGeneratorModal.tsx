import React, { useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  Sparkles, 
  X, 
  ArrowRight, 
  RotateCw,
  AlertCircle 
} from 'lucide-react';
import { SyntheticTestCase, DocumentItem } from '../../types/ragseal';
import { generateSynthetic, ApiError } from '../../lib/api';

interface SyntheticGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: SyntheticTestCase[];
  documents: DocumentItem[];
  onSelectQuestion: (question: SyntheticTestCase) => void;
  token?: string | null;
}

export const SyntheticGeneratorModal: React.FC<SyntheticGeneratorModalProps> = ({
  isOpen,
  onClose,
  questions: initialQuestions,
  documents,
  onSelectQuestion,
  token,
}) => {
  const [selectedDocId, setSelectedDocId] = useState(documents[0]?.document_id || '');
  const [questionList, setQuestionList] = useState<SyntheticTestCase[]>(initialQuestions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTriggerGenerate = async () => {
    setIsGenerating(true);
    setGeneratorError(null);

    if (token) {
      try {
        const res = await generateSynthetic(selectedDocId, 5, token);
        if (res && res.test_cases) {
          const newCases: SyntheticTestCase[] = res.test_cases.map((tc) => ({
            test_id: tc.test_id,
            question: tc.question,
            ground_truth_answer: tc.ground_truth_answer,
            source_chunk_id: tc.source_chunk_id,
            context_snippet: tc.context_snippet,
            archetype: tc.type || 'factoid',
          }));
          setQuestionList((prev) => [...newCases, ...prev]);
          setIsGenerating(false);
          return;
        }
      } catch (err: any) {
        if (err instanceof ApiError) {
          setGeneratorError(`Backend (${err.status}): ${err.detail}`);
        } else {
          setGeneratorError(err.message || 'Synthetic generation failed');
        }
      }
    }

    // Fallback animation if backend model offline or no token
    setTimeout(() => {
      setIsGenerating(false);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--paper)] backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-[var(--paper)] border border-[var(--rule)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--ink)]">
        {/* Header */}
        <div className="p-4 md:px-6 border-b border-[var(--rule)] flex items-center justify-between bg-[var(--panel)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--teal-tint)] border border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)] text-[var(--teal)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--ink)] tracking-tight">
                  Synthetic Test-Question Generator
                </h3>
                <Badge variant="neon" size="sm">
                  Deliverable 2
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--ink-2)] font-mono">
                Extracts grounded question-answer test pairs directly from corpus chunks.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--panel)] text-[var(--ink-2)] hover:text-[var(--ink)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Generator Controls */}
        <div className="p-4 bg-[var(--panel)] border-b border-[var(--rule)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--ink-2)]">Source Document:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="text-xs font-mono bg-[var(--panel)] border border-[var(--rule)] text-[var(--ink)] rounded-lg px-2.5 py-1.5"
            >
              {documents.map((d) => (
                <option key={d.document_id} value={d.document_id}>
                  {d.filename}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={handleTriggerGenerate}
            disabled={isGenerating}
            className="bg-[var(--teal)] hover:bg-[var(--teal)] text-[var(--ink)] font-mono text-xs gap-1.5"
          >
            {isGenerating ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Extracting Ground Truths...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Synthesize 5 Questions</span>
              </>
            )}
          </Button>
        </div>

        {/* Question List */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
          {generatorError && (
            <div className="p-3 rounded-xl bg-[var(--gen-tint)] border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] text-xs font-mono text-[var(--gen)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--gen)] flex-shrink-0" />
              <span>{generatorError}</span>
            </div>
          )}

          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-2)] block mb-1">
            Generated Benchmark Test Cases ({questionList.length}):
          </span>

          {questionList.map((q) => (
            <div
              key={q.test_id}
              className="p-4 rounded-xl border border-[var(--rule)] bg-[var(--panel)] hover:border-[var(--rule)] transition space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono font-bold text-[var(--teal)] bg-[var(--teal-tint)] px-2 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)]">
                    {q.test_id}
                  </span>
                  <Badge variant="outline" size="sm" className="text-[10px] font-mono text-[var(--ink-1)] border-[var(--rule)]">
                    {q.archetype}
                  </Badge>
                  <span className="text-[11px] font-mono text-[var(--muted)]">
                    chunk: {q.source_chunk_id}
                  </span>
                </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onSelectQuestion(q);
                      onClose();
                    }}
                    className="text-[11px] font-mono border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[var(--accent-tint)] gap-1 py-1 h-7"
                  >
                    <span>Test in Trace</span>
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>

                <div className="text-sm font-semibold text-[var(--ink)] font-sans">
                  {q.question}
                </div>

                <div className="p-2.5 rounded-lg bg-[var(--paper)] border border-[var(--rule)] text-xs space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ok)] font-bold block">
                    Ground Truth Expected Answer:
                  </span>
                  <p className="text-[var(--ink)] font-mono text-[11px]">
                    {q.ground_truth_answer}
                  </p>
                </div>

                <div className="text-[11px] font-mono text-[var(--ink-2)] truncate">
                  Context snippet: <span className="text-[var(--ink-2)] italic">"{q.context_snippet}"</span>
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--rule)] bg-[var(--panel)] flex items-center justify-between text-xs font-mono text-[var(--ink-2)]">
          <span>Pairs generated via synthetic question generator from document chunks</span>
          <Button variant="outline" size="sm" onClick={onClose} className="border-[var(--rule)]">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
