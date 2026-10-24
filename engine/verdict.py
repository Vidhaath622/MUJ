"""Root-cause verdict table from docs/product_brief.md, as a pure function.

The evaluator gathers the facts (was the gold chunk retrieved, is the answer
faithful, is it correct, what did the replay with only the gold chunk do) and
this module turns them into one category with a summary and a recommendation.
Keeping it pure makes every branch unit-testable without a model.
"""

from __future__ import annotations

from dataclasses import dataclass

CATEGORIES = (
    "CLEAN_PASS",
    "RETRIEVAL_FAILURE",
    "GENERATION_HALLUCINATION",
    "COMPOUND_FAILURE",
    "NEEDS_REVIEW",
    "UNRESOLVED",
)


@dataclass
class Facts:
    has_ground_truth: bool
    unanswerable: bool
    abstained: bool
    gold_known: bool
    gold_retrieved: bool
    relevant_context: bool  # judge found at least one relevant retrieved chunk
    faithful: bool | None  # None when the judge could not score it
    correct: bool | None  # None when there is no ground truth
    stale_retrieved: bool = False
    replay_ran: bool = False
    replay_correct: bool | None = None
    replay_failed: bool = False


@dataclass
class Verdict:
    category: str
    summary: str
    recommended_action: str
    verdict_effect: str | None = None


def needs_replay(f: Facts) -> bool:
    """Replay only where the table needs it to separate retriever from generator."""
    if not (f.has_ground_truth and f.gold_known and not f.unanswerable):
        return False
    if f.faithful is None or f.correct is None:
        return False
    if f.gold_retrieved:
        if not f.faithful:
            return True
        return not f.correct and f.stale_retrieved
    return not f.correct


