# RAGSeal product overview

Excerpt of the RAGSeal product brief (v2): the product sections only.

## Product in one line
RAGSeal is a lab that **proves** why a RAG answer failed: it tests the retriever and the generator apart, then re-runs the generator with the correct evidence to confirm the cause. It ships with industry test packs and runs fully on a laptop.

It has two halves:
1. **A working RAG app**: log in, upload or pick documents, ask questions, get cited answers.
2. **The evaluation lab** around it: synthetic questions with known answers, three scores, a causal verdict per failure, and a dashboard.

## What makes us stand out
1. **Causal verdict by replay.** For each failure we re-run the generator with only the gold chunk (the passage the question was generated from). If the replay is correct, the retriever was at fault. If it is still wrong with perfect evidence, the generator hallucinated. Most tools only score; we run the experiment.
2. **We check our own judge.** 30-50 answers labelled by hand; the dashboard shows how often the judge agrees with humans, with counts.
3. **Industry packs.** The same RAG needs different tests per business. Packs: Recruitment, Banking, Healthcare (fictional documents). Each pack has documents, tricky questions and risk rules.
4. **Trap questions.** Old vs new policy versions (staleness), questions with no answer in the documents (should abstain), distractor documents (noise).
5. **Local-first RAG.** The RAG under test (generator and embeddings) runs on the laptop through Ollama, so documents are indexed and answered locally. The judge runs on Groq by default for speed and quality, and can be switched to fully local.

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
