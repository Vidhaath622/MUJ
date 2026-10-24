"""Engine facade used by the backend. Every method returns plain JSON-ready dicts.

    from engine import Engine
    eng = Engine()
    eng.ingest("usr_1", "policy.pdf", data)
    eng.ask("usr_1", "How many leave days?", ["doc_abc"])
"""

from __future__ import annotations

import time
import uuid
from typing import Callable

from .agreement import judge_agreement, load_labels
from .config import Settings, get_settings
from .evaluate import Evaluator, TestCase, failed_result, summarize_batch
from .ingest import ParsedDocument, parse_document
from .llm import ChatModel, EmbedModel, Judge, JudgeError, ModelUnavailable, build_models
from .packs import PackError, discover, read_document_bytes, resolve_test_cases
from .rag import RagSystem
from .store import VectorStore
from .synth import SyntheticGenerator, version_key


class NotFound(LookupError):
    pass


def _case_from_dict(raw: dict) -> TestCase:
    case_type = raw.get("type") or "factoid"
    gold = raw.get("gold_chunk_ids") or ([raw["source_chunk_id"]] if raw.get("source_chunk_id") else [])
    return TestCase(
        question=raw.get("question") or raw.get("query") or "",
        ground_truth=raw.get("ground_truth_answer") or raw.get("ground_truth") or None,
        test_id=raw.get("test_id"),
        gold_chunk_ids=list(gold),
        stale_chunk_ids=list(raw.get("stale_chunk_ids") or []),
        type=case_type,
        manual_answer=raw.get("manual_answer") or raw.get("optional_manual_answer"),
    )


