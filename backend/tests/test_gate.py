"""Release gate: API tokens for CI, the verdict, the async run, and the stdlib CLI."""

import importlib.util
from pathlib import Path

from app.gate import verdict

from .conftest import auth_headers


def _run(batch_id, outcomes, pack="banking"):
    return {"batch_id": batch_id, "pack_id": pack, "total_evaluated": len(outcomes),
            "aggregates": {"pass_rate": None}, "overall_score": 0.8,
            "results": [{"test_id": t, "query": f"question {t}", "root_cause": {"category": c, "summary": f"why {t}"}} for t, c in outcomes.items()]}


def test_verdict():
    base = _run("b1", {"t1": "CLEAN_PASS", "t2": "CLEAN_PASS", "t3": "RETRIEVAL_FAILURE"})
    cand = _run("b2", {"t1": "CLEAN_PASS", "t2": "GENERATION_HALLUCINATION", "t3": "CLEAN_PASS"})
    out = verdict(cand, base, 0.5, 0, "https://x/#/runs?batch=b2")
    assert out["pass"] is False and out["pass_rate"] == 0.667
    assert [f["test_id"] for f in out["new_failures"]] == ["t2"] and [f["test_id"] for f in out["fixed"]] == ["t3"]
    assert out["new_failures"][0] == {"test_id": "t2", "question": "question t2", "category": "GENERATION_HALLUCINATION", "summary": "why t2"}
    assert "now fail" in out["reasons"][0]
    assert verdict(cand, base, 0.5, 1, None)["pass"] is True
    assert verdict(cand, None, 0.9, 0, None)["reasons"] == ["pass rate 66.7% is below the minimum 90.0%"]


def test_api_tokens_authenticate_and_can_be_revoked(client, alice):
    created = client.post("/api/tokens", headers=alice, json={"name": "GitHub"}).json()
    token = created["token"]
    assert token.startswith("rsk_") and created["prefix"] == token[:10]
    me = client.get("/api/auth/me", headers=auth_headers(token)).json()
    assert me["email"] == "alice@example.com"
    listed = client.get("/api/tokens", headers=alice).json()
    assert [t["name"] for t in listed] == ["GitHub"] and "token" not in listed[0] and listed[0]["last_used_at"]
    assert client.delete(f"/api/tokens/{created['id']}", headers=alice).status_code == 204
    assert client.get("/api/auth/me", headers=auth_headers(token)).status_code == 401
    assert client.get("/api/auth/me", headers=auth_headers("rsk_made_up")).status_code == 401


def test_gate_on_an_existing_run_against_the_previous_one(app, client, alice):
    me = client.get("/api/auth/me", headers=alice).json()["id"]
    app.state.db.save_run(me, {**_run("b_old", {"t1": "CLEAN_PASS", "t2": "CLEAN_PASS"}), "created_at": "2026-10-25T01:00:00Z"})
    app.state.db.save_run(me, {**_run("b_new", {"t1": "CLEAN_PASS", "t2": "RETRIEVAL_FAILURE"}), "created_at": "2026-10-25T02:00:00Z"})
    out = client.post("/api/gate", headers=alice, json={"pack_id": "banking", "batch_id": "b_new", "min_pass_rate": 0.5}).json()
    assert out["status"] == "done" and out["pass"] is False and out["baseline_batch_id"] == "b_old"
    assert out["report_url"].endswith("/#/runs?batch=b_new")
    assert client.get(f"/api/gate/{out['gate_id']}", headers=alice).json()["pass"] is False
    assert client.post("/api/gate", headers=alice, json={"pack_id": "healthcare", "batch_id": "b_new"}).status_code == 422
    older = client.post("/api/gate", headers=alice, json={"pack_id": "banking", "batch_id": "b_old"}).json()
    assert older["baseline_batch_id"] is None and older["pass"] is True  # nothing ran before it
    assert client.post("/api/gate", headers=alice, json={"pack_id": "banking", "batch_id": "nope"}).status_code == 404


def test_gate_runs_the_pack_in_the_background(client, alice):
    started = client.post("/api/gate", headers=alice, json={"pack_id": "banking", "min_pass_rate": 0.8})
    assert started.status_code == 202
    body = started.json()
    for _ in range(100):
        result = client.get(f"/api/gate/{body['gate_id']}", headers=alice).json()
        if result["status"] != "running":
            break
    assert result["status"] == "done" and result["pass"] is True and result["batch_id"] == body["batch_id"]
    runs = client.get("/api/runs?samples=false", headers=alice).json()
    assert [r["batch_id"] for r in runs] == [body["batch_id"]]  # the gate's run is in History


def _cli():
    path = Path(__file__).resolve().parent.parent / "scripts" / "ragseal_gate.py"
    spec = importlib.util.spec_from_file_location("ragseal_gate", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cli_polls_and_sets_the_exit_code(monkeypatch, capsys):
    cli = _cli()
    verdict_body = {"status": "done", "pass": False, "reasons": ["pass rate 50.0% is below the minimum 80.0%"], "pass_rate": 0.5,
                    "min_pass_rate": 0.8, "new_failures": [{"test_id": "t2", "category": "RETRIEVAL_FAILURE", "question": "q2"}],
                    "max_new_failures": 0, "fixed": [], "total": 2, "pack_id": "banking", "baseline_batch_id": "b_old", "report_url": "u"}
    replies = iter([(202, {"status": "running", "gate_id": "gate_1"}),
                    (202, {"status": "running", "gate_id": "gate_1", "progress": {"done": 1, "total": 2}}),
                    (200, {"gate_id": "gate_1", **verdict_body})])
    calls = []
    monkeypatch.setattr(cli, "request", lambda method, url, token, body=None, timeout=60: calls.append((method, url)) or next(replies))
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    code = cli.main(["--url", "https://r.example/", "--token", "rsk_x", "--pack", "banking"])
    out = capsys.readouterr().out
    assert code == 1 and "RAGSeal gate: FAIL" in out and "new failure t2" in out
    assert calls[0] == ("POST", "https://r.example/api/gate") and calls[-1] == ("GET", "https://r.example/api/gate/gate_1")
    assert cli.main(["--pack", "banking", "--url", "", "--token", ""]) == 2
