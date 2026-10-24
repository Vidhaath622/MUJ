import React, { useState } from 'react';
import { RAGSealNavbar } from './components/ragseal/RAGSealNavbar';
import { RootCausePanel } from './components/ragseal/RootCausePanel';
import { BatchSummarySection } from './components/ragseal/BatchSummarySection';
import { DocumentVaultModal } from './components/ragseal/DocumentVaultModal';
import { SyntheticGeneratorModal } from './components/ragseal/SyntheticGeneratorModal';
import { AuthModal } from './components/ragseal/AuthModal';
import { HowItWorksStory } from './components/ragseal/HowItWorksStory';
import { ComponentLibraryTab } from './components/showcase/ComponentLibraryTab';

// Components directly from the Component Library:
import { PromptBox, StarterQuestionItem } from './components/domain/prompt-box';
import { MetricCard } from './components/domain/metric-card';
import { DiffViewer } from './components/domain/diff-viewer';

import { 
  INDUSTRY_PACKS, 
  MOCK_RUN_HISTORY 
} from './data/mockPacksDataset';
import { MOCK_SYNTHETIC_QUESTIONS } from './data/mockAtsDataset';
import { PackId, AuthUser, SyntheticTestCase, EvaluationResult } from './types/ragseal';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lab' | 'story' | 'components'>('lab');
  const [activePackId, setActivePackId] = useState<PackId>('recruitment');
  const [activeCaseId, setActiveCaseId] = useState<string>('case_01');
  const [selectedDocId, setSelectedDocId] = useState<string>('doc_ats_03');
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(false);
  const [isDocVaultOpen, setIsDocVaultOpen] = useState<boolean>(false);
  const [isSyntheticOpen, setIsSyntheticOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Default logged in user per contract: demo@ragseal.dev
  const [currentUser, setCurrentUser] = useState<AuthUser | null>({
    id: 'usr_seeded_demo',
    email: 'demo@ragseal.dev',
    name: 'Lead Evaluator',
  });

  // Current active industry pack
  const currentPack = INDUSTRY_PACKS[activePackId] || INDUSTRY_PACKS.recruitment;

  // Active evaluation case
  const currentEvaluation: EvaluationResult = 
    currentPack.cases[activeCaseId] || Object.values(currentPack.cases)[0];

  // Derive starter questions from current pack cases
  const starterQuestions: StarterQuestionItem[] = Object.entries(currentPack.cases).map(([key, c]) => ({
    label: c.query.slice(0, 24) + '...',
    caseId: key,
    question: c.query,
    docId: c.document_id,
    type: c.root_cause.category,
  }));

  // Handle switching pack
  const handleSelectPack = (packId: PackId) => {
    setActivePackId(packId);
    const newPack = INDUSTRY_PACKS[packId] || INDUSTRY_PACKS.recruitment;
    const firstCaseKey = Object.keys(newPack.cases)[0];
    setActiveCaseId(firstCaseKey);
    setSelectedDocId(newPack.documents[0]?.document_id || '');
  };

  // Handler for running query from PromptBox
  const handleRunQuery = (query: string, groundTruth?: string) => {
    setIsEvaluating(true);
    setTimeout(() => {
      setIsEvaluating(false);
      // If matches one of our known benchmark cases in current pack, activate that case
      const matchedCaseKey = Object.keys(currentPack.cases).find(
        (key) => currentPack.cases[key].query.toLowerCase() === query.toLowerCase()
      );
      if (matchedCaseKey) {
        setActiveCaseId(matchedCaseKey);
      }
      if (groundTruth) {
        // User provided manual ground truth
      }
    }, 700);
  };

  // Handler for clicking starter questions inside PromptBox
  const handleSelectStarter = (_question: string, caseId?: string, docId?: string) => {
    if (caseId) setActiveCaseId(caseId);
    if (docId) setSelectedDocId(docId);
  };

  // Handler for selecting synthetic test question
  const handleSelectSyntheticQuestion = (_q: SyntheticTestCase) => {
    setActiveCaseId('case_01');
    setActiveTab('lab');
  };

  // Handler for clicking a row in batch table -> opens in Trace Inspector
  const handleSelectCaseFromBatch = (caseId: string) => {
    setActiveCaseId(caseId);
    setActiveTab('lab');
  };

  // Handler for loading previous run from history
  const handleLoadRun = (batchId: string) => {
    const runItem = MOCK_RUN_HISTORY.find(r => r.batch_id === batchId);
    if (runItem) {
      handleSelectPack(runItem.pack_id);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* RAGSeal Brand Navigation Header */}
      <RAGSealNavbar
        isLiveBackend={isLiveBackend}
        onToggleLiveBackend={() => setIsLiveBackend(!isLiveBackend)}
        onOpenDocVault={() => setIsDocVaultOpen(true)}
        onOpenSyntheticGenerator={() => setIsSyntheticOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        currentUser={currentUser}
        activePack={activePackId}
        onSelectPack={handleSelectPack}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* TAB 1: "Lab" (The working RAG app + Automated QA layer) */}
        {activeTab === 'lab' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Pack Description Strip */}
            <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white uppercase">{currentPack.name}</span>
                <span className="text-neutral-500">•</span>
                <span className="text-neutral-400">{currentPack.description}</span>
              </div>
              <div className="text-neutral-500 text-[11px]">
                {currentPack.trap_description}
              </div>
            </div>

            {/* 1. Component Library: PromptBox */}
            <PromptBox
              documents={currentPack.documents.map(d => ({
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

            {/* 3. Decoupled Root-Cause Panel with Replay Experiment */}
            <RootCausePanel
              diagnosis={currentEvaluation.root_cause}
              release={currentEvaluation.release}
              evaluationMode={currentEvaluation.evaluation_mode}
              evaluationId={currentEvaluation.evaluation_id}
              latencyMs={currentEvaluation.latency_ms}
              replay={currentEvaluation.replay}
              originalAnswer={currentEvaluation.generated_answer}
            />

            {/* 4. Component Library: DiffViewer (Trace View & Gold Replay Hero) */}
            <DiffViewer
              query={currentEvaluation.query}
              retrievedChunks={currentEvaluation.retrieved_chunks}
              generatedAnswer={currentEvaluation.generated_answer}
              groundTruth={currentEvaluation.ground_truth}
              hallucinatedClaims={currentEvaluation.metrics.faithfulness.hallucinated_claims}
              groundTruthChunkIds={currentEvaluation.gold_chunk_ids || currentEvaluation.ground_truth_chunk_ids}
              documentName={currentEvaluation.document_name}
              replay={currentEvaluation.replay}
            />

            {/* 5. Batch Dashboard (Recharts failure distribution & Judge Agreement) */}
            <div className="pt-4 border-t border-neutral-800/80">
              <BatchSummarySection
                batch={currentPack.batchSummary}
                selectedCaseId={activeCaseId}
                onSelectCase={handleSelectCaseFromBatch}
                runHistory={MOCK_RUN_HISTORY}
                onLoadRun={handleLoadRun}
              />
            </div>
          </div>
        )}

        {/* TAB 2: "How It Works" (Scroll storytelling pipeline walkthrough & diagram) */}
        {activeTab === 'story' && (
          <div className="animate-in fade-in duration-200">
            <HowItWorksStory />
          </div>
        )}

        {/* TAB 3: Component Library & Design System Showcase */}
        {activeTab === 'components' && (
          <div className="animate-in fade-in duration-200">
            <ComponentLibraryTab />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-[#06080d] py-5 px-4 text-xs font-mono text-neutral-400">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-200">RAGSeal v2.0</span>
            <span className="text-neutral-500">•</span>
            <span>Problem Statement AI-04: RAG Evaluation Pipeline</span>
            <span className="text-neutral-500">•</span>
            <span className="text-neutral-400">Branch: vidhaath/ui-frontend</span>
          </div>
          <div className="flex items-center gap-3 text-neutral-400">
            <span>Honesty Rule: All numbers state-grounded</span>
            <span className="text-neutral-500">•</span>
            <span>Causal Replay Isolation Active</span>
          </div>
        </div>
      </footer>

      {/* Modal 1: Document Vault & Chunk Inspector */}
      <DocumentVaultModal
        isOpen={isDocVaultOpen}
        onClose={() => setIsDocVaultOpen(false)}
        documents={currentPack.documents}
      />

      {/* Modal 2: Synthetic Test-Question Generator */}
      <SyntheticGeneratorModal
        isOpen={isSyntheticOpen}
        onClose={() => setIsSyntheticOpen(false)}
        questions={MOCK_SYNTHETIC_QUESTIONS}
        documents={currentPack.documents}
        onSelectQuestion={handleSelectSyntheticQuestion}
      />

      {/* Modal 3: User Auth / Session Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onLogin={setCurrentUser}
        onLogout={() => setCurrentUser(null)}
      />
    </div>
  );
};
