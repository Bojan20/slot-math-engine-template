"""Closed-form kernel — Deterministic Nudge / Respin to Complete Combo.

Industry pattern (Vendor C Triple Diamond "respin", Aristocrat
Lucky 88 deterministic nudge, NetEnt Mega Moolah respin trigger): a
"near-miss" condition (e.g. 2/5 reels show a high-value symbol)
triggers a respin or nudge that GUARANTEES completion of the
configured combo. EV is straightforward: probability of near-miss ×
guaranteed pay.

Closed-form derivation
======================

Let:
  p_near_miss    = per-spin probability the near-miss state occurs
                   (engine-derived from reel-strip math)
  guaranteed_pay = pay × bet upon completion
  trigger_fee    = optional cost the player pays for the respin
                   (subtracted from EV; 0 if free)

Per-spin RTP contribution (player perspective):
  RTP = p_near_miss × guaranteed_pay − trigger_fee_rtp

where trigger_fee_rtp = p_near_miss × trigger_fee (if any).

If respin is FREE (typical "near-miss" feature):
  RTP = p_near_miss × guaranteed_pay

This is EXACT under the deterministic-completion assumption (engine
emits a respin that snaps the missing symbol into place 100 % of the
time the trigger fires).

Acceptance band
===============
EXACT in expectation when respin is deterministic. MC needed only for
sanity (no variance to converge).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class NudgeRespinParams:
    """Parameters for the deterministic-nudge solver.

    p_near_miss:     per-spin near-miss trigger probability
    guaranteed_pay:  pay × bet upon completed combo
    trigger_fee:     optional cost the player pays for the respin
                     (0 if free)
    """

    p_near_miss: float
    guaranteed_pay: float
    trigger_fee: float = 0.0


def analytical_rtp(p: NudgeRespinParams) -> float:
    """RTP = p_near_miss × (guaranteed_pay − trigger_fee)."""
    return p.p_near_miss * (p.guaranteed_pay - p.trigger_fee)


def expected_value_per_trigger(p: NudgeRespinParams) -> float:
    """Conditional EV per fired trigger."""
    return p.guaranteed_pay - p.trigger_fee


def is_positive_ev(p: NudgeRespinParams) -> bool:
    """True when the deterministic respin is player-positive."""
    return p.guaranteed_pay > p.trigger_fee


def mc_simulate(
    p: NudgeRespinParams,
    spins: int = 50_000,
    seed: int = 42,
) -> dict:
    """MC — Bernoulli trigger × deterministic pay. Variance is from
    Bernoulli only (zero conditional variance on guaranteed pay)."""
    rng = random.Random(seed)
    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        if rng.random() < p.p_near_miss:
            total_pay += p.guaranteed_pay - p.trigger_fee
            hits += 1
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
    }
