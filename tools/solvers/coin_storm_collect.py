"""Closed-form kernel — Coin Storm Collect (Bernoulli sum).

Industry pattern (Vendor B Cash Eruption / Pragmatic Hold & Win
"Storm" / Hacksaw Bonus Buy "Coin Collect"): a coin storm event
fires with probability `p_trigger`; on a fire, each of `n_cells`
grid cells independently produces a coin with probability `p_coin`,
each coin valued iid from `coin_dist`.

Total pay per trigger = Σ_{i=1..K} V_i where K ~ Binomial(n, p).
By Wald + tower: E[total] = n·p · E[V].
Var[total] = n·p · E[V²] − (n·p)² · E[V]² (the Wald-II form for
Binomial K).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class CoinStormParams:
    p_trigger: float
    n_cells: int
    p_coin_per_cell: float
    coin_dist: Mapping[float, float]   # {value: probability}, Σ p = 1


ACCEPTANCE_TOLERANCE_MC = 0.05


def _ev_var(p: CoinStormParams) -> tuple[float, float]:
    ev = sum(float(v) * float(pv) for v, pv in p.coin_dist.items())
    e2 = sum((float(v) ** 2) * float(pv) for v, pv in p.coin_dist.items())
    var = e2 - ev * ev
    return ev, var


def expected_pay_per_trigger(p: CoinStormParams) -> float:
    ev, _ = _ev_var(p)
    return p.n_cells * p.p_coin_per_cell * ev


def variance_pay_per_trigger(p: CoinStormParams) -> float:
    ev, _ = _ev_var(p)
    e2 = sum((float(v) ** 2) * float(pv) for v, pv in p.coin_dist.items())
    n = p.n_cells
    pp = p.p_coin_per_cell
    # K ~ Binomial(n, pp); Var(Σ V_K) = n p (E[V²] − p (E[V])²)
    return n * pp * (e2 - pp * (ev ** 2))


def analytical_rtp(p: CoinStormParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if not (0.0 <= p.p_coin_per_cell <= 1.0):
        raise ValueError("p_coin_per_cell out of [0, 1]")
    return p.p_trigger * expected_pay_per_trigger(p)


def mc_simulate(p: CoinStormParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    values = list(p.coin_dist.keys())
    weights = [p.coin_dist[v] for v in values]
    total = 0.0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        for _ in range(p.n_cells):
            if rng.random() < p.p_coin_per_cell:
                total += rng.choices(values, weights=weights, k=1)[0]
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }
