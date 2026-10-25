import shutil

from engine.ingest import parse_document
from engine.pdf_clean import PdfReport, dedupe_lines, finish_report, fix_wrap_repeats, remove_boilerplate
from engine.synth import has_substance


def make_pdf(pages: list[list[str]]) -> bytes:
    """A minimal valid PDF: one text line per entry, an empty list gives a page without text."""
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for lines in pages:
        ops = ["BT /F1 11 Tf 14 TL 50 780 Td"] + [f"({l.replace('(', '[').replace(')', ']')}) Tj T*" for l in lines] + ["ET"]
        stream = "\n".join(ops) if lines else ""
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
        content = len(objects)
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {content} 0 R /Resources << /Font << /F1 3 0 R >> >> >>")
        kids.append(f"{len(objects)} 0 R")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def slide(title: str, n: int, total: int, body: list[str]) -> list[str]:
    return ["Git 2026 - S&AI notes", title, *body, f"Page {n} of {total}"]


def test_cleaning_steps():
    report = PdfReport()
    pages = [(n, ["Course header", f"Body line {n} about topic {n}.", f"Page {n} of 5"]) for n in range(1, 6)]
    cleaned = remove_boilerplate(pages, report)
    assert all(lines == [f"Body line {n} about topic {n}."] for n, lines in cleaned)
    assert {b["line"] for b in report.removed_boilerplate} == {"Course header", "Page 1 of 5"}
    assert fix_wrap_repeats(["Copy, Move,", "Move, Delete", "Scanner", "Scanner", "OS &", "& File Systems"], report) == [
        "Copy, Move,", "Delete", "Scanner", "OS &", "File Systems"]
    assert dedupe_lines(["notes.txt", "My updated note.", "notes.txt", "My updated note.", "ok"], report) == [
        "notes.txt", "My updated note.", "ok"]


def test_slides_are_cleaned_merged_and_reported():
    total = 12
    body = ["A commit records a snapshot of the staged files in the repository history.",
            "notes.txt", "My updated note.", "notes.txt", "My updated note."]
    pages = [slide("Title slide", 1, total, ["Presented by DevClub"])]
    for n in range(2, total + 1):
        pages.append([] if n in (5, 6) else slide(f"Slide {n}: git topic {n}", n, total, body))
    doc = parse_document("notes.pdf", make_pdf(pages), 700)
    q = doc.quality
    assert q["pages"] == 12 and q["pages_with_text"] == 10 and q["skipped_pages"] == [5, 6]
    assert {b["line"] for b in q["removed_boilerplate"]} >= {"Git 2026 - S&AI notes", "Page 1 of 12"}
    if not shutil.which("tesseract"):
        assert any("no readable text" in w and "5-6" in w for w in q["warnings"])
    # Cleaning is reported as neutral notes; warnings are for problems only.
    assert any(n.startswith("Removed repeating header/footer lines") for n in q["notes"])
    assert not any("header/footer" in w for w in q["warnings"])
    text = "\n".join(c.text for c in doc.chunks)
    assert "Page " not in text and "S&AI notes" not in text  # footer and header gone
    for chunk in doc.chunks:
        assert chunk.text.count("notes.txt") <= 1  # repeated diagram labels removed
        assert len(chunk.text) <= 1300
    assert len(doc.chunks) < q["pages_with_text"]  # short slides were merged
    spans = [(c.page, c.page_end or c.page) for c in doc.chunks]
    assert spans[0][0] == 1 and all(a <= b for a, b in spans)
    assert all(b1 < a2 for (_, b1), (a2, _) in zip(spans, spans[1:]))  # page ranges in order, no overlap


def test_image_only_pdf_is_rejected_with_a_reason():
    import pytest

    from engine.ingest import UnsupportedFile

    if shutil.which("tesseract"):
        pytest.skip("tesseract installed: blank pages are OCR'd to nothing, but the message differs")
    with pytest.raises(UnsupportedFile, match="no readable text in any of the 3 pages"):
        parse_document("scan.pdf", make_pdf([[], [], []]), 700)


def test_markdown_chunking_is_unchanged_and_has_no_report():
    doc = parse_document("policy.md", b"# Leave\n\nEmployees receive 20 days paid leave per calendar year.\n", 700)
    assert doc.quality is None and doc.chunks[0].page_end is None


def test_thin_chunks_are_not_questioned():
    from engine.ingest import Chunk

    assert not has_substance(Chunk("c", "d", 0, "LINUX + GIT\nPresented by DevClub", None))
    assert has_substance(Chunk("c", "d", 0, " ".join(["word"] * 40) + " " + "x" * 50, None))


def test_image_only_pages_are_read_with_ocr_when_tesseract_is_installed():
    import io

    import pytest

    if not shutil.which("tesseract"):
        pytest.skip("tesseract is not installed")
    pil = pytest.importorskip("PIL.Image")
    from PIL import ImageDraw, ImageFont

    img = pil.new("RGB", (1240, 1754), "white")
    text = "A commit records a snapshot\nof the staged files in the\nrepository history."
    ImageDraw.Draw(img).multiline_text((80, 120), text, fill="black", font=ImageFont.load_default(size=42), spacing=18)
    buf = io.BytesIO()
    img.save(buf, "PDF")
    doc = parse_document("scan.pdf", buf.getvalue(), 700)
    assert doc.quality["ocr"] == "tesseract" and doc.quality["ocr_pages"] == [1] and doc.quality["skipped_pages"] == []
    assert "snapshot" in doc.chunks[0].text and "repository" in doc.chunks[0].text


def test_repeated_numbers_across_lines_are_kept():
    report = PdfReport()
    assert fix_wrap_repeats(["3 ÷ 2 = 1 r 1", "1 ÷ 2 = 0 r 1"], report) == ["3 ÷ 2 = 1 r 1", "1 ÷ 2 = 0 r 1"]


def test_little_text_and_mostly_thin_chunks_are_warnings():
    doc = parse_document("tiny.pdf", make_pdf([["LINUX + GIT", "Presented by DevClub"], ["Agenda", "Thanks"]]), 700)
    q = doc.quality
    assert any(w.startswith("Only ") and "characters of text" in w for w in q["warnings"])
    assert any("under 200 characters" in w for w in q["warnings"])  # most chunks thin: a warning
    assert q["notes"] == []


def test_cleaning_counts_are_notes():
    report = PdfReport(pages=10, wrap_repeats_removed=3, duplicate_lines_removed=5)
    out = finish_report(report, [(1, 2, "x" * 900), (3, 4, "y" * 900), (5, 5, "z" * 150)])
    assert out["warnings"] == []
    assert any("3 words repeated at line wraps" in n for n in out["notes"])
    assert any("5 duplicate lines" in n for n in out["notes"]) and any("1 of 3 chunks" in n for n in out["notes"])
