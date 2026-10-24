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
    <header className="sticky top-0 z-40 border-b border-[#17191D] bg-[#08090B]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-[22px] w-[22px] text-[#E8EAED]" strokeWidth={1.6} />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">RAGSeal</span>
          <span className="hidden text-xs text-[#7D838C] 2xl:inline">Retriever and generator, tested apart</span>
        </div>

        <nav className="flex items-center gap-1 text-[13px]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTab(t.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 transition-colors',
                activeTab === t.id ? 'bg-[#16181C] text-white' : 'text-[#8A9099] hover:text-[#E8EAED]'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {activeTab === 'lab' && (
          <div className="flex items-center gap-0.5 rounded-[10px] border border-[#1C1F24] p-[3px] text-[13px]">
            {PACKS.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectPack(p.id)}
                className={cn(
                  'rounded-[7px] px-3 py-[5px] transition-colors',
                  activePack === p.id
                    ? 'bg-[#1C1F24] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'text-[#8A9099] hover:text-[#E8EAED]'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 text-[13px]">
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
    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[#B4B9C0] transition-colors hover:bg-[#16181C] hover:text-white"
  >
    <span className="text-[#7D838C]">{icon}</span>
    <span className="hidden lg:inline">{children}</span>
  </button>
);

/** Honest backend status: which generator and judge are actually loaded, straight from /api/health. */
const ModelStatus: React.FC<{ live: boolean; health?: HealthResponse | null }> = ({ live, health }) => {
  if (!live || !health) {
    return (
      <span className="mr-2 flex items-center gap-2 text-xs text-[#F47783]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F47783]" />
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
      className="mr-2 flex items-center gap-2 whitespace-nowrap text-xs text-[#8A9099]"
      title={[gen?.error, judge?.error, health.engine_error].filter(Boolean).join(' · ') || undefined}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          ready ? 'bg-[#3DD68C] shadow-[0_0_0_3px_rgba(61,214,140,0.15)]' : 'bg-[#F5A524] shadow-[0_0_0_3px_rgba(245,165,36,0.15)]'
        )}
      />
      <span className="font-mono text-[#C9CDD3]">{gen?.name ?? health.generator_model}</span>
      <span>judged by</span>
      <span className="font-mono text-[#C9CDD3]">{judgeName}</span>
    </span>
  );
};
