"""Convert Anuvesha's dataset folders into RAGSeal packs, validating every quote and answer.

usage: python convert_packs.py <incoming dir> <packs out dir>
Prints a report of what was fixed and dropped; exits non-zero if anything unexpected fails.
"""

import json
import re
import sys
from pathlib import Path

INCOMING, OUT = Path(sys.argv[1]), Path(sys.argv[2])

PACKS = {
    "income_tax_india": {
        "name": "Income tax (India)",
        "description": "New-regime income tax slabs FY 2024-25 vs FY 2025-26 (Budget 2025), with the old regime as a distractor.",
        "current": "income_tax_fy_2025_26.md", "old": "income_tax_fy_2024_25.md", "distractor": "old_tax_regime_distractor.md",
        "risk_rules": ["Never quote FY 2024-25 slabs or rebate limits as current.", "Do not mix old-regime deductions into new-regime answers."],
    },
    "gst_india": {
        "name": "GST rates (India)",
        "description": "GST rates before and after the September 2025 rate rationalisation, with exemptions as a distractor.",
        "current": "gst_rates_post_sept_2025.md", "old": "gst_rates_pre_sept_2025.md", "distractor": "gst_exemptions_distractor.md",
        "risk_rules": ["Never quote a pre-September-2025 GST rate as current."],
    },
    "telecom_india": {
        "name": "Telecom tariffs (India)",
        "description": "Prepaid tariffs before and after the July 2024 increases, with postpaid terms as a distractor.",
        "current": "telecom_tariffs_post_july_2024.md", "old": "telecom_tariffs_pre_july_2024.md", "distractor": "telecom_postpaid_distractor.md",
        "risk_rules": ["Never quote a pre-July-2024 prepaid price as current."],
    },
    "rishihood_rules": {
        "name": "University rules (Rishihood)",
        "description": "Academic regulations 2023-24 vs 2025-26, with hostel rules as a distractor.",
        "current": "rishihood_rules_2025.md", "old": "rishihood_rules_2023.md", "distractor": "rishihood_hostel_distractor.md",
        "risk_rules": ["Never quote the 2023 attendance or fee rules as current."],
    },
    "travel_jaipur_goa": {
        "name": "Travel guide (Jaipur & Goa)",
        "description": "Entry fees and timings in a 2022 edition vs the current edition, with visitor rules as a distractor.",
        "current": "travel_jaipur_goa_current.md", "old": "travel_jaipur_goa_2022.md", "distractor": "travel_distractor.md",
        "risk_rules": ["Never quote 2022 prices or timings as current."],
    },
}

# Corrections to the question sheets, by test_id: (field changes, reason).
FIXES = {
    "trv_12": ({"answer": "From the Collem junction."}, "the answer was the price sentence; the question asks where the trek starts"),
    "trv_13": ({"answer": "1 hour."}, "the answer was the price sentence; the question asks how long the cruise is"),
    "tax_08": ({"type": "factual", "stale_file": "", "stale_quote": ""},
               "the 'stale' passage was about the surcharge, not an older version of this slab (FY 2024-25 had no ₹2,000,001-₹2,400,000 slab)"),
}

