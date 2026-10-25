"""Generate synthetic test cases from real documents, keeping only those that validate automatically.

    python -m engine.scripts.generate_synthetic_cases --env backend/.env --out /tmp/synthetic.json

For every section of every source document the judge model writes questions with an answer and a
quote copied from the section. A case is kept only when:
  - the quote is found verbatim in the section (whitespace and case aside);
  - the answer sits inside the quote: its numbers all appear in the quote (non-numeric answers:
    most of their words do);
  - the question names its subject and year or edition (no "this document", "the passage");
  - the question is not a duplicate of another case or of an existing hand-written one.
Every kept case is marked origin "synthetic" with the model that wrote it. These are never
human-labelled; a seeded 10% is held back as a list for people to spot-check.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PACKS = Path(__file__).resolve().parent.parent / "packs_builtin"

# (pack that receives the cases, document, questions per section)
SOURCES = [
    ("synthetic_public", f, 4) for f in (
        "irs_tax_inflation_2026_IR-2025-103.md", "irs_tax_inflation_2025_IR-2024-273.md",
        "irs_retirement_limits_2026_IR-2025-111.md", "irs_retirement_limits_2025_IR-2024-285.md",
        "irs_mileage_rates_2026_IR-2025-128.md", "irs_mileage_rates_2025_IR-2024-312.md",
        "ragseal_overview.md", "ragseal_how_it_works.md", "ragseal_metrics_contract.md",
    )
] + [
    ("income_tax_india", "income_tax_fy_2025_26.md", 4), ("income_tax_india", "income_tax_fy_2024_25.md", 3),
    ("income_tax_india", "old_tax_regime_distractor.md", 3),
    ("gst_india", "gst_rates_post_sept_2025.md", 5), ("gst_india", "gst_rates_pre_sept_2025.md", 4), ("gst_india", "gst_exemptions_distractor.md", 2),
    ("telecom_india", "telecom_tariffs_post_july_2024.md", 4), ("telecom_india", "telecom_tariffs_pre_july_2024.md", 4),
    ("rishihood_rules", "rishihood_rules_2025.md", 3), ("rishihood_rules", "rishihood_rules_2023.md", 3),
    ("travel_jaipur_goa", "travel_jaipur_goa_current.md", 4), ("travel_jaipur_goa", "travel_jaipur_goa_2022.md", 4),
    ("travel_jaipur_goa", "travel_distractor.md", 2),
]

SYSTEM = """You write evaluation questions for a question-answering system that searches documents.
From the passage, write up to {n} questions, each about a different fact.
Rules:
- The answer must be stated in the passage. Keep it short: a figure, date, name or short phrase.
- "quote" must be copied character for character from the passage: one sentence or clause (under 300 characters) that contains the answer.
- The question must stand alone: name the subject and the year, tax year or edition the passage is about (for example "for tax year 2026", "in the 2022 edition", "before July 2024"). Never write "this document", "the passage" or "the text".
- No yes/no questions. No questions that need anything outside the quote."""

SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
        "question": {"type": "string"}, "answer": {"type": "string"}, "quote": {"type": "string"}},
        "required": ["question", "answer", "quote"]}}},
    "required": ["items"],
}


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("**", "")).strip().lower()


def numbers(text: str) -> set[str]:
    return {n.replace(",", "").rstrip(".") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{3,}", text.lower()) if w not in {"the", "and", "for", "are", "with", "from"}}


def sections(text: str, size: int = 1100) -> list[str]:
    out, current = [], ""
    for block in [b.strip() for b in text.split("\n\n") if b.strip()]:
        if current and len(current) + len(block) > size:
            out.append(current)
            current = ""
        current = f"{current}\n\n{block}".strip()
    if current:
        out.append(current)
    return out


def problem(item: dict, section: str) -> str | None:
    question, answer, quote = (str(item.get(k, "")).strip() for k in ("question", "answer", "quote"))
    if not question.endswith("?") or len(question) < 15 or not answer or not quote:
        return "incomplete"
    if re.search(r"\b(this|the) (document|passage|text|section)\b", question.lower()):
        return "not self-contained"
    if re.match(r"^(is|are|does|do|can|was|were|has|have)\b", question.lower()):
        return "yes/no question"
    if norm(quote) not in norm(section):
        return "quote not verbatim"
    need = numbers(answer)
    if need and not need <= numbers(quote):
        return "answer figures not in quote"
    if not need and len(words(answer) & words(quote)) < 0.6 * max(1, len(words(answer))):
        return "answer not in quote"
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--holdback", type=float, default=0.10)
    args = parser.parse_args()

    from dotenv import load_dotenv

    load_dotenv(args.env, override=True)
    os.environ["RAGSEAL_DATA_DIR"] = tempfile.mkdtemp(prefix="ragseal-synth-")
    from engine.config import get_settings
    from engine.service import Engine

    engine = Engine(get_settings())
    judge = engine.judge
    print(f"writer: {judge.provider}:{judge.model} on {len(judge.primary)} key(s)", flush=True)

    existing = set()
    for manifest in PACKS.glob("*/pack.json"):
        existing |= {norm(c["question"]) for c in json.loads(manifest.read_text()).get("test_cases", [])}

    jobs = []
    for pack_id, filename, per_section in SOURCES:
        text = (PACKS / pack_id / filename).read_text()
        title = text.splitlines()[0].lstrip("# ").strip()
        for section in sections(text):
            jobs.append((pack_id, filename, title, section, per_section))

    def ask(job):
        pack_id, filename, title, section, n = job
        user = f"Document: {title}\n\nPassage:\n{section}"
        try:
            return job, judge.ask(SYSTEM.format(n=n), user, SCHEMA).get("items", [])
        except Exception as exc:  # one failed section must not stop the run
            print(f"  section of {filename} failed: {exc}", file=sys.stderr)
            return job, []

    kept, rejected, seen = [], {}, set(existing)
    with ThreadPoolExecutor(8) as pool:
        for (pack_id, filename, title, section, _), items in pool.map(ask, jobs):
            for item in items:
                why = problem(item, section)
                key = norm(str(item.get("question", "")))
                if why is None and key in seen:
                    why = "duplicate question"
                if why:
                    rejected[why] = rejected.get(why, 0) + 1
                    continue
                seen.add(key)
                kept.append({"pack_id": pack_id, "question": item["question"].strip(), "ground_truth_answer": item["answer"].strip(),
                             "type": "factoid", "gold": [{"file": filename, "quote": item["quote"].strip()}],
                             "origin": "synthetic", "generated_by": f"{judge.provider}:{judge.model}"})

    rng = random.Random(25)
    held = set(rng.sample(range(len(kept)), round(len(kept) * args.holdback)))
    result = {"kept": [c for i, c in enumerate(kept) if i not in held], "held_back": [c for i, c in enumerate(kept) if i in held],
              "rejected": rejected, "sections": len(jobs)}
    args.out.write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print(json.dumps({"sections": len(jobs), "valid": len(kept), "kept": len(result["kept"]), "held_back": len(result["held_back"]),
                      "rejected": rejected}, indent=1))


if __name__ == "__main__":
    main()
