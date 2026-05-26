"""Closed-form kernel — Wild-Trail Persistence (cascade).

Industry pattern (Hacksaw Wanted Dead "Trail Bonus" / Pragmatic
Bigger Bass "Wild Trail" / Vendor C "Sticky Trail"): on each cascade
within a winning sequence, the wild that triggered the win persists
to the next cascade, accumulating a "trail" of up to K wilds across
chained reactions.

The trail wilds contribute additional substitution probability
per cascade, boosting subsequent cascade win expectations.

Closed-form
===========

Let:
  K        = trail capacity (max persistent wilds)
  p_cascade = P(any cascade wins | current trail size t)
              modeled as p0 + (p_max - p0) × t / K (linear ramp)
  pay_per_cascade(t) = base_pay × (1 + α × t)   (trail multiplier)

Expected number of cascades in a session (geometric chain to first
non-win):
  E[N | trail] = Σ_{t=0..K} t × P(trail t) × ... — modeled with
                 simple recurrence over trail size.

For tractability we use a Markov chain over trail-size:
  State t ∈ {0, 1, ..., K}
  P(t → t+1) = p_cascade(t)             if t < K else 0
  P(t → 0)   = 1 − p_cascade(t)
  P(K → K) wraps (cap at K)

Expected total pay per session:
  E[total] = Σ_t π_t × pay_per_cascade(t)   (where π is stationary
                                              distribution under the
                                              "session reset on miss"
                                              kernel — analytic via
                                              chain inversion below)

Closed form (chain length expected to hit the absorbing reset):

  E[chain_length | start t0] = 1 / (1 - p_cascade(t0))   (geometric)

Acceptance band
===============

MC ratio ∈ [0.90, 1.10] at 50K sessions. Tail behavior of the
Markov chain plus the trail multiplier expansion produces slightly
heavier tails than independent geometric; tolerance is generous.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class WildTrailParams:
    trail_capacity: int
    p_cascade_base: float
    p_cascade_max: float
    base_pay_per_cascade: float
    trail_multiplier_alpha: float


ACCEPTANCE_TOLERANCE_MC = 0.10


def _p_cascade(p: WildTrailParams, t: int) -> float:
    if p.trail_capacity == 0:
        return p.p_cascade_base
    return p.p_cascade_base + (p.p_cascade_max - p.p_cascade_base) * (
        min(t, p.trail_capacity) / p.trail_capacity
    )


def expected_session_length(p: WildTrailParams) -> float:
    """Markov-chain expected cascades in one session (start at t=0)."""
    # Recurrence: L_t = 1 + p_cascade(t) × L_{min(t+1, K)}
    # Solve from K down to 0.
    L = [0.0] * (p.trail_capacity + 2)
    # Boundary: at trail K, the chain caps but continues geometric
    pK = _p_cascade(p, p.trail_capacity)
    # Geometric chain length at the capped state:
    if pK >= 1.0:
        L[p.trail_capacity] = 1e9
    else:
        L[p.trail_capacity] = 1.0 / max(1.0 - pK, 1e-12)
    for t in range(p.trail_capacity - 1, -1, -1):
        pt = _p_cascade(p, t)
        L[t] = 1.0 + pt * L[t + 1]
    return L[0]


def analytical_rtp(p: WildTrailParams) -> float:
    """Sum of (cascade-firing-probability × per-cascade pay) along a
    session. Each level t contributes pay only if the cascade at level
    t actually fires, gated on the cumulative probability of reaching
    level t in the first place.
    """
    if p.trail_capacity < 0:
        raise ValueError("trail_capacity must be non-negative")
    if not (0.0 <= p.p_cascade_base <= 1.0):
        raise ValueError("p_cascade_base out of [0, 1]")
    total = 0.0
    p_reach = 1.0  # probability of reaching the current level
    for t in range(p.trail_capacity):
        pt = _p_cascade(p, t)
        pay_t = p.base_pay_per_cascade * (1 + p.trail_multiplier_alpha * t)
        # Contribute pay only when the cascade fires:
        total += p_reach * pt * pay_t
        # Move to the next level
        p_reach *= pt
        if p_reach < 1e-15:
            return total
    # At trail_capacity (the capped state) the chain continues
    # geometrically with pK until it breaks.
    pK = _p_cascade(p, p.trail_capacity)
    pay_K = p.base_pay_per_cascade * (
        1 + p.trail_multiplier_alpha * p.trail_capacity
    )
    if p_reach > 0 and 0 < pK < 1:
        # E[additional pays | reached K] = pK × pay_K / (1 − pK)
        total += p_reach * pK * pay_K / (1.0 - pK)
    return total


def mc_simulate(p: WildTrailParams, sessions: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    chain_lengths: list[int] = []
    for _ in range(sessions):
        t = 0
        session_pay = 0.0
        chain = 0
        # Initial cascade attempt
        while True:
            pt = _p_cascade(p, t)
            if rng.random() >= pt:
                break
            chain += 1
            session_pay += p.base_pay_per_cascade * (
                1 + p.trail_multiplier_alpha * t
            )
            if t < p.trail_capacity:
                t += 1
            if chain > 5000:  # safety
                break
        total_pay += session_pay
        chain_lengths.append(chain)
    return {
        "rtp_mc": total_pay / max(sessions, 1),
        "mean_chain_length": sum(chain_lengths) / max(sessions, 1),
    }
