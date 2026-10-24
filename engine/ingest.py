"""Turn PDF, TXT and MD files into chunks with stable IDs.

IDs depend only on file content: the same bytes always give the same
document_id and the same chunk_ids, so gold chunk IDs in test sets stay valid
across re-uploads and machines.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path

SUPPORTED = {".pdf", ".txt", ".md", ".markdown"}


class UnsupportedFile(ValueError):
    pass


@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    index: int
    text: str
    page: int | None


@dataclass
class ParsedDocument:
    document_id: str
    filename: str
    content_hash: str
    chunks: list[Chunk]


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def document_id_for(data: bytes) -> str:
    return "doc_" + content_hash(data)[:10]


def _pdf_pages(data: bytes) -> list[tuple[int | None, str]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = []
    for number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append((number, text))
    return pages


def _text_pages(data: bytes) -> list[tuple[int | None, str]]:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return [(None, data.decode(encoding))]
        except UnicodeDecodeError:
            continue
    raise UnsupportedFile("could not decode text file")


def _paragraphs(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = re.split(r"\n\s*\n", text)
    out = []
    for part in parts:
        part = re.sub(r"[ \t]+", " ", part).strip()
        if part:
            out.append(part)
    return out


def _split_long(paragraph: str, limit: int) -> list[str]:
    if len(paragraph) <= limit:
        return [paragraph]
    sentences = re.split(r"(?<=[.!?])\s+", paragraph)
    pieces, current = [], ""
    for sentence in sentences:
        while len(sentence) > limit:
            if current:
                pieces.append(current)
                current = ""
            pieces.append(sentence[:limit])
            sentence = sentence[limit:]
        if current and len(current) + 1 + len(sentence) > limit:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


def _is_heading(paragraph: str) -> bool:
    return paragraph.startswith("#") or (len(paragraph) < 80 and "\n" not in paragraph and not paragraph.endswith("."))


def chunk_pages(pages: list[tuple[int | None, str]], limit: int) -> list[tuple[int | None, str]]:
    """Greedy paragraph packing. A heading starts a new chunk and stays with the text after it."""
    chunks: list[tuple[int | None, str]] = []
    for page, text in pages:
        current = ""
        for paragraph in _paragraphs(text):
            for piece in _split_long(paragraph, limit):
                starts_section = _is_heading(piece)
                if current and (len(current) + 2 + len(piece) > limit or (starts_section and not _is_heading(current.splitlines()[-1]))):
                    chunks.append((page, current))
                    current = piece
                else:
                    current = f"{current}\n\n{piece}" if current else piece
        if current:
            chunks.append((page, current))
    # Fold tiny trailing fragments (for example a lone heading) into the next chunk.
    merged: list[tuple[int | None, str]] = []
    carry = ""
    for page, text in chunks:
        if carry:
            text = f"{carry}\n\n{text}"
            carry = ""
        if len(text) < 60:
            carry = text
            continue
        merged.append((page, text))
    if carry:
        if merged:
            page, text = merged[-1]
            merged[-1] = (page, f"{text}\n\n{carry}")
        else:
            merged.append((None, carry))
    return merged


def parse_document(filename: str, data: bytes, chunk_chars: int = 700) -> ParsedDocument:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED:
        raise UnsupportedFile(f"unsupported file type '{suffix}', use PDF, TXT or MD")
    pages = _pdf_pages(data) if suffix == ".pdf" else _text_pages(data)
    if not any(text.strip() for _, text in pages):
        raise UnsupportedFile("no extractable text found (scanned PDFs are not supported)")
    doc_hash = content_hash(data)
    document_id = "doc_" + doc_hash[:10]
    chunks = [
        Chunk(
            chunk_id=f"chk_{doc_hash[:6]}_{i:03d}",
            document_id=document_id,
            index=i,
            text=text,
            page=page,
        )
        for i, (page, text) in enumerate(chunk_pages(pages, chunk_chars))
    ]
    return ParsedDocument(document_id=document_id, filename=filename, content_hash=doc_hash, chunks=chunks)
