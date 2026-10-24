// Fine-grained failure types (Phase 2: diagnose 5+ kinds of failure). Same ids as the
// backend's root_cause.failure_type; `stage` says which component is to blame.

export type Stage = 'retriever' | 'generator' | 'both' | 'none' | 'unknown';

export interface FailureType {
  id: string;
  label: string;
  stage: Stage;
  hint: string;
}

export const FAILURE_TYPES: FailureType[] = [
  { id: 'WRONG_CHUNK', label: 'Wrong chunk', stage: 'retriever', hint: 'The passage with the answer was not retrieved.' },
  { id: 'STALE_SOURCE', label: 'Outdated source', stage: 'retriever', hint: 'Answered from a superseded version.' },
  { id: 'DISTRACTOR_CONFUSION', label: 'Distractor', stage: 'retriever', hint: 'A similar but wrong passage misled it.' },
  { id: 'IGNORED_CONTEXT', label: 'Ignored context', stage: 'generator', hint: 'The answer was in context but not used.' },
  { id: 'HALLUCINATION', label: 'Hallucination', stage: 'generator', hint: 'States something no passage supports.' },
  { id: 'REASONING_ERROR', label: 'Reasoning error', stage: 'generator', hint: 'Right passage, wrong conclusion drawn.' },
  { id: 'UNANSWERABLE_ANSWERED', label: 'Should have abstained', stage: 'generator', hint: 'Not in the documents, answered anyway.' },
  { id: 'FALSE_ABSTENTION', label: 'Wrongly abstained', stage: 'generator', hint: 'Said "I don\'t know" though it could answer.' },
  { id: 'OTHER', label: 'Other', stage: 'none', hint: 'Wrong for a reason not listed; add a note.' },
];

export const FAILURE_LABEL: Record<string, string> = Object.fromEntries(
  [...FAILURE_TYPES.map((f) => [f.id, f.label]), ['CLEAN_PASS', 'Correct'], ['PASS', 'Correct'], ['UNRESOLVED', 'Unresolved']] as [
    string,
    string,
  ][]
);

export const STAGE_COLOR: Record<Stage, string> = {
  retriever: '#F5A524',
  generator: '#F47783',
  both: '#F47783',
  none: '#9AA0A8',
  unknown: '#9AA0A8',
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
