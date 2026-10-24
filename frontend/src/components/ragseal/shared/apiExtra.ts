// TODO(Vidhaath): move these into lib/api.ts. They cover the Phase 2 endpoints
// (async runs, labels, evaluator trust, version compare) that api.ts doesn't have yet.
// Shapes follow claude-phase2-plan.md and Builder's P1 message; every field the UI
// reads is optional so a partial backend renders as "—" rather than crashing.

import { API_BASE_URL, ApiError } from '../../../lib/api';

/** A 404 means "the backend doesn't have this endpoint yet": pages show an empty state. */
export class NotAvailable extends Error {
  constructor(path: string) {
    super(`Backend endpoint not available yet: ${path}`);
    this.name = 'NotAvailable';
  }
}

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 404 || res.status === 405) {
    // 404 on an id route (e.g. a deleted run) still carries a detail; a missing route doesn't.
    let detail: string | null = null;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string' && data.detail !== 'Not Found') detail = data.detail;
    } catch {
      // no body
    }
    if (detail) throw new ApiError(res.status, detail);
    throw new NotAvailable(path.split('?')[0]);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
      else if (Array.isArray(data?.detail)) detail = data.detail.map((d: { msg?: string }) => d.msg).join(', ');
    } catch {
      // keep status text
    }
    throw new ApiError(res.status, detail);
  }
  return { status: res.status, body: (await res.json()) as T };
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return 'Something went wrong talking to the backend.';
}

// ---------- Health extras ----------

export interface JudgeMember {
  name: string;
  provider?: string;
  role?: 'primary' | 'overflow' | string;
}

/** /api/health fields api.ts doesn't type yet: the judge pool and how many API keys feed it. */
export function judgePool(health: unknown): { members: JudgeMember[]; keys: number | null } {
  const h = (health ?? {}) as { judge_pool?: JudgeMember[]; judge_api_keys?: number };
  return { members: h.judge_pool ?? [], keys: h.judge_api_keys ?? null };
}

// ---------- Runs (P1) ----------

export interface RunTiming {
  wall_ms?: number;
  per_case_ms_avg?: number;
  cases_per_min?: number;
  judge_calls?: number;
  judge_cache_hits?: number;
  rule_shortcuts?: number;
  concurrency?: number;
}

export interface RunListItem {
  batch_id: string;
  pack_id?: string;
  created_at: string;
  status?: 'running' | 'done' | 'failed';
  total_evaluated?: number;
  pass_rate?: number | null;
  overall_score?: number | null;
  timing?: RunTiming;
}

export interface RunProgress {
  batch_id: string;
  status: 'running' | 'done' | 'failed';
  done?: number;
  total?: number;
  failed?: number;
  elapsed_ms?: number;
  eta_ms?: number | null;
  cases_per_min?: number | null;
  error?: string | null;
}

export interface RunSummary {
  batch_id: string;
  pack_id?: string;
  created_at?: string;
  status?: string;
  total_evaluated?: number;
  failed_cases?: number;
  aggregates?: {
    avg_context_relevance?: number | null;
    avg_faithfulness?: number | null;
    avg_answer_accuracy?: number | null;
    pass_rate?: number | null;
  };
  root_cause_breakdown?: Record<string, number>;
  gold_retrieval_rate?: number | null;
  judge_model?: string;
  generator_model?: string;
  duration_ms?: number;
  timing?: RunTiming;
  results?: unknown[];
}

export async function listRuns(token: string): Promise<RunListItem[]> {
  const { body } = await call<RunListItem[] | { runs: RunListItem[] }>('/runs', token);
  return Array.isArray(body) ? body : body.runs ?? [];
}

export async function getRun(batchId: string, token: string): Promise<RunSummary | RunProgress> {
  const { body } = await call<RunSummary | RunProgress>(`/runs/${batchId}`, token);
  return body;
}

/**
 * Starts a pack run. New backends answer 202 {batch_id, status:"running"}; an older
 * backend runs synchronously and answers with the finished summary, which we treat as done.
 */
export async function startRun(
  packId: string,
  token: string
): Promise<{ batch_id: string; status: string; total?: number; summary?: RunSummary }> {
  const { status, body } = await call<RunSummary & { status?: string; total?: number }>('/evaluate/batch', token, {
    method: 'POST',
    body: JSON.stringify({ pack_id: packId, async: true }),
  });
  if (status === 202 || body.status === 'running') return { batch_id: body.batch_id, status: 'running', total: body.total };
  return { batch_id: body.batch_id, status: 'done', summary: body };
}

