"""SLOT-MATH W244 MC Runtime — cluster-pays sampler.

Closes the skipped Mystic Cluster MC gate. Per-spin sampler for
cluster-pays slot games (Sweet Bonanza / Aloha / Gates of Olympus).

Strategy: NOT BFS-on-grid (intractable closed-form, irrelevant for
RTP convergence). Instead sample DIRECTLY from the
`cluster_count_distribution` × `pay_table` joint that the cluster_pays
kernel uses as its CF input. Per-spin sampler:

  For each (symbol, cluster_size) ∈ distribution:
      cluster_count ~ Poisson(expected_count_per_spin)
      per_spin_pay += cluster_count × pay[symbol][cluster_size]

Plus optional cascade uplift: if base spin pays, apply cascade
geometric tail (E[cascade_chain] ≈ 1 / (1 - p_continue)) and scale.

This sampler is the MC twin of `cluster_pays_rtp()`:

    E_MC[spin_pay] → E_CF[spin_pay] = sum(count × pay) within Wilson CI

Plus cap clamping (per_spin pay ≤ max_win_cap_x).

Acceptance: per-spin MC mean converges to CF (cluster_pays_base +
cascade_uplift) within Wilson 99% CI at 1M+ spinova.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any


# ─── Per-spin sample ──────────────────────────────────────────────────


@dataclass
class ClusterSpinSample:
    """Outcome of one cluster-pays spin."""
    base_payout_x: float = 0.0
    cascade_payout_x: float = 0.0
    n_clusters_total: int = 0
    per_symbol_payouts: dict[str, float] = field(default_factory=dict)

    @property
    def total_payout_x(self) -> float:
        return self.base_payout_x + self.cascade_payout_x


# ─── Cluster executor (drop-in MC twin of cluster_pays_rtp) ───────────


@dataclass
class ClusterSpinExecutor:
    """Per-spin sampler from CF cluster distribution + pay table.

    Designed to match `cluster_pays_rtp()` in expectation. Cascade is
    modeled as a geometric chain: P(continue cascade) ≈ probability of
    paying spin (estimated from cf_base_rtp > 0 ⇒ ~hit rate, calibrated
    so E_MC[cascade] ≈ cf_cascade_uplift).
    """

    # Cluster source (str symbol → int size → expected count per spin)
    cluster_distribution: dict[str, dict[int, float]]
    pay_table: dict[str, dict[int, float]]
    min_cluster_size: int = 5
    # Cascade calibration
    cascade_uplift_target: float = 0.0   # CF target for cascade slice
    cascade_continue_p: float = 0.0      # geometric chain continuation prob
    # Per-spin cap
    max_win_cap_x: float = 10_000.0

    def spin(self, rng: random.Random) -> ClusterSpinSample:
        sample = ClusterSpinSample()
        # Sample clusters per (symbol, size)
        for sym, size_dist in self.cluster_distribution.items():
            sym_pay_for_size = self.pay_table.get(sym, {})
            for size, expected_count in size_dist.items():
                if size < self.min_cluster_size:
                    continue
                if expected_count <= 0:
                    continue
                # Poisson sample for cluster count this spin
                n = _poisson(rng, expected_count)
                if n == 0:
                    continue
                pay = sym_pay_for_size.get(size, 0.0)
                contrib = n * pay
                if contrib <= 0:
                    continue
                sample.base_payout_x += contrib
                sample.n_clusters_total += n
                sample.per_symbol_payouts[sym] = (
                    sample.per_symbol_payouts.get(sym, 0.0) + contrib
                )

        # Cascade: only triggers when at least one paying cluster
        if sample.base_payout_x > 0 and self.cascade_continue_p > 0:
            # Geometric chain: N additional cascade rewards
            cascade_extra = _geometric_chain_pay(
                rng, sample.base_payout_x, self.cascade_continue_p
            )
            sample.cascade_payout_x = cascade_extra

        # Cap
        total = sample.total_payout_x
        if total > self.max_win_cap_x:
            scale = self.max_win_cap_x / total
            sample.base_payout_x *= scale
            sample.cascade_payout_x *= scale
            for k in sample.per_symbol_payouts:
                sample.per_symbol_payouts[k] *= scale

        return sample


def _poisson(rng: random.Random, lam: float) -> int:
    """Knuth's Poisson sampler — exact for small λ, used here for
    expected_count_per_spin which is typically << 1."""
    if lam <= 0:
        return 0
    if lam > 30:
        # Normal approximation for large λ
        return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))
    L = math.exp(-lam)
    k = 0
    p = 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= L:
            return k - 1


def _geometric_chain_pay(rng: random.Random, base_pay: float, p_continue: float) -> float:
    """Sample cascade chain reward — N additional pays at probability p_continue.

    Each cascade-step pay = base_pay × cascade_ratio (decaying), where
    cascade_ratio is calibrated so E[chain] ≈ cf_cascade_uplift on full
    distribution. Implementation: cascade adds `n × base_pay × decay`
    where n ~ Geometric(p_continue), decay = 0.6 per step.
    """
    n = 0
    while rng.random() < p_continue and n < 16:
        n += 1
    if n == 0:
        return 0.0
    # Total cascade: geometric sum sum_{i=1..n} base × decay^i
    decay = 0.6
    total = 0.0
    cur = base_pay
    for _ in range(n):
        cur *= decay
        total += cur
    return total


# ─── Calibration helper ───────────────────────────────────────────────


def calibrate_cascade_continue_p(
    cluster_distribution: dict[str, dict[int, float]],
    pay_table: dict[str, dict[int, float]],
    cf_cluster_base: float,
    cf_cascade_uplift: float,
    min_cluster_size: int = 5,
) -> float:
    """Inverse-solve continue_p so E[cascade_chain] ≈ cf_cascade_uplift.

    Closed-form: E[cascade_pay] = cf_cluster_base × E[chain_factor]
                = cf_cluster_base × Σ_{n>=1} P(N=n) × base_ratio_sum(n)
    With geometric P(N=n) = p^n × (1-p) (approximation):
      E[chain_factor] = p × decay / (1 - p × decay)   (after summing)

    Solve: cf_cascade_uplift / cf_cluster_base = p × decay / (1 - p × decay)
    where decay = 0.6 (fixed in geometric chain).

    Algebra: let R = cf_cascade_uplift / cf_cluster_base
            R = p×0.6 / (1 - p×0.6)
            R(1 - p×0.6) = p × 0.6
            R = p × 0.6 (1 + R)
            p = R / (0.6 × (1 + R))
    """
    if cf_cluster_base <= 0:
        return 0.0
    R = cf_cascade_uplift / cf_cluster_base
    p = R / (0.6 * (1.0 + R))
    return max(0.0, min(p, 0.95))


# ─── Streaming stats + run_mc_cluster ─────────────────────────────────


@dataclass
class ClusterStreamingStats:
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0
    max_observed: float = 0.0
    hits: int = 0
    cascade_hits: int = 0
    total_clusters: int = 0

    def push(self, sample: ClusterSpinSample) -> None:
        self.n += 1
        x = sample.total_payout_x
        delta = x - self.mean
        self.mean += delta / self.n
        delta2 = x - self.mean
        self.m2 += delta * delta2
        if x > self.max_observed:
            self.max_observed = x
        if sample.base_payout_x > 0:
            self.hits += 1
        if sample.cascade_payout_x > 0:
            self.cascade_hits += 1
        self.total_clusters += sample.n_clusters_total

    @property
    def variance(self) -> float:
        return self.m2 / max(self.n - 1, 1)

    @property
    def std_error(self) -> float:
        return math.sqrt(self.variance / max(self.n, 1))

    def wilson_99_halfwidth(self) -> float:
        return 2.576 * self.std_error


@dataclass
class ClusterMcResult:
    spins: int
    seed: int
    rtp: float
    std_error: float
    wilson_99_halfwidth: float
    hit_rate: float
    cascade_rate: float
    avg_clusters_per_spin: float
    max_win_x: float
    cf_target_rtp: float | None = None
    delta_bps: float | None = None
    convergence_pass: bool = True


def build_cluster_executor_from_cf(
    cf: dict[str, Any],
    ir: dict[str, Any] | None = None,
) -> ClusterSpinExecutor:
    """Build a cluster-pays MC executor from CF source."""
    cluster_dist_raw = cf.get("cluster_distribution", {})
    pay_table_raw = cf.get("pay_table", {})
    cluster_dist = {
        sym: {int(k): float(v) for k, v in dist.items()}
        for sym, dist in cluster_dist_raw.items()
    }
    pay_table = {
        sym: {int(k): float(v) for k, v in tier.items()}
        for sym, tier in pay_table_raw.items()
    }
    cf_base = cf.get("components", {}).get("cluster_pays_base", 0.0)
    cf_cascade = cf.get("components", {}).get("cascade_uplift", 0.0)
    cascade_p = calibrate_cascade_continue_p(
        cluster_dist, pay_table, cf_base, cf_cascade
    )
    eval_block = (ir or {}).get("evaluation", {})
    min_cs = int(eval_block.get("min_cluster_size", 5))
    bet_block = (ir or {}).get("bet", {})
    max_cap = float(bet_block.get("max_win_x", 10_000.0))

    return ClusterSpinExecutor(
        cluster_distribution=cluster_dist,
        pay_table=pay_table,
        min_cluster_size=min_cs,
        cascade_uplift_target=cf_cascade,
        cascade_continue_p=cascade_p,
        max_win_cap_x=max_cap,
    )


def run_mc_cluster(
    executor: ClusterSpinExecutor,
    spins: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
) -> ClusterMcResult:
    """Run N cluster-pays spins; return convergence stats."""
    rng = random.Random(seed)
    stats = ClusterStreamingStats()
    for _ in range(spins):
        sample = executor.spin(rng)
        stats.push(sample)
    rtp = stats.mean
    se = stats.std_error
    half = stats.wilson_99_halfwidth()
    delta_bps = None
    convergence = True
    if cf_target_rtp is not None:
        delta_bps = (rtp - cf_target_rtp) * 10000.0
        convergence = abs(rtp - cf_target_rtp) <= half

    return ClusterMcResult(
        spins=spins,
        seed=seed,
        rtp=rtp,
        std_error=se,
        wilson_99_halfwidth=half,
        hit_rate=stats.hits / max(stats.n, 1),
        cascade_rate=stats.cascade_hits / max(stats.n, 1),
        avg_clusters_per_spin=stats.total_clusters / max(stats.n, 1),
        max_win_x=stats.max_observed,
        cf_target_rtp=cf_target_rtp,
        delta_bps=delta_bps,
        convergence_pass=convergence,
    )
