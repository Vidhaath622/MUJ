import pytest

from engine.verdict import Facts, decide, needs_replay


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


def test_no_ground_truth_never_replays():
    f = facts(has_ground_truth=False, gold_known=False, correct=None, relevant_context=False, faithful=False)
    assert not needs_replay(f)
    assert decide(f).category == "COMPOUND_FAILURE"
    assert "heuristic" in decide(f).summary


def test_failed_replay_is_unresolved():
    f = facts(gold_retrieved=False, correct=False, replay_ran=True, replay_failed=True)
    assert decide(f).category == "UNRESOLVED"


def test_unknown_faithfulness_is_unresolved():
    assert decide(facts(faithful=None)).category == "UNRESOLVED"
