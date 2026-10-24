from pathlib import Path

from engine.config import Settings
from engine.service import Engine
from engine.stability import cohen_kappa, pearson, run_stability

from .fakes import FakeEmbedder, FakeGenerator, FakeJudge
from .test_pipeline import POLICY


def test_pearson_and_kappa():
    assert pearson([0, 0.5, 1], [0, 0.5, 1]) == 1.0
    assert pearson([0, 0.5, 1], [1, 0.5, 0]) == -1.0
    assert pearson([1, 1, 1], [1, 1, 1]) == 1.0
    assert pearson([1, 1], [1, 1]) is None
    assert cohen_kappa(["A", "B"], ["A", "B"]) == 1.0


class _Chat:
    """Wraps the fake judge as a ChatModel-like object returning JSON text."""

    hosted = False

    def __init__(self, name):
        self.model, self.provider, self._judge = name, "fake", FakeJudge()

    def ready(self):
        return True, None

    def chat(self, messages, schema=None, num_predict=512, patient=True):
        import json

        from engine.llm import Generation

        system = messages[0]["content"].split("\nRespond with one JSON object")[0]
        return Generation(json.dumps(self._judge.ask(system, messages[1]["content"], schema)), self.model, 1)


def test_identical_judges_are_perfectly_stable(tmp_path: Path):
    q = "How many days paid leave per calendar year?"
    engine = Engine(Settings(data_dir=tmp_path, top_k=3), generator=FakeGenerator({q: "Employees get 20 days paid leave [1]."}),
                    embedder=FakeEmbedder(), judge=FakeJudge())
    doc = engine.ingest("u", "policy.md", POLICY)
    batch = engine.evaluate_batch("u", [doc["document_id"]], [
        {"test_id": "t1", "question": q, "ground_truth_answer": "20 days", "gold_chunk_ids": [doc["chunks"][0]["chunk_id"]]},
    ])
    out = run_stability(engine, "u", batch, (_Chat("a"), _Chat("b")), shuffles=2)
    assert out["n_cases"] == 1 and out["judge_swap"]["verdict_agreement"] == 1.0
    assert out["shuffle"]["max_delta"] == 0.0 and out["shuffle"]["stable"] is True and out["stable"] is True
