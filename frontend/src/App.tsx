import React, { useState } from 'react';
import { RAGSealNavbar } from './components/ragseal/RAGSealNavbar';
import { MetricScorecardsRow } from './components/ragseal/MetricScorecardsRow';
import { RootCausePanel } from './components/ragseal/RootCausePanel';
import { SideBySideTraceView } from './components/ragseal/SideBySideTraceView';
import { LiveQueryRunner } from './components/ragseal/LiveQueryRunner';
import { BatchSummarySection } from './components/ragseal/BatchSummarySection';
import { DocumentVaultModal } from './components/ragseal/DocumentVaultModal';
import { SyntheticGeneratorModal } from './components/ragseal/SyntheticGeneratorModal';
import { ComponentLibraryTab } from './components/showcase/ComponentLibraryTab';
import { 
  MOCK_ATS_DOCUMENTS, 
  MOCK_EVALUATION_CASES, 
  MOCK_BATCH_SUMMARY, 
  MOCK_SYNTHETIC_QUESTIONS 
} from './data/mockAtsDataset';
import { SyntheticTestCase, EvaluationResult } from './types/ragseal';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'cockpit' | 'batch' | 'components'>('cockpit');
  const [activeCaseId, setActiveCaseId] = useState<string>('case_01');
  const [selectedDocId, setSelectedDocId] = useState<string>('doc_ats_03');
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(false);
  const [isDocVaultOpen, setIsDocVaultOpen] = useState<boolean>(false);
  const [isSyntheticOpen, setIsSyntheticOpen] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Active evaluation case
  const currentEvaluation: EvaluationResult = 
    MOCK_EVALUATION_CASES[activeCaseId] || MOCK_EVALUATION_CASES['case_01'];

  // Handler for running query from the query runner
  const handleRunQuery = (query: string, docId: string, groundTruth?: string) => {
    setSelectedDocId(docId);
    setIsEvaluating(true);
    setTimeout(() => {
      setIsEvaluating(false);
      // If matches one of our known cases, activate that case
      const matchedCaseKey = Object.keys(MOCK_EVALUATION_CASES).find(
        (key) => MOCK_EVALUATION_CASES[key].query.toLowerCase() === query.toLowerCase()
      );
      if (matchedCaseKey) {
        setActiveCaseId(matchedCaseKey);
      }
      if (groundTruth) {
        // Can be logged or utilized
      }
    }, 700);
  };

  // Handler for selecting synthetic test question
  const handleSelectSyntheticQuestion = (q: SyntheticTestCase) => {
    if (q.source_chunk_id.startsWith('chk_pol')) {
      setSelectedDocId('doc_ats_01');
    } else if (q.source_chunk_id.startsWith('chk_res')) {
      setSelectedDocId('doc_ats_02');
    } else {
      setSelectedDocId('doc_ats_03');
    }
    setActiveCaseId('case_01');
    setActiveView('cockpit');
  };

  // Handler for clicking a row in batch table -> opens in Trace Inspector
  const handleSelectCaseFromBatch = (caseId: string) => {
    setActiveCaseId(caseId);
    setActiveView('cockpit');
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* RAGSeal Brand Navigation Header */}
      <RAGSealNavbar
        isLiveBackend={isLiveBackend}
        onToggleLiveBackend={() => setIsLiveBackend(!isLiveBackend)}
        onOpenDocVault={() => setIsDocVaultOpen(true)}
        onOpenSyntheticGenerator={() => setIsSyntheticOpen(true)}
        onRunBatchSuite={() => setActiveView('batch')}
        activeView={activeView}
        onSelectView={setActiveView}
        isEvaluating={isEvaluating}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* VIEW 1: Single-Screen Trace Inspector Command Center */}
        {activeView === 'cockpit' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 1. Live Query Tester & Starter Questions */}
            <LiveQueryRunner
              documents={MOCK_ATS_DOCUMENTS}
              selectedDocId={selectedDocId}
              onSelectDoc={setSelectedDocId}
              onRunQuery={handleRunQuery}
              onSelectPresetCase={setActiveCaseId}
              activeCaseId={activeCaseId}
              isEvaluating={isEvaluating}
            />

            {/* 2. Colour-Coded Scorecards (Context Relevance, Faithfulness, Accuracy) */}
            <MetricScorecardsRow
              metrics={currentEvaluation.metrics}
              sampleCount={1}
            />

            {/* 3. Root Cause Diagnosis & Engineering Remediation Panel */}
            <RootCausePanel
              diagnosis={currentEvaluation.root_cause}
              release={currentEvaluation.release}
              evaluationMode={currentEvaluation.evaluation_mode}
              evaluationId={currentEvaluation.evaluation_id}
              latencyMs={currentEvaluation.latency_ms}
            />

            {/* 4. Side-by-Side Trace View: Retrieved Chunks beside LLM Answer & Ground Truth */}
            <SideBySideTraceView
              query={currentEvaluation.query}
              generatedAnswer={currentEvaluation.generated_answer}
              groundTruth={currentEvaluation.ground_truth}
              retrievedChunks={currentEvaluation.retrieved_chunks}
              groundTruthChunkIds={currentEvaluation.ground_truth_chunk_ids}
              retrievedChunkIds={currentEvaluation.retrieved_chunk_ids}
              hallucinatedClaims={currentEvaluation.metrics.faithfulness.hallucinated_claims}
              documentName={currentEvaluation.document_name}
            />
          </div>
        )}

        {/* VIEW 2: Batch Test Suite & Failure Breakdown Chart */}
        {activeView === 'batch' && (
          <div className="animate-in fade-in duration-200">
            <BatchSummarySection
              batch={MOCK_BATCH_SUMMARY}
              selectedCaseId={activeCaseId}
              onSelectCase={handleSelectCaseFromBatch}
            />
          </div>
        )}

        {/* VIEW 3: Component Library & Design System Showcase */}
        {activeView === 'components' && (
          <div className="animate-in fade-in duration-200">
            <ComponentLibraryTab />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-[#06080d] py-5 px-4 text-xs font-mono text-neutral-400">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-200">RAGSeal</span>
            <span className="text-neutral-500">•</span>
            <span>Problem Statement AI-04: RAG Evaluation Pipeline</span>
            <span className="text-neutral-500">•</span>
            <span className="text-neutral-400">Branch: vidhaath/ui-frontend</span>
          </div>
          <div className="flex items-center gap-3 text-neutral-400">
            <span>Honesty Rule: All numbers state-grounded</span>
            <span className="text-neutral-500">•</span>
            <span>n = 7 ATS benchmark test cases</span>
          </div>
        </div>
      </footer>

      {/* Modal 1: Document Vault & Chunk Inspector */}
      <DocumentVaultModal
        isOpen={isDocVaultOpen}
        onClose={() => setIsDocVaultOpen(false)}
        documents={MOCK_ATS_DOCUMENTS}
      />

      {/* Modal 2: Synthetic Test-Question Generator */}
      <SyntheticGeneratorModal
        isOpen={isSyntheticOpen}
        onClose={() => setIsSyntheticOpen(false)}
        questions={MOCK_SYNTHETIC_QUESTIONS}
        documents={MOCK_ATS_DOCUMENTS}
        onSelectQuestion={handleSelectSyntheticQuestion}
      />
    </div>
  );
};
