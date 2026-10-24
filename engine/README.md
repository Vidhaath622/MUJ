# RAGSeal engine

Python library behind the backend: the RAG system under test, the three metrics, the replay verdict, the synthetic question generator and the pack loader. The backend calls it only through `engine.Engine` (`service.py`).

| Module | What it does |
|---|---|
| `ingest.py` | PDF/TXT/MD to chunks. IDs come from a content hash, so the same file always gets the same `document_id` and `chunk_id`s. |
| `store.py` | SQLite store, scoped per owner. Exact cosine search in numpy, with ties broken deterministically. |
| `rag.py` | Retrieves top-k chunks and answers with `llama3.2:3b`. The prompt numbers each passage and asks the model to cite `[n]`; citations are mapped back to chunk_ids. |
| `scoring.py` | Context relevance (per chunk and overall), claim-level faithfulness, answer accuracy. Each metric says `judged_by: model` or `rule`. |
| `verdict.py` | The verdict table from `docs/product_brief.md`, as a pure function. |
| `evaluate.py` | One case end to end, including the replay with only the gold chunk(s). |
| `synth.py` | Synthetic Q + ground truth + gold chunk. A case is kept only if the quoted evidence really appears in the chunk. Also builds unanswerable and stale-version traps. |
| `agreement.py` | Judge vs human labels (`labels.json`). |
| `packs.py` | Pack loader: `docs/packs/<id>/pack.json` first, then `engine/packs_builtin/`. The format is documented at the top of the file. |
| `llm.py` | Ollama and Groq clients, plus the judge disk cache (`<data_dir>/judge_cache.sqlite`). |

Models: generator `llama3.2:3b`, judge `qwen3:8b` (or Groq `llama-3.3-70b-versatile` when `GROQ_API_KEY` is set), embeddings `nomic-embed-text`. Generation runs at temperature 0 with a fixed seed.

Env: `RAGSEAL_DATA_DIR`, `RAGSEAL_PACKS_DIRS`, `OLLAMA_HOST_URL`, `GROQ_API_KEY`, `RAGSEAL_TOP_K` (4), `RAGSEAL_CHUNK_CHARS` (700).

Tests run without any models (fake Ollama and fake judge):

    python -m pytest engine/tests -q
