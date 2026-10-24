import React, { useState } from 'react';
import { BentoGrid, BentoCard } from '../magic/bento-grid';
import { AnimatedCounter } from '../magic/animated-counter';
import { Marquee } from '../magic/marquee';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Cpu, Database, Activity, ShieldCheck, Zap, RefreshCw } from 'lucide-react';

export const MagicEffectsTab: React.FC = () => {
  const [testScore, setTestScore] = useState(88);
  const [evalCount, setEvalCount] = useState(1420);

  const randomize = () => {
    setTestScore(Math.floor(Math.random() * 40) + 60);
    setEvalCount((prev) => prev + Math.floor(Math.random() * 50) + 10);
  };

  return (
    <div className="space-y-8">
      {/* Live Marquee Ticker */}
      <Card className="bg-[var(--panel)] border-[var(--rule)] overflow-hidden p-2">
        <div className="px-3 py-1 text-[11px] font-mono text-[var(--ink-2)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--rule)] mb-1">
          <span className="flex items-center gap-1.5 text-[var(--accent)]">
            <Activity className="w-3.5 h-3.5" />
            Live Event Stream (Magic UI Marquee)
          </span>
          <span>AUTONOMOUS HARNESS</span>
        </div>
        <Marquee pauseOnHover>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--panel)] border border-[var(--rule)] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--ok)]" />
            <span className="text-[var(--ink-1)]">TC-01: Context Relevance 94% [PASS]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--panel)] border border-[var(--rule)] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--gen)]" />
            <span className="text-[var(--ink-1)]">TC-02: Faithfulness 32% [GENERATION_HALLUCINATION]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--panel)] border border-[var(--rule)] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--retr)]" />
            <span className="text-[var(--ink-1)]">TC-03: Chunk Missing [RETRIEVAL_FAILURE]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--panel)] border border-[var(--rule)] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--ok)]" />
            <span className="text-[var(--ink-1)]">TC-04: Ground Truth Aligned [PASS]</span>
          </div>
        </Marquee>
      </Card>

      {/* Animated Number Counters */}
      <Card className="p-6 bg-[var(--panel)] border-[var(--rule)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-[var(--accent)]">02 / Motion</span>
            <h3 className="text-lg font-bold text-[var(--ink)] mt-0.5">Smooth Animated Counters</h3>
            <p className="text-xs text-[var(--ink-2)]">
              Interpolates numbers with ease-out quad on data updates.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={randomize} className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Randomize Values</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 font-mono">
          <div className="p-4 rounded-xl bg-[var(--panel)] border border-[var(--rule)]">
            <span className="text-[11px] text-[var(--muted)] uppercase block">Total Queries Evaluated</span>
            <AnimatedCounter
              value={evalCount}
              className="text-3xl text-[var(--ink)] font-bold"
            />
            <span className="text-xs text-[var(--ok)] block mt-1">+12.4% vs last run</span>
          </div>

          <div className="p-4 rounded-xl bg-[var(--panel)] border border-[var(--rule)]">
            <span className="text-[11px] text-[var(--muted)] uppercase block">Mean Groundedness</span>
            <AnimatedCounter
              value={testScore}
              suffix="%"
              className="text-3xl text-[var(--accent)] font-bold"
            />
            <span className="text-xs text-[var(--ink-2)] block mt-1">Target &ge; 75%</span>
          </div>

          <div className="p-4 rounded-xl bg-[var(--panel)] border border-[var(--rule)]">
            <span className="text-[11px] text-[var(--muted)] uppercase block">Mean Latency</span>
            <AnimatedCounter
              value={18.4}
              precision={1}
              suffix=" ms"
              className="text-3xl text-[var(--violet)] font-bold"
            />
            <span className="text-xs text-[var(--ink-2)] block mt-1">Local NLI Model</span>
          </div>
        </div>
      </Card>

      {/* Bento Grid Layout (Magic UI / 21st.dev style) */}
      <div className="space-y-4">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--violet)]">03 / Layouts</span>
          <h3 className="text-lg font-bold text-[var(--ink)] mt-0.5">Modular Bento Grid System</h3>
          <p className="text-xs text-[var(--ink-2)]">
            High-density dashboard cards inspired by Magic UI and Bento Grids.
          </p>
        </div>

        <BentoGrid>
          <BentoCard
            icon={<Database className="w-5 h-5" />}
            title="Chunk Embedding Index"
            description="Vector search + lexical BM25 indexing running in isolated memory space."
            className="md:col-span-2"
          >
            <div className="p-3 bg-[var(--panel)] rounded-lg border border-[var(--rule)] font-mono text-xs text-[var(--ink-1)]">
              Index: HNSW • Dimensions: 1536 • Top-K: 5 • Similarity: Cosine
            </div>
          </BentoCard>

          <BentoCard
            icon={<Cpu className="w-5 h-5" />}
            title="NLI Evaluator"
            description="Entailment vs Contradiction classification engine."
          >
            <Badge variant="success" size="sm" dot>
              Cross-Encoder Online
            </Badge>
          </BentoCard>

          <BentoCard
            icon={<ShieldCheck className="w-5 h-5" />}
            title="Synthetic Q&A Generator"
            description="Generates question-answer-context triples directly from uploaded documents."
          >
            <div className="text-xs font-mono text-[var(--accent)]">Auto-Generates 5 Test Triples / Chunk</div>
          </BentoCard>

          <BentoCard
            icon={<Zap className="w-5 h-5" />}
            title="Root-Cause Diagnostic Engine"
            description="Pinpoints exact failure node between retriever failure and LLM hallucination."
            className="md:col-span-2"
          >
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="success">CLEAN_PASS</Badge>
              <Badge variant="warning">RETRIEVAL_FAILURE</Badge>
              <Badge variant="danger">GENERATION_HALLUCINATION</Badge>
              <Badge variant="purple">COMPOUND_FAILURE</Badge>
            </div>
          </BentoCard>
        </BentoGrid>
      </div>
    </div>
  );
};
