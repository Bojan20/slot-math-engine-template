"""Closed-form kernel — Diagonal / V / Zigzag payline patterns.

Industry pattern: paylines that traverse non-flat row indices (V-shape,
zigzag, diagonal) instead of flat row-0/1/2 lines. Found in classic
3-reel slots, IGT 30-line layouts, and most modern 5-reel games.

This kernel computes the per-line k-of-a-kind RTP for a list of
"pattern" lines, each specified as a row-index vector across reels.

Closed-form derivation
======================

Let:
  n_reels    = number of reels
  paylines   = list of row-index vectors, each length n_reels
  p_X        = per-cell hit probability for symbol X on a given reel
               (assumed iid across cells; the engine MC samples reel
               strips, but per-position Bernoulli is exact for closed
               form when the strip is large)
  pay_X(k)   = k-of-a-kind pay × line_bet

Per-line probability of k-of-a-kind anchor X (k ≥ 3, from left):

  P(line k-of-X) = p_X^k × (1 − p_X)        (cell 0..k−1 match, cell k
                                              mismatches; truncated
                                              line ⇒ no trailing
                                              probability)

For k = n_reels (full match):

  P(line n-of-X) = p_X^n_reels

Per-line RTP from symbol X:

  RTP_line_X = Σ_(k=3..n−1) p_X^k × (1 − p_X) × pay_X(k)
             + p_X^n_reels × pay_X(n_reels)

Total RTP:
  RTP = num_lines × Σ_X RTP_line_X / total_bet

The pattern (row vector) does not change the closed-form value when
cells are iid — only the row PATH matters when reel strips are
correlated. Solver assumes iid for the closed form; engine MC
captures correlations.

Acceptance band
===============
±2 % at 50K spins (Bernoulli iid assumption matches engine MC when
strips are dense / well-mixed).
"""
from __future__ import annotations
import random
from dataclasses import dataclass, field
from typing import Mapping, Sequence


@dataclass
class DiagonalPaylineParams:
    """Parameters for the diagonal-payline closed-form solver.

    n_reels:      number of reels
    n_lines:      number of paylines (typ. 5/9/20/30; pattern row
                  vectors are not used in the closed form but stored
                  for engine reference)
    paylines:     optional row-index vectors per line (informational)
    symbol_probs: {sym: p} per-cell hit probability
    symbol_pays:  {sym: {k: pay × line_bet}} for k ∈ [3, n_reels]
    line_bet:     coins per line at BM=1 (factor for total bet)
    """

    n_reels: int
    n_lines: int
    symbol_probs: Mapping[str, float]
    symbol_pays: Mapping[str, Mapping[int, float]]
    paylines: Sequence[Sequence[int]] = field(default_factory=list)
    line_bet: float = 1.0


def per_line_rtp(p: DiagonalPaylineParams) -> float:
    """Per-line expected pay × line_bet."""
    out = 0.0
    for sym, p_sym in p.symbol_probs.items():
        if p_sym <= 0 or p_sym >= 1:
            continue
        ladder = p.symbol_pays.get(sym) or {}
        for k, pay in ladder.items():
            if pay <= 0 or k < 3:
                continue
            if k < p.n_reels:
                pr = (p_sym ** k) * (1.0 - p_sym)
            elif k == p.n_reels:
                pr = p_sym ** p.n_reels
            else:
                continue
            out += pr * pay
    return out


def analytical_rtp(p: DiagonalPaylineParams) -> float:
    """Total RTP = n_lines × per-line / total_bet (BM=1 ⇒ total_bet =
    n_lines × line_bet)."""
    if p.n_lines <= 0 or p.line_bet <= 0:
        return 0.0
    return per_line_rtp(p) / p.line_bet


def mc_simulate(
    p: DiagonalPaylineParams,
    spins: int = 50_000,
    seed: int = 42,
) -> dict:
    """MC — iid Bernoulli per cell, score k-of-a-kind from left for
    each line."""
    rng = random.Random(seed)
    total_pay = 0.0
    hits = 0
    # Default to flat row-0 lines if no paylines given
    lines = list(p.paylines) if p.paylines else [
        tuple([0] * p.n_reels) for _ in range(p.n_lines)
    ]
    n_lines = len(lines)
    for _ in range(spins):
        # Draw n_reels × n_rows cells; we only sample what we need
        # (the row positions referenced by paylines) — for simplicity
        # we sample one Bernoulli per (reel, distinct row).
        used = {}
        spin_pay = 0.0
        for line in lines:
            # Sample one cell per reel on this line — symbols iid
            run_by_sym = {sym: 0 for sym in p.symbol_probs}
            for reel, row in enumerate(line):
                key = (reel, row)
                if key not in used:
                    # Independent Bernoulli draws per symbol;
                    # multiple symbols may "claim" the same cell
                    # but only the one with the win pays out.
                    used[key] = None
                    for sym, p_sym in p.symbol_probs.items():
                        if rng.random() < p_sym:
                            # Tag the cell with this symbol for run accounting
                            used[key] = sym
                            break
                # Use the tagged symbol if any
                tag = used[key]
                for sym in p.symbol_probs:
                    if tag == sym and run_by_sym[sym] == reel:
                        # Continue the run only if it's contiguous
                        run_by_sym[sym] = reel + 1
            for sym, run in run_by_sym.items():
                if run >= 3:
                    pay = (p.symbol_pays.get(sym) or {}).get(run, 0.0)
                    if pay > 0:
                        spin_pay += pay
        total_pay += spin_pay
        if spin_pay > 0:
            hits += 1
    return {
        "rtp_mc": total_pay / max(spins * n_lines * p.line_bet, 1e-12),
        "hit_freq": hits / max(spins, 1),
    }
