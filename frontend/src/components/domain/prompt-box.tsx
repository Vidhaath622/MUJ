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
    <Card className={cn('bg-[#FBF9F4] border-[#E3DED3] p-5 shadow-xl space-y-4', className)}>
      {/* Top Document Selection & Scenarios Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#E3DED3] text-xs">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#2F5D8A]" />
          <span className="font-mono font-semibold text-[#33322D] uppercase">
            Corpus Document:
          </span>
          {documents && documents.length > 0 ? (
            <select
              value={selectedDocId}
              onChange={(e) => onSelectDoc?.(e.target.value)}
              className="bg-[#FBF9F4] text-[#1B1B18] text-xs font-mono px-2.5 py-1.5 rounded-lg border border-[#E3DED3] focus:outline-none focus:border-[#2F5D8A]/40"
            >
              {documents.map((d) => (
                <option key={d.document_id} value={d.document_id}>
                  {d.filename} ({d.chunk_count} chunks)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[#5E5B53] font-mono">Default Corpus</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowGroundTruth(!showGroundTruth)}
            className={showGroundTruth ? 'border-[#2F5D8A]/40 text-[#2F5D8A]' : ''}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            {showGroundTruth ? 'Ground Truth: ON' : '+ Ground Truth'}
          </Button>
        </div>
      </div>

      {/* Starter Question Quick Picks */}
      {starterQuestions && starterQuestions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-mono text-[#5E5B53]">
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
                      ? 'bg-[#E2EFEC] text-[#1F6F6A] border-[#1F6F6A]/40 shadow-sm'
                      : 'bg-[#FBF9F4] text-[#5E5B53] border-[#E3DED3] hover:text-[#1B1B18] hover:border-[#E3DED3]'
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1F6F6A]"></span>
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
          className="w-full bg-[#F6F3EC] border border-[#E3DED3] rounded-xl p-3 text-sm text-[#1B1B18] placeholder:text-[#6E6A62] focus:outline-none focus:border-[#2F5D8A]/40 resize-none font-sans"
        />
      </div>

      {showGroundTruth && (
        <div className="space-y-1">
          <span className="text-[11px] font-mono text-[#1F7A4D] uppercase font-semibold">
            Optional Ground Truth Reference Answer:
          </span>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            placeholder="Canonical expected answer for measuring semantic accuracy..."
            rows={2}
            className="w-full bg-[#F6F3EC] border border-[#1F7A4D]/40 rounded-xl p-3 text-xs text-[#1B1B18] placeholder:text-[#6E6A62] focus:outline-none focus:border-[#1F7A4D]/40 resize-none font-sans"
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-mono text-[#6E6A62] hidden sm:inline">
          Pro-tip: Press <kbd className="bg-[#FBF9F4] px-1.5 py-0.5 rounded text-[#33322D]">⌘</kbd> + <kbd className="bg-[#FBF9F4] px-1.5 py-0.5 rounded text-[#33322D]">Enter</kbd> to run diagnostics
        </span>

        <Button
          variant="glow"
          size="default"
          isLoading={isLoading}
          disabled={!query.trim()}
          onClick={handleTriggerSubmit}
          className="ml-auto flex items-center gap-2 bg-gradient-to-r from-[#1F6F6A] to-[#2F5D8A] hover:from-[#1F6F6A] hover:to-[#2F5D8A] text-[#1B1B18] font-mono text-xs shadow-lg shadow-[#1F6F6A]/10"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Run RAG Diagnostics</span>
        </Button>
      </div>
    </Card>
  );
};
