import React, { useState, useEffect } from 'react';
import { RAGSealNavbar } from './components/ragseal/RAGSealNavbar';
import { DocumentVaultModal } from './components/ragseal/DocumentVaultModal';
import { SyntheticGeneratorModal } from './components/ragseal/SyntheticGeneratorModal';
import { AuthModal } from './components/ragseal/AuthModal';
import { HowItWorksStory } from './components/ragseal/HowItWorksStory';
import { ComponentLibraryTab } from './components/showcase/ComponentLibraryTab';
import { LabScreen } from './components/ragseal/lab/LabScreen';

import { INDUSTRY_PACKS } from './data/mockPacksDataset';
import { MOCK_SYNTHETIC_QUESTIONS } from './data/mockAtsDataset';
import { PackId, AuthUser, SyntheticTestCase } from './types/ragseal';
import { 
  checkBackendHealth, 
  loginUser, 
  fetchRunHistory, 
  HealthResponse
} from './lib/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lab' | 'story' | 'components'>('lab');
  const [activePackId, setActivePackId] = useState<PackId>('recruitment');
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(true);
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [, setServerRunHistory] = useState<any[]>([]);

  const [isDocVaultOpen, setIsDocVaultOpen] = useState<boolean>(false);
  const [isSyntheticOpen, setIsSyntheticOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

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

  // Handle switching pack
  // The Lab (LabScreen) loads the pack and its latest run itself.
  const handleSelectPack = (packId: PackId) => {
    setActivePackId(packId);
  };

  // Handler for selecting synthetic test question
  const handleSelectSyntheticQuestion = (_q: SyntheticTestCase) => {
    setActiveTab('lab');
  };

  const handleRefreshHealth = async () => {
    const h = await checkBackendHealth();
    setBackendHealth(h);
    if (h) setIsLiveBackend(true);
  };

  return (
    <div className={`${activeTab === 'lab' ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white`}>
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
      <main className={activeTab === 'lab' ? 'flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-6 py-4' : 'flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6'}>
        {/* TAB 1: "Lab" (The working RAG app + Automated QA layer) */}
        {activeTab === 'lab' && <LabScreen packId={activePackId} token={authToken} />}

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
      {activeTab !== 'lab' && <footer className="border-t border-neutral-900 bg-[#06080d] py-5 px-4 text-xs font-mono text-neutral-400">
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
      </footer>}

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
