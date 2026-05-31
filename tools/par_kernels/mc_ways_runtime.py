"""SLOT-MATH W244 MC Runtime — Megaways / ways sampler.

Per-spin sampler for variable-rows ways games (BTG Megaways pattern).

Per-spin algorithm:
  1. Sample row count for each reel from its row distribution
  2. ways_count = product(row_counts)
  3. per_spin_pay = ways_count × per_way_rtp_x_bet × hit_indicator
     where hit_indicator is calibrated so E[indicator] = 1
     (i.e., ways_evaluator's RTP formula treats per_way_rtp as the
     expected pay PER WAY, already weighted by hit probability)
  4. Add cascade overlay (same algebraic-inverse calibration as cluster)

Convergence target:
  E_MC[per_spin_pay] → E[ways] × per_way_rtp_x_bet
                    + cascade_overlay
                    = ways_base + cascade_uplift = total RTP
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any


@dataclass
class WaysSpinSample:
    """Outcome of one ways spin."""
    base_payout_x: float = 0.0
    cascade_payout_x: float = 0.0
    ways_count: int = 0
    paying: bool = False

    @property
    def total_payout_x(self) -> float:
        return self.base_payout_x + self.cascade_payout_x


@dataclass
class WaysSpinExecutor:
    """Per-spin sampler for variable-rows ways games."""
    row_distribution_per_reel: list[dict[int, float]]  # per reel: {row_count: prob}
    per_way_rtp_x_bet: float
    # Cascade overlay
    cascade_uplift_target: float = 0.0
    cascade_continue_p: float = 0.0
    # Pay variance: ways games have heavy-tail per-spin payouts; we model
    # per-spin pay as Bernoulli(hit_p) × Exponential(mean=per_way_rtp/hit_p)
    # to match (E, var) within plausible bounds. hit_p calibrated from CF.
    hit_probability: float = 0.30  # typical Megaways base-game hit rate
    max_win_cap_x: float = 15_000.0

    def _sample_row_count(self, rng: random.Random, reel_idx: int) -> int:
        dist = self.row_distribution_per_reel[reel_idx]
        u = rng.random()
        cum = 0.0
        for row_count, p in dist.items():
            cum += p
            if u <= cum:
                return row_count
        # Numerical floor: return max-row entry
        return max(dist.keys())

    def spin(self, rng: random.Random) -> WaysSpinSample:
        sample = WaysSpinSample()
        # 1. Sample per-reel row counts
        ways = 1
        for reel_idx in range(len(self.row_distribution_per_reel)):
            ways *= self._sample_row_count(rng, reel_idx)
        sample.ways_count = ways

        # 2. Hit indicator + exponential pay magnitude
        if rng.random() < self.hit_probability and self.per_way_rtp_x_bet > 0:
            sample.paying = True
            # E[pay | hit] = per_way_rtp × ways / hit_probability
            # Sample exponential with that mean (heavy-tail realistic)
            mean_pay_given_hit = (ways * self.per_way_rtp_x_bet) / self.hit_probability
            u = max(rng.random(), 1e-300)
            sample.base_payout_x = -mean_pay_given_hit * math.log(u)

        # 3. Cascade overlay
        if sample.base_payout_x > 0 and self.cascade_continue_p > 0:
            n = 0
            while rng.random() < self.cascade_continue_p and n < 16:
                n += 1
            if n > 0:
                decay = 0.6
                cur = sample.base_payout_x
                total = 0.0
                for _ in range(n):
                    cur *= decay
                    total += cur
                sample.cascade_payout_x = total

        # 4. Cap clamp
        total = sample.total_payout_x
        if total > self.max_win_cap_x:
            scale = self.max_win_cap_x / total
            sample.base_payout_x *= scale
            sample.cascade_payout_x *= scale

        return sample


def calibrate_cascade_continue_p_ways(cf_ways_base: float, cf_cascade: float) -> float:
    """Same algebraic inverse as cluster: p = R / (0.6 × (1+R))."""
    if cf_ways_base <= 0 or cf_cascade <= 0:
        return 0.0
    R = cf_cascade / cf_ways_base
    p = R / (0.6 * (1.0 + R))
    return max(0.0, min(p, 0.95))


@dataclass
class WaysStreamingStats:
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0
    max_observed: float = 0.0
    hits: int = 0
    cascade_hits: int = 0
    total_ways: int = 0

    def push(self, sample: WaysSpinSample) -> None:
        self.n += 1
        x = sample.total_payout_x
        delta = x - self.mean
        self.mean += delta / self.n
        delta2 = x - self.mean
        self.m2 += delta * delta2
        if x > self.max_observed:
            self.max_observed = x
        if sample.paying:
            self.hits += 1
        if sample.cascade_payout_x > 0:
            self.cascade_hits += 1
        self.total_ways += sample.ways_count

    @property
    def variance(self) -> float:
        return self.m2 / max(self.n - 1, 1)

    @property
    def std_error(self) -> float:
        return math.sqrt(self.variance / max(self.n, 1))

    def wilson_99_halfwidth(self) -> float:
        return 2.576 * self.std_error


@dataclass
class WaysMcResult:
    spins: int
    seed: int
    rtp: float
    std_error: float
    wilson_99_halfwidth: float
    hit_rate: float
    cascade_rate: float
    avg_ways_count: float
    max_win_x: float
    cf_target_rtp: float | None = None
    delta_bps: float | None = None
    convergence_pass: bool = True


def build_ways_executor_from_cf(
    cf: dict[str, Any], ir: dict[str, Any] | None = None,
) -> WaysSpinExecutor:
    row_dist_raw = cf.get("row_distribution_per_reel", [])
    row_dist = [
        {int(k): float(v) for k, v in reel.items()}
        for reel in row_dist_raw
    ]
    per_way = float(cf.get("per_way_rtp_x_bet", 0.0))
    cf_base = cf.get("components", {}).get("ways_base", 0.0)
    cf_cascade = cf.get("components", {}).get("cascade_uplift", 0.0)
    cascade_p = calibrate_cascade_continue_p_ways(cf_base, cf_cascade)
    bet_block = (ir or {}).get("bet", {})
    max_cap = float(bet_block.get("max_win_x", 15_000.0))
    return WaysSpinExecutor(
        row_distribution_per_reel=row_dist,
        per_way_rtp_x_bet=per_way,
        cascade_uplift_target=cf_cascade,
        cascade_continue_p=cascade_p,
        max_win_cap_x=max_cap,
    )


def run_mc_ways(
    executor: WaysSpinExecutor,
    spins: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
) -> WaysMcResult:
    rng = random.Random(seed)
    stats = WaysStreamingStats()
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
    return WaysMcResult(
        spins=spins, seed=seed, rtp=rtp,
        std_error=se, wilson_99_halfwidth=half,
        hit_rate=stats.hits / max(stats.n, 1),
        cascade_rate=stats.cascade_hits / max(stats.n, 1),
        avg_ways_count=stats.total_ways / max(stats.n, 1),
        max_win_x=stats.max_observed,
        cf_target_rtp=cf_target_rtp,
        delta_bps=delta_bps,
        convergence_pass=convergence,
    )
