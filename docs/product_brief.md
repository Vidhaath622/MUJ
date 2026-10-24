# RAGSeal Product Brief (AI-04) - v2, locked

Read this together with `memory.md` (team, timeline, stack) and `docs/api_contract.md` (API shapes, including the v2 additions at the bottom). Anyone's AI tool can use this file.

## Product in one line
RAGSeal is a lab that **proves** why a RAG answer failed: it tests the retriever and the generator apart, then re-runs the generator with the correct evidence to confirm the cause. It ships with industry test packs and runs fully on a laptop.

It has two halves:
1. **A working RAG app**: log in, upload or pick documents, ask questions, get cited answers.
2. **The evaluation lab** around it: synthetic questions with known answers, three scores, a causal verdict per failure, and a dashboard.

## Scope rule
The four official deliverables come first and must stay visible in the demo:
1. Scoring backend: context relevance, faithfulness, answer accuracy
2. Synthetic test-question generator from uploaded documents
3. Automated root-cause report for each failure
4. Single-screen dashboard (upload or query, retrieved text beside the answer, green/red scorecards)

Order of build: core flow end to end, then replay verdict, then packs, then login, then the How-it-works tab. If the core flow isn't working by about 9 PM, cut extras.

## What makes us stand out
1. **Causal verdict by replay.** For each failure we re-run the generator with only the gold chunk (the passage the question was generated from). If the replay is correct, the retriever was at fault. If it is still wrong with perfect evidence, the generator hallucinated. Most tools only score; we run the experiment.
2. **We check our own judge.** 30-50 answers labelled by hand; the dashboard shows how often the judge agrees with humans, with counts.
3. **Industry packs.** The same RAG needs different tests per business. Packs: Recruitment, Banking, Healthcare (fictional documents). Each pack has documents, tricky questions and risk rules.
4. **Trap questions.** Old vs new policy versions (staleness), questions with no answer in the documents (should abstain), distractor documents (noise).
5. **Local-first.** Everything runs on the laptop through Ollama. Documents never leave the machine. A hosted judge (Groq) is an optional switch.

## Honesty rules (judges will probe)
- Every number on screen must come from the backend. No fake counters, scores or latency. Use empty states before a run.
- Label demo data as demo data, and model-judged scores as model-judged.
- Always show sample counts next to metrics.
- Prior art exists: Ragas, RAGChecker, TruLens, DeepEval, ARES. Replay with gold context is a known practitioner technique. Our claim is the **combination**: one automated, evidence-backed verdict per failure, judge-vs-human agreement, and industry packs, in one product. Never say "we invented".
- Don't call output "100% safe" or "hallucination-free".

## Verdict logic (engine implements, frontend displays)
| Gold chunk retrieved? | Answer faithful to context? | Replay with gold chunk | Verdict |
|---|---|---|---|
| Yes | Yes, and correct | not needed | `CLEAN_PASS` |
| No | n/a | Correct | `RETRIEVAL_FAILURE` |
| Yes | No | Still wrong | `GENERATION_HALLUCINATION` |
| No | No | Still wrong | `COMPOUND_FAILURE` |
| Yes | Yes, but answer wrong | n/a | `NEEDS_REVIEW` (bad label or reasoning error) |
| Evidence conflicts | n/a | n/a | `UNRESOLVED` |

For unanswerable questions the correct behaviour is to abstain; making something up counts as a hallucination. Thresholds start as heuristics and get calibrated on the hand-labelled set.

## Industry packs
| Pack | Documents (all fictional) | Example trap |
|---|---|---|
| Recruitment | Resumes, two job descriptions, hiring policy v1 and v2, recruiter guide | Old JD says 5 years, approved one says 3 |
| Banking | Account terms, fee schedule v1 and v2, internal procedure | Outdated fee quoted as current |
| Healthcare | Fictional hospital protocols, discharge guide | Unsupported or contradictory guidance |

Each pack: about 5 documents, 10-15 test cases with gold chunk IDs, including at least one stale-version, one unanswerable and one distractor case. Members 3 and 4 own pack content in `/docs/packs` or hand it to the engine owner.

