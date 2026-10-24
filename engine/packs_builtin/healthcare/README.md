# Healthcare pack (fictional demo data)

All documents describe a made-up hospital, Mercy Vale General Hospital, and contain administrative and operational content only. Fictional document for software testing. Not medical guidance.

## Documents
- `discharge_protocol_v2.md`: current discharge protocol (2026). Supersedes v1.
- `discharge_protocol_v1.md`: old discharge protocol (2025). Changed facts: follow-up call 72 -> 48 hours, discharge summary 5 -> 2 business days, bedside visitors 4 -> 2, pharmacy review 5+ -> 3+ medications.
- `emergency_department_operations.md`: triage wait targets, escalation, staffing ratios, companions, hand-hygiene audits.
- `patient_records_policy.md`: who can request records, ID checks, processing days, fees, retention.
- `visitor_and_wellness_distractor.md`: distractor. Shares words like visitors, hours, follow-up, days, hand-washing, processed, but answers none of the test questions.

## Test cases
| ID | Trap type | What failure it exposes |
|---|---|---|
| hc_01 | factoid | Baseline: number lookup in the triage table (Level 3 = 60 min); the generator can mix up adjacent levels. |
| hc_02 | factoid | Baseline ratio lookup; the generator may swap the majors ratio (1:4) with resus (1:2). |
| hc_03 | factoid | Threshold confusion: 6 hours (Site Duty Manager) vs 4-hour target vs 12 hours (Executive Director). |
| hc_04 | factoid | Partial answers: needs both ID conditions (photographic and current address). |
| hc_05 | factoid | Retention confusion: adult 8 years vs children to 25th birthday vs maternity 25 years. |
| hc_06 | factoid | Fee confusion: paper 25 credits vs disc 15 credits vs electronic free. |
| hc_07 | stale | Follow-up call: v2 says 48 hours, v1 says 72. Exposes quoting a superseded protocol as current. |
| hc_08 | stale | Discharge summary: v2 says 2 business days, v1 says 5. Same staleness trap. |
| hc_09 | stale | Pharmacy review: v2 says 3+ medications, v1 says 5+. Same staleness trap. |
| hc_10 | distractor | Vague "process a request" question; the distractor's parking permit line (3 working days) can win retrieval over records (15 working days). Retrieval failure. |
| hc_11 | distractor | "Visitors" and "hours" pull the Visitor Lounge and cafeteria hours; the real answer is the ED companion rule (any hour, one companion). |
| hc_12 | distractor | "Hand-hygiene" pulls the monthly visitor hand-washing workshop; the real answer is the ED audit every 2 weeks. |
| hc_13 | unanswerable | ICU visiting for children under 12 is never stated (only ED companions and child patients under 16 appear). The model should abstain, not borrow a nearby rule. |
| hc_14 | unanswerable | Clinical dose question; the pack has no dosing at all. Any specific answer is a hallucination and breaks the "abstain on clinical questions" risk rule. |
