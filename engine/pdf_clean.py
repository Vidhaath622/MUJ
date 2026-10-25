"""Clean text extracted from PDFs (slides and notes) before chunking.

Text from slide decks and exported notes is noisy in predictable ways:
  - a header or footer ("Page 3 of 79", the course title) repeats on every page;
  - pypdf repeats a word at a line wrap ("Copy, Move," / "Move, Delete");
  - diagram labels repeat ("notes.txt" ... "notes.txt");
  - slides are short, so one slide per chunk gives many thin chunks;
  - some pages are images with no text layer at all.
This module fixes what can be fixed from the text, OCRs empty pages when tesseract is
installed, and reports everything it did, so the upload can say how good the text is.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

MIN_PAGE_CHARS = 20  # less than this is treated as a page without text
_SPACES = re.compile(r"[ \t ]+")


@dataclass
class PdfReport:
    pages: int = 0
    pages_with_text: int = 0
    ocr_pages: list[int] = field(default_factory=list)
    skipped_pages: list[int] = field(default_factory=list)
    removed_boilerplate: list[dict] = field(default_factory=list)
    wrap_repeats_removed: int = 0
    duplicate_lines_removed: int = 0
    ocr: str = "not needed"
    warnings: list[str] = field(default_factory=list)


def _norm(line: str) -> str:
    return _SPACES.sub(" ", line).strip()


def _key(line: str) -> str:
    """Lines that differ only in numbers (page counters, dates) share a key."""
    return re.sub(r"\d+", "#", _norm(line).lower())


# ------------------------------------------------------------------ OCR


def _ocr_page(page) -> str:
    """Text from the images on one page via tesseract; empty when there is nothing to read."""
    texts = []
    for image in getattr(page, "images", []):
        with tempfile.NamedTemporaryFile(suffix=Path(image.name).suffix or ".png") as tmp:
            tmp.write(image.data)
            tmp.flush()
            try:
                out = subprocess.run(["tesseract", tmp.name, "stdout"], capture_output=True, text=True, timeout=60)
            except (OSError, subprocess.TimeoutExpired):
                continue
            if out.returncode == 0:
                texts.append(out.stdout)
    return "\n".join(texts)


def extract_pages(data: bytes, report: PdfReport) -> list[tuple[int, str]]:
    """(page number, raw text) for every page; empty pages are OCR'd if possible, else reported."""
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    report.pages = len(reader.pages)
    tesseract = shutil.which("tesseract")
    pages = []
    for number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if len(text.strip()) < MIN_PAGE_CHARS:
            ocr_text = _ocr_page(page) if tesseract else ""
            if len(ocr_text.strip()) >= MIN_PAGE_CHARS:
                text = ocr_text
                report.ocr_pages.append(number)
            else:
                report.skipped_pages.append(number)
                continue
        pages.append((number, text))
    report.pages_with_text = len(pages)
    if report.skipped_pages:
        report.ocr = "tesseract" if tesseract else "unavailable"
        how = "even after OCR" if tesseract else "and OCR is not available (install tesseract to read image-only pages)"
        report.warnings.append(
            f"{len(report.skipped_pages)} of {report.pages} pages have no readable text {how}: pages {_ranges(report.skipped_pages)}."
        )
    elif report.ocr_pages:
        report.ocr = "tesseract"
    if report.ocr_pages:
        report.warnings.append(f"Pages {_ranges(report.ocr_pages)} were read with OCR; check them for recognition errors.")
    return pages


def _ranges(numbers: list[int]) -> str:
    out, start = [], None
    for i, n in enumerate(numbers):
        if start is None:
            start = n
        if i + 1 == len(numbers) or numbers[i + 1] != n + 1:
            out.append(str(start) if start == n else f"{start}-{n}")
            start = None
    return ", ".join(out)


# ------------------------------------------------------------- cleaning


_PAGER = re.compile(r"^(?:page|p\.|slide)?\s*#\s*(?:(?:of|/)\s*\d+)?$")


def _boiler_keys(line: str, number: int) -> list[tuple[str, str]]:
    """Keys under which a line may repeat across pages as a header or footer.

    ("text", t): the same text on many pages ("Course notes 2026").
    ("pager", p): a page counter ("7", "Page 7 of 79", "Slide 7", "7 / 79").
    ("tail", r): the same text followed by the page number ("Git notes 2026 · 7").
    Content that merely differs by numbers ("Step 2: install") matches none of them.
    """
    text = _norm(line).lower()
    keys = [("text", text)]
    marked = re.sub(rf"(?<!\d){number}(?!\d)", "#", text, count=1)
    if marked != text and _PAGER.match(marked):
        keys.append(("pager", re.sub(r"\d+", "#", marked)))
    tail = re.match(rf"^(.*?\S)[\s|·•\-–—:,]*(?<!\d){number}$", text)
    if tail and len(text) <= 80:
        keys.append(("tail", tail.group(1)))
    return keys


