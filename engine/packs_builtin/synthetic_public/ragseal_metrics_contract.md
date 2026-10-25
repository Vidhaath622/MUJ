## 1. Core Evaluation Metrics & Root-Cause Categories

### Metrics
1. **Context Relevance** (`context_relevance`): `0.0 – 1.0`
   - Does the retrieved chunk contain information needed to answer the query?
   - $\ge 0.70$: Pass (Green) \| $< 0.70$: Fail (Red)
2. **Faithfulness / Groundedness** (`faithfulness`): `0.0 – 1.0`
   - Can every claim in the generated answer be directly inferred from the retrieved context?
   - $\ge 0.75$: Pass (Green) \| $< 0.75$: Fail / Hallucination (Red)
3. **Answer Accuracy / Correctness** (`answer_accuracy`): `0.0 – 1.0`
   - Does the answer match the ground-truth answer semantically?
   - $\ge 0.70$: Pass (Green) \| $< 0.70$: Fail (Red)

### Root-Cause Diagnosis Categories
* `CLEAN_PASS`: Both retriever and generator performed accurately.
* `RETRIEVAL_FAILURE`: Retriever missed relevant context $\rightarrow$ generator failed due to lack of info.
* `GENERATION_HALLUCINATION`: Retriever found relevant context, but generator fabricated unsupported claims.
* `COMPOUND_FAILURE`: Both retrieval and generation failed independently.

