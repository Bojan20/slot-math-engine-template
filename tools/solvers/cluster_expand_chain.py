"""Closed-form kernel — Cluster Expand Chain.

Industry pattern (NetEnt Aloha Cluster Pays / Push Gaming Jammin'
Jars cluster grow): a winning cluster of size k explodes; adjacent
empty cells refill, with probability `p_grow` each refill extends
the cluster by one more cell. Pay per cluster size is given via
`pay_by_size`.

Closed-form
===========

Let initial cluster size = k0. Each refill round, the cluster grows
by 1 with probability `p_grow`, otherwise the chain breaks.

Expected final cluster size:
  E[k_final] = k0 + p / (1 - p)  (geometric mean, capped at max_size)

Expected pay = pay_by_size[round(E[k_final])] (rounded to nearest
declared size), or interpolated linearly between adjacent pay-tier
keys.

Acceptance band
===============

MC ratio [0.85, 1.15] @ 50K sessions.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class ClusterExpandParams:
    initial_cluster_size: int
    p_grow_per_round: float
    max_cluster_size: int
    pay_by_size: Mapping[int, float]
    p_trigger: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.15


def _interp_pay(pay_table: Mapping[int, float], k: int) -> float:
    if k in pay_table:
        return float(pay_table[k])
    keys = sorted(pay_table.keys())
    if not keys:
        return 0.0
    if k <= keys[0]:
        return float(pay_table[keys[0]])
    if k >= keys[-1]:
        return float(pay_table[keys[-1]])
    # linear interpolation between bracket
    for i in range(len(keys) - 1):
        if keys[i] <= k <= keys[i + 1]:
            lo, hi = keys[i], keys[i + 1]
            t = (k - lo) / max(hi - lo, 1)
            return float(pay_table[lo] + t * (pay_table[hi] - pay_table[lo]))
    return 0.0


def expected_final_cluster_size(p: ClusterExpandParams) -> float:
    if not (0.0 <= p.p_grow_per_round < 1.0):
        if p.p_grow_per_round == 1.0:
            return float(p.max_cluster_size)
        raise ValueError("p_grow_per_round must be in [0, 1)")
    base = p.p_grow_per_round / max(1.0 - p.p_grow_per_round, 1e-12)
    return min(p.initial_cluster_size + base, float(p.max_cluster_size))


def analytical_rtp(p: ClusterExpandParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    e_size = expected_final_cluster_size(p)
    return p.p_trigger * _interp_pay(p.pay_by_size, round(e_size))


def mc_simulate(p: ClusterExpandParams, sessions: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    sizes: list[int] = []
    triggers = 0
    for _ in range(sessions):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        k = p.initial_cluster_size
        while k < p.max_cluster_size and rng.random() < p.p_grow_per_round:
            k += 1
        sizes.append(k)
        total += _interp_pay(p.pay_by_size, k)
    return {
        "rtp_mc": total / max(sessions, 1),
        "mean_final_size": (sum(sizes) / max(len(sizes), 1)) if sizes else 0.0,
        "trigger_rate": triggers / max(sessions, 1),
    }
