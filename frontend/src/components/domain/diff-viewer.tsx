import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { FileText, Sparkles, Copy, Check, AlertCircle, BookmarkCheck } from 'lucide-react';

export interface RetrievedChunk {
  chunk_id: string;
  text: string;
  relevance_score: number;
  is_relevant: boolean;
  page?: number;
}

export interface DiffViewerProps {
  query: string;
  retrievedChunks: RetrievedChunk[];
  generatedAnswer: string;
  groundTruth?: string;
  hallucinatedClaims?: string[];
  className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  query,
  retrievedChunks,
  generatedAnswer,
  groundTruth,
  hallucinatedClaims = [],
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to highlight hallucinated claims inside answer text
  const renderHighlightedAnswer = () => {
    if (!hallucinatedClaims.length) {
      return <p className="text-sm text-neutral-200 leading-relaxed">{generatedAnswer}</p>;
    }

    let resultHtml = generatedAnswer;
    hallucinatedClaims.forEach((claim) => {
      const regex = new RegExp(`(${claim})`, 'gi');
      resultHtml = resultHtml.replace(
        regex,
        `<mark class="bg-rose-950 text-rose-200 border-b border-rose-500 px-1 py-0.5 rounded font-medium">$1</mark>`
      );
    });

    return (
      <div
        className="text-sm text-neutral-200 leading-relaxed space-y-2"
        dangerouslySetInnerHTML={{ __html: resultHtml }}
      />
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs font-mono text-neutral-300 flex items-center justify-between">
        <span className="text-neutral-500 uppercase">Evaluated Query:</span>
        <span className="font-semibold text-white font-sans">{query}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left Pane: Retrieved Context Chunks */}
      <Card className="bg-neutral-900/90 border-neutral-800 flex flex-col">
        <CardHeader className="border-b border-neutral-800/80 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <CardTitle className="text-sm">Retrieved Grounding Chunks</CardTitle>
            </div>
            <span className="text-xs font-mono text-neutral-400">
              {retrievedChunks.length} Chunk(s) Found
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[360px]">
          {retrievedChunks.map((chunk, idx) => (
            <div
              key={chunk.chunk_id || idx}
              className={cn(
                'p-3.5 rounded-xl border transition-all text-xs space-y-2',
                chunk.is_relevant
                  ? 'bg-neutral-950/70 border-emerald-900/40 text-neutral-200'
                  : 'bg-neutral-950/40 border-neutral-800 text-neutral-400'
              )}
            >
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="font-bold text-sky-400">{chunk.chunk_id}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={chunk.is_relevant ? 'success' : 'outline'} size="sm">
                    Relevance: {(chunk.relevance_score * 100).toFixed(0)}%
                  </Badge>
                  {chunk.page && <span className="text-neutral-500">p. {chunk.page}</span>}
                </div>
              </div>
              <p className="leading-relaxed font-sans">{chunk.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Right Pane: Generated Answer vs Ground Truth */}
      <Card className="bg-neutral-900/90 border-neutral-800 flex flex-col">
        <CardHeader className="border-b border-neutral-800/80 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <CardTitle className="text-sm">LLM Answer vs. Ground Truth</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleCopy}
              className="text-neutral-400 hover:text-white"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="ml-1 text-[11px] font-mono">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4 flex-1">
          {/* Active Generated Answer */}
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-purple-400 uppercase font-semibold">
                Generated Answer
              </span>
              {hallucinatedClaims.length > 0 && (
                <span className="text-[10px] font-mono text-rose-400 bg-rose-950/70 border border-rose-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {hallucinatedClaims.length} Hallucination(s) Flagged
                </span>
              )}
            </div>
            {renderHighlightedAnswer()}
          </div>

          {/* Ground Truth Reference */}
          {groundTruth && (
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 space-y-1 text-xs">
              <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold flex items-center gap-1">
                <BookmarkCheck className="w-3 h-3" />
                Ground Truth Reference:
              </span>
              <p className="text-neutral-300 leading-relaxed font-sans">{groundTruth}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  </div>
);
};
