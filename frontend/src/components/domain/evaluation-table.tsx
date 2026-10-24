import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { DiagnosticBadge } from './diagnostic-badge';
import { RootCauseCategory, MetricStatus } from '../../types/ragseal';
import { cn } from '../../lib/utils';
import { ChevronRight, ListFilter } from 'lucide-react';

export interface EvaluationItem {
  id: string;
  query: string;
  retrieverScore: number;
  faithfulnessScore: number;
  accuracyScore: number | null;
  diagnosis: RootCauseCategory;
  latencyMs?: number;
  status?: MetricStatus;
  summaryNote?: string;
  type?: string;
}

export interface EvaluationTableProps {
  items: EvaluationItem[];
  selectedId?: string;
  onSelectRow?: (item: EvaluationItem) => void;
  className?: string;
}

export const EvaluationTable: React.FC<EvaluationTableProps> = ({
  items,
  selectedId,
  onSelectRow,
  className,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  const filteredItems = items.filter((item) => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'PASS') return item.status === 'PASS';
    if (selectedFilter === 'FAIL') return item.status === 'FAIL';
    if (selectedFilter === 'REVIEW') return item.status === 'REVIEW';
    return item.diagnosis === selectedFilter;
  });

  return (
    <Card className={cn('bg-[var(--panel)] border-[var(--rule)] overflow-hidden shadow-xl space-y-2', className)}>
      <div className="p-4 border-b border-[var(--rule)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-[var(--teal)]" />
          <span className="font-bold text-[var(--ink)] font-mono uppercase tracking-wider">
            Evaluation Batch Test Suite ({items.length} Cases)
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {['ALL', 'PASS', 'FAIL', 'REVIEW', 'CLEAN_PASS', 'RETRIEVAL_FAILURE', 'GENERATION_HALLUCINATION', 'COMPOUND_FAILURE', 'NEEDS_REVIEW'].map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFilter(f)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition border ${
                selectedFilter === f
                  ? 'bg-[var(--accent)] text-[var(--accent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] font-semibold'
                  : 'bg-[var(--panel)] text-[var(--ink-2)] border-[var(--rule)] hover:text-[var(--ink)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead className="bg-[var(--panel)] font-mono uppercase text-[var(--ink-2)] text-[10px] border-b border-[var(--rule)] tracking-wider">
            <tr>
              <th className="py-3 px-4">Test ID / Query</th>
              <th className="py-3 px-3 text-center">Retriever</th>
              <th className="py-3 px-3 text-center">Faithfulness</th>
              <th className="py-3 px-3 text-center">Accuracy</th>
              <th className="py-3 px-4">Diagnosis</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:color-mix(in_srgb,var(--rule)_80%,transparent)] bg-[var(--paper)]">
            {filteredItems.map((item) => {
              const isSelected = selectedId === item.id;
              const retPass = item.retrieverScore >= 0.7;
              const faithPass = item.faithfulnessScore >= 0.75;
              const accPass = item.accuracyScore !== null ? item.accuracyScore >= 0.7 : null;

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectRow?.(item)}
                  className={cn(
                    'hover:bg-[var(--panel)] transition cursor-pointer group',
                    isSelected && 'bg-[var(--accent-tint)] border-l-2 border-l-sky-500'
                  )}
                >
                  <td className="py-3.5 px-4 font-medium text-[var(--ink)] max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--accent)] font-bold bg-[var(--accent-tint)] px-1.5 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]">
                        {item.id}
                      </span>
                      <span className="truncate" title={item.query}>{item.query}</span>
                    </div>
                    {item.summaryNote && (
                      <div className="text-[11px] text-[var(--ink-2)] truncate pl-1 mt-0.5">
                        {item.summaryNote}
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', retPass ? 'text-[var(--ok)]' : 'text-[var(--gen)]')}>
                      {(item.retrieverScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', faithPass ? 'text-[var(--ok)]' : 'text-[var(--gen)]')}>
                      {(item.faithfulnessScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    {item.accuracyScore === null ? (
                      <span className="text-[var(--retr)] font-medium text-[11px] bg-[var(--retr-tint)] px-1.5 py-0.5 rounded border border-[color:color-mix(in_srgb,var(--retr)_40%,transparent)]">
                        REVIEW (No GT)
                      </span>
                    ) : (
                      <span className={cn('font-bold', accPass ? 'text-[var(--ok)]' : 'text-[var(--gen)]')}>
                        {(item.accuracyScore * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <DiagnosticBadge category={item.diagnosis} size="sm" />
                  </td>

                  <td className="py-3.5 px-3 text-center">
                    {item.status && (
                      <Badge
                        variant={item.status === 'PASS' ? 'success' : item.status === 'REVIEW' ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {item.status}
                      </Badge>
                    )}
                  </td>

                  <td className="py-3.5 px-3 text-right">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="group-hover:text-[var(--accent)] group-hover:bg-[var(--panel)]"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
