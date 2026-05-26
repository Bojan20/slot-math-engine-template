"""Closed-form kernel — Bonus Pick with replacement (geometric sum).

Industry pattern (Hacksaw Mining Pots / Vendor A Pick Bonus /
Pragmatic Cash Truck): bonus session presents N picks. Each pick
returns a value drawn iid from a discrete distribution (`pick_values`
weighted by `pick_weights`). Total payout = Σ V_i. Special "collect"
or "end" outcomes can also be included with value 0 to truncate
the geometric chain probabilistically.

Closed-form
===========

Let p_v = pick_weights[v] / Σ pick_weights.
E[V]   = Σ_v p_v × value_v
Var[V] = Σ_v p_v × (value_v − E[V])²

For N independent picks (no end token):
  E[total] = N × E[V]
  Var[total] = N × Var[V]

For a geometric chain with per-pick stop probability p_stop:
  E[picks] = (1 − p_stop) / p_stop  (geometric, support 0, 1, …)
  E[total] = E[picks] × E[V]
  Var[total] = E[picks] × Var[V] + Var[picks] × (E[V])²
  Var[picks] = (1 − p_stop) / p_stop²

Acceptance band
===============

MC ratio ∈ [0.95, 1.05] at 20K bonus sessions. The compound geometric
formula is exact in expectation.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Sequence


@dataclass
class BonusPickParams:
    pick_values: Sequence[float]
    pick_weights: Sequence[float]
    n_picks: int = 0          # fixed-N mode (≥ 1) — geometric mode when 0
    p_stop_per_pick: float = 0.0  # used only in geometric mode (∈ [0, 1))


ACCEPTANCE_TOLERANCE_MC = 0.02


def _ev_var(p: BonusPickParams) -> tuple[float, float]:
    values = [float(v) for v in p.pick_values]
    weights = [float(w) for w in p.pick_weights]
    if len(values) != len(weights):
        raise ValueError("pick_values and pick_weights must align")
    total_w = sum(weights)
    if total_w <= 0:
        return 0.0, 0.0
    probs = [w / total_w for w in weights]
    ev = sum(p_ * v for p_, v in zip(probs, values))
    var = sum(p_ * (v - ev) ** 2 for p_, v in zip(probs, values))
    return ev, var


def expected_total_pay(p: BonusPickParams) -> float:
    ev, _ = _ev_var(p)
    if p.n_picks > 0:
        return p.n_picks * ev
    if not (0.0 <= p.p_stop_per_pick < 1.0):
        raise ValueError(f"p_stop_per_pick {p.p_stop_per_pick} not in [0, 1)")
    e_picks = (1.0 - p.p_stop_per_pick) / max(p.p_stop_per_pick, 1e-12)
    return e_picks * ev


def variance_total_pay(p: BonusPickParams) -> float:
    ev, var = _ev_var(p)
    if p.n_picks > 0:
        return p.n_picks * var
    pr = p.p_stop_per_pick
    e_picks = (1.0 - pr) / max(pr, 1e-12)
    v_picks = (1.0 - pr) / max(pr ** 2, 1e-12)
    return e_picks * var + v_picks * (ev ** 2)


def mc_simulate(p: BonusPickParams, sessions: int = 20_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    values = list(p.pick_values)
    weights = list(p.pick_weights)
    pays: list[float] = []
    n_picks_observed: list[int] = []
    for _ in range(sessions):
        total = 0.0
        if p.n_picks > 0:
            n = p.n_picks
            for _i in range(n):
                v = rng.choices(values, weights=weights, k=1)[0]
                total += v
            n_picks_observed.append(n)
        else:
            n = 0
            while True:
                if rng.random() < p.p_stop_per_pick:
                    break
                v = rng.choices(values, weights=weights, k=1)[0]
                total += v
                n += 1
                if n > 10_000:  # safety
                    break
            n_picks_observed.append(n)
        pays.append(total)
    mean = sum(pays) / max(sessions, 1)
    var = sum((x - mean) ** 2 for x in pays) / max(sessions, 1)
    mean_n = sum(n_picks_observed) / max(sessions, 1)
    return {
        "mean_total_pay": mean,
        "var_total_pay": var,
        "mean_n_picks": mean_n,
    }
