# NVIDIA NIM APIs — Available Models & Integration Guide (AI-04 RAGSeal)

> **Audience**: Sarthak's Claude (Backend Agent `/backend` & Core Engine Agent `/engine`).  
> **Source Catalog**: [NVIDIA Build NIM Catalog](https://build.nvidia.com/models?filters=nimType%3Anim_type_preview%2CnimType%3Anim_type_run_anywhere%2CnimType%3Anim_type_upgrade_available&page=1&orderBy=weightPopular%3ADESC)  
> **Catalog Filter**: `nimType=preview`, `nimType=run_anywhere`, `nimType=upgrade_available`, sorted by `weightPopular:DESC`.

---

## 1. Executive Summary & Value for RAGSeal

NVIDIA NIM (NVIDIA Inference Microservices) provides enterprise-grade, cloud-hosted preview inference endpoints accessible via standard OpenAI client libraries (`https://integrate.api.nvidia.com/v1`).

### Why Sarthak's Claude Should Use This in `/engine` and `/backend`:
1. **Sub-second Hosted Inference**: Eliminates thermal throttling and latency bottlenecks from running 70B models locally on a laptop during the live pitch.
2. **Gold-Standard Judge**: Access to `meta/llama-3.3-70b-instruct` and `deepseek-ai/deepseek-r1` as infallible evaluation judges for context relevance, faithfulness, and answer accuracy.
3. **Target Generator Under Test**: Access to `meta/llama-3.2-3b-instruct` and `meta/llama-3.1-8b-instruct` as realistic generators whose hallucinations and omissions we systematically test and diagnose.
4. **NeMo Retriever Embeddings**: SOTA dense document embeddings via `nvidia/nv-embedqa-e5-v5` for vector indexing across ATS/banking packs.
5. **Replay Experiment Execution**: Rapid second-pass generation using only gold context chunks (`chk_gold`) to generate causal proof for `RETRIEVAL_FAILURE` vs `GENERATION_HALLUCINATION`.

---

## 2. Model Catalog & Pipeline Role Assignment

| Model ID on NVIDIA NIM | Role in RAGSeal | Context Window | Recommended Parameters | Why This Model |
| :--- | :--- | :--- | :--- | :--- |
| **`meta/llama-3.3-70b-instruct`** | **Primary Evaluation Judge** | 128k | `temperature=0.0`, `max_tokens=1024` | Frontier evaluation precision. Formats structured JSON judgments for the 3 core metrics. |
| **`deepseek-ai/deepseek-r1`** | **Reasoning / Diagnostic Judge** | 64k | `temperature=0.2`, `max_tokens=2048` | Deep logical reasoning for complex causal chain analysis (e.g. conflicting policy versions). |
| **`meta/llama-3.2-3b-instruct`** | **Generator Under Test (Target)** | 128k | `temperature=0.7`, `max_tokens=512` | Matches `product_brief.md` spec (`llama3.2:3b`). Fast, lightweight, exhibits natural failure modes. |
| **`meta/llama-3.1-8b-instruct`** | **Alternative Generator** | 128k | `temperature=0.7`, `max_tokens=512` | Baseline enterprise-grade generator. |
| **`nvidia/llama-3.1-nemotron-70b-instruct`** | **Synthetic Question Generator** | 128k | `temperature=0.8`, `max_tokens=1024` | Excellent instruction-following for crafting tricky, adversarial RAG probe questions. |
| **`nvidia/nv-embedqa-e5-v5`** | **NeMo Retriever Embeddings** | 512 tokens | `input_type="passage"` / `"query"` | Top-tier MTEB retrieval embeddings for document indexing and query vector search. |
| **`nvidia/nemotron-3.5-rerank-8b`** | **Cross-Encoder Reranker** | 4k tokens | Top-N reranking | High-accuracy chunk reranker for context relevance scoring. |

---

## 3. Quickstart & Integration Pattern

NVIDIA NIM preview endpoints are fully compliant with the OpenAI API specification.

### 3.1 Environment Setup (`.env`)
```bash
# NVIDIA NIM API Key (generated from https://build.nvidia.com/settings/api-keys)
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

# Model Selectors
NVIDIA_JUDGE_MODEL=meta/llama-3.3-70b-instruct
NVIDIA_GENERATOR_MODEL=meta/llama-3.2-3b-instruct
NVIDIA_EMBED_MODEL=nvidia/nv-embedqa-e5-v5
```

### 3.2 Python Client Example (OpenAI SDK)

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    api_key=os.getenv("NVIDIA_API_KEY")
)

# 1. Generator Call (The RAG response under test)
def generate_rag_answer(query: str, context: str) -> str:
    response = client.chat.completions.create(
        model="meta/llama-3.2-3b-instruct",
        messages=[
            {"role": "system", "content": "Answer the question using ONLY the provided context. If not documented, state 'Not documented'."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
        ],
        temperature=0.2,
        max_tokens=512
    )
    return response.choices[0].message.content

# 2. Replay Call with Gold Chunk (The Causal Verdict Hero)
def replay_with_gold_chunk(query: str, gold_chunk_text: str) -> str:
    return generate_rag_answer(query, gold_chunk_text)

# 3. Judge Call (Faithfulness / Hallucination Detection)
def evaluate_faithfulness(answer: str, context: str) -> dict:
    prompt = f"""You are an unbiased RAG evaluation judge.
Context:
{context}

Generated Answer:
{answer}

Task:
1. Identify every factual claim in the answer.
2. Determine if each claim is directly supported by the context.
3. Output valid JSON in this exact structure:
{{
  "score": 0.0 to 1.0,
  "status": "PASS" or "FAIL",
  "hallucinated_claims": ["claim 1 if unsupported"],
  "details": "concise explanation"
}}
"""
    response = client.chat.completions.create(
        model="meta/llama-3.3-70b-instruct",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        response_format={"type": "json_object"} if hasattr(client, "response_format") else None
    )
    return response.choices[0].message.content
```

---

## 4. NeMo Retriever Embeddings (`nvidia/nv-embedqa-e5-v5`)

```python
# Create embeddings for indexing document chunks
def embed_chunks(chunks: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model="nvidia/nv-embedqa-e5-v5",
        input=chunks,
        encoding_format="float",
        extra_body={
            "input_type": "passage",  # Crucial: 'passage' for corpus, 'query' for search
            "truncate": "END"
        }
    )
    return [item.embedding for item in response.data]

# Create embedding for search query
def embed_query(query: str) -> list[float]:
    response = client.embeddings.create(
        model="nvidia/nv-embedqa-e5-v5",
        input=[query],
        encoding_format="float",
        extra_body={
            "input_type": "query",
            "truncate": "END"
        }
    )
    return response.data[0].embedding
```

---

## 5. Architectural Alignment with `docs/product_brief.md` & `docs/api_contract.md`

| Contract Field in v2 API | How NVIDIA NIM Fulfills It |
| :--- | :--- |
| `evaluation_mode` | Set to `"hosted"` when using NVIDIA NIM (set to `"local"` when using local Ollama). |
| `judge_model` | Returns `"meta/llama-3.3-70b-instruct"` or `"deepseek-ai/deepseek-r1"`. |
| `replay.answer` | Generated via `meta/llama-3.2-3b-instruct` using only `gold_chunk_ids`. |
| `replay.verdict_effect` | Computed by comparing original accuracy vs replay accuracy. |
| `judged_by` | Set to `"model"` for NVIDIA NIM LLM evaluations. |

---

## 6. Pre-Built Engine Adapter

For convenience, a drop-in Python wrapper is available at [`engine/nvidia_client.py`](file:///Users/root1/hackathon/engine/nvidia_client.py).  
Sarthak's Claude can import and call it directly inside FastAPI routes in `/backend` or evaluation metrics in `/engine`.