export async function getProgress(batchId: string, token: string): Promise<RunProgress> {
  const { body } = await call<RunProgress>(`/runs/${batchId}/progress`, token);
  return body;
}

// ---------- Labels + agreement (P3) ----------

export interface LabelChunk {
  chunk_id: string;
  document_id?: string;
  document_name?: string;
  filename?: string;
  text: string;
}

export interface LabelItem {
  test_id: string;
  batch_id?: string;
  pack_id?: string;
  question: string;
  ground_truth?: string | null;
  ground_truth_answer?: string | null;
  /** True for questions the documents can't answer: the right reply is to abstain. */
  expected_abstain?: boolean;
  generated_answer?: string;
  retrieved_chunks?: LabelChunk[];
  labeled?: boolean;
}

export interface LabelQueue {
  items: LabelItem[];
  labeled?: number;
  total?: number;
  /** The run every labeller of this pack works on; null when the pack has no finished run. */
  batch_id?: string | null;
  /** The failure types the backend accepts in POST /labels (same ids as root_cause.failure_type). */
  failure_types?: string[];
  message?: string;
}

export async function getLabelQueue(packId: string, labeler: string, token: string): Promise<LabelQueue> {
  const qs = new URLSearchParams({ pack_id: packId, labeler });
  const { body } = await call<LabelQueue | LabelItem[]>(`/labels/queue?${qs}`, token);
  return Array.isArray(body) ? { items: body } : body;
}

export interface DisagreementItem extends LabelItem {
  /** Each labeller's call on this item, keyed by name. */
  labels?: Record<string, { correct: boolean; failure_type?: string | null }>;
}

/** Answers where the two labellers disagree on correct vs wrong, for a second look. */
export async function getDisagreements(
  packId: string,
  token: string
): Promise<{ items: DisagreementItem[]; total?: number; failure_types?: string[] }> {
  const qs = new URLSearchParams({ pack_id: packId });
  const { body } = await call<{ items: DisagreementItem[]; total?: number } | DisagreementItem[]>(`/labels/disagreements?${qs}`, token);
  return Array.isArray(body) ? { items: body } : body;
}

export interface LabelInput {
  test_id: string;
  batch_id?: string;
  labeler: string;
  correct: boolean;
  failure_type: string | null;
  note?: string;
}

export async function postLabel(label: LabelInput, token: string): Promise<void> {
  await call('/labels', token, { method: 'POST', body: JSON.stringify(label) });
}

export interface AgreementSnapshot {
  n?: number;
  human_human?: { agreement?: number | null; cohen_kappa?: number | null; n?: number };
  pipeline_vs_consensus?: { agreement?: number | null; kappa?: number | null; false_pass?: number; false_fail?: number; n?: number };
}

export interface Agreement {
  /** Labels as first given, before anyone saw a disagreement: the honest inter-annotator number. */
  original?: AgreementSnapshot | null;
  computed_from?: string;
  pack_id?: string | null;
  n_labels?: number;
  n_items_labeled?: number;
  n_double_labeled?: number;
  labelers?: string[];
  human_human?: {
    agreement?: number | null;
    cohen_kappa?: number | null;
    n?: number;
    /** Among answers both people called wrong: how often they picked the same failure type. */
    failure_type_agreement?: number | null;
    failure_type_n?: number;
  };
  pipeline_vs_consensus?: {
    agreement?: number | null;
    kappa?: number | null;
    false_pass?: number;
    false_fail?: number;
    n?: number;
  };
  disagreements?: {
    test_id: string;
    batch_id?: string;
    question?: string;
    humans?: string;
    pipeline?: string | null;
    kind?: 'human_vs_human' | 'pipeline_vs_consensus';
    note?: string | null;
  }[];
}

export async function getAgreement(token: string, packId?: string): Promise<Agreement> {
  const qs = packId ? `?pack_id=${packId}` : '';
  const { body } = await call<Agreement>(`/trust/agreement${qs}`, token);
  return body;
}

// ---------- Failure taxonomy + confusion matrix (P4) ----------

export interface ConfusionCase {
  test_id: string;
  question?: string;
  true_failure_type?: string;
  predicted_failure_type?: string;
  category?: string;
  stage?: string;
  answer?: string;
}

