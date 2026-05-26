"""Closed-form kernel — Per-Line Bet Multiplier Stack.

Industry pattern (Vendor C MoneyStorm, Aristocrat Dragon Link "extra
bet" multiplier purchase, Pragmatic "Ante Bet" feature): the player
can increase the per-line bet by a multiplier — say 1×, 2×, 5× — and
in exchange feature trigger rates (and proportional pays) scale by
that multiplier.

This kernel computes the player-EV at each available bet multiplier
tier so the operator can compute "ante bet" RTP changes.

Closed-form derivation
======================

Let:
  base_rtp        = total RTP at 1× bet (closed-form-derived from base
                    game features)
  feature_lift    = {bm: extra_rtp} additional RTP contribution at
                    bet multiplier `bm` from the higher trigger rate
                    (operator-published)
  pay_share       = {bm: p_share} fraction of total RTP that is
                    "shared" (scales linearly) vs. base (constant)
  base_share_at_1 = 1.0 by definition

Per-bm RTP:
  RTP(bm) = base_rtp × (1 − pay_share[bm])           # constant base
          + base_rtp × pay_share[bm] × bm            # scaled
          + feature_lift.get(bm, 0)                  # extra

For most "ante bet" games the simple identity is:
  RTP(bm=1) = base_rtp
  RTP(bm=k) ≈ (1 − f) × base_rtp + k × f × base_rtp + lift(k)

Acceptance band
===============
EXACT under the assumed pay-share model. No MC needed; this kernel is
deterministic given inputs.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Mapping


@dataclass
class BetMultiplierStackParams:
    """Parameters for the bet-multiplier-stack closed-form solver.

    base_rtp:        RTP at bm = 1
    pay_share:       {bm: fraction} pays that scale linearly with bm
                     (e.g. line wins scale; jackpots stay constant)
    feature_lift:    {bm: extra_rtp} additional RTP contribution from
                     elevated trigger rates at the higher tier
    """

    base_rtp: float
    pay_share: Mapping[int, float] = field(default_factory=dict)
    feature_lift: Mapping[int, float] = field(default_factory=dict)


def rtp_at_bm(p: BetMultiplierStackParams, bm: int) -> float:
    """RTP at the given bet multiplier."""
    if bm <= 0:
        return 0.0
    f = p.pay_share.get(bm, 1.0)
    constant = p.base_rtp * (1.0 - f)
    scaled = p.base_rtp * f * bm
    lift = p.feature_lift.get(bm, 0.0)
    return constant + scaled / max(bm, 1) + lift
    # scaled / bm because the player pays bm × line_bet → effective RTP
    # = (k × scaled_payout) / (k × bet) which equals scaled_payout per
    # unit bet. The constant share dilutes by 1/bm because the
    # constant payout doesn't change with bm.
    # Net player RTP at bm:
    #   = constant_payout / (bm × bet) + scaled_payout / (bm × bet)
    #     × bm
    #   = base_rtp × (1−f) / bm + base_rtp × f + lift_per_unit_bet


def ev_delta(p: BetMultiplierStackParams, bm: int) -> float:
    """RTP gain or loss at bm vs. bm = 1."""
    return rtp_at_bm(p, bm) - rtp_at_bm(p, 1)


def is_positive_ev_at_bm(p: BetMultiplierStackParams, bm: int) -> bool:
    """True if RTP(bm) > RTP(1) — ante bet is player-positive."""
    return ev_delta(p, bm) > 0
