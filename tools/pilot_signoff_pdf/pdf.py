"""Minimal pure-stdlib PDF 1.4 emitter."""
from __future__ import annotations
import hashlib
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any


# Page geometry (US Letter, 72 dpi)
PAGE_WIDTH = 612
PAGE_HEIGHT = 792
MARGIN_LEFT = 54
MARGIN_TOP = 740
LINE_HEIGHT = 12
FONT_SIZE = 10
MAX_LINES_PER_PAGE = 56


@dataclass
class PDFEmitReport:
    out_path: str
    n_pages: int
    n_input_lines: int
    sha256: str
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "out_path": self.out_path,
            "n_pages": self.n_pages,
            "n_input_lines": self.n_input_lines,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
        }


def _escape_pdf_text(s: str) -> str:
    """Escape characters with meaning in PDF text literals.

    PDF strings use `(...)` syntax; we escape `\\`, `(`, `)` and
    strip control characters to keep the stream printable. Non-ASCII
    characters are dropped because we use the Courier StandardEncoding,
    which only guarantees ASCII rendering.
    """
    out = []
    for ch in s:
        code = ord(ch)
        if ch == "\\":
            out.append("\\\\")
        elif ch == "(":
            out.append("\\(")
        elif ch == ")":
            out.append("\\)")
        elif 32 <= code < 127:
            out.append(ch)
        elif code == 0x09:
            out.append("    ")  # tab → 4 spaces
        else:
            # non-printable / non-ASCII → "?"
            out.append("?")
    return "".join(out)


def _content_stream(lines: list[str]) -> bytes:
    parts: list[str] = ["BT", f"/F1 {FONT_SIZE} Tf", f"{MARGIN_LEFT} {MARGIN_TOP} Td"]
    parts.append(f"({_escape_pdf_text(lines[0]) if lines else ''}) Tj")
    for line in lines[1:]:
        parts.append(f"0 -{LINE_HEIGHT} Td")
        parts.append(f"({_escape_pdf_text(line)}) Tj")
    parts.append("ET")
    return ("\n".join(parts) + "\n").encode("ascii")


def _build_pdf(lines: list[str], *, deflate: bool = True) -> bytes:
    # Paginate
    pages: list[list[str]] = []
    for i in range(0, max(1, len(lines)), MAX_LINES_PER_PAGE):
        pages.append(lines[i: i + MAX_LINES_PER_PAGE])
    if not pages:
        pages = [[""]]

    objects: list[bytes] = []
    def add_object(payload: bytes) -> int:
        objects.append(payload)
        return len(objects)   # 1-indexed object number

    # Object 1: Catalog (referenced as 1 0 R)
    # Object 2: Pages tree
    # Object 3: Font Courier
    # Objects 4..(3+n): Page objects
    # Objects (4+n)..(4+2n-1): Content streams
    n = len(pages)
    page_obj_ids = [4 + i for i in range(n)]
    content_obj_ids = [4 + n + i for i in range(n)]

    catalog = b"<< /Type /Catalog /Pages 2 0 R >>"
    pages_kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    pages_obj = (
        f"<< /Type /Pages /Count {n} /Kids [{pages_kids}] >>"
    ).encode("ascii")
    font_obj = (
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"
    )
    add_object(catalog)
    add_object(pages_obj)
    add_object(font_obj)

    # Page objects
    for cid in content_obj_ids:
        page_dict = (
            f"<< /Type /Page /Parent 2 0 R "
            f"/MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 3 0 R >> >> "
            f"/Contents {cid} 0 R >>"
        ).encode("ascii")
        add_object(page_dict)

    # Content streams
    for page_lines in pages:
        body = _content_stream(page_lines)
        if deflate:
            compressed = zlib.compress(body)
            stream_obj = (
                f"<< /Length {len(compressed)} /Filter /FlateDecode >>\n"
                f"stream\n"
            ).encode("ascii") + compressed + b"\nendstream"
        else:
            stream_obj = (
                f"<< /Length {len(body)} >>\nstream\n"
            ).encode("ascii") + body + b"endstream"
        add_object(stream_obj)

    # Assemble file
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    body_parts: list[bytes] = [header]
    offsets: list[int] = []
    cursor = len(header)
    for i, obj in enumerate(objects, start=1):
        offsets.append(cursor)
        chunk = (
            f"{i} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
        )
        body_parts.append(chunk)
        cursor += len(chunk)

    xref_start = cursor
    xref_lines = [f"xref\n0 {len(objects) + 1}\n",
                  "0000000000 65535 f \n"]
    for off in offsets:
        xref_lines.append(f"{off:010d} 00000 n \n")
    xref_blob = "".join(xref_lines).encode("ascii")
    body_parts.append(xref_blob)

    trailer = (
        f"trailer\n"
        f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_start}\n%%EOF\n"
    ).encode("ascii")
    body_parts.append(trailer)

    return b"".join(body_parts)


def text_to_pdf(text: str, *, deflate: bool = True) -> bytes:
    """Render a multi-line plain-text string into a PDF 1.4 byte blob."""
    lines = text.splitlines()
    return _build_pdf(lines, deflate=deflate)


def emit_pdf(
    text: str,
    out_path: Path,
    *,
    deflate: bool = True,
) -> PDFEmitReport:
    blob = text_to_pdf(text, deflate=deflate)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(blob)

    n_lines = len(text.splitlines())
    n_pages = max(1, (n_lines + MAX_LINES_PER_PAGE - 1) // MAX_LINES_PER_PAGE)
    return PDFEmitReport(
        out_path=str(out_path),
        n_pages=n_pages,
        n_input_lines=n_lines,
        sha256=hashlib.sha256(blob).hexdigest(),
        size_bytes=len(blob),
    )
