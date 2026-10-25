# Synthetic questions held back for a human spot-check

19 of 193 automatically validated synthetic questions (a seeded 10%) are NOT in any pack.
Check each: is the question clear, is the answer correct and complete, does the quote support it? Mark it OK or wrong; the wrong-rate estimates the error rate of the synthetic questions that are in the packs.

## 1. How many tax provisions received annual inflation adjustments for tax year 2026?
- Answer: more than 60
- Quote (irs_tax_inflation_2026_IR-2025-103.md): "the tax year 2026 annual inflation adjustments for more than 60 tax provisions"
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 2. In tax year 2026, what is the Alternative Minimum Tax exemption amount for unmarried individuals?
- Answer: $90,100
- Quote (irs_tax_inflation_2026_IR-2025-103.md): "For tax year 2026, the exemption amount for unmarried individuals is $90,100 and begins to phase out at $500,000 ($140,200 for married couples filing jointly for whom the exemption begins to phase out at $1,000,000)."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 3. In tax year 2026, what is the income threshold for the 35% tax bracket for single individuals?
- Answer: $256,225
- Quote (irs_tax_inflation_2026_IR-2025-103.md): "35% for incomes over $256,225 ($512,450 for married couples filing jointly);"
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 4. For tax year 2026, what is the MAGI range for phase-out of the Lifetime Learning Credit for single filers?
- Answer: $80,000 and $90,000
- Quote (irs_tax_inflation_2026_IR-2025-103.md): "The Lifetime Learning Credit is phased out for taxpayers with MAGI between $80,000 and $90,000 ($160,000 and $180,000 for joint returns)."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 5. For tax year 2025, what is the standard deduction for single taxpayers?
- Answer: $15,000
- Quote (irs_tax_inflation_2025_IR-2024-273.md): "For single taxpayers and married individuals filing separately for tax year 2025, the standard deduction rises to $15,000 for 2025, an increase of $400 from 2024."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 6. What is the catch-up contribution limit for employees aged 50 and over in 2026?
- Answer: $8,000
- Quote (irs_retirement_limits_2026_IR-2025-111.md): "The catch-up contribution limit that generally applies for employees aged 50 and over who participate in most 401(k), 403(b), governmental 457 plans, and the federal government’s Thrift Savings Plan is increased to $8,000, up from $7,500 for 2025."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 7. What is the phase‑out range for single taxpayers covered by a workplace retirement plan in 2026?
- Answer: $81,000 to $91,000
- Quote (irs_retirement_limits_2026_IR-2025-111.md): "For single taxpayers covered by a workplace retirement plan, the phase-out range is increased to between $81,000 and $91,000, up from between $79,000 and $89,000 for 2025."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 8. What is the higher catch-up contribution limit for employees aged 60 to 63 in SIMPLE plans for 2026?
- Answer: $5,250
- Quote (irs_retirement_limits_2026_IR-2025-111.md): "a higher catch-up contribution limit applies for employees aged 60, 61, 62 and 63 who participate in SIMPLE plans, which remains $5,250."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 9. What is the income phase-out range for a married individual filing a separate return who contributes to a Roth IRA in 2025?
- Answer: $0 to $10,000
- Quote (irs_retirement_limits_2025_IR-2024-285.md): "The phase-out range for a married individual filing a separate return who makes contributions to a Roth IRA is not subject to an annual cost-of-living adjustment and remains between $0 and $10,000."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 10. In the 2026 edition, what does Notice-2026-10 PDF contain regarding mileage rates?
- Answer: the optional 2026 standard mileage rates
- Quote (irs_mileage_rates_2026_IR-2025-128.md): "Notice-2026-10 PDF contains the optional 2026 standard mileage rates, as well as the maximum automobile cost used to calculate mileage reimbursement allowances under a fixed-and variable rate plan."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 11. In 2025, what does Notice 2025-5 PDF contain regarding standard mileage rates?
- Answer: the optional 2025 standard mileage rates
- Quote (irs_mileage_rates_2025_IR-2024-312.md): "Notice 2025-5 PDF contains the optional 2025 standard mileage rates, as well as the maximum automobile cost used to calculate mileage reimbursement allowances under a fixed-and variable rate (FAVR) plan."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 12. In the verdict logic table, when the gold chunk is retrieved and the answer is faithful to context, what verdict is assigned?
- Answer: `CLEAN_PASS`
- Quote (ragseal_overview.md): "| Yes | Yes, and correct | not needed | `CLEAN_PASS` |"
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 13. In the RAGSeal system, what is the pass threshold for context relevance?
- Answer: 0.70
- Quote (ragseal_how_it_works.md): "The pass thresholds are 0.70 for context relevance, 0.75 for faithfulness and 0.70 for answer accuracy."
- Would go to pack: synthetic_public | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 14. What is the standard deduction amount available for salaried individuals under the new tax regime for financial year 2025–26?
- Answer: ₹75,000
- Quote (income_tax_fy_2025_26.md): "A standard deduction of ₹75,000 is available for salaried individuals and pensioners under the new tax regime."
- Would go to pack: income_tax_india | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 15. In the 2024–25 financial year, up to what taxable income does the rebate under Section 87A eliminate income tax?
- Answer: ₹700,000
- Quote (income_tax_fy_2024_25.md): "Rebate under Section 87A: Taxpayers with taxable income up to ₹700,000 pay zero income tax due to a full rebate."
- Would go to pack: income_tax_india | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 16. What is the maximum deduction allowed under Section 80C for EPF, PPF, ELSS, tuition fees, and principal repayment on home loans in financial year 2024–25?
- Answer: ₹150,000
- Quote (old_tax_regime_distractor.md): "Section 80C: Deduction up to ₹150,000 for EPF, PPF, ELSS, tuition fees, and principal repayment on home loans."
- Would go to pack: income_tax_india | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 17. What was the highest GST tax slab under the standard rate structure in India prior to September 2025?
- Answer: 28%
- Quote (gst_rates_pre_sept_2025.md): "goods and services were broadly categorized into four primary tax slabs: 5%, 12%, 18%, and 28%."
- Would go to pack: gst_india | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 18. What is the daily data allowance of the 365-Day Annual Plan in the Indian Telecom Standard Prepaid Tariff Schedule (Pre-July 2024)?
- Answer: 2.5GB
- Quote (telecom_tariffs_pre_july_2024.md): "365-Day Annual Plan: Priced at ₹2,999, providing 365 days validity with 2.5GB daily data."
- Would go to pack: telecom_india | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )

## 19. How much does the Pilar Monastery Museum entry ticket cost per visitor in the Current Edition?
- Answer: ₹50
- Quote (travel_jaipur_goa_current.md): "Pilar Monastery Museum Entry: The entry ticket for the historical artifact collection is ₹50 per visitor."
- Would go to pack: travel_jaipur_goa | written by groq:openai/gpt-oss-120b
- [ ] OK   - [ ] wrong (why: )
