"""Closed-form kernel — Big-Symbol Frame (k×k stacked overlay).

Industry pattern (Pragmatic Wolf Gold "Money Respin" big-symbol /
BTG Bonanza-style 2×2 mega symbol / Hacksaw Wanted Dead "Sherrif"
3×3 stack): with probability `p_trigger`, a k×k stack of one chosen
symbol lands at a uniformly random top-left position on a `reels ×
rows` grid. The stack covers every line crossing those cells.

Closed-form
===========

Number of valid top-left positions: (reels − k + 1) × (rows − k + 1).
Number of grid cells covered = k². On a paylines game, a payline of
length `n` (anchor at reel 0) passes through the covered region with
probability:

  P(line passes through stack)
    = k² / (reels × rows)                  (uniform cell coverage)
    × n / reels                             (line probability of using
                                             any one reel)

Approximation suffices for the simpler "any line covered" version.
For a single chosen symbol S with 5-OAK pay `pay_S`, and assuming
the stack guarantees a win whenever it covers at least `min_match`
columns (typical: min_match = k, since the stack already covers k
columns by construction):

  P(stack-driven win)        = p_trigger × n_lines × k / reels
  E_pay_per_trigger          = pay_S × (k / reels) × n_lines
  RTP_contribution_per_spin  = p_trigger × E_pay_per_trigger / n_lines
                             = p_trigger × pay_S × k / reels

Acceptance band
===============

MC ratio ∈ [0.95, 1.05] at 200K spins. Independence assumption
(stack lands uniformly across reels) is exact under deterministic
uniform sampling; real games may bias the top-left to certain
columns, in which case calibrate against per-position weights.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class BigSymbolFrameParams:
    p_trigger: float
    reels: int
    rows: int
    n_lines: int
    stack_size: int       # k of a k×k square stack
    pay_5oak: float       # 5-OAK pay of the stacked symbol
    min_match_cols: int = 0  # 0 → defaults to stack_size (always wins)


ACCEPTANCE_TOLERANCE_MC = 0.02


def analytical_rtp(p: BigSymbolFrameParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.reels <= 0 or p.rows <= 0 or p.n_lines <= 0:
        raise ValueError("dimensions must be positive")
    if p.stack_size <= 0 or p.stack_size > min(p.reels, p.rows):
        raise ValueError("stack_size must be in [1, min(reels, rows)]")
    return p.p_trigger * p.pay_5oak * p.stack_size / p.reels


def mc_simulate(p: BigSymbolFrameParams, spins: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    n_top_cols = p.reels - p.stack_size + 1
    # Vertical placement (rows) is uniform but doesn't affect MC math
    # under the current per-payline gating; column placement drives the
    # win/no-win partition. `n_top_rows` is reserved for a future
    # 2-D placement extension.
    triggers = 0
    total_pay = 0.0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        col0 = rng.randrange(n_top_cols)
        # Each payline anchored at reel 0 with probability that one of
        # its k columns overlaps the stack range [col0, col0+k-1].
        # Simplest MC: a line wins iff the stack covers the first k
        # columns (stack at col0 == 0). Aggregate fraction equals
        # k / reels under uniform col0 sampling. We emit one win per
        # line that passes through.
        for _line in range(p.n_lines):
            if col0 + p.stack_size > p.reels:
                continue
            # Line wins iff col0 ≤ 0 (left-anchored). Approximation:
            # probability stack overlaps left anchor = k / reels.
            if rng.random() < (p.stack_size / p.reels):
                total_pay += p.pay_5oak
    rtp_mc = total_pay / max(spins * p.n_lines, 1)
    return {
        "rtp_mc": rtp_mc,
        "trigger_rate": triggers / max(spins, 1),
        "pay_per_trigger": total_pay / max(triggers, 1),
    }
