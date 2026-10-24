<div align="center">

# RAGSeal

### *When a RAG answer is wrong, RAGSeal proves whether the retriever or the generator caused it.*

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.x-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20Models-white?style=flat&logo=ollama&logoColor=black)](https://ollama.com/)
[![Groq](https://img.shields.io/badge/Groq-Hosted%20Grading-F05A28?style=flat&logo=groq&logoColor=white)](https://groq.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Vector%20%2B%20App%20Data-003B57?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat)](LICENSE)

**HYPNEXIS'26 Hackathon** · Problem Statement **AI-04** · Team **Monster Energy**

</div>

---

## Overview

![RAGSeal Hero Screenshot](docs/assets/hero.png)

### The Problem
* **Failure Ambiguity**: When a RAG answer is incorrect, hallucinations and retrieval misses look identical from the outside. Teams waste days blaming the LLM when vector search missed the relevant chunk, or tweaking chunk sizes when the generator simply fabricated information.
* **Black-Box Metrics**: End-to-end evaluation metrics (BLEU, ROUGE, or opaque LLM grades) only tell you *that* an answer failed, never *which component failed* or *why*.
* **Guesswork Debugging**: Without causal counterfactual proof, teams fix bugs by intuition—often introducing silent regressions across document revisions.

**RAGSeal** is an open-source evaluation laboratory that decomposes RAG pipelines into isolated retriever and generator checks, runs automated counterfactual replays with isolated gold context, and delivers deterministic causal verdicts.

---

## How It Works

```mermaid
flowchart TD
    subgraph IndexingLane ["1. Indexing Lane"]
        Docs["Documents (.md / .txt)"] --> Chunks["Chunking Engine"]
        Chunks --> Embeds["Embeddings (nomic-embed-text)"]
        Embeds --> VStore[("SQLite Vector Store")]
    end

    subgraph AnsweringLane ["2. Answering Lane"]
        Query["User / Test Question"] --> TopK["Retriever (Top-4 Chunks)"]
        VStore -.-> TopK
        TopK --> Gen["Generator (llama3.2:3b)"]
        Gen --> Answer["Generated & Cited Answer"]
    end

    subgraph EvaluationLane ["3. RAGSeal Tri-Score Checks"]
        TopK --> Check1["1. Context Relevance<br/>(Did retriever fetch the required facts?)"]
        Answer --> Check2["2. Faithfulness<br/>(Did generator stick strictly to context?)"]
        Answer --> Check3["3. Answer Accuracy<br/>(Does answer match ground truth?)"]
    end

    subgraph ReplayLane ["4. Causal Counterfactual Replay"]
        Check1 & Check2 & Check3 --> Gate{"All Scores Pass?"}
        Gate -- "Yes" --> PassVerdict["Verdict: Accurate"]
        Gate -- "No (Failure)" --> Replay["Replay Generator with ONLY Gold Passage<br/>(Isolate retriever from generator)"]
        Replay --> ReplayOutcome{"Replay Output Fixed?"}
        ReplayOutcome -- "Yes (Answer Correct)" --> RetFault["Verdict: Retrieval Failure<br/>(Generator succeeds when fed gold evidence)"]
        ReplayOutcome -- "No (Still Wrong)" --> GenFault["Verdict: Generator Hallucination / Reasoning Error<br/>(Failed despite having exact gold evidence)"]
    end
```

---

## Verdict Decision Tree

When a test case fails, RAGSeal traverses a deterministic decision tree and isolates the root cause via counterfactual replay:

```mermaid
flowchart TD
    Start(["Start: Evaluate Q&A Pair"]) --> Q1{"Was correct passage<br/>retrieved in Top-4?"}
    
    Q1 -- "No" --> Q2{"Did answer stick<br/>to retrieved context?"}
    Q1 -- "Yes" --> Q3{"Did answer stick<br/>to retrieved context?"}
    
    Q2 -- "No (Extrapolated)" --> Replay1{"Replay with gold<br/>chunk fixes it?"}
    Q2 -- "Yes (Faithful to bad context)" --> Replay2{"Replay with gold<br/>chunk fixes it?"}
    
    Replay1 -- "Yes" --> RetFail["Retrieval Failure<br/>(Distractor / Wrong Chunk)"]
    Replay1 -- "No" --> BothFail["Both Failed<br/>(Bad retrieval + Generator hallucination)"]
    
    Replay2 -- "Yes" --> RetOnly["Retrieval Failure<br/>(Wrong chunk / Outdated source)"]
    Replay2 -- "No" --> Unresolved1["Unresolved / Review Needed"]
    
    Q3 -- "Yes" --> Q4{"Does answer match<br/>ground truth?"}
    Q3 -- "No (Hallucinated)" --> Replay3{"Replay with gold<br/>chunk fixes it?"}
    
    Q4 -- "Yes" --> Accurate["Verdict: Accurate"]
    Q4 -- "No" --> ReasonErr["Generator Reasoning Error<br/>(Gold context misread or unhandled)"]
    
    Replay3 -- "Yes" --> RetConf["Retrieval Failure / Distractor Confusion"]
    Replay3 -- "No" --> PureHallucination["Verdict: Hallucination<br/>(Generator hallucinates even on gold passage)"]
```

### The 9 Failure Types

| Failure Type | Category | Description |
|---|---|---|
| `wrong_chunk` | Retriever | Retriever fetched irrelevant sections; gold evidence was omitted from top-4 results. |
| `outdated_source` | Retriever | Retriever pulled a deprecated document revision instead of the active policy. |
| `distractor_confusion` | Retriever | Retriever fetched an adversarial distractor chunk that lured the generator away. |
| `ignored_context` | Generator | Gold passage was retrieved in top-4, but the generator completely ignored it. |
| `hallucination` | Generator | Generator invented claims, dates, or numbers unsupported by any retrieved chunk. |
| `reasoning_error` | Generator | All evidence was present, but the generator miscalculated, miscompared, or erred in logic. |
| `should_have_abstained` | Generator | Query was unanswerable from the corpus, but the generator fabricated an answer anyway. |
| `wrongly_abstained` | Generator | Evidence was present in retrieved chunks, but the generator refused to answer. |
| `unresolved` | Pipeline | Ambiguous edge case where replay and scoring do not reach clear causal consensus. |

---

## Architecture

```mermaid
flowchart TB
    subgraph Client ["Frontend (UI)"]
        UI["React 18 + Vite + Tailwind CSS<br/>Dark / Light Themes · Live X-Ray · Label Studio"]
    end

    subgraph Service ["Backend API (FastAPI)"]
        API["FastAPI REST Endpoints<br/>/api/evaluate · /api/bots · /api/impact · /api/trust · /api/labels"]
    end

    subgraph Engine ["RAGSeal Core Engine"]
        Ingest["Document Ingestion & Chunking"]
        Retriever["Retriever Module (Top-K)"]
        Generator["Target Generator Interface"]
        Scorer["Tri-Metric Scorer<br/>(Relevance, Faithfulness, Accuracy)"]
        ReplayEngine["Counterfactual Replay Engine"]
        VerdictLogic["Causal Verdict Classifier"]
    end

    subgraph Storage ["Persistence Layer"]
        AppDB[("SQLite App DB<br/>Runs, Cases, Labels, Packs")]
        VecDB[("SQLite Vector Store<br/>Embeddings & Metadata")]
        JudgeCache[("Judge Cache<br/>0.65s Cached Q&A Lookups")]
    end

    subgraph Models ["Inference & Grading Models"]
        subgraph LocalModels ["Local (Ollama)"]
            GenLocal["llama3.2:3b<br/>(Target Generator Under Test)"]
            EmbedLocal["nomic-embed-text<br/>(Dense Embeddings)"]
            FallbackJudge["qwen3:8b<br/>(Offline Fallback Judge)"]
        end
        subgraph HostedModels ["Hosted (Groq Cloud)"]
            PrimaryJudge["gpt-oss-120b<br/>(Primary Grading Judge)"]
            SecondaryJudge["qwen3.8-27b<br/>(Cross-Judge Stability)"]
        end
    end

    UI <-->|"HTTP / JSON"| API
    API --> Ingest & Retriever & Generator & Scorer & ReplayEngine & VerdictLogic
    Ingest --> VecDB
    Retriever <--> VecDB
    Scorer <--> JudgeCache
    VerdictLogic --> AppDB

    Generator -.-> GenLocal
    Ingest -.-> EmbedLocal
    Retriever -.-> EmbedLocal
    Scorer -.-> PrimaryJudge
    Scorer -.-> SecondaryJudge
    Scorer -.-> FallbackJudge
    ReplayEngine -.-> GenLocal
```

---

## Features

| Feature / Page | Description | Screenshot Slot |
|---|---|---|
| **Bots Under Test (Live X-Ray)** | Real-time inspection of bot prompts, retrieval chunks, token citations, and answer generation. | `docs/assets/bots.png` |
| **Diagnose** | Deep-dive root-cause explorer showing context relevance, faithfulness, accuracy, and counterfactual replay proofs. | `docs/assets/diagnose.png` |
| **Documents & Question Generator** | Ingest markdown/text documents and automatically generate synthetic ground-truth test Q&A pairs. | `docs/assets/testsets.png` |
| **Change Impact Radar** | Diff two document revisions (e.g. v1 vs v2 policy) and instantly identify stale answers and at-risk questions. | `docs/assets/impact.png` |
| **Full Test Run with Live Progress** | Run batch evaluation suites across packs with live progress streaming, pass rates, and failure tracking. | `docs/assets/runs.png` |
| **Label Studio** | Blind two-person human annotation interface to establish gold standards and measure pipeline vs human agreement. | `docs/assets/labels.png` |
| **Evaluator Trust** | Full statistical transparency: pipeline-vs-human agreement, confusion matrices, and judge-swap stability. | `docs/assets/trust.png` |
| **Compare Versions** | Rigorous version comparison using McNemar paired tests and bootstrap confidence intervals to prove improvements. | `docs/assets/compare.png` |
| **The Seal** | Verifiable trust certificate and embeddable SVG/Markdown badge confirming production RAG reliability. | `docs/assets/seal.png` |
| **Light & Dark Themes** | Seamless theme switching built natively into the application shell for optimal contrast. | *Integrated in UI* |

---

## Evaluation Results & Benchmarks

All benchmark metrics reflect verified experimental results:

### 1. Evaluator Reliability & Human Agreement
* **Human Label Consensus**: **213 answers** independently evaluated by two human labellers.
  * Pipeline vs Human Consensus Agreement: **95.0%**
  * Critical Safety Metric: **0 false passes** ($n = 160$ clean pass cases).
* **Fault Injection Validation**: **54 planted failures** across diverse edge cases:
  * Exact failure type pinpointed: **89%** ($48/54$).
  * Correct pipeline stage isolated (Retriever vs Generator): **96%** ($52/54$).
* **Judge Stability & Swap**:
  * Cross-model judge swap (`qwen3.8-27b` vs `gpt-oss-120b`): **20/20 verdicts identical** ($\kappa = 1.0$).
  * Prompt shuffle invariance: **Score change = 0.0**.
  * Full suite re-score consistency: **211/213 verdicts unchanged**.
* **External Benchmark Validation**:
  * Validated against **RAGTruth** (*Niu et al., ACL 2024*): **Recall: 0.917**, **Precision: 0.733**, **F1: 0.815** ($n = 48$).

### 2. Version Comparison & Impact Radar
* **Real IRS Document Version Compare**:
  * Baseline vs Updated: **70% → 75%** pass rate.
  * 95% Confidence Interval: **[−15, +25] points**.
  * McNemar test significance: **$p = 1.0$** (indicates no statistically meaningful change; 3 fixed, 2 broken).
* **Change Impact (Banking Fee Schedule v1 → v2)**:
  * Detected **5 changed facts** between versions.
  * Flagged **2 answers at immediate risk** of delivering stale information.

### 3. Built-In Industry Packs
| Benchmark Pack | Questions | Pass Rate | Primary Failure Modes Tested |
|---|---|---|---|
| **Banking** | 71 | **86%** | Fee updates, loan terms, distractor accounts |
| **Recruitment** | 71 | **89%** | Candidate qualifications, salary bans, policy traps |
| **Healthcare** | 71 | **93%** | Drug interactions, dosage guidelines, contraindications |
| **Real IRS Documents** | 22 | **72.7%** | Mileage rates & retirement limits across 2025/2026 revisions |
| **RAGSeal Guide** | 14 | **78.6%** | Architecture self-test, taxonomy boundaries, replay mechanics |

### 4. Throughput & Latency
* **Cold Free-Tier API Throughput**: ~8–10 questions/minute on standard free API rate limits.
* **Cached Evaluation Latency**: **0.65 seconds / question** with SQLite judge caching enabled.
* *Honesty Note*: Evaluating 200 questions cold within 15 minutes requires multiple API keys or a dedicated paid tier.

---

## Quickstart

### Prerequisites
* **Python**: 3.11 or newer
* **Node.js**: 18.x or newer
* **Ollama**: Installed and running locally with the required models:
  ```bash
  ollama pull llama3.2:3b
  ollama pull nomic-embed-text
  ollama pull qwen3:8b
  ```

### 1. Backend Setup
1. Create your environment configuration:
   ```bash
   cp .env.example backend/.env
   ```
2. Configure your Groq API key in `backend/.env`:
   ```ini
   GROQ_API_KEY=gsk_your_groq_api_key_here
   # Optional fallback keys for higher concurrency:
   # GROQ_API_KEY_2=gsk_...
   # GROQ_API_KEY_3=gsk_...
   ```
3. Start the FastAPI backend server:
   ```bash
   uvicorn app.main:app --app-dir backend --port 8000
   ```
   *The backend will be available at `http://localhost:8000` (API docs at `http://localhost:8000/docs`).*

### 2. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm ci
npm run dev
```
*Open `http://localhost:5173` in your browser.*

### 3. Demo Credentials
Log in to the dashboard using the pre-configured demo account:
* **Email**: `demo@ragseal.dev`
* **Password**: `demo1234`

---

## Repository Structure

```
├── .github/                       # GitHub issue & PR templates
│   ├── ISSUE_TEMPLATE/            # Bug report and feature request templates
│   └── PULL_REQUEST_TEMPLATE.md   # Standard pull request checklist
├── backend/                       # FastAPI web service & persistence layer
│   ├── app/
│   │   ├── routers/               # Endpoints (/evaluate, /bots, /impact, /trust, /labels)
│   │   ├── database.py            # SQLite database schema & connection management
│   │   └── main.py                # FastAPI application entrypoint
│   └── tests/                     # Backend API & router test suite
├── docs/                          # Architecture guides & specifications
│   ├── assets/                    # UI screenshots and visual assets
│   ├── api_contract.md            # API contracts, metrics schema, & fault taxonomy
│   ├── product_brief.md           # Product philosophy & hackathon deliverables
│   ├── frontend_integration_notes.md # Pack evaluation & batch API integration
│   ├── nvidia_nim_apis.md         # Reference guide for hosted inference & embeddings
│   └── team_tasks_members_3_4.md  # Test packs, human labelling, & pitch task list
├── engine/                        # Core algorithmic evaluation engine
│   ├── compare.py                 # McNemar test & bootstrap confidence interval logic
│   ├── impact.py                  # Document diff & change impact radar engine
│   ├── inject.py                  # Fault injection & synthetic error harness
│   ├── stability.py               # Judge swap & evaluator consistency testing
│   ├── external_validation.py     # RAGTruth benchmark validation harness
│   ├── packs_builtin/             # Built-in packs (Banking, Recruitment, Healthcare, IRS)
│   └── tests/                     # Unit & regression tests for core evaluation engine
├── frontend/                      # React 18 + Vite web application
│   ├── src/
│   │   ├── components/ragseal/    # RAGSeal UI pages (Bots, Diagnose, Impact, Trust, Seal)
│   │   ├── components/ui/         # Primitives and shared UI components
│   │   ├── lib/api.ts             # Typed API client for FastAPI backend
│   │   └── types/ragseal.ts       # Shared TypeScript schemas and interfaces
│   └── package.json               # Node dependencies and build scripts
├── CONTRIBUTING.md                # Development guidelines & PR conventions
└── README.md                      # Repository centerpiece documentation
```

---

## Honesty & Prior Art

* **Prior Art**: RAGSeal builds upon concepts pioneered by frameworks like **Ragas**, **RAGChecker**, **TruLens**, **DeepEval**, and **ARES**.
* **What Makes RAGSeal Distinct**:
  1. **Automated Counterfactual Replay**: Rather than relying purely on LLM heuristic grading, RAGSeal isolates the retriever by re-running the generator with *only* the verified gold chunk to causally prove retriever vs generator fault.
  2. **Inter-Annotator Agreement Grounding**: Transparently benchmarked against double-blind human annotations ($95.0\%$ agreement, 0 false passes).
  3. **Fault-Injection Confusion Matrix**: Rigorously validated with 54 planted failure cases to verify diagnostic accuracy.
  4. **Document Change Impact Radar**: Directly calculates semantic diffs between document versions to prevent regressions before deployment.
* **Benchmark Transparency**: Industry packs (Banking, Recruitment, Healthcare) feature synthetic documents and fictional organizations designed to probe edge cases; the IRS pack uses real, unedited public-domain IRS releases.

---

## Team & Credits

Built with pride by **Team Monster Energy** for **HYPNEXIS'26** (Problem Statement **AI-04**).

* **Vidhaath**: Frontend engineering, interactive diagnostic lab, UI components & architecture presentation
* **Sarthak**: Backend API orchestration, core evaluation engine, counterfactual replay & statistical tests
* **Presentation & Data Team**: Industry test packs, double-blind human labels, and pitch materials

**Contact**: `govidanidarsh@gmail.com`
