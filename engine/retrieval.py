"""Retrieval beyond plain dense search, each part optional and off by default.

  dense   cosine similarity of embeddings (the default, unchanged)
  hybrid  BM25 keyword scores and dense similarity, fused by reciprocal rank (RRF): a chunk ranked
          well by either method rises. Exact figures, codes and names ("Notice 2024-80",
          "₹1,275,000") are where keywords beat embeddings.
  rerank  fetch a wider pool (20), let a model order it by usefulness for the question, keep top-k.
          One call per question to the judge pool, cached like every judge call.

Set from the environment: RAGSEAL_RETRIEVAL=dense|hybrid, RAGSEAL_RERANK=1, RAGSEAL_RERANK_POOL=20.
"""

from __future__ import annotations

import logging
import math
import os
import re
from collections import Counter
from dataclasses import dataclass

from .ingest import Chunk

log = logging.getLogger(__name__)

MODES = ("dense", "hybrid")


@dataclass(frozen=True)
class RetrievalConfig:
    mode: str = "dense"
    rerank: bool = False
    pool: int = 20  # candidates the reranker orders
    rrf_k: int = 60  # the usual RRF constant: a rank-1 hit scores 1/61

    def __post_init__(self):
        if self.mode not in MODES:
            raise ValueError(f"retrieval mode must be one of {', '.join(MODES)}, not {self.mode!r}")

    @classmethod
    def from_env(cls) -> RetrievalConfig:
        return cls(
            mode=os.environ.get("RAGSEAL_RETRIEVAL", "dense").strip().lower() or "dense",
            rerank=os.environ.get("RAGSEAL_RERANK", "").strip().lower() in ("1", "true", "yes"),
            pool=int(os.environ.get("RAGSEAL_RERANK_POOL", "20")),
        )

    @property
    def label(self) -> str:
        return self.mode + ("+rerank" if self.rerank else "")


def tokenize(text: str) -> list[str]:
    """Lowercase words and numbers; thousands separators are dropped so "1,275,000" matches "1275000"."""
    return [t.replace(",", "") for t in re.findall(r"[a-z0-9]+(?:[.,][0-9]+)*", text.lower())]


class BM25:
    """Okapi BM25 over a small set of chunks (built per query: packs and uploads are small)."""

    def __init__(self, texts: list[str], k1: float = 1.5, b: float = 0.75):
        self.docs = [Counter(tokenize(t)) for t in texts]
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg = (sum(self.lengths) / len(self.lengths)) if self.lengths else 0.0
        self.k1, self.b = k1, b
        n = len(self.docs)
        df = Counter(term for d in self.docs for term in d)
        self.idf = {term: math.log(1 + (n - f + 0.5) / (f + 0.5)) for term, f in df.items()}

    def scores(self, query: str) -> list[float]:
        terms = set(tokenize(query))
        out = []
        for doc, length in zip(self.docs, self.lengths):
            score = 0.0
            for term in terms & doc.keys():
                tf = doc[term]
                score += self.idf[term] * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * length / (self.avg or 1)))
            out.append(score)
        return out


def rrf(rankings: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    """Reciprocal rank fusion: score(id) = sum over rankings of 1 / (k + rank). Ties keep first-seen order."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: -kv[1])


RERANK_SYSTEM = (
    "You rank search results for a question-answering system. Given a question and numbered passages, "
    "list the numbers of the passages that help answer the question, most useful first. Leave out passages that do not help."
)
RERANK_SCHEMA = {"type": "object", "properties": {"ranked": {"type": "array", "items": {"type": "integer"}}}, "required": ["ranked"]}


def rerank(judge, question: str, chunks: list[Chunk], keep: int) -> list[int]:
    """Indices into `chunks`, best first, `keep` long. The model's order first, then the rest in their
    original order (so a short or failed answer degrades to plain retrieval, never to fewer chunks)."""
    if len(chunks) <= 1:
        return list(range(len(chunks)))[:keep]
    passages = "\n\n".join(f"[{i}] {c.text[:700]}" for i, c in enumerate(chunks, start=1))
    try:
        ranked = judge.ask(RERANK_SYSTEM, f"Question: {question}\n\nPassages:\n\n{passages}", RERANK_SCHEMA).get("ranked", [])
    except Exception as exc:  # the reranker is an optimisation: never fail retrieval because of it
        log.warning("rerank failed, keeping retrieval order: %s", exc)
        ranked = []
    order: list[int] = []
    for n in ranked:
        if isinstance(n, int) and 1 <= n <= len(chunks) and n - 1 not in order:
            order.append(n - 1)
    order += [i for i in range(len(chunks)) if i not in order]
    return order[:keep]
