import pytest

from engine.config import Settings
from engine.llm import ModelUnavailable, UnavailableClient, build_models
from engine.service import Engine

from .fakes import FakeEmbedder, FakeGenerator


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("RAGSEAL_GENERATOR_PROVIDER", "RAGSEAL_JUDGE_PROVIDER", "RAGSEAL_EMBED_PROVIDER", "RAGSEAL_JUDGE_OVERFLOW"):
        monkeypatch.delenv(name, raising=False)
    # Tests never reach a real local judge, whatever is pulled on this machine.
    monkeypatch.setenv("RAGSEAL_JUDGE_FALLBACK_PROVIDER", "none")


def test_auto_order():
    assert Settings(nvidia_api_key="k", groq_api_key="g").provider_for("judge") == "groq"
    assert Settings(nvidia_api_key="k", groq_api_key="").provider_for("judge") == "nvidia"
    assert Settings(nvidia_api_key="", groq_api_key="").provider_for("judge") == "ollama"
    # The system under test and the vectors stay local unless .env says otherwise.
    assert Settings(nvidia_api_key="k", groq_api_key="g").provider_for("generator") == "ollama"
    assert Settings(nvidia_api_key="k", groq_api_key="g").provider_for("embeddings") == "ollama"


def test_explicit_provider_and_models(monkeypatch):
    monkeypatch.setenv("RAGSEAL_JUDGE_PROVIDER", "groq")
    monkeypatch.setenv("RAGSEAL_EMBED_PROVIDER", "nvidia")
    settings = Settings(nvidia_api_key="k", groq_api_key="g")
    models = build_models(settings)
    assert models.judge.provider == "groq" and models.judge.model == "openai/gpt-oss-120b"
    assert models.generator.provider == "ollama" and models.generator.model == "llama3.2:3b"
    assert models.embedder.provider == "nvidia" and models.embedder.model == "nvidia/llama-3.2-nv-embedqa-1b-v1"


def test_unsupported_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("RAGSEAL_EMBED_PROVIDER", "groq")
    with pytest.raises(ValueError):
        Settings().provider_for("embeddings")


def test_missing_key_reports_unavailable_instead_of_faking(monkeypatch, tmp_path):
    monkeypatch.setenv("RAGSEAL_JUDGE_PROVIDER", "nvidia")
    settings = Settings(nvidia_api_key="", groq_api_key="", data_dir=tmp_path)
    engine = Engine(settings, generator=FakeGenerator(), embedder=FakeEmbedder())
    assert isinstance(engine.judge.chat_model.client, UnavailableClient)
    status = engine.status()
    assert status["evaluation_mode"] == "unavailable"
    assert status["engine_ready"] is False
    assert "NVIDIA_API_KEY" in status["models"]["judge"]["error"]
    with pytest.raises(ModelUnavailable):
        engine.judge.ask("system", "user", {"type": "object"})


class _Model:
    """Minimal ChatModel stand-in: returns a fixed JSON reply or raises ModelUnavailable."""

    def __init__(self, name, hosted, reply=None):
        self.model, self.provider, self.hosted, self.reply = name, "x", hosted, reply

    def ready(self):
        return True, None

    def chat(self, messages, schema=None, num_predict=512, patient=True):
        from engine.llm import Generation

        if self.reply is None:
            raise ModelUnavailable("rate limited")
        return Generation(self.reply, self.model, 1)


def test_judge_falls_back_and_says_so(tmp_path):
    from engine.llm import Judge

    judge = Judge(_Model("hosted-judge", True), tmp_path / "c.sqlite", fallback=_Model("local-judge", False, '{"score": 1}'))
    judge.start_tracking()
    assert judge.ask("s", "u", {"type": "object"}) == {"score": 1}
    used = judge.used()
    assert used["judge_model"] == "local-judge"
    assert used["evaluation_mode"] == "local"
    assert used["judge_fallback_used"] is True


def test_judge_without_fallback_raises(tmp_path):
    from engine.llm import Judge

    judge = Judge(_Model("hosted-judge", True), tmp_path / "c.sqlite")
    with pytest.raises(ModelUnavailable):
        judge.ask("s", "u", {"type": "object"})


def test_fallback_provider_setting(monkeypatch):
    monkeypatch.delenv("RAGSEAL_JUDGE_FALLBACK_PROVIDER")
    assert Settings().judge_fallback_provider("groq") == "ollama"
    assert Settings().judge_fallback_provider("ollama") is None
    monkeypatch.setenv("RAGSEAL_JUDGE_FALLBACK_PROVIDER", "none")
    assert Settings().judge_fallback_provider("groq") is None


