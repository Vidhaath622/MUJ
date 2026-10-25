# Hosting the RAGSeal API

The backend and engine run anywhere a container runs. No Ollama is needed: in the container the
generator under test, the judge and the embeddings are hosted models chosen by environment variables.
Nothing is deployed by this repo; `render.yaml` is ready for a one-click Render blueprint.

## Models in the hosted setup

| Role | Provider | Model (env var) | Why |
|---|---|---|---|
| Generator (the RAG under test) | Groq | `openai/gpt-oss-20b` (`RAGSEAL_GROQ_GENERATOR_MODEL`) | Groq's smallest chat model in its October 2026 catalog. Groq rate limits are per model, so the generator does not spend the judge's budget. |
| Judge | Groq | `openai/gpt-oss-120b` (`RAGSEAL_GROQ_MODEL`), every `GROQ_API_KEY_<n>` adds rate limit | Unchanged from the laptop setup. |
| Embeddings | NVIDIA | `nvidia/nemotron-3.5-embed-1b` (`NVIDIA_EMBED_MODEL`) | Answers for our key. Older NVIDIA embedders and the small NVIDIA chat models are listed in the catalog but return 404/410. |

Checked on 25 Oct 2026. To check again, call each provider's `/models` and then make one real call: being listed is not the same as answering.

Two things to know:

- The hosted generator is a different model from the laptop's `llama3.2:3b`, so pass rates are not directly comparable. The packs' published numbers were measured with the laptop setup.
- The generator and the judge are from the same model family. Results report both models.

## Environment

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon Singapore pooler URL. Users, runs, labels and analyses live there. |
| `JWT_SECRET` | A fixed secret, so logins survive restarts. Render generates one. |
| `GROQ_API_KEY`, `GROQ_API_KEY_2`, ... | The judge and generator keys. |
| `NVIDIA_API_KEY` | The embedding key. |
| `GOOGLE_CLIENT_ID` | Optional; enables Google sign-in. |
| `CORS_ORIGINS`, `RAGSEAL_PUBLIC_URL` | `https://ragseal.vercel.app` |
| `RAGSEAL_GENERATOR_PROVIDER=groq`, `RAGSEAL_JUDGE_PROVIDER=groq`, `RAGSEAL_EMBED_PROVIDER=nvidia`, `RAGSEAL_JUDGE_FALLBACK_PROVIDER=none` | Set in the Dockerfile. |

`/data` holds what is not in Postgres: the engine's vector store (chunks and embeddings of uploaded
documents and packs) and the judge cache. Give it a persistent disk. Without one, packs re-embed on
first use after a restart, and uploaded documents must be uploaded again.

## Region

Run the API next to the database. From the laptop in India, Neon us-east cost 263 ms per query and
Neon Singapore costs 83 ms. A Singapore host reaches Neon Singapore in a few milliseconds.
`render.yaml` uses `region: singapore`.

## Run the image locally

```
docker build -t ragseal-api .
docker run -p 8000:8000 --env-file backend/.env -v ragseal-data:/data ragseal-api
curl localhost:8000/api/health    # engine_ready: true, with the three hosted models listed
```

The Dockerfile could not be built here, because Docker is not installed on the dev laptop. The same
configuration was run outside Docker on 25 Oct 2026: Ollama pointed at a dead port, and
`python:3.14`, the version the image uses. The results:

- health showed `engine_ready: true` with all three hosted models;
- an upload was embedded by NVIDIA;
- one evaluated question returned CLEAN_PASS in 8.3 s;
- the 14-question `ragseal` pack ran in 84 s with a pass rate of 0.786 and 0 failures;
- the log never mentioned Ollama.

## Point the frontend at it

Change the `/api/:path*` rewrite in the frontend's `vercel.json` from the tunnel URL to
`https://<service>.onrender.com/api/:path*`, then redeploy Vercel. Point the laptop watchdog at the
new URL, or stop it.
