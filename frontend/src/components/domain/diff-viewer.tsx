import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { cn } from '../../lib/utils';
import { 
  Sparkles, 
  Copy, 
  Check, 
  AlertCircle, 
  BookmarkCheck,
  FileSearch,
  Bot,
  FlaskConical,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Replay } from '../../types/ragseal';

export interface RetrievedChunk {
  chunk_id: string;
  text: string;
  relevance_score: number;
  is_relevant: boolean;
  page?: number;
  document_name?: string;
  is_ground_truth_chunk?: boolean;
}

export interface DiffViewerProps {
  query: string;
  retrievedChunks: RetrievedChunk[];
  generatedAnswer: string;
  groundTruth?: string | null;
  hallucinatedClaims?: string[];
  groundTruthChunkIds?: string[];
  documentName?: string;
  replay?: Replay | null;
  className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  query,
  retrievedChunks,
  generatedAnswer,
  groundTruth,
  hallucinatedClaims = [],
  groundTruthChunkIds = [],
  documentName,
  replay,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'trace' | 'replay'>('trace');

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to highlight hallucinated claims inside answer text
  const renderHighlightedAnswer = () => {
    if (!hallucinatedClaims.length) {
      return <p className="text-sm text-neutral-200 leading-relaxed font-sans">{generatedAnswer}</p>;
    }

    const claimMatches = hallucinatedClaims.filter(c => generatedAnswer.includes(c));

    if (claimMatches.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-neutral-200 leading-relaxed font-sans">{generatedAnswer}</p>
          <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300">
            <span className="font-semibold">Unverified Claim: </span>
            {hallucinatedClaims.join(', ')}
          </div>
        </div>
      );
    }

    const renderedParts: React.ReactNode[] = [];
    let remaining = generatedAnswer;

    claimMatches.forEach((claim, idx) => {
      const parts = remaining.split(claim);
      if (parts.length > 1) {
        renderedParts.push(parts[0]);
        renderedParts.push(
          <mark
            key={`claim-${idx}`}
            className="bg-rose-500/25 text-rose-200 px-1 py-0.5 rounded border border-rose-500/60 font-medium decoration-rose-400 underline decoration-wavy underline-offset-4"
            title="Model-Judged Hallucination: claim unsupported by retrieved context"
          >
            {claim}
          </mark>
        );
        remaining = parts.slice(1).join(claim);
      }
    });
    renderedParts.push(remaining);

