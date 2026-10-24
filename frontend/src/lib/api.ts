import { EvaluationResult, BatchSummary, PackId, AuthUser } from '../types/ragseal';

export const API_BASE_URL = 'http://localhost:8000/api';

export interface HealthResponse {
  status: string;
  engine_ready: boolean;
  timestamp: string;
  ollama_reachable?: boolean;
  models?: {
    generator?: { name: string; ready: boolean };
    embeddings?: { name: string; ready: boolean };
    judge?: { name: string; ready: boolean; mode?: string };
  };
  evaluation_mode?: string;
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

export interface IngestResponse {
  document_id: string;
  filename: string;
  chunk_count: number;
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
): Promise<{ access_token: string; user: AuthUser } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function registerUser(
  email: string,
  password: string
): Promise<{ access_token: string; user: AuthUser } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPacks(token?: string): Promise<PackItemResponse[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/packs`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadPackBackend(packId: string, token?: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/packs/${packId}/load`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function askRag(
  query: string,
  documentIds: string[],
  token?: string
): Promise<{ query: string; answer: string; retrieved_chunks: any[] } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/rag/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, document_ids: documentIds }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function evaluateLiveQuery(
  query: string,
  documentId: string,
  groundTruth?: string,
  token?: string
): Promise<EvaluationResult | null> {
  try {
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
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function evaluateBatchSuite(
  documentId: string,
  testCases: { test_id?: string; question?: string; query?: string; ground_truth_answer?: string }[],
  packId?: string,
  token?: string
): Promise<BatchSummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/evaluate/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        document_id: documentId || undefined,
        test_cases: testCases,
        pack_id: packId,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRunHistory(token?: string): Promise<RunHistoryItem[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/runs`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRunDetail(batchId: string, token?: string): Promise<BatchSummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/runs/${batchId}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchDocuments(token?: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function uploadDocument(file: File, token?: string): Promise<IngestResponse | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateSynthetic(
  documentId: string,
  count = 5,
  token?: string
): Promise<{ document_id: string; generated_count: number; test_cases: any[] } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/synthetic/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ document_id: documentId, count, include_traps: true }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
