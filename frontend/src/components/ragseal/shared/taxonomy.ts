// Fine-grained failure types (Phase 2: diagnose 5+ kinds of failure). Same ids as the
// backend's root_cause.failure_type; `stage` says which component is to blame.

export type Stage = 'retriever' | 'generator' | 'both' | 'none' | 'unknown';

export interface FailureType {
  id: string;
  label: string;
  stage: Stage;
  hint: string;
  /** Plain-English wording for the Label studio, where non-experts pick a reason. */
  plain?: string;
}

export const FAILURE_TYPES: FailureType[] = [
  { id: 'WRONG_CHUNK', plain: 'Bot read the wrong text', label: 'Wrong chunk', stage: 'retriever', hint: 'The text it was given doesn’t contain the answer.' },
  { id: 'STALE_SOURCE', plain: 'Bot used an old version', label: 'Outdated source', stage: 'retriever', hint: 'It quoted an outdated document (e.g. old price).' },
  { id: 'DISTRACTOR_CONFUSION', plain: 'Fooled by similar-looking text', label: 'Distractor', stage: 'retriever', hint: 'It used text about something similar but different.' },
  { id: 'IGNORED_CONTEXT', plain: 'Answer was in the text, bot missed it', label: 'Ignored context', stage: 'generator', hint: 'The right text was there; the answer ignores it.' },
  { id: 'HALLUCINATION', plain: 'Bot made something up', label: 'Hallucination', stage: 'generator', hint: 'Says something none of the text says.' },
  { id: 'REASONING_ERROR', plain: 'Right text, wrong conclusion', label: 'Reasoning error', stage: 'generator', hint: 'Had the right text but misread it or got the maths wrong.' },
  { id: 'UNANSWERABLE_ANSWERED', plain: 'Should have said “not in the documents”', label: 'Should have abstained', stage: 'generator', hint: 'The documents don’t cover it, but it answered anyway.' },
  { id: 'FALSE_ABSTENTION', plain: "Said “I don't know” but could answer", label: 'Wrongly abstained', stage: 'generator', hint: 'Refused, but the answer was in the text.' },
  { id: 'OTHER', plain: 'Something else', label: 'Other', stage: 'none', hint: 'Wrong for a reason not listed; add a note.' },
];

export const FAILURE_LABEL: Record<string, string> = Object.fromEntries(
  [...FAILURE_TYPES.map((f) => [f.id, f.label]), ['CLEAN_PASS', 'Correct'], ['PASS', 'Correct'], ['UNRESOLVED', 'Unresolved']] as [
    string,
    string,
  ][]
);

export const STAGE_COLOR: Record<Stage, string> = {
  retriever: '#B26B00',
  generator: '#B3261E',
  both: '#B3261E',
  none: '#6B675E',
  unknown: '#6B675E',
};

export const STAGE_LABEL: Record<string, string> = {
  retriever: 'Retriever at fault',
  generator: 'Generator at fault',
  both: 'Both at fault',
  none: 'No fault',
  unknown: 'Cause unclear',
};

export function failureLabel(id: string): string {
  return FAILURE_LABEL[id] ?? id.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
