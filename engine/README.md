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
| `llm.py` | Ollama, Groq and NVIDIA NIM clients, per-role model selection, and the judge disk cache (`<data_dir>/judge_cache.sqlite`). |

Providers per role (`RAGSEAL_GENERATOR_PROVIDER`, `RAGSEAL_JUDGE_PROVIDER`, `RAGSEAL_EMBED_PROVIDER`: `auto` | `ollama` | `groq` | `nvidia`). `auto` uses:

| Role | auto order | Default models |
|---|---|---|
| generator (system under test) | ollama | `llama3.2:3b` (NIM `google/gemma-3-4b-it`, Groq `openai/gpt-oss-20b` if chosen) |
| judge | groq, then nvidia, then ollama | Groq `openai/gpt-oss-120b`, NIM `mistralai/mistral-large-2-instruct`, Ollama `qwen3:8b` |
| embeddings | ollama | `nomic-embed-text` (NIM `nvidia/llama-3.2-nv-embedqa-1b-v1` if chosen) |

Override any model with the env vars in `config.py` (`MODEL_DEFAULTS`). Hosted catalogs retire models, so `status()` checks each hosted model against the live `/models` list. There is no mock mode: a missing key or model makes `status()` report `evaluation_mode: "unavailable"`, and calls raise `ModelUnavailable`. Documents embedded with another embedding model are re-embedded automatically before search. Generation runs at temperature 0 with a fixed seed.

Env: `RAGSEAL_DATA_DIR`, `RAGSEAL_PACKS_DIRS`, `OLLAMA_HOST_URL` (or `OLLAMA_BASE_URL`), `GROQ_API_KEY`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `RAGSEAL_TOP_K` (4), `RAGSEAL_CHUNK_CHARS` (700).

Tests run without any models (fake Ollama and fake judge):

    python -m pytest engine/tests -q
