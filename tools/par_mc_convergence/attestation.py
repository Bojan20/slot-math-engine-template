"""SLOT-MATH Faza 3.6 — MC attestation emit.

Generates the canonical `mc_sweep.attestation.json` file that proves
the entire MC sweep was executed exactly as declared. Pinned by Merkle
so regulator can re-run with same seeds and verify byte-identical result.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from tools.par_mc_convergence.compare import ComparisonResult, MeasuredMetrics
from tools.par_mc_convergence.tiers import Tier, TIERS


def emit_attestation(
    game_id: str,
    variant_id: str,
    tier: Tier,
    seeds: list[int],
    measured: MeasuredMetrics,
    comparison: ComparisonResult,
    par_merkle: str,
    ir_merkle: str,
    runtime_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build canonical attestation dict (serialisable to JSON, deterministic)."""
    config = TIERS[tier]
    runtime_info = runtime_info or {}

    attestation: dict[str, Any] = {
        "schema": "slot-math-mc-attestation/v1",
        "game_id": game_id,
        "variant_id": variant_id,
        "tier": tier.value,
        "par_merkle_sha256": par_merkle,
        "ir_merkle_sha256": ir_merkle,
        "tier_config": {
            "spins_per_seed": config.spins_per_seed,
            "seed_count": config.seed_count,
            "total_spins": config.total_spins,
            "description": config.description,
        },
        "seeds": [str(s) for s in seeds],  # JSON-safe (u64 → string for portability)
        "measured": {
            "total_spins": measured.total_spins,
            "seed_count": measured.seed_count,
            "rtp": measured.rtp,
            "hits": measured.hits,
            "hit_freq": measured.hit_freq,
            "variance": measured.variance,
            "max_win_x": measured.max_win_x,
            "p99_9_win_x": measured.p99_9_win_x,
            "feature_trigger_counts": dict(measured.feature_trigger_counts),
            "per_seed_rtps": list(measured.per_seed_rtps),
        },
        "comparison": {
            "overall_pass": comparison.overall_pass,
            "failed_count": comparison.failed_count,
            "cross_seed_cv": comparison.cross_seed_cv,
            "deltas": [
                {
                    "name": d.name,
                    "target": d.target,
                    "measured": d.measured,
                    "tolerance": d.tolerance,
                    "passed": d.passed,
                    "notes": d.notes,
                }
                for d in comparison.deltas
            ],
        },
        "runtime": {
            "hostname": runtime_info.get("hostname", "unknown"),
            "cpu": runtime_info.get("cpu", "unknown"),
            "rust_version": runtime_info.get("rust_version", "unknown"),
            "python_version": runtime_info.get("python_version", "unknown"),
            "wallclock_seconds": runtime_info.get("wallclock_seconds", 0.0),
        },
    }
    attestation["attestation_sha256"] = attestation_merkle_sha256(attestation)
    return attestation


def attestation_merkle_sha256(attestation: dict[str, Any]) -> str:
    """Compute sha256 over attestation bytes (excluding the field itself).

    Deterministic: sorted keys, compact separators.
    """
    payload_copy = dict(attestation)
    payload_copy.pop("attestation_sha256", None)
    payload = json.dumps(payload_copy, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def attestation_to_json_bytes(attestation: dict[str, Any]) -> bytes:
    """Canonical JSON bytes (sorted keys, indent=2 for diff-friendliness)."""
    return json.dumps(attestation, sort_keys=True, indent=2).encode("utf-8") + b"\n"
