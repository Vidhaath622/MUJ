"""Industry test packs.

A pack is a folder with a pack.json manifest and its documents:

    <packs_dir>/banking/
        pack.json
        fee_schedule_v1.md
        fee_schedule_v2.md
        labels.json          (optional, hand labels; see engine/agreement.py)

pack.json:
    {
      "pack_id": "banking",
      "name": "Banking",
      "description": "...",
      "demo_data": true,
      "documents": [{"file": "fee_schedule_v2.md"}, {"file": "fee_schedule_v1.md", "superseded_by": "fee_schedule_v2.md"}],
      "risk_rules": ["Never quote a superseded fee as current."],
      "test_cases": [
        {"test_id": "bank_01", "question": "...", "ground_truth_answer": "...",
         "type": "factoid" | "stale" | "unanswerable" | "distractor",
         "gold":  [{"file": "fee_schedule_v2.md", "quote": "exact sentence from the document"}],
         "stale": [{"file": "fee_schedule_v1.md", "quote": "the outdated sentence"}]}
      ]
    }

Gold and stale chunks are given as quotes, not chunk IDs, so packs survive
changes to the chunker. The loader resolves each quote to the chunk that
contains it and fails loudly if a quote is not found.

Packs are read from docs/packs first (teammates' content), then
engine/packs_builtin (fallback demo packs). The first folder with a given
pack_id wins.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .ingest import ParsedDocument

PACK_IDS = ("recruitment", "banking", "healthcare")


class PackError(ValueError):
    pass


@dataclass
class PackSpec:
    pack_id: str
    name: str
    description: str
    path: Path
    manifest: dict

    @property
    def documents(self) -> list[dict]:
        return self.manifest.get("documents", [])

    @property
    def test_cases(self) -> list[dict]:
        return self.manifest.get("test_cases", [])

    def summary(self) -> dict:
        return {
            "pack_id": self.pack_id,
            "name": self.name,
            "description": self.description,
            "document_count": len(self.documents),
            "test_case_count": len(self.test_cases),
            "demo_data": bool(self.manifest.get("demo_data", True)),
            "risk_rules": self.manifest.get("risk_rules", []),
            "source": "team" if "docs" in self.path.parts else "builtin",
        }


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def discover(dirs: tuple[Path, ...]) -> dict[str, PackSpec]:
    packs: dict[str, PackSpec] = {}
    for root in dirs:
        if not root.is_dir():
            continue
        for manifest_path in sorted(root.glob("*/pack.json")):
            try:
                manifest = json.loads(manifest_path.read_text())
            except json.JSONDecodeError as exc:
                raise PackError(f"{manifest_path}: invalid JSON ({exc})") from exc
            pack_id = manifest.get("pack_id") or manifest_path.parent.name
            if pack_id in packs:
                continue
            packs[pack_id] = PackSpec(
                pack_id=pack_id,
                name=manifest.get("name", pack_id.title()),
                description=manifest.get("description", ""),
                path=manifest_path.parent,
                manifest=manifest,
            )
    return packs


def read_document_bytes(spec: PackSpec, entry: dict) -> tuple[str, bytes]:
    path = spec.path / entry["file"]
    if not path.exists():
        raise PackError(f"pack '{spec.pack_id}': document {entry['file']} is missing")
    return entry["file"], path.read_bytes()


def resolve_quote(docs_by_file: dict[str, ParsedDocument], ref: dict, pack_id: str, test_id: str) -> str:
    doc = docs_by_file.get(ref.get("file", ""))
    if doc is None:
        raise PackError(f"pack '{pack_id}' case {test_id}: unknown file {ref.get('file')!r}")
    quote = _norm(ref.get("quote", ""))
    if not quote:
        raise PackError(f"pack '{pack_id}' case {test_id}: empty quote")
    for chunk in doc.chunks:
        if quote in _norm(chunk.text):
            return chunk.chunk_id
    raise PackError(f"pack '{pack_id}' case {test_id}: quote not found in {doc.filename}: {ref.get('quote')[:80]!r}")


def resolve_test_cases(spec: PackSpec, docs_by_file: dict[str, ParsedDocument]) -> list[dict]:
    cases = []
    for raw in spec.test_cases:
        test_id = raw["test_id"]
        case_type = raw.get("type", "factoid")
        gold = [resolve_quote(docs_by_file, ref, spec.pack_id, test_id) for ref in raw.get("gold", [])]
        stale = [resolve_quote(docs_by_file, ref, spec.pack_id, test_id) for ref in raw.get("stale", [])]
        if case_type != "unanswerable" and not gold:
            raise PackError(f"pack '{spec.pack_id}' case {test_id}: answerable cases need at least one gold quote")
        cases.append(
            {
                "test_id": test_id,
                "question": raw["question"],
                "ground_truth_answer": raw.get("ground_truth_answer", "") if case_type != "unanswerable" else "",
                "source_chunk_id": gold[0] if gold else None,
                "gold_chunk_ids": gold,
                "stale_chunk_ids": stale,
                "context_snippet": raw["gold"][0]["quote"] if raw.get("gold") else "",
                "type": case_type,
                "note": raw.get("note", ""),
            }
        )
    return cases
