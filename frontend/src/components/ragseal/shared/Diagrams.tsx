import React from 'react';
import { GraphEdge, GraphNode, NodeGraph } from './NodeGraph';

// The three explainer flowcharts (diagnosis tree, architecture, release gate),
// each in a captioned figure. Used on How it works and under the Start here story.

const DIAGNOSIS_NODES: GraphNode[] = [
  { id: 'q', x: 380, y: 16, w: 240, h: 52, label: 'An answer to check' },
  { id: 'abst', x: 740, y: 112, w: 240, h: 52, label: 'Should have abstained', kind: 'gen' },
  { id: 'ret', x: 380, y: 112, w: 240, h: 64, label: 'Was the correct passage\nretrieved?', kind: 'decision' },
  { id: 'rep', x: 50, y: 232, w: 270, h: 64, label: 'Replay with only the\ncorrect text fixed it?', kind: 'decision' },
  { id: 'stuck', x: 560, y: 232, w: 230, h: 64, label: 'Did the answer stick\nto that text?', kind: 'decision' },
  { id: 'rf', x: 30, y: 354, w: 200, h: 52, label: 'Retrieval failure', kind: 'retr' },
  { id: 'both', x: 250, y: 354, w: 170, h: 52, label: 'Both failed', kind: 'gen' },
  { id: 'hall', x: 470, y: 354, w: 190, h: 52, label: 'Hallucination', kind: 'gen' },
  { id: 'known', x: 700, y: 354, w: 230, h: 64, label: 'Matches the\nknown answer?', kind: 'decision' },
  { id: 'rev', x: 600, y: 478, w: 230, h: 60, label: 'Reasoning error /\nneeds a human', kind: 'review' },
  { id: 'ok', x: 850, y: 478, w: 140, h: 52, label: 'Accurate', kind: 'ok' },
  { id: 'store', x: 350, y: 606, w: 300, h: 52, label: 'Store evidence + verdict', kind: 'store' },
];

const DIAGNOSIS_EDGES: GraphEdge[] = [
  { from: 'q', to: 'abst', route: 'h', label: 'answered, not in docs' },
  { from: 'q', to: 'ret' },
  { from: 'ret', to: 'rep', label: 'No', bend: 204 },
  { from: 'ret', to: 'stuck', label: 'Yes', bend: 204 },
  { from: 'rep', to: 'rf', label: 'Yes', bend: 326 },
  { from: 'rep', to: 'both', label: 'No', bend: 326 },
  { from: 'stuck', to: 'hall', label: 'No', bend: 326 },
  { from: 'stuck', to: 'known', label: 'Yes', bend: 326 },
  { from: 'known', to: 'rev', label: 'No', bend: 450 },
  { from: 'known', to: 'ok', label: 'Yes', bend: 450 },
  { from: 'rf', to: 'store', bend: 576 },
  { from: 'both', to: 'store', bend: 576 },
  { from: 'hall', to: 'store', bend: 576 },
  { from: 'rev', to: 'store', bend: 576 },
  { from: 'ok', to: 'store', bend: 576 },
];

const ARCH_NODES: GraphNode[] = [
  { id: 'user', x: 40, y: 16, w: 200, h: 52, label: 'User / judge' },
  { id: 'ollama', x: 560, y: 10, w: 200, h: 60, label: 'Ollama (local)\nllama3.2:3b · embeddings' },
  { id: 'groq', x: 780, y: 10, w: 200, h: 60, label: 'Groq grading model\ngpt-oss-120b · qwen' },
  { id: 'fe', x: 40, y: 140, w: 200, h: 56, label: 'React frontend\n(Vite, TypeScript)' },
  { id: 'be', x: 310, y: 140, w: 200, h: 56, label: 'FastAPI backend\nauth · runs · labels' },
  { id: 'eng', x: 600, y: 124, w: 340, h: 88, label: 'Engine\ningest · retrieve · generate\nscore · replay · verdict' },
  { id: 'db', x: 310, y: 290, w: 200, h: 60, label: 'SQLite app data\nruns · labels · users', kind: 'store' },
  { id: 'vec', x: 600, y: 290, w: 340, h: 60, label: 'Vector store + judge cache\n(SQLite)', kind: 'store' },
];

const ARCH_EDGES: GraphEdge[] = [
  { from: 'user', to: 'fe' },
  { from: 'fe', to: 'be', route: 'h', label: '/api' },
  { from: 'be', to: 'eng', route: 'h' },
  { from: 'ollama', to: 'eng', bend: 96 },
  { from: 'groq', to: 'eng', bend: 96 },
  { from: 'be', to: 'db' },
  { from: 'eng', to: 'vec' },
];

