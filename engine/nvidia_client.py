"""
NVIDIA NIM Client for RAGSeal (AI-04 RAG Evaluation Pipeline).

Supports OpenAI-compatible NVIDIA NIM preview endpoints:
- Base URL: https://integrate.api.nvidia.com/v1
- Generator models: meta/llama-3.2-3b-instruct, meta/llama-3.1-8b-instruct
- Judge models: meta/llama-3.3-70b-instruct, deepseek-ai/deepseek-r1
- Synthetic generator: nvidia/llama-3.1-nemotron-70b-instruct
- Embeddings: nvidia/nv-embedqa-e5-v5
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("ragseal.engine.nvidia")

DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_GENERATOR_MODEL = "meta/llama-3.2-3b-instruct"
DEFAULT_JUDGE_MODEL = "meta/llama-3.3-70b-instruct"
DEFAULT_SYNTHETIC_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"
DEFAULT_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"


class NvidiaNimClient:
    """Wrapper around NVIDIA NIM endpoints with automatic fallback to offline/mock mode."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        generator_model: str = DEFAULT_GENERATOR_MODEL,
        judge_model: str = DEFAULT_JUDGE_MODEL,
    ):
        self.api_key = api_key or os.getenv("NVIDIA_API_KEY")
        self.base_url = base_url or os.getenv("NVIDIA_BASE_URL", DEFAULT_BASE_URL)
        self.generator_model = generator_model or os.getenv("NVIDIA_GENERATOR_MODEL", DEFAULT_GENERATOR_MODEL)
        self.judge_model = judge_model or os.getenv("NVIDIA_JUDGE_MODEL", DEFAULT_JUDGE_MODEL)
        
        self._openai_client = None
        if self.api_key:
            try:
                from openai import OpenAI
                self._openai_client = OpenAI(
                    base_url=self.base_url,
                    api_key=self.api_key,
                )
                logger.info("Initialized live NVIDIA NIM OpenAI client at %s", self.base_url)
            except ImportError:
                logger.warning("openai package not installed. Install via `pip install openai`.")
        else:
            logger.info("No NVIDIA_API_KEY detected. Running in mock/fallback mode.")

    @property
    def is_live(self) -> bool:
        return self._openai_client is not None

    # -------------------------------------------------------------------------
    # 1. Generator under test (Target RAG generation)
    # -------------------------------------------------------------------------
    def generate_answer(
        self,
        query: str,
        context: str,
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 512,
    ) -> str:
        """Call the target LLM under test using the provided context."""
        target_model = model or self.generator_model

        if not self.is_live:
            return (
                f"[Simulated {target_model}] Based on the provided context, "
                f"the answer for '{query}' is derived directly from the document snippet."
            )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful knowledge assistant. Answer the user's question "
                    "using ONLY the facts provided in the Context below. If the information "
                    "is not present in the context, explicitly respond with: 'The provided documents "
                    "do not contain information to answer this question.'"
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}",
            },
        ]

        resp = self._openai_client.chat.completions.create(
            model=target_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content.strip()

    # -------------------------------------------------------------------------
    # 2. Replay with Gold Chunk (The Causal Verdict Hero)
    # -------------------------------------------------------------------------
    def replay_with_gold(
        self,
        query: str,
        gold_chunk_text: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Re-run the generator with ONLY the verified gold chunk.
        If this succeeds, it causally isolates the failure to retrieval.
        """
        replayed_answer = self.generate_answer(
            query=query,
            context=gold_chunk_text,
            model=model or self.generator_model,
            temperature=0.0,
        )
        return {
            "query": query,
            "replayed_answer": replayed_answer,
            "gold_chunk_length": len(gold_chunk_text),
            "model": model or self.generator_model,
        }

    # -------------------------------------------------------------------------
    # 3. Judge: Faithfulness / Groundedness (NLI Hallucination Detector)
    # -------------------------------------------------------------------------
    def judge_faithfulness(
        self,
        answer: str,
        context: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Judge whether every factual claim in the generated answer is strictly
        supported by the retrieved context.
        """
        judge_model = model or self.judge_model

        if not self.is_live:
            return {
                "score": 0.95,
                "status": "PASS",
                "hallucinated_claims": [],
                "details": "Mock judge: all claims verified against retrieved passages.",
                "judged_by": "rule",
            }

        prompt = f"""You are a strict, objective RAG evaluator measuring Faithfulness / Groundedness.

Retrieved Context:
\"\"\"
{context}
\"\"\"

Candidate Answer:
\"\"\"
{answer}
\"\"\"

Instructions:
1. Break down the Candidate Answer into individual factual claims.
2. Check each claim against the Retrieved Context.
3. If a claim cannot be directly deduced from the context, it is a HALLUCINATION.
4. Output your analysis as valid JSON matching this exact structure:
{{
  "score": 0.85,
  "status": "PASS",
  "hallucinated_claims": ["claim 1"],
  "details": "Clear 1-2 sentence rationale."
}}
Threshold: score >= 0.75 is PASS, < 0.75 is FAIL.
Respond with JSON only. Do not add markdown or backticks."""

        resp = self._openai_client.chat.completions.create(
            model=judge_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=600,
        )
        raw_text = resp.choices[0].message.content.strip()
        return self._safe_parse_json(raw_text, default_score=0.75, metric_name="faithfulness")

    # -------------------------------------------------------------------------
    # 4. Judge: Context Relevance
    # -------------------------------------------------------------------------
    def judge_context_relevance(
        self,
        query: str,
        chunk_text: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Evaluate whether a retrieved chunk contains information needed to answer the query."""
        judge_model = model or self.judge_model

        if not self.is_live:
            return {
                "score": 0.90,
                "status": "PASS",
                "is_relevant": True,
                "details": "Mock judge: chunk contains essential keywords and entities.",
                "judged_by": "rule",
            }

        prompt = f"""You are an objective RAG evaluator measuring Context Relevance.

User Query:
\"{query}\"

Retrieved Chunk:
\"\"\"
{chunk_text}
\"\"\"

Instructions:
1. Determine if this chunk contains facts or guidance needed to answer the query.
2. Output your rating as valid JSON:
{{
  "score": 0.90,
  "status": "PASS",
  "is_relevant": true,
  "details": "Explanation of why chunk is or is not relevant."
}}
Threshold: score >= 0.70 is PASS, < 0.70 is FAIL.
Respond with JSON only."""

        resp = self._openai_client.chat.completions.create(
            model=judge_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=400,
        )
        raw_text = resp.choices[0].message.content.strip()
        return self._safe_parse_json(raw_text, default_score=0.70, metric_name="context_relevance")

    # -------------------------------------------------------------------------
    # 5. Judge: Answer Accuracy / Correctness
    # -------------------------------------------------------------------------
    def judge_answer_accuracy(
        self,
        answer: str,
        ground_truth: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Evaluate semantic equivalence between the answer and ground truth."""
        judge_model = model or self.judge_model

        if not self.is_live:
            return {
                "score": 0.92,
                "status": "PASS",
                "details": "Mock judge: answer matches ground truth semantics.",
                "judged_by": "rule",
            }

        prompt = f"""You are an objective RAG evaluator measuring Answer Correctness against Ground Truth.

Ground Truth:
\"{ground_truth}\"

Generated Answer:
\"{answer}\"

Instructions:
1. Compare the core facts in the Generated Answer with the Ground Truth.
2. Ignore stylistic differences; focus on factual correctness and completeness.
3. Output JSON:
{{
  "score": 0.95,
  "status": "PASS",
  "details": "1 sentence explanation."
}}
Threshold: score >= 0.70 is PASS, < 0.70 is FAIL.
Respond with JSON only."""

        resp = self._openai_client.chat.completions.create(
            model=judge_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=400,
        )
        raw_text = resp.choices[0].message.content.strip()
        return self._safe_parse_json(raw_text, default_score=0.70, metric_name="answer_accuracy")

    # -------------------------------------------------------------------------
    # 6. NeMo Retriever Embeddings
    # -------------------------------------------------------------------------
    def get_embeddings(
        self,
        texts: List[str],
        input_type: str = "passage",
        model: str = DEFAULT_EMBED_MODEL,
    ) -> List[List[float]]:
        """Compute dense embeddings using NVIDIA NeMo Retriever."""
        if not self.is_live:
            # 384-dimensional synthetic vector
            return [[0.05] * 384 for _ in texts]

        resp = self._openai_client.embeddings.create(
            model=model,
            input=texts,
            encoding_format="float",
            extra_body={
                "input_type": input_type,
                "truncate": "END",
            },
        )
        return [item.embedding for item in resp.data]

    # -------------------------------------------------------------------------
    # Helper: Robust JSON parser
    # -------------------------------------------------------------------------
    def _safe_parse_json(self, text: str, default_score: float, metric_name: str) -> Dict[str, Any]:
        try:
            cleaned = text.strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()
            parsed = json.loads(cleaned)
            parsed["judged_by"] = "model"
            return parsed
        except Exception as err:
            logger.warning("Failed to parse judge JSON (%s): %s", err, text)
            return {
                "score": default_score,
                "status": "REVIEW",
                "details": f"Model judgment fallback due to format parsing: {text[:120]}...",
                "judged_by": "rule",
            }
