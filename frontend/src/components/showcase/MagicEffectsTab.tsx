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
      <Card className="bg-[#FBF9F4] border-[#E3DED3] overflow-hidden p-2">
        <div className="px-3 py-1 text-[11px] font-mono text-[#5E5B53] uppercase tracking-wider flex items-center justify-between border-b border-[#E3DED3] mb-1">
          <span className="flex items-center gap-1.5 text-[#2F5D8A]">
            <Activity className="w-3.5 h-3.5" />
            Live Event Stream (Magic UI Marquee)
          </span>
          <span>AUTONOMOUS HARNESS</span>
        </div>
        <Marquee pauseOnHover>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FBF9F4] border border-[#E3DED3] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#1F7A4D]" />
            <span className="text-[#33322D]">TC-01: Context Relevance 94% [PASS]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FBF9F4] border border-[#E3DED3] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#B3261E]" />
            <span className="text-[#33322D]">TC-02: Faithfulness 32% [GENERATION_HALLUCINATION]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FBF9F4] border border-[#E3DED3] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#B26B00]" />
            <span className="text-[#33322D]">TC-03: Chunk Missing [RETRIEVAL_FAILURE]</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FBF9F4] border border-[#E3DED3] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#1F7A4D]" />
            <span className="text-[#33322D]">TC-04: Ground Truth Aligned [PASS]</span>
          </div>
        </Marquee>
      </Card>

      {/* Animated Number Counters */}
      <Card className="p-6 bg-[#FBF9F4] border-[#E3DED3] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-[#2F5D8A]">02 / Motion</span>
            <h3 className="text-lg font-bold text-[#1B1B18] mt-0.5">Smooth Animated Counters</h3>
            <p className="text-xs text-[#5E5B53]">
              Interpolates numbers with ease-out quad on data updates.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={randomize} className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Randomize Values</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 font-mono">
          <div className="p-4 rounded-xl bg-[#FBF9F4] border border-[#E3DED3]">
            <span className="text-[11px] text-[#6E6A62] uppercase block">Total Queries Evaluated</span>
            <AnimatedCounter
              value={evalCount}
              className="text-3xl text-[#1B1B18] font-bold"
            />
            <span className="text-xs text-[#1F7A4D] block mt-1">+12.4% vs last run</span>
          </div>

          <div className="p-4 rounded-xl bg-[#FBF9F4] border border-[#E3DED3]">
            <span className="text-[11px] text-[#6E6A62] uppercase block">Mean Groundedness</span>
            <AnimatedCounter
              value={testScore}
              suffix="%"
              className="text-3xl text-[#2F5D8A] font-bold"
            />
            <span className="text-xs text-[#5E5B53] block mt-1">Target &ge; 75%</span>
          </div>

          <div className="p-4 rounded-xl bg-[#FBF9F4] border border-[#E3DED3]">
            <span className="text-[11px] text-[#6E6A62] uppercase block">Mean Latency</span>
            <AnimatedCounter
              value={18.4}
              precision={1}
              suffix=" ms"
              className="text-3xl text-[#6B4C9A] font-bold"
            />
            <span className="text-xs text-[#5E5B53] block mt-1">Local NLI Model</span>
          </div>
        </div>
      </Card>

      {/* Bento Grid Layout (Magic UI / 21st.dev style) */}
      <div className="space-y-4">
        <div>
          <span className="text-xs font-mono uppercase text-[#6B4C9A]">03 / Layouts</span>
          <h3 className="text-lg font-bold text-[#1B1B18] mt-0.5">Modular Bento Grid System</h3>
          <p className="text-xs text-[#5E5B53]">
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
            <div className="p-3 bg-[#FBF9F4] rounded-lg border border-[#E3DED3] font-mono text-xs text-[#33322D]">
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
            <div className="text-xs font-mono text-[#2F5D8A]">Auto-Generates 5 Test Triples / Chunk</div>
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
