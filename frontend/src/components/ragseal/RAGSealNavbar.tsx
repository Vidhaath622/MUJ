import React from 'react';
import { Database, ShieldCheck, Sparkles, User } from 'lucide-react';
import { PackId, AuthUser } from '../../types/ragseal';
import { HealthResponse } from '../../lib/api';
import { cn } from '../../lib/utils';

interface RAGSealNavbarProps {
  isLiveBackend: boolean;
  onToggleLiveBackend: () => void;
  onOpenDocVault: () => void;
  onOpenSyntheticGenerator: () => void;
  onOpenAuth: () => void;
  currentUser: AuthUser | null;
  activePack: PackId;
  onSelectPack: (packId: PackId) => void;
  activeTab: 'lab' | 'story' | 'components';
  onSelectTab: (tab: 'lab' | 'story' | 'components') => void;
  backendHealth?: HealthResponse | null;
}

const PACKS: { id: PackId; label: string }[] = [
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'banking', label: 'Banking' },
  { id: 'healthcare', label: 'Healthcare' },
];

const TABS: { id: 'lab' | 'story'; label: string }[] = [
  { id: 'lab', label: 'Lab' },
  { id: 'story', label: 'How it works' },
];

/** One-row header: brand, tabs, pack switcher, tools and live model status. */
export const RAGSealNavbar: React.FC<RAGSealNavbarProps> = ({
  isLiveBackend,
  onOpenDocVault,
  onOpenSyntheticGenerator,
  onOpenAuth,
  currentUser,
  activePack,
  onSelectPack,
  activeTab,
  onSelectTab,
  backendHealth,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#07090e]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-teal-400" />
          <span className="text-[15px] font-semibold tracking-tight text-white">
            RAG<span className="text-teal-400">Seal</span>
          </span>
          <span className="hidden text-xs text-slate-500 2xl:inline">Retriever and generator, tested apart</span>
        </div>

        <nav className="flex items-center gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTab(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors',
                activeTab === t.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {activeTab === 'lab' && (
          <div className="flex items-center rounded-lg border border-slate-800 p-0.5 text-sm">
            {PACKS.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectPack(p.id)}
                className={cn(
                  'rounded-md px-3 py-1 transition-colors',
                  activePack === p.id ? 'bg-teal-500/15 text-teal-200' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm">
          <ModelStatus live={isLiveBackend} health={backendHealth} />
          <ToolButton onClick={onOpenDocVault} icon={<Database className="h-3.5 w-3.5" />}>
            Documents
          </ToolButton>
          <ToolButton onClick={onOpenSyntheticGenerator} icon={<Sparkles className="h-3.5 w-3.5" />}>
            Generate questions
          </ToolButton>
          <ToolButton onClick={onOpenAuth} icon={<User className="h-3.5 w-3.5" />}>
            {currentUser ? currentUser.email.split('@')[0] : 'Sign in'}
          </ToolButton>
        </div>
      </div>
    </header>
  );
};

const ToolButton: React.FC<{ onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({
  onClick,
  icon,
  children,
}) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
  >
    <span className="text-slate-500">{icon}</span>
    <span className="hidden lg:inline">{children}</span>
  </button>
);

/** Honest backend status: which generator and judge are actually loaded, straight from /api/health. */
const ModelStatus: React.FC<{ live: boolean; health?: HealthResponse | null }> = ({ live, health }) => {
  if (!live || !health) {
    return (
      <span className="flex items-center gap-1.5 rounded-md border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        Backend offline
      </span>
    );
  }
  const gen = health.models?.generator;
  const judge = health.models?.judge;
  const ready = health.engine_ready && gen?.ready !== false && judge?.ready !== false;
  const judgeName = (judge?.name ?? health.judge_model ?? 'judge').split('/').pop();
  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-800 px-2.5 py-1 text-xs text-slate-400"
      title={[gen?.error, judge?.error, health.engine_error].filter(Boolean).join(' · ') || undefined}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ready ? 'bg-emerald-400' : 'bg-amber-400')} />
      <span className="font-mono text-slate-300">{gen?.name ?? health.generator_model}</span>
      <span className="text-slate-600">judged by</span>
      <span className="font-mono text-slate-300">{judgeName}</span>
      {judge?.provider && <span className="text-slate-500">({judge.provider})</span>}
    </span>
  );
};
