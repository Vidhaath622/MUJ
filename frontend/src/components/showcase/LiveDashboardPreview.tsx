import React, { useState } from 'react';
import { MetricCard } from '../domain/metric-card';
import { DiagnosticBadge } from '../domain/diagnostic-badge';
import { DiffViewer, RetrievedChunk } from '../domain/diff-viewer';
import { PromptBox } from '../domain/prompt-box';
import { FileDropzone } from '../domain/file-dropzone';
import { EvaluationTable, EvaluationItem } from '../domain/evaluation-table';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

export const LiveDashboardPreview: React.FC = () => {
  // Mock data representing a classic AI-04 diagnostic case: Hallucination despite accurate retrieval
  const [query, setQuery] = useState('How many days of annual paid leave are employees entitled to?');
  const [activeDiagnosis] = useState<'GENERATION_HALLUCINATION' | 'CLEAN_PASS' | 'RETRIEVAL_FAILURE'>('GENERATION_HALLUCINATION');

  const sampleChunks: RetrievedChunk[] = [
    {
      chunk_id: 'chk_001',
      text: 'Section 4.2 Leave Policy: Full-time employees receive 20 days of paid annual vacation per calendar year. Unused leave balances expire on December 31st and cannot be encashed.',
      relevance_score: 0.94,
      is_relevant: true,
      page: 4,
    },
    {
      chunk_id: 'chk_002',
      text: 'Section 4.3 Sick Leave: Employees are granted 10 days of non-accumulative paid sick leave upon submission of a certified medical certificate.',
      relevance_score: 0.42,
      is_relevant: false,
      page: 5,
    },
  ];

  const sampleAnswer = 'Employees are entitled to 25 days of annual paid leave and can rollover unused leave to the following calendar year.';
  const groundTruth = 'Full-time employees receive 20 days of paid annual vacation per calendar year.';
  const hallucinatedClaims = ['25 days', 'rollover unused leave to the following calendar year'];

  const sampleBatchRuns: EvaluationItem[] = [
    {
      id: 'TC-01',
      query: 'What is the annual paid leave policy?',
      retrieverScore: 0.94,
      faithfulnessScore: 0.32,
      accuracyScore: 0.40,
      diagnosis: 'GENERATION_HALLUCINATION',
      latencyMs: 312,
    },
    {
      id: 'TC-02',
      query: 'Where is the Bangalore office located?',
      retrieverScore: 0.28,
      faithfulnessScore: 0.45,
      accuracyScore: 0.20,
      diagnosis: 'RETRIEVAL_FAILURE',
      latencyMs: 185,
    },
    {
      id: 'TC-03',
      query: 'How to file medical reimbursement claims?',
      retrieverScore: 0.92,
      faithfulnessScore: 0.96,
      accuracyScore: 0.94,
      diagnosis: 'CLEAN_PASS',
      latencyMs: 440,
    },
    {
      id: 'TC-04',
      query: 'What are the maternity leave benefits?',
      retrieverScore: 0.88,
      faithfulnessScore: 0.89,
      accuracyScore: 0.86,
      diagnosis: 'CLEAN_PASS',
      latencyMs: 380,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Telemetry Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[#FBF9F4] border border-[#E3DED3] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-[#2F5D8A] bg-[#E3EAF2] border border-[#2F5D8A]/40 px-2.5 py-0.5 rounded-full">
              Live Mockup • AI-04 Spirit
            </span>
            <Badge variant="neon" size="sm" dot pulse>
              EVALUATION PIPELINE READY
            </Badge>
          </div>
          <h3 className="text-xl font-bold text-[#1B1B18] tracking-tight">
            Single-Screen Diagnostic Cockpit
          </h3>
          <p className="text-xs text-[#5E5B53]">
            Decoupling chunk retrieval precision from generator hallucination in real time.
          </p>
        </div>

        {/* Diagnosis Pill Display */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] font-mono uppercase text-[#6E6A62] block">
              Automated Root-Cause
            </span>
            <DiagnosticBadge category={activeDiagnosis} size="md" pulse />
          </div>
        </div>
      </div>

      {/* 3 Mandatory Scorecard Badges (Context Relevance, Faithfulness, Accuracy) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Context Relevance"
          metricKey="retriever_precision"
          score={0.94}
          threshold={0.70}
          details="Retrieved chunk contains precise information needed to answer the question."
          target="Retriever (Embeddings + BM25)"
        />

        <MetricCard
          title="Faithfulness / Groundedness"
          metricKey="generator_hallucination"
          score={0.32}
          threshold={0.75}
          details="Generator hallucinated claims (25 days vs 20 days) unsupported by the source text."
          target="Generator (LLM Extraction)"
        />

        <MetricCard
          title="Answer Accuracy"
          metricKey="semantic_correctness"
          score={0.40}
          threshold={0.70}
          details="Contradicts ground truth reference (25 days vs 20 days)."
          target="End-to-End Evaluation"
        />
      </div>

      {/* Interactive Query Box */}
      <PromptBox
        onSubmit={(q) => setQuery(q)}
      />

      {/* Side-by-Side Diff Comparison Panel */}
      <DiffViewer
        query={query}
        retrievedChunks={sampleChunks}
        generatedAnswer={sampleAnswer}
        groundTruth={groundTruth}
        hallucinatedClaims={hallucinatedClaims}
      />

      {/* Bottom Row: Document Dropzone & Batch Test Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-4 bg-[#FBF9F4] border-[#E3DED3] space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#5E5B53] font-bold">
              Document Knowledge Base
            </h4>
            <FileDropzone />
          </Card>
        </div>

        <div className="lg:col-span-8">
          <EvaluationTable
            items={sampleBatchRuns}
          />
        </div>
      </div>
    </div>
  );
};
