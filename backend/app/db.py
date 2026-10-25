"""Storage for users, batch runs, evaluations, analyses and labels.

SQLite by default; Postgres (psycopg 3) when DATABASE_URL is set. SQL is written once with
"?" placeholders; the Postgres dialect rewrites placeholders, upserts, JSON access and the
row-order tie-breaker (SQLite's implicit rowid becomes an explicit seq column).
"""

from __future__ import annotations

import atexit
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

TABLES = {
    "users": """
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        created_at TEXT NOT NULL,
        google_sub TEXT UNIQUE""",
    "runs": """
        batch_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        pack_id TEXT,
        created_at TEXT NOT NULL,
        total_evaluated INTEGER NOT NULL,
        pass_rate {real},
        json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'done',
        error TEXT{seq}""",
    "evaluations": """
        evaluation_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        query TEXT NOT NULL,
        category TEXT,
        json TEXT NOT NULL""",
    "analyses": """
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL DEFAULT '{{}}'{seq}""",
    "label_locks": """
        pack_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        locked_at TEXT NOT NULL""",
    "labels": """
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
        PRIMARY KEY (batch_id, test_id, labeler)""",
}
INDEXES = [
    "CREATE INDEX IF NOT EXISTS runs_user_created ON runs(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS evaluations_user_created ON evaluations(user_id, created_at)",
]
# Labels saved in the same second would otherwise come back in an order that differs between databases.
LABEL_ORDER = "created_at, batch_id, test_id, labeler"
# Tables whose insertion order breaks ties between equal created_at values.
ORDERED = {"runs", "analyses"}
KEYS = {"runs": ["batch_id"], "evaluations": ["evaluation_id"], "label_locks": ["pack_id"], "labels": ["batch_id", "test_id", "labeler"]}


class Dialect:
    """What differs between SQLite and Postgres for the statements this module uses."""

    def __init__(self, postgres: bool):
        self.postgres = postgres
        self.tie = "seq" if postgres else "rowid"

    def sql(self, statement: str) -> str:
        return statement.replace("?", "%s") if self.postgres else statement

    def create_table(self, name: str) -> str:
        body = TABLES[name].format(
            real="DOUBLE PRECISION" if self.postgres else "REAL",
            seq=",\n        seq BIGSERIAL" if self.postgres and name in ORDERED else "",
        )
        return f"CREATE TABLE IF NOT EXISTS {name} ({body}\n)"

    def json_number(self, field: str) -> str:
        if self.postgres:
            return f"(json::jsonb ->> '{field}')::double precision"
        return f"json_extract(json, '$.{field}')"

    def json_text(self, field: str) -> str:
        if self.postgres:
            return f"(json::jsonb -> '{field}')::text"
        return f"json_extract(json, '$.{field}')"

    def upsert(self, table: str, columns: list[str], replace: bool = True) -> str:
        """INSERT that replaces (or keeps) an existing row with the same key."""
        marks = ", ".join("?" * len(columns))
        names = ", ".join(columns)
        if not self.postgres:
            return f"INSERT OR {'REPLACE' if replace else 'IGNORE'} INTO {table} ({names}) VALUES ({marks})"
        keys = KEYS[table]
        if replace:
            updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in columns if c not in keys)
            action = f"DO UPDATE SET {updates}"
        else:
            action = "DO NOTHING"
        return self.sql(f"INSERT INTO {table} ({names}) VALUES ({marks}) ON CONFLICT ({', '.join(keys)}) {action}")


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass(frozen=True)
class User:
    id: str
    email: str

    def public(self) -> dict:
        return {"id": self.id, "email": self.email}


