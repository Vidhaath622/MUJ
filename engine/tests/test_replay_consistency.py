"""A replay can never contradict its verdict, and a cut-off answer is never counted correct."""

from engine.evaluate import rederive
from engine.scoring import accuracy_rule, looks_truncated


def test_cut_off_answers_are_not_correct():
    assert looks_truncated("The new visitor limit at the bedside is lowered to [1].")
    assert looks_truncated("The cap is 25% of the")
    for whole in ("The visitor limit is 2 [1].", "The rate is 72.5 cents per mile [1].", "Taxed at 5% [1].", "It is lowered."):
        assert not looks_truncated(whole), whole
    # A complete sentence before a cut-off tail stands; so does a cut-off sentence that states the figures.
    assert not looks_truncated("The Ward Manager resolves it before the end of the shift [1]. However, the time frame is men")
    rule = accuracy_rule("The new visitor limit at the bedside is lowered to [1].", "The visitor limit has been lowered.")
    assert rule.score == 0.0 and "mid-sentence" in rule.details
    figures = "The range is between $153,000 and $168,000 for 2025, and between $153,000 and $168,000 for [1]."
    assert accuracy_rule(figures, "Between $153,000 and $168,000") is None or accuracy_rule(figures, "Between $153,000 and $168,000").score != 0.0


def _stored_hc16():
    """The live result that showed the inconsistency (healthcare hc_16, 25 Oct)."""
    metric = lambda score: {"score": score, "details": "", "source": "model"}
    return {
        "test_id": "hc_16", "query": "What is the new visitor limit at the bedside according to Version 2?",
        "generated_answer": "The new visitor limit at the bedside, according to Version 2, is 2 visitors [1].",
        "ground_truth": "The visitor limit at the bedside has been lowered.", "gold_chunk_ids": ["g"], "gold_retrieved": True,
        "retrieved_chunk_ids": ["g", "x"], "retrieved_chunks": [{"chunk_id": "g", "document_id": "d2"}],
        "metrics": {"context_relevance": metric(0.5), "faithfulness": {**metric(0.0), "claims": []}, "answer_accuracy": metric(0.0)},
        "root_cause": {"category": "GENERATION_HALLUCINATION"},
        "replay": {"answer": "The new visitor limit at the bedside is lowered to [1].", "answer_accuracy": 1.0, "faithfulness": 1.0,
                   "verdict_effect": "With only the gold chunk the answer was correct, so the extra retrieved chunks distracted the generator."},
        "category": "GENERATION_HALLUCINATION",
    }


def test_rederive_fixes_the_truncated_replay_and_the_blame():
    out = rederive(_stored_hc16())
    assert out["replay"]["answer_accuracy"] == 0.0 and "mid-sentence" in out["replay"]["accuracy_details"]
    assert out["root_cause"]["category"] == "GENERATION_HALLUCINATION" and out["replay"]["blames"] == "generator"
    assert "still wrong" in out["replay"]["verdict_effect"] and "retriever" not in out["replay"]["verdict_effect"].lower().replace("the retriever found", "")


def test_a_correct_replay_after_finding_the_right_text_blames_the_generator():
    stored = _stored_hc16()
    stored["replay"]["answer"] = "A maximum of 2 visitors may be present [1]."
    out = rederive(stored)
    assert out["root_cause"]["category"] == "GENERATION_HALLUCINATION" and out["replay"]["blames"] == "generator"
    assert out["replay"]["verdict_effect"].startswith("The retriever found the right text.")
