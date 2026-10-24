"""End-to-end engine runs with fake models: every verdict path through the real evaluator."""

from pathlib import Path

import pytest

from engine.config import Settings
from engine.service import Engine, NotFound

from .fakes import FakeEmbedder, FakeGenerator, FakeJudge

POLICY = b"""# Leave policy

Employees receive 20 days paid leave per calendar year. Unused leave expires on December 31st.

## Sick leave

Sick leave is 10 days per year. A doctor's note is required after 3 consecutive days.

## Parental leave

Primary caregivers receive 16 weeks of paid parental leave. Secondary caregivers receive 4 weeks.
"""


def answer_from_context(fact: str, right: str, wrong: str):
    """Scripted generator: answers correctly only when the fact is in its context (like a real RAG model)."""
    return lambda context: right if fact in context else wrong


@pytest.fixture
def make_engine(tmp_path: Path):
    def make(answers: dict, top_k: int = 1) -> Engine:
        settings = Settings(data_dir=tmp_path / "data", top_k=top_k, packs_dirs=(Path(__file__).parent.parent / "packs_builtin",))
        return Engine(settings, generator=FakeGenerator(answers), embedder=FakeEmbedder(), judge=FakeJudge())

    return make


def ingest(engine: Engine) -> tuple[str, list[str]]:
    doc = engine.ingest("usr_a", "policy.md", POLICY)
    return doc["document_id"], [c["chunk_id"] for c in doc["chunks"]]


def test_clean_pass(make_engine):
    q = "How many days paid leave per calendar year?"
    engine = make_engine({q: "Employees receive 20 days paid leave per year [1]."})
    doc_id, chunk_ids = ingest(engine)
    result = engine.evaluate_query("usr_a", q, [doc_id], ground_truth="20 days per calendar year", gold_chunk_ids=[chunk_ids[0]])
    assert result["root_cause"]["category"] == "CLEAN_PASS"
    assert result["gold_retrieved"] is True
    assert result["replay"] is None
    assert result["metrics"]["faithfulness"]["judged_by"] == "model"
    assert result["citations"] == [chunk_ids[0]]


def test_retrieval_failure_proven_by_replay(make_engine):
    # The question's words match the sick-leave chunk, but the answer (gold) is in the parental chunk.
    q = "Doctor note and sick leave days: how long is leave for primary caregivers?"
    engine = make_engine({q: answer_from_context("16 weeks", "Primary caregivers get 16 weeks.", "Sick leave is 12 weeks.")})
    doc_id, chunk_ids = ingest(engine)
    result = engine.evaluate_query("usr_a", q, [doc_id], ground_truth="16 weeks", gold_chunk_ids=[chunk_ids[2]])
    assert result["gold_retrieved"] is False
    assert result["root_cause"]["category"] == "RETRIEVAL_FAILURE"
    assert result["replay"]["answer"] == "Primary caregivers get 16 weeks."
    assert result["replay"]["answer_accuracy"] == 1.0
    assert result["stale_chunk_ids"] == []
    assert "retriever is at fault" in result["replay"]["verdict_effect"]
    roles = {e["role"] for e in result["root_cause"]["evidence"]}
    assert {"gold_missing", "retrieved_instead"} <= roles


def test_generation_hallucination(make_engine):
    q = "How many days paid leave per calendar year?"
    engine = make_engine({q: "Employees receive 25 days paid leave."})
    doc_id, chunk_ids = ingest(engine)
    result = engine.evaluate_query("usr_a", q, [doc_id], ground_truth="20 days", gold_chunk_ids=[chunk_ids[0]])
    assert result["root_cause"]["category"] == "GENERATION_HALLUCINATION"
    assert result["metrics"]["faithfulness"]["hallucinated_claims"] == ["Employees receive 25 days paid leave."]
    assert result["replay"] is not None and "still wrong" in result["replay"]["verdict_effect"]


def test_compound_failure(make_engine):
    q = "Doctor note and sick leave days: how long is leave for primary caregivers?"
    engine = make_engine({q: "They get 99 weeks."})
    doc_id, chunk_ids = ingest(engine)
    result = engine.evaluate_query("usr_a", q, [doc_id], ground_truth="16 weeks", gold_chunk_ids=[chunk_ids[2]])
    assert result["root_cause"]["category"] == "COMPOUND_FAILURE"


