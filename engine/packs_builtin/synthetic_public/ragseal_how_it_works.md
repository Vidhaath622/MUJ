# How RAGSeal works

Written from the RAGSeal engine code. It describes the system as it runs today.

## The RAG system under test

Documents are split into chunks of up to about 700 characters, and each new markdown heading starts a new chunk. Chunk and document IDs come from a hash of the file content, so the same file always gets the same IDs.

Chunks are embedded with the nomic-embed-text model, which runs locally through Ollama. For each question RAGSeal retrieves the top 4 chunks by cosine similarity.

The generator under test is llama3.2:3b, a small local model that runs through Ollama at temperature 0 with a fixed seed of 42. It is small on purpose, so that failures are visible. The generator must cite the passages it used with numbers in square brackets, and it is told to reply "I don't know based on the provided documents." when the passages do not contain the answer.

## How an answer is judged

A judge model scores three metrics: context relevance, faithfulness and answer accuracy. Each case needs one merged judge call that scores relevance, checks every claim and compares the answer with the ground truth together. A replay adds one more judge call.

Some parts are decided by rules instead of a model: an answer that abstains has no claims to check, and an answer that states exactly the numbers of the ground truth passes accuracy. Every metric says whether a model or a rule decided it.

The pass thresholds are 0.70 for context relevance, 0.75 for faithfulness and 0.70 for answer accuracy. A score up to 0.15 below its threshold is shown as REVIEW instead of FAIL.

## The replay verdict

When a case fails, RAGSeal re-runs the same generator with only the gold chunk, the passage that holds the answer. If the gold chunk was not retrieved and the replay answers correctly, the verdict is RETRIEVAL_FAILURE. If the gold chunk was retrieved, the answer makes unsupported claims and the replay is still wrong, the verdict is GENERATION_HALLUCINATION. If the gold chunk was missed and the replay is also wrong, the verdict is COMPOUND_FAILURE.

Every verdict also names a failure type and the stage at fault. The failure types are wrong chunk, stale source, distractor confusion, ignored context, hallucination, reasoning error, unanswerable answered and false abstention.

## Judges and their limits

The judge runs on Groq by default. RAGSeal records which judge model scored every case. If every hosted judge has used up its rate limit, a live question falls back to the local qwen3:8b judge, and the result says so.

Judge results are cached by model and prompt, so re-running a pack only pays for judge calls it has not seen before.

## Test packs

RAGSeal ships with three fictional industry packs, Recruitment, Banking and Healthcare, with 71 test cases each. It also ships a pack of real public IRS releases with 22 test cases. Each pack mixes plain factual questions with stale-version traps, unanswerable questions and distractor documents.
