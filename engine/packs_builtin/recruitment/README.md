# Recruitment pack (demo data)

Fictional documents for a made-up company, Northwind Talent Co. No real people or companies.

## Documents
- `hiring_policy_v2.md`: current hiring policy, effective 1 January 2026. It supersedes v1.
- `hiring_policy_v1.md`: old hiring policy, effective 2025. It is marked `superseded_by` v2 in `pack.json`.
- `job_description_senior_data_analyst.md`: requirements, salary band, hybrid rules, interview stages.
- `recruiter_guide.md`: screening SLA, notice periods, scorecards, questions recruiters must not ask.
- `benefits_overview_distractor.md`: distractor. It covers employee benefits and uses the same words ("bonus", "relocation", "notice period", "years") but answers different questions.

Facts changed from v1 to v2: senior experience (5 to 3 years), referral bonus ($2,000 to $3,000), background-check window (10 to 7 business days), offer expiry (7 to 5 calendar days).

## Cases
| ID | Trap type | Failure it is designed to expose |
|---|---|---|
| rec_01 | factoid | Baseline: salary band in one sentence. Invented or rounded figures show up as generation errors. |
| rec_02 | factoid | Two conditions in one sentence (3 days, Tuesday mandatory). Catches partial answers. |
| rec_03 | factoid | Simple SLA number (3 business days). Baseline retrieval check. |
| rec_04 | factoid | Scorecard deadline (24 hours). Baseline. |
| rec_05 | factoid | List answer (forbidden topics). Catches dropped or invented list items. |
| rec_06 | factoid | Two facts from one chunk (48-hour take-home, 60-minute panel). Catches answers that give only one. |
| rec_07 | stale | Experience 3 years (v2) vs 5 years (v1). Retrieval may rank the v1 chunk first; the generator may quote it as current. |
| rec_08 | stale | Referral bonus $3,000 (v2) vs $2,000 (v1). |
| rec_09 | stale | Offer expiry 5 days (v2) vs 7 days (v1). |
| rec_10 | unanswerable | Visa sponsorship is never mentioned. The model should abstain, not guess. |
| rec_11 | unanswerable | Parental leave is never mentioned; the benefits doc's annual leave rules tempt a made-up answer. |
| rec_12 | distractor | New-hire joining bonus $4,000 (JD) vs the $6,000 relocation allowance for current employees (benefits doc). |
| rec_13 | distractor | Candidate notice period over 60 days needs approval (recruiter guide) vs resignation notice 30/90 days (benefits doc). |
| rec_14 | distractor | Referral bonus ineligibility (recruiting team) vs annual bonus ineligibility (joined within 3 months). |
