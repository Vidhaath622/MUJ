import React, { useState } from 'react';
import { DomainComponentsTab } from './DomainComponentsTab';
import { PrimitivesTab } from './PrimitivesTab';
import { MagicEffectsTab } from './MagicEffectsTab';
import { Badge } from '../ui/badge';
import { ExternalLink, Cpu, Boxes, Sparkles } from 'lucide-react';

export const ComponentLibraryTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'domain' | 'primitives' | 'magic'>('domain');

  const inspirationSources = [
    { name: 'shadcn/ui', url: 'https://ui.shadcn.com' },
    { name: 'Untitled UI', url: 'https://untitledui.com/react' },
    { name: 'Magic UI', url: 'https://magicui.design' },
    { name: 'HeroUI', url: 'https://heroui.com' },
    { name: 'AlignUI', url: 'https://alignui.com' },
    { name: 'Kibo UI', url: 'https://kibo-ui.com' },
    { name: 'Fragments', url: 'https://usefragments.com' },
    { name: '21st.dev', url: 'https://21st.dev' },
    { name: 'Blocks.so', url: 'https://blocks.so' },
    { name: 'Base UI', url: 'https://base-ui.com' },
    { name: 'React Aria', url: 'https://react-aria.adobe.com' },
    { name: 'Flowbite', url: 'https://flowbite.com' },
    { name: 'DaisyUI', url: 'https://daisyui.com' },
    { name: 'Tailkits', url: 'https://tailkits.com' },
    { name: 'Mantine', url: 'https://mantine.dev' },
    { name: 'MUI', url: 'https://mui.com' },
    { name: 'Coss UI', url: 'https://coss.com/ui' },
    { name: 'Smooth UI', url: 'https://smoothui.dev' },
    { name: 'Shadcn Blocks', url: 'https://shadcnblocks.com' },
  ];

  return (
    <div className="space-y-6">
      {/* Reference Strip */}
      <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider font-semibold">
            19 Curated Free UI/UX Inspiration Foundations:
          </span>
          <Badge variant="neon" size="sm">
            19 SOURCE SYSTEMS
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {inspirationSources.map((src) => (
            <a
              key={src.name}
              href={src.url}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-0.5 rounded-md bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition text-[11px] font-mono flex items-center gap-1"
            >
              <span>{src.name}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          ))}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <button
          onClick={() => setActiveSubTab('domain')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 border ${
            activeSubTab === 'domain'
              ? 'bg-purple-950/60 text-purple-300 border-purple-700/80 font-bold'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Domain Components (Metric Cards, Diff, Badges)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('primitives')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 border ${
            activeSubTab === 'primitives'
              ? 'bg-sky-950/60 text-sky-300 border-sky-700/80 font-bold'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Core UI Primitives (Buttons, Badges, Gauges, Inputs)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('magic')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 border ${
            activeSubTab === 'magic'
              ? 'bg-teal-950/60 text-teal-300 border-teal-700/80 font-bold'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Magic Effects (Bento Grid, Marquee, Counters)</span>
        </button>
      </div>

      {/* Content Rendering */}
      <div>
        {activeSubTab === 'domain' && <DomainComponentsTab />}
        {activeSubTab === 'primitives' && <PrimitivesTab />}
        {activeSubTab === 'magic' && <MagicEffectsTab />}
      </div>
    </div>
  );
};
