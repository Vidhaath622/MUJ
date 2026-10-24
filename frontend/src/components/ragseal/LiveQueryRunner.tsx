import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Play, FileText } from 'lucide-react';
import { DocumentItem } from '../../types/ragseal';

interface LiveQueryRunnerProps {
  documents: DocumentItem[];
  selectedDocId: string;
  onSelectDoc: (docId: string) => void;
  onRunQuery: (query: string, docId: string, groundTruth?: string) => void;
  onSelectPresetCase: (caseId: string) => void;
  activeCaseId: string;
  isEvaluating: boolean;
}

export const LiveQueryRunner: React.FC<LiveQueryRunnerProps> = ({
  documents,
  selectedDocId,
  onSelectDoc,
  onRunQuery,
  onSelectPresetCase,
  activeCaseId,
  isEvaluating,
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [groundTruthInput] = useState('');

  const starterQuestions = [
    {
      label: 'Experience Threshold',
      caseId: 'case_01',
      question: 'What is the required experience threshold in the currently approved job description?',
      docId: 'doc_ats_03',
      type: 'CLEAN_PASS',
    },
    {
      label: 'Notice Period & Buyout',
      caseId: 'case_02',
      question: 'Does the candidate resume document notice period and buyout eligibility?',
      docId: 'doc_ats_02',
      type: 'RETRIEVAL_FAILURE',
    },
    {
      label: 'Certifications Check',
      caseId: 'case_03',
      question: "Which cloud and orchestration certifications are documented in candidate C-002's resume?",
      docId: 'doc_ats_02',
      type: 'GENERATION_HALLUCINATION',
    },
    {
      label: 'Compensation & Band',
      caseId: 'case_04',
      question: "What is Priya Sharma's compensation expectation and does it fit the L4 salary band?",
      docId: 'doc_ats_02',
      type: 'COMPOUND_FAILURE',
    },
    {
      label: 'Managerial Experience',
      caseId: 'case_05',
      question: 'Does candidate C-002 have prior managerial experience leading teams of 10 or more engineers?',
      docId: 'doc_ats_02',
      type: 'CLEAN_PASS',
    },
    {
      label: 'Policy Version Conflict',
      caseId: 'case_06',
      question: 'What is the minimum years of experience required for the L4 role according to current policy?',
      docId: 'doc_ats_01',
      type: 'GENERATION_HALLUCINATION',
    },
    {
      label: 'Citation Mismatch',
      caseId: 'case_07',
      question: 'Which distributed caching and messaging technologies has candidate Priya Sharma worked with?',
      docId: 'doc_ats_02',
      type: 'GENERATION_HALLUCINATION',
    },
  ];

  const handleSelectStarter = (item: typeof starterQuestions[0]) => {
    onSelectPresetCase(item.caseId);
    onSelectDoc(item.docId);
    setQueryInput(item.question);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    onRunQuery(queryInput, selectedDocId, groundTruthInput || undefined);
  };

  return (
    <Card variant="glass" className="border-neutral-800 bg-[#0c1017]/90 p-5 space-y-4">
      {/* Top Controls: Document Selector & Scenario Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-semibold">
            Target Corpus Document:
          </span>
          <select
            value={selectedDocId}
            onChange={(e) => onSelectDoc(e.target.value)}
            className="text-xs font-mono bg-neutral-900 border border-neutral-700 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
          >
            {documents.map((doc) => (
              <option key={doc.document_id} value={doc.document_id}>
                {doc.filename} ({doc.chunk_count} chunks)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-1">
          <span className="text-[11px] font-mono text-neutral-400 mr-1 flex-shrink-0">
            Failure Archetypes:
          </span>
          {starterQuestions.slice(0, 4).map((sq) => {
            const isSelected = activeCaseId === sq.caseId;
            return (
              <button
                key={sq.caseId}
                type="button"
                onClick={() => handleSelectStarter(sq)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition flex-shrink-0 border ${
                  isSelected
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 font-semibold'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
                }`}
              >
                {sq.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Starter Questions Pills Strip */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-mono text-neutral-400">
          Click any benchmark question to test retriever vs generator failure:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {starterQuestions.map((sq) => {
            const isSelected = activeCaseId === sq.caseId;
            return (
              <button
                key={sq.caseId}
                type="button"
                onClick={() => handleSelectStarter(sq)}
                className={`px-2.5 py-1 rounded-lg text-xs font-sans transition text-left flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-teal-950/70 text-teal-200 border-teal-500/80 shadow-sm'
                    : 'bg-neutral-950/60 text-neutral-400 border-neutral-800/80 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                <span>{sq.question}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Query Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3 pt-1">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-neutral-300 font-medium">
              Query or Probe Prompt:
            </label>
            <span className="text-[10px] font-mono text-neutral-500">
              Evaluates Context Relevance, Faithfulness &amp; Accuracy
            </span>
          </div>
          <div className="relative">
            <textarea
              rows={2}
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="e.g., What is the required experience threshold in the currently approved job description?"
              className="w-full text-sm font-sans bg-black/60 border border-neutral-800 rounded-xl p-3 text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] font-mono text-neutral-500">
            [Evaluation Engine: gemini-2.5-flash / ATS Rules v1]
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="default"
              size="default"
              disabled={isEvaluating}
              className="bg-gradient-to-r from-teal-500 to-sky-600 hover:from-teal-600 hover:to-sky-700 text-white font-mono text-xs gap-2 shadow-lg shadow-teal-500/20"
            >
              {isEvaluating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Evaluating Trace...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run RAG Diagnostics</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
};
