import { EvaluationResult, BatchSummary, PackId, AuthUser } from '../types/ragseal';

// Relative so the app also works when opened from another laptop on the LAN; vite proxies /api to the backend.
export const API_BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiError';
  }
}

export interface ModelDetail {
  name: string;
  provider?: string;
  ready: boolean;
  error?: string;
  mode?: string;
}

export interface HealthResponse {
  status: string;
  engine_ready: boolean;
  timestamp: string;
  ollama_reachable?: boolean;
  models?: {
    generator?: ModelDetail;
    embeddings?: ModelDetail;
    judge?: ModelDetail;
  };
  evaluation_mode?: 'local' | 'hosted' | 'unavailable' | string;
  judge_model?: string;
  generator_model?: string;
  engine_error?: string;
  latencyMs?: number;
}

export interface PackItemResponse {
  pack_id: PackId;
  name: string;
  description: string;
  document_count: number;
  test_case_count: number;
  demo_data?: boolean;
  risk_rules?: string[];
  source?: string;
}

export interface RunHistoryItem {
  batch_id: string;
  pack_id?: PackId;
  created_at: string;
  total_evaluated: number;
  pass_rate?: number;
}

export interface DocumentResponse {
  document_id: string;
  filename: string;
  chunk_count: number;
  chunks?: { chunk_id: string; text: string; ordinal?: number }[];
}

export interface SyntheticResponse {
  document_id: string;
  generated_count: number;
  test_cases: {
    test_id: string;
    question: string;
    ground_truth_answer: string;
    source_chunk_id: string;
    context_snippet: string;
    type?: string;
  }[];
}

async function extractErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.detail === 'string') return data.detail;
    if (data && Array.isArray(data.detail)) return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
    if (data && typeof data.message === 'string') return data.message;
  } catch {
    // fallback to text
  }
  return `${res.status} ${res.statusText}`;
}

export async function checkBackendHealth(): Promise<HealthResponse | null> {
  const startTime = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    const latencyMs = Math.round(performance.now() - startTime);
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, latencyMs };
  } catch {
    return null;
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ access_token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function registerUser(
  email: string,
  password: string
): Promise<{ access_token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function fetchPacks(token?: string): Promise<PackItemResponse[]> {
  const res = await fetch(`${API_BASE_URL}/packs`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function loadPackBackend(packId: string, token: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/packs/${packId}/load`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function askRag(
  query: string,
  documentIds: string[],
  token: string
): Promise<{ query: string; answer: string; retrieved_chunks: any[] }> {
  const res = await fetch(`${API_BASE_URL}/rag/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, document_ids: documentIds }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function evaluateLiveQuery(
  query: string,
  documentId: string,
  groundTruth?: string,
  token?: string
): Promise<EvaluationResult> {
  const res = await fetch(`${API_BASE_URL}/evaluate/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      query,
      document_id: documentId,
      optional_ground_truth: groundTruth || null,
    }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

/**
 * Point 1 from docs/frontend_integration_notes.md:
 * CRITICAL: Run packs by sending ONLY {"pack_id": packId}.
 * The backend loads documents, gold quotes, and trap cases automatically.
 * Timeout is set to 180 seconds per Note #5.
 */
export async function evaluateBatchByPack(
  packId: PackId,
  token: string,
  signal?: AbortSignal
): Promise<BatchSummary> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout

  // If external signal fires, abort local controller too
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(`${API_BASE_URL}/evaluate/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pack_id: packId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const detail = await extractErrorDetail(res);
      throw new ApiError(res.status, detail);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError(408, 'Batch evaluation timed out after 3 minutes');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, err.message || 'Network error');
  }
}

export async function evaluateBatchSuite(
  documentId?: string,
  testCases?: any[],
  packId?: string,
  token?: string
): Promise<BatchSummary> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const payload: any = {};
    if (packId && (!testCases || testCases.length === 0)) {
      payload.pack_id = packId;
    } else {
      if (packId) payload.pack_id = packId;
      if (documentId) payload.document_id = documentId;
      if (testCases) payload.test_cases = testCases;
    }

    const res = await fetch(`${API_BASE_URL}/evaluate/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const detail = await extractErrorDetail(res);
      throw new ApiError(res.status, detail);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError(408, 'Batch evaluation timed out after 3 minutes');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, err.message || 'Network error');
  }
}

export async function fetchRunHistory(token: string): Promise<RunHistoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/runs`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function fetchRunDetail(batchId: string, token: string): Promise<BatchSummary> {
  const res = await fetch(`${API_BASE_URL}/runs/${batchId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function fetchDocuments(token: string): Promise<DocumentResponse[]> {
  const res = await fetch(`${API_BASE_URL}/documents`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function uploadDocument(file: File, token: string): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

export async function deleteDocument(documentId: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
}

export async function generateSynthetic(
  documentId: string,
  count = 5,
  token: string
): Promise<SyntheticResponse> {
  const res = await fetch(`${API_BASE_URL}/synthetic/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ document_id: documentId, count, include_traps: true }),
  });
  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new ApiError(res.status, detail);
  }
  return await res.json();
}

