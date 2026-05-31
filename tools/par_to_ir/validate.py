"""SLOT-MATH Faza 2.3 — IR coverage validation gate.

Hard rule: every PAR field consumed, every required IR field present.
Fails fast on mapping bugs so we never silently drop data.
"""
from __future__ import annotations

from typing import Any


REQUIRED_IR_TOP_LEVEL = {
    "schema_version",
    "meta",
    "topology",
    "symbols",
    "reels",
    "evaluation",
    "paytable",
    "features",
    "rng",
    "bet",
    "limits",
    "compliance",
    "rtp_allocation",
    "provenance",
}


REQUIRED_META_FIELDS = {"id", "name", "version", "theme_tags"}
REQUIRED_BET_FIELDS = {"currency", "base_bet", "denominations"}
REQUIRED_LIMITS_FIELDS = {
    "target_rtp",
    "rtp_tolerance",
    "max_win_x",
    "win_cap_apply",
    "target_volatility",
    "hit_freq_target",
}
REQUIRED_COMPLIANCE_FIELDS = {
    "jurisdictions",
    "rtp_range_required",
    "max_win_cap_required",
    "near_miss_rule",
    "ldw_disclosure",
    "session_time_display",
}
REQUIRED_RTP_ALLOC_FIELDS = {"base_game", "tolerance"}
REQUIRED_PROVENANCE_FIELDS = {"vendor", "par_source", "par_sha256"}


# PAR fields that the mapper MUST consume (not silently drop)
PAR_REQUIRED_FIELDS = {
    "schema",
    "merkle_root_sha256",
    "meta",
    "topology",
    "reels",
    "paytable",
    "rtp",
    "rng_profile",
}


class IrValidationError(Exception):
    """Validator failure — never returns partial IR for downstream consumption."""


def _check_missing(name: str, actual: dict[str, Any], required: set[str]) -> list[str]:
    missing = required - set(actual.keys())
    if missing:
        return [f"{name}.{f} missing" for f in sorted(missing)]
    return []


def validate_ir(ir: dict[str, Any]) -> None:
    """Raise IrValidationError sa konkretnom poruci ako IR fail.

    Calls per-section gate; aggregates all issues for one error.
    """
    issues: list[str] = []

    # Top-level
    issues.extend(_check_missing("ir", ir, REQUIRED_IR_TOP_LEVEL))

    # Meta
    if isinstance(ir.get("meta"), dict):
        issues.extend(_check_missing("ir.meta", ir["meta"], REQUIRED_META_FIELDS))

    # Topology
    topo = ir.get("topology", {})
    if not isinstance(topo, dict) or "kind" not in topo:
        issues.append("ir.topology.kind missing")
    elif topo["kind"] not in {"rectangular", "variable_rows", "cluster_grid"}:
        issues.append(f"ir.topology.kind invalid: {topo['kind']!r}")

    # Symbols
    if not isinstance(ir.get("symbols"), list) or len(ir.get("symbols", [])) == 0:
        issues.append("ir.symbols must be non-empty list")

    # Reels
    reels = ir.get("reels", {})
    if not isinstance(reels, dict) or reels.get("mode") not in {"weighted", "strips"}:
        issues.append("ir.reels.mode must be 'weighted' or 'strips'")
    elif not reels.get("base"):
        issues.append("ir.reels.base missing or empty")

    # Evaluation
    eval_section = ir.get("evaluation", {})
    if not isinstance(eval_section, dict) or "kind" not in eval_section:
        issues.append("ir.evaluation.kind missing")

    # Paytable
    if not isinstance(ir.get("paytable"), dict) or len(ir.get("paytable", {})) == 0:
        issues.append("ir.paytable must be non-empty dict")

    # Features (allowed to be empty list — no-feature games exist)
    if not isinstance(ir.get("features"), list):
        issues.append("ir.features must be list")

    # RNG
    rng = ir.get("rng", {})
    valid_rng = {"mulberry32", "pcg64", "xoshiro256pp", "philox4x32", "aes_ctr_drbg", "chacha20"}
    if rng.get("kind") not in valid_rng:
        issues.append(f"ir.rng.kind invalid: {rng.get('kind')!r}")

    # Bet
    if isinstance(ir.get("bet"), dict):
        issues.extend(_check_missing("ir.bet", ir["bet"], REQUIRED_BET_FIELDS))

    # Limits
    if isinstance(ir.get("limits"), dict):
        issues.extend(_check_missing("ir.limits", ir["limits"], REQUIRED_LIMITS_FIELDS))
        rtp = ir["limits"].get("target_rtp")
        if isinstance(rtp, (int, float)) and not (0.0 <= rtp <= 1.0):
            issues.append(f"ir.limits.target_rtp out of [0,1]: {rtp}")

    # Compliance
    if isinstance(ir.get("compliance"), dict):
        issues.extend(_check_missing("ir.compliance", ir["compliance"], REQUIRED_COMPLIANCE_FIELDS))

    # RTP allocation
    if isinstance(ir.get("rtp_allocation"), dict):
        issues.extend(
            _check_missing("ir.rtp_allocation", ir["rtp_allocation"], REQUIRED_RTP_ALLOC_FIELDS)
        )

    # Provenance
    if isinstance(ir.get("provenance"), dict):
        issues.extend(
            _check_missing("ir.provenance", ir["provenance"], REQUIRED_PROVENANCE_FIELDS)
        )

    if issues:
        raise IrValidationError(
            f"IR validation failed ({len(issues)} issues):\n  - " + "\n  - ".join(issues)
        )


def validate_par_coverage(par: dict[str, Any], ir: dict[str, Any]) -> list[str]:
    """Return list of PAR fields NOT consumed in IR (informational, not blocking).

    Some PAR fields (source, generated_at_utc) are metadata-only and don't need to
    appear in IR. Returns list to allow caller policy decision.
    """
    par_keys = set(par.keys())
    metadata_only = {"schema", "generated_at_utc", "source", "merkle_root_sha256"}
    relevant = par_keys - metadata_only

    consumed = set()
    if "meta" in relevant and "meta" in ir:
        consumed.add("meta")
    if "topology" in relevant and "topology" in ir:
        consumed.add("topology")
    if "symbols" in relevant and "symbols" in ir:
        consumed.add("symbols")
    if "reels" in relevant and "reels" in ir:
        consumed.add("reels")
    if "evaluation" in relevant and "evaluation" in ir:
        consumed.add("evaluation")
    if "paytable" in relevant and "paytable" in ir:
        consumed.add("paytable")
    if "features" in relevant and "features" in ir:
        consumed.add("features")
    if "rtp" in relevant and "rtp_allocation" in ir:
        consumed.add("rtp")
    if "rng_profile" in relevant and "rng" in ir:
        consumed.add("rng_profile")
    if "bet" in relevant and "bet" in ir:
        consumed.add("bet")
    if "limits" in relevant and "limits" in ir:
        consumed.add("limits")
    if "compliance" in relevant and "compliance" in ir:
        consumed.add("compliance")

    unconsumed = relevant - consumed
    return sorted(unconsumed)
