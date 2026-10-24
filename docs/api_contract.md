# API Contract & Schema Specification
## Problem Statement: AI-04 (RAG Evaluation Pipeline)

> **Audience**: 
> - **Frontend** (Vidhaath + Antigravity) $\rightarrow$ uses these TypeScript types and mock endpoints.
> - **Backend** (Sarthak + Claude 1) $\rightarrow$ implements these FastAPI routes and Pydantic models.
> - **Core Engine** (Sarthak + Claude 2) $\rightarrow$ implements evaluation algorithms matching these outputs.

---

## 1. Core Evaluation Metrics & Root-Cause Categories

### Metrics
1. **Context Relevance** (`context_relevance`): `0.0 – 1.0`
   - Does the retrieved chunk contain information needed to answer the query?
   - $\ge 0.70$: Pass (Green) \| $< 0.70$: Fail (Red)
2. **Faithfulness / Groundedness** (`faithfulness`): `0.0 – 1.0`
   - Can every claim in the generated answer be directly inferred from the retrieved context?
   - $\ge 0.75$: Pass (Green) \| $< 0.75$: Fail / Hallucination (Red)
3. **Answer Accuracy / Correctness** (`answer_accuracy`): `0.0 – 1.0`
   - Does the answer match the ground-truth answer semantically?
   - $\ge 0.70$: Pass (Green) \| $< 0.70$: Fail (Red)

### Root-Cause Diagnosis Categories
* `CLEAN_PASS`: Both retriever and generator performed accurately.
* `RETRIEVAL_FAILURE`: Retriever missed relevant context $\rightarrow$ generator failed due to lack of info.
* `GENERATION_HALLUCINATION`: Retriever found relevant context, but generator fabricated unsupported claims.
* `COMPOUND_FAILURE`: Both retrieval and generation failed independently.

---

## 2. API Endpoints

### 2.1 Health Check
* **`GET /api/health`**
* **Response**:
```json
{
  "status": "ok",
  "engine_ready": true,
  "timestamp": "2026-10-24T13:00:00Z"
}
```

---

### 2.2 Upload Document
* **`POST /api/documents/upload`**
* **Content-Type**: `multipart/form-data`
* **Form Field**: `file` (PDF, TXT, or MD)
* **Response**:
```json
{
  "document_id": "doc_98234",
  "filename": "company_policy.pdf",
  "chunk_count": 12,
  "chunks": [
    {
      "chunk_id": "chk_001",
      "text": "Employees receive 20 days paid leave per calendar year...",
      "page": 1
    }
  ]
}
```

---

### 2.3 Single Query Evaluation (Live Diagnostics)
* **`POST /api/evaluate/query`**
* **Request Body**:
```json
{
  "query": "How many days of paid leave are allowed?",
  "document_id": "doc_98234",
  "optional_manual_answer": null,
  "optional_ground_truth": "20 days per calendar year."
}
```
* **Response**:
```json
{
  "evaluation_id": "eval_5501",
  "query": "How many days of paid leave are allowed?",
  "generated_answer": "Employees receive 25 days of annual vacation leave.",
  "ground_truth": "20 days per calendar year.",
  "retrieved_chunks": [
    {
      "chunk_id": "chk_001",
      "text": "Employees receive 20 days paid leave per calendar year. Unused leave expires on Dec 31st.",
      "relevance_score": 0.94,
      "is_relevant": true
    }
  ],
  "metrics": {
    "context_relevance": {
      "score": 0.94,
      "status": "PASS",
      "details": "Retrieved context directly covers annual leave allocation."
    },
    "faithfulness": {
      "score": 0.30,
      "status": "FAIL",
      "details": "Model fabricated '25 days' when source chunk states '20 days'.",
      "hallucinated_claims": ["Employees receive 25 days"]
    },
    "answer_accuracy": {
      "score": 0.40,
      "status": "FAIL",
      "details": "Contradicts ground truth (25 days vs 20 days)."
    }
  },
  "root_cause": {
    "category": "GENERATION_HALLUCINATION",
    "summary": "Retriever fetched accurate context, but the LLM hallucinated an unsupported number.",
    "recommended_action": "Tighten generator temperature or apply strict extraction prompt."
  }
}
```

---

### 2.4 Synthetic Test-Question Generator
* **`POST /api/synthetic/generate`**
* **Request Body**:
```json
{
  "document_id": "doc_98234",
  "count": 5
}
```
* **Response**:
```json
{
  "document_id": "doc_98234",
  "generated_count": 5,
  "test_cases": [
    {
      "test_id": "tc_01",
      "question": "When does unused annual leave expire?",
      "ground_truth_answer": "Unused leave expires on December 31st.",
      "source_chunk_id": "chk_001",
      "context_snippet": "Unused leave expires on Dec 31st."
    }
  ]
}
```

