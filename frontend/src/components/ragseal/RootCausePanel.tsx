import React from 'react';
import { Card } from '../ui/card';
import { 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  Wrench, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX
} from 'lucide-react';
import { RootCauseCategory, ReleaseDecision, RootCauseDiagnosis, ReleaseGate, EvaluationMode } from '../../types/ragseal';

interface RootCausePanelProps {
  diagnosis: RootCauseDiagnosis;
  release?: ReleaseGate;
  evaluationMode?: EvaluationMode;
  evaluationId?: string;
  latencyMs?: number;
}

export const RootCausePanel: React.FC<RootCausePanelProps> = ({
  diagnosis,
  release,
  evaluationMode = 'llm',
  evaluationId,
  latencyMs,
}) => {
  const getCategoryConfig = (category: RootCauseCategory) => {
    switch (category) {
      case 'CLEAN_PASS':
        return {
          label: 'CLEAN PASS',
          subtitle: 'Retriever & Generator Both Succeeded',
          icon: CheckCircle2,
          border: 'border-emerald-700/60',
          bg: 'from-emerald-950/40 via-neutral-900/40 to-neutral-950',
          pillColor: 'text-emerald-400 bg-emerald-950/80 border-emerald-800',
        };
      case 'RETRIEVAL_FAILURE':
        return {
          label: 'RETRIEVAL FAILURE',
          subtitle: 'Retriever Missed Necessary Context (Generator Omission)',
          icon: AlertTriangle,
          border: 'border-amber-700/60',
          bg: 'from-amber-950/40 via-neutral-900/40 to-neutral-950',
          pillColor: 'text-amber-400 bg-amber-950/80 border-amber-800',
        };
      case 'GENERATION_HALLUCINATION':
        return {
          label: 'GENERATION HALLUCINATION',
          subtitle: 'Retriever Succeeded, Generator Fabricated Unsupported Claims',
          icon: AlertOctagon,
          border: 'border-rose-700/60',
          bg: 'from-rose-950/40 via-neutral-900/40 to-neutral-950',
          pillColor: 'text-rose-400 bg-rose-950/80 border-rose-800',
        };
      case 'COMPOUND_FAILURE':
        return {
          label: 'COMPOUND FAILURE',
          subtitle: 'Both Retrieval & Generation Failed Concurrently',
          icon: AlertOctagon,
          border: 'border-red-600',
          bg: 'from-red-950/50 via-neutral-900/50 to-neutral-950',
          pillColor: 'text-red-400 bg-red-950 border-red-800',
        };
    }
  };

  const getReleaseConfig = (decision: ReleaseDecision) => {
    switch (decision) {
      case 'SHIP':
        return {
          label: 'SHIP',
          icon: ShieldCheck,
          textColor: 'text-emerald-400',
          bgColor: 'bg-emerald-950/60 border-emerald-700/80',
        };
      case 'REVIEW':
        return {
          label: 'REVIEW',
          icon: ShieldAlert,
          textColor: 'text-amber-400',
          bgColor: 'bg-amber-950/60 border-amber-700/80',
        };
      case 'BLOCK':
        return {
          label: 'BLOCK',
          icon: ShieldX,
          textColor: 'text-rose-400',
          bgColor: 'bg-rose-950/60 border-rose-700/80',
        };
    }
  };

  const config = getCategoryConfig(diagnosis.category);
  const releaseConfig = release ? getReleaseConfig(release.decision) : null;
  const CategoryIcon = config.icon;

  return (
    <Card
      variant="default"
      className={`relative overflow-hidden border bg-gradient-to-r ${config.bg} ${config.border} p-5 md:p-6 shadow-xl`}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Category & Explanation */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              Root Cause Diagnosis:
            </span>
            <div className={`px-2.5 py-0.5 rounded-full border text-xs font-mono font-bold flex items-center gap-1.5 ${config.pillColor}`}>
              <CategoryIcon className="w-3.5 h-3.5" />
              <span>{config.label}</span>
            </div>
            <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
              — {config.subtitle}
            </span>
          </div>

          <div className="text-sm md:text-base text-neutral-200 font-medium leading-relaxed bg-black/30 p-3.5 rounded-xl border border-neutral-800/80">
            {diagnosis.summary}
          </div>

          {/* Actionable Engineering Remediation */}
          <div className="flex items-start gap-2.5 text-xs text-neutral-300 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
            <Wrench className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-sky-300 font-mono text-[11px] uppercase tracking-wider block mb-0.5">
                Recommended Remediation:
              </span>
              <p className="leading-relaxed text-neutral-300">{diagnosis.recommended_action}</p>
            </div>
          </div>

          {/* Evidence Notes if any */}
          {diagnosis.evidence_notes && diagnosis.evidence_notes.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
              <span className="text-neutral-500">Evidence notes:</span>
              {diagnosis.evidence_notes.map((note, idx) => (
                <span key={idx} className="bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 text-neutral-300">
                  {note}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Release Gate Decision & Metadata */}
        <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 border-t md:border-t-0 md:border-l border-neutral-800/80 pt-3 md:pt-0 md:pl-5 md:min-w-[220px]">
          {/* Release Verdict */}
          {releaseConfig && release && (
            <div className="w-full text-left md:text-right">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                Release Gate Decision
              </span>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm ${releaseConfig.bgColor} ${releaseConfig.textColor}`}>
                <releaseConfig.icon className="w-4 h-4" />
                <span>VERDICT: {releaseConfig.label}</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1 max-w-[200px] leading-tight md:ml-auto">
                {release.rule}
              </p>
            </div>
          )}

          {/* Evaluation Mode & Trace Metadata */}
          <div className="text-left md:text-right space-y-1 text-[11px] font-mono text-neutral-400 mt-auto">
            <div>
              <span className="text-neutral-500">Eval Mode: </span>
              <span className="text-teal-400 font-semibold uppercase">{evaluationMode}</span>
            </div>
            {latencyMs && (
              <div>
                <span className="text-neutral-500">Latency: </span>
                <span className="text-neutral-300">{latencyMs} ms</span>
              </div>
            )}
            {evaluationId && (
              <div className="text-[10px] text-neutral-500">
                id: {evaluationId}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
