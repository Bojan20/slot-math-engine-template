"""SLOT-MATH W244 — scatter anywhere pays kernel.

Closes the `scatter_pay_base` delegated baseline. Computes per-spin RTP
contribution from scatter-anywhere pays (paid for K ≥ 3 scatters on the
grid regardless of payline position).

Algorithm (matches Wrath's `closed-form-rtp.mjs::scatterCountDistribution`):
  1. Per-reel: P(reel has ≥ 1 scatter on its 3 visible rows), respecting
     scatter_prevention (max 1 scatter per reel).
  2. Convolve 5 independent Bernoulli(P_per_reel) → distribution of total
     scatter count K ∈ {0..reels}.
  3. RTP = Σ K∈{3,4,5} dist[K] × scatter_pays[K].
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from tools.par_kernels.lines_eval import (
    ScatterPrevention,
    _per_reel_symbol_prob,
)


@dataclass(frozen=True)
class ScatterPayParams:
    """Inputs for scatter-anywhere RTP."""
    reel_weights: list[dict[str, int | float]]
    rows: int = 3
    scatter_symbol: str = "S"
    scatter_pays: dict[int, float] = None  # {3:2, 4:3, 5:10}
    scatter_prevention: ScatterPrevention | None = None

    def __post_init__(self):
        if not self.reel_weights:
            raise ValueError("reel_weights required")
        if self.scatter_pays is None or not self.scatter_pays:
            raise ValueError("scatter_pays required")


def _reel_has_scatter_prob(
    reel_p: dict[str, float],
    rows: int,
    scatter_prevention: ScatterPrevention | None,
    scatter_sym: str,
) -> float:
    """P(at least 1 scatter among the 3 visible rows of this reel).

    With scatter_prevention enabled, draws are sampled with replacement
    but additional scatters get REPLACED — so the rule is unchanged for
    "at least 1 scatter present" (the cap only affects which symbol is
    actually shown for excess draws, not whether ANY scatter landed).

    Mathematically: P(reel has ≥1 scatter) = 1 - (1 - p_scatter)^rows
    where p_scatter is the per-cell scatter probability.
    """
    p_scatter = reel_p.get(scatter_sym, 0.0)
    if p_scatter <= 0:
        return 0.0
    return 1.0 - (1.0 - p_scatter) ** rows


def scatter_pay_rtp(params: ScatterPayParams) -> dict[str, Any]:
    """Per-spin RTP from scatter-anywhere pays."""
    reel_probs = _per_reel_symbol_prob(params.reel_weights)
    p_per_reel = [
        _reel_has_scatter_prob(rp, params.rows, params.scatter_prevention,
                                params.scatter_symbol)
        for rp in reel_probs
    ]

    # Convolve N Bernoullis → distribution of total scatter count
    dist = [1.0]
    for p in p_per_reel:
        new = [0.0] * (len(dist) + 1)
        for k in range(len(dist)):
            new[k] += dist[k] * (1.0 - p)
            new[k + 1] += dist[k] * p
        dist = new

    rtp = 0.0
    per_k: dict[int, float] = {}
    for k, pay in params.scatter_pays.items():
        if k < len(dist):
            contrib = dist[k] * pay
            rtp += contrib
            per_k[k] = contrib

    trigger_p = sum(dist[k] for k in range(3, len(dist)))

    return {
        "rtp_contribution": rtp,
        "scatter_count_dist": dist,
        "p_per_reel": p_per_reel,
        "trigger_p": trigger_p,
        "per_k_contribution": per_k,
    }


def build_scatter_pay_params_from_ir(ir: dict[str, Any]) -> ScatterPayParams | None:
    """Extract scatter_pay params from IR.

    Expects:
      - `ir.reels.base[i]` reel weights
      - `ir.reels.scatter_prevention` (optional)
      - `ir.features[*].kind == 'free_spins'` → `scatter_pays`
      - `ir.symbols` with `kind == 'scatter'` → scatter symbol id
    """
    reels = ir.get("reels", {})
    base = reels.get("base")
    if not base or not isinstance(base, list):
        return None

    # Find scatter symbol id
    scatter_id = "S"
    for s in ir.get("symbols", []):
        if s.get("kind") in ("scatter", "sc"):
            scatter_id = s["id"]
            break

    # Find scatter pays from free_spins feature
    scatter_pays_raw = None
    for f in ir.get("features", []):
        if f.get("kind") == "free_spins":
            scatter_pays_raw = f.get("scatter_pays")
            if scatter_pays_raw:
                break
    if not scatter_pays_raw:
        return None
    scatter_pays = {int(k): float(v) for k, v in scatter_pays_raw.items()}

    topology = ir.get("topology", {})
    rows = topology.get("rows", 3)

    sp_raw = reels.get("scatter_prevention", {})
    scatter_prevention = None
    if sp_raw.get("enabled"):
        scatter_prevention = ScatterPrevention(
            enabled=True,
            max_scatters_per_reel=int(sp_raw.get("max_scatters_per_reel", 1)),
            replacement_symbol=sp_raw.get("replacement_symbol", "LA"),
            scatter_symbol=scatter_id,
        )

    return ScatterPayParams(
        reel_weights=base,
        rows=rows,
        scatter_symbol=scatter_id,
        scatter_pays=scatter_pays,
        scatter_prevention=scatter_prevention,
    )