class Database:
    def __init__(self, path: Path, url: str | None = None):
        """`path` is the SQLite file (and the data directory for local files); `url` switches to Postgres."""
        self.path = path
        self.url = url or None
        self.d = Dialect(postgres=bool(self.url))
        with self._connect() as conn:
            for name in TABLES:
                conn.execute(self.d.create_table(name))
            for index in INDEXES:
                conn.execute(index)
            self._migrate(conn)

    _pools: dict[str, object] = {}

    def _pool(self):
        """One small pool per database URL: a hosted Postgres (Neon) is too slow to connect per query."""
        pool = Database._pools.get(self.url)
        if pool is None:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool

            pool = ConnectionPool(
                self.url,
                min_size=1,
                max_size=8,
                kwargs={"row_factory": dict_row, "connect_timeout": 10},
                check=ConnectionPool.check_connection,  # Neon closes idle connections
                open=True,
            )
            if not Database._pools:
                atexit.register(Database.close_pools)
            Database._pools[self.url] = pool
        return pool

    @staticmethod
    def close_pools() -> None:
        """Close pooled connections before the interpreter tears its threads down."""
        for pool in Database._pools.values():
            pool.close()
        Database._pools.clear()

    @property
    def backend(self) -> str:
        return "postgres" if self.d.postgres else "sqlite"

    def _migrate(self, conn) -> None:
        """Bring databases created by older versions up to the current columns."""
        if self.d.postgres:
            conn.execute("ALTER TABLE runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'")
            conn.execute("ALTER TABLE runs ADD COLUMN IF NOT EXISTS error TEXT")
            conn.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub)")
            return
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(runs)")}
        if "status" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN status TEXT NOT NULL DEFAULT 'done'")
        if "error" not in columns:
            conn.execute("ALTER TABLE runs ADD COLUMN error TEXT")
        users = {row["name"]: row for row in conn.execute("PRAGMA table_info(users)")}
        if "google_sub" not in users or users["password_hash"]["notnull"]:
            # SQLite cannot drop NOT NULL in place, so rebuild the users table with the same rows.
            # Build users_new, copy, drop users, then rename: the order SQLite documents, which keeps
            # the foreign keys in runs, labels and the other tables pointing at "users".
            keep = "id, email, password_hash, created_at" + (", google_sub" if "google_sub" in users else "")
            conn.execute(self.d.create_table("users").replace("EXISTS users (", "EXISTS users_new (", 1))
            conn.execute(f"INSERT INTO users_new ({keep}) SELECT {keep} FROM users")
            conn.execute("DROP TABLE users")
            conn.execute("ALTER TABLE users_new RENAME TO users")

    @contextmanager
    def _connect(self):
        # One short-lived connection per operation: routes run on threadpool workers.
        if self.d.postgres:
            with self._pool().connection() as conn, conn.transaction():
                yield _PgConnection(conn, self.d)
            return
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

    def user_by_email(self, email: str) -> tuple[User, str | None] | None:
        """(user, password hash); the hash is None for accounts that only sign in with Google."""
        with self._connect() as conn:
            row = conn.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        return (User(row["id"], row["email"]), row["password_hash"]) if row else None

    def user_by_google_sub(self, sub: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute("SELECT id, email FROM users WHERE google_sub = ?", (sub,)).fetchone()
        return User(row["id"], row["email"]) if row else None

    def google_sub_of(self, user_id: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT google_sub FROM users WHERE id = ?", (user_id,)).fetchone()
        return row["google_sub"] if row else None

    def create_google_user(self, email: str, sub: str) -> User:
        """A user who signs in with Google only: no password."""
        user = User(id="usr_" + uuid.uuid4().hex[:12], email=email)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, created_at, google_sub) VALUES (?, ?, NULL, ?, ?)",
                (user.id, email, utc_now(), sub),
            )
        return user

    def link_google(self, user_id: str, sub: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE users SET google_sub = ? WHERE id = ?", (sub, user_id))

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
                self.d.upsert("runs", ["batch_id", "user_id", "pack_id", "created_at", "total_evaluated", "pass_rate", "json", "status", "error"]),
                (
                    batch["batch_id"],
                    user_id,
                    batch.get("pack_id"),
                    batch.get("created_at") or utc_now(),
                    batch.get("total_evaluated") or 0,
                    (batch.get("aggregates") or {}).get("pass_rate"),
                    json.dumps(batch),
                    "done",
                    None,
                ),
            )

    def list_runs(self, user_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT batch_id, pack_id, created_at, total_evaluated, pass_rate, status,"
                f" {self.d.json_number('overall_score')} AS overall_score, {self.d.json_text('timing')} AS timing"
                f" FROM runs WHERE user_id = ? ORDER BY created_at DESC, {self.d.tie} DESC",
                (user_id,),
            ).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            item["timing"] = json.loads(item["timing"]) if item["timing"] else None
            out.append(item)
        return out

    def baseline_runs(self, user_id: str) -> list[dict]:
        """This user's latest baseline run per pack, as list_runs items.

        Baseline: finished and scored, the default (v1) RAG profile, the built-in RAG (not a connected
        bot), not an injection run, and the pack's largest run, so a partial run never stands in for it.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT batch_id, pack_id, created_at, total_evaluated, pass_rate, status,"
                f" {self.d.json_number('overall_score')} AS overall_score, {self.d.json_text('timing')} AS timing,"
                f" {self.d.json_text('profile')} AS profile, {self.d.json_text('kind')} AS kind,"
                f" {self.d.json_text('answer_source')} AS answer_source"
                f" FROM runs WHERE user_id = ? AND status = 'done' AND pack_id IS NOT NULL"
                f" ORDER BY created_at DESC, {self.d.tie} DESC",
                (user_id,),
            ).fetchall()

        def text(value):  # Postgres returns JSON text ('"v2"', 'null'); SQLite the plain value
            return json.loads(value) if self.d.postgres and value is not None else value

        by_pack: dict[str, list[dict]] = {}
        for row in rows:
            item = dict(row)
            if text(item.pop("profile")) not in (None, "v1") or text(item.pop("kind")) or text(item.pop("answer_source")) not in (None, "builtin"):
                continue
            if item["overall_score"] is None or item["pack_id"] == "injection":  # placeholders and injection runs
                continue
            item["timing"] = json.loads(item["timing"]) if item["timing"] else None
            by_pack.setdefault(item["pack_id"], []).append(item)
        out = []
        for items in by_pack.values():  # newest first within each pack
            full = max(i["total_evaluated"] for i in items)
            out.append(next(i for i in items if i["total_evaluated"] == full))
        return sorted(out, key=lambda i: i["created_at"], reverse=True)

    def get_run(self, user_id: str, batch_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT json FROM runs WHERE user_id = ? AND batch_id = ?", (user_id, batch_id)).fetchone()
        return json.loads(row["json"]) if row else None

    # -------------------------------------------------------- evaluations

    def save_evaluation(self, user_id: str, evaluation: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                self.d.upsert("evaluations", ["evaluation_id", "user_id", "created_at", "query", "category", "json"]),
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
            return conn.execute("SELECT COUNT(*) AS n FROM evaluations WHERE user_id = ?", (user_id,)).fetchone()["n"]

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
            conn.execute(self.d.upsert("label_locks", ["pack_id", "batch_id", "locked_at"], replace=False), (pack_id, batch_id, utc_now()))
            return conn.execute("SELECT batch_id FROM label_locks WHERE pack_id = ?", (pack_id,)).fetchone()["batch_id"]

    def labelling_candidate(self, pack_id: str, case_count: int) -> tuple[dict | None, str | None]:
        """(newest finished run of the pack's current size, a newer run of that size still running)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT batch_id, status FROM runs WHERE pack_id = ? AND total_evaluated = ? AND status IN ('done', 'running')"
                f" ORDER BY created_at DESC, {self.d.tie} DESC",
                (pack_id, case_count),
            ).fetchall()
        running = next((r["batch_id"] for r in rows if r["status"] == "running"), None)
        done = next((r["batch_id"] for r in rows if r["status"] == "done"), None)
        return (self.run_by_id(done) if done else None), running

    def save_label(self, user_id: str, label: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                self.d.upsert("labels", ["batch_id", "test_id", "labeler", "user_id", "pack_id", "correct", "failure_type", "note",
                                         "question", "answer", "created_at"]),
                (
                    label["batch_id"], label["test_id"], label["labeler"], user_id, label.get("pack_id"),
                    int(bool(label["correct"])), label.get("failure_type"), label.get("note"),
                    label["question"], label["answer"], utc_now(),
                ),
            )

    def labels(self, pack_id: str | None = None) -> list[dict]:
        with self._connect() as conn:
            if pack_id:
                rows = conn.execute(f"SELECT * FROM labels WHERE pack_id = ? ORDER BY {LABEL_ORDER}", (pack_id,)).fetchall()
            else:
                rows = conn.execute(f"SELECT * FROM labels ORDER BY {LABEL_ORDER}").fetchall()
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
                f"SELECT id FROM analyses WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, {self.d.tie} DESC LIMIT 1", (user_id, kind)
            ).fetchone()
        return row["id"] if row else None


class _PgConnection:
    """A psycopg connection that accepts this module's "?" statements, like sqlite3's conn.execute."""

    def __init__(self, conn, dialect: Dialect):
        self._conn = conn
        self._d = dialect

    def execute(self, statement: str, params: tuple = ()):
        return self._conn.execute(self._d.sql(statement), params)
