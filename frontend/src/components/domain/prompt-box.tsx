import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { CornerDownLeft, Sparkles, BookOpen } from 'lucide-react';

export interface PromptBoxProps {
  onSubmit?: (query: string, groundTruth?: string) => void;
  isLoading?: boolean;
  className?: string;
}

export const PromptBox: React.FC<PromptBoxProps> = ({
  onSubmit,
  isLoading = false,
  className,
}) => {
  const [query, setQuery] = useState('');
  const [groundTruth, setGroundTruth] = useState('');
  const [showGroundTruth, setShowGroundTruth] = useState(false);
  const [model, setModel] = useState('Claude 3.5 Sonnet');

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

  return (
    <Card className={cn('bg-neutral-900/90 border-neutral-800 p-4 shadow-xl space-y-3', className)}>
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span className="font-bold text-white tracking-tight">Diagnostic Query Runner</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-neutral-950 text-neutral-300 text-[11px] font-mono px-2 py-1 rounded-lg border border-neutral-800 focus:outline-none"
          >
            <option>Claude 3.5 Sonnet</option>
            <option>Gemini 1.5 Flash</option>
            <option>Llama-3-70B</option>
            <option>GPT-4o Mini</option>
          </select>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowGroundTruth(!showGroundTruth)}
            className={showGroundTruth ? 'border-sky-500 text-sky-400' : ''}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            {showGroundTruth ? 'Ground Truth: ON' : '+ Ground Truth'}
          </Button>
        </div>
      </div>

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter evaluation query (e.g. 'What is the refund policy window for premium accounts?')..."
        rows={2}
        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-sky-500 resize-none font-sans"
      />

      {showGroundTruth && (
        <div className="space-y-1">
          <span className="text-[11px] font-mono text-emerald-400 uppercase font-semibold">
            Optional Ground Truth Reference Answer:
          </span>
          <textarea
            value={groundTruth}
            onChange={(e) => setGroundTruth(e.target.value)}
            placeholder="Ground truth answer (used to measure Answer Accuracy)..."
            rows={2}
            className="w-full bg-neutral-950 border border-emerald-900/50 rounded-xl p-3 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 resize-none font-sans"
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-mono text-neutral-500 hidden sm:inline">
          Pro-tip: Press <kbd className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-300">⌘</kbd> + <kbd className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-300">Enter</kbd> to evaluate
        </span>

        <Button
          variant="glow"
          size="sm"
          isLoading={isLoading}
          disabled={!query.trim()}
          onClick={handleTriggerSubmit}
          className="ml-auto flex items-center gap-1.5"
        >
          <span>Run Evaluation</span>
          <CornerDownLeft className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
};
