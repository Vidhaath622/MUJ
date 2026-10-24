import { EvaluationResult, BatchSummary, PackId, AuthUser } from '../types/ragseal';

export const API_BASE_URL = 'http://localhost:8000/api';

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
