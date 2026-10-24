import React from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { DiagnosticBadge, RootCauseCategory } from './diagnostic-badge';
import { cn } from '../../lib/utils';
import { ChevronRight } from 'lucide-react';

export interface EvaluationItem {
  id: string;
  query: string;
  retrieverScore: number;
  faithfulnessScore: number;
  accuracyScore: number;
  diagnosis: RootCauseCategory;
  latencyMs?: number;
}

export interface EvaluationTableProps {
  items: EvaluationItem[];
  onSelectRow?: (item: EvaluationItem) => void;
  className?: string;
}

export const EvaluationTable: React.FC<EvaluationTableProps> = ({
  items,
  onSelectRow,
  className,
}) => {
  return (
    <Card className={cn('bg-neutral-900/90 border-neutral-800 overflow-hidden shadow-xl', className)}>
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white font-mono uppercase tracking-wider">
            Evaluation Batch Test Run ({items.length} Cases)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 font-mono text-[11px]">
            Sorted by Execution Order
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead className="bg-neutral-950/80 font-mono uppercase text-neutral-400 text-[10px] border-b border-neutral-800 tracking-wider">
            <tr>
              <th className="py-3 px-4">Test Case / Query</th>
              <th className="py-3 px-3 text-center">Retriever</th>
              <th className="py-3 px-3 text-center">Faithfulness</th>
              <th className="py-3 px-3 text-center">Accuracy</th>
              <th className="py-3 px-4">Diagnosis</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80">
            {items.map((item) => {
              const retPass = item.retrieverScore >= 0.7;
              const faithPass = item.faithfulnessScore >= 0.75;
              const accPass = item.accuracyScore >= 0.7;

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectRow?.(item)}
                  className="hover:bg-neutral-800/50 transition cursor-pointer group"
                >
                  <td className="py-3.5 px-4 font-medium text-neutral-200 max-w-xs truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-500">{item.id}</span>
                      <span className="truncate">{item.query}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', retPass ? 'text-emerald-400' : 'text-rose-400')}>
                      {(item.retrieverScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', faithPass ? 'text-emerald-400' : 'text-rose-400')}>
                      {(item.faithfulnessScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-3 text-center font-mono">
                    <span className={cn('font-bold', accPass ? 'text-emerald-400' : 'text-rose-400')}>
                      {(item.accuracyScore * 100).toFixed(0)}%
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <DiagnosticBadge category={item.diagnosis} size="sm" />
                  </td>

                  <td className="py-3.5 px-3 text-right">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="group-hover:text-sky-400 group-hover:bg-neutral-800"
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
