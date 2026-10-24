import React, { useState } from 'react';
import { 
  FileText, 
  Bot, 
  Scale, 
  FlaskConical, 
  CheckCircle2, 
  GitBranch, 
  Users,
  Copy,
  Check,
  Server,
  Activity,
  RefreshCw,
  Cpu,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { HealthResponse, checkBackendHealth } from '../../lib/api';
import { Panel, GhostButton } from './shared/ui';
import { RagFigure } from './shared/RagFigure';
import { DiagnosticBadge } from '../domain/diagnostic-badge';

interface HowItWorksStoryProps {
  backendHealth?: HealthResponse | null;
  onRefreshHealth?: () => Promise<void>;
}

export const HowItWorksStory: React.FC<HowItWorksStoryProps> = ({
  backendHealth: initialHealth,
  onRefreshHealth,
}) => {
  const [activeStep, setActiveStep] = useState<number>(4); // default to replay hero step
  const [copiedDiagram, setCopiedDiagram] = useState(false);
  const [localHealth, setLocalHealth] = useState<HealthResponse | null>(initialHealth || null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [showHealthJson, setShowHealthJson] = useState<boolean>(false);

  const activeHealth = localHealth || initialHealth;

  const handlePingBackend = async () => {
    setIsPinging(true);
    try {
      const res = await checkBackendHealth();
      setLocalHealth(res);
      if (onRefreshHealth) await onRefreshHealth();
    } finally {
      setIsPinging(false);
    }
  };

  const steps = [
    {
      step: 1,
      title: 'Corpus & Gold Triples',
      subtitle: 'Synthetic Question-Answer-Context triples',
      icon: FileText,
      badge: 'GROUND TRUTH SEEDING',
      description:
        'Documents are ingested, parsed into semantic passages, and an automated generator synthesizes grounded question-answer pairs linked to exact canonical gold chunk IDs.',
      details: [
        'Document chunking with metadata preservation (filename, chunk offset, headings)',
        'Synthetic test generation creates (Question, Gold Context, Canonical Answer) triples',
        'Injects deliberate trap archetypes: stale policy versions, unanswerable queries, and distractor noise',
      ],
    },
    {
      step: 2,
      title: 'Standard RAG Execution',
      subtitle: 'Retriever and Generator run sequentially',
      icon: Bot,
      badge: 'OBSERVED RUN',
      description:
        'The query is processed by the retriever to fetch top-k passages, which are passed to the generator to produce the candidate answer.',
      details: [
        'Retriever executes dense vector search using nomic-embed-text',
        'Generator (llama3.2:3b locally or hosted provider) synthesizes grounded response',
        'Pipeline logs exact retrieved chunk IDs, similarity scores, and citations',
      ],
    },
    {
      step: 3,
      title: 'Decoupled Scoring',
      subtitle: 'Measuring retriever vs generator independently',
      icon: Scale,
      badge: 'TRIPLE METRICS',
      description:
        'Rather than scoring end-to-end output blindly, RAGSeal splits evaluation into three distinct state-grounded metrics.',
      details: [
        'Context Relevance (>= 0.70): Did the retriever retrieve necessary information?',
        'Faithfulness (>= 0.75): Can all claims be logically inferred from retrieved text?',
        'Answer Accuracy (>= 0.70): Does the answer match the canonical ground truth?',
      ],
    },
    {
      step: 4,
      title: 'Causal Replay Experiment',
      subtitle: 'Running the controlled experiment to prove root cause',
      icon: FlaskConical,
      badge: 'HERO MOMENT',
      description:
        'Most evaluation tools only compute statistical scores. RAGSeal runs a scientific experiment: when a failure occurs, it re-runs the generator with ONLY the canonical gold chunk injected.',
      details: [
        'Branch A (Standard): Query + Retrieved Context -> FAILED ANSWER',
        'Branch B (Replay): Query + Gold Context ONLY -> REPLAY ANSWER',
        'If Replay is CORRECT -> PROVEN RETRIEVAL FAILURE (Generator can answer when given evidence)',
        'If Replay is STILL WRONG -> PROVEN GENERATION HALLUCINATION (Generator fabricates despite perfect evidence)',
      ],
    },
    {
      step: 5,
      title: 'Evaluator Calibration',
      subtitle: 'Calibrating the AI judge against human-labelled ground truth',
      icon: Users,
      badge: 'JUDGE HONESTY',
      description:
        'Judges probe whether the evaluator itself is hallucinating. RAGSeal benchmarks its judge against hand-labelled human gold answers.',
      details: [
        'Measures Judge Agreement % (e.g. 64.3% across 28 real cases)',
        'Tracks False Passes (0 in benchmark) and False Fails explicitly',
        'Enforces Release Gate decisions: SHIP, REVIEW, or BLOCK',
      ],
    },
  ];

  const handleCopyPitchDiagram = () => {
    const asciiDiagram = `
========================================================================================
                          RAGSEAL CAUSAL VERDICT PIPELINE
========================================================================================
[Corpus Documents] ──> [Synthetic Generator] ──> [Gold Chunk IDs] (Canonical Truth)
        │
        ▼
[Retriever (top-k)] ────────────────────────┐
        │                                   │
        ▼                                   ▼
[Candidate Answer] ──> [Judge Scoring] ──> [FAIL DETECTED?]
                                                   │
                ┌──────────────────────────────────┴──────────────────────────────────┐
                ▼                                                                     ▼
      [Branch A: Standard RAG]                                             [Branch B: REPLAY EXPERIMENT]
  Query + Retrieved Chunks (Omission/Noise)                             Query + Forced GOLD CHUNK ONLY
                │                                                                     │
                ▼                                                                     ▼
       [Failed RAG Answer]                                                   [Replay Answer]
                │                                                                     │
                └──────────────────────────────────┬──────────────────────────────────┘
                                                   │
                          ┌────────────────────────┴────────────────────────┐
                          ▼                                                 ▼
                 [Replay IS CORRECT?]                             [Replay STILL WRONG?]
                          │                                                 │
                          ▼                                                 ▼
               VERDICT: RETRIEVAL FAILURE                        VERDICT: GENERATOR HALLUCINATION
========================================================================================
`;
    navigator.clipboard.writeText(asciiDiagram);
    setCopiedDiagram(true);
    setTimeout(() => setCopiedDiagram(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 py-2">
      {/* Top Header Panel */}
      <Panel className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#1F6F6A] font-semibold">
                Architecture &amp; Methodology
              </span>
              <span className="rounded-full bg-[#ECE7DC] px-2 py-0.5 text-[10px] font-mono text-[#5E5B53]">
                System Proof
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#1B1B18] tracking-tight mt-1.5">
              How RAGSeal Proves Why a RAG Answer Failed
            </h1>
            <p className="text-xs text-[#5E5B53] font-mono mt-1">
              Component-decoupled scoring combined with controlled gold-context replay experiments.
            </p>
          </div>

          <GhostButton
            onClick={handleCopyPitchDiagram}
            className="text-xs font-mono text-[#6B4C9A] hover:text-[#1B1B18] border border-[#EFEAF5] bg-[#F3EFF7] hover:bg-[#EFEAF5]"
          >
            {copiedDiagram ? <Check className="w-3.5 h-3.5 text-[#1F7A4D]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedDiagram ? 'Diagram Copied!' : 'Copy Pitch Deck Diagram'}</span>
          </GhostButton>
        </div>

        {/* Step Scrubber Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-5">
          {steps.map((s) => {
            const isSelected = activeStep === s.step;
            const Icon = s.icon;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(s.step)}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#F3EFF7] border-[#6B4C9A]/40 text-[#1B1B18] shadow-lg shadow-[#6B4C9A]/10'
                    : 'bg-[#FBF9F4] border-[#ECE7DC] text-[#5E5B53] hover:border-[#D6D0C3] hover:text-[#1B1B18]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-[#6B4C9A]">
                    STEP 0{s.step}
                  </span>
                  <Icon className="w-4 h-4 opacity-80 text-[#6B4C9A]" />
                </div>
                <div className="text-xs font-semibold truncate text-[#1B1B18]">{s.title}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Fig. 1: the RAG pipeline and where RAGSeal checks it */}
      <Panel className="p-6">
        <RagFigure />
      </Panel>

      {/* Live Engine Diagnostics Strip */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#1F6F6A]" />
            <span>Live Engine Connection</span>
          </div>
        }
        note={
          <span className="font-mono">localhost:8000</span>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className={`inline-block h-2 w-2 rounded-full ${activeHealth ? 'bg-[#1F7A4D] shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-[#B26B00]'}`} />
              <span className="text-xs font-mono text-[#1B1B18]">
                {activeHealth ? 'FastAPI Engine Active (200 OK)' : 'Engine Disconnected (Check Local Server)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <GhostButton
                onClick={handlePingBackend}
                disabled={isPinging}
                className="text-xs font-mono"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                <span>{isPinging ? 'Pinging...' : 'Ping /api/health'}</span>
              </GhostButton>
              <GhostButton
                onClick={() => setShowHealthJson(!showHealthJson)}
                className="text-xs font-mono"
              >
                <span>JSON</span>
                {showHealthJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </GhostButton>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#ECE7DC] space-y-1">
              <span className="text-[10px] text-[#5E5B53] uppercase block">Roundtrip Latency</span>
              <div className="text-[#1F7A4D] font-bold text-sm flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                <span>{activeHealth?.latencyMs !== undefined ? `${activeHealth.latencyMs} ms` : 'Local Host'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#ECE7DC] space-y-1">
              <span className="text-[10px] text-[#5E5B53] uppercase block">Evaluation Mode</span>
              <div className="text-[#1B1B18] font-bold text-sm capitalize">
                {activeHealth?.evaluation_mode || 'Local Ollama'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#ECE7DC] space-y-1">
              <span className="text-[10px] text-[#5E5B53] uppercase block">Generator</span>
              <div className="text-[#2F5D8A] font-bold text-sm truncate flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#2F5D8A]" />
                <span>{activeHealth?.generator_model || 'llama3.2:3b'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FBF9F4] border border-[#ECE7DC] space-y-1">
              <span className="text-[10px] text-[#5E5B53] uppercase block">Judge Model</span>
              <div className="text-[#6B4C9A] font-bold text-sm truncate flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#6B4C9A]" />
                <span>{activeHealth?.judge_model || 'llama3.2:3b'}</span>
              </div>
            </div>
          </div>

          {showHealthJson && activeHealth && (
            <div className="p-3.5 rounded-xl bg-[#F6F3EC] border border-[#ECE7DC] font-mono text-[11px] text-[#1F7A4D] overflow-x-auto">
              <div className="text-[#5E5B53] text-[10px] mb-1">// GET http://localhost:8000/api/health</div>
              <pre>{JSON.stringify(activeHealth, null, 2)}</pre>
            </div>
          )}
        </div>
      </Panel>

      {/* Hero Visual Pipeline Diagram Panel */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#6B4C9A]" />
            <span>Controlled Causal Replay Architecture</span>
          </div>
        }
        note="Hero Pitch Mechanism"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs font-mono">
            <div className="p-4 rounded-xl bg-[#FBF9F4] border border-[#ECE7DC] space-y-1.5">
              <span className="text-[10px] text-[#5E5B53] uppercase block font-semibold">Stage 1 · Evidence Seed</span>
              <div className="font-bold text-[#1F6F6A] text-sm">Corpus &amp; Canonical Truth</div>
              <p className="text-[11px] text-[#5E5B53] font-sans leading-relaxed pt-1">
                Documents are chunked into vector storage. Test cases include immutable canonical gold chunk IDs (<code className="text-[#1F6F6A]">chk_gold</code>).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#FBF9F4] border border-[#ECE7DC] space-y-1.5">
              <span className="text-[10px] text-[#5E5B53] uppercase block font-semibold">Stage 2 · Standard RAG</span>
              <div className="font-bold text-[#2F5D8A] text-sm">Retriever &rarr; Generator</div>
              <p className="text-[11px] text-[#5E5B53] font-sans leading-relaxed pt-1">
                Top-k chunks retrieved. If retriever omits the gold chunk or catches a distractor/stale chunk, the candidate answer is corrupted.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F3EFF7] border border-[#6B4C9A]/40 space-y-1.5 shadow-sm shadow-[#6B4C9A]/10">
              <span className="text-[10px] text-[#6B4C9A] uppercase block font-bold">Stage 3 · Causal Replay</span>
              <div className="font-bold text-[#6B4C9A] text-sm">Forced Gold Injection</div>
              <p className="text-[11px] text-[#6B4C9A] font-sans leading-relaxed pt-1">
                RAGSeal isolates the components: re-runs the same query with <strong className="text-[#1B1B18]">only the gold chunk</strong> injected. Proves causality!
              </p>
            </div>
          </div>

          {/* Verdict Truth Table */}
          <div className="rounded-xl border border-[#ECE7DC] bg-[#FBF9F4] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[#1B1B18] font-semibold">
                Scientific Verdict Decision Table
              </span>
              <span className="text-[11px] font-mono text-[#5E5B53]">Proven Decoupling Logic</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#FBF9F4] text-[#5E5B53] uppercase text-[10px] border-b border-[#ECE7DC]">
                  <tr>
                    <th className="py-2.5 px-3">Gold Chunk Retrieved?</th>
                    <th className="py-2.5 px-3">Answer Faithful?</th>
                    <th className="py-2.5 px-3">Replay with Gold Chunk</th>
                    <th className="py-2.5 px-3">Proven Causal Verdict</th>
                    <th className="py-2.5 px-3">Engineering Remediation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECE7DC] text-[11px]">
                  <tr>
                    <td className="py-3 px-3 text-[#1F7A4D]">Yes (Retrieved)</td>
                    <td className="py-3 px-3 text-[#1F7A4D]">Yes, Faithful</td>
                    <td className="py-3 px-3 text-[#6E6A62]">Not needed</td>
                    <td className="py-3 px-3"><DiagnosticBadge category="CLEAN_PASS" size="sm" /></td>
                    <td className="py-3 px-3 text-[#5E5B53] font-sans">None. System healthy and ready to ship.</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 text-[#B3261E] font-bold">No (Omitted)</td>
                    <td className="py-3 px-3 text-[#5E5B53]">n/a</td>
                    <td className="py-3 px-3 text-[#1F7A4D] font-bold">Fixed &amp; Correct!</td>
                    <td className="py-3 px-3"><DiagnosticBadge category="RETRIEVAL_FAILURE" size="sm" /></td>
                    <td className="py-3 px-3 text-[#5E5B53] font-sans">Improve retrieval: raise top-k, fix chunk boundaries, or rerank.</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 text-[#1F7A4D]">Yes (Retrieved)</td>
                    <td className="py-3 px-3 text-[#B3261E] font-bold">No (Fabricated)</td>
                    <td className="py-3 px-3 text-[#B3261E] font-bold">Still Hallucinates</td>
                    <td className="py-3 px-3"><DiagnosticBadge category="GENERATION_HALLUCINATION" size="sm" /></td>
                    <td className="py-3 px-3 text-[#5E5B53] font-sans">Lower temperature to 0.0, inject negative abstention constraint.</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 text-[#B3261E] font-bold">No (Omitted)</td>
                    <td className="py-3 px-3 text-[#B3261E] font-bold">No (Fabricated)</td>
                    <td className="py-3 px-3 text-[#B3261E]">Still Wrong</td>
                    <td className="py-3 px-3"><DiagnosticBadge category="COMPOUND_FAILURE" size="sm" /></td>
                    <td className="py-3 px-3 text-[#5E5B53] font-sans">Re-index corpus and enforce strict system prompt.</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 text-[#1F7A4D]">Yes</td>
                    <td className="py-3 px-3 text-[#1F7A4D]">Yes</td>
                    <td className="py-3 px-3 text-[#B26B00]">Answer wrong</td>
                    <td className="py-3 px-3"><DiagnosticBadge category="NEEDS_REVIEW" size="sm" /></td>
                    <td className="py-3 px-3 text-[#5E5B53] font-sans">Check human ground-truth label for annotation error.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Panel>

      {/* Deep Dive Panel */}
      {steps[activeStep - 1] && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <span className="text-[#6B4C9A] font-mono text-xs">Step 0{activeStep}</span>
              <span>{steps[activeStep - 1].title}</span>
            </div>
          }
          note={steps[activeStep - 1].badge}
        >
          <div className="space-y-4">
            <p className="text-sm text-[#1B1B18] font-sans leading-relaxed">
              {steps[activeStep - 1].description}
            </p>

            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#5E5B53] block font-semibold">
                Technical Guarantees &amp; Method:
              </span>
              <ul className="space-y-2 text-xs text-[#33322D] font-mono">
                {steps[activeStep - 1].details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 bg-[#FBF9F4] p-3 rounded-xl border border-[#ECE7DC]">
                    <CheckCircle2 className="w-4 h-4 text-[#1F6F6A] flex-shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
};
