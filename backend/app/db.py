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
        """Runs still 'running' at startup were cut off by a restart."""
        with self._connect() as conn:
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

    def latest_done_run(self, user_id: str, pack_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT json FROM runs WHERE user_id = ? AND pack_id = ? AND status = 'done' ORDER BY created_at DESC, rowid DESC LIMIT 1",
                (user_id, pack_id),
            ).fetchone()
        return json.loads(row["json"]) if row else None

    def run_by_id(self, batch_id: str) -> dict | None:
        """Any user's finished run: labels and agreement are shared across the labelling team."""
        with self._connect() as conn:
            row = conn.execute("SELECT json FROM runs WHERE batch_id = ? AND status = 'done'", (batch_id,)).fetchone()
        return json.loads(row["json"]) if row else None

    def labelling_batch(self, pack_id: str) -> str | None:
        """The run that already holds the most labels for this pack, so every labeller sees the same answers."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT batch_id, COUNT(*) AS n FROM labels WHERE pack_id = ? GROUP BY batch_id ORDER BY n DESC, MAX(created_at) DESC LIMIT 1",
                (pack_id,),
            ).fetchone()
        return row["batch_id"] if row else None

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
