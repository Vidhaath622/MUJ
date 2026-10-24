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
      <div className="p-4 rounded-xl bg-[var(--panel)] border border-[var(--rule)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-[var(--ink-2)] uppercase tracking-wider font-semibold">
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
              className="px-2 py-0.5 rounded-md bg-[var(--panel)] hover:bg-[var(--panel)] text-[var(--ink-1)] hover:text-[var(--ink)] border border-[var(--rule)] transition text-[11px] font-mono flex items-center gap-1"
            >
              <span>{src.name}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          ))}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--rule)] pb-3">
        <button
          onClick={() => setActiveSubTab('domain')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 border ${
            activeSubTab === 'domain'
              ? 'bg-[var(--violet-tint)] text-[var(--violet)] border-[color:color-mix(in_srgb,var(--violet)_40%,transparent)] font-bold'
              : 'bg-[var(--panel)] text-[var(--ink-2)] border-[var(--rule)] hover:text-[var(--ink)]'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Domain Components (Metric Cards, Diff, Badges)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('primitives')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 border ${
            activeSubTab === 'primitives'
              ? 'bg-[var(--accent-tint)] text-[var(--accent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] font-bold'
              : 'bg-[var(--panel)] text-[var(--ink-2)] border-[var(--rule)] hover:text-[var(--ink)]'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Core UI Primitives (Buttons, Badges, Gauges, Inputs)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('magic')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 border ${
            activeSubTab === 'magic'
              ? 'bg-[var(--teal-tint)] text-[var(--teal)] border-[color:color-mix(in_srgb,var(--teal)_40%,transparent)] font-bold'
              : 'bg-[var(--panel)] text-[var(--ink-2)] border-[var(--rule)] hover:text-[var(--ink)]'
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
