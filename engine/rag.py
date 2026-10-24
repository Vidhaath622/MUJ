"""The RAG system under test: retrieve top-k chunks, answer with the small model, cite sources."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from .ingest import Chunk
from .llm import ChatModel, EmbedModel
from .store import ScoredChunk, VectorStore

ABSTAIN_ANSWER = "I don't know based on the provided documents."

_ABSTAIN_PATTERNS = [
    r"\bi (?:do not|don't|cannot|can't) (?:know|find|answer|determine|say)\b",
    r"\b(?:not|no(?:thing)?) (?:mentioned|stated|specified|provided|found|available|covered|included)\b",
    r"\b(?:does not|doesn't|do not|don't) (?:mention|say|state|specify|contain|provide|include|cover)\b",
    r"\bno (?:information|mention|details?|data)\b",
    r"\binsufficient (?:information|context)\b",
    r"\bnot enough (?:information|context)\b",
]

GENERATOR_SYSTEM = (
    "You answer questions using ONLY the numbered context passages. "
    "Cite the passages you used with their numbers in square brackets, like [1] or [2][3]. "
    "Be concise: one to three sentences. "
    f"If the passages do not contain the answer, reply exactly: {ABSTAIN_ANSWER}"
)


def is_abstention(answer: str) -> bool:
    text = answer.strip().lower()
    if not text:
        return True
    return any(re.search(p, text) for p in _ABSTAIN_PATTERNS)


@dataclass
class RagAnswer:
    answer: str
    retrieved: list[ScoredChunk]
    citations: list[str]
    model: str
    latency_ms: int
    retrieval_ms: int = 0
    generation_ms: int = 0
    context_chunks: list[Chunk] = field(default_factory=list)


def build_prompt(query: str, chunks: list[Chunk]) -> str:
    blocks = [f"[{i}] {c.text}" for i, c in enumerate(chunks, start=1)]
    return "Context passages:\n\n" + "\n\n".join(blocks) + f"\n\nQuestion: {query}\nAnswer:"


def parse_citations(answer: str, chunks: list[Chunk]) -> list[str]:
    cited: list[str] = []
    for group in re.findall(r"\[([\d,\s]+)\]", answer):
        for number in re.findall(r"\d+", group):
            idx = int(number) - 1
            if 0 <= idx < len(chunks) and chunks[idx].chunk_id not in cited:
                cited.append(chunks[idx].chunk_id)
    return cited


class RagSystem:
    def __init__(self, store: VectorStore, generator: ChatModel, embedder: EmbedModel, top_k: int):
        self.store = store
        self.generator = generator
        self.embedder = embedder
        self.top_k = top_k

    @property
    def generator_model(self) -> str:
        return self.generator.model

    def embed_query(self, query: str) -> list[float]:
        return self.embedder.embed([query], "query")[0]

    def retrieve(self, owner_id: str, query: str, document_ids: list[str], k: int | None = None) -> list[ScoredChunk]:
        return self.store.search(owner_id, document_ids, self.embed_query(query), k or self.top_k)

    def generate(self, query: str, chunks: list[Chunk]) -> tuple[str, list[str], int]:
        if not chunks:
            return ABSTAIN_ANSWER, [], 0
        result = self.generator.chat(
            [{"role": "system", "content": GENERATOR_SYSTEM}, {"role": "user", "content": build_prompt(query, chunks)}],
            num_predict=256,
        )
        answer = result.text.strip()
        return answer, parse_citations(answer, chunks), result.latency_ms

    def ask(self, owner_id: str, query: str, document_ids: list[str], k: int | None = None) -> RagAnswer:
        start = time.perf_counter()
        retrieved = self.retrieve(owner_id, query, document_ids, k)
        retrieval_ms = int((time.perf_counter() - start) * 1000)
        chunks = [s.chunk for s in retrieved]
        answer, citations, generation_ms = self.generate(query, chunks)
        return RagAnswer(
            answer=answer,
            retrieved=retrieved,
            citations=citations,
            model=self.generator_model,
            latency_ms=int((time.perf_counter() - start) * 1000),
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
            context_chunks=chunks,
        )


def strip_citations(answer: str) -> str:
    return re.sub(r"\s*\[[\d,\s]+\]", "", answer).strip()
