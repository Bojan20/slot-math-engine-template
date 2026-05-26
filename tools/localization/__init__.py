"""W23 — IR Multi-language Localization.

Many IRs carry English strings (`meta.name`, `meta.description`,
feature labels, paytable comments). Operators distributing to non-
English markets need a deterministic localization pipeline.

Approach: per-locale YAML/JSON translation catalog keyed by the
canonical English string. `localize_ir(ir, locale, catalog)` walks
known string fields and substitutes from the catalog; missing keys
fall back to the original English (operator-visible warning).

API:
    from tools.localization import (
        load_catalog,
        localize_ir,
        list_localizable_strings,
        TranslationCatalog,
    )
"""
from .translator import (
    TranslationCatalog,
    list_localizable_strings,
    load_catalog,
    localize_ir,
    save_catalog,
)

__all__ = [
    "TranslationCatalog",
    "list_localizable_strings",
    "load_catalog",
    "localize_ir",
    "save_catalog",
]
