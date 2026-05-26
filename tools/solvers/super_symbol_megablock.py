"""Closed-form kernel — Super Symbol Megablock.

Industry pattern (Pragmatic Super Symbol, Wazdan Big Symbol):
with probability `p_megablock`, a `block_side × block_side` block
of identical super-symbols lands at a random valid grid anchor.
When the block fits the grid it pays a fixed credit `pay_per_block`
(designer-calibrated to incorporate the symbol's per-line pay × the
expected number of lines covered).

Closed-form
===========

If the block does not fit the grid (`block_side > rows` or
`block_side > cols`), the block can never land and RTP = 0.

Otherwise:
  uplift_per_spin = p_megablock · pay_per_block · lines_evaluated_mult

`lines_evaluated_mult` defaults to 1.0; pass `>1.0` if the calibrated
`pay_per_block` should scale linearly with bet-line count.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class MegablockParams:
    rows: int
    cols: int
    block_side: int
    p_megablock: float
    pay_per_block: float
    lines_evaluated_mult: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.05


def _block_fits(rows: int, cols: int, k: int) -> bool:
    return 0 < k <= rows and 0 < k <= cols


def analytical_rtp(p: MegablockParams) -> float:
    if not (0.0 <= p.p_megablock <= 1.0):
        raise ValueError("p_megablock out of [0, 1]")
    if p.rows <= 0 or p.cols <= 0:
        raise ValueError("rows/cols must be > 0")
    if p.block_side <= 0:
        raise ValueError("block_side must be > 0")
    if not _block_fits(p.rows, p.cols, p.block_side):
        return 0.0
    return p.p_megablock * p.pay_per_block * p.lines_evaluated_mult


def mc_simulate(p: MegablockParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    if not _block_fits(p.rows, p.cols, p.block_side):
        return {"rtp_mc": 0.0, "fire_rate": 0.0}
    total = 0.0
    fires = 0
    for _ in range(spins):
        if rng.random() < p.p_megablock:
            fires += 1
            total += p.pay_per_block * p.lines_evaluated_mult
    return {
        "rtp_mc": total / max(spins, 1),
        "fire_rate": fires / max(spins, 1),
    }
