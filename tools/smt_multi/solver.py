"""Multi-constraint SMT (or stdlib fallback) IR synthesizer.

The constraint surface is the **paytable scale factor** k ∈ (0, inf):

    pays'[sym, n] = k · pays[sym, n]

…and downstream estimates derive from a closed-form parametric model:

    RTP(k)        = k · base_rtp_at_unit
    Variance(k)   = k² · base_variance_at_unit
    Max-win(k)    = k · base_max_win_at_unit
    Hit-freq(k)   = base_hit_freq   (scale-invariant)

So in 1-D the system reduces to interval intersection on k:

    rtp_target / base_rtp                    (equality with eps band)
    sqrt(var_max / base_variance)            (upper bound)
    win_max / base_max_win                   (upper bound)
    hit_min ≤ base_hit_freq                  (decision, k-independent)

When all bounds intersect we report SAT with a witness; otherwise
UNSAT with per-constraint diagnostic slack.

Z3 surface (when available) extends this to multi-variable solves
where individual paytable entries can be free Real vars; the stdlib
fallback is sufficient for the most-common operator workflow
("scale our existing paytable to hit GLI-19 target").
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Any


class SmtUnavailable(RuntimeError):
    """Raised when z3 is missing AND the requested mode needs it."""


# ─── Constraint spec ───────────────────────────────────────────────


@dataclass
class ConstraintSpec:
    target_rtp: float
    rtp_epsilon: float = 1e-4
    var_max: float | None = None
    win_max: float | None = None
    hit_freq_min: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_rtp": self.target_rtp,
            "rtp_epsilon": self.rtp_epsilon,
            "var_max": self.var_max,
            "win_max": self.win_max,
            "hit_freq_min": self.hit_freq_min,
        }


@dataclass
class SlackReport:
    rtp_band_lo: float
    rtp_band_hi: float
    var_upper_k: float | None        # max k allowed by var_max
    win_upper_k: float | None        # max k allowed by win_max
    hit_freq_ok: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "rtp_band_lo": self.rtp_band_lo,
            "rtp_band_hi": self.rtp_band_hi,
            "var_upper_k": self.var_upper_k,
            "win_upper_k": self.win_upper_k,
            "hit_freq_ok": self.hit_freq_ok,
        }


@dataclass
class ConstraintSatisfaction:
    sat: bool
    scale_k: float | None
    achieved_rtp: float | None
    achieved_variance: float | None
    achieved_max_win: float | None
    hit_freq: float | None
    slack: SlackReport | None
    reason: str = ""
    spec: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sat": self.sat,
            "scale_k": self.scale_k,
            "achieved_rtp": self.achieved_rtp,
            "achieved_variance": self.achieved_variance,
            "achieved_max_win": self.achieved_max_win,
            "hit_freq": self.hit_freq,
            "slack": self.slack.to_dict() if self.slack else None,
            "reason": self.reason,
            "spec": dict(self.spec),
        }


# ─── Base estimators ───────────────────────────────────────────────


def _iter_paytable(ir: dict[str, Any]):
    for row in ir.get("paytable") or []:
        if not isinstance(row, dict):
            continue
        combo = row.get("combo")
        pays = row.get("pays")
        if not isinstance(combo, list) or not combo:
            continue
        if not isinstance(pays, (int, float)):
            continue
        yield combo, float(pays)


def _symbol_prob(ir: dict[str, Any], sym: str, reel_idx: int) -> float:
    reels = (ir.get("reels") or {}).get("base") or []
    if reel_idx >= len(reels):
        return 0.0
    strip = reels[reel_idx]
    if not strip:
        return 0.0
    return strip.count(sym) / len(strip)


def _line_probability(ir: dict[str, Any], combo: list[str]) -> float:
    """Product of per-reel symbol probabilities for one payline."""
    p = 1.0
    for i, sym in enumerate(combo):
        ps = _symbol_prob(ir, sym, i)
        p *= ps
    return p


def estimate_rtp(ir: dict[str, Any], scale_k: float = 1.0) -> float:
    """Closed-form RTP estimate under the per-line symbol-product model."""
    total = 0.0
    for combo, pays in _iter_paytable(ir):
        total += scale_k * pays * _line_probability(ir, combo)
    return total


def estimate_variance(ir: dict[str, Any], scale_k: float = 1.0) -> float:
    """E[X^2] - (E[X])^2 over per-line outcomes."""
    mean = estimate_rtp(ir, scale_k)
    e_x2 = 0.0
    for combo, pays in _iter_paytable(ir):
        prob = _line_probability(ir, combo)
        e_x2 += (scale_k * pays) ** 2 * prob
    return max(0.0, e_x2 - mean ** 2)


def estimate_max_win(ir: dict[str, Any], scale_k: float = 1.0) -> float:
    return max(
        (scale_k * pays for _, pays in _iter_paytable(ir)),
        default=0.0,
    )


def estimate_hit_freq(ir: dict[str, Any]) -> float:
    return sum(_line_probability(ir, combo) for combo, _ in _iter_paytable(ir))


# ─── Synthesizer ───────────────────────────────────────────────────


def synthesize_paytable_scale(
    ir: dict[str, Any], spec: ConstraintSpec,
) -> ConstraintSatisfaction:
    """Find k > 0 such that RTP(k) ∈ [target ± eps] AND var ≤ var_max
    AND max_win ≤ win_max AND hit_freq ≥ hit_freq_min.

    Returns SAT verdict + witness + per-constraint slack diagnostics.
    """
    base_rtp = estimate_rtp(ir, 1.0)
    base_var = estimate_variance(ir, 1.0)
    base_max = estimate_max_win(ir, 1.0)
    hit_freq = estimate_hit_freq(ir)

    if base_rtp <= 0:
        return ConstraintSatisfaction(
            sat=False, scale_k=None, achieved_rtp=0.0,
            achieved_variance=base_var, achieved_max_win=base_max,
            hit_freq=hit_freq, slack=None,
            reason="degenerate IR: base RTP is zero (paytable or reels empty?)",
            spec=spec.to_dict(),
        )

    # RTP band on k
    k_lo = (spec.target_rtp - spec.rtp_epsilon) / base_rtp
    k_hi = (spec.target_rtp + spec.rtp_epsilon) / base_rtp
    k_lo = max(k_lo, 1e-12)

    # Variance upper bound on k (var grows ∝ k^2)
    k_var_max = None
    if spec.var_max is not None and base_var > 0:
        k_var_max = math.sqrt(spec.var_max / base_var)

    # Max-win upper bound on k (max_win grows ∝ k)
    k_win_max = None
    if spec.win_max is not None and base_max > 0:
        k_win_max = spec.win_max / base_max

    # Hit-freq is k-invariant; check once
    hit_freq_ok = (
        spec.hit_freq_min is None or hit_freq >= spec.hit_freq_min
    )

    slack = SlackReport(
        rtp_band_lo=k_lo, rtp_band_hi=k_hi,
        var_upper_k=k_var_max, win_upper_k=k_win_max,
        hit_freq_ok=hit_freq_ok,
    )

    if not hit_freq_ok:
        return ConstraintSatisfaction(
            sat=False, scale_k=None, achieved_rtp=base_rtp,
            achieved_variance=base_var, achieved_max_win=base_max,
            hit_freq=hit_freq, slack=slack,
            reason=(
                f"hit_freq={hit_freq:.4f} below min "
                f"{spec.hit_freq_min}"
            ),
            spec=spec.to_dict(),
        )

    upper = k_hi
    if k_var_max is not None:
        upper = min(upper, k_var_max)
    if k_win_max is not None:
        upper = min(upper, k_win_max)

    if upper < k_lo - 1e-12:
        which = "RTP band"
        if k_var_max is not None and k_var_max < k_lo:
            which = f"variance cap (k_var_max={k_var_max:.6g})"
        elif k_win_max is not None and k_win_max < k_lo:
            which = f"max_win cap (k_win_max={k_win_max:.6g})"
        return ConstraintSatisfaction(
            sat=False, scale_k=None,
            achieved_rtp=base_rtp * k_lo,
            achieved_variance=base_var * k_lo ** 2,
            achieved_max_win=base_max * k_lo,
            hit_freq=hit_freq, slack=slack,
            reason=f"UNSAT: {which} excludes the RTP band [{k_lo:.6g}, {k_hi:.6g}]",
            spec=spec.to_dict(),
        )

    # Pick the witness at the centre of the intersection [k_lo, upper]
    k_star = (k_lo + min(upper, k_hi)) / 2.0
    return ConstraintSatisfaction(
        sat=True,
        scale_k=k_star,
        achieved_rtp=base_rtp * k_star,
        achieved_variance=base_var * k_star ** 2,
        achieved_max_win=base_max * k_star,
        hit_freq=hit_freq,
        slack=slack,
        reason="SAT — paytable scale k synthesized",
        spec=spec.to_dict(),
    )