const GATE_NODES: GraphNode[] = [
  { id: 'in', x: 380, y: 10, w: 240, h: 58, label: 'Question + passages\n+ answer' },
  { id: 'rules', x: 170, y: 116, w: 240, h: 58, label: 'Rule checks\nnumbers · abstentions' },
  { id: 'judge', x: 590, y: 116, w: 240, h: 58, label: 'Grading model\n3 checks in one call' },
  { id: 'comb', x: 380, y: 222, w: 240, h: 52, label: 'Combine findings' },
  { id: 'human', x: 730, y: 222, w: 250, h: 58, label: 'Human-labelled set\n213 answers, 2 people' },
  { id: 'meas', x: 690, y: 330, w: 290, h: 58, label: 'Measure the evaluator\nagreement · confusion matrix' },
  { id: 'qual', x: 380, y: 430, w: 240, h: 52, label: 'Quality rules' },
  { id: 'gate', x: 380, y: 520, w: 240, h: 56, label: 'Release decision', kind: 'decision' },
  { id: 'ship', x: 150, y: 640, w: 170, h: 52, label: 'SHIP', kind: 'ok' },
  { id: 'review', x: 415, y: 640, w: 170, h: 52, label: 'REVIEW', kind: 'review' },
  { id: 'block', x: 680, y: 640, w: 170, h: 52, label: 'BLOCK', kind: 'gen' },
];

const GATE_EDGES: GraphEdge[] = [
  { from: 'in', to: 'rules', bend: 92 },
  { from: 'in', to: 'judge', bend: 92 },
  { from: 'rules', to: 'comb', bend: 198 },
  { from: 'judge', to: 'comb', bend: 198 },
  { from: 'human', to: 'meas' },
  { from: 'comb', to: 'meas', bend: 304 },
  { from: 'comb', to: 'qual' },
  { from: 'meas', to: 'qual', bend: 408 },
  { from: 'qual', to: 'gate' },
  { from: 'gate', to: 'ship', label: 'passes checks', bend: 606 },
  { from: 'gate', to: 'review', label: 'borderline', bend: 606 },
  { from: 'gate', to: 'block', label: 'critical failure', bend: 606 },
];

const Figure: React.FC<{ fig: string; title: string; caption: string; children: React.ReactNode }> = ({
  fig,
  title,
  caption,
  children,
}) => (
  <figure className="rounded-2xl border border-[var(--rule)] bg-[var(--panel)] p-6">
    <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--ink-2)]">{fig}</div>
    <h2 className="mt-1 text-[22px] leading-tight text-[var(--ink)]" style={{ fontFamily: "Newsreader, Georgia, serif" }}>{title}</h2>
    <div className="mx-auto mt-5 max-w-[1000px]">{children}</div>
    <figcaption className="mt-4 text-[13px] leading-relaxed text-[var(--ink-2)]">{caption}</figcaption>
  </figure>
);

export const DiagnosisTree: React.FC<{ fig?: string }> = ({ fig = 'Fig. 2' }) => (
  <Figure
    fig={fig}
    title="How a failure gets diagnosed"
    caption="Every wrong answer walks this tree. The replay step is the proof: if the bot gets it right once it is handed only the correct text, the retriever caused the mistake."
  >
    <NodeGraph nodes={DIAGNOSIS_NODES} edges={DIAGNOSIS_EDGES} width={1000} height={670} title="How a failure gets diagnosed" />
  </Figure>
);

export const ArchitectureGraph: React.FC<{ fig?: string }> = ({ fig = 'Fig. 3' }) => (
  <Figure
    fig={fig}
    title="System architecture"
    caption="The bot under test and the embeddings run locally through Ollama; a hosted model grades. Everything is stored in SQLite, and every grading call is cached so runs are reproducible."
  >
    <NodeGraph nodes={ARCH_NODES} edges={ARCH_EDGES} width={1000} height={370} title="System architecture" />
  </Figure>
);

export const ReleaseGate: React.FC<{ fig?: string }> = ({ fig = 'Fig. 4' }) => (
  <Figure
    fig={fig}
    title="From checks to a release decision"
    caption="Rule checks and the grading model are combined, the evaluator itself is measured against two human labellers, and quality rules turn the result into SHIP, REVIEW or BLOCK."
  >
    <NodeGraph nodes={GATE_NODES} edges={GATE_EDGES} width={1000} height={710} title="Release decision flow" />
  </Figure>
);
