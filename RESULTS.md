# RAGSeal results

Measured numbers, with where each one comes from. Measured on 24–25 Oct 2026 on the team laptop, unless a section says otherwise.

**Setup (unless stated):**
- RAG under test: local `llama3.2:3b` via Ollama, `nomic-embed-text` embeddings, top-4 dense retrieval, 700-character chunks (profile "v1").
- Judge: `openai/gpt-oss-120b` on Groq.

## Test questions

**524 questions in 12 packs: 162 written by people, 362 synthetic.**

Synthetic questions are written by a model from an exact quote in a document. One is kept only after automatic checks:
- the quote is found verbatim;
- the answer's figures are in the quote;
- the question stands alone.

Each question is marked `origin: hand | synthetic` in its pack. Synthetic questions are never presented as human-labelled. 19 more validated synthetic questions (10%) were held back for a human spot-check: `engine/packs_builtin/SYNTHETIC_SPOT_CHECK.md`.

| Pack | Questions | Hand | Synthetic | Documents |
|---|---|---|---|---|
| banking | 71 | 14 | 57 | 5 (fee schedule v1 and v2, look-alike promotion) |
| recruitment | 71 | 14 | 57 | 5 |
| healthcare | 71 | 14 | 57 | 5 |
| synthetic_public | 129 | 0 | 129 | 9 real documents searched together: IRS 2025/2026 releases (public domain) and the RAGSeal guide |
| income_tax_india | 29 | 22 | 7 | 3 (FY 2024-25, FY 2025-26, old regime) |
| gst_india | 15 | 15 | 0 | 3 |
| gst_reform_overview | 33 | 0 | 33 | 3 |
| travel_jaipur_goa | 29 | 20 | 9 | 3 |
| telecom_india | 22 | 15 | 7 | 3 |
| realworld (IRS) | 22 | 22 | 0 | 4 real IRS releases |
| rishihood_rules | 18 | 12 | 6 | 3 |
| ragseal | 14 | 14 | 0 | 3 |

**By type:**

| Type | Questions |
|---|---|
| factoid | 411 |
| stale (an outdated version exists) | 60 |
| unanswerable | 43 |
| distractor | 10 |

The income tax, GST, telecom, travel and university-rules documents and their hand-written questions come from a teammate. Every quote was checked verbatim against the documents (`engine/scripts/convert_anuvesha_packs.py`). Their figures were not re-checked against live sources; each pack's `data_note` says so.

## Pass rate per pack

Latest baseline run of each pack (CLEAN_PASS share). These are the runs a new user sees as "Sample results".

| Pack | Pass rate | Run |
|---|---|---|
| gst_india | 1.000 | batch_7e6e7496ef |
| travel_jaipur_goa | 0.966 | batch_2d433e409b |
| rishihood_rules | 0.944 | batch_450f5c1bd3 |
| healthcare | 0.901 | batch_94eacf233a |
| recruitment | 0.887 | batch_90668775a3 |
| banking | 0.859 | batch_e7ab3bee40 |
| telecom_india | 0.818 | batch_4400a5fb94 |
| ragseal | 0.786 | batch_92eb6f3bf8 |
| synthetic_public | 0.760 | batch_8090a96e99 |
| gst_reform_overview | 0.758 | batch_a95b76d2c5 |
| realworld (IRS) | 0.727 | batch_43ae8ebc8a |
| income_tax_india | 0.655 | batch_0750964316 |

A low pass rate measures the RAG under test, a 3B model, not RAGSeal. For example, income tax has many traps where the FY 2024-25 figure competes with the FY 2025-26 one.

## Throughput

**Measured cold run of 509 questions** (all packs at the time):
- 10 Groq keys and a fresh judge cache.
- 16 cases in parallel, with the local generator shared.

| Measure | Value |
|---|---|
| Wall time | 13.7 min |
| Throughput | 37.1 questions/min |
| Failed cases | 0 |
| Judge fallbacks | 0 |
| Judge calls | 570 |
| Tokens | 729K (1,279 per call) |

311 parts of the scoring were settled by deterministic rules instead of the judge (exact numeric matches, abstentions). At this rate, 200 questions take about 5.4 min.

**What limits it:** the judge's per-minute token budget per API key. The judge paces each key to its budget from the rate-limit headers and spreads calls across keys. More keys mean proportionally more throughput: in a simulation, 8 keys instead of 4 halved the time.

**Caveat:** the live site shared the same keys during the run, so there were still 541 rate-limit retries.

## Retrieval: chunking lab

Context recall@4 is the share of gold quotes found in the top-4 retrieved chunks. MRR is mean reciprocal rank. Only retrieval runs here: no generator, and no judge except for rerank.

**synthetic_public** (9 real documents, 129 questions):

| Configuration | Recall@4 | MRR |
|---|---|---|
| 700 characters, dense (current default) | 0.930 | 0.748 |
| 700 characters, hybrid (BM25 + dense, RRF) | 0.961 | 0.782 |
| 1200 characters, hybrid | 0.984 | 0.775 |
| 1200 characters, hybrid + rerank | 1.000 | 0.891 |

- Hybrid beats dense at every chunk size on this pack: +3.1 points at the same chunk size.
- Larger chunks also put more text in front of the generator, so part of the 1200-character gain is context size.
- Rerank costs one judge call per question (about 5 s).
- On banking, recall is 1.000 in every configuration, and MRR goes from 0.911 (dense) to 0.927 (hybrid) to 0.960 (with rerank).

The live default stays dense v1, because the published agreement numbers were measured with it.

## Release gate (CI)

`POST /api/gate` or the `ragseal-gate` CLI fails a build in either case:
- the pass rate is below a minimum;
- questions that passed in the baseline run now fail.

Example on real data: banking, profile "v2" (top-2, superseded documents filtered) against the v1 baseline.

| Measure | Value |
|---|---|
| Pass rate | 88.7% (above the 80% bar) |
| New failures vs baseline | 4 (bank_06, bank_49, bank_56, bank_66) |
| Fixed | 6 |
| Gate result | **FAIL**, exit code 1 |

The pass rate alone would have shipped the regression.

## Database latency (Neon)

Postgres on Neon is supported (`DATABASE_URL`). Times are from the laptop in India:

| | SELECT 1 | `/runs` |
|---|---|---|
| Neon us-east | 263 ms | |
| Neon Singapore | 83 ms | 87–162 ms (one query) |

A finished run opens in about 0.45 s the first time and from memory after that. The live backend runs on the laptop, so it stays on SQLite (2–8 ms). Neon is for a hosted backend placed next to it.

## Hosted mode (no Ollama)

`Dockerfile` + `render.yaml` (Singapore). Nothing is deployed. The models:
- Groq `gpt-oss-20b` as the generator;
- Groq `gpt-oss-120b` as the judge;
- NVIDIA `nemotron-3.5-embed-1b` for embeddings.

Tested outside Docker with Ollama unreachable:
- one question evaluated in 8.3 s;
- the 14-question ragseal pack in 84 s at a pass rate of 0.786.

Hosted pass rates are not comparable with the laptop's 3B generator.
