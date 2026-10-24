# Jobs for Members 3 and 4

Read `docs/product_brief.md` first (15 minutes). It explains what RAGSeal is and why each piece exists.

| | Member 3: Data and labels | Member 4: Pitch, demo and QA |
|---|---|---|
| Main output | 3 industry packs in `docs/packs/` + human labels | PPT deck, demo script, QA checklist |
| Deadline | Recruitment pack by 8:30 PM, Banking and Healthcare by 10:30 PM, labels by 12:30 AM | Deck draft by 11 PM, final by 2:30 AM |
| Branch | `team/presentation-docs` | `team/presentation-docs` |

Only edit `docs/packs/`, `docs/pitch/` and your own files. Never edit `/engine`, `/backend` or `/frontend`. Push to the branch; don't push to `main`.

---

## Member 3: Industry packs (the test data)

Each pack is one folder. The engine loads it automatically, and the format below must be followed exactly or the loader rejects the pack.

```
docs/packs/
  recruitment/
    pack.json
    job_description_v1.md
    job_description_v2.md
    ...
  banking/
  healthcare/
```

### Documents (about 5 per pack, all fictional)
Write them as Markdown. Each one should be 1-2 pages of realistic, specific detail: numbers, dates, names of fictional companies. Mark every document "FICTIONAL DEMO DATA" at the top. No real people, real companies or real patient data.

| Pack | Documents |
|---|---|
| Recruitment | Job description v1 (old, says 5 years experience), job description v2 (approved, says 3 years), 2-3 fictional resumes (C-001, C-002, C-003), hiring policy, one distractor (e.g. office travel policy) |
| Banking | Fee schedule v1 (old fees), fee schedule v2 (current fees), savings account terms, internal complaints procedure, one distractor (e.g. branch opening hours) |
| Healthcare | Fictional hospital discharge protocol v1 and v2, medication reconciliation guide, visitor policy, one distractor |

Each pack needs one document that has an old version and a new version where **one specific value changed** (a fee, a year count, a dosage interval). That's our stale-version trap.

### pack.json
```json
{
  "pack_id": "banking",
  "name": "Banking",
  "description": "Fictional retail bank: fee schedules, account terms, procedures.",
  "demo_data": true,
  "documents": [
    {"file": "fee_schedule_v2.md"},
    {"file": "fee_schedule_v1.md", "superseded_by": "fee_schedule_v2.md"},
    {"file": "savings_terms.md"},
    {"file": "complaints_procedure.md"},
    {"file": "branch_hours.md"}
  ],
  "risk_rules": ["Never quote a superseded fee as current."],
  "test_cases": [
    {
      "test_id": "bank_01",
      "question": "What is the monthly maintenance fee for a Basic Savings account?",
      "ground_truth_answer": "Rs 50 per month.",
      "type": "stale",
      "gold":  [{"file": "fee_schedule_v2.md", "quote": "The Basic Savings monthly maintenance fee is Rs 50."}],
      "stale": [{"file": "fee_schedule_v1.md", "quote": "The Basic Savings monthly maintenance fee is Rs 75."}]
    }
  ]
}
```

Rules:
- `quote` must be copied **exactly** from the document, one full sentence. The engine finds the chunk by searching for that text, and fails if it isn't found.
- `pack_id` must be `recruitment`, `banking` or `healthcare`. `test_id` looks like `bank_01`, `rec_01`, `hc_01`.
- `stale` is only for `type: "stale"` cases.
- For `unanswerable`, leave `gold` as `[]`. Set `ground_truth_answer` to "Not stated in the documents."

### Test cases (12-15 per pack)
| Type | How many | What it is |
|---|---|---|
| `factoid` | 6-8 | Normal question; the answer is one sentence in one document |
| `stale` | 2 | Answer differs between the old and new version; ground truth uses the new one |
| `unanswerable` | 2 | Sounds plausible, but no document answers it. The model should say it doesn't know |
| `distractor` | 2 | The answer is in the right doc, but the distractor doc has similar wording |

