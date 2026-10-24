import { useCallback, useEffect, useState } from 'react';
import {
  API_BASE_URL,
  ApiError,
  evaluateBatchByPack,
  fetchRunDetail,
  fetchRunHistory,
  loadPackBackend,
  RunHistoryItem,
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
  filename?: string;
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
    /** Phase 2 fine-grained type (WRONG_CHUNK, STALE_SOURCE, …); absent on older runs. */
    failure_type?: string;
    failure_type_text?: string;
    stage?: string;
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
  pack_id?: string | null;
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
export async function evaluateAcrossDocs(
  query: string,
  documentIds: string[],
  token: string,
  groundTruth?: string,
  extra?: { gold_chunk_ids?: string[]; stale_chunk_ids?: string[]; type?: string }
): Promise<LabResult> {
  const res = await fetch(`${API_BASE_URL}/evaluate/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query,
      document_ids: documentIds,
      optional_ground_truth: groundTruth || null,
      ...(extra?.gold_chunk_ids?.length ? { gold_chunk_ids: extra.gold_chunk_ids } : {}),
      ...(extra?.stale_chunk_ids?.length ? { stale_chunk_ids: extra.stale_chunk_ids } : {}),
      ...(extra?.type ? { type: extra.type } : {}),
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

export function useLabData(packId: PackId, token: string | null, batchId?: string | null) {
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
        // A specific run (opened from Runs) wins; otherwise the latest finished run for the pack.
        let runId = batchId ?? null;
        if (!runId) {
          const history = (await fetchRunHistory(token)) as (RunHistoryItem & { status?: string })[];
          // Newest first; version-compare runs of another profile (v2…) are skipped so the
          // Lab shows the baseline bot.
          const candidates = history
            .filter((r) => r.pack_id === packId && (r.status ?? 'done') === 'done')
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          for (const c of candidates) {
            const detail = (await fetchRunDetail(c.batch_id, token)) as unknown as LabRun & { profile?: string };
            if (detail?.profile && detail.profile !== 'v1') continue;
            if (!cancelled && Array.isArray(detail?.results)) setRun(detail);
            break;
          }
        } else {
          const detail = (await fetchRunDetail(runId, token)) as unknown as LabRun;
          // A run still in progress answers with a progress body and no results.
          if (!cancelled && Array.isArray(detail?.results)) setRun(detail);
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
  }, [packId, token, batchId]);

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

  // A run opened by id may belong to no pack (an uploaded test set) or another pack:
  // then its own results are the case list, not the selected pack's questions.
  const foreignRun = !!run && (run.pack_id ?? null) !== packId;
  const cases: LabCase[] = foreignRun
    ? run!.results.map((r, i) => ({
        test_id: r.test_id ?? `case_${i + 1}`,
        question: r.query,
        type: r.case_type,
        stale_chunk_ids: r.stale_chunk_ids ?? [],
        result: r,
      }))
    : (pack?.test_cases ?? []).map((tc) => ({
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
    foreignRun,
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
