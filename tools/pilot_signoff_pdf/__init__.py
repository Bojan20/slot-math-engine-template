"""W70 — Pilot Sign-off PDF (pure-stdlib PDF 1.4 emitter).

Upgrades W64's ANSI sign-off page to a real PDF the regulator can
drop into their archive system. Implementation is hand-built atop
PDF 1.4 primitives — NO external library. Uses only stdlib:
``hashlib``, ``zlib``, ``struct``, ``re``.

The emitter writes a minimal-but-valid PDF:

  * Header   ``%PDF-1.4`` + binary marker comment
  * Catalog  /Pages /Type
  * Pages    one page per ~50 lines of input text
  * Resources /Font /F1 Courier
  * Content stream  per-page BT…Tj…ET sequence
  * Xref table + trailer with /Size /Root

The PDF reader-grade fidelity isn't full-typeset — it's a
mono-spaced text dump using the standard Courier font (so no
embedded font tables). Regulators that scan + OCR the page get
identical content to the ANSI rendering.
"""
from tools.pilot_signoff_pdf.pdf import (
    PDFEmitReport,
    emit_pdf,
    text_to_pdf,
)

__all__ = [
    "PDFEmitReport",
    "emit_pdf",
    "text_to_pdf",
]