    return (
      <div className="space-y-2.5">
        <div className="text-sm text-neutral-200 leading-relaxed font-sans">
          {renderedParts}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-rose-300/90 bg-rose-950/30 p-2 rounded border border-rose-900/50">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          <span>Wavy red underline marks factual claims unsupported by retrieved context.</span>
        </div>
      </div>
    );
  };

  const relevantCount = retrievedChunks.filter(c => c.is_relevant).length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Top Banner: Evaluated Query */}
      <Card variant="glass" className="p-4 border-neutral-800 bg-[#090d15]/90">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60 font-semibold">
              Live Query Under Test
            </span>
            {documentName && (
              <span className="text-xs font-mono text-neutral-400">
                Source Document: <span className="text-neutral-200 font-semibold">{documentName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {replay && (
              <div className="flex items-center bg-neutral-950 p-0.5 rounded-lg border border-purple-800/60 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveTab('trace')}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition',
                    activeTab === 'trace' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-white'
                  )}
                >
                  Trace Inspector
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('replay')}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition flex items-center gap-1.5',
                    activeTab === 'replay' ? 'bg-purple-950 text-purple-200 font-bold border border-purple-700' : 'text-purple-400 hover:text-purple-200'
                  )}
                >
                  <FlaskConical className="w-3 h-3 text-purple-400" />
                  <span>Gold Replay Experiment</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                </button>
              </div>
            )}
            <div className="text-[11px] font-mono text-neutral-400 hidden sm:block">
              Retrieval coverage: <span className="font-semibold text-neutral-200">{relevantCount} of {retrievedChunks.length} relevant</span>
            </div>
          </div>
        </div>
        <p className="text-base font-medium text-white tracking-tight mt-2 font-sans">
          "{query}"
        </p>
      </Card>

      {/* VIEW 1: Standard Trace Inspector */}
      {activeTab === 'trace' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Pane: Retrieved Context Chunks */}
          <Card className="bg-neutral-900/90 border-neutral-800 flex flex-col">
            <CardHeader className="border-b border-neutral-800/80 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-sky-400" />
                  <CardTitle className="text-sm">Retrieved Grounding Chunks (Retriever)</CardTitle>
                </div>
                <span className="text-xs font-mono text-neutral-400">
                  top-k = {retrievedChunks.length}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[460px]">
              {retrievedChunks.map((chunk, idx) => {
                const isTarget = chunk.is_ground_truth_chunk || groundTruthChunkIds.includes(chunk.chunk_id);
                return (
                  <div
                    key={chunk.chunk_id || idx}
                    className={cn(
                      'p-3.5 rounded-xl border transition-all text-xs space-y-2',
                      chunk.is_relevant
                        ? 'bg-neutral-950/70 border-emerald-900/40 text-neutral-200'
                        : 'bg-rose-950/10 border-rose-900/30 text-neutral-400 opacity-80'
                    )}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px] flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
                          {chunk.chunk_id}
                        </span>
                        {chunk.page && <span className="text-neutral-500">p. {chunk.page}</span>}
                        {chunk.document_name && (
                          <span className="text-neutral-400 truncate max-w-[140px]">
                            {chunk.document_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isTarget && (
                          <Badge variant="outline" size="sm" className="text-[10px] text-teal-300 border-teal-800 bg-teal-950/40">
                            Target Chunk
                          </Badge>
                        )}
                        <Badge variant={chunk.is_relevant ? 'success' : 'danger'} size="sm" dot>
                          {chunk.is_relevant ? 'RELEVANT' : 'NOISE / OMITTED'}
                        </Badge>
                      </div>
                    </div>

                    <p className="leading-relaxed font-mono text-xs bg-black/40 p-2.5 rounded-lg border border-neutral-800/60 text-neutral-300">
                      {chunk.text}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-[11px] font-mono">
                      <span className="text-neutral-500">Relevance Score:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-300 font-bold">
                          {(chunk.relevance_score * 100).toFixed(0)}%
                        </span>
                        <div className="w-16">
                          <Progress
                            value={chunk.relevance_score * 100}
                            variant={chunk.relevance_score >= 0.70 ? 'success' : 'danger'}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Gap Alert if ground truth chunk is missing */}
              {groundTruthChunkIds.length > 0 && !groundTruthChunkIds.some(gtId => retrievedChunks.some(c => c.chunk_id === gtId)) && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span>RETRIEVAL GAP DETECTED</span>
                  </div>
                  <p className="text-neutral-300 text-[11px] leading-relaxed">
                    Canonical target chunk <span className="font-mono text-amber-300">[{groundTruthChunkIds.join(', ')}]</span> was not fetched in the top-k retrieved set.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Pane: Generated Answer vs Ground Truth */}
          <Card className="bg-neutral-900/90 border-neutral-800 flex flex-col">
            <CardHeader className="border-b border-neutral-800/80 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-teal-400" />
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
                  <span className="text-[11px] font-mono text-teal-400 uppercase font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-teal-400" />
                    Generated Candidate Response
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                    Model Output
                  </span>
                </div>
                {renderHighlightedAnswer()}
              </div>

              {/* Ground Truth Reference */}
              {groundTruth ? (
                <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold flex items-center gap-1">
                    <BookmarkCheck className="w-3 h-3" />
                    Ground Truth Reference:
                  </span>
                  <p className="text-neutral-200 leading-relaxed font-mono text-xs bg-black/40 p-2.5 rounded border border-emerald-900/30">
                    {groundTruth}
                  </p>
                </div>
              ) : (
                <div className="bg-amber-950/10 border border-amber-900/30 rounded-xl p-3 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-amber-400 uppercase font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No Ground Truth Provided
                  </span>
                  <p className="text-neutral-400 text-xs">
                    Evaluated solely on Context Relevance &amp; Groundedness Faithfulness.
                  </p>
                </div>
              )}

              {/* Principle Note */}
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 flex items-start gap-2">
                <span className="font-bold text-neutral-200 uppercase font-mono text-[10px]">Note:</span>
                <p className="leading-relaxed">
                  Even if the generated answer is truthful in the real world, it fails <span className="text-teal-300 font-mono">Faithfulness</span> if it asserts facts not present in the retrieved passages.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW 2: Causal Replay Experiment (The Hero of the Live Demo) */}
      {activeTab === 'replay' && replay && (
        <Card className="bg-neutral-900/90 border-purple-800/80 p-5 space-y-4 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-400" />
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Causal Verdict By Replay Experiment</span>
                  <Badge variant="neon" size="sm">
                    HERO PROOF
                  </Badge>
                </h4>
                <p className="text-[11px] text-neutral-400 font-mono">
                  Isolates retriever vs generator: re-runs the generator with ONLY the canonical gold passage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-neutral-400">Replay Accuracy:</span>
              <Badge variant={replay.answer_accuracy && replay.answer_accuracy >= 0.70 ? 'success' : 'danger'} size="sm">
                {replay.answer_accuracy ? `${(replay.answer_accuracy * 100).toFixed(0)}%` : 'N/A'}
              </Badge>
              <span className="text-neutral-400 ml-2">Replay Faithfulness:</span>
              <Badge variant={replay.faithfulness >= 0.75 ? 'success' : 'danger'} size="sm">
                {(replay.faithfulness * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Causal Effect Statement */}
          <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-700/60 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-purple-300 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300 font-bold block mb-0.5">
                Causal Experiment Finding:
              </span>
              <p className="text-sm text-neutral-100 font-medium leading-relaxed">
                {replay.verdict_effect}
              </p>
            </div>
          </div>

          {/* Side by side: Original Failed Answer vs Replay with Gold Chunk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            {/* Left: Original Pipeline Answer (With Retrieval Fault) */}
            <div className="p-4 rounded-xl border border-neutral-800 bg-black/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-rose-400 uppercase flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  1. Original System Output (Standard RAG)
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  Retrieved Context (Incomplete/Noise)
                </span>
              </div>
              <p className="text-xs text-neutral-300 font-mono leading-relaxed bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                {generatedAnswer}
              </p>
            </div>

            {/* Right: Replay Output (With Forced Gold Context) */}
            <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  2. Replay Output (Forced Gold Chunk Only)
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                  Perfect Evidence Injected
                </span>
              </div>
              <p className="text-xs text-neutral-100 font-mono leading-relaxed bg-black/60 p-3 rounded-lg border border-emerald-900/40">
                {replay.answer}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
