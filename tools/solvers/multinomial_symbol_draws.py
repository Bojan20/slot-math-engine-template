"""Closed-form kernel — Multinomial Symbol Draws.

Industry pattern (Yggdrasil "Multi-Reveal" cell mystery features):
N cells revealed independently, each cell sampling a symbol from a
weighted alphabet. Per-symbol RTP contribution is linear in the
expected count.

Multinomial moments:
  E[count(symbol i)] = N · p_i
  Var[count(symbol i)] = N · p_i · (1 - p_i)
  Cov[count(i), count(j)] = -N · p_i · p_j   (i ≠ j)

Per-trigger payout = Σ_i E[count(i)] · pay(i) = N · Σ_i p_i · pay(i)
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class MultinomialSymbolDrawsParams:
    p_trigger: float
    n_cells: int
    symbol_weights: list[float]
    symbol_pays: list[float]


ACCEPTANCE_TOLERANCE_MC = 0.05


def _normalized(weights: list[float]) -> list[float]:
    s = sum(weights)
    if s <= 0:
        raise ValueError("weights must sum to > 0")
    return [w / s for w in weights]


def expected_pay_per_cell(p: MultinomialSymbolDrawsParams) -> float:
    if len(p.symbol_weights) != len(p.symbol_pays):
        raise ValueError("weights and pays length mismatch")
    probs = _normalized(p.symbol_weights)
    return sum(pr * pay for pr, pay in zip(probs, p.symbol_pays))


def analytical_rtp(p: MultinomialSymbolDrawsParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.n_cells <= 0:
        raise ValueError("n_cells must be > 0")
    return p.p_trigger * p.n_cells * expected_pay_per_cell(p)


def mc_simulate(p: MultinomialSymbolDrawsParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    probs = _normalized(p.symbol_weights)
    cdf: list[float] = []
    acc = 0.0
    for pr in probs:
        acc += pr
        cdf.append(acc)
    total = 0.0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        for _ in range(p.n_cells):
            r = rng.random()
            for i, c in enumerate(cdf):
                if r < c:
                    total += p.symbol_pays[i]
                    break
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }
