// Shared verdict vocabulary for the Lab screen: label, colour and a plain-English
// explanation per root-cause category. Green = accurate, red = hallucinated,
// amber = retriever missed or pulled the wrong info, grey = needs a human.

export type Verdict =
  | 'CLEAN_PASS'
  | 'RETRIEVAL_FAILURE'
  | 'GENERATION_HALLUCINATION'
  | 'COMPOUND_FAILURE'
  | 'NEEDS_REVIEW'
  | 'UNRESOLVED';

export const PASS = '#1F7A4D';
export const AMBER = '#B26B00';
export const RED = '#B3261E';
export const GREY = '#6B675E';

export type StageState = 'ok' | 'fault' | 'neutral';

export interface VerdictStyle {
  label: string;
  short: string;
  blame: string;
  color: string;
  /** Lower sorts first in the case list. */
  severity: number;
  /** Which pipeline stage is lit for this verdict. */
  stages: { retriever: StageState; generator: StageState };
}

export const VERDICTS: Record<Verdict, VerdictStyle> = {
  CLEAN_PASS: {
    label: 'Accurate',
    short: 'Accurate',
    blame: 'Retriever and generator both did their job.',
    color: PASS,
    severity: 5,
    stages: { retriever: 'ok', generator: 'ok' },
  },
  RETRIEVAL_FAILURE: {
    label: 'Retrieval failure',
    short: 'Retrieval',
    blame: 'The retriever is to blame: the model answered from what it was given.',
    color: AMBER,
    severity: 1,
    stages: { retriever: 'fault', generator: 'ok' },
  },
  GENERATION_HALLUCINATION: {
    label: 'Hallucination',
    short: 'Hallucinated',
    blame: 'The generator is to blame: the right context was there and it made things up.',
    color: RED,
    severity: 1,
    stages: { retriever: 'ok', generator: 'fault' },
  },
  COMPOUND_FAILURE: {
    label: 'Both failed',
    short: 'Compound',
    blame: 'Wrong context and an unfaithful answer.',
    color: RED,
    severity: 0,
    stages: { retriever: 'fault', generator: 'fault' },
  },
  NEEDS_REVIEW: {
    label: 'Needs review',
    short: 'Review',
    blame: 'Signals disagree; a human should look.',
    color: GREY,
    severity: 3,
    stages: { retriever: 'neutral', generator: 'neutral' },
  },
  UNRESOLVED: {
    label: 'Not judged',
    short: 'Unjudged',
    blame: 'The grading model could not score this case; no guess was made.',
    color: '#6E6A62',
    severity: 4,
    stages: { retriever: 'neutral', generator: 'neutral' },
  },
};

export const VERDICT_ORDER: Verdict[] = [
  'CLEAN_PASS',
  'RETRIEVAL_FAILURE',
  'GENERATION_HALLUCINATION',
  'COMPOUND_FAILURE',
  'NEEDS_REVIEW',
  'UNRESOLVED',
];

export function verdictStyle(category?: string | null): VerdictStyle {
  return VERDICTS[(category as Verdict) ?? 'UNRESOLVED'] ?? VERDICTS.NEEDS_REVIEW;
}

/** `#RRGGBB` plus alpha 0..1 → rgba(). */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Green when a score clears its threshold, red when it doesn't, grey when there is no score. */
export function scoreColor(score: number | null | undefined, threshold: number): string {
  if (score == null) return GREY;
  return score >= threshold ? PASS : RED;
}

export function pct(score: number | null | undefined): string {
  return score == null ? '—' : `${Math.round(score * 100)}%`;
}
