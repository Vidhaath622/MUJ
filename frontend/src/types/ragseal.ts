export type MetricStatus = 'PASS' | 'FAIL' | 'REVIEW' | 'UNCERTAIN';

export type RootCauseCategory = 
  | 'CLEAN_PASS' 
  | 'RETRIEVAL_FAILURE' 
  | 'GENERATION_HALLUCINATION' 
  | 'COMPOUND_FAILURE'
  | 'NEEDS_REVIEW'
  | 'UNRESOLVED'
  | 'PARTIAL_CONTEXT_MISMATCH';

export type PackId = 'recruitment' | 'banking' | 'healthcare' | 'realworld' | 'ragseal' | 'custom';

export type ReleaseDecision = 'SHIP' | 'REVIEW' | 'BLOCK';

export type EvaluationMode = 'local' | 'hosted' | 'llm' | 'fallback';
export type JudgedBy = 'model' | 'rule';

export interface RetrievedChunk {
  chunk_id: string;
  document_name: string;
  text: string;
  relevance_score: number;
  is_relevant: boolean;
  page?: number;
  document_id?: string;
  similarity?: number;
  cited?: boolean;
  is_ground_truth_chunk?: boolean;
}

export interface MetricDetail {
  score: number | null; // null when no ground truth available (status = REVIEW)
  status: MetricStatus;
  details: string;
  judged_by?: JudgedBy;
  threshold?: number;
  hallucinated_claims?: string[];
  claims?: { claim: string; supported: boolean; chunk_id?: string }[];
}

export interface Replay {
  answer: string;
  answer_accuracy: number | null;
  faithfulness: number;
  verdict_effect: string;
}

export interface EvidenceItem {
  chunk_id: string;
  text: string;
  role: 'gold_missing' | 'hallucination' | 'supported' | 'distractor' | string;
}

export interface RootCauseDiagnosis {
  category: RootCauseCategory;
  summary: string;
  recommended_action: string;
  evidence_notes?: string[];
  evidence?: EvidenceItem[];
}

export interface ReleaseGate {
  decision: ReleaseDecision;
  rule: string;
  evidence: string[];
}

export interface EvaluationResult {
  evaluation_id: string;
  query: string;
  generated_answer: string;
  ground_truth?: string | null;
  document_id: string;
  document_name?: string;
  retrieved_chunks: RetrievedChunk[];
  gold_chunk_ids?: string[];
  ground_truth_chunk_ids?: string[];
  retrieved_chunk_ids?: string[];
  gold_retrieved?: boolean;
  replay?: Replay | null;
  evaluation_mode?: EvaluationMode;
  judge_model?: string;
  metrics: {
    context_relevance: MetricDetail;
    faithfulness: MetricDetail;
    answer_accuracy: MetricDetail;
  };
  root_cause: RootCauseDiagnosis;
  release?: ReleaseGate;
  latency_ms?: number;
  timestamp?: string;
}

export interface BatchTestCase {
  test_id: string;
  query: string;
  category: RootCauseCategory;
  context_relevance: number;
  faithfulness: number;
  answer_accuracy: number | null;
  status: 'PASS' | 'FAIL' | 'REVIEW';
  generated_answer?: string;
  ground_truth?: string | null;
  summary_note?: string;
  type?: 'factoid' | 'unanswerable' | 'stale' | 'distractor';
}

export interface JudgeAgreement {
  agreement: number;
  n: number;
  false_pass: number;
  false_fail: number;
}

export interface BatchSummary {
  batch_id: string;
  dataset_name: string;
  pack_id?: PackId;
  total_evaluated: number;
  overall_score: number;
  duration_ms?: number;
  aggregates: {
    avg_context_relevance: number;
    avg_faithfulness: number;
    avg_answer_accuracy: number;
    pass_rate: number;
  };
  root_cause_breakdown: Record<string, number>;
  judge_agreement: JudgeAgreement | null;
  release: ReleaseGate;
  results: BatchTestCase[];
}

export interface DocumentChunk {
  chunk_id: string;
  text: string;
  page: number;
}

export interface DocumentItem {
  document_id: string;
  filename: string;
  title: string;
  category: 'policy' | 'candidate_resume' | 'job_description' | 'guide' | 'distractor' | 'terms' | 'protocol';
  version?: string;
  status: 'active' | 'superseded' | 'candidate';
  chunk_count: number;
  chunks: DocumentChunk[];
  pack_id?: PackId;
}

export interface IndustryPack {
  pack_id: PackId;
  name: string;
  description: string;
  trap_description: string;
  document_count: number;
  test_case_count: number;
  documents: DocumentItem[];
  cases: Record<string, EvaluationResult>;
  batchSummary: BatchSummary;
}

export interface RunHistoryItem {
  batch_id: string;
  pack_id: PackId;
  created_at: string;
  total_evaluated: number;
  pass_rate: number;
  overall_score: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface SyntheticTestCase {
  test_id: string;
  question: string;
  ground_truth_answer: string;
  source_chunk_id: string;
  context_snippet: string;
  archetype: string;
}
