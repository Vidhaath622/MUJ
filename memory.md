# Project Memory & Context Tracker

> **Notice**: This file serves as persistent memory across context resets, compactions, and new sessions. Keep this document updated after major architectural decisions, feature implementations, and milestone completions.

---

## 1. Project Overview
- **Event**: **HYPNEXIS'26** (Manipal University Jaipur)
- **Dates**: 24th – 25th October 2026
- **Repository**: [Vidhaath622/MUJ](https://github.com/Vidhaath622/MUJ)
- **Local Path**: `/Users/root1/hackathon`
- **Remote URL**: `https://github.com/Vidhaath622/MUJ.git`
- **Default Branch**: `main`
- **Selected Problem Statement**: **AI-04: RAG Evaluation Pipeline — Retriever and Generator Tested Apart**
- **Track**: AI & Machine Learning
- **Core Mission**: Build an automated pipeline that evaluates a Retrieval-Augmented Generation (RAG) system by decoupling retrieval from generation, pinpointing whether bad answers stem from poor chunk retrieval or LLM hallucination.

### 4 Mandatory Deliverables:
1. **Scoring Backend**: Context Relevance, Faithfulness / Groundedness, and Answer Accuracy / Correctness.
2. **Synthetic Test-Question Generator**: Automatically generate question-answer-context triples from uploaded docs.
3. **Automated Root-Cause Diagnosis**: Classify failures into `RETRIEVAL_FAILURE` vs `GENERATION_HALLUCINATION` vs `PARTIAL_CONTEXT_MISMATCH`.
4. **Clean Single-Screen Dashboard**: Document uploader, live query tester, side-by-side retrieved chunk vs answer comparison, and color-coded scorecards (green for accurate, red for hallucinated/missing).

---

## 2. Official Event Timeline (HYPNEXIS'26)

### Day 1 — 24th October
- **10:00 AM – 11:30 AM**: Opening Ceremony
- **11:30 AM – 12:30 PM**: 🔴 **Problem Statement Release** *(CURRENT STAGE)*
- **12:30 PM – 2:00 PM**: Lunch Break & Strategy Alignment
- **2:00 PM – 5:30 PM**: **Round 1: Problem Solving** (Scaffolding & Core MVP dev)
- **5:30 PM – 6:15 PM**: Hi-Tea Break
- **6:15 PM – 8:15 PM**: ⚠️ **Additional Problem Statement Release & Problem Solving** *(Expect surprise requirement/twist)*
- **8:15 PM – 9:30 PM**: Dinner Break
- **9:30 PM – 3:00 AM**: **Mentorship & Overnight Project Development**

### Day 2 — 25th October
- **3:00 AM – 6:00 AM**: 🚨 **ROUND 1 EVALUATION: PPT, Prototype & Presentation** *(HARD DEADLINE)*
- **6:00 AM – 6:30 AM**: Evaluation & Shortlisting
- **6:30 AM**: Round 2 Shortlist Announcement
- **6:30 AM – 10:00 AM**: Break, Breakfast & Project Refinement
- **10:00 AM – 11:30 AM**: Round 2 Mentorship
- **11:30 AM – 2:00 PM**: Round 2 Presentations
- **2:00 PM – 2:30 PM**: Final Evaluation & Deliberation
- **2:30 PM**: Top 12 Teams Announced
- **2:30 PM – 3:00 PM**: Final Preparations
- **3:00 PM – 4:30 PM**: Final Round Presentations
- **4:30 PM – 6:00 PM**: Closing Ceremony & Winner Announcement

---

## 3. Team Structure & AI Agent Workflow

| Member | Focus Area | Tools / AI Setup | Dedicated Workspace / Directory | Git Branch |
| :--- | :--- | :--- | :--- | :--- |
| **Member 1 (Vidhaath)** | Frontend UI & Interactive Visuals | **Antigravity** | `/frontend` | `vidhaath/ui-frontend` |
| **Member 2 (Sarthak) - Track A** | Backend API, Routing & Storage | **Claude Agent 1** | `/backend` | `sarthak/backend-api` |
| **Member 2 (Sarthak) - Track B** | Core Engine, ML Logic & Algorithms | **Claude Agent 2** | `/engine` (or `/core`) | `sarthak/core-engine` |
| **Member 3 & 4** | PPT Pitch Deck, Datasets, QA & Pitch | Slides, Docs, Postman | `/docs` | `team/presentation-docs` |

### Why This Setup Maximizes Hackathon Speed:
- **Zero File Overlap**: Antigravity never touches `/backend` or `/engine`; Claude never touches `/frontend`. Git merges are 100% clean.
- **Member 2 Parallelism**: Member 2 runs two terminal sessions/instances of Claude—one writing APIs, the other writing core algorithms.
- **Human Presentation Moat**: Members 3 & 4 ensure the 3:00 AM PPT deck and demo script are polished while developers code continuously.

---

## 4. Tech Stack & Architecture Decisions
- **Frontend (`/frontend`)**: React 18 / Vite + TypeScript + Tailwind CSS + Lucide Icons + Recharts (Single-screen dashboard, side-by-side inspection, interactive scorecard badges).
- **Backend (`/backend`)**: Python FastAPI + Pydantic (Async endpoints, file upload handling, test execution orchestrator, JSON/SQLite storage for evaluation runs).
- **Evaluation Engine (`/engine`)**: Python module (Context Relevance evaluator, Faithfulness/Hallucination NLI detector, Answer Accuracy evaluator, Synthetic Q&A generator).
- **Shared API Contract**: Defined in `docs/api_contract.md`.
- **Demo Packaging**: Local runner or Docker compose + sample test documents with pre-baked tricky hallucination cases for the live demo.

---

## 5. Progress & Milestones

### Completed
- [x] Initialized and verified Git repository connection (`origin/main`).
- [x] Created `memory.md` persistent context tracker for long-term memory across sessions.
- [x] Researched official HYPNEXIS'26 website and captured all 15 problem statements.
- [x] Configured team structure with Member 2 running dual Claude agents + Antigravity on frontend.
- [x] **Locked Problem Statement: AI-04 (RAG Evaluation Pipeline)**.

### In Progress / Next Up (Sprint 1: 1:00 PM – 5:30 PM)
- [ ] Create `docs/api_contract.md` defining request/response schemas for `/frontend` and `/backend`.
- [ ] Scaffold `/frontend` with mock data to build the single-screen dashboard immediately.
- [ ] Member 2 (Claude 1) scaffolds `/backend` (FastAPI endpoints).
- [ ] Member 2 (Claude 2) scaffolds `/engine` (Evaluation metrics + synthetic question generator).
- [ ] Merge checkpoint at 5:15 PM before Hi-Tea.
- [ ] Incorporate 6:15 PM "Additional Problem Statement" twist.
- [ ] 1:30 AM Hard Code Freeze $\rightarrow$ 3:00 AM Evaluation (PPT + Prototype).

---

## 6. Key Work Log & Session History

| Timestamp | Phase / Action | Details |
| :--- | :--- | :--- |
| `2026-10-24 11:07` | Workspace Setup | Verified git configuration for repo `https://github.com/Vidhaath622/MUJ`. |
| `2026-10-24 11:17` | Persistent Memory | Created `memory.md` to persist project decisions, architecture, and task state. |
| `2026-10-24 11:43` | Schedule Logged | Captured HYPNEXIS'26 official schedule into memory. Identified 3:00 AM R1 evaluation deadline and 6:15 PM surprise problem release. |
| `2026-10-24 12:00` | Problem Statements Fetched | Parsed all 15 official problem statements across 6 tracks directly from `hypnexismuj.com`. |
| `2026-10-24 12:28` | Team Role Matrix | Structured dual-Claude allocation for Member 2 + Antigravity for Member 1. |
| `2026-10-24 12:52` | Track Selection | Team selected **AI-04: RAG Evaluation Pipeline**. Updated roadmap & tech stack. |
| `2026-10-24 16:42` | Frontend Library Scaffolding | Created comprehensive AI-04 component library in `/frontend` inspired by 19 reference design systems (shadcn, Untitled UI, Magic UI, HeroUI, Kibo UI, etc.). Live showcase on `http://localhost:5173`. |
| `2026-10-24 17:13` | Sync with Sarthak | Merged `origin/sarthak/docs-brief` incorporating `docs/product_brief.md` (RAGSeal product brief, ATS demo domain, honesty rules, frontend deliverables). |
| `2026-10-24 17:26` | RAGSeal Dashboard Complete | Built full production RAGSeal frontend matching all 4 official deliverables + extensions: Single-Screen Trace Inspector, Color-Coded Scorecards, Decoupled Root-Cause Panel, Side-by-Side Trace with inline hallucination highlights, Recharts failure distribution, Corpus Vault, and Synthetic Question Generator. Built cleanly with zero TypeScript errors. |
| `2026-10-24 17:31` | Component Library Strict Enforcement | Refactored dashboard to strictly utilize the component library primitives directly (`PromptBox`, `MetricCard`, `DiffViewer`, `EvaluationTable`, `DiagnosticBadge`, `FileDropzone`). Purged redundant ad-hoc elements. |
| `2026-10-24 17:34` | NVIDIA NIM APIs Configured | Catalogs, integration guides (`docs/nvidia_nim_apis.md`), `.env.example`, and Python engine client (`engine/nvidia_client.py`) created for Sarthak's Claude from `build.nvidia.com/models`. Enables sub-second hosted inference for target generator (`meta/llama-3.2-3b-instruct`), evaluation judge (`meta/llama-3.3-70b-instruct` / `deepseek-ai/deepseek-r1`), and NeMo Retriever embeddings (`nvidia/nv-embedqa-e5-v5`). |

---

## 7. Agent Instructions for Context Resets
When starting a new session or after context window compaction:
1. Read [memory.md](file:///Users/root1/hackathon/memory.md) immediately to restore state, active tasks, and tech stack details.
2. Review `git status` and recent commits to understand workspace state.
3. Update this file whenever completing a milestone or changing architecture decisions.
