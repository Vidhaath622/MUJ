export type MetricStatus = 'PASS' | 'FAIL' | 'UNCERTAIN';

export type RootCauseCategory = 
  | 'CLEAN_PASS' 
  | 'RETRIEVAL_FAILURE' 
  | 'GENERATION_HALLUCINATION' 
  | 'COMPOUND_FAILURE';

export type ReleaseDecision = 'SHIP' | 'REVIEW' | 'BLOCK';

export type EvaluationMode = 'llm' | 'fallback';
export type JudgedBy = 'model' | 'rule';

export interface RetrievedChunk {
  chunk_id: string;
  document_name: string;
  text: string;
  relevance_score: number;
  is_relevant: boolean;
  page?: number;
  is_ground_truth_chunk?: boolean;
}

export interface MetricDetail {
  score: number;
  status: MetricStatus;
  details: string;
  judged_by?: JudgedBy;
  threshold?: number;
  hallucinated_claims?: string[];
}

export interface RootCauseDiagnosis {
  category: RootCauseCategory;
  summary: string;
  recommended_action: string;
  evidence_notes?: string[];
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
  ground_truth?: string;
  document_id: string;
  document_name?: string;
  retrieved_chunks: RetrievedChunk[];
  ground_truth_chunk_ids?: string[];
  retrieved_chunk_ids?: string[];
  evaluation_mode?: EvaluationMode;
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
  answer_accuracy: number;
  status: 'PASS' | 'FAIL';
  generated_answer?: string;
  ground_truth?: string;
  summary_note?: string;
}

export interface BatchSummary {
  batch_id: string;
  dataset_name: string;
  total_evaluated: number;
  overall_score: number;
  aggregates: {
    avg_context_relevance: number;
    avg_faithfulness: number;
    avg_answer_accuracy: number;
    pass_rate: number;
  };
  root_cause_breakdown: Record<RootCauseCategory, number>;
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
  category: 'policy' | 'candidate_resume' | 'job_description' | 'guide' | 'distractor';
  version?: string;
  status: 'active' | 'superseded' | 'candidate';
  chunk_count: number;
  chunks: DocumentChunk[];
}

export interface SyntheticTestCase {
  test_id: string;
  question: string;
  ground_truth_answer: string;
  source_chunk_id: string;
  context_snippet: string;
  archetype: string;
}