export interface Confusion {
  run_id?: string | null;
  /** "running" comes back as HTTP 202 with progress; "done" carries the matrix. */
  status?: 'running' | 'done' | 'failed';
  progress?: RunProgress | null;
  error?: string | null;
  message?: string;
  labels: string[];
  matrix: number[][];
  per_class?: Record<string, { precision?: number | null; recall?: number | null; support?: number }>;
  accuracy?: number | null;
  /** Coarser score: did it blame the right stage (retriever vs generator)? */
  stage_accuracy?: number | null;
  n?: number;
  n_per_type?: number;
  judge_model?: string;
  timing?: RunTiming;
  cases?: ConfusionCase[];
}

export async function startInjectionRun(token: string, nPerType = 5, packId?: string): Promise<{ run_id: string; status?: string }> {
  const { body } = await call<{ run_id?: string; batch_id?: string; status?: string }>('/trust/injection-run', token, {
    method: 'POST',
    body: JSON.stringify({ pack_id: packId ?? null, n_per_type: nPerType }),
  });
  return { run_id: body.run_id ?? body.batch_id ?? '', status: body.status };
}

export async function getConfusion(token: string, runId?: string): Promise<Confusion> {
  const qs = runId ? `?run_id=${runId}` : '';
  const { body } = await call<Confusion>(`/trust/confusion${qs}`, token);
  // A running or failed run has no matrix yet.
  return { ...body, labels: body.labels ?? [], matrix: body.matrix ?? [] };
}

// ---------- Stability (P5) ----------

export interface Stability {
  stability_id?: string;
  /** "running" comes back as HTTP 202 with progress. */
  status?: 'running' | 'done' | 'failed';
  progress?: RunProgress | null;
  error?: string | null;
  created_at?: string;
  batch_id?: string;
  judges?: string[];
  n_cases?: number;
  judge_swap?: {
    correlation?: Record<string, number | null>;
    verdict_kappa?: number | null;
    verdict_agreement?: number | null;
    n?: number;
    disagreements?: { test_id?: string; judge_a?: string; judge_b?: string }[];
  };
  shuffle?: {
    runs?: number;
    max_delta?: number | null;
    mean_delta?: number | null;
    unstable_cases?: number;
    verdict_changes?: number;
    stable?: boolean | null;
    threshold?: number;
    cases?: { test_id?: string; max_delta: number; verdict_changed: boolean; stable: boolean }[];
  };
  stable?: boolean | null;
}

/** Stability is a few hundred judge calls, so it runs in the background: start, then poll. */
export async function startStability(
  batchId: string,
  token: string,
  opts: { judges?: string[]; shuffles?: number; maxCases?: number } = {}
): Promise<{ stability_id: string; status: string }> {
  const { body } = await call<{ stability_id: string; status: string }>('/trust/stability', token, {
    method: 'POST',
    body: JSON.stringify({
      batch_id: batchId,
      ...(opts.judges ? { judges: opts.judges } : {}),
      shuffles: opts.shuffles ?? 3,
      max_cases: opts.maxCases ?? 20,
    }),
  });
  return body;
}

/** `id` may be "latest" for the most recent check. */
export async function getStability(id: string, token: string): Promise<Stability> {
  const { body } = await call<Stability>(`/trust/stability/${id}`, token);
  return body;
}

// ---------- Version compare (P6) ----------

export interface RagProfile {
  id: string;
  name?: string;
  description?: string;
  params?: Record<string, unknown>;
}

export async function listProfiles(token: string): Promise<RagProfile[]> {
  const { body } = await call<RagProfile[] | { profiles: RagProfile[] }>('/rag/profiles', token);
  return Array.isArray(body) ? body : body.profiles ?? [];
}

export interface CompareFlip {
  test_id: string;
  question?: string;
  pack_id?: string;
  base_verdict?: string;
  candidate_verdict?: string;
  direction: 'pass_to_fail' | 'fail_to_pass';
  base_accuracy?: number | null;
  candidate_accuracy?: number | null;
}

export interface CompareResult {
  compare_id?: string;
  status?: string;
  base?: string;
  candidate?: string;
  n?: number;
  base_pass_rate?: number | null;
  candidate_pass_rate?: number | null;
  accuracy_delta?: number | null;
  ci?: [number, number] | null;
  mcnemar_p?: number | null;
  meaningful?: boolean;
  verdict?: string;
  flips?: CompareFlip[];
  progress?: RunProgress;
}