def test_unanswerable_abstain_and_hallucinate(make_engine):
    q = "What is the dental insurance limit?"
    engine = make_engine({})
    doc_id, _ = ingest(engine)
    ok = engine.evaluate_query("usr_a", q, [doc_id], case_type="unanswerable")
    assert ok["root_cause"]["category"] == "CLEAN_PASS"
    assert ok["metrics"]["answer_accuracy"]["judged_by"] == "rule"

    engine.generator.answers[q] = "The dental limit is 500 dollars."
    bad = engine.evaluate_query("usr_a", q, [doc_id], case_type="unanswerable")
    assert bad["root_cause"]["category"] == "GENERATION_HALLUCINATION"


def test_no_ground_truth_gives_null_accuracy(make_engine):
    q = "How many days paid leave per calendar year?"
    engine = make_engine({q: "Employees receive 20 days paid leave per year [1]."})
    doc_id, _ = ingest(engine)
    result = engine.evaluate_query("usr_a", q, [doc_id])
    acc = result["metrics"]["answer_accuracy"]
    assert acc["score"] is None and acc["status"] == "REVIEW" and acc["judged_by"] == "rule"
    assert result["replay"] is None


def test_gold_is_inferred_from_ground_truth(make_engine):
    q = "Doctor note and sick leave days: how long is leave for primary caregivers?"
    engine = make_engine({q: answer_from_context("16 weeks", "Primary caregivers get 16 weeks.", "Sick leave is 12 weeks.")})
    doc_id, chunk_ids = ingest(engine)
    result = engine.evaluate_query("usr_a", q, [doc_id], ground_truth="16 weeks")
    assert result["gold_chunk_ids"] == [chunk_ids[2]]
    assert result["gold_source"] == "inferred"
    assert result["root_cause"]["category"] == "RETRIEVAL_FAILURE"


def test_owner_scoping(make_engine):
    engine = make_engine({})
    doc_id, _ = ingest(engine)
    assert engine.list_documents("usr_b") == []
    with pytest.raises(NotFound):
        engine.ask("usr_b", "anything", [doc_id])
    engine.delete_document("usr_a", doc_id)
    assert engine.list_documents("usr_a") == []


def test_batch_aggregates(make_engine):
    q1 = "How many days paid leave per calendar year?"
    q2 = "Doctor note and sick leave days: how long is leave for primary caregivers?"
    engine = make_engine({q1: "Employees receive 20 days paid leave [1].", q2: answer_from_context("16 weeks", "16 weeks.", "12 weeks.")})
    doc_id, chunk_ids = ingest(engine)
    batch = engine.evaluate_batch(
        "usr_a",
        [doc_id],
        [
            {"test_id": "t1", "question": q1, "ground_truth_answer": "20 days", "source_chunk_id": chunk_ids[0]},
            {"test_id": "t2", "question": q2, "ground_truth_answer": "16 weeks", "gold_chunk_ids": [chunk_ids[2]]},
            {"test_id": "t3", "question": "What is the dental limit?", "ground_truth_answer": "", "type": "unanswerable"},
        ],
    )
    assert batch["total_evaluated"] == 3
    assert batch["root_cause_breakdown"]["CLEAN_PASS"] == 2
    assert batch["root_cause_breakdown"]["RETRIEVAL_FAILURE"] == 1
    assert batch["aggregates"]["pass_rate"] == pytest.approx(0.667, abs=1e-3)
    assert batch["judge_agreement"] is None
    first = batch["results"][0]
    assert first["category"] == "CLEAN_PASS" and isinstance(first["faithfulness"], float)
    assert set(batch["root_cause_breakdown"]) == {
        "CLEAN_PASS", "RETRIEVAL_FAILURE", "GENERATION_HALLUCINATION", "COMPOUND_FAILURE", "NEEDS_REVIEW", "UNRESOLVED",
    }


def test_rejudge_keeps_answers_and_batch_id(make_engine):
    q = "How many days paid leave per calendar year?"
    engine = make_engine({q: "Employees receive 20 days paid leave [1]."})
    doc_id, chunk_ids = ingest(engine)
    batch = engine.evaluate_batch("usr_a", [doc_id], [{"test_id": "t1", "question": q, "ground_truth_answer": "20 days",
                                                         "gold_chunk_ids": [chunk_ids[0]]}])
    engine.rag.generator.answers[q] = "a different answer would show up if generation ran again"
    again = engine.rejudge("usr_a", batch)
    assert again["batch_id"] == batch["batch_id"] and again["rejudged"]["judge"].endswith("fake-judge")
    assert again["results"][0]["generated_answer"] == batch["results"][0]["generated_answer"]
    assert again["results"][0]["category"] == "CLEAN_PASS"
