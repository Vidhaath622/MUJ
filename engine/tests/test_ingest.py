import pytest

from engine.ingest import UnsupportedFile, parse_document
from engine.synth import evidence_in_chunk, sample_chunks, version_key

POLICY = b"""# Leave policy

Employees receive 20 days paid leave per calendar year. Unused leave expires on December 31st.

## Sick leave

Sick leave is 10 days per year. A doctor's note is required after 3 consecutive days.

## Parental leave

Primary caregivers receive 16 weeks of paid parental leave. Secondary caregivers receive 4 weeks.
"""


def test_ids_are_stable_and_content_addressed():
    a = parse_document("policy.md", POLICY, 200)
    b = parse_document("renamed.md", POLICY, 200)
    assert a.document_id == b.document_id
    assert [c.chunk_id for c in a.chunks] == [c.chunk_id for c in b.chunks]
    c = parse_document("policy.md", POLICY + b"\nChanged.", 200)
    assert c.document_id != a.document_id


def test_headings_start_chunks_and_stay_with_text():
    doc = parse_document("policy.md", POLICY, 200)
    assert len(doc.chunks) == 3
    assert doc.chunks[1].text.startswith("## Sick leave")
    assert "10 days" in doc.chunks[1].text
    assert all(len(c.text) <= 260 for c in doc.chunks)


def test_long_paragraph_is_split_on_sentences():
    text = (" ".join(f"Sentence number {i} is here." for i in range(100))).encode()
    doc = parse_document("long.txt", text, 300)
    assert len(doc.chunks) > 5
    assert all(len(c.text) <= 300 for c in doc.chunks)


def test_rejects_unknown_types_and_empty_files():
    with pytest.raises(UnsupportedFile):
        parse_document("x.docx", b"hello", 300)
    with pytest.raises(UnsupportedFile):
        parse_document("x.txt", b"   \n  ", 300)


def test_evidence_check():
    chunk = "Employees receive 20 days paid leave per calendar year. Unused leave expires on December 31st."
    assert evidence_in_chunk("Unused leave expires on December 31st.", chunk)
    assert evidence_in_chunk("unused leave expires on december 31st", chunk)
    assert not evidence_in_chunk("Unused leave rolls over to next year.", chunk)


def test_version_key():
    assert version_key("fee_schedule_v2.md") == ("fee schedule", 2)
    assert version_key("Fee Schedule v1.pdf") == ("fee schedule", 1)
    assert version_key("hiring_policy_version_3.txt") == ("hiring policy", 3)
    assert version_key("handbook.md") == ("handbook", None)


def test_sample_is_deterministic_and_spread():
    doc = parse_document("long.txt", (" ".join(f"Fact {i} is stated clearly here for testing." for i in range(200))).encode(), 200)
    first = sample_chunks(doc.chunks, 4)
    assert first == sample_chunks(doc.chunks, 4)
    assert first[0].index == 0 and first[-1].index > len(doc.chunks) // 2
