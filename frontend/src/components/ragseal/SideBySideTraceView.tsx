import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { 
  Bot, 
  CheckCircle, 
  AlertCircle, 
  Copy, 
  Check, 
  FileSearch,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { RetrievedChunk } from '../../types/ragseal';

interface SideBySideTraceViewProps {
  query: string;
  generatedAnswer: string;
  groundTruth?: string;
  retrievedChunks: RetrievedChunk[];
  groundTruthChunkIds?: string[];
  retrievedChunkIds?: string[];
  hallucinatedClaims?: string[];
  documentName?: string;
}

export const SideBySideTraceView: React.FC<SideBySideTraceViewProps> = ({
  query,
  generatedAnswer,
  groundTruth,
  retrievedChunks,
  groundTruthChunkIds = [],
  hallucinatedClaims = [],
  documentName,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyAnswer = () => {
    navigator.clipboard.writeText(generatedAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to highlight hallucinated claims within generated answer
  const renderHighlightedAnswer = () => {
    if (!hallucinatedClaims || hallucinatedClaims.length === 0) {
      return (
        <p className="text-neutral-200 text-sm leading-relaxed font-sans">
          {generatedAnswer}
        </p>
      );
    }

    // Identify claims to highlight
    const text = generatedAnswer;
    const claimMatches = hallucinatedClaims.filter(c => text.includes(c));

    if (claimMatches.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-neutral-200 text-sm leading-relaxed font-sans">
            {generatedAnswer}
          </p>
          <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300">
            <span className="font-semibold">Unverified Claim: </span>
            {hallucinatedClaims.join(', ')}
          </div>
        </div>
      );
    }

    const renderedParts: React.ReactNode[] = [];
    let remaining = text;

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
        <div className="text-neutral-200 text-sm leading-relaxed font-sans">
          {renderedParts}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-rose-300/90 bg-rose-950/30 p-2 rounded border border-rose-900/50">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          <span>Wavy red underline marks factual claims unsupported by retrieved context.</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Active Query Header Banner */}
      <Card variant="glass" className="p-4 border-neutral-800 bg-[#090d15]/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60 font-semibold">
              Live Query Under Test
            </span>
            {documentName && (
              <span className="text-xs font-mono text-neutral-400">
                Source Document: <span className="text-neutral-200 font-semibold">{documentName}</span>
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-neutral-400 flex items-center gap-2">
            <span>Retrieval coverage: </span>
            <span className="font-semibold text-neutral-200">
              {retrievedChunks.filter(c => c.is_relevant).length} of {retrievedChunks.length} relevant
            </span>
          </div>
        </div>
        <p className="text-base font-medium text-white tracking-tight mt-2 font-sans">
          "{query}"
        </p>
      </Card>

      {/* Side-by-Side Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT COLUMN: Retrieved Chunks (Retriever Output) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold">
                Retrieved Context Chunks (Retriever)
              </h4>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">
              top-k = {retrievedChunks.length}
            </span>
          </div>

          <div className="space-y-3">
            {retrievedChunks.map((chunk, idx) => {
              const isRelevant = chunk.is_relevant;
              const isGroundTruthTarget = chunk.is_ground_truth_chunk || (groundTruthChunkIds.includes(chunk.chunk_id));

              return (
                <div
                  key={chunk.chunk_id || idx}
                  className={`p-4 rounded-xl border transition ${
                    isRelevant
                      ? 'bg-neutral-900/70 border-neutral-700/80'
                      : 'bg-rose-950/10 border-rose-900/30 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
                        {chunk.chunk_id}
                      </span>
                      {chunk.page && (
                        <span className="text-[10px] font-mono text-neutral-400">
                          p. {chunk.page}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-neutral-400 truncate max-w-[160px]">
                        {chunk.document_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isGroundTruthTarget && (
                        <Badge variant="outline" size="sm" className="text-[10px] text-teal-300 border-teal-800 bg-teal-950/40">
                          Target Chunk
                        </Badge>
                      )}
                      <Badge
                        variant={isRelevant ? 'success' : 'danger'}
                        size="sm"
                        dot
                      >
                        {isRelevant ? 'RELEVANT' : 'NOISE / OMITTED'}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-300 font-mono leading-relaxed bg-black/40 p-2.5 rounded-lg border border-neutral-800/60 selection:bg-sky-500/30">
                    {chunk.text}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-800/60 text-[11px] font-mono">
                    <span className="text-neutral-500">
                      Relevance Score:
                    </span>
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

            {/* If ground truth chunk is missing from retrieved set, show warning alert */}
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
          </div>
        </div>

        {/* RIGHT COLUMN: Generated LLM Answer vs Ground Truth */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-teal-400" />
              <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold">
                Generated LLM Output &amp; Ground Truth
              </h4>
            </div>
            <button
              onClick={handleCopyAnswer}
              className="text-[11px] font-mono text-neutral-400 hover:text-white flex items-center gap-1 transition"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Generated Answer Card */}
          <div className="p-4 rounded-xl border border-neutral-700/80 bg-neutral-900/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-teal-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-teal-400" />
                Generated Candidate Response
              </span>
              <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                Model Output
              </span>
            </div>

            <div className="bg-black/50 p-3.5 rounded-lg border border-neutral-800">
              {renderHighlightedAnswer()}
            </div>
          </div>

          {/* Ground Truth Answer Card */}
          {groundTruth && (
            <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  Canonical Ground Truth
                </span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  Target Benchmark
                </span>
              </div>
              <p className="text-xs text-neutral-200 font-mono leading-relaxed bg-black/40 p-3 rounded-lg border border-emerald-900/30">
                {groundTruth}
              </p>
            </div>
          )}

          {/* Decoupling Explanation Hint */}
          <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">
              <strong className="text-neutral-200">Decoupled Evaluation Principle:</strong> Even if the generated answer is fluent and truthful in the real world, it fails <span className="text-teal-300 font-mono">Faithfulness</span> if it asserts facts not present in the retrieved passages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