# GST has no question sheet: questions written from exact quotes (origin "synthetic").
GST_CASES = [
    # (test_id, question, answer, type, gold quote, stale quote or None)
    ("gst_01", "What is the GST rate on air conditioners after the September 2025 rationalisation?", "18% (reduced from 28%).", "stale",
     "Consumer durables including ACs and large LED/LCD TVs reduced from 28% to 18%.", "Taxed at the peak rate of 28%."),
    ("gst_02", "What is the current GST rate on cement?", "18% (reduced from 28%).", "stale",
     "GST on cement reduced from 28% to 18% to boost housing and infrastructure.", "Taxed at the highest rate slab of 28%."),
    ("gst_03", "What GST rate applies to standard medicines after the reform?", "5% (reduced from 12%).", "stale",
     "33 life-saving drugs and diagnostic kits reduced to 0% (Nil), with other standard medicines reduced from 12% to 5%.",
     "Standard essential drugs, medical equipment, and diagnostic kits were taxed at 12%."),
    ("gst_04", "What is the GST rate on spectacles and contact lenses now?", "5% (reduced from 12%).", "stale",
     "GST on spectacles, lenses, and contact lenses reduced from 12% to 5%.", "Spectacles, contact lenses, and corrective frames carried a 12% GST rate."),
    ("gst_05", "What GST applies to a hotel room costing up to ₹7,500 per day after September 2025?", "5% (reduced from 12%).", "stale",
     "Hotel stays up to ₹7,500 per day reduced from 12% to 5%.", "Hotel room stays priced up to ₹7,500 per day were taxed at 12%."),
    ("gst_06", "What is the GST rate on gym and salon services after the rationalisation?", "5% (reduced from 18%).", "stale",
     "Services provided by gyms, salons, barbers, and yoga centers reduced from 18% to 5%.",
     "Fitness centers, beauty salons, and barbershops were subject to 18% GST."),
    ("gst_07", "What is the current GST rate on small cars and two-wheelers up to 350cc?", "18% (reduced from 28%).", "stale",
     "Small cars and two-wheelers (≤350cc) reduced from 28% to 18%.", "Two-wheelers and small engine motor vehicles were taxed at 28%."),
    ("gst_08", "What GST rate applies to bicycles and toothpaste after the reform?", "5%.", "stale",
     "Household articles like soaps, toothbrushes, toothpaste, and bicycles reduced to 5%.",
     "Daily household articles like bicycles and toothpaste were taxed at 12%."),
    ("gst_09", "What GST rate applies to packaged pasta, namkeens and biscuits now?", "5%.", "stale",
     "Packaged food items including pasta, namkeens, sauces, and biscuits reduced to 5%.",
     "Packaged namkeens, pasta, sauces, and biscuits were taxed at 12% or 18%."),
    ("gst_10", "From which date did the September 2025 GST rate rationalisation take effect?", "22nd September 2025.", "factual",
     "Effective 22nd September 2025, the GST Council enacted a landmark rate rationalisation overhaul, consolidating the tax structure primarily into two main slabs of 5% and 18%.", None),
    ("gst_11", "What GST rate applies to the 33 life-saving drugs after the reform?", "0% (Nil).", "factual",
     "33 life-saving drugs and diagnostic kits reduced to 0% (Nil), with other standard medicines reduced from 12% to 5%.", None),
    ("gst_12", "What were the four primary GST slabs before the September 2025 reform?", "5%, 12%, 18% and 28%.", "factual",
     "goods and services were broadly categorized into four primary tax slabs: 5%, 12%, 18%, and 28%.", None),
    ("gst_13", "Is GST charged on services of recognised doctors and hospitals?", "No, they remain fully exempt from GST.", "factual",
     "Services provided by recognized doctors, hospitals, and medical clinics remain fully exempt from GST.", None),
    ("gst_14", "What GST applies to fresh vegetables and unbranded milk?", "0% GST.", "factual",
     "Fresh fruits, fresh vegetables, unbranded milk, and curd carry 0% GST.", None),
    ("gst_15", "By how many percentage points did the GST on cement fall in September 2025?", "10 percentage points (from 28% to 18%).", "multi_hop",
     "GST on cement reduced from 28% to 18% to boost housing and infrastructure.", "Taxed at the highest rate slab of 28%."),
    ("gst_16", "What is the GST rate on gold jewellery after the reform?", "Not stated in the documents.", "unanswerable", None, None),
    ("gst_17", "What compensation cess applies to tobacco products after September 2025?", "Not stated in the documents.", "unanswerable", None, None),
]

