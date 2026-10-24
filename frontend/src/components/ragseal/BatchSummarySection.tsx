import React, { useState } from 'react';
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
  BarChart2,
  ListFilter
} from 'lucide-react';
import { BatchSummary, RootCauseCategory } from '../../types/ragseal';

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
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

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

  const filteredResults = batch.results.filter((res) => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'PASS') return res.status === 'PASS';
    if (selectedFilter === 'FAIL') return res.status === 'FAIL';
    return res.category === selectedFilter;
  });

  const getCategoryBadge = (category: RootCauseCategory) => {
    switch (category) {
      case 'CLEAN_PASS':
        return <Badge variant="success" size="sm">CLEAN_PASS</Badge>;
      case 'RETRIEVAL_FAILURE':
        return <Badge variant="warning" size="sm">RETRIEVAL_FAILURE</Badge>;
      case 'GENERATION_HALLUCINATION':
        return <Badge variant="danger" size="sm">HALLUCINATION</Badge>;
      case 'COMPOUND_FAILURE':
        return <Badge variant="danger" size="sm">COMPOUND_FAIL</Badge>;
    }
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

      {/* Batch Test Case Table */}
      <Card variant="glass" className="p-5 border-neutral-800 bg-[#0c1017]/90 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-teal-400" />
              <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold">
                Batch Test Suite Cases ({batch.results.length} runs)
              </h4>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Click any row to inspect its side-by-side trace, retrieved chunks, and root-cause scorecard.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            {['ALL', 'PASS', 'FAIL', 'CLEAN_PASS', 'RETRIEVAL_FAILURE', 'GENERATION_HALLUCINATION', 'COMPOUND_FAILURE'].map((f) => (
              <button
                key={f}
                onClick={() => setSelectedFilter(f)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition border ${
                  selectedFilter === f
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 font-semibold'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-neutral-950 text-neutral-400 font-mono uppercase text-[10px] border-b border-neutral-800">
              <tr>
                <th className="py-2.5 px-3">Test ID</th>
                <th className="py-2.5 px-3">Query Probe</th>
                <th className="py-2.5 px-3">Root Cause Diagnosis</th>
                <th className="py-2.5 px-3 text-right">Context Rel.</th>
                <th className="py-2.5 px-3 text-right">Faithfulness</th>
                <th className="py-2.5 px-3 text-right">Accuracy</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80 bg-black/40">
              {filteredResults.map((tc) => {
                const isSelected = selectedCaseId === tc.test_id;
                return (
                  <tr
                    key={tc.test_id}
                    onClick={() => onSelectCase(tc.test_id)}
                    className={`cursor-pointer transition hover:bg-neutral-900/60 ${
                      isSelected ? 'bg-sky-950/30 border-l-2 border-l-sky-500' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-mono font-bold text-sky-300">
                      {tc.test_id}
                    </td>
                    <td className="py-3 px-3 max-w-[280px]">
                      <div className="font-medium text-neutral-200 truncate" title={tc.query}>
                        {tc.query}
                      </div>
                      {tc.summary_note && (
                        <div className="text-[11px] text-neutral-400 truncate">
                          {tc.summary_note}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {getCategoryBadge(tc.category)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-300">
                      <span className={tc.context_relevance >= 0.70 ? 'text-emerald-400' : 'text-rose-400'}>
                        {(tc.context_relevance * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-300">
                      <span className={tc.faithfulness >= 0.75 ? 'text-emerald-400' : 'text-rose-400'}>
                        {(tc.faithfulness * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-300">
                      <span className={tc.answer_accuracy >= 0.70 ? 'text-emerald-400' : 'text-rose-400'}>
                        {(tc.answer_accuracy * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={tc.status === 'PASS' ? 'success' : 'danger'} size="sm">
                        {tc.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-[11px] font-mono text-sky-400 hover:underline">
                        Inspect &rarr;
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
