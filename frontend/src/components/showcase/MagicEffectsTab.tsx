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
      <Card className="bg-neutral-900/90 border-neutral-800 overflow-hidden p-2">
        <div className="px-3 py-1 text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center justify-between border-b border-neutral-800/80 mb-1">
          <span className="flex items-center gap-1.5 text-sky-400">
            <Activity className="w-3.5 h-3.5" />
            Live Event Stream (Magic UI Marquee)
          </span>
          <span>AUTONOMOUS HARNESS</span>
        </div>
        <Marquee pauseOnHover>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-neutral-300">TC-01: Context Relevance 94% [PASS]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="text-neutral-300">TC-02: Faithfulness 32% [GENERATION_HALLUCINATION]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-neutral-300">TC-03: Chunk Missing [RETRIEVAL_FAILURE]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-neutral-300">TC-04: Ground Truth Aligned [PASS]</span>
          </div>
        </Marquee>
      </Card>

      {/* Animated Number Counters */}
      <Card className="p-6 bg-neutral-900/90 border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-sky-400">02 / Motion</span>
            <h3 className="text-lg font-bold text-white mt-0.5">Smooth Animated Counters</h3>
            <p className="text-xs text-neutral-400">
              Interpolates numbers with ease-out quad on data updates.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={randomize} className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Randomize Values</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 font-mono">
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase block">Total Queries Evaluated</span>
            <AnimatedCounter
              value={evalCount}
              className="text-3xl text-white font-bold"
            />
            <span className="text-xs text-emerald-400 block mt-1">+12.4% vs last run</span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase block">Mean Groundedness</span>
            <AnimatedCounter
              value={testScore}
              suffix="%"
              className="text-3xl text-sky-400 font-bold"
            />
            <span className="text-xs text-neutral-400 block mt-1">Target &ge; 75%</span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
            <span className="text-[11px] text-neutral-500 uppercase block">Mean Latency</span>
            <AnimatedCounter
              value={18.4}
              precision={1}
              suffix=" ms"
              className="text-3xl text-purple-400 font-bold"
            />
            <span className="text-xs text-neutral-400 block mt-1">Local NLI Model</span>
          </div>
        </div>
      </Card>

      {/* Bento Grid Layout (Magic UI / 21st.dev style) */}
      <div className="space-y-4">
        <div>
          <span className="text-xs font-mono uppercase text-purple-400">03 / Layouts</span>
          <h3 className="text-lg font-bold text-white mt-0.5">Modular Bento Grid System</h3>
          <p className="text-xs text-neutral-400">
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
            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 font-mono text-xs text-neutral-300">
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
            <div className="text-xs font-mono text-sky-400">Auto-Generates 5 Test Triples / Chunk</div>
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
