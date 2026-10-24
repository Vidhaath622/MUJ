import { EvaluationResult, BatchSummary, PackId, AuthUser } from '../types/ragseal';

const API_BASE_URL = 'http://localhost:8000/api';

export interface HealthResponse {
  status: string;
  engine_ready: boolean;
  timestamp: string;
}

export interface PackItemResponse {
  pack_id: PackId;
  name: string;
  description: string;
  document_count: number;
  test_case_count: number;
}

export async function checkBackendHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loginUser(email: string, password: string): Promise<{ access_token: string; user: AuthUser } | null> {
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

export async function askRag(query: string, documentIds: string[], token?: string): Promise<any | null> {
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
  testCases: { test_id: string; question: string; ground_truth_answer?: string }[],
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
        document_id: documentId,
        test_cases: testCases,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
