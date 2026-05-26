"""W46 — Compliance Bundle Verifier.

Reads a manifest.json (produced by W38 regulator_export) and
re-hashes every artifact on disk. Reports mismatches so the
regulator can prove the bundle is intact.
"""
from tools.bundle_verify.verifier import (
    VerifyEntry,
    VerifyReport,
    verify_bundle,
)

__all__ = [
    "VerifyEntry",
    "VerifyReport",
    "verify_bundle",
]
