"""W27 — Per-game mathematical documentation generator.

Walks an IR + (optional) MC report and emits a Markdown / LaTeX-
ready document with: game spec, topology, paytable table, feature
list, RTP target vs measured, jurisdiction-compatibility matrix.

Regulators and commercial publishers prefer a written "math
specification" alongside the cert ZIP; this tool generates one
deterministically from the IR + MC, no manual write-up needed.
"""
from .generator import (
    DocSection,
    GameMathDoc,
    generate_math_doc,
    emit_math_doc,
)

__all__ = [
    "DocSection",
    "GameMathDoc",
    "generate_math_doc",
    "emit_math_doc",
]
