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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-[#090d16] border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="p-4 md:px-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-950/60 border border-teal-800/40 text-teal-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Synthetic Test-Question Generator
                </h3>
                <Badge variant="neon" size="sm">
                  Deliverable 2
                </Badge>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono">
                Extracts grounded question-answer test pairs directly from corpus chunks.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Generator Controls */}
        <div className="p-4 bg-neutral-900/40 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-400">Source Document:</span>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="text-xs font-mono bg-neutral-950 border border-neutral-700 text-white rounded-lg px-2.5 py-1.5"
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
            className="bg-teal-600 hover:bg-teal-500 text-white font-mono text-xs gap-1.5"
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
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-xs font-mono text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{generatorError}</span>
            </div>
          )}

          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
            Generated Benchmark Test Cases ({questionList.length}):
          </span>

          {questionList.map((q) => (
            <div
              key={q.test_id}
              className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 transition space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono font-bold text-teal-300 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-800/60">
                    {q.test_id}
                  </span>
                  <Badge variant="outline" size="sm" className="text-[10px] font-mono text-neutral-300 border-neutral-700">
                    {q.archetype}
                  </Badge>
                  <span className="text-[11px] font-mono text-neutral-500">
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
                    className="text-[11px] font-mono border-sky-800 text-sky-300 hover:bg-sky-950/40 gap-1 py-1 h-7"
                  >
                    <span>Test in Trace</span>
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>

                <div className="text-sm font-semibold text-white font-sans">
                  {q.question}
                </div>

                <div className="p-2.5 rounded-lg bg-black/50 border border-neutral-800/80 text-xs space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
                    Ground Truth Expected Answer:
                  </span>
                  <p className="text-neutral-200 font-mono text-[11px]">
                    {q.ground_truth_answer}
                  </p>
                </div>

                <div className="text-[11px] font-mono text-neutral-400 truncate">
                  Context snippet: <span className="text-neutral-400 italic">"{q.context_snippet}"</span>
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs font-mono text-neutral-400">
          <span>Pairs generated via synthetic question generator from document chunks</span>
          <Button variant="outline" size="sm" onClick={onClose} className="border-neutral-700">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
