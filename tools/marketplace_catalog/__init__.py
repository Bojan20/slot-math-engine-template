"""W75 / P7.1 — Marketplace Template Catalog Builder.

Aggregates every game IR in a repo into a marketplace-ready catalog
with per-template metadata: title, vendor, target RTP, volatility
class, feature kinds, pricing tier, demo URL, cover image placeholder,
and a lead-gen blurb. Outputs:

  * ``marketplace.json``  — machine-readable catalog (consumed by
    `slot-marketplace-ui` and any external listing portal)
  * ``marketplace.md``    — human-readable Markdown listing
  * ``cards/``            — per-template Markdown card files

Pricing tiers are inferred from feature complexity + jurisdiction
coverage:
  * FREE   — open-source baseline (0–1 features, generic vendor)
  * BASIC  — €499 / €999 / €1999 yearly (2–3 features, 1 jurisdiction)
  * PREMIUM — €4999 / €9999 yearly (4+ features, multi-jurisdiction)

Public API: ``build_catalog(games_root, out_dir) -> MarketplaceCatalog``.
"""
from tools.marketplace_catalog.builder import (
    MarketplaceCatalog,
    TemplateCard,
    PricingTier,
    build_catalog,
    emit_catalog,
)

__all__ = [
    "MarketplaceCatalog",
    "TemplateCard",
    "PricingTier",
    "build_catalog",
    "emit_catalog",
]
