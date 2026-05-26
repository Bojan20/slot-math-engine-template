"""W47 — IR Sanitizer.

Redacts vendor-specific identifiers from an IR so it can be shared
publicly (whitepaper, sample kit, marketing) without leaking
proprietary content. Default redactions:

  • meta.swid, meta.vendor → "REDACTED"
  • meta.notes / private_notes → ""
  • Any string field matching the vendor blocklist regex

Round-trippable: keep `meta.id` (stable, public-safe).
"""
from tools.ir_sanitizer.sanitizer import (
    SanitizeReport,
    sanitize_ir,
    DEFAULT_REDACTIONS,
)

__all__ = [
    "SanitizeReport",
    "sanitize_ir",
    "DEFAULT_REDACTIONS",
]
