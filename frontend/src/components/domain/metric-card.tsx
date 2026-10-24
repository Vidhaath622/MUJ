import React from 'react';
import { Card } from '../ui/card';
import { CircularProgress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { Search, Feather, Target, AlertTriangle, HelpCircle } from 'lucide-react';
import { MetricStatus } from '../../types/ragseal';

export interface MetricCardProps {
  title: string;
  metricKey: 'context_relevance' | 'faithfulness' | 'answer_accuracy' | string;
  score: number | null; // null when no ground truth available (status = REVIEW)
  threshold: number; // e.g. 0.70 or 70
  details?: string;
  target?: string;
  componentType?: 'Retriever' | 'Generator' | 'End-to-End';
  judgedBy?: 'model' | 'rule';
  sampleCount?: number;
  hallucinatedClaims?: string[];
  status?: MetricStatus;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  metricKey,
  score,
  threshold,
  details,
  componentType,
  judgedBy = 'model',
  sampleCount = 1,
  hallucinatedClaims,
  status,
  className,
}) => {
  const isNullScore = score === null;
  const normalizedScore = isNullScore ? 0 : score <= 1 ? score * 100 : score;
  const normalizedThreshold = threshold <= 1 ? threshold * 100 : threshold;
  
  const effectiveStatus: MetricStatus = status || (isNullScore ? 'REVIEW' : normalizedScore >= normalizedThreshold ? 'PASS' : 'FAIL');
  const isPass = effectiveStatus === 'PASS';
  const isReview = effectiveStatus === 'REVIEW' || effectiveStatus === 'UNCERTAIN';

  const getComponentIcon = () => {
    switch (componentType) {
      case 'Retriever':
        return <Search className="w-4 h-4 text-sky-400" />;
      case 'Generator':
        return <Feather className="w-4 h-4 text-teal-400" />;
      case 'End-to-End':
        return <Target className="w-4 h-4 text-indigo-400" />;
      default:
        return null;
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden border p-5 transition-all hover:border-neutral-700 flex flex-col justify-between',
        isPass
          ? 'bg-neutral-900/90 border-neutral-800'
          : isReview
          ? 'bg-amber-950/20 border-amber-900/40'
          : 'bg-rose-950/20 border-rose-900/40',
        className
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {componentType && (
              <div className="p-2 rounded-lg bg-black/40 border border-neutral-800 flex items-center justify-center">
                {getComponentIcon()}
              </div>
            )}
            <div>
              {componentType && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold block">
                  Component: {componentType} • {metricKey}
                </span>
              )}
              <h4 className="text-sm font-bold text-white tracking-tight">
                {title}
              </h4>
            </div>
          </div>

          <Badge
            variant={isPass ? 'success' : isReview ? 'warning' : 'danger'}
            size="sm"
            dot
          >
            {effectiveStatus}
          </Badge>
        </div>

        {/* Score & Gauge Section */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <div>
            {isNullScore ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-mono font-bold text-base">
                  <HelpCircle className="w-4 h-4" />
                  <span>No Ground Truth</span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400">
                  Target: &ge; {normalizedThreshold.toFixed(0)}% (Awaiting Benchmark)
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-mono font-bold text-white tracking-tight">
                    {normalizedScore.toFixed(0)}%
                  </span>
                  <span className="text-xs font-mono text-neutral-400">
                    ({(normalizedScore / 100).toFixed(2)})
                  </span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400 mt-0.5">
                  Target: &ge; {normalizedThreshold.toFixed(0)}%
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0">
            {isNullScore ? (
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-amber-600/60 flex items-center justify-center font-mono text-xs text-amber-400 bg-amber-950/20">
                N/A
              </div>
            ) : (
              <CircularProgress
                value={normalizedScore}
                size={64}
                strokeWidth={5}
                thresholdPass={normalizedThreshold}
                thresholdWarn={normalizedThreshold * 0.75}
              />
            )}
          </div>
        </div>

        {details && (
          <p className="text-xs text-neutral-300 leading-relaxed pt-1">
            {details}
          </p>
        )}

        {/* Hallucinated Claims Indicator if any */}
        {hallucinatedClaims && hallucinatedClaims.length > 0 && (
          <div className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-900/60 text-[11px] text-rose-300">
            <span className="font-semibold block mb-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              Hallucination Detected:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-rose-300/90 font-mono text-[10px]">
              {hallucinatedClaims.map((claim, idx) => (
                <li key={idx} className="truncate">"{claim}"</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="pt-3 mt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
        <span className="text-neutral-400">
          [{judgedBy === 'model' ? 'Model-Judged' : 'Rule-Judged'}]
        </span>
        <span className="text-neutral-400">
          n = {sampleCount}
        </span>
      </div>
    </Card>
  );
};
