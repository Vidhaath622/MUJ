import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  CartesianGrid 
} from 'recharts';
import { 
  ShieldAlert, 
  BarChart2
} from 'lucide-react';
import { BatchSummary } from '../../types/ragseal';
import { EvaluationTable, EvaluationItem } from '../domain/evaluation-table';

interface BatchSummarySectionProps {
  batch: BatchSummary;
  selectedCaseId: string;
  onSelectCase: (caseId: string) => void;
  onRunBatchAgain?: () => void;
}

export const BatchSummarySection: React.FC<BatchSummarySectionProps> = ({
  batch,
  selectedCaseId,
  onSelectCase,
}) => {
  // Chart data from batch root_cause_breakdown
  const chartData = [
    {
      name: 'Clean Pass',
      category: 'CLEAN_PASS',
      count: batch.root_cause_breakdown.CLEAN_PASS || 0,
      color: '#10b981', // emerald-500
    },
    {
      name: 'Retrieval Miss',
      category: 'RETRIEVAL_FAILURE',
      count: batch.root_cause_breakdown.RETRIEVAL_FAILURE || 0,
      color: '#f59e0b', // amber-500
    },
    {
      name: 'Hallucination',
      category: 'GENERATION_HALLUCINATION',
      count: batch.root_cause_breakdown.GENERATION_HALLUCINATION || 0,
      color: '#f43f5e', // rose-500
    },
    {
      name: 'Compound Fail',
      category: 'COMPOUND_FAILURE',
      count: batch.root_cause_breakdown.COMPOUND_FAILURE || 0,
      color: '#ef4444', // red-500
    },
  ];

  // Map batch.results into EvaluationItem format expected by EvaluationTable
  const tableItems: EvaluationItem[] = batch.results.map((r) => ({
    id: r.test_id,
    query: r.query,
    retrieverScore: r.context_relevance,
    faithfulnessScore: r.faithfulness,
    accuracyScore: r.answer_accuracy,
    diagnosis: r.category,
    status: r.status,
    summaryNote: r.summary_note,
  }));

  const handleSelectTableRow = (item: EvaluationItem) => {
    onSelectCase(item.id);
  };

  return (
    <div className="space-y-6">
      {/* Aggregates Top Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Pass Rate */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
            Suite Pass Rate
          </span>
          <div className="flex items-baseline gap-2 my-2">
            <span className={`text-2xl font-bold font-mono ${batch.aggregates.pass_rate >= 0.70 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(batch.aggregates.pass_rate * 100).toFixed(0)}%
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              ({batch.results.filter(r => r.status === 'PASS').length}/{batch.total_evaluated})
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400">
            Threshold: &ge; 80% to Ship
          </div>
        </Card>

        {/* Avg Context Relevance */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400">
            Avg Context Relevance
          </span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-2xl font-bold font-mono text-white">
              {(batch.aggregates.avg_context_relevance * 100).toFixed(0)}%
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              ({batch.aggregates.avg_context_relevance.toFixed(2)})
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400">
            Target: &ge; 70%
          </div>
        </Card>

        {/* Avg Faithfulness */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-teal-400">
            Avg Faithfulness
          </span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-2xl font-bold font-mono text-white">
              {(batch.aggregates.avg_faithfulness * 100).toFixed(0)}%
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              ({batch.aggregates.avg_faithfulness.toFixed(2)})
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400">
            Target: &ge; 75%
          </div>
        </Card>

        {/* Avg Answer Accuracy */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-indigo-400">
            Avg Accuracy
          </span>
          <div className="flex items-baseline gap-2 my-2">
            <span className="text-2xl font-bold font-mono text-white">
              {(batch.aggregates.avg_answer_accuracy * 100).toFixed(0)}%
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              ({batch.aggregates.avg_answer_accuracy.toFixed(2)})
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400">
            Target: &ge; 70%
          </div>
        </Card>

        {/* Release Gate Verdict */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 col-span-2 sm:col-span-1 flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
            Release Gate
          </span>
          <div className="my-2">
            <Badge
              variant={batch.release.decision === 'SHIP' ? 'success' : batch.release.decision === 'REVIEW' ? 'warning' : 'danger'}
              size="default"
              dot
            >
              GATE: {batch.release.decision}
            </Badge>
          </div>
          <div className="text-[10px] font-mono text-neutral-400 truncate">
            {batch.release.rule}
          </div>
        </Card>
      </div>

      {/* Breakdown Chart & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recharts Bar Chart: Failure Distribution */}
        <Card variant="glass" className="p-5 border-neutral-800 bg-[#0c1017]/90 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold">
                Root-Cause Failure Distribution
              </h4>
            </div>
            <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
              [DEMO DATASET: ATS BENCHMARK v1] (n = {batch.total_evaluated})
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" opacity={0.6} />
                <XAxis 
                  dataKey="name" 
                  stroke="#737373" 
                  fontSize={11} 
                  tickLine={false} 
                  fontFamily="monospace"
                />
                <YAxis 
                  stroke="#737373" 
                  fontSize={11} 
                  tickLine={false} 
                  fontFamily="monospace"
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-700 shadow-xl text-xs font-mono">
                          <p className="font-bold text-white mb-1">{data.name}</p>
                          <p className="text-neutral-300">Count: <span className="font-bold text-teal-400">{data.count} cases</span></p>
                          <p className="text-neutral-400 text-[10px] mt-0.5">Category: {data.category}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-800">
            <span>Diagnoses are model-judged against ground-truth labels</span>
            <span>Zero synthetic counters: real evaluation counts</span>
          </div>
        </Card>

        {/* Release Gate Evidence & Action Summary */}
        <Card variant="glass" className="p-5 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold">
                Pipeline Gate Audit
              </h4>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
              <div className="text-xs font-mono text-neutral-400">Gate Policy:</div>
              <div className="text-xs font-medium text-white">{batch.release.rule}</div>
            </div>

            <div className="mt-3 space-y-2">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
                Audit Evidence:
              </span>
              <ul className="space-y-1.5 text-xs text-neutral-300 font-mono">
                {batch.release.evidence.map((ev, idx) => (
                  <li key={idx} className="flex items-center gap-2 bg-neutral-900/60 p-2 rounded border border-neutral-800 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0"></span>
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-800 text-[11px] font-mono text-neutral-500">
            <span>Evaluator: RAGSeal Core Engine v1.0</span>
          </div>
        </Card>
      </div>

      {/* Component Library: EvaluationTable */}
      <EvaluationTable
        items={tableItems}
        selectedId={selectedCaseId}
        onSelectRow={handleSelectTableRow}
      />
    </div>
  );
};
