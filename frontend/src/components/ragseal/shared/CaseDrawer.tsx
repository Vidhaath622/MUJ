import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { CaseReport } from '../lab/CaseReport';
import { LabResult } from '../lab/useLabData';

/** Full diagnosis for one evaluated answer, over the current page (Esc or the backdrop closes it). */
export const CaseDrawer: React.FC<{
  result: LabResult | null;
  testId?: string;
  caseType?: string;
  filenames: Record<string, string>;
  onClose: () => void;
}> = ({ result, testId, caseType, filenames, onClose }) => {
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, onClose]);

  if (!result) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Diagnosis">
      <button aria-label="Close diagnosis" onClick={onClose} className="drawer-backdrop absolute inset-0 bg-[color:color-mix(in_srgb,var(--ink)_38%,transparent)] backdrop-blur-[2px]" />
      <div className="drawer-panel relative flex h-full w-[min(1120px,92vw)] flex-col border-l border-[var(--rule)] bg-[var(--paper)] shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--rule)] px-6">
          <span className="text-[15px] font-semibold">Diagnosis</span>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--ink-2)] hover:bg-[color:color-mix(in_srgb,var(--ink)_4%,transparent)] hover:text-[var(--ink)]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <CaseReport
            result={result}
            testId={testId ?? result.test_id}
            caseType={caseType ?? result.case_type}
            staleChunkIds={result.stale_chunk_ids ?? []}
            filenames={filenames}
          />
        </div>
      </div>
    </div>
  );
};
