import React from 'react';
import { MetricCard } from '../domain/metric-card';
import { DiagnosticBadge } from '../domain/diagnostic-badge';
import { DiffViewer } from '../domain/diff-viewer';
import { PromptBox } from '../domain/prompt-box';
import { FileDropzone } from '../domain/file-dropzone';
import { Card, CardTitle } from '../ui/card';

export const DomainComponentsTab: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* 1. Diagnostic Badges */}
      <Card className="p-6 bg-[#FBF9F4] border-[#E3DED3] space-y-4">
        <div>
          <span className="text-xs font-mono uppercase text-[#2F5D8A]">01 / Categorization</span>
          <CardTitle className="text-lg mt-1">AI Root-Cause Diagnostic Badges</CardTitle>
          <p className="text-xs text-[#5E5B53]">
            Automated triage classifications based on decoupled retriever vs generator scores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <DiagnosticBadge category="CLEAN_PASS" pulse />
          <DiagnosticBadge category="RETRIEVAL_FAILURE" pulse />
          <DiagnosticBadge category="GENERATION_HALLUCINATION" pulse />
          <DiagnosticBadge category="COMPOUND_FAILURE" pulse />
          <DiagnosticBadge category="PARTIAL_CONTEXT_MISMATCH" />
        </div>
      </Card>

      {/* 2. Metric Scorecards */}
      <div className="space-y-3">
        <div>
          <span className="text-xs font-mono uppercase text-[#1F7A4D]">02 / Scorecards</span>
          <h3 className="text-lg font-bold text-[#1B1B18] mt-1">Metric Cards with Radial Gauges</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Context Relevance"
            metricKey="retriever_precision"
            score={0.92}
            threshold={0.70}
            details="Measures whether retrieved chunks contain required context."
          />
          <MetricCard
            title="Faithfulness / Groundedness"
            metricKey="generator_hallucination"
            score={0.28}
            threshold={0.75}
            details="Measures if all answer claims can be inferred from context."
          />
          <MetricCard
            title="Answer Accuracy"
            metricKey="semantic_correctness"
            score={0.88}
            threshold={0.70}
            details="Semantic cosine similarity against ground-truth answer."
          />
        </div>
      </div>

      {/* 3. Query Tester Box */}
      <div className="space-y-3">
        <div>
          <span className="text-xs font-mono uppercase text-[#6B4C9A]">03 / Interaction</span>
          <h3 className="text-lg font-bold text-[#1B1B18] mt-1">Interactive Query Tester</h3>
        </div>
        <PromptBox />
      </div>

      {/* 4. Document Dropzone */}
      <div className="space-y-3">
        <div>
          <span className="text-xs font-mono uppercase text-[#B26B00]">04 / Ingestion</span>
          <h3 className="text-lg font-bold text-[#1B1B18] mt-1">Document Dropzone &amp; Chunker</h3>
        </div>
        <FileDropzone />
      </div>

      {/* 5. Diff Viewer */}
      <div className="space-y-3">
        <div>
          <span className="text-xs font-mono uppercase text-[#B3261E]">05 / Inspection</span>
          <h3 className="text-lg font-bold text-[#1B1B18] mt-1">Side-by-Side Context vs. Claim Highlight</h3>
        </div>
        <DiffViewer
          query="What is the employee annual leave limit?"
          retrievedChunks={[
            {
              chunk_id: 'chk_101',
              text: 'Employees are allocated 20 days paid leave per calendar year.',
              relevance_score: 0.95,
              is_relevant: true,
              page: 1,
            },
          ]}
          generatedAnswer="Employees receive 30 days of annual leave with unlimited rollover."
          groundTruth="20 days paid leave per calendar year."
          hallucinatedClaims={['30 days', 'unlimited rollover']}
        />
      </div>
    </div>
  );
};
