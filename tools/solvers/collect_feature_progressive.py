"""Closed-form kernel — Collect Feature Progressive Aggregator.

Industry pattern (NetEnt Tower style, Pragmatic Fire Strike collect,
Hacksaw Le Bandit jeton coin landing): a "collector" symbol (e.g. a
chest) lands on the final reel; "value" symbols (coin orbs with
multipliers) on the other reels are then summed and paid times the
collector multiplier.

Closed-form derivation
======================

Let:
  n_value_reels = reels that can host value coins (e.g. reels 1..n-1)
  p_value       = per-reel probability a value coin lands on the
                  active row(s) of a non-collector reel
  e_value       = expected coin value × bet per landed value coin
  p_collect     = probability a collector lands on the last reel
  collector_mult = multiplier the collector applies to the sum
                  (often = 1, sometimes random; we accept e_mult)
  e_mult        = E[collector_mult]

Expected number of value coins per spin given a collect event:
  E[V | collect] = n_value_reels × p_value          (Bernoulli sum)
  E[per-coin pay × bet | landed] = e_value

Per-spin EV from this feature:
  EV = p_collect × n_value_reels × p_value × e_value × e_mult

Note this kernel models VALUE SUMMING + COLLECT × MULT and assumes
independence between (a) collector landing on last reel and (b) value
coins on other reels.  Real engines may correlate these via shared
weighted spins; the closed form is EXACT under independence.

Acceptance band
===============
EXACT in expectation. MC ratio ∈ [0.98, 1.02] @ 30K spins (variance
from collector × Bernoulli sum compounds).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class CollectProgressiveParams:
    """Parameters for the collect-feature aggregator solver.

    n_value_reels:    reels that can carry value coins (excludes
                      collector reel)
    p_value_per_reel: per-reel probability of a value coin landing
    e_value:          expected coin value × bet per coin
    p_collect:        per-spin probability collector lands on last reel
    e_mult:           E[collector multiplier] (default 1.0)
    """

    n_value_reels: int
    p_value_per_reel: float
    e_value: float
    p_collect: float
    e_mult: float = 1.0


def expected_value_coins(p: CollectProgressiveParams) -> float:
    """E[V] = n_value_reels × p_value (Bernoulli sum)."""
    return p.n_value_reels * p.p_value_per_reel


def analytical_rtp(p: CollectProgressiveParams) -> float:
    """EV = p_collect × n_value_reels × p_value × e_value × e_mult."""
    return (
        p.p_collect
        * expected_value_coins(p)
        * p.e_value
        * p.e_mult
    )


def mc_simulate(
    p: CollectProgressiveParams,
    spins: int = 30_000,
    seed: int = 42,
) -> dict:
    """MC — Bernoulli collect, Binomial(n_value_reels, p_value_per_reel)
    value coins, sum × collector mult."""
    rng = random.Random(seed)
    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        if rng.random() >= p.p_collect:
            continue
        coin_sum = 0.0
        for _r in range(p.n_value_reels):
            if rng.random() < p.p_value_per_reel:
                coin_sum += p.e_value
        if coin_sum > 0:
            hits += 1
            total_pay += coin_sum * p.e_mult
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
    }
