from app.trust import agreement, cohen_kappa


def test_cohen_kappa():
    assert cohen_kappa([True, True, False, False], [True, True, False, False]) == 1.0
    assert cohen_kappa([True, False, True, False], [False, True, False, True]) == -1.0
    # 0.5 observed agreement against 0.5 expected by chance is no better than chance.
    assert cohen_kappa([True, True, False, False], [True, False, True, False]) == 0.0
    assert cohen_kappa([], []) is None
    assert cohen_kappa([True, True], [True, True]) == 1.0


def _label(test_id, labeler, correct, failure_type=None, batch_id="b1"):
    return {"batch_id": batch_id, "test_id": test_id, "labeler": labeler, "correct": correct,
            "failure_type": failure_type, "note": None, "question": f"q {test_id}"}


def test_agreement_counts():
    runs = {"b1": {"results": [
        {"test_id": "t1", "root_cause": {"category": "CLEAN_PASS"}},
        {"test_id": "t2", "root_cause": {"category": "RETRIEVAL_FAILURE"}},
        {"test_id": "t3", "root_cause": {"category": "CLEAN_PASS"}},
        {"test_id": "t4", "root_cause": {"category": "NEEDS_REVIEW"}},
    ]}}
    labels = [
        _label("t1", "SR", True), _label("t1", "VP", True),              # consensus correct, pipeline pass
        _label("t2", "SR", False, "WRONG_CHUNK"), _label("t2", "VP", False, "WRONG_CHUNK"),  # agree, pipeline fail
        _label("t3", "SR", False, "HALLUCINATION"), _label("t3", "VP", False),            # consensus incorrect, pipeline pass
        _label("t4", "SR", True), _label("t4", "VP", False),              # humans disagree
        _label("t5", "SR", True),                                         # single-labelled
    ]
    out = agreement(labels, runs)
    assert out["n_double_labeled"] == 4 and out["n_items_labeled"] == 5
    assert out["human_human"]["agreement"] == 0.75 and out["human_human"]["n"] == 4
    assert out["human_human"]["failure_type_agreement"] == 1.0 and out["human_human"]["failure_type_n"] == 1
    pvc = out["pipeline_vs_consensus"]
    assert pvc["n"] == 3 and pvc["false_pass"] == 1 and pvc["false_fail"] == 0
    assert pvc["agreement"] == round(2 / 3, 3)
    kinds = sorted(d["kind"] for d in out["disagreements"])
    assert kinds == ["human_vs_human", "pipeline_vs_consensus"]


def test_label_flow(client, alice, bob, fake_engine):
    empty = client.get("/api/labels/queue", headers=alice, params={"pack_id": "banking", "labeler": "SR"}).json()
    assert empty["items"] == [] and empty["batch_id"] is None

    run = client.post("/api/evaluate/batch", headers=alice, json={"pack_id": "banking"}).json()
    queue = client.get("/api/labels/queue", headers=alice, params={"pack_id": "banking", "labeler": "SR"}).json()
    assert queue["batch_id"] == run["batch_id"] and queue["total"] == 1 and queue["labeled"] == 0
    item = queue["items"][0]
    # The pipeline's verdict and scores must not be shown to labellers.
    assert "root_cause" not in item and "metrics" not in item and "category" not in item
    assert item["generated_answer"] == "20 days." and "WRONG_CHUNK" in queue["failure_types"]

    bad = client.post("/api/labels", headers=alice, json={"test_id": item["test_id"], "batch_id": run["batch_id"], "labeler": "SR",
                                                          "correct": True, "failure_type": "HALLUCINATION"})
    assert bad.status_code == 422
    for labeler, headers in (("SR", alice), ("VP", bob)):
        resp = client.post("/api/labels", headers=headers, json={"test_id": item["test_id"], "batch_id": run["batch_id"],
                                                                  "labeler": labeler, "correct": True, "failure_type": None})
        assert resp.status_code == 201, resp.text
    after = client.get("/api/labels/queue", headers=alice, params={"pack_id": "banking", "labeler": "SR"}).json()
    assert after["labeled"] == 1 and after["items"][0]["labeled"] is True

    stats = client.get("/api/trust/agreement", headers=alice, params={"pack_id": "banking"}).json()
    assert stats["n_double_labeled"] == 1 and stats["labelers"] == ["SR", "VP"]
    assert stats["pipeline_vs_consensus"]["agreement"] == 1.0 and stats["pipeline_vs_consensus"]["n"] == 1

    # A new run of the pack does not move labellers off the run they are labelling.
    client.post("/api/evaluate/batch", headers=alice, json={"pack_id": "banking"})
    again = client.get("/api/labels/queue", headers=alice, params={"pack_id": "banking", "labeler": "SR"}).json()
    assert again["batch_id"] == run["batch_id"]


def test_injection_run_and_confusion(client, alice, bob, fake_engine):
    from tests.test_api import _wait_for

    empty = client.get("/api/trust/confusion", headers=alice).json()
    assert empty["run_id"] is None and empty["n"] == 0
    assert client.post("/api/trust/injection-run", headers=alice, json={"pack_id": "nope"}).status_code == 404

    started = client.post("/api/trust/injection-run", headers=alice, json={"n_per_type": 2})
    assert started.status_code == 202, started.text
    run_id = started.json()["run_id"]
    assert _wait_for(client, alice, run_id)["status"] == "done"

    out = client.get("/api/trust/confusion", headers=alice).json()
    assert out["run_id"] == run_id and out["accuracy"] == 0.5 and out["n"] == 2
    assert out["matrix"][0][0] == 1 and out["cases"][1]["true_failure_type"] == "HALLUCINATION"
    assert client.get("/api/trust/confusion", headers=bob, params={"run_id": run_id}).status_code == 404
