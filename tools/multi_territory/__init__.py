"""W53 — Multi-Territory Cert Builder.

End-to-end orchestrator that turns a single IR + a set of jurisdiction
profiles into ONE cross-territory release ZIP, chaining:

  1. Per-profile compliance lint (W-jurisdiction-check / linter.py)
  2. Unified v2 cert XML with per-jurisdiction provenance branches
     (W51 cert_xml_v2)
  3. Plugin marketplace verifier round-trip on the bundled ZIP
     (W52 marketplace verifier)

Output:

    multi_territory_<game_id>_<utc>.zip
       ├─ ir.json
       ├─ cert.v2.xml
       ├─ jurisdictions/
       │    ├─ <profile_1>.compliance.json
       │    └─ <profile_2>.compliance.json
       ├─ marketplace_verify.json
       └─ manifest.sha256.txt

The ZIP itself is then published+verified through the marketplace
plumbing so the same artifact is byte-identical end-to-end. The
combined report is exit-1 if ANY profile fails compliance OR the
marketplace round-trip detects tampering.
"""
from tools.multi_territory.builder import (
    MultiTerritoryReport,
    PerJurisdictionResult,
    build_multi_territory_release,
)

__all__ = [
    "MultiTerritoryReport",
    "PerJurisdictionResult",
    "build_multi_territory_release",
]