TYPE_MAP = {"factual": "factoid", "factoid": "factoid", "stale": "stale", "unanswerable": "unanswerable", "multi_hop": "factoid", "distractor": "distractor"}
TYPES = "|".join(TYPE_MAP)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def numbers(text: str) -> set[float]:
    return {float(n.replace(",", "")) for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def clean_doc(text: str) -> str:
    """Markdown bold markers are dropped so quotes from the sheet match the text verbatim."""
    return text.replace("**", "")


def parse_sheet(path: Path) -> list[dict]:
    """The sheets are comma-separated without quoting, and answers and quotes contain commas
    (₹1,200,000). Columns are found by anchors: the question ends with "?", the type is a known
    word, file names end in .md."""
    lines = path.read_text().strip().splitlines()
    assert lines[0].startswith("test_id,question,answer,type"), path
    rows = []
    for line in lines[1:]:
        m = re.match(rf"^(\w+),(.+?\?),(.*),({TYPES}),(.*)$", line)
        if not m:
            raise SystemExit(f"cannot parse: {line[:100]}")
        test_id, question, answer, case_type, rest = m.groups()
        gold_file = gold_quote = stale_file = stale_quote = ""
        if case_type != "unanswerable":
            gm = re.match(r"^([\w\-]+\.md),(.*)$", rest)
            if not gm:
                raise SystemExit(f"{test_id}: no gold file in {rest[:80]}")
            gold_file, tail = gm.groups()
            sm = re.search(r",([\w\-]+\.md),(.*)$", tail)
            if sm:
                gold_quote, stale_file, stale_quote = tail[: sm.start()], sm.group(1), sm.group(2)
            else:
                gold_quote = tail[:-2] if tail.endswith(",,") else tail
        rows.append({"test_id": test_id, "question": question.strip(), "answer": answer.strip(), "type": case_type,
                     "gold_file": gold_file, "gold_quote": gold_quote.strip(), "stale_file": stale_file, "stale_quote": stale_quote.strip()})
    return rows


report = {"fixed": [], "dropped": [], "file_renamed": set(), "counts": {}}


def alias(name: str) -> str:
    """The sheets name files differently (income_tax_slabs_fy2025_26.md for income_tax_fy_2025_26.md)."""
    return re.sub(r"[^a-z0-9]", "", re.sub(r"(slabs|academic|distractor|rules|tariffs|plans)", "", name.lower().removesuffix(".md")))


def locate(quote: str, docs: dict[str, str], named: str = "") -> str | None:
    """The document containing the quote verbatim (after whitespace and case normalisation). A quote
    found in several documents (an unchanged sentence) goes to the file the sheet named."""
    hits = [f for f, text in docs.items() if norm(quote) in norm(text)]
    if len(hits) > 1 and named:
        hits = [f for f in hits if alias(f) == alias(named)]
    return hits[0] if len(hits) == 1 else None


def check_answer(case: dict, quotes: list[str]) -> str | None:
    """The answer's numbers must come from the gold quotes or the question, or be a difference of two
    quoted numbers (multi-hop)."""
    if case["type"] == "unanswerable":
        return None
    have = set().union(*(numbers(q) for q in quotes)) if quotes else set()
    have |= numbers(case["question"]) | case.get("years", set())
    diffs = {abs(a - b) for a in have for b in have}
    missing = {n for n in numbers(case["answer"]) if n not in have and n not in diffs}
    return f"answer numbers {sorted(missing)} are not in the gold quotes" if missing else None


def build(pack_id: str, spec: dict) -> dict:
    folder = INCOMING / pack_id
    out = OUT / pack_id
    out.mkdir(parents=True, exist_ok=True)
    docs = {}
    for role in ("current", "old", "distractor"):
        name = spec[role]
        text = clean_doc((folder / name).read_text())
        (out / name).write_text(text)
        docs[name] = text
    if pack_id == "gst_india":
        rows = [{"test_id": t, "question": q, "answer": a, "type": ty, "gold_quote": g or "", "stale_quote": s or "", "origin": "synthetic"}
                for t, q, a, ty, g, s in GST_CASES]
    else:
        sheet = next(folder.glob("*_test_dataset_csv.md"))
        rows = [{**r, "origin": "hand"} for r in parse_sheet(sheet)]
    cases = []
    for row in rows:
        tid = row["test_id"]
        if tid in FIXES:
            changes, why = FIXES[tid]
            row.update(changes)
            report["fixed"].append(f"{pack_id} {tid}: {why}")
        case = {"test_id": tid, "question": row["question"], "ground_truth_answer": row["answer"], "type": TYPE_MAP[row["type"]], "origin": row["origin"]}
        if row["type"] == "multi_hop":
            case["note"] = "multi-hop: needs both the current and the older figure"
        quotes = []
        problem = None
        for field, target in (("gold_quote", "gold"), ("stale_quote", "stale")):
            quote = row.get(field, "")
            if not quote:
                continue
            found = locate(quote, docs, row.get(field.replace("quote", "file"), ""))
            if found is None:
                problem = f"{field.split('_')[0]} quote not found verbatim (or found in several documents): {quote[:70]!r}"
                break
            named = row.get(field.replace("quote", "file"), "")
            if named and named != found:
                report["file_renamed"].add(f"{named} -> {found}")
            # A multi-hop question needs the older figure too: it is gold, not stale.
            key = "gold" if (target == "gold" or row["type"] == "multi_hop") else "stale"
            case.setdefault(key, []).append({"file": found, "quote": quote})
            quotes.append(quote)
        if problem is None:
            if row["type"] != "unanswerable" and not case.get("gold"):
                problem = "answerable but has no gold quote"
            else:
                years = {float(y) for text in docs.values() for y in re.findall(r"\b(?:19|20)\d\d\b", text)}  # edition labels
                problem = check_answer({"type": row["type"], "answer": row["answer"], "question": row["question"], "years": years}, quotes)
        if problem:
            report["dropped"].append(f"{pack_id} {tid}: {problem}")
            continue
        cases.append(case)
    manifest = {
        "pack_id": pack_id,
        "name": spec["name"],
        "description": spec["description"],
        "demo_data": True,
        "data_note": "Documents written by a teammate (Anuvesha) in the style of the cited sources and kept as given "
                     "(bold markers removed); figures were not re-checked against the live sources. Questions with "
                     "origin 'hand' were written by her; 'synthetic' ones by RAGSeal's builder from exact quotes.",
        "sources": (folder / next(p.name for p in folder.glob("*sources*.txt"))).read_text().strip().splitlines(),
        "documents": [{"file": spec["current"]}, {"file": spec["old"], "superseded_by": spec["current"]}, {"file": spec["distractor"]}],
        "risk_rules": spec["risk_rules"],
        "test_cases": cases,
    }
    (out / "pack.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    report["counts"][pack_id] = {"cases": len(cases), "of": len(rows)}
    return manifest


for pid, spec in PACKS.items():
    build(pid, spec)
print(json.dumps({**report, "file_renamed": sorted(report["file_renamed"])}, indent=1, ensure_ascii=False))
