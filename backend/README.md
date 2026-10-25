# RAGSeal backend

FastAPI wrapper around the RAGSeal `engine` package: auth, per-user documents, evaluation, packs and run history.
API shapes: `docs/api_contract.md`.

## Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or reuse the engine's venv
pip install -r requirements.txt
cp .env.example .env    # set RAGSEAL_ENGINE_PATH if engine/ is not at the repo root
uvicorn app.main:app --port 8000
```

Ollama must be running with `llama3.2:3b`, `qwen3:8b` and `nomic-embed-text` pulled
(`/api/health` shows which models are ready). Set `GROQ_API_KEY` in `.env` to use the hosted judge.

Demo account (seeded on startup): `demo@ragseal.dev` / `demo1234`.

Data lives in `backend/data/` (override with `RAGSEAL_BACKEND_DATA`): `app.sqlite` (users, runs,
evaluations), `.jwt_secret` (when `JWT_SECRET` is unset) and `engine/` (vector store, judge cache).

## Endpoints (all under `/api`)

Every endpoint except health and auth needs `Authorization: Bearer <token>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Always 200; `engine_ready` false when Ollama or a model is missing |
| POST | `/auth/register` | `{email, password}` (password >= 6 chars); 409 if taken |
| POST | `/auth/login` | `{email, password}`; 401 on bad credentials |
| POST | `/auth/google` | `{credential}` (the ID token from Google Sign-In): verified against `GOOGLE_CLIENT_ID`; signs in, links an existing account with the same email, or creates one; same response as login. 503 if not configured |
| GET | `/auth/me` | Current user |
| POST | `/documents/upload` | multipart field `file` (PDF/TXT/MD, max 20 MB) |
| GET | `/documents` | This user's documents |
| GET | `/documents/{id}` | Document with chunks |
| DELETE | `/documents/{id}` | 204 |
| POST | `/rag/ask` | `{query, document_ids}` |
| POST | `/evaluate/query` | `{query, document_id \| document_ids, optional_ground_truth?, optional_manual_answer?, gold_chunk_ids?, type?}` |
| POST | `/evaluate/batch` | `{document_id \| document_ids, test_cases, pack_id?}`; with only `pack_id`, the pack is loaded and its documents/cases used |
| POST | `/synthetic/generate` | `{document_id, count=5 (max 20), include_traps=true}` |
| GET | `/packs` | Available industry packs |
| POST | `/packs/{pack_id}/load` | Loads pack documents for this user |
| GET | `/runs` | Saved batch runs, newest first |
| GET | `/runs/{batch_id}` | Full saved batch response |

Errors are `{"detail": "..."}`: 404 not found, 400 bad file/input, 413 too large, 422 validation or
invalid pack, 503 model unavailable, 502 judge failure.

## Database

SQLite at `backend/data/app.sqlite` by default. Set `DATABASE_URL` (for example a Neon Postgres
connection string) in `backend/.env` to use Postgres instead; tables are created on startup and
`GET /api/health` reports `"database": "postgres"`. To copy existing SQLite data once:

```bash
DATABASE_URL=postgresql://... python backend/scripts/migrate_sqlite_to_postgres.py backend/data/app.sqlite --dry-run
DATABASE_URL=postgresql://... python backend/scripts/migrate_sqlite_to_postgres.py backend/data/app.sqlite
```

It is safe to re-run (existing rows are skipped) and checks the row counts at the end.
The engine's judge cache and vector store stay in local SQLite files.

## Tests

```bash
cd backend && python -m pytest -q
# the same suite against Postgres (each test starts from an empty schema):
RAGSEAL_TEST_DATABASE_URL=postgresql://user@localhost:5432/ragseal_test python -m pytest -q
```

Tests use a fake engine (no Ollama needed) and a temp data dir; they never use `DATABASE_URL`.
