# AI-04 Component Library & Design System

A curated, developer-first UI/UX component library built in `/frontend` on branch `vidhaath/ui-frontend`, crafted to accelerate the frontend development of the **AI-04 RAG Evaluation & Diagnostic Pipeline** (and any improvised variation your teammate is developing).

---

## 🎨 Inspiration Matrix (Incorporated Patterns)

| Reference Platform | Extracted & Implemented Patterns | Component File |
| :--- | :--- | :--- |
| **shadcn/ui** | Atomic variants via `class-variance-authority`, `cn()` utility, Card structure, Badges, Tabs | `src/components/ui/` |
| **Untitled UI** | Enterprise B2B SaaS metric scorecards, progress bars, data tables with status chips | `metric-card.tsx`, `evaluation-table.tsx` |
| **Magic UI** | Bento Grid layout, Shiny Sheen & Glow button variants, Live Marquee ticker | `bento-grid.tsx`, `marquee.tsx` |
| **HeroUI (NextUI)** | Glassmorphism cards, glowing chips, circular radial progress meters | `progress.tsx`, `badge.tsx` |
| **Kibo UI & 21st.dev** | Side-by-side context diff viewer with inline claim highlighting, developer log cards | `diff-viewer.tsx` |
| **Fragments & Blocks.so** | Interactive query tester with model selector, ground truth drawer, shortcut triggers | `prompt-box.tsx` |
| **AlignUI & Base UI** | Minimalist 1px border lines, dark neutral tokens, clean spacing scale | `index.css`, `card.tsx` |
| **Tailkits & Flowbite** | Document drag-and-drop zone with format tags, animated counters, smooth toggles | `file-dropzone.tsx`, `animated-counter.tsx` |

---

## 📁 Library Directory Structure

```
frontend/src/components/
├── ui/                     # Atomic design tokens & primitives
│   ├── button.tsx          # Default, Primary, Outline, Glow, Shine, Destructive
│   ├── badge.tsx           # Success, Danger, Warning, Info, Neon, Pulse dots
│   ├── card.tsx            # Card, CardHeader, CardTitle, CardContent, Glass panel
│   ├── progress.tsx        # Linear and Circular/Radial progress gauges
│   ├── input.tsx           # Search input with left icon & ⌘K shortcut badge
│   ├── slider.tsx          # Range slider with live value readout
│   ├── switch.tsx          # Accessible boolean toggle switch
│   └── tabs.tsx            # Animated pill & underline tab switchers
├── domain/                 # High-Level AI Evaluation & Diagnostic Blocks
│   ├── diagnostic-badge.tsx# Root-cause classifier (CLEAN_PASS, RETRIEVAL_FAILURE, etc.)
│   ├── metric-card.tsx     # Stat cards with radial progress & threshold pass/fail
│   ├── diff-viewer.tsx     # Side-by-side retrieved chunk vs hallucinated claim diff
│   ├── prompt-box.tsx      # Diagnostic query runner with model selector & shortcuts
│   ├── file-dropzone.tsx   # Document uploader with format tags & size calculator
│   └── evaluation-table.tsx# Batch test suite table with status and drilldown triggers
├── magic/                  # Motion & Layout Effects
│   ├── bento-grid.tsx      # Modular Bento cards with subtle hover transitions
│   ├── animated-counter.tsx# Smooth number counter with ease-out interpolation
│   └── marquee.tsx         # Running event ticker for live autonomous harnesses
└── showcase/               # Interactive Component Explorer
    ├── LiveDashboardPreview.tsx  # Assembled single-screen diagnostic cockpit
    ├── DomainComponentsTab.tsx   # Isolated AI evaluation components
    ├── PrimitivesTab.tsx         # Atomic buttons, badges, and inputs
    └── MagicEffectsTab.tsx       # Bento grids, marquees, and counters
```

---

## ⚡ Instant Plug-and-Play Usage

Whenever your teammate shares the finalized backend schema or improvised problem statement, you can import and assemble your UI in minutes:

```tsx
import { MetricCard } from './components/domain/metric-card';
import { DiagnosticBadge } from './components/domain/diagnostic-badge';
import { DiffViewer } from './components/domain/diff-viewer';
import { PromptBox } from './components/domain/prompt-box';
import { FileDropzone } from './components/domain/file-dropzone';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
```

---

## 🚀 Running the Live Showcase

```bash
cd frontend
npm run dev
```

Server active at: `http://localhost:5173/`
Production build: `npm run build`
