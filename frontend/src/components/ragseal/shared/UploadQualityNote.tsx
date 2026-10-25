import React from 'react';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { UploadQuality } from './apiExtra';

/** One-line read-out of what the reader got out of an upload, plus its warnings (thin slides, skipped pages). */
export const UploadQualityNote: React.FC<{ filename?: string; quality: UploadQuality; className?: string }> = ({
  filename,
  quality: q,
  className,
}) => {
  const warnings = q.warnings ?? [];
  const parts = [
    q.pages != null && `${q.pages} page${q.pages === 1 ? '' : 's'}`,
    q.chunks != null && `${q.chunks} chunk${q.chunks === 1 ? '' : 's'}`,
    q.ocr_pages?.length ? `OCR on ${q.ocr_pages.length} page${q.ocr_pages.length === 1 ? '' : 's'}` : null,
    q.skipped_pages?.length ? `${q.skipped_pages.length} page${q.skipped_pages.length === 1 ? '' : 's'} unreadable` : null,
  ].filter(Boolean);
  const Icon = warnings.length ? AlertTriangle : FileCheck2;
  return (
    <div
      className={cn('rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed', className)}
      style={
        warnings.length
          ? { borderColor: 'color-mix(in srgb, var(--retr) 40%, transparent)', background: 'color-mix(in srgb, var(--retr) 8%, transparent)' }
          : { borderColor: 'var(--rule)', background: 'var(--panel)' }
      }
    >
      <div className="flex items-center gap-2 text-[var(--ink)]">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: warnings.length ? 'var(--retr)' : 'var(--ok)' }} />
        <span className="min-w-0 truncate font-medium">{filename ? `Read ${filename}` : 'Document read'}</span>
      </div>
      {parts.length > 0 && <div className="mt-1 text-[var(--ink-1)]">{parts.join(' · ')}</div>}
      {warnings.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-[var(--ink-1)]">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
