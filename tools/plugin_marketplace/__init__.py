"""W52 — Plugin Marketplace Verifier.

Closes the loop on W20 plugin_bundle: builds → publishes → fetches →
re-verifies. Detects any in-transit tampering (zip-body byte flips,
manifest swaps, signature replays).
"""
from tools.plugin_marketplace.registry import (
    MarketplaceRegistry,
    FilesystemMarketplace,
    InMemoryMarketplace,
    PublishReceipt,
    MarketplaceError,
)
from tools.plugin_marketplace.verifier import (
    MarketplaceVerifier,
    RoundTripReport,
)

__all__ = [
    "MarketplaceRegistry",
    "FilesystemMarketplace",
    "InMemoryMarketplace",
    "PublishReceipt",
    "MarketplaceError",
    "MarketplaceVerifier",
    "RoundTripReport",
]
