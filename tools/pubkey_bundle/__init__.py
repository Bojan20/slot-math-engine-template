"""W68 — Marketplace Pub-key Bundle.

Produces a signed registry of `(plugin_id, version, pubkey_pem_sha256)`
entries so a marketplace consumer can pin exactly which publishers'
keys it trusts before downloading any plugin.

Two modes:

  * **build** — walk a directory of `<plugin_id>/<version>/public.pem`
    files, hash each, emit `pubkey_bundle.json` + optional ed25519
    `pubkey_bundle.sig` (the operator's master key signs the canonical
    JSON).
  * **verify** — re-hash each pubkey PEM and confirm the bundle
    signature (when a master pubkey is provided).

The bundle slots straight into W51 cert XML v2 ``MultiJurisdiction``
provenance: each ``JurisdictionProvenance`` element can reference an
entry id from the bundle, giving the regulator a single canonical
key registry across all markets.
"""
from tools.pubkey_bundle.bundle import (
    BundleEntry,
    BundleReport,
    VerifyReport,
    build_bundle,
    verify_bundle,
    canonical_json,
)

__all__ = [
    "BundleEntry",
    "BundleReport",
    "VerifyReport",
    "build_bundle",
    "verify_bundle",
    "canonical_json",
]
