from app.engine_bridge import JudgeError, ModelUnavailable


def upload(client, headers, content=b"Employees receive 20 days paid leave.", name="policy.txt"):
    resp = client.post("/api/documents/upload", headers=headers, files={"file": (name, content, "text/plain")})
    assert resp.status_code == 200, resp.text
    return resp.json()


# ------------------------------------------------------------------ health


def test_health_ok(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["engine_ready"] is True
    assert body["evaluation_mode"] == "local"
    assert body["judge_model"] == "qwen3:8b"
    assert "timestamp" in body


def test_health_with_engine_down(client, fake_engine):
    fake_engine.ollama_up = False
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["engine_ready"] is False
    assert "not reachable" in body["engine_error"]


# --------------------------------------------------------------- documents


def test_upload_passes_bytes_through(client, alice, fake_engine):
    content = b"%PDF-ish \x00\x01 raw bytes"
    doc = upload(client, alice, content, "raw.pdf")
    owner, filename, data = fake_engine.uploads[-1]
    assert owner.startswith("usr_")
    assert filename == "raw.pdf"
    assert data == content
    assert doc["filename"] == "raw.pdf"


def test_upload_too_large_is_413(client, alice, monkeypatch):
    monkeypatch.setattr("app.routers.documents.MAX_UPLOAD_BYTES", 10)
    resp = client.post("/api/documents/upload", headers=alice, files={"file": ("big.txt", b"x" * 11, "text/plain")})
    assert resp.status_code == 413


def test_documents_are_user_scoped(client, alice, bob):
    doc = upload(client, alice)
    doc_id = doc["document_id"]

    assert [d["document_id"] for d in client.get("/api/documents", headers=alice).json()] == [doc_id]
    assert client.get("/api/documents", headers=bob).json() == []
    assert client.get(f"/api/documents/{doc_id}", headers=bob).status_code == 404
    assert client.delete(f"/api/documents/{doc_id}", headers=bob).status_code == 404

    detail = client.get(f"/api/documents/{doc_id}", headers=alice).json()
    assert detail["chunks"][0]["chunk_id"]

    assert client.delete(f"/api/documents/{doc_id}", headers=alice).status_code == 204
    assert client.get(f"/api/documents/{doc_id}", headers=alice).status_code == 404


# ---------------------------------------------------------- error mapping


def test_not_found_maps_to_404(client, alice):
    resp = client.post("/api/rag/ask", headers=alice, json={"query": "hi", "document_ids": ["doc_missing"]})
    assert resp.status_code == 404
    assert "doc_missing" in resp.json()["detail"]


def test_model_unavailable_maps_to_503(client, alice, fake_engine):
    doc = upload(client, alice)
    fake_engine.raise_on_eval = ModelUnavailable("model 'qwen3:8b' is not pulled in Ollama")
    resp = client.post("/api/evaluate/query", headers=alice, json={"query": "q", "document_id": doc["document_id"]})
    assert resp.status_code == 503
    assert resp.json()["detail"].startswith("Local model warming up / not pulled:")


def test_judge_error_maps_to_502(client, alice, fake_engine):
    doc = upload(client, alice)
    fake_engine.raise_on_eval = JudgeError("judge did not return JSON")
    resp = client.post("/api/evaluate/query", headers=alice, json={"query": "q", "document_id": doc["document_id"]})
    assert resp.status_code == 502


def test_missing_document_ids_is_422(client, alice):
    resp = client.post("/api/evaluate/query", headers=alice, json={"query": "q"})
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], str)


# -------------------------------------------------------------- evaluation


def test_evaluate_query_accepts_v1_and_v2_ids(client, alice, fake_engine, app):
    a = upload(client, alice)["document_id"]
    b = upload(client, alice, name="other.txt")["document_id"]
    body = {"query": "Leave days?", "document_id": a, "document_ids": [b], "type": "unanswerable"}
    resp = client.post("/api/evaluate/query", headers=alice, json=body)
    assert resp.status_code == 200
    assert resp.json()["metrics"]["answer_accuracy"]["score"] is None
    assert fake_engine.calls[-1][3] == (b, a)
    assert fake_engine.calls[-1][4] == "unanswerable"
    user_id = client.get("/api/auth/me", headers=alice).json()["id"]
    assert app.state.db.count_evaluations(user_id) == 1


def test_batch_saves_run_and_lists_it(client, alice, bob):
    doc_id = upload(client, alice)["document_id"]
    cases = [{"test_id": "tc_01", "question": "Leave days?", "ground_truth_answer": "20"}]
    first = client.post("/api/evaluate/batch", headers=alice, json={"document_id": doc_id, "test_cases": cases}).json()
    second = client.post("/api/evaluate/batch", headers=alice, json={"document_ids": [doc_id], "test_cases": cases}).json()

    runs = client.get("/api/runs", headers=alice).json()
    assert [r["batch_id"] for r in runs] == [second["batch_id"], first["batch_id"]]
    assert set(runs[0]) == {"batch_id", "pack_id", "created_at", "total_evaluated", "pass_rate", "status", "overall_score", "timing"}
    assert runs[0]["status"] == "done"
    assert runs[0]["total_evaluated"] == 1
    assert runs[0]["pass_rate"] == 1.0

    full = client.get(f"/api/runs/{first['batch_id']}", headers=alice).json()
    assert full == first

    assert client.get("/api/runs", headers=bob).json() == []
    assert client.get(f"/api/runs/{first['batch_id']}", headers=bob).status_code == 404


