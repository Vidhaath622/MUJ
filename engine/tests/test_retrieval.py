from pathlib import Path

import pytest

from engine.config import Settings
from engine.ingest import Chunk, chunk_pages
from engine.retrieval import BM25, RetrievalConfig, rerank, rrf, tokenize
from engine.service import Engine

from .fakes import FakeEmbedder, FakeGenerator, FakeJudge


def test_bm25_and_rrf():
    assert tokenize("Up to ₹1,275,000 (FY 2025-26)") == ["up", "to", "1275000", "fy", "2025", "26"]
    texts = ["The standard deduction is $32,200 for joint filers.", "Mileage is 72.5 cents per mile.", "Notice 2024-80 has the details."]
    scores = BM25(texts).scores("Which notice: 2024-80?")
    assert max(range(3), key=scores.__getitem__) == 2 and scores[1] == 0
    assert [i for i, _ in rrf([["a", "b", "c"], ["c", "a"]])] == ["a", "c", "b"]
    with pytest.raises(ValueError):
        RetrievalConfig(mode="sparse")


def test_rerank_order_and_fallback():
    chunks = [Chunk(f"c{i}", "d", i, f"text {i}", None) for i in range(5)]

    class Ranker:
        def ask(self, system, user, schema):
            return {"ranked": [3, 3, 9, 1]}  # a duplicate and an out-of-range number are ignored

    class Broken:
        def ask(self, system, user, schema):
            raise RuntimeError("judge down")

    assert rerank(Ranker(), "q", chunks, 4) == [2, 0, 1, 3]  # model's picks first, then original order
    assert rerank(Broken(), "q", chunks, 4) == [0, 1, 2, 3]  # never fewer chunks, never an error


def test_overlap_repeats_the_end_of_the_previous_chunk():
    pages = [(None, "\n\n".join(f"Paragraph {i} says the fee is {i * 10} rupees per visit." for i in range(12)))]
    plain = chunk_pages(pages, 200)
    assert chunk_pages(pages, 200, 0) == plain
    overlapped = chunk_pages(pages, 200, 60)
    assert len(overlapped) == len(plain) and overlapped[0] == plain[0]
    for (_, before), (_, after) in zip(plain, overlapped[1:]):
        assert after.split("\n\n")[0] in before  # starts with the previous chunk's end


@pytest.fixture
def engine(tmp_path: Path):
    return Engine(Settings(data_dir=tmp_path, top_k=2), generator=FakeGenerator(), embedder=FakeEmbedder(), judge=FakeJudge())


def test_hybrid_and_rerank_retrieve_k_chunks(engine):
    doc = engine.ingest("u", "fees.md", "\n\n".join(
        [f"Section {i}. General terms about accounts, statements, branches, online banking, cards and customer service, "
         f"as described in paragraph {i} of the account handbook for retail customers." for i in range(8)]
        + ["Wire transfer fee: Notice 2024-80 sets it at 35 dollars."]).encode())
    hybrid = engine.rag.retrieve("u", "What does Notice 2024-80 set?", [doc["document_id"]], 2, RetrievalConfig(mode="hybrid"))
    assert len(hybrid) == 2 and "2024-80" in hybrid[0].chunk.text
    reranked = engine.rag.retrieve("u", "What does Notice 2024-80 set?", [doc["document_id"]], 2, RetrievalConfig(mode="hybrid", rerank=True))
    assert len(reranked) == 2  # FakeJudge cannot rerank: falls back to the hybrid order


def test_chunking_lab_scores_every_config_without_touching_user_data(engine):
    out = engine.chunking_lab("u", "ragseal", chunk_sizes=(300, 700), modes=("dense", "hybrid"), rerank_options=(False,), k=4)
    assert out["metric"] == "context_recall_at_4" and len(out["rows"]) == 4
    assert {(r["chunk_chars"], r["mode"]) for r in out["rows"]} == {(300, "dense"), (300, "hybrid"), (700, "dense"), (700, "hybrid")}
    assert all(0 <= r["context_recall_at_4"] <= 1 and r["chunks"] > 0 for r in out["rows"])
    assert out["best"] in out["rows"] and out["questions"] > 0
    assert engine.list_documents("u") == []  # lab chunks live under their own owner


