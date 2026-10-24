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
- **Current Objective**: Select problem statement, establish team architecture/split, build Round 1 prototype & pitch deck.

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
*(To be populated once finalized with the user)*
- **Frontend**: TBD
- **Backend**: TBD
- **Database / Storage**: TBD
- **AI / External APIs**: TBD
- **Deployment / Hosting**: TBD

---

## 5. Progress & Milestones

### Completed
- [x] Initialized and verified Git repository connection (`origin/main`).
- [x] Created `memory.md` persistent context tracker for long-term memory across sessions.
- [x] Researched official HYPNEXIS'26 website and captured all 15 problem statements.
- [x] Configured team structure with Member 2 running dual Claude agents + Antigravity on frontend.

### In Progress / Next Up
- [ ] Select final problem statement during lunch break (Recommend `AI-03` or `HM-02`).
- [ ] Write `docs/api_contract.md` defining data schemas so all 3 agents can code in parallel.
- [ ] Scaffold `/frontend`, `/backend`, and `/engine` directories.
- [ ] Hit 5:15 PM first integration checkpoint.

---

## 6. Key Work Log & Session History

| Timestamp | Phase / Action | Details |
| :--- | :--- | :--- |
| `2026-10-24 11:07` | Workspace Setup | Verified git configuration for repo `https://github.com/Vidhaath622/MUJ`. |
| `2026-10-24 11:17` | Persistent Memory | Created `memory.md` to persist project decisions, architecture, and task state. |
| `2026-10-24 11:43` | Schedule Logged | Captured HYPNEXIS'26 official schedule into memory. Identified 3:00 AM R1 evaluation deadline and 6:15 PM surprise problem release. |
| `2026-10-24 12:00` | Problem Statements Fetched | Parsed all 15 official problem statements across 6 tracks directly from `hypnexismuj.com`. |
| `2026-10-24 12:28` | Team Role Matrix | Structured dual-Claude allocation for Member 2 + Antigravity for Member 1. |

---

## 7. Agent Instructions for Context Resets
When starting a new session or after context window compaction:
1. Read [memory.md](file:///Users/root1/hackathon/memory.md) immediately to restore state, active tasks, and tech stack details.
2. Review `git status` and recent commits to understand workspace state.
3. Update this file whenever completing a milestone or changing architecture decisions.
