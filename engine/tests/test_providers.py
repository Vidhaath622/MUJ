import pytest

from engine.config import Settings
from engine.llm import ModelUnavailable, UnavailableClient, build_models
from engine.service import Engine

from .fakes import FakeEmbedder, FakeGenerator


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("RAGSEAL_GENERATOR_PROVIDER", "RAGSEAL_JUDGE_PROVIDER", "RAGSEAL_EMBED_PROVIDER"):
        monkeypatch.delenv(name, raising=False)


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
