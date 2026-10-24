from engine.compare import bootstrap_ci, compare_runs, mcnemar_exact


def _r(test_id, category, acc=1.0):
    return {"test_id": test_id, "query": f"q{test_id}", "generated_answer": "a", "root_cause": {"category": category},
            "metrics": {"answer_accuracy": {"score": acc}}}


def test_mcnemar_and_ci():
    assert mcnemar_exact(0, 0) is None
    assert mcnemar_exact(5, 5) == 1.0
    assert mcnemar_exact(10, 0) == round(2 / 2**10, 4)
    lo, hi = bootstrap_ci([-1] * 10 + [0] * 10)
    assert hi < 0


def test_compare_flags_regression():
    base = [_r(f"t{i}", "CLEAN_PASS") for i in range(20)]
    cand = [_r(f"t{i}", "RETRIEVAL_FAILURE" if i < 10 else "CLEAN_PASS", 0.0 if i < 10 else 1.0) for i in range(20)]
    out = compare_runs(base, cand, "v1", "v2")
    assert out["n"] == 20 and out["pass_to_fail"] == 10 and out["fail_to_pass"] == 0
    assert out["accuracy_delta"] == -0.5 and out["meaningful"] and out["verdict"] == "REGRESSION"
    assert out["flips"][0]["direction"] == "pass_to_fail"


def test_compare_small_change_is_not_meaningful():
    base = [_r(f"t{i}", "CLEAN_PASS") for i in range(20)]
    cand = [_r(f"t{i}", "NEEDS_REVIEW" if i == 0 else "CLEAN_PASS") for i in range(20)]
    out = compare_runs(base, cand, "v1", "v2")
    assert not out["meaningful"] and out["verdict"] == "NO_MEANINGFUL_CHANGE"
