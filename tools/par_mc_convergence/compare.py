"""SLOT-MATH Faza 3.4 — Measured vs PAR comparator (6 metric axes).

Compares aggregate MC measurement (RTP, hit_freq, feature_freq, variance,
max_win quantile, P-quantiles) vs PAR-declared targets per-tier tolerance.

Returns per-metric `MetricDelta` so reporter can dump rich diff.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from tools.par_mc_convergence.tiers import Tier
from tools.par_mc_convergence.wilson import (
    WilsonInterval,
    rtp_tolerance_for_tier,
    within_tolerance,
    within_wilson_ci,
)


# ─── Measurement DTO ────────────────────────────────────────────────────


@dataclass
class MeasuredMetrics:
    """Aggregate MC measurement across all seeds in a tier run.

    Fields are aggregate-across-seeds (e.g. RTP averaged across seeds,
    hit_freq averaged, etc.). Single-seed records live in attestation.json.
    """
    tier: Tier
    total_spins: int          # spins_per_seed × seed_count
    seed_count: int

    # Required: 6 metric axes
    rtp: float                # measured RTP in [0,1]
    hits: int                 # number of paying spins
    hit_freq: float           # hits / total_spins
    variance: float           # Welford variance of per-spin payout
    max_win_x: float          # observed maximum win multiplier
    p99_9_win_x: float        # 99.9th percentile per-spin win

    # Optional: per-feature trigger counts
    feature_trigger_counts: dict[str, int] = field(default_factory=dict)

    # Optional: per-seed RTP for cross-seed determinism check
    per_seed_rtps: list[float] = field(default_factory=list)


@dataclass
class MetricDelta:
    """Per-metric pass/fail with attached numbers."""
    name: str
    target: float
    measured: float
    tolerance: float          # tolerance in same units as target
    passed: bool
    wilson_ci: WilsonInterval | None = None
    notes: str = ""


@dataclass
class ComparisonResult:
    tier: Tier
    overall_pass: bool
    deltas: list[MetricDelta]
    cross_seed_cv: float      # coefficient of variation across per-seed RTPs

    @property
    def failed_count(self) -> int:
        return sum(1 for d in self.deltas if not d.passed)

    def failed_metrics(self) -> list[MetricDelta]:
        return [d for d in self.deltas if not d.passed]


# ─── Comparator ────────────────────────────────────────────────────────


_DEFAULT_CONFIDENCE_PER_TIER = {
    Tier.T1: 0.95,
    Tier.T2: 0.99,
    Tier.T3: 0.99,
    Tier.T4: 0.999,
    Tier.T5: 0.9999,
}


def _cv(values: list[float]) -> float:
    """Coefficient of variation (std / mean). 0 for empty / single-value lists."""
    if len(values) < 2:
        return 0.0
    n = len(values)
    mean = sum(values) / n
    if mean == 0.0:
        return 0.0
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return (var ** 0.5) / abs(mean)


def compare_measured_to_par(
    measured: MeasuredMetrics,
    par: dict[str, Any],
    tier: Tier,
    confidence: float | None = None,
) -> ComparisonResult:
    """Compare measured aggregate metrics vs PAR-declared targets.

    Args:
        measured: aggregate MC measurement
        par: canonical PAR dict (with `rtp`, `features` etc.)
        tier: tier the measurement came from (sets tolerance)
        confidence: Wilson CI level (defaults to per-tier table)

    Returns:
        ComparisonResult with per-metric deltas + overall pass/fail.
    """
    confidence = confidence or _DEFAULT_CONFIDENCE_PER_TIER[tier]
    deltas: list[MetricDelta] = []

    # 1. RTP — absolute tolerance from per-tier table
    target_rtp = float(par.get("rtp", {}).get("rtp_total", 0.96))
    rtp_tol_pp = rtp_tolerance_for_tier(tier)
    rtp_pass = within_tolerance(measured.rtp, target_rtp, rtp_tol_pp)
    deltas.append(MetricDelta(
        name="rtp",
        target=target_rtp,
        measured=measured.rtp,
        tolerance=rtp_tol_pp / 100.0,
        passed=rtp_pass,
        notes=f"tolerance {rtp_tol_pp} pp ({tier.value})",
    ))

    # 2. Hit frequency — Wilson CI
    target_hf = float(
        par.get("limits", {}).get("hit_freq_target", 0.25)
    )
    hf_pass, hf_ci = within_wilson_ci(
        successes=measured.hits,
        n=measured.total_spins,
        target_proportion=target_hf,
        confidence=confidence,
    )
    deltas.append(MetricDelta(
        name="hit_freq",
        target=target_hf,
        measured=measured.hit_freq,
        tolerance=hf_ci.half_width,
        passed=hf_pass,
        wilson_ci=hf_ci,
        notes=f"Wilson CI {confidence:.4f} half-width {hf_ci.half_width:.6f}",
    ))

    # 3. Variance — within ±5% of declared (variance is high-noise, looser gate)
    target_var = float(par.get("rtp", {}).get("variance", 0.0))
    if target_var > 0:
        var_tol = target_var * 0.05
        var_pass = abs(measured.variance - target_var) <= var_tol
        deltas.append(MetricDelta(
            name="variance",
            target=target_var,
            measured=measured.variance,
            tolerance=var_tol,
            passed=var_pass,
            notes="±5% of PAR variance",
        ))

    # 4. Max win cap — must not exceed PAR cap
    target_cap = float(par.get("limits", {}).get("max_win_x", 5000.0))
    cap_pass = measured.max_win_x <= target_cap
    deltas.append(MetricDelta(
        name="max_win_x",
        target=target_cap,
        measured=measured.max_win_x,
        tolerance=0.0,
        passed=cap_pass,
        notes="must not exceed PAR cap",
    ))

    # 5. P99.9 quantile — within ±10% if PAR declares it
    target_p999 = par.get("rtp", {}).get("p99_9_win_x")
    if target_p999 is not None:
        target_p999 = float(target_p999)
        p999_tol = target_p999 * 0.10
        p999_pass = abs(measured.p99_9_win_x - target_p999) <= p999_tol
        deltas.append(MetricDelta(
            name="p99_9_win_x",
            target=target_p999,
            measured=measured.p99_9_win_x,
            tolerance=p999_tol,
            passed=p999_pass,
            notes="±10% of PAR P99.9",
        ))

    # 6. Per-feature trigger frequency — within Wilson CI
    par_features = par.get("features", [])
    for feat in par_features:
        target_trigger_prob = feat.get("trigger_prob")
        if target_trigger_prob is None:
            continue
        kind = feat.get("kind", "unknown")
        feat_hits = measured.feature_trigger_counts.get(kind, 0)
        feat_pass, feat_ci = within_wilson_ci(
            successes=feat_hits,
            n=measured.total_spins,
            target_proportion=float(target_trigger_prob),
            confidence=confidence,
        )
        deltas.append(MetricDelta(
            name=f"feature.{kind}.trigger_freq",
            target=float(target_trigger_prob),
            measured=feat_hits / measured.total_spins if measured.total_spins else 0.0,
            tolerance=feat_ci.half_width,
            passed=feat_pass,
            wilson_ci=feat_ci,
            notes=f"feature trigger Wilson CI {confidence:.4f}",
        ))

    # Cross-seed determinism: CV across per-seed RTPs (must be very small)
    cross_cv = _cv(measured.per_seed_rtps)

    overall_pass = all(d.passed for d in deltas)
    return ComparisonResult(
        tier=tier,
        overall_pass=overall_pass,
        deltas=deltas,
        cross_seed_cv=cross_cv,
    )
