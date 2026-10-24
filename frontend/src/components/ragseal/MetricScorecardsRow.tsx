import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Search, Feather, Target } from 'lucide-react';
import { MetricDetail } from '../../types/ragseal';

interface MetricScorecardsRowProps {
  metrics: {
    context_relevance: MetricDetail;
    faithfulness: MetricDetail;
    answer_accuracy: MetricDetail;
  };
  sampleCount?: number;
}

export const MetricScorecardsRow: React.FC<MetricScorecardsRowProps> = ({
  metrics,
  sampleCount = 1,
}) => {
  const getStatusBadge = (status: 'PASS' | 'FAIL' | 'UNCERTAIN') => {
    switch (status) {
      case 'PASS':
        return (
          <Badge variant="success" size="sm" dot>
            PASS
          </Badge>
        );
      case 'FAIL':
        return (
          <Badge variant="danger" size="sm" dot>
            FAIL
          </Badge>
        );
      case 'UNCERTAIN':
        return (
          <Badge variant="warning" size="sm" dot>
            UNCERTAIN
          </Badge>
        );
    }
  };

  const cr = metrics.context_relevance;
  const f = metrics.faithfulness;
  const aa = metrics.answer_accuracy;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 1. Context Relevance (Retriever) */}
      <Card variant="glass" className="relative overflow-hidden border-neutral-800 bg-[#0c1017]/80 p-5 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-sky-950/60 text-sky-400 border border-sky-800/40">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold block">
                  Component: Retriever
                </span>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Context Relevance
                </h3>
              </div>
            </div>
            {getStatusBadge(cr.status)}
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-bold text-white tracking-tight">
                {(cr.score * 100).toFixed(0)}%
              </span>
              <span className="text-xs font-mono text-neutral-400">
                ({cr.score.toFixed(2)})
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-neutral-400 block">
                Target: &ge; {((cr.threshold ?? 0.70) * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                [Model-Judged]
              </span>
            </div>
          </div>

          <Progress
            value={cr.score * 100}
            variant={cr.status === 'PASS' ? 'success' : 'danger'}
            size="md"
          />

          <p className="text-xs text-neutral-300 font-sans leading-relaxed pt-1">
            {cr.details}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>Retrieval Fidelity</span>
          <span className="text-neutral-500">n = {sampleCount}</span>
        </div>
      </Card>

      {/* 2. Faithfulness / Groundedness (Generator) */}
      <Card variant="glass" className="relative overflow-hidden border-neutral-800 bg-[#0c1017]/80 p-5 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-teal-950/60 text-teal-400 border border-teal-800/40">
                <Feather className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-teal-400 font-semibold block">
                  Component: Generator
                </span>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Faithfulness / Grounding
                </h3>
              </div>
            </div>
            {getStatusBadge(f.status)}
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-bold text-white tracking-tight">
                {(f.score * 100).toFixed(0)}%
              </span>
              <span className="text-xs font-mono text-neutral-400">
                ({f.score.toFixed(2)})
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-neutral-400 block">
                Target: &ge; {((f.threshold ?? 0.75) * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                [Model-Judged]
              </span>
            </div>
          </div>

          <Progress
            value={f.score * 100}
            variant={f.status === 'PASS' ? 'success' : 'danger'}
            size="md"
          />

          <p className="text-xs text-neutral-300 font-sans leading-relaxed pt-1">
            {f.details}
          </p>

          {f.hallucinated_claims && f.hallucinated_claims.length > 0 && (
            <div className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-900/60 text-[11px] text-rose-300">
              <span className="font-semibold block mb-0.5">Hallucination Detected:</span>
              <ul className="list-disc list-inside space-y-0.5 text-rose-300/90 font-mono text-[10px]">
                {f.hallucinated_claims.map((claim, idx) => (
                  <li key={idx} className="truncate">"{claim}"</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>Groundedness Fidelity</span>
          <span className="text-neutral-500">n = {sampleCount}</span>
        </div>
      </Card>

      {/* 3. Answer Accuracy / Correctness (End-to-End) */}
      <Card variant="glass" className="relative overflow-hidden border-neutral-800 bg-[#0c1017]/80 p-5 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-indigo-400 font-semibold block">
                  End-to-End Task
                </span>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Answer Accuracy
                </h3>
              </div>
            </div>
            {getStatusBadge(aa.status)}
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-mono font-bold text-white tracking-tight">
                {(aa.score * 100).toFixed(0)}%
              </span>
              <span className="text-xs font-mono text-neutral-400">
                ({aa.score.toFixed(2)})
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-neutral-400 block">
                Target: &ge; {((aa.threshold ?? 0.70) * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                [Model-Judged]
              </span>
            </div>
          </div>

          <Progress
            value={aa.score * 100}
            variant={aa.status === 'PASS' ? 'success' : 'danger'}
            size="md"
          />

          <p className="text-xs text-neutral-300 font-sans leading-relaxed pt-1">
            {aa.details}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>Semantic Alignment</span>
          <span className="text-neutral-500">n = {sampleCount}</span>
        </div>
      </Card>
    </div>
  );
};
