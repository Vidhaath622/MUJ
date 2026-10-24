"""RAGSeal evaluation engine: RAG under test, three metrics, replay verdict, synthetic questions, packs."""

from .ingest import UnsupportedFile
from .llm import JudgeError, ModelUnavailable
from .packs import PackError
from .service import Engine, NotFound

__all__ = ["Engine", "NotFound", "ModelUnavailable", "JudgeError", "PackError", "UnsupportedFile"]
