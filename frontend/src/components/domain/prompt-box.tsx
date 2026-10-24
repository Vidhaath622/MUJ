import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { Play, BookOpen, FileText } from 'lucide-react';

export interface StarterQuestionItem {
  label: string;
  question: string;
  caseId?: string;
  docId?: string;
  type?: string;
}

export interface PromptBoxDocument {
  document_id: string;
  filename: string;
  chunk_count: number;
}

export interface PromptBoxProps {
  onSubmit?: (query: string, groundTruth?: string) => void;
  isLoading?: boolean;
  documents?: PromptBoxDocument[];
  selectedDocId?: string;
  onSelectDoc?: (docId: string) => void;
  starterQuestions?: StarterQuestionItem[];
  onSelectStarter?: (question: string, caseId?: string, docId?: string) => void;
  activeCaseId?: string;
  className?: string;
}

export const PromptBox: React.FC<PromptBoxProps> = ({
  onSubmit,
  isLoading = false,
  documents,
  selectedDocId,
  onSelectDoc,
  starterQuestions,
  onSelectStarter,
  activeCaseId,
  className,
}) => {
  const [query, setQuery] = useState('');
  const [groundTruth, setGroundTruth] = useState('');
  const [showGroundTruth, setShowGroundTruth] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleTriggerSubmit();
    }
  };

  const handleTriggerSubmit = () => {
    if (!query.trim() || isLoading) return;
    onSubmit?.(query, showGroundTruth && groundTruth.trim() ? groundTruth : undefined);
  };

  const handleStarterClick = (item: StarterQuestionItem) => {
    setQuery(item.question);
    onSelectStarter?.(item.question, item.caseId, item.docId);
  };

  return (
    <Card className={cn('bg-[var(--panel)] border-[var(--rule)] p-5 shadow-xl space-y-4', className)}>
      {/* Top Document Selection & Scenarios Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--rule)] text-xs">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-mono font-semibold text-[var(--ink-1)] uppercase">
            Corpus Document:
          </span>
          {documents && documents.length > 0 ? (
            <select
              value={selectedDocId}
              onChange={(e) => onSelectDoc?.(e.target.value)}
              className="bg-[var(--panel)] text-[var(--ink)] text-xs font-mono px-2.5 py-1.5 rounded-lg border border-[var(--rule)] focus:outline-none focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
            >
              {documents.map((d) => (
                <option key={d.document_id} value={d.document_id}>
                  {d.filename} ({d.chunk_count} chunks)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[var(--ink-2)] font-mono">Default Corpus</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowGroundTruth(!showGroundTruth)}
            className={showGroundTruth ? 'border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)]' : ''}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            {showGroundTruth ? 'Ground Truth: ON' : '+ Ground Truth'}
          </Button>
        </div>
      </div>

      {/* Starter Question Quick Picks */}
      {starterQuestions && starterQuestions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-mono text-[var(--ink-2)]">
            Click any benchmark question to test retriever vs generator failure:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {starterQuestions.map((sq, idx) => {
              const isSelected = activeCaseId === sq.caseId;
              return (
                <button
                  key={sq.caseId || idx}
                  type="button"
                  onClick={() => handleStarterClick(sq)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-sans transition text-left flex items-center gap-1.5 border',
                    isSelected
                      ? 'bg-[var(--teal-tint)] text-[var(--teal)] border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)] shadow-sm'
                      : 'bg-[var(--panel)] text-[var(--ink-2)] border-[var(--rule)] hover:text-[var(--ink)] hover:border-[var(--rule)]'
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)]"></span>
                  <span>{sq.question}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Query Textarea */}
      <div className="space-y-1">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter evaluation probe (e.g. 'What is the required experience threshold in the currently approved job description?')..."
          rows={2}
          className="w-full bg-[var(--paper)] border border-[var(--rule)] rounded-xl p-3 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] resize-none font-sans"
        />
      </div>

      {showGroundTruth && (
        <div className="space-y-1">
          <span className="text-[11px] font-mono text-[var(--ok)] uppercase font-semibold">
            Optional Ground Truth Reference Answer:
          </span>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            placeholder="Canonical expected answer for measuring semantic accuracy..."
            rows={2}
            className="w-full bg-[var(--paper)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] rounded-xl p-3 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] resize-none font-sans"
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-mono text-[var(--muted)] hidden sm:inline">
          Pro-tip: Press <kbd className="bg-[var(--panel)] px-1.5 py-0.5 rounded text-[var(--ink-1)]">⌘</kbd> + <kbd className="bg-[var(--panel)] px-1.5 py-0.5 rounded text-[var(--ink-1)]">Enter</kbd> to run diagnostics
        </span>

        <Button
          variant="glow"
          size="default"
          isLoading={isLoading}
          disabled={!query.trim()}
          onClick={handleTriggerSubmit}
          className="ml-auto flex items-center gap-2 bg-gradient-to-r from-[var(--teal)] to-[var(--accent)] hover:from-[var(--teal)] hover:to-[var(--accent)] text-[var(--ink)] font-mono text-xs shadow-lg shadow-[color:color-mix(in_srgb,var(--teal)_10%,transparent)]"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Run RAG Diagnostics</span>
        </Button>
      </div>
    </Card>
  );
};
