import React, { useState, useEffect } from 'react';
import { DocumentVaultModal } from './components/ragseal/DocumentVaultModal';
import { SyntheticGeneratorModal } from './components/ragseal/SyntheticGeneratorModal';
import { AuthModal } from './components/ragseal/AuthModal';
import { SignInScreen } from './components/ragseal/shell/SignInScreen';
import { HowItWorksStory } from './components/ragseal/HowItWorksStory';
import { LabScreen } from './components/ragseal/lab/LabScreen';
import { AppShell, TopBarControls, useHashRoute } from './components/ragseal/shell/AppShell';
import { Tour } from './components/ragseal/tour/Tour';
import { ALL_PACKS, PACKS, PackSwitcher } from './components/ragseal/shared/ui';
import { ImpactPage } from './components/ragseal/pages/ImpactPage';
import { OverviewPage } from './components/ragseal/pages/OverviewPage';
import { RunsPage } from './components/ragseal/pages/RunsPage';
import { LabelStudioPage } from './components/ragseal/pages/LabelStudioPage';
import { TrustPage } from './components/ragseal/pages/TrustPage';
import { ComparePage } from './components/ragseal/pages/ComparePage';
import { BotsPage } from './components/ragseal/pages/BotsPage';
import { ConnectBotPage } from './components/ragseal/pages/ConnectBotPage';
import { ChunkingLabPage } from './components/ragseal/pages/ChunkingLabPage';
import { TestSetsPage } from './components/ragseal/pages/TestSetsPage';
import { SealPage } from './components/ragseal/pages/SealPage';

import { INDUSTRY_PACKS } from './data/mockPacksDataset';
import { MOCK_SYNTHETIC_QUESTIONS } from './data/mockAtsDataset';
import { PackId, AuthUser, SyntheticTestCase } from './types/ragseal';
import { 
  checkBackendHealth, 
  loginUser, 
  fetchCurrentUser,
  fetchRunHistory, 
  HealthResponse
} from './lib/api';

const DEMO_EMAIL = 'demo@ragseal.dev';
const SESSION_KEY = 'ragseal.session';

// A real account (email or Google) stays signed in across refreshes; the demo account is
// signed in fresh on every load, so its token is never stored.
function rememberSession(user: AuthUser, token: string) {
  try {
    if (user.email === DEMO_EMAIL) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify({ token }));
  } catch {
    // storage unavailable: the user signs in again after a refresh
  }
}

function forgetSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable: nothing was stored
  }
}

// Every new browser session starts on the sign-in screen. Once someone is in, this tab remembers
// how (demo or a real account), so reloads go straight back to the app.
const ENTERED_KEY = 'ragseal.entered';
type Entered = 'demo' | 'account';

function enteredAs(): Entered | null {
  try {
    const v = sessionStorage.getItem(ENTERED_KEY);
    return v === 'demo' || v === 'account' ? v : null;
  } catch {
    return null;
  }
}

function markEntered(user: AuthUser) {
  try {
    sessionStorage.setItem(ENTERED_KEY, user.email === DEMO_EMAIL ? 'demo' : 'account');
  } catch {
    // storage unavailable: the next reload shows sign-in again
  }
}

function clearEntered() {
  try {
    sessionStorage.removeItem(ENTERED_KEY);
  } catch {
    // storage unavailable: nothing was stored
  }
}

function storedToken(): string | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')?.token ?? null;
  } catch {
    return null;
  }
}

