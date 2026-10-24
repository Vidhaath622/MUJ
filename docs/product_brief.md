# RAGSeal Product Brief (AI-04)

Condensed from the team alignment brief. Read this together with `memory.md` (team, timeline, stack) and `docs/api_contract.md` (API shapes). Anyone's AI tool can use this file.

## Product in one line
RAGSeal tests whether a RAG app retrieved the right evidence, used it correctly and produced a supportable answer, and explains what failed and why. It is the QA layer around a RAG system, not a chatbot.

## Scope rule
The four official deliverables come first and must stay visible in the demo:
1. Scoring backend: context relevance, faithfulness, answer accuracy
2. Synthetic test-question generator from uploaded documents
3. Automated root-cause report for each failure
4. Single-screen dashboard (upload or query, retrieved text beside the answer, green/red scorecards)

Extras (ATS pack, local model, evaluator health, release gate, flow diagram) only come after the core flow works end to end. If it isn't working by about 9 PM, cut extras.

## Honesty rules (judges will probe)
- Every number on screen must come from the backend. No fake counters, scores or latency. Use empty states before a run.
- Label demo/seeded data as demo data, and label model-judged scores as model-judged.
- Always show sample counts next to metrics.
- Don't claim we invented RAG diagnosis, fault injection or synthetic question generation. Related work: RAGChecker, Ragas, RAGEval, SafeRAG. Our angle is the combination: component-separated scoring, evidence-linked root cause, and measuring our own evaluator against human-checked labels.
- Don't call output "100% safe" or "hallucination-free".

## Demo domain
Synthetic recruitment / ATS data (fictional resumes, two job descriptions, hiring policy v1 and v2 with one changed value, a recruiter guide, a distractor document). It is a demo domain only; we don't build an ATS and we don't rank candidates or infer personal traits.

Starter questions:
1. What is the required experience threshold in the currently approved job description?
2. Which required skills are documented in candidate C-002's resume? Cite the text.
3. Does the resume document the required certification? If not, say it isn't documented.
4. Old policy says five years, approved new version says three. Which should the answer use?
5. The answer cites an unrelated source. Does that source support the claim?

## Failure types the test set should cover
| Case | Setup | Expected diagnosis |
|---|---|---|
| Healthy | Right chunk retrieved, answer follows it | CLEAN_PASS |
| Retrieval miss | Needed passage exists but isn't retrieved | RETRIEVAL_FAILURE |
| Generation failure | Right chunk retrieved, answer contradicts it | GENERATION_HALLUCINATION |
| Both fail | Wrong chunks and unsupported answer | COMPOUND_FAILURE |
| Missing evidence | Info isn't in the documents | Answer should abstain ("not documented") |
| Conflicting versions | Old and new policy disagree | Answer must use the approved version |
| Citation mismatch | Answer cites a source that doesn't support it | Flag even if the claim is true elsewhere |

Aim for 20-30 carefully checked cases. A removed chunk only proves a retrieval fault if we also compare the corpus and the original ranked results, so the root-cause text must not overstate what the trace proves.

## Division of work
| Area | Owner | Folder |
|---|---|---|
| Frontend: dashboard, trace inspector, release report | Vidhaath (Antigravity) | `/frontend` |
| Backend API, storage | Sarthak, Claude 1 | `/backend` |
| Core engine: metrics, root cause, question generator | Sarthak, Claude 2 | `/engine` |
| Datasets, pitch deck, QA, demo script | Members 3 and 4 | `/docs` |

Nobody edits another owner's folder. Contract changes go through `docs/api_contract.md` in a PR, announced to the team.

## Frontend job (for the frontend owner and their AI)
Build against `docs/api_contract.md` with mock data first, then switch to the live backend. The frontend only displays results; it never calls a model directly and never computes scores.

Must-have, in this order:
1. **Single-screen dashboard**: document upload, a live query box, and a "generate test questions / run batch" action.
2. **Side-by-side trace view**: retrieved chunks (text, relevance, relevant flag) next to the generated answer and ground truth.
3. **Colour-coded scorecards** for the three metrics: green = PASS, red = FAIL (amber only if the backend sends an uncertain status), each with its `details` text.
4. **Root-cause panel**: category badge, summary, recommended action, hallucinated claims highlighted.
5. **Batch summary**: aggregates, pass rate, root-cause breakdown chart (Recharts), clickable rows that open the trace.

Nice-to-have, only if time allows: release verdict (SHIP / REVIEW / BLOCK) with the rule that fired, evaluator health table, pipeline flow diagram, export report.

Design: dark graphite or navy, crisp white type, teal accent, clear red/amber/green. Readable to a judge standing beside the laptop. Show explicit loading, error and empty states, including "local model unavailable, using fallback mode".

## Contract extensions being proposed (backend will add; frontend can mock now)
These add fields to existing responses. They don't break the current contract.
- `ground_truth_chunk_ids` and `retrieved_chunk_ids` per evaluation, so the dashboard can show whether the right chunk was retrieved.
- `evaluation_mode`: `"llm"` or `"fallback"`, so the UI can show which scoring path ran.
- `judged_by`: `"model"` or `"rule"` on each metric, for the honesty labels.
- `release`: `{ "decision": "SHIP" | "REVIEW" | "BLOCK", "rule": "...", "evidence": [...] }` on batch results (optional, extras tier).

Backend will announce each addition in `docs/api_contract.md` before it ships.

## Timeline reminders
- 5:15 PM merge checkpoint
- 6:15 PM surprise additional problem statement
- 1:30 AM hard code freeze
- 3:00 AM Round 1 evaluation (PPT and prototype)
