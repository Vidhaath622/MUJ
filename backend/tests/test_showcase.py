"""Sample results: the demo account's latest baseline run of each pack, shown read-only to everyone."""

from app.security import DEMO_EMAIL

from .conftest import auth_headers


def _run(batch_id, pack, created_at, total=4, **extra):
    return {"batch_id": batch_id, "pack_id": pack, "created_at": created_at, "total_evaluated": total,
            "overall_score": 0.8, "aggregates": {"pass_rate": 0.75}, "results": [{"test_id": f"t{i}"} for i in range(total)], **extra}


def _seed_demo(app):
    db = app.state.db
    demo = db.user_by_email(DEMO_EMAIL)[0]
    for run in (
        _run("b_old", "banking", "2026-10-24T10:00:00Z"),
        _run("b_base", "banking", "2026-10-24T11:00:00Z"),
        _run("b_v2", "banking", "2026-10-24T12:00:00Z", profile="v2"),  # a candidate profile, not the baseline
        _run("b_part", "banking", "2026-10-24T13:00:00Z", total=2),  # partial: never stands in for the pack
        _run("b_bot", "banking", "2026-10-24T14:00:00Z", answer_source="external"),  # a connected bot
        _run("inj", "injection", "2026-10-24T15:00:00Z", kind="injection"),
        _run("r_base", "recruitment", "2026-10-24T09:00:00Z", profile="v1"),
        {"batch_id": "r_stub", "pack_id": "recruitment", "created_at": "2026-10-24T16:00:00Z", "total_evaluated": 4},  # no score
        {**_run("inj_untagged", "injection", "2026-10-24T16:30:00Z")},
    ):
        db.save_run(demo.id, run)
    db.start_run(demo.id, "r_running", "recruitment", 4)  # still running: never a sample
    return demo


def test_new_users_see_samples_read_only(app, client, alice):
    _seed_demo(app)
    samples = client.get("/api/runs/samples", headers=alice).json()
    assert [(s["batch_id"], s["sample"], s["read_only"]) for s in samples] == [("b_base", True, True), ("r_base", True, True)]
    runs = client.get("/api/runs", headers=alice).json()
    assert [r["batch_id"] for r in runs] == ["b_base", "r_base"] and all(r["sample"] for r in runs)
    assert client.get("/api/runs?samples=false", headers=alice).json() == []

    detail = client.get("/api/runs/b_base", headers=alice).json()
    assert detail["sample"] is True and detail["read_only"] is True and detail["status"] == "done" and len(detail["results"]) == 4
    assert client.get("/api/runs/b_base/progress", headers=alice).json()["status"] == "done"
    assert client.post("/api/runs/b_base/rejudge", headers=alice).status_code == 403
    for hidden in ("b_v2", "b_part", "b_bot", "inj", "inj_untagged", "r_stub", "b_old", "r_running"):
        assert client.get(f"/api/runs/{hidden}", headers=alice).status_code == 404


def test_own_run_replaces_the_sample_in_the_list(app, client, alice):
    _seed_demo(app)
    me = client.get("/api/auth/me", headers=alice).json()
    app.state.db.save_run(me["id"], _run("mine", "banking", "2026-10-23T08:00:00Z"))
    runs = client.get("/api/runs", headers=alice).json()
    assert [(r["batch_id"], r["sample"]) for r in runs] == [("r_base", True), ("mine", False)]
    assert len(client.get("/api/runs/samples", headers=alice).json()) == 2  # still listed for comparison
    assert client.get("/api/runs/mine", headers=alice).json()["sample"] is False


def test_demo_account_and_disabled_showcase_see_no_samples(app, client):
    _seed_demo(app)
    token = client.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": "demo1234"}).json()["access_token"]
    runs = client.get("/api/runs", headers=auth_headers(token)).json()
    assert runs and not any(r["sample"] for r in runs)
    assert client.get("/api/runs/samples", headers=auth_headers(token)).json() == []
    app.state.showcase.email = None
    app.state.showcase._loaded_at = float("-inf")
    body = client.post("/api/auth/register", json={"email": "carol@example.com", "password": "secret123"}).json()
    assert client.get("/api/runs", headers=auth_headers(body["access_token"])).json() == []
