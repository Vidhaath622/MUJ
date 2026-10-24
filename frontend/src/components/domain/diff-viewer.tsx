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
      return <p className="text-sm text-[#1B1B18] leading-relaxed font-sans">{generatedAnswer}</p>;
    }

    const claimMatches = hallucinatedClaims.filter(c => generatedAnswer.includes(c));

    if (claimMatches.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-[#1B1B18] leading-relaxed font-sans">{generatedAnswer}</p>
          <div className="p-2 rounded bg-[#F6E3E0] border border-[#B3261E]/40 text-xs text-[#B3261E]">
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
            className="bg-[#B3261E] text-[#B3261E] px-1 py-0.5 rounded border border-[#B3261E]/40 font-medium decoration-[#B3261E]/40 underline decoration-wavy underline-offset-4"
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
        <div className="text-sm text-[#1B1B18] leading-relaxed font-sans">
          {renderedParts}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#B3261E] bg-[#F6E3E0] p-2 rounded border border-[#B3261E]/40">
          <AlertCircle className="w-3.5 h-3.5 text-[#B3261E] flex-shrink-0" />
          <span>Wavy red underline marks factual claims unsupported by retrieved context.</span>
        </div>
      </div>
    );
  };

  const relevantCount = retrievedChunks.filter(c => c.is_relevant).length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Top Banner: Evaluated Query */}
      <Card variant="glass" className="p-4 border-[#E3DED3] bg-[#F6F3EC]/90">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#2F5D8A] bg-[#E3EAF2] px-2 py-0.5 rounded border border-[#2F5D8A]/40 font-semibold">
              Live Query Under Test
            </span>
            {documentName && (
              <span className="text-xs font-mono text-[#5E5B53]">
                Source Document: <span className="text-[#1B1B18] font-semibold">{documentName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {replay && (
              <div className="flex items-center bg-[#FBF9F4] p-0.5 rounded-lg border border-[#6B4C9A]/40 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveTab('trace')}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition',
                    activeTab === 'trace' ? 'bg-[#FBF9F4] text-[#1B1B18] font-bold' : 'text-[#5E5B53] hover:text-[#1B1B18]'
                  )}
                >
                  Trace Inspector
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('replay')}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition flex items-center gap-1.5',
                    activeTab === 'replay' ? 'bg-[#ECE6F3] text-[#6B4C9A] font-bold border border-[#6B4C9A]/40' : 'text-[#6B4C9A] hover:text-[#6B4C9A]'
                  )}
                >
                  <FlaskConical className="w-3 h-3 text-[#6B4C9A]" />
                  <span>Gold Replay Experiment</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6B4C9A] animate-pulse"></span>
                </button>
              </div>
            )}
            <div className="text-[11px] font-mono text-[#5E5B53] hidden sm:block">
              Retrieval coverage: <span className="font-semibold text-[#1B1B18]">{relevantCount} of {retrievedChunks.length} relevant</span>
            </div>
          </div>
        </div>
        <p className="text-base font-medium text-[#1B1B18] tracking-tight mt-2 font-sans">
          "{query}"
        </p>
      </Card>

      {/* VIEW 1: Standard Trace Inspector */}
      {activeTab === 'trace' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Pane: Retrieved Context Chunks */}
          <Card className="bg-[#FBF9F4] border-[#E3DED3] flex flex-col">
            <CardHeader className="border-b border-[#E3DED3] pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-[#2F5D8A]" />
                  <CardTitle className="text-sm">Retrieved Grounding Chunks (Retriever)</CardTitle>
                </div>
                <span className="text-xs font-mono text-[#5E5B53]">
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
                        ? 'bg-[#FBF9F4] border-[#1F7A4D]/40 text-[#1B1B18]'
                        : 'bg-[#F6E3E0] border-[#B3261E]/40 text-[#5E5B53] opacity-80'
                    )}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px] flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#2F5D8A] bg-[#E3EAF2] px-2 py-0.5 rounded border border-[#2F5D8A]/40">
                          {chunk.chunk_id}
                        </span>
                        {chunk.page && <span className="text-[#6E6A62]">p. {chunk.page}</span>}
                        {chunk.document_name && (
                          <span className="text-[#5E5B53] truncate max-w-[140px]">
                            {chunk.document_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isTarget && (
                          <Badge variant="outline" size="sm" className="text-[10px] text-[#1F6F6A] border-[#1F6F6A]/40 bg-[#E2EFEC]">
                            Target Chunk
                          </Badge>
                        )}
                        <Badge variant={chunk.is_relevant ? 'success' : 'danger'} size="sm" dot>
                          {chunk.is_relevant ? 'RELEVANT' : 'NOISE / OMITTED'}
                        </Badge>
                      </div>
                    </div>

                    <p className="leading-relaxed font-mono text-xs bg-[#F6F3EC] p-2.5 rounded-lg border border-[#E3DED3] text-[#33322D]">
                      {chunk.text}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-[#E3DED3] text-[11px] font-mono">
                      <span className="text-[#6E6A62]">Relevance Score:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#33322D] font-bold">
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
                <div className="p-3 rounded-xl bg-[#F5EBD8] border border-[#B26B00]/40 text-xs text-[#B26B00] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono">
                    <AlertCircle className="w-4 h-4 text-[#B26B00]" />
                    <span>RETRIEVAL GAP DETECTED</span>
                  </div>
                  <p className="text-[#33322D] text-[11px] leading-relaxed">
                    Canonical target chunk <span className="font-mono text-[#B26B00]">[{groundTruthChunkIds.join(', ')}]</span> was not fetched in the top-k retrieved set.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Pane: Generated Answer vs Ground Truth */}
          <Card className="bg-[#FBF9F4] border-[#E3DED3] flex flex-col">
            <CardHeader className="border-b border-[#E3DED3] pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#1F6F6A]" />
                  <CardTitle className="text-sm">LLM Answer vs. Ground Truth</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCopy}
                  className="text-[#5E5B53] hover:text-[#1B1B18]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#1F7A4D]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="ml-1 text-[11px] font-mono">{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 flex-1">
              {/* Active Generated Answer */}
              <div className="bg-[#FBF9F4] border border-[#E3DED3] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#1F6F6A] uppercase font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#1F6F6A]" />
                    Generated Candidate Response
                  </span>
                  <span className="text-[10px] font-mono text-[#5E5B53] bg-[#FBF9F4] px-2 py-0.5 rounded border border-[#E3DED3]">
                    Model Output
                  </span>
                </div>
                {renderHighlightedAnswer()}
              </div>

              {/* Ground Truth Reference */}
              {groundTruth ? (
                <div className="bg-[#E6F0E8] border border-[#1F7A4D]/40 rounded-xl p-3 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-[#1F7A4D] uppercase font-bold flex items-center gap-1">
                    <BookmarkCheck className="w-3 h-3" />
                    Ground Truth Reference:
                  </span>
                  <p className="text-[#1B1B18] leading-relaxed font-mono text-xs bg-[#F6F3EC] p-2.5 rounded border border-[#1F7A4D]/40">
                    {groundTruth}
                  </p>
                </div>
              ) : (
                <div className="bg-[#F5EBD8] border border-[#B26B00]/40 rounded-xl p-3 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-[#B26B00] uppercase font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No Ground Truth Provided
                  </span>
                  <p className="text-[#5E5B53] text-xs">
                    Evaluated solely on Context Relevance &amp; Groundedness Faithfulness.
                  </p>
                </div>
              )}

              {/* Principle Note */}
              <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#E3DED3] text-[11px] text-[#5E5B53] flex items-start gap-2">
                <span className="font-bold text-[#1B1B18] uppercase font-mono text-[10px]">Note:</span>
                <p className="leading-relaxed">
                  Even if the generated answer is truthful in the real world, it fails <span className="text-[#1F6F6A] font-mono">Faithfulness</span> if it asserts facts not present in the retrieved passages.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW 2: Causal Replay Experiment (The Hero of the Live Demo) */}
      {activeTab === 'replay' && replay && (
        <Card className="bg-[#FBF9F4] border-[#6B4C9A]/40 p-5 space-y-4 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E3DED3] pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-[#6B4C9A]" />
              <div>
                <h4 className="text-sm font-bold text-[#1B1B18] tracking-tight flex items-center gap-2">
                  <span>Causal Verdict By Replay Experiment</span>
                  <Badge variant="neon" size="sm">
                    HERO PROOF
                  </Badge>
                </h4>
                <p className="text-[11px] text-[#5E5B53] font-mono">
                  Isolates retriever vs generator: re-runs the generator with ONLY the canonical gold passage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-[#5E5B53]">Replay Accuracy:</span>
              <Badge variant={replay.answer_accuracy && replay.answer_accuracy >= 0.70 ? 'success' : 'danger'} size="sm">
                {replay.answer_accuracy ? `${(replay.answer_accuracy * 100).toFixed(0)}%` : 'N/A'}
              </Badge>
              <span className="text-[#5E5B53] ml-2">Replay Faithfulness:</span>
              <Badge variant={replay.faithfulness >= 0.75 ? 'success' : 'danger'} size="sm">
                {(replay.faithfulness * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Causal Effect Statement */}
          <div className="p-3.5 rounded-xl bg-[#ECE6F3] border border-[#6B4C9A]/40 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#6B4C9A] mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B4C9A] font-bold block mb-0.5">
                Causal Experiment Finding:
              </span>
              <p className="text-sm text-[#1B1B18] font-medium leading-relaxed">
                {replay.verdict_effect}
              </p>
            </div>
          </div>

          {/* Side by side: Original Failed Answer vs Replay with Gold Chunk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            {/* Left: Original Pipeline Answer (With Retrieval Fault) */}
            <div className="p-4 rounded-xl border border-[#E3DED3] bg-[#F6F3EC] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#B3261E] uppercase flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  1. Original System Output (Standard RAG)
                </span>
                <span className="text-[10px] font-mono text-[#6E6A62]">
                  Retrieved Context (Incomplete/Noise)
                </span>
              </div>
              <p className="text-xs text-[#33322D] font-mono leading-relaxed bg-[#FBF9F4] p-3 rounded-lg border border-[#E3DED3]">
                {generatedAnswer}
              </p>
            </div>

            {/* Right: Replay Output (With Forced Gold Context) */}
            <div className="p-4 rounded-xl border border-[#1F7A4D]/40 bg-[#E6F0E8] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#1F7A4D] uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  2. Replay Output (Forced Gold Chunk Only)
                </span>
                <span className="text-[10px] font-mono text-[#1F7A4D] bg-[#E6F0E8] px-2 py-0.5 rounded border border-[#1F7A4D]/40 font-bold">
                  Perfect Evidence Injected
                </span>
              </div>
              <p className="text-xs text-[#1B1B18] font-mono leading-relaxed bg-[#F6F3EC] p-3 rounded-lg border border-[#1F7A4D]/40">
                {replay.answer}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
