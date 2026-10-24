from pathlib import Path

from engine.config import Settings
from engine.impact import diff, quotes_old_value
from engine.ingest import parse_document
from engine.service import Engine

from .fakes import FakeEmbedder, FakeGenerator, FakeJudge

OLD = b"""# Fee schedule v1

The overdraft fee is $35 per item when the bank pays an overdraft.

The monthly maintenance fee is waived with a balance of $1,500.

Wire transfers are processed on business days only.
"""
NEW = b"""# Fee schedule v2

The overdraft fee is $25 per item when the bank pays an overdraft.

The monthly maintenance fee is waived with a balance of $1,500.

Stop payment requests cost $30 each.
"""

Q = "How much is the overdraft fee per item?"


class ImpactJudge(FakeJudge):
    def ask(self, system, user, schema):
        if system.startswith("A document was updated"):
            return {"question": Q, "answer": "$25 per item"}
        return super().ask(system, user, schema)


def test_diff_finds_changed_added_removed_and_numbers():
    changes, unchanged = diff(parse_document("v1.md", OLD, 700).chunks, parse_document("v2.md", NEW, 700).chunks)
    kinds = sorted(c["kind"] for c in changes)
    assert unchanged == 1 and kinds == ["added", "changed", "removed"]
    changed = next(c for c in changes if c["kind"] == "changed")
    assert changed["numbers_changed"] == [{"old": "35", "new": "25"}]
    assert quotes_old_value("It is $35.", changed) and not quotes_old_value("It is $25, was $35.", changed)


def test_impact_flags_answers_that_still_use_the_old_fact(tmp_path: Path):
    # The generator follows whichever version comes first in its context, like a real model might.
    def answer(context):
        return "The overdraft fee is $35 per item [1]." if context.find("$35") < max(context.find("$25"), 0) or "$25" not in context else "The overdraft fee is $25 per item [1]."

    engine = Engine(Settings(data_dir=tmp_path, top_k=2), generator=FakeGenerator({Q: answer}), embedder=FakeEmbedder(), judge=ImpactJudge())
    old = engine.ingest("u", "fees_v1.md", OLD)["document_id"]
    new = engine.ingest("u", "fees_v2.md", NEW)["document_id"]
    out = engine.impact("u", old, new, max_tests=5)
    assert out["summary"] == {"unchanged": 1, "changed": 1, "added": 1, "removed": 1, "tests": 1, "at_risk": out["at_risk"]}
    test = out["tests"][0]
    assert test["question"] == Q and "$25" in test["gold"] and "$35" in test["old_fact"]
    assert test["at_risk"] == (test["quotes_old_value"] or test["failure_type"] == "STALE_SOURCE" or (test["verdict"] != "CLEAN_PASS" and test["stale_retrieved"]))
    assert next(c for c in out["changes"] if c["kind"] == "changed")["tested"] is True
