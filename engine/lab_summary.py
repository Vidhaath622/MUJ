"""Reading a chunking-lab table: the best setup, the one worth using, and when the pack is too small to tell.

"Best" is the highest recall, then the highest MRR, then the cheaper setup. "Recommended" is the
cheapest setup that is as good as the best within a point of recall and 0.02 of MRR: reranking
costs one grading call per question, so it only wins when it clearly finds more.
"""

from __future__ import annotations

RECALL_SLACK = 0.01
MRR_SLACK = 0.02


def setup_name(row: dict) -> str:
    """Plain words for a row, as the UI shows it: "Hybrid · 1200 chars · rerank"."""
    parts = ["Hybrid" if row["mode"] == "hybrid" else "Meaning search", f"{row['chunk_chars']} chars"]
    if row.get("overlap"):
        parts.append(f"{row['overlap']} overlap")
    if row["rerank"]:
        parts.append("rerank")
    return " · ".join(parts)


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def summarize(rows: list[dict], recall_key: str, k: int, pack_id: str, suggested_pack: str | None = None) -> dict:
    """best, recommended, recommendation_reason, today and warnings for a finished lab table."""
    best = max(rows, key=lambda r: (r[recall_key], r["mrr"], -r["rerank_calls"], -r["ms_per_question"]))
    close = [r for r in rows if r[recall_key] >= best[recall_key] - RECALL_SLACK and r["mrr"] >= best["mrr"] - MRR_SLACK]
    recommended = min(close, key=lambda r: (r["rerank_calls"], -r[recall_key], -r["mrr"], r["ms_per_question"]))
    today = next((r for r in rows if r.get("is_today")), None)

    # notes: the why, without restating the pick or today's delta (the UI headline shows both);
    # recommendation_reason: the whole story in one paragraph, for the API and logs.
    notes = []
    if len(rows) > 1 and all(r[recall_key] == best[recall_key] for r in rows):
        notes.append(f"All {len(rows)} setups find {_pct(best[recall_key])} of the right passages.")
    if recommended is best:
        why = "It finds the most right passages and ranks them highest"
        if best["rerank_calls"]:
            why += f", at the cost of {best['rerank_calls']} grading calls"
        notes.append(why + ".")
        free = [r for r in rows if not r["rerank_calls"]]
        if best["rerank_calls"] and free:
            alt = max(free, key=lambda r: (r[recall_key], r["mrr"], -r["ms_per_question"]))
            same = "the same" if alt[recall_key] == best[recall_key] else _pct(alt[recall_key]) + " of the"
            notes.append(
                f"Without reranking, {setup_name(alt)} finds {same} right passages with no grading calls "
                f"(MRR {alt['mrr']:.3f} vs {best['mrr']:.3f})."
            )
    else:
        same = "The same result" if recommended[recall_key] == best[recall_key] else "Nearly the same result"
        cost = "with no grading calls" if not recommended["rerank_calls"] else "in less time per question"
        notes.append(f"{same} as the best setup, {cost}.")
        if best["rerank"] and not recommended["rerank"]:
            notes.append(
                f"Reranking puts the right passage first more often (MRR {best['mrr']:.3f} vs {recommended['mrr']:.3f}) "
                f"but costs {best['rerank_calls']} grading calls."
            )
    sentences = [f"Recommended: {setup_name(recommended)}."] + notes
    if today is not None and today is not recommended:
        gain = (recommended[recall_key] - today[recall_key]) * 100
        if abs(gain) >= 0.05:
            sentences.append(f"Today's setup ({setup_name(today)}) finds {_pct(today[recall_key])}: {gain:+.1f} pts.")
        else:
            sentences.append(f"Today's setup ({setup_name(today)}) finds the same share of right passages.")

    warnings = []
    small = sorted({(r["chunk_chars"], r["chunks"]) for r in rows if r["chunks"] <= 2 * k})
    if small:
        if len(small) == len({r["chunk_chars"] for r in rows}):
            # Every size is small: the pack itself is tiny, whatever it is cut into.
            where = f"This pack has only {max(c for _, c in small)} chunks even at {small[0][0]} chars"
        else:
            where = f"Only {small[-1][1]} chunks at {small[-1][0]} chars"
        warnings.append(
            f"{where}: picking the top {k} returns most of the pack whatever the setup, so it is too small to compare setups."
        )
    if all(r[recall_key] >= 1.0 for r in rows):
        warnings.append(
            "Every setup finds every right passage, so recall cannot separate them: compare MRR, how high the right "
            "passage ranks, instead."
        )
    return {
        "best": best,
        "recommended": recommended,
        "recommendation_reason": " ".join(sentences),
        "recommendation_notes": notes,
        "today": today,
        "warnings": warnings,
        "suggested_pack": suggested_pack if warnings and suggested_pack and suggested_pack != pack_id else None,
    }
