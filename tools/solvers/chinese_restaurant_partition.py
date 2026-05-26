"""Closed-form kernel — Chinese Restaurant Process Partition.

Industry pattern (cluster-pays where new clusters either join an
existing cluster or seed a new one — exchangeable cluster growth):

Chinese Restaurant Process: customer n+1 joins existing cluster of
size k with prob k / (n + θ), or starts a new cluster with prob
θ / (n + θ).

Expected number of clusters after N customers:
  E[K_N] = Σ_{i=1..N} θ / (i - 1 + θ)
          ≈ θ · log(1 + N/θ) for large N

Per-session uplift:
  uplift = E[K_N] · pay_per_cluster
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class CRPPartitionParams:
    theta_concentration: float       # CRP concentration parameter θ
    n_customers: int
    pay_per_cluster: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_n_clusters(p: CRPPartitionParams) -> float:
    if p.theta_concentration <= 0:
        raise ValueError("theta must be > 0")
    if p.n_customers < 0:
        raise ValueError("n_customers must be >= 0")
    total = 0.0
    for i in range(1, p.n_customers + 1):
        total += p.theta_concentration / (i - 1 + p.theta_concentration)
    return total


def expected_n_clusters_asymptotic(p: CRPPartitionParams) -> float:
    if p.theta_concentration <= 0 or p.n_customers <= 0:
        return 0.0
    return p.theta_concentration * math.log(1 + p.n_customers / p.theta_concentration)


def analytical_rtp(p: CRPPartitionParams) -> float:
    return expected_n_clusters(p) * p.pay_per_cluster


def mc_simulate(p: CRPPartitionParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    cluster_counts: list[int] = []
    for _ in range(sessions):
        # Simulate CRP for N customers
        clusters: list[int] = []  # sizes
        for n in range(p.n_customers):
            # Sample existing cluster or new
            denom = n + p.theta_concentration
            r = rng.random() * denom
            if r < p.theta_concentration:
                # New cluster
                clusters.append(1)
            else:
                # Pick existing cluster proportional to size
                cumul = p.theta_concentration
                for idx in range(len(clusters)):
                    cumul += clusters[idx]
                    if r < cumul:
                        clusters[idx] += 1
                        break
        n_clusters = len(clusters)
        cluster_counts.append(n_clusters)
        total += n_clusters * p.pay_per_cluster
    return {
        "rtp_mc": total / max(sessions, 1),
        "avg_clusters": sum(cluster_counts) / max(sessions, 1),
    }
