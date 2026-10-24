import { useCallback, useEffect, useState } from 'react';
import {
  API_BASE_URL,
  ApiError,
  evaluateBatchByPack,
  fetchRunDetail,
  fetchRunHistory,
  loadPackBackend,
} from '../../../lib/api';
import { PackId } from '../../../types/ragseal';

// Real backend shapes (see GET /api/runs/{id} and POST /api/packs/{id}/load).
// Kept loose on purpose: every field the Lab reads is optional so a missing
// field renders as "—" instead of crashing the demo.

export interface LabChunk {
  chunk_id: string;
  document_id?: string;
  text: string;
  relevance_score?: number | null;
  is_relevant?: boolean;
  relevance_reason?: string;
  is_gold?: boolean;
  is_stale?: boolean;
}

export interface LabClaim {
  claim: string;
  verdict?: string;
  supported?: boolean;
  chunk_id?: string | null;
}

export interface LabMetric {
  score: number | null;
  status?: string;
  details?: string;
  threshold?: number;
  claims?: LabClaim[];
  hallucinated_claims?: string[];
}

export interface LabResult {
  evaluation_id?: string;
  test_id?: string;
  case_type?: string;
  query: string;
  generated_answer?: string;
  ground_truth?: string | null;
  expected_abstain?: boolean;
  retrieved_chunks?: LabChunk[];
  gold_chunk_ids?: string[];
  stale_chunk_ids?: string[];
  citations?: string[];
  gold_retrieved?: boolean;
  metrics?: {
    context_relevance?: LabMetric;
    faithfulness?: LabMetric;
    answer_accuracy?: LabMetric;
  };
  root_cause?: {
    category?: string;
    summary?: string;
    recommended_action?: string;
  };
  replay?: {
    answer?: string;
    answer_accuracy?: number | null;
    faithfulness?: number | null;
    verdict_effect?: string;
    context_chunk_ids?: string[];
  } | null;
  category?: string;
  judge_model?: string;
  generator_model?: string;
  duration_ms?: number;
  error?: string | null;
}

export interface LabTestCase {
  test_id: string;
  question: string;
  ground_truth_answer?: string;
  type?: string;
  gold_chunk_ids?: string[];
  stale_chunk_ids?: string[];
  note?: string;
}

export interface LabPack {
  pack_id: string;
  name: string;
  document_ids: string[];
  documents: { document_id: string; filename: string; chunk_count?: number }[];
  test_cases: LabTestCase[];
}

export interface LabRun {
  batch_id: string;
  created_at?: string;
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
  replays_run?: number;
  judge_model?: string;
  generator_model?: string;
  duration_ms?: number;
  results: LabResult[];
}

/** One row in the case list: the pack's test case joined with its latest result. */
export interface LabCase {
  test_id: string;
  question: string;
  type?: string;
  stale_chunk_ids: string[];
  note?: string;
  result?: LabResult;
}

// TODO(Vidhaath): move into lib/api.ts. evaluateLiveQuery only sends one
// document_id, and a pack question must search every pack document or the
// stale-version traps cannot happen.
async function evaluateAcrossDocs(
  query: string,
  documentIds: string[],
  token: string,
  groundTruth?: string
): Promise<LabResult> {
  const res = await fetch(`${API_BASE_URL}/evaluate/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query,
      document_ids: documentIds,
      optional_ground_truth: groundTruth || null,
    }),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
    } catch {
      // keep status text
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return 'Something went wrong talking to the backend.';
}

export function useLabData(packId: PackId, token: string | null) {
  const [pack, setPack] = useState<LabPack | null>(null);
  const [run, setRun] = useState<LabRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningPack, setRunningPack] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [adHoc, setAdHoc] = useState<LabResult | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!token || packId === 'custom') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPack(null);
    setRun(null);
    setAdHoc(null);

    (async () => {
      try {
        const loaded: LabPack = await loadPackBackend(packId, token);
        if (cancelled) return;
        setPack(loaded);
        const history = await fetchRunHistory(token);
        const latest = history
          .filter((r) => r.pack_id === packId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (latest) {
          const detail = (await fetchRunDetail(latest.batch_id, token)) as unknown as LabRun;
          if (!cancelled) setRun(detail);
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [packId, token]);

  const runPack = useCallback(async () => {
    if (!token || packId === 'custom') return;
    setRunningPack(true);
    setRunStartedAt(Date.now());
    setError(null);
    try {
      const result = (await evaluateBatchByPack(packId, token)) as unknown as LabRun;
      setRun(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRunningPack(false);
      setRunStartedAt(null);
    }
  }, [packId, token]);

  const ask = useCallback(
    async (query: string, groundTruth?: string) => {
      if (!token || !pack) return;
      setAsking(true);
      setError(null);
      try {
        setAdHoc(await evaluateAcrossDocs(query, pack.document_ids, token, groundTruth));
      } catch (err) {
        setError(errorText(err));
      } finally {
        setAsking(false);
      }
    },
    [pack, token]
  );

  const cases: LabCase[] = (pack?.test_cases ?? []).map((tc) => ({
    test_id: tc.test_id,
    question: tc.question,
    type: tc.type,
    stale_chunk_ids: tc.stale_chunk_ids ?? [],
    note: tc.note,
    result: run?.results.find((r) => r.test_id === tc.test_id),
  }));

  return {
    pack,
    run,
    cases,
    loading,
    error,
    clearError: () => setError(null),
    runPack,
    runningPack,
    runStartedAt,
    ask,
    asking,
    adHoc,
    clearAdHoc: () => setAdHoc(null),
  };
}
