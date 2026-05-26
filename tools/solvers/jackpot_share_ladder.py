"""Closed-form kernel — Fixed Jackpot Tier Share Ladder.

Industry pattern (Pragmatic Big Bass jackpot, IGT MegaJackpots fixed
tier, NetEnt Hall of Gods style): the trigger event is rare; given a
trigger, the player gets a SINGLE jackpot drawn from a tier ladder
{mini, minor, major, mega, grand} with published mass.

Closed-form derivation
======================

Let:
  p_trigger    = per-spin probability the jackpot is hit
  tier_mass    = {tier: weight} non-normalized share weights
  tier_pay     = {tier: pay × bet}

Normalized tier probability:
  q_tier = tier_mass[tier] / Σ tier_mass

Per-spin RTP contribution:
  RTP_jp = p_trigger × Σ_tier q_tier × tier_pay[tier]

Variance:
  E[X²] = p_trigger × Σ_tier q_tier × tier_pay[tier]²
  Var = E[X²] − (RTP_jp)²

Acceptance band
===============
EXACT in expectation. MC ratio ∈ [0.95, 1.05] @ 100K spins (jackpot
tail can dominate variance for low-trigger configurations).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class JackpotShareLadderParams:
    """Parameters for the jackpot-share-ladder closed-form solver.

    p_trigger:    per-spin trigger probability
    tier_mass:    {tier: weight} non-normalized share mass
    tier_pay:     {tier: pay × bet}
    """

    p_trigger: float
    tier_mass: Mapping[str, float]
    tier_pay: Mapping[str, float]


def normalized_probs(p: JackpotShareLadderParams) -> dict[str, float]:
    """Return {tier: q_tier} with Σ q = 1."""
    total = sum(p.tier_mass.values())
    if total <= 0:
        return {}
    return {t: w / total for t, w in p.tier_mass.items()}


def expected_pay_per_trigger(p: JackpotShareLadderParams) -> float:
    """Σ_tier q_tier × tier_pay[tier]."""
    qs = normalized_probs(p)
    return sum(qs.get(t, 0.0) * pay for t, pay in p.tier_pay.items())


def analytical_rtp(p: JackpotShareLadderParams) -> float:
    """p_trigger × E[pay | trigger]."""
    return p.p_trigger * expected_pay_per_trigger(p)


def variance_per_spin(p: JackpotShareLadderParams) -> float:
    """Var(X) per spin (Bernoulli × mixture)."""
    qs = normalized_probs(p)
    e_x2_given = sum(qs.get(t, 0.0) * (pay ** 2)
                     for t, pay in p.tier_pay.items())
    e_x2 = p.p_trigger * e_x2_given
    e_x = analytical_rtp(p)
    return e_x2 - e_x * e_x


def mc_simulate(
    p: JackpotShareLadderParams,
    spins: int = 100_000,
    seed: int = 42,
) -> dict:
    """MC — Bernoulli trigger, then categorical draw from tier_mass."""
    rng = random.Random(seed)
    tiers = list(p.tier_mass.items())
    total_mass = sum(w for _, w in tiers)
    cum = []
    acc = 0.0
    for t, w in tiers:
        acc += w / max(total_mass, 1e-12)
        cum.append((t, acc))
    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        x = rng.random()
        picked = cum[-1][0]
        for t, c in cum:
            if x <= c:
                picked = t
                break
        total_pay += p.tier_pay.get(picked, 0.0)
        hits += 1
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
    }
