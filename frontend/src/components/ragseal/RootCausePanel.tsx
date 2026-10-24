import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { DiagnosticBadge } from '../domain/diagnostic-badge';
import { 
  Wrench, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX,
  FlaskConical,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { RootCauseCategory, ReleaseDecision, RootCauseDiagnosis, ReleaseGate, EvaluationMode, Replay } from '../../types/ragseal';

interface RootCausePanelProps {
  diagnosis: RootCauseDiagnosis;
  release?: ReleaseGate;
  evaluationMode?: EvaluationMode;
  evaluationId?: string;
  latencyMs?: number;
  replay?: Replay | null;
  originalAnswer?: string;
}

export const RootCausePanel: React.FC<RootCausePanelProps> = ({
  diagnosis,
  release,
  evaluationMode = 'local',
  evaluationId,
  latencyMs,
  replay,
  originalAnswer,
}) => {
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

  const releaseConfig = release ? getReleaseConfig(release.decision) : null;

  return (
    <Card
      variant="default"
      className="relative overflow-hidden border border-neutral-800 bg-[#0c1017]/95 p-5 md:p-6 shadow-xl space-y-4"
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Category & Explanation */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              Root Cause Diagnosis:
            </span>
            <DiagnosticBadge
              category={diagnosis.category as RootCauseCategory}
              size="md"
              pulse
            />
          </div>

          <div className="text-sm md:text-base text-neutral-200 font-medium leading-relaxed bg-black/40 p-3.5 rounded-xl border border-neutral-800/80">
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
            <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400 flex-wrap">
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
              <Badge variant="outline" size="sm" className="font-mono text-teal-400 border-teal-800 bg-teal-950/40">
                {evaluationMode.toUpperCase()}
              </Badge>
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

      {/* HERO REPLAY EXPERIMENT (When replay is available) */}
      {replay && (
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/70 space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-mono font-bold text-purple-200 uppercase tracking-wider">
                Causal Replay Experiment (Hero Proof)
              </span>
              <Badge variant="neon" size="sm">
                LAB EXPERIMENT
              </Badge>
            </div>

            <div className="text-[11px] font-mono text-neutral-400 flex items-center gap-2">
              <span>Replay Accuracy:</span>
              <span className="text-purple-300 font-bold">
                {replay.answer_accuracy ? `${(replay.answer_accuracy * 100).toFixed(0)}%` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="text-xs text-neutral-200 bg-black/40 p-2.5 rounded-lg border border-purple-900/40 leading-relaxed font-sans">
            <strong className="text-purple-300 font-mono">Causal Finding: </strong>
            {replay.verdict_effect}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono pt-1">
            {/* Original Output */}
            <div className="p-3 rounded-lg bg-black/60 border border-neutral-800 space-y-1">
              <span className="text-[10px] uppercase text-rose-400 font-bold flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Original System Output (With Retrieval Flaw):
              </span>
              <p className="text-neutral-300 line-clamp-3 text-[11px]">{originalAnswer || 'Original response'}</p>
            </div>

            {/* Replay Output */}
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 space-y-1">
              <span className="text-[10px] uppercase text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Replay Output (With Forced Gold Passage Only):
              </span>
              <p className="text-neutral-200 line-clamp-3 text-[11px]">{replay.answer}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
