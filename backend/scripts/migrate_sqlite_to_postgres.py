"""Copy the backend's SQLite data into Postgres (for example Neon). One-shot and safe to re-run.

    DATABASE_URL=postgresql://... python backend/scripts/migrate_sqlite_to_postgres.py backend/data/app.sqlite
    ... --dry-run   counts what would be copied, writes nothing

Tables are copied in foreign-key order (users first). Rows whose key already exists in
Postgres are skipped, so re-running only adds what is missing. Runs and analyses are
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

    Database(sqlite_path.parent / "unused.sqlite", url=url) if not dry_run else None  # creates the schema in Postgres
    source = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    report: dict[str, dict[str, int]] = {}
    with psycopg.connect(url, connect_timeout=15) as target:
        for table, keys, order in TABLES:
            rows = source.execute(f"SELECT * FROM {table} ORDER BY {order}").fetchall()
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
                    copied += target.execute(statement, tuple(row[c] for c in columns)).rowcount
            count = target.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            report[table] = {"source": len(rows), "copied": copied, "skipped": len(rows) - copied, "target": count}
    source.close()
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
        print(f"  {table:12} source {counts['source']:5}  copied {counts['copied']:5}  skipped {counts['skipped']:5}  now in Postgres {counts['target']:5}")
    short = [t for t, c in report.items() if not args.dry_run and c["target"] < c["source"]]
    if short:
        sys.exit(f"Postgres has fewer rows than SQLite in: {', '.join(short)}")
    print("Done." if not args.dry_run else "Dry run only: nothing was written.")


if __name__ == "__main__":
    main()
