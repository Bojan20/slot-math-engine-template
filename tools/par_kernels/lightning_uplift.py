"""SLOT-MATH W244 — base-game lightning multiplier RTP uplift.

Closes the `lightning_uplift` delegated baseline. Computes per-spin RTP
contribution from a Bernoulli-triggered multiplier applied to winning
base-game spins.

Formula (matches Wrath's `closed-form-rtp.mjs`):
    lightning_uplift = base_rtp × P(lightning) × (E[mult] - 1)

The "-1" is because the multiplier MULTIPLIES the existing win (1× is the
no-op baseline), so the UPLIFT contribution is (mult - 1) over the
already-counted base RTP.

E[mult] computed as weighted sum over published `distribution`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LightningUpliftParams:
    """Inputs for lightning multiplier RTP uplift."""
    base_rtp: float                          # already-computed base-line RTP
    trigger_p: float                         # P(lightning fires on a winning spin)
    multiplier_distribution: dict[float, float]  # {mult_value: weight}

    def __post_init__(self):
        if self.base_rtp < 0:
            raise ValueError("base_rtp must be ≥ 0")
        if not (0.0 <= self.trigger_p <= 1.0):
            raise ValueError("trigger_p must be in [0, 1]")
        if not self.multiplier_distribution:
            raise ValueError("multiplier_distribution required")


def lightning_uplift_rtp(params: LightningUpliftParams) -> dict[str, Any]:
    """Per-spin RTP contribution from lightning multiplier."""
    total_w = sum(params.multiplier_distribution.values())
    if total_w <= 0:
        return {"rtp_contribution": 0.0, "e_mult": 1.0}

    e_mult = sum(v * w / total_w for v, w in params.multiplier_distribution.items())
    uplift_factor = params.trigger_p * (e_mult - 1.0)
    rtp = params.base_rtp * uplift_factor

    return {
        "rtp_contribution": rtp,
        "e_mult": e_mult,
        "uplift_factor": uplift_factor,
        "p_trigger": params.trigger_p,
    }


def build_lightning_params_from_ir(
    ir: dict[str, Any],
    base_rtp: float,
) -> LightningUpliftParams | None:
    """Extract lightning multiplier params from IR.

    Args:
        ir: Game IR
        base_rtp: already-computed base-line RTP (from lines_eval)

    Returns:
        LightningUpliftParams or None if no multiplier feature present.
    """
    for f in ir.get("features", []):
        if f.get("kind") != "multiplier":
            continue
        # Found a multiplier feature
        trigger = f.get("trigger", {})
        trigger_p = float(trigger.get("probability", 0.0))
        dist_raw = f.get("distribution", [])
        if not dist_raw:
            continue
        # Convert list of {value, weight} → {value: weight}
        dist = {}
        for entry in dist_raw:
            v = float(entry.get("value", 0.0))
            w = float(entry.get("weight", 0.0))
            if w > 0:
                dist[v] = w
        if not dist:
            continue
        return LightningUpliftParams(
            base_rtp=base_rtp,
            trigger_p=trigger_p,
            multiplier_distribution=dist,
        )
    return None