---

### 2.5 Batch Test Suite Evaluation
* **`POST /api/evaluate/batch`**
* **Request Body**:
```json
{
  "document_id": "doc_98234",
  "test_cases": [
    {
      "test_id": "tc_01",
      "question": "When does unused annual leave expire?",
      "ground_truth_answer": "Unused leave expires on December 31st."
    }
  ]
}
```
* **Response**:
```json
{
  "batch_id": "batch_9921",
  "total_evaluated": 5,
  "overall_score": 0.82,
  "aggregates": {
    "avg_context_relevance": 0.88,
    "avg_faithfulness": 0.76,
    "avg_answer_accuracy": 0.82,
    "pass_rate": 0.80
  },
  "root_cause_breakdown": {
    "CLEAN_PASS": 4,
    "RETRIEVAL_FAILURE": 1,
    "GENERATION_HALLUCINATION": 0,
    "COMPOUND_FAILURE": 0
  },
  "results": [
    {
      "test_id": "tc_01",
      "query": "When does unused annual leave expire?",
      "category": "CLEAN_PASS",
      "context_relevance": 0.95,
      "faithfulness": 0.98,
      "answer_accuracy": 0.96
    }
  ]
}
```

---

## 3. TypeScript Interfaces (For `/frontend`)

```typescript
export type MetricStatus = 'PASS' | 'FAIL';

export type RootCauseCategory = 
  | 'CLEAN_PASS' 
  | 'RETRIEVAL_FAILURE' 
  | 'GENERATION_HALLUCINATION' 
  | 'COMPOUND_FAILURE';

export interface RetrievedChunk {
  chunk_id: string;
  text: string;
  relevance_score: number;
  is_relevant: boolean;
  page?: number;
}

export interface MetricDetail {
  score: number;
  status: MetricStatus;
  details: string;
  hallucinated_claims?: string[];
}

export interface EvaluationResult {
  evaluation_id: string;
  query: string;
  generated_answer: string;
  ground_truth?: string;
  retrieved_chunks: RetrievedChunk[];
  metrics: {
    context_relevance: MetricDetail;
    faithfulness: MetricDetail;
    answer_accuracy: MetricDetail;
  };
  root_cause: {
    category: RootCauseCategory;
    summary: string;
    recommended_action: string;
  };
}

export interface BatchSummary {
  batch_id: string;
  total_evaluated: number;
  overall_score: number;
  aggregates: {
    avg_context_relevance: number;
    avg_faithfulness: number;
    avg_answer_accuracy: number;
    pass_rate: number;
  };
  root_cause_breakdown: Record<RootCauseCategory, number>;
  results: {
    test_id: string;
    query: string;
    category: RootCauseCategory;
    context_relevance: number;
    faithfulness: number;
    answer_accuracy: number;
  }[];
}
```

---

## 4. v2 Additions (Lead, Oct 24) - additive, nothing above is removed

> Base URL `http://localhost:8000`. Every endpoint except `/api/health` and `/api/auth/*` needs `Authorization: Bearer <token>`. See `docs/product_brief.md` for why each addition exists.

### 4.1 Auth
* **`POST /api/auth/register`** and **`POST /api/auth/login`**, body `{ "email": "...", "password": "..." }`
* **Response**: `{ "access_token": "jwt...", "token_type": "bearer", "user": { "id": "usr_1", "email": "demo@ragseal.dev" } }`
* **`GET /api/auth/me`** returns the `user` object. A seeded demo account exists: `demo@ragseal.dev` / `demo1234`.

### 4.2 Documents (per user)
* **`GET /api/documents`** returns `[{ document_id, filename, chunk_count, pack_id | null, uploaded_at }]`
* **`DELETE /api/documents/{document_id}`**
* `POST /api/documents/upload` unchanged, now saved to the logged-in user.

### 4.3 Industry packs
* **`GET /api/packs`** returns `[{ pack_id: "recruitment" | "banking" | "healthcare", name, description, document_count, test_case_count }]`
* **`POST /api/packs/{pack_id}/load`** loads the pack's documents and test cases for this user and returns `{ pack_id, document_ids: [...], test_cases: [TestCase] }`

### 4.4 Plain RAG (the "Lab" ask box)
* **`POST /api/rag/ask`**, body `{ "query": "...", "document_ids": ["doc_1"] }`
* **Response**: `{ "answer": "...", "retrieved_chunks": [RetrievedChunk], "citations": ["chk_001"], "latency_ms": 840, "model": "llama3.2:3b" }`