def test_pool_skips_broken_primary_and_uses_overflow(tmp_path):
    from engine.llm import Judge

    judge = Judge(
        _Model("primary", True), tmp_path / "c.sqlite",
        overflow=(_Model("overflow", True, '{"score": 0.5}'),), fallback=_Model("local", False, '{"score": 1}'),
    )
    judge.start_tracking()
    assert judge.ask("s", "u", {"type": "object"}) == {"score": 0.5}
    assert judge.used()["judge_model"] == "overflow"


def test_pool_waits_out_short_rate_limit_on_primary(tmp_path):
    from engine.llm import Generation, Judge, RateLimited

    class Flaky(_Model):
        calls = 0

        def chat(self, messages, schema=None, num_predict=512, patient=True):
            Flaky.calls += 1
            if Flaky.calls == 1:
                raise RateLimited("429", wait=0.3)
            return Generation('{"score": 1}', self.model, 1)

    judge = Judge(Flaky("primary", True), tmp_path / "c.sqlite", overflow=(_Model("overflow", True, '{"score": 0}'),))
    judge.start_tracking()
    # A short wait on the primary beats switching judges.
    assert judge.ask("s", "u", {"type": "object"}) == {"score": 1}
    assert judge.used()["judge_fallback_used"] is False


def test_overflow_setting(monkeypatch):
    s = Settings(groq_api_key="g", nvidia_api_key="")
    assert s.judge_overflow("groq") == [("groq", "qwen/qwen3.8-27b")]
    monkeypatch.setenv("RAGSEAL_JUDGE_OVERFLOW", "nvidia:minimaxai/minimax-m3.1-flash,groq:openai/gpt-oss-120b")
    assert s.judge_overflow("groq") == []  # no NVIDIA key, and the primary itself is dropped


def test_extra_groq_keys_are_replicas_of_the_same_judge(monkeypatch, tmp_path):
    monkeypatch.setenv("GROQ_API_KEY_2", "second")
    monkeypatch.setenv("RAGSEAL_JUDGE_OVERFLOW", "none")
    settings = Settings(groq_api_key="first", nvidia_api_key="", data_dir=tmp_path)
    models = build_models(settings)
    assert len(models.judge_replicas) == 1 and models.judge_replicas[0].model == models.judge.model


def test_replica_takes_over_when_first_key_is_limited(tmp_path):
    from engine.llm import Generation, Judge, RateLimited

    class Limited(_Model):
        def chat(self, messages, schema=None, num_predict=512, patient=True):
            raise RateLimited("429", wait=50)

    primary = Limited("gpt-oss-120b", True)
    replica = _Model("gpt-oss-120b", True, '{"score": 1}')
    judge = Judge(primary, tmp_path / "c.sqlite", replicas=(replica,), overflow=(_Model("other", True, '{"score": 0}'),))
    judge.start_tracking()
    assert judge.ask("s", "u", {"type": "object"}) == {"score": 1}
    used = judge.used()
    assert used["judge_model"] == "gpt-oss-120b" and used["judge_fallback_used"] is False


def test_zero_wait_overflows_immediately(tmp_path):
    from engine.llm import Judge, RateLimited

    class Limited(_Model):
        def chat(self, messages, schema=None, num_predict=512, patient=True):
            raise RateLimited("429", wait=5)

    judge = Judge(Limited("p", True), tmp_path / "c.sqlite", overflow=(_Model("o", True, '{"score": 0}'),), max_wait_s=0)
    judge.start_tracking()
    assert judge.ask("s", "u", {"type": "object"}) == {"score": 0}
    assert judge.used()["judge_fallback_used"] is True


def test_rate_limit_never_overflows_to_local_judge(tmp_path):
    from engine.llm import Generation, Judge, RateLimited

    class Limited(_Model):
        calls = 0

        def chat(self, messages, schema=None, num_predict=512, patient=True):
            Limited.calls += 1
            if Limited.calls < 3:
                raise RateLimited("429", wait=0.2)
            return Generation('{"score": 1}', self.model, 1)

    judge = Judge(Limited("hosted", True), tmp_path / "c.sqlite", fallback=_Model("local", False, '{"score": 0}'), max_wait_s=0)
    judge.start_tracking()
    assert judge.ask("s", "u", {"type": "object"}) == {"score": 1}
    assert judge.used()["judge_fallback_used"] is False
