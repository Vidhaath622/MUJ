import React from 'react';
import { Card } from '../ui/card';
import { CircularProgress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

export interface MetricCardProps {
  title: string;
  metricKey: 'context_relevance' | 'faithfulness' | 'answer_accuracy' | string;
  score: number; // 0.0 to 1.0 or 0 to 100
  threshold: number; // e.g. 0.70 or 70
  details?: string;
  target?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  metricKey,
  score,
  threshold,
  details,
  target,
  className,
}) => {
  // Normalize to 0-100
  const normalizedScore = score <= 1 ? score * 100 : score;
  const normalizedThreshold = threshold <= 1 ? threshold * 100 : threshold;
  const isPass = normalizedScore >= normalizedThreshold;

  return (
    <Card
      className={cn(
        'relative overflow-hidden border p-5 transition-all hover:border-neutral-700',
        isPass
          ? 'bg-neutral-900/90 border-neutral-800'
          : 'bg-rose-950/20 border-rose-900/40',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              {metricKey}
            </span>
            <Badge
              variant={isPass ? 'success' : 'danger'}
              size="sm"
              dot
            >
              {isPass ? 'PASS' : 'FAIL'}
            </Badge>
          </div>

          <h4 className="text-base font-bold text-white tracking-tight">
            {title}
          </h4>

          {details && (
            <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed pt-1">
              {details}
            </p>
          )}

          <div className="pt-2 flex items-center gap-3 text-[11px] font-mono text-neutral-500">
            <span>
              Target: &ge; {normalizedThreshold.toFixed(0)}%
            </span>
            {target && <span>• Scope: {target}</span>}
          </div>
        </div>

        {/* Circular Gauge */}
        <div className="shrink-0">
          <CircularProgress
            value={normalizedScore}
            size={74}
            strokeWidth={6}
            thresholdPass={normalizedThreshold}
            thresholdWarn={normalizedThreshold * 0.75}
          />
        </div>
      </div>
    </Card>
  );
};
