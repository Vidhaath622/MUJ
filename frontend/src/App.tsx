import React, { useState } from 'react';
import { RAGSealNavbar } from './components/ragseal/RAGSealNavbar';
import { RootCausePanel } from './components/ragseal/RootCausePanel';
import { BatchSummarySection } from './components/ragseal/BatchSummarySection';
import { DocumentVaultModal } from './components/ragseal/DocumentVaultModal';
import { SyntheticGeneratorModal } from './components/ragseal/SyntheticGeneratorModal';
import { ComponentLibraryTab } from './components/showcase/ComponentLibraryTab';

// Components directly from the Component Library:
import { PromptBox, StarterQuestionItem } from './components/domain/prompt-box';
import { MetricCard } from './components/domain/metric-card';
import { DiffViewer } from './components/domain/diff-viewer';

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

  // Starter benchmark questions
  const starterQuestions: StarterQuestionItem[] = [
    {
      label: 'Experience Threshold',
      caseId: 'case_01',
      question: 'What is the required experience threshold in the currently approved job description?',
      docId: 'doc_ats_03',
      type: 'CLEAN_PASS',
    },
    {
      label: 'Notice Period & Buyout',
      caseId: 'case_02',
      question: 'Does the candidate resume document notice period and buyout eligibility?',
      docId: 'doc_ats_02',
      type: 'RETRIEVAL_FAILURE',
    },
    {
      label: 'Certifications Check',
      caseId: 'case_03',
      question: "Which cloud and orchestration certifications are documented in candidate C-002's resume?",
      docId: 'doc_ats_02',
      type: 'GENERATION_HALLUCINATION',
    },
    {
      label: 'Compensation & Band',
      caseId: 'case_04',
      question: "What is Priya Sharma's compensation expectation and does it fit the L4 salary band?",
      docId: 'doc_ats_02',
      type: 'COMPOUND_FAILURE',
    },
    {
      label: 'Managerial Experience',
      caseId: 'case_05',
      question: 'Does candidate C-002 have prior managerial experience leading teams of 10 or more engineers?',
      docId: 'doc_ats_02',
      type: 'CLEAN_PASS',
    },
    {
      label: 'Policy Version Conflict',
      caseId: 'case_06',
      question: 'What is the minimum years of experience required for the L4 role according to current policy?',
      docId: 'doc_ats_01',
      type: 'GENERATION_HALLUCINATION',
    },
    {
      label: 'Citation Mismatch',
      caseId: 'case_07',
      question: 'Which distributed caching and messaging technologies has candidate Priya Sharma worked with?',
      docId: 'doc_ats_02',
      type: 'GENERATION_HALLUCINATION',
    },
  ];

  // Handler for running query from PromptBox
  const handleRunQuery = (query: string, groundTruth?: string) => {
    setIsEvaluating(true);
    setTimeout(() => {
      setIsEvaluating(false);
      // If matches one of our known benchmark cases, activate that case
      const matchedCaseKey = Object.keys(MOCK_EVALUATION_CASES).find(
        (key) => MOCK_EVALUATION_CASES[key].query.toLowerCase() === query.toLowerCase()
      );
      if (matchedCaseKey) {
        setActiveCaseId(matchedCaseKey);
      }
      if (groundTruth) {
        // Ground truth comparison
      }
    }, 700);
  };

  // Handler for clicking starter questions inside PromptBox
  const handleSelectStarter = (_question: string, caseId?: string, docId?: string) => {
    if (caseId) setActiveCaseId(caseId);
    if (docId) setSelectedDocId(docId);
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
            {/* 1. Component Library: PromptBox */}
            <PromptBox
              documents={MOCK_ATS_DOCUMENTS.map(d => ({
                document_id: d.document_id,
                filename: d.filename,
                chunk_count: d.chunk_count,
              }))}
              selectedDocId={selectedDocId}
              onSelectDoc={setSelectedDocId}
              starterQuestions={starterQuestions}
              onSelectStarter={handleSelectStarter}
              activeCaseId={activeCaseId}
              onSubmit={handleRunQuery}
              isLoading={isEvaluating}
            />

            {/* 2. Component Library: MetricCard Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="Context Relevance"
                metricKey="context_relevance"
                score={currentEvaluation.metrics.context_relevance.score}
                threshold={currentEvaluation.metrics.context_relevance.threshold ?? 0.70}
                details={currentEvaluation.metrics.context_relevance.details}
                componentType="Retriever"
                judgedBy={currentEvaluation.metrics.context_relevance.judged_by ?? 'model'}
                status={currentEvaluation.metrics.context_relevance.status}
                sampleCount={1}
              />

              <MetricCard
                title="Faithfulness / Grounding"
                metricKey="faithfulness"
                score={currentEvaluation.metrics.faithfulness.score}
                threshold={currentEvaluation.metrics.faithfulness.threshold ?? 0.75}
                details={currentEvaluation.metrics.faithfulness.details}
                componentType="Generator"
                judgedBy={currentEvaluation.metrics.faithfulness.judged_by ?? 'model'}
                status={currentEvaluation.metrics.faithfulness.status}
                hallucinatedClaims={currentEvaluation.metrics.faithfulness.hallucinated_claims}
                sampleCount={1}
              />

              <MetricCard
                title="Answer Accuracy"
                metricKey="answer_accuracy"
                score={currentEvaluation.metrics.answer_accuracy.score}
                threshold={currentEvaluation.metrics.answer_accuracy.threshold ?? 0.70}
                details={currentEvaluation.metrics.answer_accuracy.details}
                componentType="End-to-End"
                judgedBy={currentEvaluation.metrics.answer_accuracy.judged_by ?? 'model'}
                status={currentEvaluation.metrics.answer_accuracy.status}
                sampleCount={1}
              />
            </div>

            {/* 3. Decoupled Root-Cause Panel (internally using DiagnosticBadge from Component Library) */}
            <RootCausePanel
              diagnosis={currentEvaluation.root_cause}
              release={currentEvaluation.release}
              evaluationMode={currentEvaluation.evaluation_mode}
              evaluationId={currentEvaluation.evaluation_id}
              latencyMs={currentEvaluation.latency_ms}
            />

            {/* 4. Component Library: DiffViewer (Side-by-Side Trace View) */}
            <DiffViewer
              query={currentEvaluation.query}
              retrievedChunks={currentEvaluation.retrieved_chunks}
              generatedAnswer={currentEvaluation.generated_answer}
              groundTruth={currentEvaluation.ground_truth}
              hallucinatedClaims={currentEvaluation.metrics.faithfulness.hallucinated_claims}
              groundTruthChunkIds={currentEvaluation.ground_truth_chunk_ids}
              documentName={currentEvaluation.document_name}
            />
          </div>
        )}

        {/* VIEW 2: Batch Test Suite & Failure Breakdown Chart (using EvaluationTable from Component Library) */}
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
            <span>Built 100% with Component Library Primitives</span>
          </div>
        </div>
      </footer>

      {/* Modal 1: Document Vault & Chunk Inspector (using FileDropzone from Component Library) */}
      <DocumentVaultModal
        isOpen={isDocVaultOpen}
        onClose={() => setIsDocVaultOpen(false)}
        documents={MOCK_ATS_DOCUMENTS}
      />

      {/* Modal 2: Synthetic Test-Question Generator (Deliverable 2) */}
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
