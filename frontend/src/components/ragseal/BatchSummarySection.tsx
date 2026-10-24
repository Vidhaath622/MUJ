import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
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
  Users,
  History,
  Clock,
  Play,
  RotateCw,
  AlertCircle 
} from 'lucide-react';
import { BatchSummary, RunHistoryItem } from '../../types/ragseal';
import { EvaluationTable, EvaluationItem } from '../domain/evaluation-table';

interface BatchSummarySectionProps {
  batch: BatchSummary;
  selectedCaseId: string;
  onSelectCase: (caseId: string) => void;
  runHistory?: RunHistoryItem[];
  onLoadRun?: (batchId: string) => void;
  onRunBatch?: () => void;
  isBatchEvaluating?: boolean;
  batchElapsedSeconds?: number;
  batchError?: string | null;
  packName?: string;
}

export const BatchSummarySection: React.FC<BatchSummarySectionProps> = ({
  batch,
  selectedCaseId,
  onSelectCase,
  runHistory = [],
  onLoadRun,
  onRunBatch,
  isBatchEvaluating = false,
  batchElapsedSeconds = 0,
  batchError = null,
  packName = 'Active Pack',
}) => {
  const [showHistory, setShowHistory] = useState(false);

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
    {
      name: 'Needs Review',
      category: 'NEEDS_REVIEW',
      count: batch.root_cause_breakdown.NEEDS_REVIEW || 0,
      color: '#f97316', // orange-500
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
    type: r.type,
  }));

  const handleSelectTableRow = (item: EvaluationItem) => {
    onSelectCase(item.id);
  };

  const ja = batch.judge_agreement;

  return (
    <div className="space-y-6">
      {/* Note #5: Slow Batch Progress State */}
      {isBatchEvaluating && (
        <Card variant="glass" className="p-4 border-teal-800 bg-teal-950/40 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-teal-300 font-bold flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-teal-400 animate-spin" />
              <span>Evaluating pack cases across {packName} (~60s)...</span>
            </span>
            <span className="text-teal-400 font-bold">
              {batchElapsedSeconds}s elapsed / ~60s estimated
            </span>
          </div>
          <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-neutral-800">
            <div
              className="bg-gradient-to-r from-teal-500 to-sky-400 h-full transition-all duration-300"
              style={{ width: `${Math.min(95, Math.max(5, (batchElapsedSeconds / 60) * 100))}%` }}
            />
          </div>
          <div className="text-[11px] text-neutral-400 font-mono flex items-center justify-between">
            <span>Running local generator (llama3.2:3b) + judge model...</span>
            <span className="text-neutral-500">Request timeout: 180s</span>
          </div>
        </Card>
      )}

      {/* Note #2: Real Error Message Display */}
      {batchError && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-xs font-mono text-rose-300 flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-white block">Batch Evaluation Error:</span>
            <span>{batchError}</span>
          </div>
        </div>
      )}

      {/* Aggregates Top Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
            Target: &ge; 80% to Ship
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

        {/* Judge Agreement Metric Card */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-purple-400 flex items-center gap-1">
            <Users className="w-3 h-3 text-purple-400" />
            Judge Agreement
          </span>
          <div className="flex items-baseline gap-2 my-2">
            {ja ? (
              <>
                <span className="text-2xl font-bold font-mono text-purple-300">
                  {(ja.agreement * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] font-mono text-neutral-500">
                  (n={ja.n})
                </span>
              </>
            ) : (
              <span className="text-xs font-mono text-neutral-500">Not measured yet</span>
            )}
          </div>
          <div className="text-[10px] font-mono text-neutral-400">
            {ja ? `FP: ${ja.false_pass} | FN: ${ja.false_fail}` : 'Human labels pending'}
          </div>
        </Card>

        {/* Release Gate Verdict */}
        <Card variant="glass" className="p-4 border-neutral-800 bg-[#0c1017]/90 flex flex-col justify-between">
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
              Pack: {batch.pack_id?.toUpperCase() || 'RECRUITMENT'} (n = {batch.total_evaluated})
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
            <span>Diagnoses backed by Causal Gold Replay experiments</span>
            <span>Duration: {batch.duration_ms ? `${(batch.duration_ms / 1000).toFixed(1)}s` : '38.4s'}</span>
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

          {/* Batch Run & Past Run History Actions */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap">
            <Button
              variant="default"
              size="xs"
              onClick={onRunBatch}
              disabled={isBatchEvaluating}
              className="bg-teal-600 hover:bg-teal-500 text-white font-mono text-xs gap-1.5"
            >
              {isBatchEvaluating ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>Evaluating ({batchElapsedSeconds}s)...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run Pack Suite</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="xs"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs font-mono gap-1"
            >
              <History className="w-3 h-3 text-neutral-400" />
              <span>{showHistory ? 'Hide Runs' : `Past Runs (${runHistory.length})`}</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* Past Run History Section if toggled */}
      {showHistory && runHistory.length > 0 && (
        <Card variant="glass" className="p-4 border-neutral-800 bg-neutral-950/90 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-2">
            <span className="font-bold text-white uppercase flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              User Run History (`GET /api/runs`)
            </span>
            <span>Saved in SQLite</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {runHistory.map((run) => (
              <div
                key={run.batch_id}
                onClick={() => onLoadRun?.(run.batch_id)}
                className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-teal-700 cursor-pointer transition text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-teal-400 font-bold">{run.batch_id}</span>
                  <Badge variant="outline" size="sm" className="text-[10px]">
                    {run.pack_id.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-neutral-300">
                  Pass Rate: <span className="font-bold">{(run.pass_rate * 100).toFixed(0)}%</span> ({run.total_evaluated} cases)
                </div>
                <div className="text-[10px] text-neutral-500">
                  {new Date(run.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Component Library: EvaluationTable */}
      <EvaluationTable
        items={tableItems}
        selectedId={selectedCaseId}
        onSelectRow={handleSelectTableRow}
      />
    </div>
  );
};