### 4.5 Changes to evaluation responses (`/api/evaluate/query` and each batch result)
New fields:
```json
{
  "gold_chunk_ids": ["chk_004"],
  "retrieved_chunk_ids": ["chk_001", "chk_007"],
  "gold_retrieved": false,
  "replay": {
    "answer": "Unused leave expires on December 31st.",
    "answer_accuracy": 0.95,
    "faithfulness": 1.0,
    "verdict_effect": "Replay with the gold chunk fixed the answer, so the retriever is at fault."
  },
  "root_cause": {
    "category": "RETRIEVAL_FAILURE",
    "summary": "...",
    "recommended_action": "...",
    "evidence": [ { "chunk_id": "chk_004", "text": "...", "role": "gold_missing" } ]
  },
  "evaluation_mode": "local",
  "judge_model": "qwen3:8b"
}
```
* `replay` is `null` when not run (for example CLEAN_PASS).
* `evaluation_mode`: `"local"` (Ollama) or `"hosted"` (Groq judge).
* Each `MetricDetail` gains `"judged_by": "model" | "rule"`.
* `MetricStatus` gains `"REVIEW"` (amber).
* `RootCauseCategory` gains `"NEEDS_REVIEW"` and `"UNRESOLVED"`.

### 4.6 Changes to batch responses
New fields:
```json
{
  "pack_id": "banking",
  "judge_agreement": { "agreement": 0.86, "n": 30, "false_pass": 2, "false_fail": 2 },
  "root_cause_breakdown": { "CLEAN_PASS": 0, "RETRIEVAL_FAILURE": 0, "GENERATION_HALLUCINATION": 0, "COMPOUND_FAILURE": 0, "NEEDS_REVIEW": 0, "UNRESOLVED": 0 },
  "duration_ms": 41200
}
```
* `judge_agreement` is `null` when there are no human labels for the cases.

### 4.7 Run history
* **`GET /api/runs`** returns `[{ batch_id, pack_id, created_at, total_evaluated, pass_rate }]` for this user.
* **`GET /api/runs/{batch_id}`** returns the full batch response.

### 4.8 TypeScript additions
```typescript
export type MetricStatus = 'PASS' | 'FAIL' | 'REVIEW';
export type RootCauseCategory =
  | 'CLEAN_PASS' | 'RETRIEVAL_FAILURE' | 'GENERATION_HALLUCINATION'
  | 'COMPOUND_FAILURE' | 'NEEDS_REVIEW' | 'UNRESOLVED';
export type PackId = 'recruitment' | 'banking' | 'healthcare';

export interface Replay {
  answer: string;
  answer_accuracy: number;
  faithfulness: number;
  verdict_effect: string;
}
export interface EvidenceItem { chunk_id: string; text: string; role: string; }
export interface JudgeAgreement { agreement: number; n: number; false_pass: number; false_fail: number; }
// EvaluationResult gains: gold_chunk_ids, retrieved_chunk_ids, gold_retrieved,
// replay: Replay | null, root_cause.evidence: EvidenceItem[],
// evaluation_mode: 'local' | 'hosted', judge_model: string
// MetricDetail gains: judged_by: 'model' | 'rule'
// BatchSummary gains: pack_id, judge_agreement: JudgeAgreement | null, duration_ms
```

### 4.9 Clarifications (Builder implementation notes)
* **No ground truth:** `metrics.answer_accuracy.score` is `null`, `status` is `"REVIEW"` and `judged_by` is `"rule"`. The frontend must render `null` as "No ground truth" (amber), never as 0. So `MetricDetail.score` is `number | null`.
* **Batch result items** are the full `EvaluationResult` plus the v1 flat fields (`test_id`, `category`, `context_relevance`, `faithfulness`, `answer_accuracy` as numbers or `null`).
* **Extra optional fields:**
  * `metrics.<name>.claims: { claim: string; supported: boolean; chunk_id?: string }[]`
  * `retrieved_chunks[].similarity: number`, `.document_id: string`, `.cited: boolean`
  * `TestCase.type: 'factoid' | 'unanswerable' | 'stale' | 'distractor'`
* **Human labels for judge agreement:** `labels.json`, created with the engine's label CLI. Members 3 and 4 do the labelling. Until labels exist, `judge_agreement` is `null`; show "Not measured yet", not a number.

### 4.10 Batch by pack (preferred for packs)
* `POST /api/evaluate/batch` accepts `{ "pack_id": "banking" }` with no `document_id` or `test_cases`. The backend loads the pack's documents and all its cases, including `gold_chunk_ids`, `stale_chunk_ids` and `type`, so replay and trap cases work.
* If `test_cases` are sent by hand, each may include `gold_chunk_ids`, `stale_chunk_ids` and `type`, exactly as returned by `POST /api/packs/{id}/load`.
* Errors on every endpoint return `{ "detail": "..." }` with 401, 404, 422 or 503. See `docs/frontend_integration_notes.md`.
