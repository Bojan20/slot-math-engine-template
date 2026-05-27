"""PHASE 33 — Cross-Vendor IR Translator.

Translates between vendor-flavored IR dialects (Vendor A ↔ Vendor B ↔
universal slot-sim IR) by renaming fields + remapping enum values.
Translation table is data-driven so adding a new vendor is a config
edit, not a code change.

Public API:
    from tools.vendor_translator import (
        translate_ir,
        list_supported_vendors,
        TranslationReport,
    )
"""

from __future__ import annotations

from tools.vendor_translator.translator import (
    translate_ir,
    list_supported_vendors,
    TranslationReport,
)

__all__ = ["translate_ir", "list_supported_vendors", "TranslationReport"]
