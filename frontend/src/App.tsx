import React, { useState, useEffect } from 'react';
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
import { PackId, AuthUser, SyntheticTestCase, EvaluationResult, BatchSummary } from './types/ragseal';
import { 
  checkBackendHealth, 
  loginUser, 
  evaluateLiveQuery, 
  evaluateBatchByPack,
  fetchRunHistory, 
  fetchRunDetail,
  loadPackBackend, 
  HealthResponse,
  ApiError 
} from './lib/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lab' | 'story' | 'components'>('lab');
  const [activePackId, setActivePackId] = useState<PackId>('recruitment');
  const [activeCaseId, setActiveCaseId] = useState<string>('case_01');
  const [selectedDocId, setSelectedDocId] = useState<string>('doc_ats_03');
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(true);
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [liveEvaluation, setLiveEvaluation] = useState<EvaluationResult | null>(null);
  const [liveBatchSummary, setLiveBatchSummary] = useState<BatchSummary | null>(null);
  const [isBatchEvaluating, setIsBatchEvaluating] = useState<boolean>(false);
  const [batchElapsedSeconds, setBatchElapsedSeconds] = useState<number>(0);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [liveNotification, setLiveNotification] = useState<string | null>(null);
  const [serverRunHistory, setServerRunHistory] = useState<any[]>([]);

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

  // Check health and auto-login on startup
  useEffect(() => {
    let mounted = true;
    const initBackend = async () => {
      const health = await checkBackendHealth();
      if (!mounted) return;
      if (health) {
        setBackendHealth(health);
        setIsLiveBackend(true);
        // Login seeded demo user to obtain real JWT token
        try {
          const auth = await loginUser('demo@ragseal.dev', 'demo1234');
          if (!mounted) return;
          if (auth) {
            setAuthToken(auth.access_token);
            setCurrentUser(auth.user);
            // Fetch real run history from GET /api/runs
            const runs = await fetchRunHistory(auth.access_token);
            if (runs && runs.length > 0) {
              setServerRunHistory(runs);
            }
          }
        } catch (err: any) {
          console.warn('Backend auto-login notice:', err?.detail || err?.message);
        }
      } else {
        setIsLiveBackend(false);
      }
    };
    initBackend();
    return () => {
      mounted = false;
    };
  }, []);

  // Current active industry pack
  const currentPack = INDUSTRY_PACKS[activePackId] || INDUSTRY_PACKS.recruitment;

  // Active evaluation case (prefers live query result, then active pack case)
  const currentEvaluation: EvaluationResult = 
    liveEvaluation || currentPack.cases[activeCaseId] || Object.values(currentPack.cases)[0];

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
    setLiveEvaluation(null);
    setLiveBatchSummary(null);
    setLiveNotification(null);
    setBatchError(null);
    const newPack = INDUSTRY_PACKS[packId] || INDUSTRY_PACKS.recruitment;
    const firstCaseKey = Object.keys(newPack.cases)[0];
    setActiveCaseId(firstCaseKey);
    setSelectedDocId(newPack.documents[0]?.document_id || '');

    // Notify backend pack loader if authenticated
    if (authToken) {
      loadPackBackend(packId, authToken).catch(() => {});
    }
  };

  // Handler for running query from PromptBox
  const handleRunQuery = async (query: string, groundTruth?: string) => {
    setIsEvaluating(true);
    setLiveNotification(null);

    // If live backend is enabled and token is active, try calling real POST /api/evaluate/query
    if (isLiveBackend && authToken) {
      try {
        const liveRes = await evaluateLiveQuery(query, selectedDocId, groundTruth, authToken);
        if (liveRes) {
          setLiveEvaluation(liveRes);
          setLiveNotification('Evaluated live via FastAPI (POST /api/evaluate/query)');
          setIsEvaluating(false);
          return;
        }
      } catch (err: any) {
        const msg = err instanceof ApiError ? `Backend (${err.status}): ${err.detail}` : (err.message || 'Evaluation error');
        setLiveNotification(`${msg} — displayed state-grounded pack evaluation.`);
      }
    }

    // Graceful fallback to calibrated benchmark case
    setTimeout(() => {
      setIsEvaluating(false);
      setLiveEvaluation(null);
      const matchedCaseKey = Object.keys(currentPack.cases).find(
        (key) => currentPack.cases[key].query.toLowerCase() === query.toLowerCase()
      );
      if (matchedCaseKey) {
        setActiveCaseId(matchedCaseKey);
      }
      if (isLiveBackend && !backendHealth?.engine_ready) {
        setLiveNotification('Backend connected at localhost:8000. Engine running local mode — displayed state-grounded pack evaluation.');
      }
    }, 400);
  };

  /**
   * Note #1: Critical: Run packs by sending ONLY { "pack_id": activePackId }.
   * Note #5: Slow batch progress state with timer and 180s timeout.
   */
  const handleRunBatch = async () => {
    if (!authToken) {
      setBatchError('Please sign in (Demo account available) to run a batch evaluation.');
      return;
    }
    setIsBatchEvaluating(true);
    setBatchElapsedSeconds(0);
    setBatchError(null);

    const startTime = Date.now();
    const intervalId = setInterval(() => {
      setBatchElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const summary = await evaluateBatchByPack(activePackId, authToken);
      clearInterval(intervalId);
      setIsBatchEvaluating(false);
      setLiveBatchSummary(summary);
      setLiveNotification(`Batch complete: ${summary.total_evaluated} cases evaluated (Pass Rate: ${(summary.aggregates.pass_rate * 100).toFixed(0)}%).`);
      // Refresh run history
      const runs = await fetchRunHistory(authToken);
      if (runs && runs.length > 0) setServerRunHistory(runs);
    } catch (err: any) {
      clearInterval(intervalId);
      setIsBatchEvaluating(false);
      if (err instanceof ApiError) {
        setBatchError(`Backend (${err.status}): ${err.detail}`);
      } else {
        setBatchError(err.message || 'Batch evaluation failed.');
      }
    }
  };

  // Handler for clicking starter questions inside PromptBox
  const handleSelectStarter = (_question: string, caseId?: string, docId?: string) => {
    setLiveEvaluation(null);
    setLiveNotification(null);
    if (caseId) setActiveCaseId(caseId);
    if (docId) setSelectedDocId(docId);
  };

  // Handler for selecting synthetic test question
  const handleSelectSyntheticQuestion = (_q: SyntheticTestCase) => {
    setLiveEvaluation(null);
    setActiveCaseId('case_01');
    setActiveTab('lab');
  };

  // Handler for clicking a row in batch table -> opens in Trace Inspector
  const handleSelectCaseFromBatch = (caseId: string) => {
    setLiveEvaluation(null);
    setActiveCaseId(caseId);
    setActiveTab('lab');
  };

  // Handler for loading previous run from history
  const handleLoadRun = async (batchId: string) => {
    if (authToken) {
      try {
        const fullBatch = await fetchRunDetail(batchId, authToken);
        if (fullBatch) {
          setLiveBatchSummary(fullBatch);
          if (fullBatch.pack_id) {
            setActivePackId(fullBatch.pack_id as PackId);
          }
          return;
        }
      } catch {
        // Fallback to local history
      }
    }
    const runItem = [...serverRunHistory, ...MOCK_RUN_HISTORY].find(r => r.batch_id === batchId);
    if (runItem && runItem.pack_id) {
      handleSelectPack(runItem.pack_id);
    }
  };

  const handleRefreshHealth = async () => {
    const h = await checkBackendHealth();
    setBackendHealth(h);
    if (h) setIsLiveBackend(true);
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
        backendHealth={backendHealth}
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

            {/* Live Notification Banner */}
            {liveNotification && (
              <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-800/80 text-xs font-mono text-teal-300 flex items-center justify-between gap-2 animate-in fade-in">
                <span>{liveNotification}</span>
                <button
                  onClick={() => setLiveNotification(null)}
                  className="text-neutral-400 hover:text-white text-xs px-1.5"
                >
                  &times;
                </button>
              </div>
            )}

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
                batch={liveBatchSummary || currentPack.batchSummary}
                selectedCaseId={activeCaseId}
                onSelectCase={handleSelectCaseFromBatch}
                runHistory={serverRunHistory.length > 0 ? serverRunHistory : MOCK_RUN_HISTORY}
                onLoadRun={handleLoadRun}
                onRunBatch={handleRunBatch}
                isBatchEvaluating={isBatchEvaluating}
                batchElapsedSeconds={batchElapsedSeconds}
                batchError={batchError}
                packName={currentPack.name}
              />
            </div>
          </div>
        )}

        {/* TAB 2: "How It Works" (Scroll storytelling pipeline walkthrough & diagram) */}
        {activeTab === 'story' && (
          <div className="animate-in fade-in duration-200">
            <HowItWorksStory
              backendHealth={backendHealth}
              onRefreshHealth={handleRefreshHealth}
            />
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
            <span className="text-neutral-400">Backend: http://localhost:8000</span>
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
        token={authToken}
      />

      {/* Modal 2: Synthetic Test-Question Generator */}
      <SyntheticGeneratorModal
        isOpen={isSyntheticOpen}
        onClose={() => setIsSyntheticOpen(false)}
        questions={MOCK_SYNTHETIC_QUESTIONS}
        documents={currentPack.documents}
        onSelectQuestion={handleSelectSyntheticQuestion}
        token={authToken}
      />

      {/* Modal 3: User Auth / Session Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        onLogin={(user, token) => {
          setCurrentUser(user);
          if (token) {
            setAuthToken(token);
            fetchRunHistory(token).then((runs) => {
              if (runs && runs.length > 0) setServerRunHistory(runs);
            }).catch(() => {});
          }
        }}
        onLogout={() => {
          setCurrentUser(null);
          setAuthToken(null);
        }}
      />
    </div>
  );
};