Questions should sound like a real employee or customer, e.g. "Does a candidate with 4 years of experience qualify?" or "Is a follow-up call required after discharge?"

Validate the JSON (paste it into jsonlint.com) before pushing.

### Human labels (after the app runs, around 11 PM)
The judge's agreement with humans is one of our differentiators, and it needs real labels.
1. Ask Sarthak to run a batch on each pack. You'll get answers from the app.
2. For 30-50 answers total, decide by hand: is this answer **correct** or **incorrect** compared with the ground truth? Judge strictly. A partly wrong answer is incorrect.
3. Save them to `docs/packs/<pack>/labels.json`:
```json
[
  {"test_id": "bank_03", "question": "...", "ground_truth": "...", "answer": "exact answer the app gave",
   "label": "correct", "labeller": "AB", "pack_id": "banking"}
]
```
Both members should label, and never look at the judge's verdict before labelling, or the comparison is meaningless.

---

## Member 4: Pitch deck, demo script and QA

### Deck (8-10 slides, 3 AM Round 1)
| # | Slide | Content |
|---|---|---|
| 1 | Title | RAGSeal: we prove why your RAG answer failed. Team names. |
| 2 | Problem | RAG answers can be wrong for two very different reasons: wrong evidence retrieved, or the model ignoring good evidence. Teams can't tell which. |
| 3 | Why it matters | The industry table: recruitment, banking, healthcare. Same RAG, different risks (stale fees, invented experience, unsupported guidance). |
| 4 | Our approach | The hero pipeline diagram: documents, synthetic questions, retriever, generator, judge, **replay with the correct chunk**, verdict. The replay branch in a different colour. |
| 5 | The verdict logic | Simple version of the verdict table: retrieved the right chunk? answer supported? replay fixed it? Then the verdict. |
| 6 | Live demo | Just a title. Switch to the app. |
| 7 | Results | Real numbers only, from our actual runs: verdict breakdown per pack, judge-vs-human agreement with count (e.g. "86% on 30 labels"). Fill in at 1-2 AM. |
| 8 | What's different | Honest positioning: tools like Ragas and TruLens score; we combine scoring, a replay experiment and judge accountability into one verdict per failure, with industry packs, running locally. |
| 9 | Next steps | Plug into a company's existing RAG, more packs, CI integration. |

The pipeline diagram will be exported from the app's "How it works" tab; ask Vidhaath for a PNG. Until then, draw a placeholder.

Never put a number on a slide that didn't come from our app. If a result isn't ready, the slide says "measured live in demo".

### Demo script (3-4 minutes, written word for word)
1. Log in with the demo account. Select the Banking pack. (15 s)
2. Ask: "What is the monthly fee for Basic Savings?" Show the answer beside the retrieved chunks. (30 s)
3. Run the batch on the pack. While it runs, explain the four scores. (45 s)
4. Open one RETRIEVAL_FAILURE: show the gold chunk missing, then the replay answer fixing it. **This is the key moment**, so slow down. (45 s)
5. Open one GENERATION_HALLUCINATION: the right chunk was there but the answer invented something. (30 s)
6. Show the judge-vs-human agreement. (15 s)
7. Flip to "How it works" and scroll through the pipeline. (20 s)

Also prepare answers to likely judge questions:
- How is this different from Ragas or TruLens?
- How do you know the judge is right?
- Why a small generator model?
- Can a company plug in its own RAG?
- What happens without internet?

### QA checklist (run at 11 PM and again at 1 AM)
Test on a fresh browser and write down every failure with a screenshot:
- Register, log in, log out, demo login
- Upload a PDF, a TXT and an MD file; delete one
- Load each pack; ask a question; evaluate it
- Generate synthetic questions; run a batch; open each verdict type
- History shows past runs after logging out and back in
- What does the app show when the backend is off? When there's no ground truth?
- Projector check: readable from 3 metres?

Send failures to Sarthak (backend/engine) or Vidhaath (frontend).

### Backup
By 2 AM, record a 3-minute screen video of the full demo in case the live demo fails.
