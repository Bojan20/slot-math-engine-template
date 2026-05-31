"""SLOT-MATH Faza 4.8 — Multi-jurisdiction RTP clamp + compliance profiles.

Defines per-jurisdiction profiles (RTP range, max bet, autoplay rules, etc.)
applied at RGS layer. Each jurisdiction is a freeze-frame of regulatory
requirements as of mid-2026 (UKGC RTS, MGA Player Protection Directives,
DGOJ Articles 17-20, KSA Cruks integration, etc.).

NOT a substitute for legal sign-off — these are engineering encodings of
publicly available regulator specs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class JurisdictionProfile:
    """One jurisdiction's machine-readable compliance envelope."""
    code: str
    name: str
    rtp_min: float
    rtp_max: float
    max_bet_currency: str
    max_bet_amount: float
    min_spin_duration_ms: int  # RTS 14D et al
    autoplay_allowed: bool
    turbo_allowed: bool
    ldw_disclosure_required: bool
    session_time_display_required: bool
    crypto_rng_required: bool  # CSPRNG flag
    bonus_wagering_cap_x: float | None
    notes: str = ""


# As of mid-2026; subject to regulator updates
JURISDICTIONS: dict[str, JurisdictionProfile] = {
    "UKGC": JurisdictionProfile(
        code="UKGC",
        name="UK Gambling Commission (Great Britain)",
        rtp_min=0.92,
        rtp_max=0.98,
        max_bet_currency="GBP",
        max_bet_amount=5.0,  # SI 2025/215 default cap
        min_spin_duration_ms=2500,  # RTS 14D
        autoplay_allowed=False,
        turbo_allowed=False,
        ldw_disclosure_required=True,
        session_time_display_required=True,
        crypto_rng_required=True,
        bonus_wagering_cap_x=10.0,
        notes="SI 2025/215 stake cap + RTS 14D pace + RTS 7 CSPRNG",
    ),
    "MGA": JurisdictionProfile(
        code="MGA",
        name="Malta Gaming Authority",
        rtp_min=0.92,
        rtp_max=0.99,
        max_bet_currency="EUR",
        max_bet_amount=100.0,
        min_spin_duration_ms=2000,
        autoplay_allowed=False,
        turbo_allowed=False,
        ldw_disclosure_required=True,
        session_time_display_required=True,
        crypto_rng_required=True,
        bonus_wagering_cap_x=None,
        notes="Player Protection Directive 2021, Art. 11 CSPRNG",
    ),
    "GLI-19": JurisdictionProfile(
        code="GLI-19",
        name="Gaming Laboratories International — Standard 19",
        rtp_min=0.75,
        rtp_max=0.99,
        max_bet_currency="USD",
        max_bet_amount=1000.0,
        min_spin_duration_ms=1000,
        autoplay_allowed=True,
        turbo_allowed=True,
        ldw_disclosure_required=False,
        session_time_display_required=False,
        crypto_rng_required=True,
        bonus_wagering_cap_x=None,
        notes="GLI-19 §3.3.2 CSPRNG; commercial cert lab standard",
    ),
    "QC-RACJ": JurisdictionProfile(
        code="QC-RACJ",
        name="Quebec Régie des alcools, des courses et des jeux",
        rtp_min=0.85,
        rtp_max=0.99,
        max_bet_currency="CAD",
        max_bet_amount=100.0,
        min_spin_duration_ms=2500,
        autoplay_allowed=False,
        turbo_allowed=False,
        ldw_disclosure_required=True,
        session_time_display_required=True,
        crypto_rng_required=False,  # Non-crypto allowed if equivalent statistical proofs
        bonus_wagering_cap_x=None,
        notes="Loto-Québec province standard; bilingual UI mandatory",
    ),
    "DGOJ": JurisdictionProfile(
        code="DGOJ",
        name="España Dirección General de Ordenación del Juego",
        rtp_min=0.90,
        rtp_max=0.98,
        max_bet_currency="EUR",
        max_bet_amount=20.0,
        min_spin_duration_ms=2500,
        autoplay_allowed=False,
        turbo_allowed=False,
        ldw_disclosure_required=True,
        session_time_display_required=True,
        crypto_rng_required=True,
        bonus_wagering_cap_x=None,
        notes="Real Decreto 958/2020 + Orden CNS/1377/2022",
    ),
    "KSA": JurisdictionProfile(
        code="KSA",
        name="Kansspelautoriteit (Netherlands)",
        rtp_min=0.92,
        rtp_max=0.97,
        max_bet_currency="EUR",
        max_bet_amount=100.0,
        min_spin_duration_ms=3000,
        autoplay_allowed=False,
        turbo_allowed=False,
        ldw_disclosure_required=True,
        session_time_display_required=True,
        crypto_rng_required=True,
        bonus_wagering_cap_x=None,
        notes="KOA Act 2021 + Cruks self-exclusion integration",
    ),
    "GENERIC": JurisdictionProfile(
        code="GENERIC",
        name="Generic / Pre-cert sandbox",
        rtp_min=0.50,
        rtp_max=0.99,
        max_bet_currency="USD",
        max_bet_amount=1000.0,
        min_spin_duration_ms=0,
        autoplay_allowed=True,
        turbo_allowed=True,
        ldw_disclosure_required=False,
        session_time_display_required=False,
        crypto_rng_required=False,
        bonus_wagering_cap_x=None,
        notes="No constraints — for development/testing only",
    ),
}


