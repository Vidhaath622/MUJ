import React from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  ShieldCheck, 
  Sparkles, 
  Wifi, 
  WifiOff, 
  Database
} from 'lucide-react';

interface RAGSealNavbarProps {
  isLiveBackend: boolean;
  onToggleLiveBackend: () => void;
  onOpenDocVault: () => void;
  onOpenSyntheticGenerator: () => void;
  onRunBatchSuite: () => void;
  activeView: 'cockpit' | 'batch' | 'components';
  onSelectView: (view: 'cockpit' | 'batch' | 'components') => void;
  isEvaluating?: boolean;
}

export const RAGSealNavbar: React.FC<RAGSealNavbarProps> = ({
  isLiveBackend,
  onToggleLiveBackend,
  onOpenDocVault,
  onOpenSyntheticGenerator,
  activeView,
  onSelectView,
}) => {
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
                <span className="text-[11px] text-neutral-400 font-normal font-mono">v1.0</span>
              </h1>
              <Badge variant="neon" size="sm">
                AI-04
              </Badge>
              <Badge variant="outline" size="sm" className="hidden sm:inline-flex text-[10px] font-mono border-neutral-700 text-neutral-300">
                Retriever &amp; Generator Tested Apart
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono mt-0.5">
              <span className="text-teal-300/90 font-medium">Automated RAG QA Layer</span>
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-400">Not a chatbot</span>
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-400 bg-neutral-900 px-1.5 py-0.2 rounded border border-neutral-800">
                [DEMO DATASET: ATS BENCHMARK v1]
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Main View Switcher */}
          <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => onSelectView('cockpit')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                activeView === 'cockpit'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Trace Inspector
            </button>
            <button
              onClick={() => onSelectView('batch')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                activeView === 'batch'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span>Batch Suite</span>
              <span className="px-1.5 py-0.2 text-[10px] font-mono bg-teal-950 text-teal-300 rounded border border-teal-800">
                n = 7
              </span>
            </button>
            <button
              onClick={() => onSelectView('components')}
              className={`px-3 py-1.5 rounded-md font-medium transition text-neutral-400 hover:text-neutral-200 ${
                activeView === 'components' ? 'bg-neutral-800 text-white' : ''
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
            <span className="hidden sm:inline">Corpus Vault</span> (5 docs)
          </Button>

          {/* Synthetic Question Generator */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSyntheticGenerator}
            className="text-xs border-teal-900/40 bg-teal-950/20 hover:bg-teal-900/40 text-teal-300 gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Synthetic</span> Questions
          </Button>

          {/* Backend / Mock Mode Indicator */}
          <button
            onClick={onToggleLiveBackend}
            title={isLiveBackend ? "Connected to backend API (http://localhost:8000)" : "Using verified offline mock dataset"}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 transition ${
              isLiveBackend 
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {isLiveBackend ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>API: LIVE</span>
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
    </header>
  );
};
