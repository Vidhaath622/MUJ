"""SQLite storage for users, batch runs and single evaluations."""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    batch_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    pack_id TEXT,
    created_at TEXT NOT NULL,
    total_evaluated INTEGER NOT NULL,
    pass_rate REAL,
    json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_user_created ON runs(user_id, created_at);
CREATE TABLE IF NOT EXISTS evaluations (
    evaluation_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    query TEXT NOT NULL,
    category TEXT,
    json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evaluations_user_created ON evaluations(user_id, created_at);
CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS label_locks (
    pack_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    locked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS labels (
    batch_id TEXT NOT NULL,
    test_id TEXT NOT NULL,
    labeler TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    pack_id TEXT,
    correct INTEGER NOT NULL,
    failure_type TEXT,
    note TEXT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (batch_id, test_id, labeler)
);
"""


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass(frozen=True)
class User:
    id: str
    email: str

    def public(self) -> dict:
        return {"id": self.id, "email": self.email}


class Database:
    def __init__(self, path: Path):
        self.path = path
        with self._connect() as conn:
            conn.executescript(SCHEMA)
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(runs)")}
            if "status" not in columns:
                conn.execute("ALTER TABLE runs ADD COLUMN status TEXT NOT NULL DEFAULT 'done'")
            if "error" not in columns:
                conn.execute("ALTER TABLE runs ADD COLUMN error TEXT")

    @contextmanager
    def _connect(self):
        # One short-lived connection per operation: routes run on threadpool workers.
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    # -------------------------------------------------------------- users

    def create_user(self, email: str, password_hash: str) -> User:
        user = User(id="usr_" + uuid.uuid4().hex[:12], email=email)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user.id, email, password_hash, utc_now()),
            )
        return user

    def user_by_email(self, email: str) -> tuple[User, str] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        return (User(row["id"], row["email"]), row["password_hash"]) if row else None

    def user_by_id(self, user_id: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
        return User(row["id"], row["email"]) if row else None

    # --------------------------------------------------------------- runs

    def start_run(self, user_id: str, batch_id: str, pack_id: str | None, total: int) -> str:
        """Placeholder row for an async batch, so it shows up in History while it runs."""
        created_at = utc_now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO runs (batch_id, user_id, pack_id, created_at, total_evaluated, pass_rate, json, status)"
                " VALUES (?, ?, ?, ?, ?, NULL, '{}', 'running')",
                (batch_id, user_id, pack_id, created_at, total),
            )
        return created_at

    def fail_run(self, batch_id: str, error: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE runs SET status = 'failed', error = ? WHERE batch_id = ?", (error, batch_id))

    def fail_interrupted_runs(self) -> int:
        """Runs and analyses still 'running' at startup were cut off by a restart."""
        with self._connect() as conn:
            conn.execute("UPDATE analyses SET status = 'failed', error = 'interrupted by a server restart' WHERE status = 'running'")
            return conn.execute(
                "UPDATE runs SET status = 'failed', error = 'interrupted by a server restart' WHERE status = 'running'"
            ).rowcount

    def run_status(self, user_id: str, batch_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT batch_id, pack_id, created_at, total_evaluated, status, error FROM runs WHERE user_id = ? AND batch_id = ?",
                (user_id, batch_id),
            ).fetchone()
        return dict(row) if row else None

    def save_run(self, user_id: str, batch: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO runs (batch_id, user_id, pack_id, created_at, total_evaluated, pass_rate, json, status, error)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, 'done', NULL)",
                (
                    batch["batch_id"],
                    user_id,
                    batch.get("pack_id"),
                    batch.get("created_at") or utc_now(),
                    batch.get("total_evaluated") or 0,
                    (batch.get("aggregates") or {}).get("pass_rate"),
                    json.dumps(batch),
                ),
            )

    def list_runs(self, user_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT batch_id, pack_id, created_at, total_evaluated, pass_rate, status,"
                " json_extract(json, '$.overall_score') AS overall_score, json_extract(json, '$.timing') AS timing"
                " FROM runs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC",
                (user_id,),
            ).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            item["timing"] = json.loads(item["timing"]) if item["timing"] else None
            out.append(item)
        return out

    def get_run(self, user_id: str, batch_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT json FROM runs WHERE user_id = ? AND batch_id = ?", (user_id, batch_id)).fetchone()
        return json.loads(row["json"]) if row else None

    # -------------------------------------------------------- evaluations

    def save_evaluation(self, user_id: str, evaluation: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO evaluations (evaluation_id, user_id, created_at, query, category, json)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (
                    evaluation.get("evaluation_id") or "eval_" + uuid.uuid4().hex[:10],
                    user_id,
                    utc_now(),
                    evaluation.get("query") or "",
                    (evaluation.get("root_cause") or {}).get("category"),
                    json.dumps(evaluation),
                ),
            )

    def count_evaluations(self, user_id: str) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM evaluations WHERE user_id = ?", (user_id,)).fetchone()[0]

    # ------------------------------------------------------------- labels

    def run_by_id(self, batch_id: str) -> dict | None:
        """Any user's finished run: labels and agreement are shared across the labelling team."""
        with self._connect() as conn:
            row = conn.execute("SELECT json FROM runs WHERE batch_id = ? AND status = 'done'", (batch_id,)).fetchone()
        return json.loads(row["json"]) if row else None

    def label_lock(self, pack_id: str) -> str | None:
        """The run every labeller of this pack works on, fixed by the first label."""
        with self._connect() as conn:
            row = conn.execute("SELECT batch_id FROM label_locks WHERE pack_id = ?", (pack_id,)).fetchone()
        return row["batch_id"] if row else None

    def lock_labels(self, pack_id: str, batch_id: str) -> str:
        """Lock the pack to this run unless it is already locked; returns the run it is locked to."""
        with self._connect() as conn:
            conn.execute("INSERT OR IGNORE INTO label_locks VALUES (?, ?, ?)", (pack_id, batch_id, utc_now()))
            return conn.execute("SELECT batch_id FROM label_locks WHERE pack_id = ?", (pack_id,)).fetchone()["batch_id"]

    def labelling_candidate(self, pack_id: str, case_count: int) -> tuple[dict | None, str | None]:
        """(newest finished run of the pack's current size, a newer run of that size still running)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT batch_id, status FROM runs WHERE pack_id = ? AND total_evaluated = ? AND status IN ('done', 'running')"
                " ORDER BY created_at DESC, rowid DESC",
                (pack_id, case_count),
            ).fetchall()
        running = next((r["batch_id"] for r in rows if r["status"] == "running"), None)
        done = next((r["batch_id"] for r in rows if r["status"] == "done"), None)
        return (self.run_by_id(done) if done else None), running

    def save_label(self, user_id: str, label: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO labels (batch_id, test_id, labeler, user_id, pack_id, correct, failure_type, note, question, answer, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    label["batch_id"], label["test_id"], label["labeler"], user_id, label.get("pack_id"),
                    int(bool(label["correct"])), label.get("failure_type"), label.get("note"),
                    label["question"], label["answer"], utc_now(),
                ),
            )

    def labels(self, pack_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if pack_id:
                rows = conn.execute("SELECT * FROM labels WHERE pack_id = ? ORDER BY created_at", (pack_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM labels ORDER BY created_at").fetchall()
        return [dict(r) | {"correct": bool(r["correct"])} for r in rows]

    # ------------------------------------------------- async analyses (P5, P6)

    def start_analysis(self, user_id: str, analysis_id: str, kind: str) -> str:
        created_at = utc_now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO analyses (id, user_id, kind, status, created_at) VALUES (?, ?, ?, 'running', ?)",
                (analysis_id, user_id, kind, created_at),
            )
        return created_at

    def finish_analysis(self, analysis_id: str, result: dict) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE analyses SET status = 'done', json = ? WHERE id = ?", (json.dumps(result), analysis_id))

    def fail_analysis(self, analysis_id: str, error: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE analyses SET status = 'failed', error = ? WHERE id = ?", (error, analysis_id))

    def get_analysis(self, user_id: str, analysis_id: str, kind: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, status, error, created_at, json FROM analyses WHERE id = ? AND user_id = ? AND kind = ?",
                (analysis_id, user_id, kind),
            ).fetchone()
        if row is None:
            return None
        return {"id": row["id"], "status": row["status"], "error": row["error"], "created_at": row["created_at"], "result": json.loads(row["json"])}

    def latest_analysis(self, user_id: str, kind: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM analyses WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", (user_id, kind)
            ).fetchone()
        return row["id"] if row else None
