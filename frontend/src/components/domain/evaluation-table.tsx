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
    <Card className={cn('bg-[#FBF9F4] border-[#E3DED3] overflow-hidden shadow-xl space-y-2', className)}>
      <div className="p-4 border-b border-[#E3DED3] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-[#1F6F6A]" />
          <span className="font-bold text-[#1B1B18] font-mono uppercase tracking-wider">
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
                  ? 'bg-[#2F5D8A] text-[#2F5D8A] border-[#2F5D8A]/40 font-semibold'
                  : 'bg-[#FBF9F4] text-[#5E5B53] border-[#E3DED3] hover:text-[#1B1B18]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead className="bg-[#FBF9F4] font-mono uppercase text-[#5E5B53] text-[10px] border-b border-[#E3DED3] tracking-wider">
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
          <tbody className="divide-y divide-[#E3DED3]/80 bg-[#F6F3EC]">
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
                    'hover:bg-[#FBF9F4] transition cursor-pointer group',
                    isSelected && 'bg-[#E3EAF2] border-l-2 border-l-sky-500'
                  )}
                >
                  <td className="py-3.5 px-4 font-medium text-[#1B1B18] max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#2F5D8A] font-bold bg-[#E3EAF2] px-1.5 py-0.5 rounded border border-[#2F5D8A]/40">
                        {item.id}
                      </span>
                      <span className="truncate" title={item.query}>{item.query}</span>
                    </div>
                    {item.summaryNote && (
                      <div className="text-[11px] text-[#5E5B53] truncate pl-1 mt-0.5">
                        {item.summaryNote}
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', retPass ? 'text-[#1F7A4D]' : 'text-[#B3261E]')}>
                      {(item.retrieverScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', faithPass ? 'text-[#1F7A4D]' : 'text-[#B3261E]')}>
                      {(item.faithfulnessScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    {item.accuracyScore === null ? (
                      <span className="text-[#B26B00] font-medium text-[11px] bg-[#F5EBD8] px-1.5 py-0.5 rounded border border-[#B26B00]/40">
                        REVIEW (No GT)
                      </span>
                    ) : (
                      <span className={cn('font-bold', accPass ? 'text-[#1F7A4D]' : 'text-[#B3261E]')}>
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
                      className="group-hover:text-[#2F5D8A] group-hover:bg-[#FBF9F4]"
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
