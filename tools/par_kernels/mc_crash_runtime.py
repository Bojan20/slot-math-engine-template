"""SLOT-MATH W244 MC Runtime — crash games (Stake Crash / Aviator).

Per-round algorithm:
  1. Sample crash multiplier C from Pareto-with-floor:
       with prob house_edge → C = 1.00 (instant crash)
       else → C ~ Pareto with P(C ≥ m) = 1/m
  2. Player cashes out at pre-committed T ≥ 1
     if C >= T: payout = T (× bet)
     else:      payout = 0
  3. RTP per round = E[payout] = (1 - house_edge)  — INDEPENDENT of T
     (Provably fair invariant: cashout strategy doesn't change long-run RTP.)

Convergence target: E_MC[payout] → 1 - house_edge within Wilson 99% CI.

Variance grows linearly in T (higher target = rarer wins, larger swings).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any


@dataclass
class CrashRoundSample:
    """Outcome of one crash round."""
    crash_multiplier: float = 0.0
    cashout_target: float = 1.0
    payout_x: float = 0.0   # bet multiplier paid out (0 if lost)
    won: bool = False


@dataclass
class CrashExecutor:
    """Per-round crash sampler from (house_edge, cashout_target)."""
    house_edge: float = 0.01
    cashout_target: float = 2.0
    max_win_cap_x: float = 1_000_000.0

    def round(self, rng: random.Random) -> CrashRoundSample:
        sample = CrashRoundSample(cashout_target=self.cashout_target)
        # Sample crash multiplier
        u = rng.random()
        if u < self.house_edge:
            # Instant crash at 1.00× (house edge mass)
            crash = 1.0
        else:
            # Pareto: P(C ≥ m) = (1 - hE) / m  ⇒  C = (1 - hE) / U  for U ∈ [hE, 1)
            # Inverse-CDF sample: u uniform in [hE, 1) ⇒
            #   F(m) = hE + (1 - hE)(1 - 1/m) = u
            #   (u - hE) / (1 - hE) = 1 - 1/m
            #   1/m = 1 - (u - hE) / (1 - hE)
            #   m = 1 / (1 - (u - hE) / (1 - hE))
            t = (u - self.house_edge) / (1.0 - self.house_edge)
            crash = 1.0 / max(1.0 - t, 1e-300)
        sample.crash_multiplier = crash

        # Player payout
        if crash >= self.cashout_target:
            sample.won = True
            sample.payout_x = min(self.cashout_target, self.max_win_cap_x)
        else:
            sample.payout_x = 0.0

        return sample


@dataclass
class CrashStreamingStats:
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0
    max_observed: float = 0.0  # max crash multiplier observed
    wins: int = 0
    total_payout: float = 0.0

    def push(self, sample: CrashRoundSample) -> None:
        self.n += 1
        x = sample.payout_x
        delta = x - self.mean
        self.mean += delta / self.n
        delta2 = x - self.mean
        self.m2 += delta * delta2
        if sample.crash_multiplier > self.max_observed:
            self.max_observed = sample.crash_multiplier
        if sample.won:
            self.wins += 1
        self.total_payout += x

    @property
    def variance(self) -> float:
        return self.m2 / max(self.n - 1, 1)

    @property
    def std_error(self) -> float:
        return math.sqrt(self.variance / max(self.n, 1))

    def wilson_99_halfwidth(self) -> float:
        return 2.576 * self.std_error


@dataclass
class CrashMcResult:
    rounds: int
    seed: int
    rtp: float
    std_error: float
    wilson_99_halfwidth: float
    win_rate: float
    max_crash_observed: float
    cashout_target: float
    house_edge: float
    cf_target_rtp: float | None = None
    delta_bps: float | None = None
    convergence_pass: bool = True


def build_crash_executor_from_cf(
    cf: dict[str, Any], ir: dict[str, Any] | None = None,
) -> CrashExecutor:
    bet_block = (ir or {}).get("bet", {})
    return CrashExecutor(
        house_edge=float(cf.get("house_edge", 0.01)),
        cashout_target=float(cf.get("cashout_multiplier", 2.0)),
        max_win_cap_x=float(bet_block.get("max_win_x", 1_000_000.0)),
    )


def run_mc_crash(
    executor: CrashExecutor,
    rounds: int,
    seed: int = 42,
    cf_target_rtp: float | None = None,
) -> CrashMcResult:
    rng = random.Random(seed)
    stats = CrashStreamingStats()
    for _ in range(rounds):
        stats.push(executor.round(rng))
    rtp = stats.mean
    se = stats.std_error
    half = stats.wilson_99_halfwidth()
    delta_bps = None
    convergence = True
    if cf_target_rtp is not None:
        delta_bps = (rtp - cf_target_rtp) * 10000.0
        convergence = abs(rtp - cf_target_rtp) <= half
    return CrashMcResult(
        rounds=rounds, seed=seed, rtp=rtp,
        std_error=se, wilson_99_halfwidth=half,
        win_rate=stats.wins / max(stats.n, 1),
        max_crash_observed=stats.max_observed,
        cashout_target=executor.cashout_target,
        house_edge=executor.house_edge,
        cf_target_rtp=cf_target_rtp,
        delta_bps=delta_bps,
        convergence_pass=convergence,
    )
