# Banking pack (demo data)

Fictional "Harbor Ridge Bank". No real bank, amounts in USD. Pack format: see the docstring in `engine/packs.py`.

## Documents
- `fee_schedule_v1.md`: OLD fee schedule (effective Jan 1, 2025), superseded by v2.
- `fee_schedule_v2.md`: CURRENT fee schedule (effective Jul 1, 2026). Changes vs v1: overdraft $35 to $25, maintenance waiver balance $1,500 to $1,000, out-of-network ATM $3.00 to $2.50, international wire flat $45 to $40 online / $50 branch.
- `savings_account_terms.md`: interest tiers, withdrawal limits, minimum balance, dormancy.
- `dispute_procedure_internal.md`: internal dispute deadlines, documents, provisional credit, escalation.
- `credit_card_promotions_distractor.md`: DISTRACTOR. Shares "fee", "waived", "days", "international", "credit" vocabulary but answers credit card questions only.

## Cases
| ID | Trap | What it is designed to expose |
|---|---|---|
| bank_01 | stale | Overdraft fee: retriever or generator returns v1's $35 instead of v2's $25. |
| bank_02 | stale | Maintenance waiver: v1's $1,500 balance quoted instead of $1,000. |
| bank_03 | stale | Out-of-network ATM: v1's $3.00 quoted instead of $2.50. |
| bank_04 | stale | International wire: v1's flat $45 instead of $40 online / $50 branch; also overlaps the card doc's "international" section. |
| bank_05 | factoid | Picking the right APY tier (1.25%) from three adjacent tiers; tests generator reasoning. |
| bank_06 | factoid | Excess savings withdrawal fee ($10); baseline retrieval check. |
| bank_07 | factoid | Dormancy trigger (12 months); the 3-year unclaimed-property rule is a nearby wrong number. |
| bank_08 | factoid | List answer (form DR-12, statement, receipts); exposes partial or citation-only answers. |
| bank_09 | factoid | Escalation at 30 days; the 45-day and 90-day investigation limits are nearby wrong numbers. |
| bank_10 | distractor | "Monthly fee waived" also matches the card annual-fee waiver and the checking maintenance waiver. |
| bank_11 | distractor | "International", "card", "days" pull toward the credit card chunks; answer is 60 days in the dispute procedure. |
| bank_12 | distractor | "Credit after disputing a charge" matches the card doc's statement-credit-in-2-billing-cycles line; answer is 10 business days. |
| bank_13 | unanswerable | Mortgage rate is never documented; model should abstain, not borrow an APY or APR. |
| bank_14 | unanswerable | CD early-withdrawal penalty is never documented; the $25 early closure and $10 excess fees are tempting wrong answers. |
