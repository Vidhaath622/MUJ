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
      <button aria-label="Close diagnosis" onClick={onClose} className="absolute inset-0 bg-[#F6F3EC] backdrop-blur-[2px]" />
      <div className="lab-fade-up relative flex h-full w-[min(1120px,92vw)] flex-col border-l border-[#E3DED3] bg-[#F6F3EC] shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E3DED3] px-6">
          <span className="text-[15px] font-semibold">Diagnosis</span>
          <button onClick={onClose} className="rounded-md p-1.5 text-[#5E5B53] hover:bg-[#1B1B18]/[0.04] hover:text-[#1B1B18]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-6">
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
