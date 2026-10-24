from pathlib import Path

from engine.config import Settings
from engine.inject import build_cases, confusion
from engine.service import Engine

from .fakes import FakeEmbedder, FakeGenerator, FakeJudge
from .test_pipeline import POLICY

DISTRACTOR = b"""# Cafeteria guide

The cafeteria is open 8 to 18 on weekdays. Parental visitors get 2 free coffees.

## Parking

Staff parking costs 10 per month. Visitors park for 3 hours free.
"""


def test_confusion_counts():
    rows = [
        {"true_failure_type": "WRONG_CHUNK", "root_cause": {"failure_type": "WRONG_CHUNK"}},
        {"true_failure_type": "WRONG_CHUNK", "root_cause": {"failure_type": "STALE_SOURCE"}},
        {"true_failure_type": "HALLUCINATION", "root_cause": {"failure_type": "HALLUCINATION"}},
        {"true_failure_type": "HALLUCINATION", "root_cause": {"failure_type": "IGNORED_CONTEXT"}},
        {"test_id": "not injected", "root_cause": {"failure_type": "CLEAN_PASS"}},
    ]
    out = confusion(rows)
    assert out["n"] == 4 and out["accuracy"] == 0.5
    assert out["labels"] == ["WRONG_CHUNK", "STALE_SOURCE", "IGNORED_CONTEXT", "HALLUCINATION"]
    assert out["per_class"]["WRONG_CHUNK"] == {"precision": 1.0, "recall": 0.5, "support": 2}
    assert out["per_class"]["STALE_SOURCE"]["precision"] == 0.0 and out["per_class"]["STALE_SOURCE"]["support"] == 0
    # Retriever mistaken for retriever and generator for generator: the stage is still right.
    assert out["stage_accuracy"] == 1.0


def test_build_cases_injects_each_fault(tmp_path: Path):
    settings = Settings(data_dir=tmp_path, top_k=2, packs_dirs=())
    engine = Engine(settings, generator=FakeGenerator(), embedder=FakeEmbedder(), judge=FakeJudge())
    policy = engine.ingest("u", "policy.md", POLICY)
    distractor = engine.ingest("u", "cafeteria_distractor.md", DISTRACTOR)
    chunks = [c["chunk_id"] for c in policy["chunks"]]
    pack = {
        "document_ids": [policy["document_id"], distractor["document_id"]],
        "distractor_document_ids": [distractor["document_id"]],
        "test_cases": [
            {"test_id": "t1", "question": "How many days paid leave per year?", "ground_truth_answer": "20 days", "type": "factoid",
             "gold_chunk_ids": [chunks[0]], "stale_chunk_ids": [], "context_snippet": "Employees receive 20 days paid leave per calendar year."},
            {"test_id": "t2", "question": "How many weeks for primary caregivers?", "ground_truth_answer": "16 weeks", "type": "stale",
             "gold_chunk_ids": [chunks[2]], "stale_chunk_ids": [chunks[1]], "context_snippet": ""},
            {"test_id": "t3", "question": "What is the dental limit?", "ground_truth_answer": "", "type": "unanswerable",
             "gold_chunk_ids": [], "stale_chunk_ids": []},
        ],
    }
    cases = build_cases(engine, "u", pack, n_per_type=1)
    by_type = {c["true_failure_type"]: c for c in cases}
    assert set(by_type) == {
        "WRONG_CHUNK", "STALE_SOURCE", "DISTRACTOR_CONFUSION", "IGNORED_CONTEXT", "HALLUCINATION",
        "REASONING_ERROR", "FALSE_ABSTENTION", "CLEAN_PASS", "UNANSWERABLE_ANSWERED",
    }
    assert not set(by_type["WRONG_CHUNK"]["forced_chunk_ids"]) & set(by_type["WRONG_CHUNK"]["gold_chunk_ids"])
    assert by_type["STALE_SOURCE"]["forced_chunk_ids"][0] == chunks[1]
    assert all(c.startswith(distractor["chunks"][0]["chunk_id"][:10]) for c in by_type["DISTRACTOR_CONFUSION"]["forced_chunk_ids"])
    assert "40" in by_type["IGNORED_CONTEXT"]["manual_answer"] or "41" in by_type["IGNORED_CONTEXT"]["manual_answer"]
    assert by_type["IGNORED_CONTEXT"]["forced_chunk_ids"][0] == by_type["IGNORED_CONTEXT"]["gold_chunk_ids"][0]

    # The batch runs them all and every result carries its true type.
    batch = engine.evaluate_batch("u", pack["document_ids"], cases)
    assert all(r["true_failure_type"] for r in batch["results"])
    assert confusion(batch["results"])["n"] == len(cases)
