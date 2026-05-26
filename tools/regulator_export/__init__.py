"""W38 — Regulator Export Package.

Bundles a regulator-ready submission from a game's IR + cert
artifacts. Output: directory with:

  • <game>_ir.json (canonical IR)
  • <game>_ir.sha256.txt (canonical hash)
  • <game>_math_doc.md (designer math doc, W27)
  • <game>_truth_check.json (closed-form truth gate W69, when available)
  • manifest.json (top-level inventory + SHA-256 of each artifact)

Designed so a regulator can verify each artifact independently via
the manifest hashes. No PII, no game logic outside the documented
math envelope.
"""
from tools.regulator_export.exporter import (
    ExportManifest,
    ExportEntry,
    export_game,
    write_manifest,
)

__all__ = [
    "ExportManifest",
    "ExportEntry",
    "export_game",
    "write_manifest",
]
