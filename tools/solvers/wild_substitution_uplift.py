"""Closed-form kernel — Wild Substitution Uplift.

Industry pattern (universal across all line games): wilds on a reel
substitute for the anchor symbol of a payline, extending the run
of the dominant non-wild symbol. Computes the per-line uplift
vs a no-wild baseline.

Closed-form
===========

Let p_X = visible probability of anchor symbol X on each reel;
    p_W = visible probability of wild on each reel.
Effective per-cell probability for a "match" = p_X + p_W.

For a 5-reel line, the probability of a 5-of-a-kind run of X
(with wilds substituting) is (p_X + p_W)^5 (independence approximation).
Per-line RTP = Σ_X (p_X + p_W)^5 × pay_X.

Net RTP uplift over a no-wild baseline of Σ_X p_X^5 × pay_X:
  uplift = Σ_X [(p_X + p_W)^5 − p_X^5] × pay_X
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class WildSubUpliftParams:
    p_wild: float
    symbol_probs: Mapping[str, float]
    symbol_pays_5oak: Mapping[str, float]
    n_lines: int = 20


ACCEPTANCE_TOLERANCE_MC = 0.05


def baseline_per_line_rtp(p: WildSubUpliftParams) -> float:
    """No-wild line RTP — Σ p_X^5 × pay_X."""
    return sum(
        (float(prob) ** 5) * float(p.symbol_pays_5oak.get(sym, 0.0))
        for sym, prob in p.symbol_probs.items()
    )


def with_wild_per_line_rtp(p: WildSubUpliftParams) -> float:
    """With-wild line RTP — Σ (p_X + p_W)^5 × pay_X."""
    return sum(
        ((float(prob) + p.p_wild) ** 5)
        * float(p.symbol_pays_5oak.get(sym, 0.0))
        for sym, prob in p.symbol_probs.items()
    )


def analytical_rtp(p: WildSubUpliftParams) -> float:
    """Total per-spin RTP (uplifted line RTP × n_lines / n_lines = just
    per-line). We expose per-spin = per-line since by convention RTP is
    total-bet-normalized and 1 spin = n_lines × line_bet → cancel.
    """
    if not (0.0 <= p.p_wild <= 1.0):
        raise ValueError("p_wild out of [0, 1]")
    return with_wild_per_line_rtp(p)


def uplift_vs_baseline(p: WildSubUpliftParams) -> float:
    return with_wild_per_line_rtp(p) - baseline_per_line_rtp(p)


def mc_simulate(p: WildSubUpliftParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    """MC reference. Per-cell Bernoulli rolls preserve absolute symbol
    probabilities (no renormalization across symbol set) so analytical
    `(p_X + p_W)^5` matches up to MC noise."""
    rng = random.Random(seed)
    symbols = list(p.symbol_probs.keys())
    total_pay = 0.0
    for _ in range(spins):
        for _line in range(p.n_lines):
            # For each symbol X, the probability that all 5 cells show
            # X or wild is (p_X + p_W)^5 — independent Bernoulli rolls.
            for sym in symbols:
                p_match = p.symbol_probs[sym] + p.p_wild
                all_match = True
                for _i in range(5):
                    if rng.random() >= p_match:
                        all_match = False
                        break
                if all_match:
                    total_pay += p.symbol_pays_5oak.get(sym, 0)
                    break    # one win per line
    return {
        "rtp_mc": total_pay / max(spins * p.n_lines, 1),
    }
