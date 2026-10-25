"""A simulated Groq: per-key token and request limits, latency, and real-looking 429s.

The real OpenAICompatClient and Judge run against it (through httpx.MockTransport), so batch
throughput can be measured without spending API quota:

    python -m engine.tests.groq_sim --cases 200 --keys 4

Limits default to Groq's free tier for openai/gpt-oss-120b (8K tokens and 30 requests per
minute per key). Judge answers come from FakeJudge's keyword rules; the generator stands in for
local Ollama (a fixed latency, a limited number of requests in parallel).
"""

from __future__ import annotations

import argparse
import json
import random
import re
import tempfile
import threading
import time
from pathlib import Path

import httpx

from engine.config import Settings
from engine.llm import ChatModel, Generation, Judge, OpenAICompatClient

from .fakes import FakeEmbedder, FakeJudge


class Bucket:
    """Groq-style limit: `per_minute` units refill continuously; a request needs its full cost available."""

    def __init__(self, per_minute: float):
        self.per_minute = per_minute
        self.level = per_minute
        self.stamp = time.monotonic()

    def _refill(self) -> None:
        now = time.monotonic()
        self.level = min(self.per_minute, self.level + (now - self.stamp) * self.per_minute / 60)
        self.stamp = now

    def take(self, cost: float) -> float:
        """0 if taken, else seconds until `cost` is available."""
        self._refill()
        if self.level >= cost:
            self.level -= cost
            return 0.0
        return (cost - self.level) * 60 / self.per_minute

    def reset_s(self) -> float:
        self._refill()
        return (self.per_minute - self.level) * 60 / self.per_minute


class GroqSim:
    def __init__(self, keys: int, tpm: int = 8000, rpm: int = 30, rpd: int = 1000, latency_s: float = 1.2, completion_tokens: int = 350, seed: int = 7):
        self.limits = {f"key{i}": (Bucket(tpm), Bucket(rpm)) for i in range(1, keys + 1)}
        self.rpd = rpd
        self.used_today = {key: 0 for key in self.limits}
        self.latency_s = latency_s
        self.completion_tokens = completion_tokens
        self.rules = FakeJudge()
        self.lock = threading.Lock()
        self.random = random.Random(seed)
        self.stats = {"ok": 0, "429": 0, "tokens": 0}

    def client(self, key: str, settings: Settings) -> OpenAICompatClient:
        client = OpenAICompatClient("groq", "https://sim.groq/openai/v1", key, settings, json_mode=True)
        client._http = httpx.Client(base_url="https://sim.groq/openai/v1", transport=httpx.MockTransport(self.handle))
        return client

    def handle(self, request: httpx.Request) -> httpx.Response:
        key = request.headers["authorization"].removeprefix("Bearer ")
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "openai/gpt-oss-120b"}]})
        body = json.loads(request.content)
        system, user = body["messages"][0]["content"], body["messages"][1]["content"]
        prompt_tokens = (len(system) + len(user)) // 4
        cost = prompt_tokens + self.completion_tokens
        tokens, requests = self.limits[key]
        with self.lock:
            wait_tokens = tokens.take(cost)
            wait_requests = 0.0 if wait_tokens else requests.take(1)  # the per-minute request limit: not in the headers
            if wait_requests:
                tokens.level += cost  # refused on requests: give the tokens back
            if not (wait_tokens or wait_requests):
                self.used_today[key] += 1
            # Like Groq: token headers are per minute, request headers per day.
            headers = {
                "x-ratelimit-limit-tokens": str(int(tokens.per_minute)),
                "x-ratelimit-remaining-tokens": str(max(0, int(tokens.level))),
                "x-ratelimit-reset-tokens": f"{tokens.reset_s():.2f}s",
                "x-ratelimit-limit-requests": str(self.rpd),
                "x-ratelimit-remaining-requests": str(max(0, self.rpd - self.used_today[key])),
                "x-ratelimit-reset-requests": "2h5m10s",
            }
            if wait_tokens or wait_requests:
                self.stats["429"] += 1
                wait = max(wait_tokens, wait_requests)
                kind = "tokens per minute (TPM)" if wait_tokens else "requests per minute (RPM)"
                return httpx.Response(
                    429,
                    headers={**headers, "retry-after": str(max(1, round(wait)))},
                    json={"error": {"message": f"Rate limit reached for model `openai/gpt-oss-120b` on {kind}: "
                                               f"Limit {int(tokens.per_minute)}, Requested {cost}. Please try again in {wait:.2f}s."}},
                )
            self.stats["ok"] += 1
            self.stats["tokens"] += cost
            jitter = self.random.uniform(0.7, 1.3)
        time.sleep(self.latency_s * jitter)
        schema = json.loads(system.split("matching this JSON schema: ", 1)[1])
        answer = self.rules.ask(system.split("\nRespond with one JSON object only", 1)[0], user, schema)
        return httpx.Response(
            200,
            headers=headers,
            json={"choices": [{"message": {"content": json.dumps(answer)}}],
                  "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": self.completion_tokens, "total_tokens": cost}},
        )


