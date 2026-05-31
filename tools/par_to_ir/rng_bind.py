"""SLOT-MATH Faza 2.5 — RNG profile binding per jurisdiction.

Maps IR.compliance.jurisdictions → IR.rng.kind, applying jurisdiction-specific
RNG requirements (e.g. UKGC RTS 7 + MGA Art. 11 require CSPRNG → ChaCha20).
"""
from __future__ import annotations

from typing import Any


# Jurisdiction → required RNG class
# CSPRNG-mandated (crypto-strength): UKGC RTS 7, MGA Art. 11, DGOJ, KSA
CRYPTO_JURISDICTIONS = {"UKGC", "MGA", "DGOJ", "KSA", "ADM", "DE_GL"}

# Default high-quality non-crypto for everything else
DEFAULT_RNG = "pcg64"
CRYPTO_RNG = "chacha20"


def required_rng_for_jurisdictions(jurisdictions: list[str]) -> str:
    """Return RNG kind required for the union of jurisdictions.

    Rule: if ANY jurisdiction requires CSPRNG, return CSPRNG.
    """
    for j in jurisdictions:
        if j.upper() in CRYPTO_JURISDICTIONS:
            return CRYPTO_RNG
    return DEFAULT_RNG


def bind_rng_profile(ir: dict[str, Any], force_kind: str | None = None) -> dict[str, Any]:
    """Mutate ir.rng to match jurisdiction requirement.

    Args:
        ir: Game IR dict
        force_kind: optional explicit RNG kind (overrides jurisdiction logic)

    Returns:
        IR with rng.kind set appropriately.
    """
    if force_kind is not None:
        ir.setdefault("rng", {})["kind"] = force_kind
        return ir

    juris = ir.get("compliance", {}).get("jurisdictions", [])
    required = required_rng_for_jurisdictions(juris)
    ir.setdefault("rng", {})["kind"] = required
    return ir
