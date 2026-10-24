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
          textColor: 'text-[#1F7A4D]',
          bgColor: 'bg-[#E6F0E8] border-[#1F7A4D]/40',
        };
      case 'REVIEW':
        return {
          label: 'REVIEW',
          icon: ShieldAlert,
          textColor: 'text-[#B26B00]',
          bgColor: 'bg-[#F5EBD8] border-[#B26B00]/40',
        };
      case 'BLOCK':
        return {
          label: 'BLOCK',
          icon: ShieldX,
          textColor: 'text-[#B3261E]',
          bgColor: 'bg-[#F6E3E0] border-[#B3261E]/40',
        };
    }
  };

  const releaseConfig = release ? getReleaseConfig(release.decision) : null;

  return (
    <Card
      variant="default"
      className="relative overflow-hidden border border-[#E3DED3] bg-[#F6F3EC]/95 p-5 md:p-6 shadow-xl space-y-4"
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Category & Explanation */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#5E5B53] font-semibold">
              Root Cause Diagnosis:
            </span>
            <DiagnosticBadge
              category={diagnosis.category as RootCauseCategory}
              size="md"
              pulse
            />
          </div>

          <div className="text-sm md:text-base text-[#1B1B18] font-medium leading-relaxed bg-[#F6F3EC] p-3.5 rounded-xl border border-[#E3DED3]">
            {diagnosis.summary}
          </div>

          {/* Actionable Engineering Remediation */}
          <div className="flex items-start gap-2.5 text-xs text-[#33322D] bg-[#FBF9F4] p-3 rounded-lg border border-[#E3DED3]">
            <Wrench className="w-4 h-4 text-[#2F5D8A] mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-[#2F5D8A] font-mono text-[11px] uppercase tracking-wider block mb-0.5">
                Recommended Remediation:
              </span>
              <p className="leading-relaxed text-[#33322D]">{diagnosis.recommended_action}</p>
            </div>
          </div>

          {/* Evidence Notes if any */}
          {diagnosis.evidence_notes && diagnosis.evidence_notes.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#5E5B53] flex-wrap">
              <span className="text-[#6E6A62]">Evidence notes:</span>
              {diagnosis.evidence_notes.map((note, idx) => (
                <span key={idx} className="bg-[#FBF9F4] px-2 py-0.5 rounded border border-[#E3DED3] text-[#33322D]">
                  {note}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Release Gate Decision & Metadata */}
        <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 border-t md:border-t-0 md:border-l border-[#E3DED3] pt-3 md:pt-0 md:pl-5 md:min-w-[220px]">
          {/* Release Verdict */}
          {releaseConfig && release && (
            <div className="w-full text-left md:text-right">
              <span className="text-[10px] font-mono text-[#5E5B53] uppercase tracking-wider block mb-1">
                Release Gate Decision
              </span>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm ${releaseConfig.bgColor} ${releaseConfig.textColor}`}>
                <releaseConfig.icon className="w-4 h-4" />
                <span>VERDICT: {releaseConfig.label}</span>
              </div>
              <p className="text-[11px] text-[#5E5B53] mt-1 max-w-[200px] leading-tight md:ml-auto">
                {release.rule}
              </p>
            </div>
          )}

          {/* Evaluation Mode & Trace Metadata */}
          <div className="text-left md:text-right space-y-1 text-[11px] font-mono text-[#5E5B53] mt-auto">
            <div>
              <span className="text-[#6E6A62]">Eval Mode: </span>
              <Badge variant="outline" size="sm" className="font-mono text-[#1F6F6A] border-[#1F6F6A]/40 bg-[#E2EFEC]">
                {evaluationMode.toUpperCase()}
              </Badge>
            </div>
            {latencyMs && (
              <div>
                <span className="text-[#6E6A62]">Latency: </span>
                <span className="text-[#33322D]">{latencyMs} ms</span>
              </div>
            )}
            {evaluationId && (
              <div className="text-[10px] text-[#6E6A62]">
                id: {evaluationId}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HERO REPLAY EXPERIMENT (When replay is available) */}
      {replay && (
        <div className="p-4 rounded-xl bg-[#ECE6F3] border border-[#6B4C9A]/40 space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#6B4C9A]" />
              <span className="text-xs font-mono font-bold text-[#6B4C9A] uppercase tracking-wider">
                Causal Replay Experiment (Hero Proof)
              </span>
              <Badge variant="neon" size="sm">
                LAB EXPERIMENT
              </Badge>
            </div>

            <div className="text-[11px] font-mono text-[#5E5B53] flex items-center gap-2">
              <span>Replay Accuracy:</span>
              <span className="text-[#6B4C9A] font-bold">
                {replay.answer_accuracy ? `${(replay.answer_accuracy * 100).toFixed(0)}%` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="text-xs text-[#1B1B18] bg-[#F6F3EC] p-2.5 rounded-lg border border-[#6B4C9A]/40 leading-relaxed font-sans">
            <strong className="text-[#6B4C9A] font-mono">Causal Finding: </strong>
            {replay.verdict_effect}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono pt-1">
            {/* Original Output */}
            <div className="p-3 rounded-lg bg-[#F6F3EC] border border-[#E3DED3] space-y-1">
              <span className="text-[10px] uppercase text-[#B3261E] font-bold flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Original System Output (With Retrieval Flaw):
              </span>
              <p className="text-[#33322D] line-clamp-3 text-[11px]">{originalAnswer || 'Original response'}</p>
            </div>

            {/* Replay Output */}
            <div className="p-3 rounded-lg bg-[#E6F0E8] border border-[#1F7A4D]/40 space-y-1">
              <span className="text-[10px] uppercase text-[#1F7A4D] font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Replay Output (With Forced Gold Passage Only):
              </span>
              <p className="text-[#1B1B18] line-clamp-3 text-[11px]">{replay.answer}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