## Models (Local & NVIDIA NIM Hosted Options)
- **Hosted / Cloud Preview via NVIDIA NIM** (Recommended for fast demo & sub-second judging without laptop thermal throttling; see `docs/nvidia_nim_apis.md`):
  - Generator under test: `meta/llama-3.2-3b-instruct` (or `meta/llama-3.1-8b-instruct`) via `https://integrate.api.nvidia.com/v1`
  - Judge / Reasoner: `meta/llama-3.3-70b-instruct` or `deepseek-ai/deepseek-r1`
  - NeMo Retriever Embeddings: `nvidia/nv-embedqa-e5-v5`
  - Reranker: `nvidia/nemotron-3.5-rerank-8b`
- **Local Fallback (Ollama)**:
  - Generator under test: `llama3.2:3b` (small on purpose, so failures are visible)
  - Judge: `qwen3:8b` locally; optional Groq `llama-3.3-70b-versatile` if `GROQ_API_KEY` is set
  - Embeddings: `nomic-embed-text`
- Every judge call is cached so reruns are instant.

## Login and saved work
Email and password login (JWT, SQLite). Each user's documents, test sets and past runs are saved under their account. A seeded demo user exists for the pitch. Works offline.

## Division of work
| Area | Owner | Folder | Branch |
|---|---|---|---|
| Frontend (both tabs) | Vidhaath (Antigravity) | `/frontend` | `vidhaath/ui-frontend` |
| Engine: RAG, metrics, replay verdict, question generator, packs loader | Sarthak, Claude Builder | `/engine` | `sarthak/core-engine` |
| Backend: FastAPI, auth, storage, runs | Sarthak, Claude Builder | `/backend` | `sarthak/backend-api` |
| Coordination, API contract, reviews | Sarthak, Claude Lead | `/docs` contract files | `sarthak/docs-*` |
| Pack content, pitch deck, QA, demo script | Members 3 and 4 | `/docs` | `team/presentation-docs` |

Nobody edits another owner's folder. Contract changes go through `docs/api_contract.md` in a PR, announced to the team.

## Frontend job (for the frontend owner and their AI)
Build against `docs/api_contract.md` with mock data first, then switch to the live backend at `http://localhost:8000`. The frontend only displays results; it never calls a model directly and never computes scores.

Two navigation tabs plus login:

**Tab 1, "Lab" (the working app, normal scrolling, fast):**
1. Pack selector (Recruitment, Banking, Healthcare, My documents) and document upload.
2. Ask box: question in, answer out, with retrieved chunks shown beside the answer and citations highlighted.
3. "Evaluate" on any answer, and "Generate test set / Run batch" for a whole pack.
4. Scorecards for the three metrics: green PASS, amber REVIEW, red FAIL, each with its explanation.
5. Root-cause panel: verdict badge, summary, evidence, and the **replay comparison** (original answer vs answer with gold chunk) side by side. This is the hero of the demo.
6. Batch dashboard: totals, verdict breakdown chart, judge-vs-human agreement, clickable rows that open the trace.
7. History of past runs for the logged-in user.

**Tab 2, "How it works" (scroll storytelling):**
- As the user scrolls, the pipeline animates stage by stage: documents, chunking, retrieval, generation, judging, replay, verdict.
- Use GSAP ScrollTrigger (or Motion `useScroll`) plus React Flow for the graph. Lazy-load this tab.
- Cap it at about 3-4 hours of work. Ship a static fallback and turn off pinned scrolling on mobile.
- The same pipeline graph should be exportable as a PNG for the PPT.

**Login screen:** email and password, register, and "Use demo account".

Design: dark graphite or navy "control room", crisp white type, teal accent, clear red/amber/green. Readable from a judge standing beside the laptop; test on the projector. Show explicit loading, error and empty states, including "Local model warming up" and "Using hosted judge".

## Pitch notes
- One hero diagram: documents, synthetic questions, retriever, generator, judge, replay, verdict. The replay branch gets its own colour. Walk one real failing example through it.
- About half the pitch is the live demo. The killer moment: an answer that looks right, the replay proves it was a retrieval failure (or a hallucination), and the evidence is on screen.
- End on one results slide: retrieval vs hallucination split and judge-vs-human agreement, with counts.

## Timeline reminders
- 5:15 PM merge checkpoint
- 6:15 PM surprise additional problem statement
- 1:30 AM hard code freeze
- 3:00 AM Round 1 evaluation (PPT and prototype)
