"""SLOT-MATH Faza 6.1 — KPI diff + statistical significance for canary vs live.

Compares aggregate KPIs (RTP measured, hit-freq, avg session length,
revenue per spin) and decides if canary's delta is statistically
meaningful or just noise.

Uses 2-sample z-test on per-spin payout (large N approximation valid
since canary + live typically have ≥10k spins each in production).
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class KpiSnapshot:
    """Aggregate KPI for one variant over a measurement window."""
    variant_id: str
    spins: int
    total_payout: float        # sum of all payouts in base-bet units
    total_hits: int            # paying spins
    sum_sq_payout: float       # for variance reconstruction
    distinct_sessions: int     # unique session count

    @property
    def rtp(self) -> float:
        return self.total_payout / self.spins if self.spins else 0.0

    @property
    def hit_freq(self) -> float:
        return self.total_hits / self.spins if self.spins else 0.0

    @property
    def variance(self) -> float:
        if self.spins < 2:
            return 0.0
        mean = self.rtp
        e_xx = self.sum_sq_payout / self.spins
        return max(0.0, e_xx - mean * mean)

    @property
    def avg_session_length_spins(self) -> float:
        return self.spins / self.distinct_sessions if self.distinct_sessions else 0.0


@dataclass
class SignificanceVerdict:
    """Result of the diff test."""
    rtp_delta: float           # canary.rtp - live.rtp
    rtp_z_score: float
    rtp_p_value: float
    rtp_significant: bool      # True if |z| > z_threshold
    hit_freq_delta: float
    session_length_delta: float
    recommendation: str        # "promote-canary" | "keep-live" | "insufficient-data"


def _two_sided_p_value_normal_approx(z: float) -> float:
    """Approximate two-sided p-value from a standard normal z-score.

    Uses Abramowitz-Stegun 26.2.17 — accurate to ~1e-7 for |z| < 7.5.
    """
    z = abs(z)
    if z > 38.0:  # underflow region
        return 0.0
    # Φ(z) = 1 - φ(z) * (b1·t + b2·t² + b3·t³ + b4·t⁴ + b5·t⁵)
    # where t = 1 / (1 + 0.2316419·z)
    b = (0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429)
    p = 0.2316419
    t = 1.0 / (1.0 + p * z)
    phi = math.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)
    poly = ((((b[4] * t + b[3]) * t + b[2]) * t + b[1]) * t + b[0]) * t
    one_minus_cdf = phi * poly
    return 2.0 * one_minus_cdf


def compute_kpi_diff(
    live: KpiSnapshot,
    canary: KpiSnapshot,
    significance_threshold: float = 0.01,
) -> SignificanceVerdict:
    """Compare canary vs live; decide if delta is significant."""
    # Two-sample z on RTP (variance pooled)
    var_live = live.variance
    var_canary = canary.variance
    se = math.sqrt(
        var_live / max(1, live.spins) + var_canary / max(1, canary.spins)
    )
    rtp_delta = canary.rtp - live.rtp
    z = rtp_delta / se if se > 0 else 0.0
    p = _two_sided_p_value_normal_approx(z) if se > 0 else 1.0

    rtp_sig = p < significance_threshold

    hf_delta = canary.hit_freq - live.hit_freq
    sl_delta = canary.avg_session_length_spins - live.avg_session_length_spins

    # Recommendation logic
    min_spins_each = 10_000
    if live.spins < min_spins_each or canary.spins < min_spins_each:
        rec = "insufficient-data"
    elif rtp_sig and rtp_delta > 0:
        rec = "promote-canary"
    elif rtp_sig and rtp_delta < 0:
        rec = "keep-live"
    else:
        rec = "keep-live"  # no significant diff → conservative default

    return SignificanceVerdict(
        rtp_delta=rtp_delta,
        rtp_z_score=z,
        rtp_p_value=p,
        rtp_significant=rtp_sig,
        hit_freq_delta=hf_delta,
        session_length_delta=sl_delta,
        recommendation=rec,
    )


def is_statistically_significant(
    live: KpiSnapshot,
    canary: KpiSnapshot,
    confidence: float = 0.99,
) -> bool:
    """Shortcut: True if canary RTP differs from live at given confidence."""
    threshold = 1.0 - confidence
    verdict = compute_kpi_diff(live, canary, significance_threshold=threshold)
    return verdict.rtp_significant
