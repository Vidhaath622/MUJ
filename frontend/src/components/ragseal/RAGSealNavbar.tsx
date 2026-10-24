import React from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  ShieldCheck, 
  Sparkles, 
  Wifi, 
  WifiOff, 
  Database,
  User,
  FlaskConical,
  BookOpen,
  Briefcase,
  Landmark,
  HeartPulse
} from 'lucide-react';
import { PackId, AuthUser } from '../../types/ragseal';
import { HealthResponse } from '../../lib/api';

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

export const RAGSealNavbar: React.FC<RAGSealNavbarProps> = ({
  isLiveBackend,
  onToggleLiveBackend,
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
  const packs = [
    { id: 'recruitment' as PackId, label: 'Recruitment ATS', icon: Briefcase },
    { id: 'banking' as PackId, label: 'Banking & Wires', icon: Landmark },
    { id: 'healthcare' as PackId, label: 'Clinical Protocols', icon: HeartPulse },
  ];

  return (
    <header className="border-b border-neutral-800 bg-[#07090e]/95 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand & Problem Statement Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-lg shadow-teal-500/20 flex-shrink-0">
            <div className="w-full h-full bg-[#090d16] rounded-[10px] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                RAG<span className="text-teal-400">Seal</span>
                <span className="text-[11px] text-neutral-400 font-normal font-mono">v2.0</span>
              </h1>
              <Badge variant="neon" size="sm">
                AI-04
              </Badge>
              <Badge variant="outline" size="sm" className="hidden sm:inline-flex text-[10px] font-mono border-neutral-700 text-neutral-300">
                Causal Replay Evaluation Lab
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono mt-0.5">
              <span className="text-teal-300/90 font-medium">Retriever &amp; Generator Tested Apart</span>
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-400">Proves Failure Root Cause</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (Tab 1: Lab, Tab 2: How It Works, Tab 3: UI Library) */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs font-mono">
            <button
              onClick={() => onSelectTab('lab')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                activeTab === 'lab'
                  ? 'bg-neutral-800 text-white shadow-sm font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 text-teal-400" />
              <span>Tab 1: Lab</span>
            </button>
            <button
              onClick={() => onSelectTab('story')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                activeTab === 'story'
                  ? 'bg-purple-950 text-purple-200 shadow-sm font-bold border border-purple-800'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>Tab 2: How It Works</span>
            </button>
            <button
              onClick={() => onSelectTab('components')}
              className={`px-3 py-1.5 rounded-md font-medium transition text-neutral-400 hover:text-neutral-200 ${
                activeTab === 'components' ? 'bg-neutral-800 text-white font-bold' : ''
              }`}
            >
              UI Library
            </button>
          </div>

          {/* Document Vault Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenDocVault}
            className="text-xs border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300 gap-1.5"
          >
            <Database className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Corpus Vault</span>
          </Button>

          {/* Synthetic Question Generator */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSyntheticGenerator}
            className="text-xs border-teal-900/40 bg-teal-950/20 hover:bg-teal-900/40 text-teal-300 gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Synthetic</span> Q&amp;A
          </Button>

          {/* User Account Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAuth}
            className="text-xs font-mono border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white gap-1.5"
          >
            <User className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden md:inline">{currentUser ? currentUser.email.split('@')[0] : 'Sign In'}</span>
          </Button>

          {/* Backend / Mock Mode Indicator */}
          <button
            onClick={onToggleLiveBackend}
            title={
              isLiveBackend
                ? `Connected to FastAPI Backend (http://localhost:8000)${
                    backendHealth ? ` | Engine: ${backendHealth.evaluation_mode || 'local'} (${backendHealth.latencyMs}ms)` : ''
                  }`
                : 'Using verified offline benchmark dataset'
            }
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 transition ${
              isLiveBackend 
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {isLiveBackend ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>API: LIVE (8000)</span>
                {backendHealth?.latencyMs && (
                  <span className="text-[10px] text-emerald-500 font-normal">
                    {backendHealth.latencyMs}ms
                  </span>
                )}
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-neutral-500" />
                <span>API: DEMO MOCK</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Industry Pack Selector Bar (Visible in Lab tab) */}
      {activeTab === 'lab' && (
        <div className="max-w-7xl mx-auto pt-2.5 mt-2 border-t border-neutral-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              Industry Packs:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {packs.map((p) => {
                const isSelected = activePack === p.id;
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPack(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-teal-950/80 text-teal-200 border-teal-500 font-bold shadow-sm'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    <Icon className="w-3 h-3 text-teal-400" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
            <span className="bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 text-neutral-300">
              Model: {backendHealth?.generator_model || 'llama3.2:3b'}
            </span>
            <span className="bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 text-neutral-300">
              Judge: {backendHealth?.judge_model || 'qwen3:8b'} (cached)
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
