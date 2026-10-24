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
      return <p className="text-sm text-[var(--ink)] leading-relaxed font-sans">{generatedAnswer}</p>;
    }

    const claimMatches = hallucinatedClaims.filter(c => generatedAnswer.includes(c));

    if (claimMatches.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink)] leading-relaxed font-sans">{generatedAnswer}</p>
          <div className="p-2 rounded bg-[var(--gen-tint)] border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] text-xs text-[var(--gen)]">
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
            className="bg-[var(--gen)] text-[var(--gen)] px-1 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] font-medium decoration-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] underline decoration-wavy underline-offset-4"
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
        <div className="text-sm text-[var(--ink)] leading-relaxed font-sans">
          {renderedParts}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--gen)] bg-[var(--gen-tint)] p-2 rounded border border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)]">
          <AlertCircle className="w-3.5 h-3.5 text-[var(--gen)] flex-shrink-0" />
          <span>Wavy red underline marks factual claims unsupported by retrieved context.</span>
        </div>
      </div>
    );
  };

  const relevantCount = retrievedChunks.filter(c => c.is_relevant).length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Top Banner: Evaluated Query */}
      <Card variant="glass" className="p-4 border-[var(--rule)] bg-[color:color-mix(in_srgb,var(--paper)_90%,transparent)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] bg-[var(--accent-tint)] px-2 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] font-semibold">
              Live Query Under Test
            </span>
            {documentName && (
              <span className="text-xs font-mono text-[var(--ink-2)]">
                Source Document: <span className="text-[var(--ink)] font-semibold">{documentName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {replay && (
              <div className="flex items-center bg-[var(--panel)] p-0.5 rounded-lg border border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)] text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveTab('trace')}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition',
                    activeTab === 'trace' ? 'bg-[var(--panel)] text-[var(--ink)] font-bold' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                  )}
                >
                  Trace Inspector
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('replay')}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition flex items-center gap-1.5',
                    activeTab === 'replay' ? 'bg-[var(--violet-tint)] text-[var(--violet)] font-bold border border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)]' : 'text-[var(--violet)] hover:text-[var(--violet)]'
                  )}
                >
                  <FlaskConical className="w-3 h-3 text-[var(--violet)]" />
                  <span>Gold Replay Experiment</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--violet)] animate-pulse"></span>
                </button>
              </div>
            )}
            <div className="text-[11px] font-mono text-[var(--ink-2)] hidden sm:block">
              Retrieval coverage: <span className="font-semibold text-[var(--ink)]">{relevantCount} of {retrievedChunks.length} relevant</span>
            </div>
          </div>
        </div>
        <p className="text-base font-medium text-[var(--ink)] tracking-tight mt-2 font-sans">
          "{query}"
        </p>
      </Card>

      {/* VIEW 1: Standard Trace Inspector */}
      {activeTab === 'trace' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Pane: Retrieved Context Chunks */}
          <Card className="bg-[var(--panel)] border-[var(--rule)] flex flex-col">
            <CardHeader className="border-b border-[var(--rule)] pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-[var(--accent)]" />
                  <CardTitle className="text-sm">Retrieved Grounding Chunks (Retriever)</CardTitle>
                </div>
                <span className="text-xs font-mono text-[var(--ink-2)]">
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
                        ? 'bg-[var(--panel)] border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] text-[var(--ink)]'
                        : 'bg-[var(--gen-tint)] border-[color:color-mix(in_srgb,var(--gen)_40%,transparent)] text-[var(--ink-2)] opacity-80'
                    )}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px] flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--accent)] bg-[var(--accent-tint)] px-2 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]">
                          {chunk.chunk_id}
                        </span>
                        {chunk.page && <span className="text-[var(--muted)]">p. {chunk.page}</span>}
                        {chunk.document_name && (
                          <span className="text-[var(--ink-2)] truncate max-w-[140px]">
                            {chunk.document_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isTarget && (
                          <Badge variant="outline" size="sm" className="text-[10px] text-[var(--teal)] border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)] bg-[var(--teal-tint)]">
                            Target Chunk
                          </Badge>
                        )}
                        <Badge variant={chunk.is_relevant ? 'success' : 'danger'} size="sm" dot>
                          {chunk.is_relevant ? 'RELEVANT' : 'NOISE / OMITTED'}
                        </Badge>
                      </div>
                    </div>

                    <p className="leading-relaxed font-mono text-xs bg-[var(--paper)] p-2.5 rounded-lg border border-[var(--rule)] text-[var(--ink-1)]">
                      {chunk.text}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-[var(--rule)] text-[11px] font-mono">
                      <span className="text-[var(--muted)]">Relevance Score:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--ink-1)] font-bold">
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
                <div className="p-3 rounded-xl bg-[var(--retr-tint)] border border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)] text-xs text-[var(--retr)] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono">
                    <AlertCircle className="w-4 h-4 text-[var(--retr)]" />
                    <span>RETRIEVAL GAP DETECTED</span>
                  </div>
                  <p className="text-[var(--ink-1)] text-[11px] leading-relaxed">
                    Canonical target chunk <span className="font-mono text-[var(--retr)]">[{groundTruthChunkIds.join(', ')}]</span> was not fetched in the top-k retrieved set.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Pane: Generated Answer vs Ground Truth */}
          <Card className="bg-[var(--panel)] border-[var(--rule)] flex flex-col">
            <CardHeader className="border-b border-[var(--rule)] pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[var(--teal)]" />
                  <CardTitle className="text-sm">LLM Answer vs. Ground Truth</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleCopy}
                  className="text-[var(--ink-2)] hover:text-[var(--ink)]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[var(--ok)]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="ml-1 text-[11px] font-mono">{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 flex-1">
              {/* Active Generated Answer */}
              <div className="bg-[var(--panel)] border border-[var(--rule)] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[var(--teal)] uppercase font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[var(--teal)]" />
                    Generated Candidate Response
                  </span>
                  <span className="text-[10px] font-mono text-[var(--ink-2)] bg-[var(--panel)] px-2 py-0.5 rounded border border-[var(--rule)]">
                    Model Output
                  </span>
                </div>
                {renderHighlightedAnswer()}
              </div>

              {/* Ground Truth Reference */}
              {groundTruth ? (
                <div className="bg-[var(--ok-tint)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] rounded-xl p-3 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-[var(--ok)] uppercase font-bold flex items-center gap-1">
                    <BookmarkCheck className="w-3 h-3" />
                    Ground Truth Reference:
                  </span>
                  <p className="text-[var(--ink)] leading-relaxed font-mono text-xs bg-[var(--paper)] p-2.5 rounded border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]">
                    {groundTruth}
                  </p>
                </div>
              ) : (
                <div className="bg-[var(--retr-tint)] border border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)] rounded-xl p-3 space-y-1 text-xs">
                  <span className="text-[10px] font-mono text-[var(--retr)] uppercase font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    No Ground Truth Provided
                  </span>
                  <p className="text-[var(--ink-2)] text-xs">
                    Evaluated solely on Context Relevance &amp; Groundedness Faithfulness.
                  </p>
                </div>
              )}

              {/* Principle Note */}
              <div className="p-3 rounded-xl bg-[var(--panel)] border border-[var(--rule)] text-[11px] text-[var(--ink-2)] flex items-start gap-2">
                <span className="font-bold text-[var(--ink)] uppercase font-mono text-[10px]">Note:</span>
                <p className="leading-relaxed">
                  Even if the generated answer is truthful in the real world, it fails <span className="text-[var(--teal)] font-mono">Faithfulness</span> if it asserts facts not present in the retrieved passages.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW 2: Causal Replay Experiment (The Hero of the Live Demo) */}
      {activeTab === 'replay' && replay && (
        <Card className="bg-[var(--panel)] border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)] p-5 space-y-4 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--rule)] pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-[var(--violet)]" />
              <div>
                <h4 className="text-sm font-bold text-[var(--ink)] tracking-tight flex items-center gap-2">
                  <span>Causal Verdict By Replay Experiment</span>
                  <Badge variant="neon" size="sm">
                    HERO PROOF
                  </Badge>
                </h4>
                <p className="text-[11px] text-[var(--ink-2)] font-mono">
                  Isolates retriever vs generator: re-runs the generator with ONLY the canonical gold passage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-[var(--ink-2)]">Replay Accuracy:</span>
              <Badge variant={replay.answer_accuracy && replay.answer_accuracy >= 0.70 ? 'success' : 'danger'} size="sm">
                {replay.answer_accuracy ? `${(replay.answer_accuracy * 100).toFixed(0)}%` : 'N/A'}
              </Badge>
              <span className="text-[var(--ink-2)] ml-2">Replay Faithfulness:</span>
              <Badge variant={replay.faithfulness >= 0.75 ? 'success' : 'danger'} size="sm">
                {(replay.faithfulness * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Causal Effect Statement */}
          <div className="p-3.5 rounded-xl bg-[var(--violet-tint)] border border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)] flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[var(--violet)] mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--violet)] font-bold block mb-0.5">
                Causal Experiment Finding:
              </span>
              <p className="text-sm text-[var(--ink)] font-medium leading-relaxed">
                {replay.verdict_effect}
              </p>
            </div>
          </div>

          {/* Side by side: Original Failed Answer vs Replay with Gold Chunk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            {/* Left: Original Pipeline Answer (With Retrieval Fault) */}
            <div className="p-4 rounded-xl border border-[var(--rule)] bg-[var(--paper)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[var(--gen)] uppercase flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  1. Original System Output (Standard RAG)
                </span>
                <span className="text-[10px] font-mono text-[var(--muted)]">
                  Retrieved Context (Incomplete/Noise)
                </span>
              </div>
              <p className="text-xs text-[var(--ink-1)] font-mono leading-relaxed bg-[var(--panel)] p-3 rounded-lg border border-[var(--rule)]">
                {generatedAnswer}
              </p>
            </div>

            {/* Right: Replay Output (With Forced Gold Context) */}
            <div className="p-4 rounded-xl border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[var(--ok-tint)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[var(--ok)] uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  2. Replay Output (Forced Gold Chunk Only)
                </span>
                <span className="text-[10px] font-mono text-[var(--ok)] bg-[var(--ok-tint)] px-2 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] font-bold">
                  Perfect Evidence Injected
                </span>
              </div>
              <p className="text-xs text-[var(--ink)] font-mono leading-relaxed bg-[var(--paper)] p-3 rounded-lg border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]">
                {replay.answer}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