class SlowGenerator:
    """Local Ollama stand-in, `parallel` generations at a time. Like a decent RAG, it gives the ground
    truth when the passages contain its facts, else it paraphrases the first passage."""

    model = "sim-llama3.2:3b"
    provider = "ollama"
    hosted = False

    def __init__(self, answers: dict[str, str], latency_s: float = 1.0, parallel: int = 1):
        self.answers = answers
        self.latency_s = latency_s
        self._slots = threading.BoundedSemaphore(parallel)

    def ready(self):
        return True, None

    def chat(self, messages, schema=None, num_predict=512, patient=True) -> Generation:
        prompt = messages[-1]["content"]
        context, _, question = prompt.rpartition("Question:")
        truth = self.answers.get(question.replace("Answer:", "").strip())
        numbers = set(re.findall(r"\d+(?:\.\d+)?", truth or ""))
        passage = re.search(r"\[1\] (.+?)(?:\n|$)", context)
        if truth and numbers and numbers <= set(re.findall(r"\d+(?:\.\d+)?", context)):
            text = truth
        elif passage:
            text = re.split(r"(?<=[.!?])\s", passage.group(1))[0]
        else:
            text = "I don't know based on the provided documents."
        with self._slots:
            time.sleep(self.latency_s)
        return Generation(text=text, model=self.model, latency_ms=int(self.latency_s * 1000))


def run(cases: int, keys: int, workers: int | None, gen_latency: float, gen_parallel: int, tpm: int, completion: int = 350) -> dict:
    from engine.service import Engine

    sim = GroqSim(keys, tpm=tpm, completion_tokens=completion)
    tmp = Path(tempfile.mkdtemp(prefix="groq-sim-"))
    settings = Settings(data_dir=tmp)
    models = [ChatModel(sim.client(f"key{i}", settings), "openai/gpt-oss-120b") for i in range(1, keys + 1)]
    judge = Judge(models[0], tmp / "judge_cache.sqlite", replicas=tuple(models[1:]), max_wait_s=settings.judge_overflow_wait_s)
    generator = SlowGenerator({}, gen_latency, gen_parallel)
    engine = Engine(settings, generator=generator, embedder=FakeEmbedder(), judge=judge)
    document_ids, test_cases = [], []
    for pack in engine.list_packs():
        if pack["pack_id"] in ("banking", "recruitment", "healthcare", "realworld", "ragseal"):
            loaded = engine.load_pack("sim", pack["pack_id"])
            document_ids += loaded["document_ids"]
            test_cases += loaded["test_cases"]
    test_cases = test_cases[:cases]
    generator.answers = {c["question"]: c.get("ground_truth_answer") or "" for c in test_cases}
    batch = engine.evaluate_batch("sim", document_ids, test_cases, concurrency=workers)
    timing = batch["timing"]
    return {
        "cases": len(test_cases), "wall_s": round(timing["wall_ms"] / 1000, 1), "cases_per_min": timing["cases_per_min"],
        "workers": timing["concurrency"], "judge_calls": timing["judge_calls"], "client_429s": sim.stats["429"],
        "pool_rate_limited": timing["rate_limited_retries"], "failed": batch.get("failed_cases"),
        "avg_call_tokens": sim.stats["tokens"] // max(1, sim.stats["ok"]),
        "token_ceiling_calls_per_min": round(keys * tpm / max(1, sim.stats["tokens"] / max(1, sim.stats["ok"])), 1),
        "categories": batch["root_cause_breakdown"],
        **{k: timing[k] for k in ("generation_s_total", "judge_s_total", "judge_rate_wait_s", "judge_slot_wait_s",
                                  "tokens_per_judge_call", "judge_calls_by_key") if k in timing},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cases", type=int, default=200)
    parser.add_argument("--keys", type=int, default=4)
    parser.add_argument("--workers", type=int, default=None, help="batch concurrency (default: the engine's choice)")
    parser.add_argument("--gen-latency", type=float, default=1.0, help="seconds per local generation")
    parser.add_argument("--gen-parallel", type=int, default=1, help="generations Ollama runs at once")
    parser.add_argument("--tpm", type=int, default=8000)
    parser.add_argument("--completion", type=int, default=350, help="tokens per judge reply (gpt-oss reasoning counts)")
    args = parser.parse_args()
    print(json.dumps(run(args.cases, args.keys, args.workers, args.gen_latency, args.gen_parallel, args.tpm, args.completion), indent=1))


if __name__ == "__main__":
    main()
