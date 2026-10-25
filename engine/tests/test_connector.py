import json
from pathlib import Path

import httpx
import pytest

from engine.config import Settings
from engine.connector import BotConfig, BotError, ExternalBot, check_url, covers, resolve_path
from engine.service import Engine

from .fakes import FakeEmbedder, FakeGenerator, FakeJudge
from .test_pipeline import POLICY

LEAVE = "Employees receive 20 days paid leave per calendar year."
SICK = "Sick leave is 10 days per year. A doctor's note is required after 3 consecutive days."


def mock_bot(answer_for, contexts_for=None):
    """An httpx client whose bot answers from `answer_for(question, contexts)` and returns `contexts_for(question)`."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        given = body.get("contexts")
        contexts = given if given is not None else (contexts_for(body["question"]) if contexts_for else [])
        return httpx.Response(200, json={"data": {"reply": answer_for(body["question"], given)},
                                         "sources": [{"text": c} for c in contexts]})

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


CONFIG = {"url": "https://bot.example.com/ask", "headers": {"Authorization": "Bearer secret"},
          "answer_path": "data.reply", "contexts_path": "sources[*].text"}


@pytest.fixture
def engine(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("RAGSEAL_ALLOW_PRIVATE_BOT_URLS", "1")  # the mock transport never resolves DNS
    return Engine(Settings(data_dir=tmp_path, top_k=2), generator=FakeGenerator(), embedder=FakeEmbedder(), judge=FakeJudge())


def test_resolve_path():
    data = {"a": {"b": [{"t": "x"}, {"t": "y"}]}, "s": "ok"}
    assert resolve_path(data, "s") == "ok"
    assert resolve_path(data, "a.b[1].t") == "y"
    assert resolve_path(data, "a.b[*].t") == ["x", "y"]
    with pytest.raises(BotError, match="no 'missing'"):
        resolve_path(data, "a.missing")


def test_private_addresses_are_refused():
    for url in ("http://127.0.0.1:8000/x", "http://10.0.0.5/bot", "http://169.254.169.254/latest", "http://[::1]/x"):
        with pytest.raises(BotError, match="private or local"):
            check_url(url)
    check_url("http://93.184.216.34/ask")  # a public address
    check_url("http://127.0.0.1:8000/x", allow_private=True)
    with pytest.raises(BotError, match="http"):
        check_url("file:///etc/passwd")


def test_covers():
    assert covers("Policy text. " + LEAVE + " More.", LEAVE)
    assert not covers("Employees receive 25 days paid leave per calendar year.", LEAVE)  # numbers must match


def test_bot_answer_is_evaluated_with_its_own_contexts(engine):
    doc = engine.ingest("u", "policy.md", POLICY)
    gold = doc["chunks"][0]["chunk_id"]
    client, calls = mock_bot(lambda q, ctx: "Employees receive 20 days paid leave per year.", lambda q: [LEAVE + " Unused leave expires."])
    engine_bot = engine.external_bot(CONFIG, client=client)
    case = {"test_id": "t1", "question": "How many days paid leave per calendar year?", "ground_truth_answer": "20 days",
            "gold_chunk_ids": [gold], "context_snippet": LEAVE}
    from engine.evaluate import Evaluator
    from engine.service import _case_from_dict

    result = Evaluator(engine.store, engine.rag, engine.judge).evaluate("u", _case_from_dict(case), [doc["document_id"]], bot=engine_bot)
    assert result["answer_source"] == "external" and result["gold_retrieved"] is True
    assert result["root_cause"]["category"] == "CLEAN_PASS" and result["retrieved_chunks"][0]["is_gold"] is True
    assert result["bot"]["header_names"] == ["Authorization"] and "secret" not in json.dumps(result)
    assert calls == [{"question": "How many days paid leave per calendar year?"}]


def test_replay_is_unavailable_without_a_contexts_override(engine):
    doc = engine.ingest("u", "policy.md", POLICY)
    client, calls = mock_bot(lambda q, ctx: "Sick leave is 12 days.", lambda q: [SICK])
    from engine.evaluate import Evaluator
    from engine.service import _case_from_dict

    case = _case_from_dict({"question": "How many days paid leave per calendar year?", "ground_truth_answer": "20 days",
                            "gold_chunk_ids": [doc["chunks"][0]["chunk_id"]], "context_snippet": LEAVE})
    result = Evaluator(engine.store, engine.rag, engine.judge).evaluate("u", case, [doc["document_id"]], bot=engine.external_bot(CONFIG, client=client))
    assert result["gold_retrieved"] is False and result["replay"] is None and result["replay_status"] == "unavailable"
    assert result["root_cause"]["category"] == "UNRESOLVED" and "contexts override" in result["root_cause"]["summary"]
    assert len(calls) == 1  # no fake replay call


def test_replay_through_the_bot_proves_a_retrieval_failure(engine):
    doc = engine.ingest("u", "policy.md", POLICY)
    # The bot answers from the passages it is given: right with the gold passage, wrong with its own retrieval.
    client, calls = mock_bot(lambda q, ctx: "Employees receive 20 days paid leave per year." if ctx else "Sick leave is 12 days.",
                             lambda q: [SICK])
    from engine.evaluate import Evaluator
    from engine.service import _case_from_dict

    case = _case_from_dict({"question": "How many days paid leave per calendar year?", "ground_truth_answer": "20 days",
                            "gold_chunk_ids": [doc["chunks"][0]["chunk_id"]], "context_snippet": LEAVE})
    bot = engine.external_bot(CONFIG | {"accepts_contexts": True}, client=client)
    result = Evaluator(engine.store, engine.rag, engine.judge).evaluate("u", case, [doc["document_id"]], bot=bot)
    assert result["replay_status"] == "ran" and result["replay"]["answer_accuracy"] == 1.0
    assert result["root_cause"]["category"] == "RETRIEVAL_FAILURE"
    assert calls[1]["contexts"] == [doc["chunks"][0]["text"]]  # replay sent only the gold passage


def test_batch_with_bot_and_its_concurrency_cap(engine):
    doc = engine.ingest("u", "policy.md", POLICY)
    client, calls = mock_bot(lambda q, ctx: "Employees receive 20 days paid leave per year.", lambda q: [LEAVE])
    original = engine.external_bot
    engine.external_bot = lambda config, client_=None: original(config, client=client)
    batch = engine.evaluate_batch("u", [doc["document_id"]], [
        {"test_id": f"t{i}", "question": "How many days paid leave per calendar year?", "ground_truth_answer": "20 days",
         "gold_chunk_ids": [doc["chunks"][0]["chunk_id"]], "context_snippet": LEAVE} for i in range(3)
    ], bot=CONFIG, concurrency=6)
    assert batch["answer_source"] == "external" and batch["timing"]["concurrency"] == 2  # capped by max_concurrency
    assert batch["root_cause_breakdown"]["CLEAN_PASS"] == 3 and len(calls) == 3
    assert "secret" not in json.dumps(batch)


def test_test_bot_round_trip_and_override_check(engine):
    client, _ = mock_bot(lambda q, ctx: ("It is called Elara." if ctx else "I can answer questions about the handbook."),
                         lambda q: ["Handbook section 1", "Handbook section 2"])
    out = engine.test_bot(CONFIG | {"accepts_contexts": True}, client=client)
    assert out["ok"] and out["n_contexts"] == 2 and out["contexts_override"]["works"] is True and out["replay"] == "available"
    assert isinstance(out["latency_ms"], int) and out["errors"] == []
    liar, _ = mock_bot(lambda q, ctx: "I can answer questions about the handbook.", lambda q: ["Handbook"])
    bad = engine.test_bot(CONFIG | {"accepts_contexts": True}, client=liar)
    assert bad["contexts_override"]["works"] is False and bad["replay"] == "unavailable" and bad["errors"]
    broken = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    failed = engine.test_bot(CONFIG, client=broken)
    assert failed["ok"] is False and "HTTP 500" in failed["errors"][0]
    with pytest.raises(ValueError, match="unknown bot settings"):
        engine.test_bot(CONFIG | {"verify": False})
