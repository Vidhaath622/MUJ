"""The judge pool paces each API key to its per-minute budget instead of running into 429s."""

import time

import httpx
import pytest

from engine.config import Settings
from engine.llm import ChatModel, Judge, RateState

from .groq_sim import GroqSim

SYSTEM = "You evaluate one answer"
SCHEMA = {"type": "object", "properties": {"accuracy": {"type": "object"}}, "required": ["accuracy"]}


def _user(n: int) -> str:
    return f"QUESTION: How many days of leave, case {n}?\n\nGROUND TRUTH: 20 days\n\nANSWER: 20 days."


def test_rate_state_budget_math():
    state = RateState(tokens_limit=6000, tokens_left=0, at=time.monotonic(), requests_left=10)
    assert state.free_in(1000) == pytest.approx(10.0, abs=0.1)  # 6000/min refills 1000 tokens in 10 s
    assert state.free_in(1000, reserved_tokens=500) == pytest.approx(15.0, abs=0.1)  # calls already sent count
    assert RateState(6000, 6000, time.monotonic()).free_in(9000) == pytest.approx(0.0, abs=0.01)  # never forever
    out_today = RateState(6000, 6000, time.monotonic(), requests_left=1, requests_reset_s=3600)
    assert out_today.free_in(100) == 0.0 and out_today.free_in(100, reserved_requests=1) == pytest.approx(3600, abs=1)
    headers = httpx.Headers({"x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "123",
                             "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "1m30s"})
    parsed = RateState.from_headers(headers)
    assert parsed.tokens_left == 123 and parsed.requests_left == 0 and parsed.requests_reset_s == 90
    assert RateState.from_headers(httpx.Headers({})) is None


def _pool(tmp_path, sim: GroqSim, keys: int) -> tuple[Judge, list[ChatModel]]:
    settings = Settings(data_dir=tmp_path)
    models = [ChatModel(sim.client(f"key{i}", settings), "openai/gpt-oss-120b") for i in range(1, keys + 1)]
    return Judge(models[0], tmp_path / "cache.sqlite", replicas=tuple(models[1:])), models


def test_calls_go_to_the_key_with_budget_left(tmp_path):
    sim = GroqSim(keys=2, latency_s=0.01)
    judge, (first, second) = _pool(tmp_path, sim, 2)
    first.client.rate[first.model] = RateState(8000, 0, time.monotonic())  # key 1 just spent its minute
    judge.ask(SYSTEM, _user(1), SCHEMA)
    assert sim.stats == {"ok": 1, "429": 0, "tokens": sim.stats["tokens"]}
    assert second.client.rate[second.model].tokens_left < 8000 and first.client.rate[first.model].tokens_left == 0


def test_an_exhausted_pool_waits_for_the_refill_instead_of_a_429(tmp_path):
    sim = GroqSim(keys=1, tpm=600_000, latency_s=0.01)  # refills 10,000 tokens a second
    judge, (only,) = _pool(tmp_path, sim, 1)
    only.client.rate[only.model] = RateState(600_000, 0, time.monotonic())
    started = time.monotonic()
    judge.ask(SYSTEM, _user(2), SCHEMA)
    assert time.monotonic() - started >= 0.03  # waited for about one call's worth of tokens
    assert sim.stats["429"] == 0 and sim.stats["ok"] == 1


def test_a_batch_on_tight_keys_stays_inside_the_limits(tmp_path):
    # Two keys with room for one call each up front (calls here cost ~375 tokens; 60K/min refills
    # 1,000 a second): twelve calls must be spread over the refill instead of running into 429s.
    sim = GroqSim(keys=2, tpm=60_000, rpm=600, latency_s=0.05)
    judge, _ = _pool(tmp_path, sim, 2)
    from concurrent.futures import ThreadPoolExecutor

    for key in sim.limits.values():
        key[0].level = 500
    started = time.monotonic()
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(lambda n: judge.ask(SYSTEM, _user(n), SCHEMA), range(12)))
    assert sim.stats["ok"] == 12 and time.monotonic() - started > 1.0  # the limit really bound
    assert sim.stats["429"] <= 2  # only the first burst, before any key's headers are known


def test_waiting_batch_calls_take_turns_in_arrival_order(tmp_path):
    # One key refilling about one call's worth every 60 ms; eight calls arrive 10 ms apart.
    # Without turns, whichever thread wakes first takes the budget and a call can starve.
    sim = GroqSim(keys=1, tpm=400_000, rpm=100_000, latency_s=0.005)
    judge, _ = _pool(tmp_path, sim, 1)
    next(iter(sim.limits.values()))[0].level = 450
    admitted, original = [], sim.handle

    def handle(request):
        response = original(request)
        if response.status_code == 200:
            admitted.append(int(request.content.decode().split("case ", 1)[1].split("?", 1)[0]))
        return response

    sim.handle = handle
    judge.chat_model.client._http._transport = httpx.MockTransport(handle)
    from concurrent.futures import ThreadPoolExecutor

    def ask(n):
        time.sleep(n * 0.01)
        judge.ask(SYSTEM, _user(n), SCHEMA)

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(ask, range(8)))
    assert admitted == list(range(8)) and sim.stats["429"] == 0
