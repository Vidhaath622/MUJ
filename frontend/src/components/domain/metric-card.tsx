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
        return <Search className="w-4 h-4 text-[#2F5D8A]" />;
      case 'Generator':
        return <Feather className="w-4 h-4 text-[#1F6F6A]" />;
      case 'End-to-End':
        return <Target className="w-4 h-4 text-[#2F5D8A]" />;
      default:
        return null;
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden border p-5 transition-all hover:border-[#E3DED3] flex flex-col justify-between',
        isPass
          ? 'bg-[#FBF9F4] border-[#E3DED3]'
          : isReview
          ? 'bg-[#F5EBD8] border-[#B26B00]/40'
          : 'bg-[#F6E3E0] border-[#B3261E]/40',
        className
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {componentType && (
              <div className="p-2 rounded-lg bg-[#F6F3EC] border border-[#E3DED3] flex items-center justify-center">
                {getComponentIcon()}
              </div>
            )}
            <div>
              {componentType && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#5E5B53] font-semibold block">
                  Component: {componentType} • {metricKey}
                </span>
              )}
              <h4 className="text-sm font-bold text-[#1B1B18] tracking-tight">
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
                <div className="flex items-center gap-1.5 text-[#B26B00] font-mono font-bold text-base">
                  <HelpCircle className="w-4 h-4" />
                  <span>No Ground Truth</span>
                </div>
                <div className="text-[11px] font-mono text-[#5E5B53]">
                  Target: &ge; {normalizedThreshold.toFixed(0)}% (Awaiting Benchmark)
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-mono font-bold text-[#1B1B18] tracking-tight">
                    {normalizedScore.toFixed(0)}%
                  </span>
                  <span className="text-xs font-mono text-[#5E5B53]">
                    ({(normalizedScore / 100).toFixed(2)})
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#5E5B53] mt-0.5">
                  Target: &ge; {normalizedThreshold.toFixed(0)}%
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0">
            {isNullScore ? (
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#B26B00]/40 flex items-center justify-center font-mono text-xs text-[#B26B00] bg-[#F5EBD8]">
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
          <p className="text-xs text-[#33322D] leading-relaxed pt-1">
            {details}
          </p>
        )}

        {/* Hallucinated Claims Indicator if any */}
        {hallucinatedClaims && hallucinatedClaims.length > 0 && (
          <div className="mt-2 p-2 rounded bg-[#F6E3E0] border border-[#B3261E]/40 text-[11px] text-[#B3261E]">
            <span className="font-semibold block mb-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-[#B3261E]" />
              Hallucination Detected:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[#B3261E] font-mono text-[10px]">
              {hallucinatedClaims.map((claim, idx) => (
                <li key={idx} className="truncate">"{claim}"</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="pt-3 mt-3 border-t border-[#E3DED3] flex items-center justify-between text-[11px] font-mono text-[#5E5B53]">
        <span className="text-[#5E5B53]">
          [{judgedBy === 'model' ? 'Model-Judged' : 'Rule-Judged'}]
        </span>
        <span className="text-[#5E5B53]">
          n = {sampleCount}
        </span>
      </div>
    </Card>
  );
};
