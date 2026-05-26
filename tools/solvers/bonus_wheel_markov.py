"""Closed-form kernel — Bonus Wheel + Respin Markov.

Industry pattern (Vendor D Wheel of Fortune, Pragmatic Sweet Bonanza
Xmas Wheel, Vendor A Wheel of Fortune Multi-Tier): on FS / bonus
trigger, a wheel spins with N segments having weighted distribution
{weight_i, pay_i, respin_i}. A `respin` segment re-spins the wheel
(potentially with progressive bias toward higher segments).

Closed-form derivation
======================

Stationary Markov chain over wheel segments:
  - Each segment i has weight w_i, pay p_i, respin bit r_i ∈ {0, 1}.
  - P(land on i in one spin) = w_i / Σ w
  - If r_i = 1, respin; absorbing states are r_i = 0 segments.

Let R = Σ_{i: r_i=1} w_i / Σ w  (per-spin respin probability).
Geometric chain length: E[N_spins] = 1 / (1 - R).
At absorbing landing, sample from non-respin segments:
  P(land on j | absorbed) = w_j / Σ_{j: r_j=0} w_j

Expected pay at absorption:
  E[pay] = Σ_{j: r_j=0} (w_j / Σ_absorbing) × p_j

Per-trigger RTP contribution:
  RTP_wheel = E[pay] × (1 + transient_pay_per_spin × E[N_spins])

Simplified (no transient pay on respin segments):
  RTP_wheel = E[pay_absorbing]

Acceptance band
===============

±0.5 % at 100K MC trigger samples (exact convolution under the Markov
absorbing-chain model — analytical formula is exact when segments are
i.i.d. samples).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Sequence


@dataclass
class WheelSegment:
    """One wheel segment.

    weight: integer weight (relative probability)
    pay:    pay amount in coins / × bet awarded if landed (non-respin)
    respin: True = wheel respins on landing (transient state)
    """
    weight: float
    pay: float
    respin: bool = False


@dataclass
class BonusWheelParams:
    """Parameters for the bonus-wheel Markov kernel.

    segments:  list of WheelSegment defining the wheel
    """
    segments: Sequence[WheelSegment]


ACCEPTANCE_TOLERANCE_MC = 0.005   # ±0.5 % at 100K trigger MC


def analytical_rtp(p: BonusWheelParams) -> float:
    """Closed-form expected pay per trigger.

    Formula: E[pay | absorbed] = Σ_{j: r_j=False} w_j × p_j
                                  / Σ_{j: r_j=False} w_j

    Geometric chain absorbing into non-respin segment with probability
    1 (assuming respin segments aren't pure dead-ends).
    """
    if not p.segments:
        return 0.0
    total_w = sum(s.weight for s in p.segments)
    if total_w <= 0:
        return 0.0
    # Absorbing-state total weight
    absorbing_w = sum(s.weight for s in p.segments if not s.respin)
    if absorbing_w <= 0:
        # All segments respin — pathological case, no absorbing state
        # Engine would loop forever; we return 0
        return 0.0
    e_pay = sum(s.weight * s.pay for s in p.segments if not s.respin)
    return e_pay / absorbing_w


def expected_chain_length(p: BonusWheelParams) -> float:
    """E[N_spins until absorbing] = 1 / (1 - P(respin)) for geometric."""
    if not p.segments:
        return 0.0
    total_w = sum(s.weight for s in p.segments)
    if total_w <= 0:
        return 0.0
    respin_w = sum(s.weight for s in p.segments if s.respin)
    p_respin = respin_w / total_w
    if p_respin >= 1.0:
        return float("inf")
    return 1.0 / (1.0 - p_respin)


def mc_simulate(
    p: BonusWheelParams,
    triggers: int = 100_000,
    seed: int = 42,
) -> dict[str, float]:
    """MC reference: spin the wheel until absorbing landing for each
    trigger; record landing pay + chain length."""
    rng = random.Random(seed)
    if not p.segments:
        return {"rtp_mc": 0.0, "mean_chain_length": 0.0}

    total_w = sum(s.weight for s in p.segments)
    cum: list[float] = []
    running = 0.0
    for s in p.segments:
        running += s.weight
        cum.append(running)

    total_pay = 0.0
    total_chain = 0
    for _ in range(triggers):
        chain = 0
        while True:
            r = rng.random() * total_w
            # Find segment
            seg_idx = 0
            for i, c in enumerate(cum):
                if r < c:
                    seg_idx = i
                    break
            chain += 1
            seg = p.segments[seg_idx]
            if not seg.respin:
                total_pay += seg.pay
                break
            if chain > 200:
                # Safety net
                break
        total_chain += chain
    return {
        "rtp_mc": total_pay / max(triggers, 1),
        "mean_chain_length": total_chain / max(triggers, 1),
    }