/** A 404 means "the backend doesn't have this endpoint yet": pages show an empty state. */
export class NotAvailable extends Error {
  constructor(path: string) {
    super(`Backend endpoint not available yet: ${path}`);
    this.name = 'NotAvailable';
  }
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return 'Something went wrong talking to the backend.';
}

async function callEndpoint<T>(path: string, token: string | null, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 404 || res.status === 405) {
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
  const { body } = await callEndpoint<RunListItem[] | { runs: RunListItem[] }>('/runs', token);
  return Array.isArray(body) ? body : body.runs ?? [];
}

export async function getRun(batchId: string, token: string): Promise<RunSummary | RunProgress> {
  const { body } = await callEndpoint<RunSummary | RunProgress>(`/runs/${batchId}`, token);
  return body;
}

export async function startRun(
  packId: string,
  token: string
): Promise<{ batch_id: string; status: string; total?: number; summary?: RunSummary }> {
  const { status, body } = await callEndpoint<RunSummary & { status?: string; total?: number }>('/evaluate/batch', token, {
    method: 'POST',
    body: JSON.stringify({ pack_id: packId, async: true }),
  });
  if (status === 202 || body.status === 'running') return { batch_id: body.batch_id, status: 'running', total: body.total };
  return { batch_id: body.batch_id, status: 'done', summary: body };
}

export async function getProgress(batchId: string, token: string): Promise<RunProgress> {
  const { body } = await callEndpoint<RunProgress>(`/runs/${batchId}/progress`, token);
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
  generated_answer?: string;
  retrieved_chunks?: LabelChunk[];
  labeled?: boolean;
}

export interface LabelQueue {
  items: LabelItem[];
  labeled?: number;
  total?: number;
}

export async function getLabelQueue(packId: string, labeler: string, token: string): Promise<LabelQueue> {
  const qs = new URLSearchParams({ pack_id: packId, labeler });
  const { body } = await callEndpoint<LabelQueue | LabelItem[]>(`/labels/queue?${qs}`, token);
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
  await callEndpoint('/labels', token, { method: 'POST', body: JSON.stringify(label) });
}

export interface Agreement {
  n_double_labeled?: number;
  human_human?: { agreement?: number | null; cohen_kappa?: number | null };
  pipeline_vs_consensus?: {
    agreement?: number | null;
    kappa?: number | null;
    false_pass?: number;
    false_fail?: number;
    n?: number;
  };
  disagreements?: { test_id: string; question?: string; humans?: string; pipeline?: string; note?: string }[];
}

export async function getAgreement(token: string, packId?: string): Promise<Agreement> {
  const qs = packId ? `?pack_id=${packId}` : '';
  const { body } = await callEndpoint<Agreement>(`/trust/agreement${qs}`, token);
  return body;
}

// ---------- Failure taxonomy + confusion matrix (P4) ----------

export interface Confusion {
  run_id?: string;
  labels: string[];
  matrix: number[][];
  per_class?: Record<string, { precision?: number | null; recall?: number | null; support?: number }>;
  accuracy?: number | null;
  n?: number;
}

export async function startInjectionRun(token: string, nPerType = 5, packId?: string): Promise<{ run_id: string; status?: string }> {
  const { body } = await callEndpoint<{ run_id?: string; batch_id?: string; status?: string }>('/trust/injection-run', token, {
    method: 'POST',
    body: JSON.stringify({ pack_id: packId ?? null, n_per_type: nPerType }),
  });
  return { run_id: body.run_id ?? body.batch_id ?? '', status: body.status };
}

export async function getConfusion(token: string, runId?: string): Promise<Confusion> {
  const qs = runId ? `?run_id=${runId}` : '';
  const { body } = await callEndpoint<Confusion>(`/trust/confusion${qs}`, token);
  return body;
}

// ---------- Stability (P5) ----------

export interface Stability {
  batch_id?: string;
  judges?: string[];
  judge_swap?: {
    correlation?: Record<string, number | null>;
    verdict_kappa?: number | null;
    verdict_agreement?: number | null;
  };
  shuffle?: {
    runs?: number;
    max_delta?: number | null;
    mean_delta?: number | null;
    unstable_cases?: number;
    stable?: boolean;
    threshold?: number;
  };
  stable?: boolean;
}

export async function runStability(
  batchId: string,
  judges: string[],
  token: string,
  shuffles = 3
): Promise<Stability> {
  const { body } = await callEndpoint<Stability>('/trust/stability', token, {
    method: 'POST',
    body: JSON.stringify({ batch_id: batchId, judges, shuffles }),
  });
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
  const { body } = await callEndpoint<RagProfile[] | { profiles: RagProfile[] }>('/rag/profiles', token);
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
  const { body } = await callEndpoint<CompareResult>('/compare', token, {
    method: 'POST',
    body: JSON.stringify({ base, candidate, pack_ids: packIds }),
  });
  return body;
}

export async function getCompare(compareId: string, token: string): Promise<CompareResult> {
  const { body } = await callEndpoint<CompareResult>(`/compare/${compareId}`, token);
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

export async function evaluateTestSet(
  documentIds: string[],
  testCases: GeneratedCase[],
  token: string,
  onProgress?: (p: RunProgress) => void
): Promise<RunSummary> {
  const { status, body } = await callEndpoint<RunSummary & { status?: string; total?: number }>('/evaluate/batch', token, {
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
