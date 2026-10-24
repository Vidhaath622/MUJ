"""Engine facade used by the backend. Every method returns plain JSON-ready dicts.

    from engine import Engine
    eng = Engine()
    eng.ingest("usr_1", "policy.pdf", data)
    eng.ask("usr_1", "How many leave days?", ["doc_abc"])
"""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from .agreement import judge_agreement, load_labels
from .config import Settings, get_settings
from .evaluate import Evaluator, TestCase, failed_result, summarize_batch
from .ingest import ParsedDocument, document_id_for, parse_document
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
        distractor_document_ids=list(raw.get("distractor_document_ids") or []),
        forced_chunk_ids=raw.get("forced_chunk_ids"),
        true_failure_type=raw.get("true_failure_type"),
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
        models = None
        if generator is None or embedder is None or judge is None:
            models = build_models(self.settings)
            generator = generator or models.generator
            embedder = embedder or models.embedder
            judge = judge or Judge(
                models.judge,
                self.settings.data_dir / "judge_cache.sqlite",
                fallback=models.judge_fallback,
                overflow=models.judge_overflow,
                replicas=models.judge_replicas,
                max_wait_s=self.settings.judge_overflow_wait_s,
            )
        live_judge = None
        if models is not None and models.live_judge is not None:
            live_judge = Judge(
                models.live_judge,
                self.settings.data_dir / "judge_cache.sqlite",
                fallback=models.judge_fallback,
                replicas=models.live_replicas,
                max_wait_s=self.settings.judge_overflow_wait_s,
            )
        self.generator = generator
        self.embedder = embedder
        self.judge = judge
        # Interactive calls (live questions, synthetic) may use their own judge; batches use self.judge.
        self.live_judge = live_judge or judge
        self.store = VectorStore(self.settings.data_dir / "vectors.sqlite")
        self.rag = RagSystem(self.store, generator, embedder, self.settings.top_k)
        self.evaluator = Evaluator(self.store, self.rag, self.judge)
        self.live_evaluator = Evaluator(self.store, self.rag, self.live_judge)
        self.synth = SyntheticGenerator(self.live_judge, self.rag)

    # ------------------------------------------------------------- status

    def status(self) -> dict:
        roles = {}
        for role, model in (("generator", self.generator), ("embeddings", self.embedder), ("judge", self.judge.chat_model)):
            ready, reason = model.ready()
            roles[role] = {"name": model.model, "provider": model.provider, "ready": ready, "error": reason}
        members = getattr(self.judge, "members", None)
        if members:
            primary = getattr(self.judge, "primary", [self.judge.chat_model])
            roles_pool = [
                {"name": m.model, "provider": m.provider, "role": "primary" if any(m is p for p in primary) else "overflow"}
                for m in members
            ]
        fallback = getattr(self.judge, "fallback", None)
        if fallback is not None:
            ready, reason = fallback.ready()
            roles["judge_fallback"] = {"name": fallback.model, "provider": fallback.provider, "ready": ready, "error": reason}
        usage, seen = [], set()
        for member in members or []:
            client = member.client
            if id(client) in seen or not hasattr(client, "usage"):
                continue
            seen.add(id(client))
            for model, tokens in sorted(client.usage.items()):
                usage.append({"key": client.label, "model": model, "tokens_since_start": tokens,
                              "daily_cap": client.daily_caps.get(model)})
        judge_ready = roles["judge"]["ready"]
        return {
            "engine_ready": all(r["ready"] for name, r in roles.items() if name != "judge_fallback"),
            "models": roles,
            # "unavailable" tells the UI that no judge can run, rather than showing stale or made-up scores.
            "evaluation_mode": self.judge.mode if judge_ready else "unavailable",
            "judge_model": self.judge.model,
            "judge_provider": self.judge.provider,
            "live_judge_model": self.live_judge.model,
            "judge_pool": roles_pool if members else None,
            # Tokens this process sent per API key and model; daily_cap is Groq's own figure from its last 429.
            "judge_token_usage": usage,
            "judge_api_keys": sum(1 for m in (members or []) if any(m is p for p in getattr(self.judge, "primary", []))) or None,
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
        filenames = {d.document_id: d.filename for d in self.store.list_documents(owner_id)}
        return {
            "answer": result.answer,
            "retrieved_chunks": [
                {
                    "chunk_id": s.chunk.chunk_id,
                    "document_id": s.chunk.document_id,
                    "filename": filenames.get(s.chunk.document_id),
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
        stale_chunk_ids: list[str] | None = None,
        test_id: str | None = None,
        distractor_document_ids: list[str] | None = None,
    ) -> dict:
        self._check_documents(owner_id, document_ids)
        with self._interactive():
            return self._evaluate_query(owner_id, query, document_ids, ground_truth, manual_answer, gold_chunk_ids,
                                        case_type, stale_chunk_ids, test_id, distractor_document_ids)

    def _interactive(self):
        """Judge calls made inside this block go ahead of running batches."""
        from contextlib import nullcontext

        return self.live_judge.interactive() if hasattr(self.live_judge, "interactive") else nullcontext()

    def _evaluate_query(self, owner_id, query, document_ids, ground_truth, manual_answer, gold_chunk_ids,
                        case_type, stale_chunk_ids, test_id, distractor_document_ids) -> dict:
        case = TestCase(
            question=query,
            ground_truth=ground_truth or None,
            test_id=test_id,
            gold_chunk_ids=gold_chunk_ids or [],
            stale_chunk_ids=stale_chunk_ids or [],
            type=case_type,
            manual_answer=manual_answer,
            distractor_document_ids=distractor_document_ids or [],
        )
        return self.live_evaluator.evaluate(owner_id, case, document_ids)

    def evaluate_batch(
        self,
        owner_id: str,
        document_ids: list[str],
        test_cases: list[dict],
        pack_id: str | None = None,
        progress: Callable[[int, int, int], None] | None = None,
        batch_id: str | None = None,
        concurrency: int | None = None,
        top_k: int | None = None,
    ) -> dict:
        """Evaluate many cases. `progress(done, total, failed)` is called after each case."""
        self._check_documents(owner_id, document_ids)
        started = time.perf_counter()
        cases = [_case_from_dict(raw) for raw in test_cases]
        for i, case in enumerate(cases, start=1):
            case.test_id = case.test_id or f"tc_{i:02d}"
        calls_before, hits_before = self.judge.calls, self.judge.cache_hits
        limited_before = getattr(self.judge, "rate_limited", 0)
        lock = threading.Lock()
        counts = {"done": 0, "failed": 0}

        def run(case: TestCase) -> dict:
            try:
                result = self.evaluator.evaluate(owner_id, case, document_ids, top_k)
            except (ModelUnavailable, JudgeError) as exc:
                result = failed_result(case, exc, self.judge, self.generator.model)
            with lock:
                counts["done"] += 1
                counts["failed"] += bool(result.get("error"))
                snapshot = (counts["done"], len(cases), counts["failed"])
            if progress:
                progress(*snapshot)
            return result

        # Several cases in flight: the local generator and the hosted judge overlap, and the
        # judge pool keeps each model inside its rate limit.
        workers = max(1, min(concurrency or self.settings.batch_concurrency, len(cases) or 1))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            evaluations = list(pool.map(run, cases))
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

        wall_ms = int((time.perf_counter() - started) * 1000)
        fallback_models: dict[str, int] = {}
        for ev in evaluations:
            if ev.get("judge_fallback_used"):
                for name in ev.get("judge_models_used", []):
                    if name != f"{self.judge.provider}:{self.judge.model}":
                        fallback_models[name] = fallback_models.get(name, 0) + 1
        summary = summarize_batch(evaluations)
        return {
            "batch_id": batch_id or "batch_" + uuid.uuid4().hex[:10],
            "pack_id": pack_id,
            "document_ids": document_ids,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **summary,
            "judge_agreement": agreement,
            "evaluation_mode": self.judge.mode,
            "judge_model": self.judge.model,
            "judge_models_used": sorted({m for ev in evaluations for m in ev.get("judge_models_used", [])}),
            "judge_fallback_cases": sum(bool(ev.get("judge_fallback_used")) for ev in evaluations),
            "judge_fallback_models": fallback_models,
            "generator_model": self.generator.model,
            "top_k": top_k or self.settings.top_k,
            "duration_ms": wall_ms,
            "timing": {
                "wall_ms": wall_ms,
                "per_case_ms_avg": int(wall_ms / len(cases)) if cases else None,
                "cases_per_min": round(len(cases) / (wall_ms / 60000), 2) if wall_ms else None,
                "judge_calls": self.judge.calls - calls_before,
                "judge_cache_hits": self.judge.cache_hits - hits_before,
                "rate_limited_retries": getattr(self.judge, "rate_limited", 0) - limited_before,
                "rule_shortcuts": sum(ev.get("timing", {}).get("rule_shortcuts", 0) for ev in evaluations),
                "concurrency": workers,
            },
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
        with self._interactive():
            cases = self.synth.generate(owner_id, document_id, chunks, count, search_ids, old_chunks, include_traps)
        return {
            "document_id": document_id,
            "document_ids": search_ids,
            "requested_count": count,
            "generated_count": len(cases),
            "note": (
                f"{count - len(cases)} of {count} requested questions were dropped: a candidate is kept only if its quoted"
                " evidence matches the document text, and a trap only if the judge confirms it."
                if len(cases) < count else None
            ),
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

    def load_pack_summary(self, pack_id: str) -> dict:
        """Case count and document filenames of a pack, without ingesting anything."""
        spec = self._pack(pack_id)
        filenames = {}
        for entry in spec.documents:
            filename, data = read_document_bytes(spec, entry)
            filenames[document_id_for(data)] = filename
        return {**spec.summary(), "filenames": filenames}

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
        distractor_ids = [
            docs_by_file[e["file"]].document_id
            for e in spec.documents
            if e.get("role") == "distractor" or "distractor" in e["file"].lower()
        ]
        for case in cases:
            case["distractor_document_ids"] = distractor_ids
        return {
            "pack_id": pack_id,
            "name": spec.name,
            "demo_data": bool(spec.manifest.get("demo_data", True)),
            "document_ids": document_ids,
            "distractor_document_ids": distractor_ids,
            "superseded_document_ids": [docs_by_file[e["file"]].document_id for e in spec.documents if e.get("superseded_by")],
            "documents": [
                {"document_id": d.document_id, "filename": d.filename, "chunk_count": len(d.chunks)} for d in docs_by_file.values()
            ],
            "test_cases": cases,
        }

    # -------------------------------------------------------------- rejudge

    def rejudge(self, owner_id: str, batch: dict, progress: Callable[[int, int, int], None] | None = None) -> dict:
        """Re-score a finished batch with the primary judge only (all its API keys, no overflow).

        Retrieval, answers and replay answers are reused, so only the judging changes and
        the batch keeps its id. Judgements the primary already made come from the cache.
        """
        primary_only = (
            Judge(
                self.judge.chat_model,
                self.settings.data_dir / "judge_cache.sqlite",
                replicas=tuple(self.judge.primary[1:]),
                max_wait_s=600,
            )
            if isinstance(self.judge, Judge)
            else self.judge  # test doubles
        )
        evaluator = Evaluator(self.store, self.rag, primary_only)
        distractors = self.load_pack(owner_id, batch["pack_id"])["distractor_document_ids"] if batch.get("pack_id") else []
        cases = [
            TestCase(
                question=r["query"],
                ground_truth=r.get("ground_truth"),
                test_id=r["test_id"],
                gold_chunk_ids=r.get("gold_chunk_ids") or [],
                stale_chunk_ids=r.get("stale_chunk_ids") or [],
                type=r.get("case_type") or "factoid",
                distractor_document_ids=distractors,
                true_failure_type=r.get("true_failure_type"),
                stored=r,
            )
            for r in batch["results"]
            if not r.get("error")
        ]
        lock = threading.Lock()
        counts = {"done": 0}

        def run(case: TestCase) -> dict:
            try:
                result = evaluator.evaluate(owner_id, case, batch.get("document_ids") or [])
            except (ModelUnavailable, JudgeError) as exc:
                result = failed_result(case, exc, primary_only, self.generator.model)
            with lock:
                counts["done"] += 1
                done = counts["done"]
            if progress:
                progress(done, len(cases), 0)
            return result

        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=3) as pool:
            evaluations = list(pool.map(run, cases))
        results = []
        for ev in evaluations:
            item = dict(ev, category=ev["root_cause"]["category"])
            for metric in ("context_relevance", "faithfulness", "answer_accuracy"):
                item[metric] = ev["metrics"][metric]["score"]
            results.append(item)
        extra = {}
        if batch.get("kind") == "injection":
            from .inject import confusion

            extra["confusion"] = confusion(results)
        return {
            **batch,
            **summarize_batch(evaluations),
            **extra,
            "judge_model": primary_only.model,
            "judge_models_used": sorted({m for ev in evaluations for m in ev.get("judge_models_used", [])}),
            "judge_fallback_cases": sum(bool(ev.get("judge_fallback_used")) for ev in evaluations),
            "judge_fallback_models": {},
            "rejudged": {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "judge": f"{primary_only.provider}:{primary_only.model}",
                          "wall_ms": int((time.perf_counter() - started) * 1000)},
            "results": results,
        }

    # ------------------------------------------------------ fault injection

    def injection_run(
        self,
        owner_id: str,
        pack_ids: list[str] | None = None,
        n_per_type: int = 5,
        progress: Callable[[int, int, int], None] | None = None,
        batch_id: str | None = None,
    ) -> dict:
        """Inject known faults into pack cases, diagnose them, and return the batch plus its confusion matrix."""
        from .inject import build_cases, confusion

        pack_ids = pack_ids or [p["pack_id"] for p in self.list_packs()]
        per_pack = max(1, -(-n_per_type // len(pack_ids)))  # ceil: n_per_type is the total per fault type
        document_ids, cases = [], []
        for pack_id in pack_ids:
            pack = self.load_pack(owner_id, pack_id)
            document_ids += pack["document_ids"]
            cases += build_cases(self, owner_id, pack, per_pack)
        batch = self.evaluate_batch(owner_id, document_ids, cases, pack_id=None, progress=progress, batch_id=batch_id)
        return {**batch, "kind": "injection", "injected_packs": pack_ids, "n_per_type": n_per_type, "confusion": confusion(batch["results"])}

    # ------------------------------------------------------------ stability

    def judge_models(self, spec: str) -> list[ChatModel]:
        """Every API key's copy of one judge model, from "provider:model" (or a bare model name in the pool)."""
        from .config import PROVIDERS
        from .llm import OllamaClient, OpenAICompatClient, _client

        provider, _, model = spec.partition(":")
        if provider not in PROVIDERS:
            member = next((m for m in getattr(self.judge, "members", []) if m.model == spec), None)
            if member is None:
                raise NotFound(f"unknown judge {spec!r}: use provider:model, e.g. groq:openai/gpt-oss-120b")
            provider, model = member.provider, member.model
        if not model:
            raise NotFound(f"judge {spec!r} has no model name")
        clients = [_client(provider, self.settings, OllamaClient(self.settings))]
        if provider == "groq":
            clients += [
                OpenAICompatClient("groq", "https://api.groq.com/openai/v1", key, self.settings, json_mode=True)
                for key in self.settings.groq_extra_keys
            ]
        return [ChatModel(c, model) for c in clients]

    def stability(
        self,
        owner_id: str,
        batch: dict,
        judges: list[str] | None = None,
        shuffles: int = 3,
        max_cases: int = 20,
        progress: Callable[[int, int, int], None] | None = None,
    ) -> dict:
        from .stability import run_stability

        if not judges:
            primary = f"{self.judge.provider}:{self.judge.model}"
            other = "groq:openai/gpt-oss-120b" if primary != "groq:openai/gpt-oss-120b" else "groq:qwen/qwen3.8-27b"
            judges = [primary, other]
        if len(judges) != 2:
            raise ValueError("stability needs exactly two judges")
        pools = (self.judge_models(judges[0]), self.judge_models(judges[1]))
        for pool in pools:
            ready, reason = pool[0].ready()
            if not ready:
                raise ModelUnavailable(f"judge {pool[0].provider}:{pool[0].model} is not available: {reason}")
        return run_stability(self, owner_id, batch, pools, shuffles=shuffles, max_cases=max_cases, progress=progress)

    # ------------------------------------------------------- RAG versions

    def profiles(self) -> list[dict]:
        from .compare import PROFILES

        return list(PROFILES.values())

    def compare(self, base_results: list[dict], candidate_results: list[dict], base: str, candidate: str) -> dict:
        from .compare import compare_runs

        return compare_runs(base_results, candidate_results, base, candidate)

    def run_profile(
        self, owner_id: str, pack_id: str, profile_id: str, progress: Callable[[int, int, int], None] | None = None, batch_id: str | None = None
    ) -> dict:
        """Run a whole pack under one RAG version (see compare.PROFILES)."""
        from .compare import PROFILES

        profile = PROFILES.get(profile_id)
        if profile is None:
            raise NotFound(f"unknown RAG profile {profile_id!r}")
        pack = self.load_pack(owner_id, pack_id)
        document_ids = pack["document_ids"]
        if profile["params"]["newest_versions_only"]:
            document_ids = [d for d in document_ids if d not in set(pack["superseded_document_ids"])]
        batch = self.evaluate_batch(
            owner_id, document_ids, pack["test_cases"], pack_id=pack_id, progress=progress, batch_id=batch_id,
            top_k=profile["params"]["top_k"],
        )
        return {**batch, "profile": profile_id}

    def pack_labels(self, pack_id: str) -> list[dict]:
        try:
            spec = self._pack(pack_id)
        except NotFound:
            return []
        return load_labels(spec.path / "labels.json")


__all__ = ["Engine", "NotFound", "ModelUnavailable", "PackError"]
