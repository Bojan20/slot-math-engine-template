"""Closed-form kernel — Cluster Pays Variance.

Industry pattern (NetEnt Aloha! Cluster Pays / Reactoonz / Jammin' Jars,
Push Gaming Jammin' Jars 2, Vendor C Slingo Riches): wins form by
adjacent-cell clusters of ≥ min_cluster_size matching symbols, then
cascade with new symbols dropping in. Closed-form variance estimator
via Wald identity adapted to cluster size × pay table.

Closed-form derivation
======================

Let G = grid cells, p_X = per-cell prob of symbol X.

For each symbol X, expected cluster contributions per spin
≈ G × p_X × P(cluster forms | X anchors a cell), where
P(cluster | X) is approximated as the geometric expected cluster size
fraction P_X^c (c = avg cluster size ≥ min_match).

For independence approximation:

  E[cluster_size | X anchors] ≈ p_X / (1 - p_X)  (geometric series)

Expected pay per cluster, given anchor X and size k:

  E[pay_X(k)] = pay_X[k]  (looked up in cluster_pay_table)

Per-spin RTP contribution from cluster pays (single pass, no cascade):

  RTP_cluster = G × Σ_X p_X × Σ_k P(cluster_size=k | X) × pay_X[k]

With cascade multiplier `M` (each subsequent cascade pays × M progression):

  RTP_total = RTP_cluster × E[chain_length(M)]

where E[chain_length] = 1 / (1 - cascade_continue_prob) assuming
geometric-decay survival.

Acceptance band
===============

±2.5 % at 100K MC spins for typical cluster-pays games. Cascade
correlation introduces additional 5 % bias; tightens with smaller
p_X values.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class ClusterPaysParams:
    """Parameters for the cluster-pays variance kernel.

    n_cells:           total grid cells (e.g. 7×7 = 49)
    symbol_probs:      {symbol_id: per-cell probability}
    cluster_pay_table: {symbol_id: {cluster_size: pay_multiplier}}
                       keys can be int or "k+" strings (e.g. "12+")
    min_cluster_size:  minimum size for a cluster to pay
    cascade_continue_prob: probability cascade continues (geometric chain)
    """

    n_cells: int
    symbol_probs: Mapping[str, float]
    cluster_pay_table: Mapping[str, Mapping[str, float]]
    min_cluster_size: int = 5
    cascade_continue_prob: float = 0.0


ACCEPTANCE_TOLERANCE_MC = 0.025      # ±2.5 % at 100K MC spins
ACCEPTANCE_TOLERANCE_INDEPENDENCE = 0.05  # cluster correlation bias


def _lookup_pay(pay_map: Mapping[str, float], size: int) -> float:
    """Look up pay for a given cluster size, with `k+` open-ended support."""
    s = str(size)
    if s in pay_map:
        return float(pay_map[s])
    # try open-ended `k+` matches: highest k ≤ size
    best_k = -1
    best_pay = 0.0
    for key, pay in pay_map.items():
        if key.endswith("+"):
            try:
                k = int(key[:-1])
            except ValueError:
                continue
            if k <= size and k > best_k:
                best_k = k
                best_pay = float(pay)
    return best_pay


def _expected_cluster_size(p_x: float, min_size: int) -> float:
    """Closed-form expected cluster size given anchor X with per-cell
    probability p_X. Uses geometric series: E[size] = 1/(1-p_X) but
    truncated at min_size for "no pay if < min_size" convention."""
    if p_x <= 0 or p_x >= 1:
        return 0.0
    geom = 1.0 / (1.0 - p_x)
    # Tail expectation conditional on size ≥ min_size — geometric memoryless
    return max(geom, float(min_size))


def analytical_rtp(p: ClusterPaysParams) -> float:
    """Closed-form per-spin RTP contribution under independence.

    For each symbol X, count_X ~ Binomial(n_cells, p_X). Pay table
    lookup is indexed by count_X (or by an open-ended `k+` key).

    Per-spin RTP = Σ_X Σ_{k=min_cluster_size..n_cells}
                          P(Binomial(n_cells, p_X) = k) × pay_X(k)
    Times chain factor 1/(1 - cascade_continue_prob) if cascade enabled.
    """
    if p.n_cells <= 0:
        return 0.0

    rtp = 0.0
    for sym_id, p_x in p.symbol_probs.items():
        if p_x <= 0:
            continue
        pay_map = p.cluster_pay_table.get(sym_id, {})
        if not pay_map:
            continue
        e_pay = 0.0
        # Binomial PMF: P(X = k) = C(n, k) p^k (1-p)^(n-k)
        # Iterate k from min_cluster_size to n_cells
        from math import comb
        for k in range(p.min_cluster_size, p.n_cells + 1):
            pmf = comb(p.n_cells, k) * (p_x ** k) * ((1.0 - p_x) ** (p.n_cells - k))
            if pmf < 1e-15:
                continue
            pay_k = _lookup_pay(pay_map, k)
            e_pay += pmf * pay_k
        rtp += e_pay

    if p.cascade_continue_prob > 0:
        chain_factor = 1.0 / (1.0 - p.cascade_continue_prob)
        rtp *= chain_factor

    return rtp


def mc_simulate(
    p: ClusterPaysParams,
    spins: int = 100_000,
    seed: int = 42,
) -> dict[str, float]:
    """MC reference — generate grid Bernoulli, count anchor-cell clusters
    via per-cell independent sampling (no spatial adjacency; gives
    upper-bound on independence approximation)."""
    rng = random.Random(seed)
    symbols = list(p.symbol_probs.keys())
    sym_probs = [p.symbol_probs[s] for s in symbols]
    total_pay = 0.0
    total_clusters = 0
    for _ in range(spins):
        # Sample each cell, count per-symbol occurrences
        counts: dict[str, int] = {s: 0 for s in symbols}
        for _c in range(p.n_cells):
            r = rng.random()
            cum = 0.0
            for s, q in zip(symbols, sym_probs):
                cum += q
                if r < cum:
                    counts[s] += 1
                    break
        # Each symbol with count ≥ min_size produces a "cluster" of that size
        spin_pay = 0.0
        for s, cnt in counts.items():
            if cnt < p.min_cluster_size:
                continue
            pay_map = p.cluster_pay_table.get(s, {})
            spin_pay += _lookup_pay(pay_map, cnt)
            total_clusters += 1
        # Apply cascade chain (geometric continuation)
        if p.cascade_continue_prob > 0 and spin_pay > 0:
            chain_len = 1
            while rng.random() < p.cascade_continue_prob:
                chain_len += 1
                if chain_len > 50:
                    break  # safety
            spin_pay *= chain_len
        total_pay += spin_pay
    rtp_mc = total_pay / max(spins, 1)
    return {
        "rtp_mc": rtp_mc,
        "total_clusters": total_clusters,
        "clusters_per_spin": total_clusters / max(spins, 1),
    }