export async function startCompare(
  base: string,
  candidate: string,
  packIds: string[],
  token: string
): Promise<CompareResult> {
  const { body } = await call<CompareResult>('/compare', token, {
    method: 'POST',
    body: JSON.stringify({ base, candidate, pack_ids: packIds }),
  });
  return body;
}

export async function getCompare(compareId: string, token: string): Promise<CompareResult> {
  const { body } = await call<CompareResult>(`/compare/${compareId}`, token);
  return body;
}

// ---------- Test sets (synthetic questions from uploaded documents) ----------

export interface GeneratedCase {
  test_id: string;
  question: string;
  ground_truth_answer?: string;
  source_chunk_id?: string;
  gold_chunk_ids?: string[];
  context_snippet?: string;
  type?: string;
}

/**
 * Evaluates a hand-made test set. Uses the async run when the backend has it (polling
 * progress through `onProgress`), and the older synchronous answer otherwise.
 */
export async function evaluateTestSet(
  documentIds: string[],
  testCases: GeneratedCase[],
  token: string,
  onProgress?: (p: RunProgress) => void
): Promise<RunSummary> {
  const { status, body } = await call<RunSummary & { status?: string; total?: number }>('/evaluate/batch', token, {
    method: 'POST',
    body: JSON.stringify({ document_ids: documentIds, test_cases: testCases, async: true }),
  });
  if (status !== 202 && body.status !== 'running') return body;
  const batchId = body.batch_id;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await getProgress(batchId, token);
    onProgress?.(p);
    if (p.status === 'failed') throw new ApiError(500, p.error ?? 'The run failed.');
    if (p.status === 'done') break;
  }
  return (await getRun(batchId, token)) as RunSummary;
}

// ---- Documents: read one document's passages (GET /api/documents/{id}) ----

export interface DocumentDetail {
  document_id: string;
  filename: string;
  chunk_count?: number;
  pack_id?: string | null;
  chunks?: { chunk_id: string; text: string }[];
}

export async function getDocument(documentId: string, token: string): Promise<DocumentDetail> {
  return (await call<DocumentDetail>(`/documents/${encodeURIComponent(documentId)}`, token)).body;
}

// ---------- Change impact radar (POST /api/impact, GET /api/impact/{id}|latest) ----------

export interface ImpactChange {
  kind: 'changed' | 'added' | 'removed';
  old: string | null;
  new: string | null;
  numbers_changed?: { old: string; new: string }[];
  old_chunk_id?: string | null;
  new_chunk_id?: string | null;
  tested?: boolean;
}

export interface ImpactTest {
  test_id: string;
  question: string;
  gold?: string;
  expected_answer?: string;
  old_fact?: string;
  answer?: string;
  verdict?: string;
  failure_type?: string | null;
  stage?: string | null;
  at_risk?: boolean;
  quotes_old_value?: boolean;
  stale_retrieved?: boolean;
  gold_retrieved?: boolean;
  judge_model?: string;
  evaluation_id?: string;
  /** The full stored evaluation, so the normal case report can open it. */
  evaluation?: unknown;
}

export interface ImpactResult {
  impact_id: string | null;
  status: 'running' | 'done' | 'failed' | 'none';
  created_at?: string;
  progress?: RunProgress;
  error?: string | null;
  old_document?: { document_id: string; filename: string };
  new_document?: { document_id: string; filename: string };
  summary?: { unchanged?: number; changed?: number; added?: number; removed?: number; tests?: number; at_risk?: number };
  changes?: ImpactChange[];
  tests?: ImpactTest[];
  at_risk?: number;
  judge_model?: string;
}

export async function startImpact(
  oldDocumentId: string,
  newDocumentId: string,
  token: string,
  maxTests = 10
): Promise<ImpactResult> {
  const { body } = await call<ImpactResult>('/impact', token, {
    method: 'POST',
    body: JSON.stringify({ old_document_id: oldDocumentId, new_document_id: newDocumentId, max_tests: maxTests }),
  });
  return body;
}

export async function getImpact(impactId: string, token: string): Promise<ImpactResult> {
  return (await call<ImpactResult>(`/impact/${encodeURIComponent(impactId)}`, token)).body;
}
