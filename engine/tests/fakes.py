"""Deterministic stand-ins for Ollama and the judge, so the pipeline runs in tests without models."""

from __future__ import annotations

import hashlib
import re

import numpy as np

from engine.llm import Generation

DIM = 64


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def bag_of_words(text: str) -> list[float]:
    vec = np.zeros(DIM, dtype=np.float32)
    for tok in _tokens(text):
        if tok in {"search", "query", "document", "the", "a", "of", "is", "what", "how", "many"}:
            continue
        vec[int(hashlib.md5(tok.encode()).hexdigest(), 16) % DIM] += 1.0
    return vec.tolist()


class FakeGenerator:
    """Returns scripted answers keyed by question; unknown questions get an abstention."""

    model = "fake-generator"
    provider = "fake"
    hosted = False

    def __init__(self, answers: dict | None = None):
        self.answers = answers or {}
        self.calls: list[tuple[str, str]] = []

    def ready(self):
        return True, None

    def chat(self, messages, schema=None, num_predict=512, patient=True) -> Generation:
        prompt = messages[-1]["content"]
        question = prompt.rsplit("Question:", 1)[-1].replace("Answer:", "").strip()
        context = prompt.split("Question:", 1)[0]
        self.calls.append((question, context))
        scripted = self.answers.get(question)
        if callable(scripted):
            text = scripted(context)
        elif scripted is not None:
            text = scripted
        else:
            text = "I don't know based on the provided documents."
        return Generation(text=text, model=self.model, latency_ms=1)


class FakeEmbedder:
    """Hashed bag-of-words vectors: deterministic and good enough to make retrieval testable."""

    model = "fake-embed"
    provider = "fake"
    hosted = False
    key = "fake:fake-embed"

    def ready(self):
        return True, None

    def embed(self, texts, kind="passage"):
        return [bag_of_words(t) for t in texts]


class FakeJudge:
    """Keyword-rule judge. Relevance: overlap with the question. Faithfulness: every sentence of the
    answer must have its key numbers in the context. Accuracy: numbers in the ground truth must appear in the answer."""

    mode = "local"
    model = "fake-judge"
    provider = "fake"

    def __init__(self):
        self.calls = 0
        self.cache_hits = 0
        self.chat_model = self

    def ready(self):
        return True, None

    def start_tracking(self):
        pass

    def used(self):
        return {"judge_model": self.model, "evaluation_mode": self.mode, "judge_models_used": [f"fake:{self.model}"], "judge_fallback_used": False}

    @staticmethod
    def _numbers(text: str) -> set[str]:
        return set(re.findall(r"\d+(?:\.\d+)?", text))

    def ask(self, system: str, user: str, schema: dict) -> dict:
        self.calls += 1
        if "You evaluate one answer" in system:
            return self._merged(user, schema)
        if "grade a search system" in system:
            question = user.split("\n", 1)[0]
            q_tokens = set(_tokens(question)) - {"question", "how", "many", "what", "is", "the", "a", "of", "do", "does"}
            passages = re.findall(r"\[(\d+)\] (.*?)(?=\n\n\[\d+\] |\Z)", user.split("Passages:", 1)[1], flags=re.DOTALL)
            out = []
            for number, text in passages:
                overlap = len(q_tokens & set(_tokens(text))) / max(1, len(q_tokens))
                out.append({"passage": int(number), "score": 1.0 if overlap >= 0.5 else 0.0, "reason": f"overlap {overlap:.2f}"})
            return {"passages": out}
        if "check an AI answer for hallucinations" in system:
            context, answer = user.split("ANSWER:", 1)
            claims = []
            for sentence in [s.strip() for s in re.split(r"(?<=\.)\s+", answer.strip()) if s.strip()]:
                nums = self._numbers(sentence)
                ok = bool(nums) and nums <= self._numbers(context)
                claims.append({"claim": sentence, "verdict": "supported" if ok else "unsupported", "passage": 1 if ok else 0})
            return {"claims": claims}
        if "compare an AI answer with a ground-truth" in system:
            truth = user.split("Ground truth:", 1)[1].split("\n", 1)[0]
            answer = user.split("AI answer:", 1)[1]
            want = self._numbers(truth)
            score = 1.0 if want and want <= self._numbers(answer) else 0.0
            return {"score": score, "reason": "numbers match" if score else "numbers differ"}
        if "states the ground-truth answer" in system:
            truth = user.split("Ground truth:", 1)[1].split("\n", 1)[0]
            passage = user.split("Passage:", 1)[1]
            return {"supports": bool(self._numbers(truth)) and self._numbers(truth) <= self._numbers(passage), "reason": "rule"}
        raise AssertionError(f"unexpected judge prompt: {system[:60]}")

    def _merged(self, user: str, schema: dict) -> dict:
        """The one-call prompt from engine.scoring.score_case, answered with the single-task rules above."""
        sections = dict(re.findall(r"(QUESTION|PASSAGES|ANSWER|GROUND TRUTH):\s*(.*?)(?=\n\n(?:QUESTION|PASSAGES|ANSWER|GROUND TRUTH):|\Z)", user, flags=re.DOTALL))
        tasks = schema["properties"]
        out = {}
        if "passages" in tasks:
            out["passages"] = self.ask("grade a search system", f"Question: {sections['QUESTION']}\nPassages:{sections['PASSAGES']}", {})["passages"]
        if "claims" in tasks:
            out["claims"] = self.ask("check an AI answer for hallucinations", f"{sections['PASSAGES']}\nANSWER: {sections['ANSWER']}", {})["claims"]
        if "accuracy" in tasks:
            out["accuracy"] = self.ask(
                "compare an AI answer with a ground-truth", f"Ground truth: {sections['GROUND TRUTH']}\nAI answer: {sections['ANSWER']}", {}
            )
        return out
