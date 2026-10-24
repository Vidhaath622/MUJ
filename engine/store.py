"""SQLite-backed document and vector store, scoped by owner.

Embeddings are stored as float32 blobs and searched with exact cosine
similarity in numpy. That is plenty for a few thousand chunks and keeps
results fully reproducible (no approximate index).
"""

from __future__ import annotations

import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .ingest import Chunk, ParsedDocument


@dataclass
class StoredDocument:
    document_id: str
    filename: str
    chunk_count: int
    pack_id: str | None
    uploaded_at: str


@dataclass
class ScoredChunk:
    chunk: Chunk
    similarity: float


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


class VectorStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                owner_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                pack_id TEXT,
                chunk_count INTEGER NOT NULL,
                uploaded_at REAL NOT NULL,
                PRIMARY KEY (owner_id, document_id)
            );
            CREATE TABLE IF NOT EXISTS chunks (
                owner_id TEXT NOT NULL,
                chunk_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                idx INTEGER NOT NULL,
                text TEXT NOT NULL,
                page INTEGER,
                embedding BLOB NOT NULL,
                PRIMARY KEY (owner_id, chunk_id)
            );
            CREATE INDEX IF NOT EXISTS chunks_doc ON chunks (owner_id, document_id);
            """
        )
        columns = {row[1] for row in self._db.execute("PRAGMA table_info(documents)")}
        if "embed_key" not in columns:
            self._db.execute("ALTER TABLE documents ADD COLUMN embed_key TEXT")
        self._db.commit()

    def add_document(
        self, owner_id: str, doc: ParsedDocument, embeddings: list[list[float]], embed_key: str, pack_id: str | None = None
    ) -> StoredDocument:
        if len(embeddings) != len(doc.chunks):
            raise ValueError("one embedding per chunk is required")
        now = time.time()
        with self._lock:
            self._db.execute("DELETE FROM chunks WHERE owner_id = ? AND document_id = ?", (owner_id, doc.document_id))
            self._db.execute(
                "INSERT OR REPLACE INTO documents (owner_id, document_id, filename, pack_id, chunk_count, uploaded_at, embed_key)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (owner_id, doc.document_id, doc.filename, pack_id, len(doc.chunks), now, embed_key),
            )
            self._db.executemany(
                "INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (owner_id, c.chunk_id, c.document_id, c.index, c.text, c.page, np.asarray(e, dtype=np.float32).tobytes())
                    for c, e in zip(doc.chunks, embeddings)
                ],
            )
            self._db.commit()
        return StoredDocument(doc.document_id, doc.filename, len(doc.chunks), pack_id, _iso(now))

    def documents_needing_embeddings(self, owner_id: str, document_ids: list[str], embed_key: str) -> list[str]:
        """Documents embedded with a different model than the current one (their vectors are not comparable)."""
        if not document_ids:
            return []
        marks = ",".join("?" * len(document_ids))
        with self._lock:
            rows = self._db.execute(
                f"SELECT document_id FROM documents WHERE owner_id = ? AND document_id IN ({marks}) AND (embed_key IS NULL OR embed_key != ?)",
                (owner_id, *document_ids, embed_key),
            ).fetchall()
        return [r[0] for r in rows]

    def replace_embeddings(self, owner_id: str, document_id: str, vectors: dict[str, list[float]], embed_key: str) -> None:
        with self._lock:
            self._db.executemany(
                "UPDATE chunks SET embedding = ? WHERE owner_id = ? AND chunk_id = ?",
                [(np.asarray(v, dtype=np.float32).tobytes(), owner_id, chunk_id) for chunk_id, v in vectors.items()],
            )
            self._db.execute(
                "UPDATE documents SET embed_key = ? WHERE owner_id = ? AND document_id = ?", (embed_key, owner_id, document_id)
            )
            self._db.commit()

    def has_document(self, owner_id: str, document_id: str) -> bool:
        with self._lock:
            row = self._db.execute(
                "SELECT 1 FROM documents WHERE owner_id = ? AND document_id = ?", (owner_id, document_id)
            ).fetchone()
        return row is not None

    def list_documents(self, owner_id: str) -> list[StoredDocument]:
        with self._lock:
            rows = self._db.execute(
                "SELECT document_id, filename, chunk_count, pack_id, uploaded_at FROM documents WHERE owner_id = ? ORDER BY uploaded_at DESC",
                (owner_id,),
            ).fetchall()
        return [StoredDocument(r[0], r[1], r[2], r[3], _iso(r[4])) for r in rows]

    def get_document(self, owner_id: str, document_id: str) -> StoredDocument | None:
        return next((d for d in self.list_documents(owner_id) if d.document_id == document_id), None)

    def delete_document(self, owner_id: str, document_id: str) -> bool:
        with self._lock:
            cur = self._db.execute("DELETE FROM documents WHERE owner_id = ? AND document_id = ?", (owner_id, document_id))
            self._db.execute("DELETE FROM chunks WHERE owner_id = ? AND document_id = ?", (owner_id, document_id))
            self._db.commit()
        return cur.rowcount > 0

    def chunks_for(self, owner_id: str, document_ids: list[str]) -> list[Chunk]:
        if not document_ids:
            return []
        marks = ",".join("?" * len(document_ids))
        with self._lock:
            rows = self._db.execute(
                f"SELECT chunk_id, document_id, idx, text, page FROM chunks WHERE owner_id = ? AND document_id IN ({marks}) ORDER BY document_id, idx",
                (owner_id, *document_ids),
            ).fetchall()
        return [Chunk(r[0], r[1], r[2], r[3], r[4]) for r in rows]

    def get_chunks(self, owner_id: str, chunk_ids: list[str]) -> list[Chunk]:
        if not chunk_ids:
            return []
        marks = ",".join("?" * len(chunk_ids))
        with self._lock:
            rows = self._db.execute(
                f"SELECT chunk_id, document_id, idx, text, page FROM chunks WHERE owner_id = ? AND chunk_id IN ({marks})",
                (owner_id, *chunk_ids),
            ).fetchall()
        by_id = {r[0]: Chunk(r[0], r[1], r[2], r[3], r[4]) for r in rows}
        return [by_id[c] for c in chunk_ids if c in by_id]

    def search(self, owner_id: str, document_ids: list[str], query_embedding: list[float], k: int) -> list[ScoredChunk]:
        if not document_ids:
            return []
        marks = ",".join("?" * len(document_ids))
        with self._lock:
            rows = self._db.execute(
                f"SELECT chunk_id, document_id, idx, text, page, embedding FROM chunks WHERE owner_id = ? AND document_id IN ({marks}) ORDER BY document_id, idx",
                (owner_id, *document_ids),
            ).fetchall()
        if not rows:
            return []
        matrix = np.stack([np.frombuffer(r[5], dtype=np.float32) for r in rows])
        query = np.asarray(query_embedding, dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1) * (np.linalg.norm(query) or 1.0)
        sims = matrix @ query / np.where(norms == 0, 1.0, norms)
        # Stable sort so ties break by document and position, never randomly.
        order = np.argsort(-sims, kind="stable")[:k]
        return [ScoredChunk(Chunk(rows[i][0], rows[i][1], rows[i][2], rows[i][3], rows[i][4]), float(sims[i])) for i in order]
