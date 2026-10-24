import pytest

from engine.verdict import Facts, classify_failure, decide, needs_replay


def facts(**overrides) -> Facts:
    base = dict(
        has_ground_truth=True,
        unanswerable=False,
        abstained=False,
        gold_known=True,
        gold_retrieved=True,
        relevant_context=True,
        faithful=True,
        correct=True,
    )
    base.update(overrides)
    return Facts(**base)


@pytest.mark.parametrize(
    "overrides, replay_correct, expected",
    [
        # The rows of the verdict table in docs/product_brief.md.
        ({}, None, "CLEAN_PASS"),
        ({"gold_retrieved": False, "correct": False}, True, "RETRIEVAL_FAILURE"),
        ({"faithful": False, "correct": False}, False, "GENERATION_HALLUCINATION"),
        ({"gold_retrieved": False, "faithful": False, "correct": False}, False, "COMPOUND_FAILURE"),
        ({"correct": False}, None, "NEEDS_REVIEW"),
        ({"correct": False, "stale_retrieved": True}, True, "RETRIEVAL_FAILURE"),
        ({"correct": False, "stale_retrieved": True}, False, "UNRESOLVED"),
        # Beyond the table.
        ({"gold_retrieved": False, "faithful": True, "correct": False}, False, "COMPOUND_FAILURE"),
        ({"gold_retrieved": False}, None, "CLEAN_PASS"),
        ({"gold_retrieved": False, "faithful": False}, None, "NEEDS_REVIEW"),
        ({"faithful": False, "correct": False}, True, "GENERATION_HALLUCINATION"),
    ],
)
def test_table(overrides, replay_correct, expected):
    f = facts(**overrides)
    if needs_replay(f):
        assert replay_correct is not None, "test must say what the replay returns"
        f.replay_ran = True
        f.replay_correct = replay_correct
    else:
        assert replay_correct is None, "replay should not be needed for this row"
    assert decide(f).category == expected


def test_retrieval_failure_has_effect_text():
    f = facts(gold_retrieved=False, correct=False, replay_ran=True, replay_correct=True)
    assert "retriever is at fault" in decide(f).verdict_effect


def test_unanswerable():
    assert decide(facts(unanswerable=True, gold_known=False, abstained=True)).category == "CLEAN_PASS"
    assert decide(facts(unanswerable=True, gold_known=False, abstained=False)).category == "GENERATION_HALLUCINATION"
    assert not needs_replay(facts(unanswerable=True, gold_known=False))


def test_no_ground_truth_never_replays_or_blames_retrieval():
    f = facts(has_ground_truth=False, gold_known=False, correct=None, relevant_context=False, faithful=False)
    assert not needs_replay(f)
    assert decide(f).category == "GENERATION_HALLUCINATION"
    assert "heuristic" in decide(f).summary
    # Abstaining on an off-topic retrieval with no known answer: not provably a retrieval failure.
    abstain = facts(has_ground_truth=False, gold_known=False, correct=None, relevant_context=False, faithful=True, abstained=True)
    assert decide(abstain).category == "NEEDS_REVIEW"
    assert classify_failure(abstain, "NEEDS_REVIEW") == ("UNRESOLVED", "unknown")


def test_failed_replay_is_unresolved():
    f = facts(gold_retrieved=False, correct=False, replay_ran=True, replay_failed=True)
    assert decide(f).category == "UNRESOLVED"


def test_unknown_faithfulness_is_unresolved():
    assert decide(facts(faithful=None)).category == "UNRESOLVED"


from engine.verdict import classify_failure


@pytest.mark.parametrize(
    "overrides, category, expected",
    [
        ({}, "CLEAN_PASS", ("CLEAN_PASS", "none")),
        ({"gold_retrieved": False, "correct": False}, "RETRIEVAL_FAILURE", ("WRONG_CHUNK", "retriever")),
        ({"correct": False, "stale_retrieved": True}, "RETRIEVAL_FAILURE", ("STALE_SOURCE", "retriever")),
        ({"gold_retrieved": False, "correct": False, "distractor_retrieved": True}, "RETRIEVAL_FAILURE", ("DISTRACTOR_CONFUSION", "retriever")),
        ({"gold_retrieved": False, "faithful": False, "correct": False}, "COMPOUND_FAILURE", ("WRONG_CHUNK", "both")),
        ({"faithful": False, "correct": False, "contradicted_claims": True}, "GENERATION_HALLUCINATION", ("IGNORED_CONTEXT", "generator")),
        ({"faithful": False, "correct": False}, "GENERATION_HALLUCINATION", ("HALLUCINATION", "generator")),
        ({"correct": False}, "NEEDS_REVIEW", ("REASONING_ERROR", "generator")),
        ({"correct": False, "abstained": True}, "NEEDS_REVIEW", ("FALSE_ABSTENTION", "generator")),
        ({"unanswerable": True, "gold_known": False, "abstained": False}, "GENERATION_HALLUCINATION", ("UNANSWERABLE_ANSWERED", "generator")),
        ({"correct": False, "stale_retrieved": True}, "UNRESOLVED", ("STALE_SOURCE", "both")),
        ({"faithful": None}, "UNRESOLVED", ("UNRESOLVED", "unknown")),
    ],
)
def test_failure_taxonomy(overrides, category, expected):
    assert classify_failure(facts(**overrides), category) == expected


def test_replay_fix_outranks_unsupported_claim_when_stale_chunk_retrieved():
    # imp_04: stale v1 chunk retrieved, answer adds an unsupported claim, replay with only the gold chunk fixes it.
    f = facts(faithful=False, correct=False, stale_retrieved=True, replay_ran=True, replay_correct=True)
    assert needs_replay(facts(faithful=False, correct=False, stale_retrieved=True))
    verdict = decide(f)
    assert verdict.category == "COMPOUND_FAILURE"
    assert classify_failure(f, verdict.category) == ("STALE_SOURCE", "both")
    # Faithful to the stale chunk and fixed by replay: a pure retrieval failure.
    g = facts(correct=False, stale_retrieved=True, replay_ran=True, replay_correct=True)
    assert decide(g).category == "RETRIEVAL_FAILURE" and classify_failure(g, "RETRIEVAL_FAILURE") == ("STALE_SOURCE", "retriever")
    # Without a misleading chunk, a replay fix still leaves the generator at fault.
    h = facts(faithful=False, correct=False, replay_ran=True, replay_correct=True)
    assert decide(h).category == "GENERATION_HALLUCINATION"
