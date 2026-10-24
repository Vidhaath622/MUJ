// Shared verdict vocabulary for the Lab screen: label, colour and a plain-English
// explanation per root-cause category. Green = accurate, red = hallucinated,
// amber = retriever missed or pulled the wrong info, slate = needs a human.

export type Verdict =
  | 'CLEAN_PASS'
  | 'RETRIEVAL_FAILURE'
  | 'GENERATION_HALLUCINATION'
  | 'COMPOUND_FAILURE'
  | 'NEEDS_REVIEW'
  | 'UNRESOLVED';

export interface VerdictStyle {
  label: string;
  short: string;
  blame: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
  bar: string;
}

export const VERDICTS: Record<Verdict, VerdictStyle> = {
  CLEAN_PASS: {
    label: 'Accurate',
    short: 'Pass',
    blame: 'Retriever and generator both did their job.',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    dot: 'bg-emerald-400',
    bar: 'bg-emerald-500',
  },
  RETRIEVAL_FAILURE: {
    label: 'Retrieval failure',
    short: 'Retrieval',
    blame: 'The retriever is to blame: the model answered from what it was given.',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    dot: 'bg-amber-400',
    bar: 'bg-amber-500',
  },
  GENERATION_HALLUCINATION: {
    label: 'Hallucination',
    short: 'Hallucination',
    blame: 'The generator is to blame: the right context was there and it made things up.',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
    bar: 'bg-rose-500',
  },
  COMPOUND_FAILURE: {
    label: 'Both failed',
    short: 'Compound',
    blame: 'Wrong context and an unfaithful answer.',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
    bar: 'bg-rose-700',
  },
  NEEDS_REVIEW: {
    label: 'Needs review',
    short: 'Review',
    blame: 'Signals disagree; a human should look.',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/40',
    dot: 'bg-slate-400',
    bar: 'bg-slate-500',
  },
  UNRESOLVED: {
    label: 'Not judged',
    short: 'Unjudged',
    blame: 'The judge could not score this case; no guess was made.',
    text: 'text-slate-400',
    bg: 'bg-slate-500/5',
    border: 'border-slate-600/40',
    dot: 'bg-slate-600',
    bar: 'bg-slate-700',
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

export function scoreTone(score: number | null | undefined, threshold: number): string {
  if (score == null) return 'text-slate-400';
  return score >= threshold ? 'text-emerald-300' : 'text-rose-300';
}

export function pct(score: number | null | undefined): string {
  return score == null ? '—' : `${Math.round(score * 100)}%`;
}