def test_batch_with_pack_only_loads_pack(client, alice, fake_engine):
    resp = client.post("/api/evaluate/batch", headers=alice, json={"pack_id": "banking"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["pack_id"] == "banking"
    assert body["total_evaluated"] == 1
    assert client.get("/api/runs", headers=alice).json()[0]["pack_id"] == "banking"


def test_pack_batch_with_frontend_shape_uses_whole_pack(client, alice, fake_engine):
    # frontend/src/lib/api.ts sends one document_id plus trimmed test cases and the pack_id.
    other = upload(client, alice)["document_id"]
    resp = client.post(
        "/api/evaluate/batch",
        headers=alice,
        json={"document_id": other, "pack_id": "banking", "test_cases": [{"test_id": "bk_01", "question": "What is the monthly fee?"}]},
    )
    assert resp.status_code == 200, resp.text
    _, _, document_ids, _, pack_id = fake_engine.calls[-1]
    # The pack's own document plus the one the client sent.
    assert other in document_ids and len(document_ids) == 2 and pack_id == "banking"
    assert fake_engine.last_batch_cases[0]["type"] == "factoid"
    assert fake_engine.last_batch_cases[0]["ground_truth_answer"] == "5 USD"


def test_synthetic_count_is_capped(client, alice, fake_engine):
    doc_id = upload(client, alice)["document_id"]
    resp = client.post("/api/synthetic/generate", headers=alice, json={"document_id": doc_id, "count": 50})
    assert resp.status_code == 200
    assert fake_engine.calls[-1] == ("synthetic", fake_engine.calls[-1][1], doc_id, 20, True)

    default = client.post("/api/synthetic/generate", headers=alice, json={"document_id": doc_id}).json()
    assert default["generated_count"] == 5


def test_packs(client, alice):
    packs = client.get("/api/packs", headers=alice).json()
    assert packs[0]["pack_id"] == "banking"
    loaded = client.post("/api/packs/banking/load", headers=alice).json()
    assert loaded["document_ids"] and loaded["test_cases"]
    assert client.post("/api/packs/nope/load", headers=alice).status_code == 404


def test_cors_allows_vite_dev_origin(client):
    resp = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def _wait_for(client, headers, batch_id, timeout=5.0):
    import time

    deadline = time.time() + timeout
    while time.time() < deadline:
        progress = client.get(f"/api/runs/{batch_id}/progress", headers=headers).json()
        if progress["status"] != "running":
            return progress
        time.sleep(0.05)
    raise AssertionError("batch did not finish")


def test_async_batch_reports_progress_then_result(client, alice, fake_engine):
    resp = client.post("/api/evaluate/batch", headers=alice, json={"pack_id": "banking", "async": True})
    assert resp.status_code == 202, resp.text
    started = resp.json()
    assert started["status"] == "running" and started["total"] == 1
    progress = _wait_for(client, alice, started["batch_id"])
    assert progress["status"] == "done" and progress["done"] == progress["total"] == 1 and progress["eta_ms"] == 0
    full = client.get(f"/api/runs/{started['batch_id']}", headers=alice)
    assert full.status_code == 200 and full.json()["batch_id"] == started["batch_id"]
    runs = client.get("/api/runs", headers=alice).json()
    assert runs[0]["batch_id"] == started["batch_id"] and runs[0]["status"] == "done"


def test_async_batch_failure_is_reported(client, alice, bob, fake_engine):
    from app.engine_bridge import ModelUnavailable

    fake_engine.batch_error = ModelUnavailable("judge down")
    started = client.post("/api/evaluate/batch", headers=alice, json={"pack_id": "banking", "async": True}).json()
    progress = _wait_for(client, alice, started["batch_id"])
    assert progress["status"] == "failed" and "judge down" in progress["error"]
    assert client.get(f"/api/runs/{started['batch_id']}", headers=alice).json() == {
        "batch_id": started["batch_id"], "status": "failed", "error": "judge down",
    }
    # Other users cannot see the job.
    assert client.get(f"/api/runs/{started['batch_id']}/progress", headers=bob).status_code == 404


def test_query_with_pack_case_restores_trap_metadata(client, alice, fake_engine):
    resp = client.post("/api/evaluate/query", headers=alice, json={"query": "What is the monthly fee?", "pack_id": "banking", "test_id": "bk_01"})
    assert resp.status_code == 200, resp.text
    q = fake_engine.last_query
    assert q["ground_truth"] == "5 USD" and q["case_type"] == "factoid" and q["test_id"] == "bk_01" and q["document_ids"]

    client.post("/api/evaluate/query", headers=alice, json={
        "query": "x", "document_ids": q["document_ids"], "stale_chunk_ids": ["chk_old"], "gold_chunk_ids": ["chk_new"], "type": "stale",
    })
    assert fake_engine.last_query["stale_chunk_ids"] == ["chk_old"] and fake_engine.last_query["case_type"] == "stale"

    missing = client.post("/api/evaluate/query", headers=alice, json={"query": "x", "pack_id": "banking", "test_id": "nope"})
    assert missing.status_code == 404