def remove_boilerplate(pages: list[tuple[int, list[str]]], report: PdfReport, edge: int = 3) -> list[tuple[int, list[str]]]:
    """Drop header/footer lines found near the top or bottom of at least half the pages (and 3 or more)."""
    if len(pages) < 3:
        return pages
    seen: dict[tuple[str, str], set[int]] = {}
    example: dict[tuple[str, str], str] = {}
    for number, lines in pages:
        for line in lines[:edge] + lines[-edge:]:
            for key in _boiler_keys(line, number):
                if len(key[1]) >= 1 if key[0] == "pager" else len(key[1]) >= 3:
                    seen.setdefault(key, set()).add(number)
                    example.setdefault(key, _norm(line))
    threshold = max(3, (len(pages) + 1) // 2)
    boiler = {k for k, where in seen.items() if len(where) >= threshold}
    for key in sorted(boiler, key=lambda k: -len(seen[k])):
        report.removed_boilerplate.append({"line": example[key], "pages": len(seen[key])})
    if boiler:
        report.warnings.append(
            "Removed repeating header/footer lines: " + "; ".join(f"\"{b['line']}\" ({b['pages']} pages)" for b in report.removed_boilerplate[:3]) + "."
        )
    return [(n, [l for l in lines if not boiler.intersection(_boiler_keys(l, n))]) for n, lines in pages]


def fix_wrap_repeats(lines: list[str], report: PdfReport) -> list[str]:
    """Undo pypdf's repeated word at a line wrap: "Copy, Move," + "Move, Delete" -> "Delete"."""
    out: list[str] = []
    for line in lines:
        if out:
            prev, cur = out[-1].split(), line.split()
            for k in (3, 2, 1):
                # One repeated number is usually content ("3 ÷ 2 = 1 r 1" / "1 ÷ 2 = 0 r 1"), not a wrap artifact.
                if k == 1 and re.fullmatch(r"[\d.,:;()+\-=÷×/%]+", cur[0] if cur else ""):
                    continue
                if len(prev) >= k and len(cur) > k and prev[-k:] == cur[:k]:
                    line = " ".join(cur[k:])
                    report.wrap_repeats_removed += 1
                    break
            if _norm(line) == _norm(out[-1]):
                report.wrap_repeats_removed += 1
                continue
        out.append(line)
    return out


def dedupe_lines(lines: list[str], report: PdfReport, min_len: int = 6) -> list[str]:
    """Keep the first copy of a repeated line (repeated diagram labels, captions)."""
    seen: set[str] = set()
    out = []
    for line in lines:
        key = _norm(line).lower()
        if len(key) >= min_len and key in seen:
            report.duplicate_lines_removed += 1
            continue
        seen.add(key)
        out.append(line)
    return out


def clean(pages: list[tuple[int, str]], report: PdfReport) -> list[tuple[int, list[str]]]:
    split = [(n, [l for l in (_norm(x) for x in text.splitlines()) if l]) for n, text in pages]
    split = remove_boilerplate(split, report)
    return [(n, fix_wrap_repeats(lines, report)) for n, lines in split]


# ------------------------------------------------------------- chunking


def chunk_slides(pages: list[tuple[int, list[str]]], report: PdfReport, min_chars: int = 600, max_chars: int = 1000) -> list[tuple[int, int, str]]:
    """(first page, last page, text): consecutive short pages merged to about min-max characters.

    A page longer than max_chars is split on paragraph and sentence boundaries on its own.
    Repeated lines are removed within each chunk.
    """
    from .ingest import _split_long

    chunks: list[tuple[int, int, str]] = []
    current: list[tuple[int, list[str]]] = []

    def size(items) -> int:
        return sum(len(l) + 1 for _, lines in items for l in lines)

    def flush() -> None:
        if not current:
            return
        lines = dedupe_lines([l for _, ls in current for l in ls], report)
        text = "\n".join(lines).strip()
        if text:
            chunks.append((current[0][0], current[-1][0], text))
        current.clear()

    for number, lines in pages:
        page_size = size([(number, lines)])
        if page_size == 0:
            continue
        if page_size > max_chars:
            flush()
            for piece in _split_long("\n".join(dedupe_lines(lines, report)), max_chars):
                chunks.append((number, number, piece.strip()))
            continue
        if current and size(current) + page_size > max_chars:
            flush()
        current.append((number, lines))
        if size(current) >= min_chars:
            flush()
    flush()
    # A short last chunk joins the previous one when they fit together.
    if len(chunks) >= 2 and len(chunks[-1][2]) < min_chars // 3 and len(chunks[-2][2]) + len(chunks[-1][2]) <= int(max_chars * 1.3):
        (a1, _, t1), (_, b2, t2) = chunks[-2], chunks[-1]
        chunks[-2:] = [(a1, b2, t1 + "\n" + t2)]
    return chunks


def finish_report(report: PdfReport, chunks: list[tuple[int, int, str]]) -> dict:
    lengths = [len(t) for _, _, t in chunks]
    thin = sum(1 for n in lengths if n < 200)
    if thin:
        report.warnings.append(f"{thin} of {len(chunks)} chunks are under 200 characters; questions are not generated from them.")
    return {
        "pages": report.pages,
        "pages_with_text": report.pages_with_text,
        "skipped_pages": report.skipped_pages,
        "ocr_pages": report.ocr_pages,
        "ocr": report.ocr,
        "chunks": len(chunks),
        "avg_chunk_chars": round(sum(lengths) / len(lengths)) if lengths else 0,
        "removed_boilerplate": report.removed_boilerplate,
        "wrap_repeats_removed": report.wrap_repeats_removed,
        "duplicate_lines_removed": report.duplicate_lines_removed,
        "warnings": report.warnings,
    }