def decide(f: Facts) -> Verdict:
    if f.replay_failed:
        return Verdict(
            "UNRESOLVED",
            "The replay with the gold chunk could not be scored, so the cause is not proven.",
            "Re-run this case; check that the judge model is loaded.",
        )

    # Unanswerable questions: the only correct behaviour is to abstain.
    if f.unanswerable:
        if f.abstained:
            return Verdict("CLEAN_PASS", "The documents do not answer this question and the model correctly abstained.", "None.")
        return Verdict(
            "GENERATION_HALLUCINATION",
            "The documents do not answer this question, but the model answered anyway instead of abstaining.",
            "Strengthen the abstain instruction in the generator prompt or add a relevance gate before generation.",
        )

    if f.faithful is None:
        return Verdict(
            "UNRESOLVED",
            "The judge could not extract checkable claims from the answer, so faithfulness is unknown.",
            "Review this answer by hand.",
        )

    # No ground truth: heuristic verdict from the two judge scores, no replay possible.
    if not f.has_ground_truth:
        note = " (No ground truth given, so this is a heuristic verdict without replay.)"
        if f.relevant_context and f.faithful:
            return Verdict("CLEAN_PASS", "Relevant context was retrieved and every claim is supported by it." + note, "Add a ground truth to also check accuracy.")
        if f.relevant_context:
            return Verdict(
                "GENERATION_HALLUCINATION",
                "Relevant context was retrieved, but the answer makes claims the context does not support." + note,
                "Use a stricter extraction prompt or lower generator temperature.",
            )
        if f.abstained:
            return Verdict(
                "RETRIEVAL_FAILURE",
                "No relevant chunk was retrieved and the model abstained." + note,
                "Improve retrieval: check chunking, raise top-k, or add hybrid keyword search.",
            )
        if f.faithful:
            return Verdict(
                "RETRIEVAL_FAILURE",
                "No relevant chunk was retrieved; the answer only restates the off-topic context." + note,
                "Improve retrieval: check chunking, raise top-k, or add hybrid keyword search.",
            )
        return Verdict(
            "COMPOUND_FAILURE",
            "No relevant chunk was retrieved and the answer makes unsupported claims." + note,
            "Fix retrieval first, then tighten the generator prompt so it abstains.",
        )

    # Ground truth but no gold chunk: fall back to relevance as the retrieval signal.
    if not f.gold_known:
        note = " (No gold chunk is known, so no replay was run.)"
        if f.correct and f.faithful:
            return Verdict("CLEAN_PASS", "The answer is correct and supported by the retrieved context." + note, "None.")
        if f.correct:
            return Verdict(
                "NEEDS_REVIEW",
                "The answer is correct but not supported by the retrieved context; the model may be using its own memory." + note,
                "Check whether the documents cover this fact.",
            )
        if f.relevant_context and not f.faithful:
            return Verdict("GENERATION_HALLUCINATION", "Relevant context was retrieved, but the answer is wrong and unsupported." + note, "Use a stricter extraction prompt.")
        if f.relevant_context:
            return Verdict("NEEDS_REVIEW", "The answer is faithful to relevant context but does not match the ground truth." + note, "Check the ground-truth label.")
        if f.faithful:
            return Verdict("RETRIEVAL_FAILURE", "No relevant chunk was retrieved, so the model could not find the answer." + note, "Improve retrieval: check chunking, raise top-k, or add hybrid keyword search.")
        return Verdict("COMPOUND_FAILURE", "No relevant chunk was retrieved and the answer makes unsupported claims." + note, "Fix retrieval first, then tighten the generator prompt.")

    # Full table: ground truth and gold chunk known.
    if f.gold_retrieved:
        if f.faithful and f.correct:
            return Verdict("CLEAN_PASS", "The gold chunk was retrieved and the answer is correct and fully supported.", "None.")
        if f.faithful and not f.correct:
            if f.stale_retrieved:
                effect = None
                if f.replay_ran:
                    effect = (
                        "With only the current-version chunk the answer was correct, so the outdated chunk misled the generator."
                        if f.replay_correct
                        else "Even with only the current-version chunk the answer was still wrong."
                    )
                return Verdict(
                    "UNRESOLVED",
                    "Evidence conflicts: both the current and an outdated version of this fact were retrieved, and the answer follows the wrong one.",
                    "Filter superseded document versions out of the index or rank newer versions first.",
                    effect,
                )
            if f.abstained:
                return Verdict(
                    "NEEDS_REVIEW",
                    "The gold chunk was retrieved, but the model abstained instead of answering.",
                    "Check whether the gold chunk states the answer clearly; the generator prompt may be too cautious.",
                )
            return Verdict(
                "NEEDS_REVIEW",
                "The gold chunk was retrieved and the answer is faithful to the context, but it does not match the ground truth. The label may be wrong, or the model reasoned badly.",
                "Check the ground-truth label against the gold chunk.",
            )
        # Gold retrieved but the answer is not faithful: replay decides how strong the evidence is.
        if f.replay_ran and f.replay_correct:
            effect = "With only the gold chunk the answer was correct, so the extra retrieved chunks distracted the generator."
            action = "Retrieve fewer, better chunks (rerank or lower top-k) and use a stricter extraction prompt."
        elif f.replay_ran:
            effect = "Even with only the gold chunk the answer was still wrong, so the generator is at fault."
            action = "Use a stricter extraction prompt, lower temperature, or a stronger generator model."
        else:
            effect, action = None, "Use a stricter extraction prompt or a stronger generator model."
        return Verdict(
            "GENERATION_HALLUCINATION",
            "The gold chunk was retrieved, but the answer makes claims the context does not support.",
            action,
            effect,
        )

    # Gold chunk not retrieved.
    if f.correct:
        if f.faithful:
            return Verdict(
                "CLEAN_PASS",
                "The gold chunk was not retrieved, but another retrieved chunk carried the same fact and the answer is correct and supported.",
                "None.",
            )
        return Verdict(
            "NEEDS_REVIEW",
            "The answer is correct, but the gold chunk was not retrieved and the answer is not supported by what was; the model may be answering from memory.",
            "Improve retrieval so the answer is grounded.",
        )
    if f.replay_ran and f.replay_correct:
        return Verdict(
            "RETRIEVAL_FAILURE",
            "The retriever missed the gold chunk. Given only the gold chunk, the same generator answered correctly.",
            "Improve retrieval: check chunking, raise top-k, add hybrid keyword search or a reranker.",
            "Replay with the gold chunk fixed the answer, so the retriever is at fault.",
        )
    if f.replay_ran:
        return Verdict(
            "COMPOUND_FAILURE",
            "The retriever missed the gold chunk, and even with the gold chunk the generator still answered wrongly.",
            "Fix retrieval and the generator: improve chunk ranking and use a stricter prompt or stronger model.",
            "Replay with the gold chunk did not fix the answer, so the generator also fails.",
        )
    return Verdict(
        "UNRESOLVED",
        "The gold chunk was missed and the answer is wrong, but the replay did not run.",
        "Re-run this case.",
    )
