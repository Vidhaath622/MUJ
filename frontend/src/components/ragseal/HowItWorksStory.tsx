import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DiagnosticBadge } from '../domain/diagnostic-badge';
import { 
  FileText, 
  Bot, 
  Scale, 
  FlaskConical, 
  CheckCircle2, 
  GitBranch, 
  Users,
  Copy,
  Check
} from 'lucide-react';

export const HowItWorksStory: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(4); // default to replay hero step
  const [copiedDiagram, setCopiedDiagram] = useState(false);

  const steps = [
    {
      step: 1,
      title: '1. Corpus & Gold Triples Generation',
      subtitle: 'Synthetic Question-Answer-Context triples',
      icon: FileText,
      badge: 'GROUND TRUTH SEEDING',
      description:
        'Documents are ingested, parsed into semantic passages, and an automated generator synthesizes grounded question-answer pairs linked to exact canonical gold chunk IDs.',
      details: [
        'Document chunking with metadata preservation (page, section, document title)',
        'Synthetic test generation creates (Question, Gold Context, Canonical Answer) triples',
        'Injects deliberate trap archetypes: stale policy versions, unanswerable queries, and distractor noise',
      ],
    },
    {
      step: 2,
      title: '2. Standard RAG Pipeline Execution',
      subtitle: 'Retriever and Generator run sequentially',
      icon: Bot,
      badge: 'OBSERVED RUN',
      description:
        'The query is processed by the retriever to fetch top-k passages, which are passed to the generator to produce the candidate answer.',
      details: [
        'Retriever executes dense + sparse BM25 search across corpus chunks',
        'Generator (llama3.2:3b locally or NVIDIA NIM meta/llama-3.2-3b) synthesizes response',
        'Pipeline logs exact retrieved chunk IDs, similarity scores, and answer text',
      ],
    },
    {
      step: 3,
      title: '3. Component-Decoupled Scoring',
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
      title: '4. The Causal Replay Experiment (Hero Technique)',
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
      title: '5. Evaluator Health & Human Agreement',
      subtitle: 'Calibrating the AI judge against human-labelled ground truth',
      icon: Users,
      badge: 'JUDGE HONESTY',
      description:
        'Judges probe whether the evaluator itself is hallucinating. RAGSeal benchmarks its judge against 30-50 hand-labelled human gold answers.',
      details: [
        'Measures Judge Agreement % (e.g. 86% across 30 cases)',
        'Tracks False Passes and False Fails explicitly',
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
    <div className="space-y-6">
      {/* Top Banner */}
      <Card variant="glass" className="p-6 border-neutral-800 bg-[#0c1017]/95 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-teal-400 font-semibold">
                Architecture &amp; Methodology
              </span>
              <Badge variant="neon" size="sm">
                Tab 2 Storytelling
              </Badge>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-1">
              How RAGSeal Proves Why a RAG Answer Failed
            </h2>
            <p className="text-xs text-neutral-400 font-mono mt-1">
              Decoupled scoring combined with controlled gold-context replay experiments.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPitchDiagram}
            className="text-xs font-mono border-purple-800 text-purple-300 hover:bg-purple-950/40 gap-1.5"
          >
            {copiedDiagram ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedDiagram ? 'Diagram Copied!' : 'Copy Pitch Deck Diagram'}</span>
          </Button>
        </div>

        {/* Step Scrubber Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
          {steps.map((s) => {
            const isSelected = activeStep === s.step;
            const Icon = s.icon;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(s.step)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-purple-950/40 border-purple-500 text-white shadow-lg shadow-purple-950/40'
                    : 'bg-neutral-900/40 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-purple-400">
                    STEP 0{s.step}
                  </span>
                  <Icon className="w-3.5 h-3.5 opacity-80" />
                </div>
                <div className="text-xs font-bold truncate">{s.title.split('. ')[1]}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Hero Visual Pipeline Diagram Card */}
      <Card variant="glass" className="p-6 border-purple-900/60 bg-gradient-to-b from-[#0e0c1a] via-[#090d16] to-[#07090e] space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              Visual Pipeline Flow: Standard RAG vs. Causal Replay Branch
            </h3>
          </div>
          <Badge variant="outline" size="sm" className="font-mono text-[10px] text-purple-300 border-purple-800">
            HERO PITCH ARTIFACT
          </Badge>
        </div>

        {/* Flow Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          {/* Stage 1 */}
          <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
            <span className="text-[10px] text-neutral-400 uppercase block">Stage 1: Ground Truth</span>
            <div className="font-bold text-teal-400 text-sm">Corpus &amp; Gold Passages</div>
            <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
              Documents are indexed. Synthetic generator links questions to canonical gold chunk IDs (`chk_gold`).
            </p>
          </div>

          {/* Stage 2 */}
          <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
            <span className="text-[10px] text-neutral-400 uppercase block">Stage 2: Standard RAG</span>
            <div className="font-bold text-sky-400 text-sm">Retriever &rarr; Generator</div>
            <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
              Standard RAG retrieves top-k chunks. If retriever omits gold chunk or fetches noise, answer fails.
            </p>
          </div>

          {/* Stage 3 */}
          <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-700/80 space-y-2">
            <span className="text-[10px] text-purple-300 uppercase block font-bold">Stage 3: Causal Replay</span>
            <div className="font-bold text-purple-200 text-sm">Forced Gold Injection</div>
            <p className="text-[11px] text-purple-300/90 font-sans leading-relaxed">
              RAGSeal isolates generator: re-runs query with ONLY the gold chunk. Confirms if error was retriever or LLM!
            </p>
          </div>
        </div>

        {/* Causal Verdict Matrix Table */}
        <div className="p-4 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-3">
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold block">
            Automated Verdict Decision Table:
          </span>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3">Gold Chunk Retrieved?</th>
                  <th className="py-2.5 px-3">Answer Faithful?</th>
                  <th className="py-2.5 px-3">Replay with Gold Chunk</th>
                  <th className="py-2.5 px-3">Proven Causal Verdict</th>
                  <th className="py-2.5 px-3">Remediation Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-[11px]">
                <tr>
                  <td className="py-2.5 px-3 text-emerald-400">Yes (Retrieved)</td>
                  <td className="py-2.5 px-3 text-emerald-400">Yes, Faithful</td>
                  <td className="py-2.5 px-3 text-neutral-500">Not needed</td>
                  <td className="py-2.5 px-3"><DiagnosticBadge category="CLEAN_PASS" size="sm" /></td>
                  <td className="py-2.5 px-3 text-neutral-400 font-sans">None. System healthy.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-rose-400 font-bold">No (Omitted)</td>
                  <td className="py-2.5 px-3 text-neutral-400">n/a</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">Fixed &amp; Correct!</td>
                  <td className="py-2.5 px-3"><DiagnosticBadge category="RETRIEVAL_FAILURE" size="sm" /></td>
                  <td className="py-2.5 px-3 text-neutral-400 font-sans">Tune top-k, BM25 weighting, or embeddings.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-emerald-400">Yes (Retrieved)</td>
                  <td className="py-2.5 px-3 text-rose-400 font-bold">No (Fabricated)</td>
                  <td className="py-2.5 px-3 text-rose-400">Still Hallucinates</td>
                  <td className="py-2.5 px-3"><DiagnosticBadge category="GENERATION_HALLUCINATION" size="sm" /></td>
                  <td className="py-2.5 px-3 text-neutral-400 font-sans">Lower temperature to 0.0, inject negative constraints.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-rose-400 font-bold">No (Omitted)</td>
                  <td className="py-2.5 px-3 text-rose-400 font-bold">No (Fabricated)</td>
                  <td className="py-2.5 px-3 text-rose-400">Still Wrong</td>
                  <td className="py-2.5 px-3"><DiagnosticBadge category="COMPOUND_FAILURE" size="sm" /></td>
                  <td className="py-2.5 px-3 text-neutral-400 font-sans">Re-index corpus and enforce strict abstention prompt.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-emerald-400">Yes</td>
                  <td className="py-2.5 px-3 text-emerald-400">Yes</td>
                  <td className="py-2.5 px-3 text-amber-400">Answer wrong</td>
                  <td className="py-2.5 px-3"><DiagnosticBadge category="NEEDS_REVIEW" size="sm" /></td>
                  <td className="py-2.5 px-3 text-neutral-400 font-sans">Check human ground-truth label for error.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Active Step Details */}
      {steps[activeStep - 1] && (
        <Card variant="glass" className="p-6 border-neutral-800 bg-[#0c1017]/90 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-purple-400 font-bold">Deep Dive:</span>
              <h3 className="text-base font-bold text-white">{steps[activeStep - 1].title}</h3>
            </div>
            <Badge variant="neon" size="sm">
              {steps[activeStep - 1].badge}
            </Badge>
          </div>

          <p className="text-sm text-neutral-200 font-sans leading-relaxed">
            {steps[activeStep - 1].description}
          </p>

          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 block font-semibold">
              Implementation Guarantees:
            </span>
            <ul className="space-y-1.5 text-xs text-neutral-300 font-mono">
              {steps[activeStep - 1].details.map((detail, idx) => (
                <li key={idx} className="flex items-start gap-2 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
};
