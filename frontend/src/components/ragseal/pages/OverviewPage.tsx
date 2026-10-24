import React, { useEffect, useState } from 'react';
import { ArrowRight, ListChecks } from 'lucide-react';
import { PackId } from '../../../types/ragseal';
import { HealthResponse } from '../../../lib/api';
import { getRun, listRuns, RunSummary } from '../shared/apiExtra';
import { LoadState, PACKS } from '../shared/ui';
import { RagFigure } from '../shared/RagFigure';
import { DiagnosisTree } from '../shared/Diagrams';
import { StartStory } from '../story/StartStory';

interface OverviewPageProps {
  token: string | null;
  health: HealthResponse | null;
  onOpenPack: (packId: PackId) => void;
  onNavigate: (route: 'bots' | 'diagnose' | 'runs' | 'trust') => void;
  onOpenDocuments?: () => void;
  onOpenGenerator?: () => void;
}

type Latest = Partial<Record<PackId, RunSummary>>;

/** Start here: follow one real question through the pipeline, then the latest results and where to go next. */
export const OverviewPage: React.FC<OverviewPageProps> = ({ token, health, onOpenPack, onNavigate }) => {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const runs = (await listRuns(token)).filter((r) => (r.status ?? 'done') === 'done');
        const out: Latest = {};
        await Promise.all(
          PACKS.map(async (p) => {
            // Newest baseline run of the pack. Version-compare runs of another profile (v2: top-2
            // retrieval) are skipped, like Diagnose and the Seal do: the story and the pack cards
            // describe the bot as configured, not the experiment.
            const candidates = runs.filter((r) => r.pack_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
            for (const run of candidates) {
              const detail = (await getRun(run.batch_id, token)) as RunSummary & { profile?: string };
              if (detail.profile && detail.profile !== 'v1') continue;
              if ('aggregates' in detail || 'results' in detail) out[p.id] = detail as RunSummary;
              return;
            }
          })
        );
        if (!cancelled) setLatest(out);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const judge = (health?.models?.judge?.name ?? health?.judge_model ?? '').split('/').pop();
  const generator = health?.models?.generator?.name ?? health?.generator_model;

  return (
    <div className="flex flex-col">
      {/* The whole idea, told by following one real question through the pipeline */}
      {error && !latest ? (
        <div className="mx-auto w-full max-w-[1240px] px-6 pt-6">
          <LoadState loading={false} error={error} what="runs" />
        </div>
      ) : (
        <StartStory token={token} latest={latest} onOpenPack={onOpenPack} onNavigate={onNavigate} />
      )}

      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-6 pb-10 pt-6">
        <DiagnosisTree fig="Fig. 2" />
        <details className="group rounded-2xl" style={{ background: 'var(--panel)', border: '1px solid var(--rule)' }}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
            <span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--ink-2)' }}>
                Fig. 1
              </span>
              <span className="text-[17px]" style={{ color: 'var(--ink)' }}>
                See the full pipeline: indexing, answering, and where RAGSeal checks it
              </span>
            </span>
            <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
              Chatbot <span className="font-mono">{generator ?? '—'}</span> · grading model <span className="font-mono">{judge || '—'}</span>
              <ArrowRight className="ml-2 inline h-4 w-4 transition-transform group-open:rotate-90" />
            </span>
          </summary>
          <div className="px-6 pb-6">
            <RagFigure />
          </div>
        </details>

        <button
          onClick={() => onNavigate('trust')}
          className="flex items-center gap-2 self-start text-[13px] transition-opacity hover:opacity-70"
          style={{ color: 'var(--ink-2)' }}
        >
          <ListChecks className="h-4 w-4" /> Why trust the checker? See how it agrees with humans
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
