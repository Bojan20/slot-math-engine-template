"""Closed-form kernel — Reel Mutate-to-Wild (transforming reel).

Industry pattern (Vendor C Pixies of the Forest "transforming reel",
NetEnt Starburst expanding wild, Pragmatic Wolf Gold wild reel): a
trigger event converts an entire reel to all wilds. Subsequent line
evaluation treats every cell on that reel as a wild substitute.

Closed-form derivation
======================

Let:
  n_reels           = number of reels
  p_mutate_per_reel = per-spin probability that a given reel mutates
                      to all-wilds (each reel independent Bernoulli)
  p_X_per_reel      = per-line-cell hit probability for symbol X on
                      a non-mutated reel
  pay_X(k)          = k-of-a-kind pay × line_bet for symbol X
  num_lines         = active paylines

When reel r mutates, it acts as a wild — its contribution on the
active line for symbol X is GUARANTEED (prob 1) since wild
substitutes. Otherwise it's the normal Bernoulli p_X.

Per-line probability of k-of-a-kind X (k ≥ 3, from left):

  P(line k-of-X) = Σ_{m ⊆ {0..k-1}} P(reels in m mutated)
                   × Π_(r∉m, r<k) p_X
                   × P(reel k not mutated AND not X)   if k < n_reels

Closed-form expansion uses linearity of expectation. We compute
  contrib_X = Σ_(k=3..n_reels) pay_X(k) × Pr(k from left for X)

where:
  Pr(k from left for X) = (p_w + (1−p_w) × p_X)^k
                          × (1 − (p_w + (1−p_w) × p_X))   if k < n
                          (cell k must NOT match X anymore — wild
                           reel breaks the run too only if it's
                           wild but the symbol AFTER is non-X)

Simplification: since a mutated wild reel ALWAYS extends a run, we
have effective per-reel match probability:

  p_eff_X = p_w + (1 − p_w) × p_X

and the run length from left follows a Bernoulli geometric:
  Pr(run = k) = p_eff_X^k × (1 − p_eff_X)     for k < n_reels
  Pr(run = n_reels) = p_eff_X^n_reels

This is the same closed form as the diagonal/payline kernel but with
p_X replaced by p_eff_X. EXACT under reel-independence assumption.

Acceptance band
===============
±2 % at 50K spins (Bernoulli iid assumption holds when reels
independent).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class ReelMutateWildParams:
    """Parameters for the reel-mutate-wild closed-form solver.

    n_reels:           number of reels
    p_mutate_per_reel: per-spin Bernoulli probability per reel
    symbol_probs:      {sym: p_X} per-line-cell hit on non-mutated reel
    symbol_pays:       {sym: {k: pay × line_bet}}
    num_lines:         active paylines (factor for RTP scaling)
    line_bet:          coins per line at BM=1
    """

    n_reels: int
    p_mutate_per_reel: float
    symbol_probs: Mapping[str, float]
    symbol_pays: Mapping[str, Mapping[int, float]]
    num_lines: int = 1
    line_bet: float = 1.0


def effective_prob(p: ReelMutateWildParams, p_sym: float) -> float:
    """p_eff = p_w + (1 − p_w) × p_X."""
    return p.p_mutate_per_reel + (1.0 - p.p_mutate_per_reel) * p_sym


def per_line_rtp(p: ReelMutateWildParams) -> float:
    """Per-line RTP contribution from all paying symbols."""
    out = 0.0
    for sym, p_sym in p.symbol_probs.items():
        if p_sym <= 0:
            continue
        p_eff = effective_prob(p, p_sym)
        ladder = p.symbol_pays.get(sym) or {}
        for k, pay in ladder.items():
            if pay <= 0 or k < 3 or k > p.n_reels:
                continue
            if k < p.n_reels:
                pr = (p_eff ** k) * (1.0 - p_eff)
            else:
                pr = p_eff ** p.n_reels
            out += pr * pay
    return out


def analytical_rtp(p: ReelMutateWildParams) -> float:
    """Total RTP × bet = num_lines × per-line / total_bet."""
    total_bet = p.num_lines * p.line_bet
    if total_bet <= 0:
        return 0.0
    return p.num_lines * per_line_rtp(p) / total_bet


def mc_simulate(
    p: ReelMutateWildParams,
    spins: int = 50_000,
    seed: int = 42,
) -> dict:
    """MC — Bernoulli per-reel mutate; per-line per-reel match check
    extended by mutated wild."""
    rng = random.Random(seed)
    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        # Roll mutates for all reels
        mutated = [rng.random() < p.p_mutate_per_reel
                    for _ in range(p.n_reels)]
        # Each line we sample symbol independently per reel
        spin_pay = 0.0
        for _line in range(p.num_lines):
            for sym, p_sym in p.symbol_probs.items():
                run = 0
                for r in range(p.n_reels):
                    if mutated[r]:
                        run += 1
                    elif rng.random() < p_sym:
                        run += 1
                    else:
                        break
                if run >= 3:
                    pay = (p.symbol_pays.get(sym) or {}).get(run, 0.0)
                    if pay > 0:
                        spin_pay += pay
                        break  # one anchor per line
        if spin_pay > 0:
            hits += 1
        total_pay += spin_pay
    total_bet = p.num_lines * p.line_bet
    return {
        "rtp_mc": total_pay / max(spins * total_bet, 1e-12),
        "hit_freq": hits / max(spins, 1),
    }
