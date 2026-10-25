"""Storage behaviour that must hold on both SQLite and Postgres (RAGSEAL_TEST_DATABASE_URL)."""

import pytest


@pytest.fixture
def db(app):
    return app.state.db


def _run(batch_id, score, pack="banking"):
    return {"batch_id": batch_id, "pack_id": pack, "total_evaluated": 2, "overall_score": score,
            "aggregates": {"pass_rate": score}, "results": [{"test_id": "t1"}, {"test_id": "t2"}]}


def test_a_failed_operation_rolls_back_its_writes(db):
    user = db.create_user("roll@example.com", "hash")
    with pytest.raises(RuntimeError):
        with db._connect() as conn:
            conn.execute("UPDATE users SET email = ? WHERE id = ?", ("changed@example.com", user.id))
            raise RuntimeError("boom")
    assert db.user_by_email("roll@example.com") is not None and db.user_by_email("changed@example.com") is None


def test_a_rewritten_run_is_read_back_fresh(db):
    user = db.create_user("runs@example.com", "hash")
    db.save_run(user.id, _run("batch_a", 0.5))
    assert db.get_run(user.id, "batch_a")["overall_score"] == 0.5
    assert db.run_by_id("batch_a")["overall_score"] == 0.5
    db.save_run(user.id, _run("batch_a", 0.9))  # a re-judge rewrites the run under the same id
    assert db.get_run(user.id, "batch_a")["overall_score"] == 0.9
    assert db.run_by_id("batch_a")["overall_score"] == 0.9
    assert db.run_status(user.id, "batch_a")["status"] == "done"


def test_runs_stay_private_and_status_changes_show(db):
    alice = db.create_user("alice@example.com", "hash")
    bob = db.create_user("bob@example.com", "hash")
    db.save_run(alice.id, _run("batch_b", 0.7))
    assert db.get_run(alice.id, "batch_b") is not None  # now cached on Postgres
    assert db.get_run(bob.id, "batch_b") is None and db.run_status(bob.id, "batch_b") is None
    db.start_run(alice.id, "batch_c", "banking", 2)
    assert db.run_status(alice.id, "batch_c")["status"] == "running"
    db.fail_run("batch_c", "judge down")
    failed = db.run_status(alice.id, "batch_c")
    assert failed["status"] == "failed" and failed["error"] == "judge down"
    db.save_run(alice.id, _run("batch_c", 0.4))
    assert db.run_status(alice.id, "batch_c")["status"] == "done" and db.get_run(alice.id, "batch_c")["overall_score"] == 0.4


def test_runs_saved_before_the_summary_column_are_backfilled(app, db):
    user = db.create_user("old@example.com", "hash")
    db.save_run(user.id, {**_run("batch_old", 0.6), "profile": "v2"})
    with db._connect() as conn:
        conn.execute("UPDATE runs SET summary = NULL WHERE batch_id = ?", ("batch_old",))  # as an older version left it
    from app.db import Database

    reopened = Database(db.path, url=db.url)
    [item] = reopened.list_runs(user.id)
    assert item["overall_score"] == 0.6 and reopened.baseline_runs(user.id) == []  # v2 profile: not a baseline