def clamp_rtp_for_jurisdiction(rtp: float, jurisdiction_code: str) -> float:
    """Clamp RTP to jurisdiction-allowed range. Returns clamped value."""
    profile = JURISDICTIONS.get(jurisdiction_code.upper())
    if profile is None:
        return rtp  # unknown jurisdiction → pass-through
    return max(profile.rtp_min, min(profile.rtp_max, rtp))


def validate_ir_against_jurisdiction(
    ir: dict[str, Any], jurisdiction_code: str
) -> list[str]:
    """Return list of compliance violations for IR vs jurisdiction profile.

    Empty list = compliant. Caller decides whether violations are blocking
    or auto-fix-able.
    """
    profile = JURISDICTIONS.get(jurisdiction_code.upper())
    if profile is None:
        return [f"unknown jurisdiction: {jurisdiction_code}"]

    issues: list[str] = []
    limits = ir.get("limits", {})
    rtp = limits.get("target_rtp", 0.96)
    if not (profile.rtp_min <= rtp <= profile.rtp_max):
        issues.append(
            f"target_rtp {rtp:.4f} outside {profile.code} range "
            f"[{profile.rtp_min}, {profile.rtp_max}]"
        )

    bet = ir.get("bet", {})
    if bet.get("base_bet", 1.0) > profile.max_bet_amount:
        issues.append(
            f"base_bet {bet.get('base_bet')} > {profile.code} max "
            f"{profile.max_bet_amount} {profile.max_bet_currency}"
        )

    rng = ir.get("rng", {})
    if profile.crypto_rng_required:
        crypto_kinds = {"chacha20", "aes_ctr_drbg"}
        if rng.get("kind") not in crypto_kinds:
            issues.append(
                f"RNG {rng.get('kind')} is not crypto; {profile.code} requires CSPRNG"
            )

    compliance = ir.get("compliance", {})
    if profile.ldw_disclosure_required and not compliance.get("ldw_disclosure", False):
        issues.append(f"{profile.code} requires ldw_disclosure: true in IR.compliance")

    if profile.session_time_display_required and not compliance.get("session_time_display", False):
        issues.append(f"{profile.code} requires session_time_display: true")

    return issues


def all_jurisdictions_for_ir(ir: dict[str, Any]) -> list[str]:
    """Return list of jurisdictions declared in IR.compliance."""
    return ir.get("compliance", {}).get("jurisdictions", [])