class Engine:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        generator: ChatModel | None = None,
        embedder: EmbedModel | None = None,
        judge: Judge | None = None,
    ):
        self.settings = settings or get_settings()
        self.settings.data_dir.mkdir(parents=True, exist_ok=True)
        if generator is None or embedder is None or judge is None:
            models = build_models(self.settings)
            generator = generator or models.generator
            embedder = embedder or models.embedder
            judge = judge or Judge(models.judge, self.settings.data_dir / "judge_cache.sqlite")
        self.generator = generator
        self.embedder = embedder
        self.judge = judge
        self.store = VectorStore(self.settings.data_dir / "vectors.sqlite")
        self.rag = RagSystem(self.store, generator, embedder, self.settings.top_k)
        self.evaluator = Evaluator(self.store, self.rag, self.judge)
        self.synth = SyntheticGenerator(self.judge, self.rag)

    # ------------------------------------------------------------- status

    def status(self) -> dict:
        roles = {}
        for role, model in (("generator", self.generator), ("embeddings", self.embedder), ("judge", self.judge.chat_model)):
            ready, reason = model.ready()
            roles[role] = {"name": model.model, "provider": model.provider, "ready": ready, "error": reason}
        judge_ready = roles["judge"]["ready"]
        return {
            "engine_ready": all(r["ready"] for r in roles.values()),
            "models": roles,
            # "unavailable" tells the UI that no judge can run, rather than showing stale or made-up scores.
            "evaluation_mode": self.judge.mode if judge_ready else "unavailable",
            "judge_model": self.judge.model,
            "judge_provider": self.judge.provider,
            "generator_model": self.generator.model,
            "generator_provider": self.generator.provider,
            "embed_model": self.embedder.model,
            "embed_provider": self.embedder.provider,
        }

    # ---------------------------------------------------------- documents

    def _embed_and_store(self, owner_id: str, doc: ParsedDocument, pack_id: str | None):
        vectors = self.embedder.embed([c.text for c in doc.chunks], "passage")
        return self.store.add_document(owner_id, doc, vectors, self.embedder.key, pack_id)

    def _ensure_embeddings(self, owner_id: str, document_ids: list[str]) -> None:
        """Re-embed documents stored with a different embedding model (for example after switching provider)."""
        for document_id in self.store.documents_needing_embeddings(owner_id, document_ids, self.embedder.key):
            chunks = self.store.chunks_for(owner_id, [document_id])
            vectors = self.embedder.embed([c.text for c in chunks], "passage")
            self.store.replace_embeddings(owner_id, document_id, {c.chunk_id: v for c, v in zip(chunks, vectors)}, self.embedder.key)

    def ingest(self, owner_id: str, filename: str, data: bytes, pack_id: str | None = None) -> dict:
        doc = parse_document(filename, data, self.settings.chunk_chars)
        stored = self._embed_and_store(owner_id, doc, pack_id)
        return {
            "document_id": doc.document_id,
            "filename": doc.filename,
            "chunk_count": len(doc.chunks),
            "pack_id": pack_id,
            "uploaded_at": stored.uploaded_at,
            "chunks": [{"chunk_id": c.chunk_id, "text": c.text, "page": c.page} for c in doc.chunks],
        }

    def list_documents(self, owner_id: str) -> list[dict]:
        return [d.__dict__.copy() for d in self.store.list_documents(owner_id)]

    def get_document(self, owner_id: str, document_id: str) -> dict:
        doc = self.store.get_document(owner_id, document_id)
        if doc is None:
            raise NotFound(f"document {document_id} not found")
        out = doc.__dict__.copy()
        out["chunks"] = [
            {"chunk_id": c.chunk_id, "text": c.text, "page": c.page} for c in self.store.chunks_for(owner_id, [document_id])
        ]
        return out

    def delete_document(self, owner_id: str, document_id: str) -> None:
        if not self.store.delete_document(owner_id, document_id):
            raise NotFound(f"document {document_id} not found")

    def _check_documents(self, owner_id: str, document_ids: list[str]) -> list[str]:
        if not document_ids:
            raise NotFound("no document_ids given")
        missing = [d for d in document_ids if not self.store.has_document(owner_id, d)]
        if missing:
            raise NotFound(f"documents not found: {', '.join(missing)}")
        self._ensure_embeddings(owner_id, document_ids)
        return document_ids

    # ---------------------------------------------------------------- RAG

    def ask(self, owner_id: str, query: str, document_ids: list[str], k: int | None = None) -> dict:
        self._check_documents(owner_id, document_ids)
        result = self.rag.ask(owner_id, query, document_ids, k)
        return {
            "answer": result.answer,
            "retrieved_chunks": [
                {
                    "chunk_id": s.chunk.chunk_id,
                    "document_id": s.chunk.document_id,
                    "text": s.chunk.text,
                    "page": s.chunk.page,
                    # Plain RAG has no judge pass: this is retrieval similarity, not a judged relevance score.
                    "relevance_score": round(max(0.0, s.similarity), 4),
                    "is_relevant": s.chunk.chunk_id in result.citations,
                    "similarity": round(s.similarity, 4),
                    "cited": s.chunk.chunk_id in result.citations,
                }
                for s in result.retrieved
            ],
            "citations": result.citations,
            "latency_ms": result.latency_ms,
            "retrieval_ms": result.retrieval_ms,
            "generation_ms": result.generation_ms,
            "model": result.model,
        }

    # --------------------------------------------------------- evaluation

    def evaluate_query(
        self,
        owner_id: str,
        query: str,
        document_ids: list[str],
        ground_truth: str | None = None,
        manual_answer: str | None = None,
        gold_chunk_ids: list[str] | None = None,
        case_type: str = "factoid",
    ) -> dict:
        self._check_documents(owner_id, document_ids)
        case = TestCase(
            question=query,
            ground_truth=ground_truth or None,
            gold_chunk_ids=gold_chunk_ids or [],
            type=case_type,
            manual_answer=manual_answer,
        )
        return self.evaluator.evaluate(owner_id, case, document_ids)

    def evaluate_batch(
        self,
        owner_id: str,
        document_ids: list[str],
        test_cases: list[dict],
        pack_id: str | None = None,
        progress: Callable[[int, int], None] | None = None,
    ) -> dict:
        self._check_documents(owner_id, document_ids)
        started = time.perf_counter()
        cases = [_case_from_dict(raw) for raw in test_cases]
        for i, case in enumerate(cases, start=1):
            case.test_id = case.test_id or f"tc_{i:02d}"
        done = 0

        def run(case: TestCase) -> dict:
            nonlocal done
            try:
                result = self.evaluator.evaluate(owner_id, case, document_ids)
            except (ModelUnavailable, JudgeError) as exc:
                result = failed_result(case, exc, self.judge, self.generator.model)
            done += 1
            if progress:
                progress(done, len(cases))
            return result

        # One case at a time: local Ollama serializes anyway, and hosted free tiers are
        # rate-limited per minute, so parallel calls only add 429 retries.
        evaluations = [run(case) for case in cases]
        if evaluations and all(ev.get("error") for ev in evaluations):
            # Nothing could run (provider down or out of quota): report that instead of an all-UNRESOLVED batch.
            raise ModelUnavailable(evaluations[0]["error"])

        results = []
        for ev in evaluations:
            item = dict(ev)
            item["category"] = ev["root_cause"]["category"]
            for metric in ("context_relevance", "faithfulness", "answer_accuracy"):
                item[metric] = ev["metrics"][metric]["score"]
            results.append(item)

        labels = self.pack_labels(pack_id) if pack_id else []
        agreement = judge_agreement(self.judge, labels, {c.test_id for c in cases}) if labels else None

        summary = summarize_batch(evaluations)
        return {
            "batch_id": "batch_" + uuid.uuid4().hex[:10],
            "pack_id": pack_id,
            "document_ids": document_ids,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **summary,
            "judge_agreement": agreement,
            "evaluation_mode": self.judge.mode,
            "judge_model": self.judge.model,
            "generator_model": self.generator.model,
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "results": results,
        }

    # ---------------------------------------------------------- synthetic

    def synthetic(self, owner_id: str, document_id: str, count: int = 5, include_traps: bool = True) -> dict:
        doc = self.store.get_document(owner_id, document_id)
        if doc is None:
            raise NotFound(f"document {document_id} not found")
        chunks = self.store.chunks_for(owner_id, [document_id])
        # An older version of this document (same name, lower vN) enables stale-version traps.
        base, version = version_key(doc.filename)
        old_chunks = []
        search_ids = [document_id]
        self._ensure_embeddings(owner_id, [document_id])
        if version is not None:
            for other in self.store.list_documents(owner_id):
                other_base, other_version = version_key(other.filename)
                if other.document_id != document_id and other_base == base and other_version is not None and other_version < version:
                    old_chunks.extend(self.store.chunks_for(owner_id, [other.document_id]))
                    search_ids.append(other.document_id)
        self._ensure_embeddings(owner_id, search_ids)
        cases = self.synth.generate(owner_id, document_id, chunks, count, search_ids, old_chunks, include_traps)
        return {
            "document_id": document_id,
            "document_ids": search_ids,
            "requested_count": count,
            "generated_count": len(cases),
            "generated_by": self.judge.model,
            "test_cases": cases,
        }

    # -------------------------------------------------------------- packs

    def list_packs(self) -> list[dict]:
        return [spec.summary() for spec in discover(self.settings.packs_dirs).values()]

    def _pack(self, pack_id: str):
        spec = discover(self.settings.packs_dirs).get(pack_id)
        if spec is None:
            raise NotFound(f"pack {pack_id} not found")
        return spec

    def load_pack(self, owner_id: str, pack_id: str) -> dict:
        spec = self._pack(pack_id)
        docs_by_file: dict[str, ParsedDocument] = {}
        document_ids = []
        for entry in spec.documents:
            filename, data = read_document_bytes(spec, entry)
            doc = parse_document(filename, data, self.settings.chunk_chars)
            docs_by_file[filename] = doc
            document_ids.append(doc.document_id)
            if not self.store.has_document(owner_id, doc.document_id):
                self._embed_and_store(owner_id, doc, pack_id)
        cases = resolve_test_cases(spec, docs_by_file)
        return {
            "pack_id": pack_id,
            "name": spec.name,
            "demo_data": bool(spec.manifest.get("demo_data", True)),
            "document_ids": document_ids,
            "documents": [
                {"document_id": d.document_id, "filename": d.filename, "chunk_count": len(d.chunks)} for d in docs_by_file.values()
            ],
            "test_cases": cases,
        }

    def pack_labels(self, pack_id: str) -> list[dict]:
        try:
            spec = self._pack(pack_id)
        except NotFound:
            return []
        return load_labels(spec.path / "labels.json")


__all__ = ["Engine", "NotFound", "ModelUnavailable", "PackError"]
