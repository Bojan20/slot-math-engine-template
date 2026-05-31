"""SLOT-MATH Faza 3.3 — Wilson confidence interval.

Wilson score interval is statistically robust for binomial proportions
even at extreme p values (RTP near 1, hit-freq near 0.01). Used to
gate "measured ≡ PAR" decisions at per-tier confidence level.

References:
  Wilson, E. B. (1927). "Probable inference, the law of succession,
  and statistical inference". JASA 22:209-212.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from tools.par_mc_convergence.tiers import Tier


# Two-sided z scores for common confidence levels
_Z_TABLE = {
    0.90: 1.6448536269514722,
    0.95: 1.9599639845400545,
    0.99: 2.5758293035489004,
    0.999: 3.2905267314918945,
    0.9999: 3.890591886413120,
}


@dataclass(frozen=True)
class WilsonInterval:
    """Wilson score CI for a binomial proportion p."""
    point: float
    lower: float
    upper: float
    confidence: float
    n: int

    @property
    def half_width(self) -> float:
        return (self.upper - self.lower) / 2.0


def wilson_ci(successes: int, n: int, confidence: float = 0.99) -> WilsonInterval:
    """Compute Wilson score interval for k successes out of n trials.

    Args:
        successes: count of successes (e.g. spins that hit)
        n: total trials
        confidence: two-sided confidence level (0.5 < c < 1.0)

    Returns:
        WilsonInterval with point estimate + lower/upper bounds.
    """
    if n <= 0:
        raise ValueError(f"n must be positive, got {n}")
    if successes < 0 or successes > n:
        raise ValueError(f"successes ({successes}) must be in [0, n={n}]")
    if not 0.5 < confidence < 1.0:
        raise ValueError(f"confidence must be in (0.5, 1.0), got {confidence}")

    z = _Z_TABLE.get(confidence)
    if z is None:
        # Approximate from normal inverse via Newton — but we keep simple table
        # for predictable test behavior.
        raise ValueError(
            f"confidence {confidence} not in {sorted(_Z_TABLE.keys())}"
        )

    p_hat = successes / n
    denom = 1.0 + (z * z) / n
    centre = (p_hat + (z * z) / (2.0 * n)) / denom
    margin = (z / denom) * math.sqrt((p_hat * (1.0 - p_hat) / n) + (z * z) / (4.0 * n * n))

    return WilsonInterval(
        point=p_hat,
        lower=max(0.0, centre - margin),
        upper=min(1.0, centre + margin),
        confidence=confidence,
        n=n,
    )


# Per-tier RTP absolute tolerance (pp = percentage points)
# Below noise floor at T5 → any drift above = bug, not random
_RTP_TOLERANCE_PP = {
    Tier.T1: 0.05,      # 5 basis points
    Tier.T2: 0.02,      # 2 basis points
    Tier.T3: 0.002,     # 0.2 basis points (regulator GLI-19)
    Tier.T4: 0.0006,    # 6 micro-basis-points
    Tier.T5: 0.0002,    # 2 micro-basis-points (sub-noise-floor)
}


def rtp_tolerance_for_tier(tier: Tier) -> float:
    """Return absolute RTP tolerance in percentage points for given tier."""
    return _RTP_TOLERANCE_PP[tier]


def within_tolerance(measured: float, target: float, tolerance_pp: float) -> bool:
    """Check |measured - target| ≤ tolerance (in pp = 1.0 = 1 percentage point)."""
    return abs(measured - target) * 100.0 <= tolerance_pp


def within_wilson_ci(
    successes: int,
    n: int,
    target_proportion: float,
    confidence: float = 0.99,
) -> tuple[bool, WilsonInterval]:
    """Check if target_proportion falls within Wilson CI of measured.

    Returns (pass_flag, interval).
    """
    interval = wilson_ci(successes, n, confidence)
    pass_flag = interval.lower <= target_proportion <= interval.upper
    return pass_flag, interval
