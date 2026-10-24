# Frontend Integration Notes (from backend review of `frontend/src/lib/api.ts`, cfb282e)

For Vidhaath and Antigravity. These five points come from checking the frontend API client against the live backend. #1 is critical for the demo.

## 1. CRITICAL: run packs by `pack_id`
`evaluateBatchSuite` currently sends `document_id` plus `{test_id, question, ground_truth_answer}`. For pack runs that strips out what makes the demo work:
- unanswerable traps look like "no ground truth"
- stale traps lose their outdated chunk
- the replay can't run because there's no gold chunk

**Fix:** for a pack run, send only the pack id and let the backend load everything:
```http
POST /api/evaluate/batch
{ "pack_id": "banking" }
```
If you pass test cases yourself, pass them through exactly as `POST /api/packs/{id}/load` returns them, keeping `gold_chunk_ids`, `stale_chunk_ids` and `type`.

## 2. Show real error messages
Every helper returns `null` on a non-OK response, so the UI can't say why something failed. The backend always sends `{"detail": "..."}`:

| Status | Meaning | Show |
|---|---|---|
| 401 | Not logged in or token expired | Send to login |
| 404 | Document, pack or run not found | The `detail` text |
| 422 | Bad request body | The `detail` text |
| 503 | Model unavailable or warming up | The `detail` text, e.g. "Local model warming up", "Judge unavailable" |

## 3. Health badge
`GET /api/health` also returns:
- `evaluation_mode`: `"local"` | `"hosted"` | `"unavailable"`
- `judge_model`: e.g. `"openai/gpt-oss-120b"`
- `models.{generator,embeddings,judge}.{name, provider, ready, error}`

Show a small status badge: "Using hosted judge: gpt-oss-120b (Groq)", "Local model warming up", or, in red, "Judge unavailable". This is part of our honesty story, so judges should be able to see which models are scoring.

## 4. Endpoints not wired yet
- `POST /api/auth/register`, `GET /api/auth/me`
- `POST /api/documents/upload` (multipart, field name `file`), `GET /api/documents`
- `POST /api/packs/{pack_id}/load`
- `POST /api/synthetic/generate`
- `GET /api/runs`, `GET /api/runs/{batch_id}`

## 5. Batches are slow, so show progress
Each case takes about 3-5 s (local generator plus hosted judge), so a 14-case pack takes about a minute. Use a long-running loading state ("Evaluating 14 cases, about 1 minute") with no request timeout under 3 minutes. Never show placeholder numbers while waiting.
