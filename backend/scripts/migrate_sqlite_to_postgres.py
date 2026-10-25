"""Copy the backend's SQLite data into Postgres (for example Neon). One-shot and safe to re-run.

    DATABASE_URL=postgresql://... python backend/scripts/migrate_sqlite_to_postgres.py backend/data/app.sqlite
    ... --dry-run   counts what would be copied, writes nothing

Tables are copied in foreign-key order (users first). Rows whose key already exists in
Postgres are skipped, so re-running only adds what is missing. A user whose email already
exists in Postgres under another id (for example the seeded demo account) is not copied;
their runs, evaluations, analyses and labels are attached to the existing Postgres user. Runs and analyses are
inserted in their original order, so Postgres's seq column keeps "latest" the same as in
SQLite. The connection string is never printed (it contains the password).
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import Database  # noqa: E402

# (table, key columns, ORDER BY in SQLite)
TABLES = [
    ("users", ["id"], "created_at, rowid"),
    ("runs", ["batch_id"], "created_at, rowid"),
    ("evaluations", ["evaluation_id"], "created_at, rowid"),
    ("analyses", ["id"], "created_at, rowid"),
    ("label_locks", ["pack_id"], "locked_at, rowid"),
    ("labels", ["batch_id", "test_id", "labeler"], "created_at, rowid"),
]


def migrate(sqlite_path: Path, url: str, dry_run: bool = False) -> dict[str, dict[str, int]]:
    import psycopg

    if not dry_run:
        Database(sqlite_path.parent / "unused.sqlite", url=url)  # creates or migrates the schema in Postgres
        Database.close_pools()
    source = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    report: dict[str, dict[str, int]] = {}
    with psycopg.connect(url, connect_timeout=15) as target:
        # SQLite user id -> the id the same email already has in Postgres.
        existing = {} if dry_run else dict(target.execute("SELECT email, id FROM users").fetchall())
        remap = {r["id"]: existing[r["email"]] for r in source.execute("SELECT id, email FROM users")
                 if r["email"] in existing and existing[r["email"]] != r["id"]}
        for table, keys, order in TABLES:
            rows = source.execute(f"SELECT * FROM {table} ORDER BY {order}").fetchall()
            if table == "users":
                rows = [r for r in rows if r["id"] not in remap]
            if not rows:
                report[table] = {"source": 0, "copied": 0, "skipped": 0, "target": 0}
                continue
            columns = list(rows[0].keys())
            if dry_run:
                report[table] = {"source": len(rows), "copied": 0, "skipped": 0, "target": 0}
                continue
            statement = (
                f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})"
                f" ON CONFLICT ({', '.join(keys)}) DO NOTHING"
            )
            copied = 0
            with target.transaction():
                for row in rows:
                    values = [remap.get(row[c], row[c]) if c == "user_id" else row[c] for c in columns]
                    copied += target.execute(statement, values).rowcount
            count = target.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            report[table] = {"source": len(rows), "copied": copied, "skipped": len(rows) - copied, "target": count}
    source.close()
    if remap:
        report["users"]["merged_by_email"] = len(remap)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sqlite_path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        sys.exit("DATABASE_URL is not set")
    if not args.sqlite_path.exists():
        sys.exit(f"{args.sqlite_path} does not exist")
    host = urlsplit(url).hostname or "?"
    print(f"{'Dry run: ' if args.dry_run else ''}copying {args.sqlite_path} -> Postgres at {host}")
    report = migrate(args.sqlite_path, url, args.dry_run)
    for table, counts in report.items():
        merged = f"  (+{counts['merged_by_email']} matched by email)" if counts.get("merged_by_email") else ""
        print(f"  {table:12} source {counts['source']:5}  copied {counts['copied']:5}  skipped {counts['skipped']:5}  now in Postgres {counts['target']:5}{merged}")
    short = [t for t, c in report.items() if not args.dry_run and c["target"] < c["source"]]
    if short:
        sys.exit(f"Postgres has fewer rows than SQLite in: {', '.join(short)}")
    print("Done." if not args.dry_run else "Dry run only: nothing was written.")


if __name__ == "__main__":
    main()