export const App: React.FC = () => {
  const { route, params, go } = useHashRoute();
  // Remembered across refreshes so a labeller stays on the pack they were working through.
  const [activePackId, setActivePackId] = useState<PackId>(() => {
    try {
      return (localStorage.getItem('ragseal.pack') as PackId | null) ?? 'recruitment';
    } catch {
      return 'recruitment';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ragseal.pack', activePackId);
    } catch {
      // storage unavailable: the pack just resets on refresh
    }
  }, [activePackId]);
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(true);
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  // True once the startup check has finished, so the sign-in screen never flashes during it.
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  // How this tab got in earlier (null = a new session, which starts on the sign-in screen).
  const [entered] = useState<Entered | null>(enteredAs);
  // A real account remembered on this device, offered on the sign-in screen as "Continue as".
  const [remembered, setRemembered] = useState<{ user: AuthUser; token: string } | null>(null);
  const [, setServerRunHistory] = useState<any[]>([]);

  const [isDocVaultOpen, setIsDocVaultOpen] = useState<boolean>(false);
  const [isSyntheticOpen, setIsSyntheticOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  // Default logged in user per contract: demo@ragseal.dev
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() =>
    entered === 'demo' ? { id: 'usr_seeded_demo', email: DEMO_EMAIL, name: 'Lead Evaluator' } : null
  );

  // Check health and auto-login on startup
  useEffect(() => {
    let mounted = true;
    const initBackend = async () => {
      const health = await checkBackendHealth();
      if (!mounted) return;
      if (health) {
        setBackendHealth(health);
        setIsLiveBackend(true);
        // A remembered real account is checked first; an expired or revoked token is dropped.
        const saved = storedToken();
        let savedUser: AuthUser | null = null;
        if (saved) {
          try {
            savedUser = await fetchCurrentUser(saved);
          } catch {
            forgetSession();
          }
        }
        if (!mounted) return;
        // A new session (or an account whose token lapsed) starts on the sign-in screen.
        if (!entered || (entered === 'account' && !savedUser)) {
          if (saved && savedUser) setRemembered({ user: savedUser, token: saved });
          clearEntered();
          setAuthChecked(true);
          return;
        }
        if (saved && savedUser) {
          setAuthToken(saved);
          setCurrentUser(savedUser);
          setAuthChecked(true);
          return;
        }
        // This tab entered as the demo earlier: sign it in again for a fresh token.
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
      if (mounted) setAuthChecked(true);
    };
    initBackend();
    return () => {
      mounted = false;
    };
  }, [entered]);

  // Current active industry pack
  const currentPack = INDUSTRY_PACKS[activePackId] || INDUSTRY_PACKS.recruitment;

  // Handle switching pack
  // The Lab (LabScreen) loads the pack and its latest run itself.
  const handleSelectPack = (packId: PackId) => {
    setActivePackId(packId);
  };

  // Handler for selecting synthetic test question
  const handleSelectSyntheticQuestion = (_q: SyntheticTestCase) => {
    go('diagnose');
  };

  // Diagnose can open a specific run (from Runs) instead of the pack's latest one.
  const openBatch = params.get('batch');
  const openRun = (batchId: string, packId?: string) => {
    if (packId) setActivePackId(packId as PackId);
    go('diagnose', { batch: batchId });
  };

  const handleRefreshHealth = async () => {
    const h = await checkBackendHealth();
    setBackendHealth(h);
    if (h) setIsLiveBackend(true);
  };

  // A new session waits on a blank page for the startup check, so the app never flashes first.
  if (!authChecked && !entered) {
    return <div className="min-h-screen bg-[var(--paper)]" />;
  }

  // #/signin also opens it on purpose (e.g. to demo the screen without signing out).
  // Any other deep link (#/diagnose…) stays in the address bar and opens once signed in.
  if ((authChecked && !authToken) || window.location.hash.startsWith('#/signin')) {
    return (
      <SignInScreen
        backendDown={!isLiveBackend}
        remembered={remembered}
        onForget={() => {
          forgetSession();
          setRemembered(null);
        }}
        onSignedIn={(user, token) => {
          rememberSession(user, token);
          markEntered(user);
          setRemembered(null);
          setCurrentUser(user);
          setAuthToken(token);
          setIsAuthOpen(false);
          if (window.location.hash.startsWith('#/signin')) window.location.hash = '';
        }}
      />
    );
  }

  return (
    <>
      <AppShell
        route={route}
        onNavigate={(r) => go(r)}
        health={backendHealth}
        live={isLiveBackend}
        user={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignIn={
          currentUser?.email === DEMO_EMAIL
            ? () => {
                // Leave the demo for the sign-in screen, which offers email and Google.
                forgetSession();
                clearEntered();
                setAuthToken(null);
                setCurrentUser(null);
              }
            : undefined
        }
        fitScreen={route === 'diagnose' || route === 'label' || route === 'bots' || route === 'testsets'}
      >
        {/* Keyed by route so each page eases in instead of cutting. h-full, not flex-1: <main> is not a
            flex container, so fit-to-screen pages need an explicit height or <main> clips them. */}
        <div key={route} className="page-enter flex h-full min-h-0 flex-col">
        {route === 'bots' && <BotsPage token={authToken} initialPack={activePackId} />}

        {route === 'connect' && <ConnectBotPage token={authToken} initialPack={activePackId} onOpenRun={openRun} />}

        {route === 'testsets' && <TestSetsPage token={authToken} />}

        {route === 'overview' && (
          <OverviewPage
            token={authToken}
            health={backendHealth}
            onOpenPack={(p) => {
              setActivePackId(p);
              go('diagnose');
            }}
            onNavigate={(r) => go(r)}
            onOpenDocuments={() => setIsDocVaultOpen(true)}
            onOpenGenerator={() => setIsSyntheticOpen(true)}
          />
        )}

        {route === 'diagnose' && (
          <div className="h-full px-3 sm:px-6 py-3 sm:py-5">
            <TopBarControls>
              {openBatch && (
                <button onClick={() => go('diagnose')} className="text-xs text-[var(--ink-2)] hover:text-[var(--ink)]">
                  Viewing run <span className="font-mono text-[var(--ink-1)]">{openBatch}</span> · show latest
                </button>
              )}
              <PackSwitcher
                value={activePackId}
                packs={ALL_PACKS}
                onChange={(p) => {
                  handleSelectPack(p);
                  if (openBatch) go('diagnose');
                }}
              />
            </TopBarControls>
            <LabScreen packId={activePackId} token={authToken} batchId={openBatch} />
          </div>
        )}

        {route === 'runs' && (
          <RunsPage token={authToken} packId={activePackId} onPackChange={handleSelectPack} onOpenRun={openRun} />
        )}

        {route === 'label' && (
          // Only the three 71-question packs are labelled; other packs fall back to the first.
          <LabelStudioPage
            token={authToken}
            packId={PACKS.some((p) => p.id === activePackId) ? activePackId : PACKS[0].id}
            onPackChange={handleSelectPack}
          />
        )}

        {route === 'trust' && <TrustPage token={authToken} health={backendHealth} />}

        {route === 'compare' && <ComparePage token={authToken} />}

        {route === 'chunking' && <ChunkingLabPage token={authToken} />}

        {route === 'seal' && <SealPage token={authToken} />}

        {route === 'impact' && <ImpactPage token={authToken} />}

        {route === 'learn' && (
          <div className="mx-auto max-w-7xl p-4 md:p-8">
            <HowItWorksStory backendHealth={backendHealth} onRefreshHealth={handleRefreshHealth} />
          </div>
        )}
        </div>
      </AppShell>
      <Tour enabled={!!authToken} />

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
            rememberSession(user, token);
            markEntered(user);
            setAuthToken(token);
            fetchRunHistory(token).then((runs) => {
              if (runs && runs.length > 0) setServerRunHistory(runs);
            }).catch(() => {});
          }
        }}
        onLogout={() => {
          forgetSession();
          clearEntered();
          setCurrentUser(null);
          setAuthToken(null);
        }}
      />
    </>
  );
};