def test_chunking_lab_always_scores_todays_setup(engine):
    out = engine.chunking_lab("u", "ragseal", chunk_sizes=(300,), modes=("hybrid",), rerank_options=(False,), k=4)
    today = [r for r in out["rows"] if r["is_today"]]
    assert len(out["rows"]) == 2 and len(today) == 1  # 700 dense was not asked for, so it is added
    assert (today[0]["chunk_chars"], today[0]["mode"], today[0]["rerank"]) == (700, "dense", False)
    assert out["today"] == today[0] and out["recommended"] in out["rows"] and out["recommendation_reason"]
    joined = engine.chunking_lab("u", "ragseal", chunk_sizes=(700,), modes=("dense",), rerank_options=(False,), k=4)
    assert len(joined["rows"]) == 1 and joined["rows"][0]["is_today"]  # already in the grid: not added twice


def _row(size, mode, rerank, recall, mrr, chunks=40, ms=10, today=False):
    return {"chunk_chars": size, "overlap": 0, "mode": mode, "rerank": rerank, "context_recall_at_4": recall, "mrr": mrr,
            "chunks": chunks, "ms_per_question": ms, "rerank_calls": 26 if rerank else 0, "is_today": today}


def test_lab_summary_recommends_the_cheapest_setup_that_is_as_good():
    from engine.lab_summary import summarize

    rows = [_row(2000, "dense", True, 1.0, 1.0, chunks=5, ms=947), _row(2000, "hybrid", True, 1.0, 1.0, chunks=5, ms=304),
            _row(2000, "hybrid", False, 1.0, 0.942, chunks=5), _row(2000, "dense", False, 1.0, 0.936, chunks=5),
            _row(700, "dense", False, 1.0, 0.9, chunks=9, today=True)]
    out = summarize(rows, "context_recall_at_4", 4, "travel_jaipur_goa", "synthetic_public")
    assert out["best"]["rerank"] and out["best"]["ms_per_question"] == 304  # ties on quality go to the cheaper one
    # Rerank ranks clearly higher (MRR 1.000 vs 0.942, past the 0.02 slack), so it stays recommended, and the
    # reason names the free alternative and what it gives up.
    assert out["recommended"] is out["best"]
    assert out["recommendation_reason"].startswith("Recommended: Hybrid · 2000 chars · rerank. All 5 setups find 100.0%")
    assert out["recommendation_notes"][0].startswith("All 5 setups find 100.0%")
    assert "Without reranking, Hybrid · 2000 chars finds the same right passages with no grading calls (MRR 0.942 vs 1.000)" in out["recommendation_reason"]
    near = [dict(r, mrr=0.99) if r["mode"] == "hybrid" and not r["rerank"] else r for r in rows]
    cheap = summarize(near, "context_recall_at_4", 4, "travel_jaipur_goa", "synthetic_public")
    assert cheap["recommended"]["mode"] == "hybrid" and not cheap["recommended"]["rerank"]  # within slack: no calls wins
    assert "Reranking puts the right passage first more often (MRR 1.000 vs 0.990) but costs 26 grading calls." in cheap["recommendation_reason"]
    assert len(out["warnings"]) == 2 and "Only 5 chunks at 2000 chars" in out["warnings"][0]  # 700 still has 9
    tiny = summarize([dict(r, chunks=5) for r in rows], "context_recall_at_4", 4, "travel_jaipur_goa", "synthetic_public")
    assert tiny["warnings"][0].startswith("This pack has only 5 chunks even at 700 chars")
    assert out["suggested_pack"] == "synthetic_public"


def test_lab_summary_keeps_rerank_when_it_clearly_finds_more():
    from engine.lab_summary import summarize

    rows = [_row(700, "dense", False, 0.93, 0.748, today=True), _row(1200, "hybrid", False, 0.984, 0.775),
            _row(1200, "hybrid", True, 1.0, 0.891, ms=5000)]
    out = summarize(rows, "context_recall_at_4", 4, "synthetic_public", "synthetic_public")
    assert out["recommended"] is out["best"] and out["best"]["rerank"]
    assert "+7.0 pts" in out["recommendation_reason"] and out["warnings"] == [] and out["suggested_pack"] is None
