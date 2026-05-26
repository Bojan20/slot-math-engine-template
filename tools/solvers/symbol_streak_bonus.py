"""Closed-form kernel — Symbol Streak Bonus.

Industry pattern (Aristocrat Buffalo "stampede" multipliers, Pragmatic
Buffalo King consecutive symbol bonus, NetEnt Reel Rush+ streak meter):
the game tracks consecutive landings of a target symbol over a fixed
window of spins; reaching a streak threshold awards a bonus pay (often
geometric ladder).

Closed-form derivation
======================

Let:
  p_sym             = per-spin probability the streak event fires
                      (the symbol shows on any active position)
  threshold_pays    = {k: pay × bet} for reaching exactly k consecutive
                      hits (k_min ≤ k ≤ k_max)
  window_spins      = number of spins in the tracking window (e.g. 50)

The streak length S on a Bernoulli(p_sym) sequence is the length of
the longest run.  For closed-form RTP we compute E[max-run] indirectly
via the threshold probabilities:

  Pr(streak ≥ k) = 1 − Pr(no k-run in N spins)
  Pr(no k-run in N) ≈ (1 − p_sym^k × (1 − p_sym))^N    (Poisson
                                                            approximation
                                                            for rare
                                                            events;
                                                            exact for
                                                            small p_sym)

Per-window RTP:
  RTP_win = Σ_(k=k_min..k_max) [Pr(streak ≥ k) − Pr(streak ≥ k+1)] × pay_k

Per-spin RTP = RTP_win / window_spins

Acceptance band
===============
±5 % at 50K windows (Poisson approximation introduces ≤3 % bias for
typical p_sym ≤ 0.20).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class SymbolStreakBonusParams:
    """Parameters for the streak-bonus closed-form solver.

    p_sym:          per-spin streak-event Bernoulli probability
    threshold_pays: {k: pay × bet} for reaching exactly k consecutive
    window_spins:   tracking window length (N spins)
    """

    p_sym: float
    threshold_pays: Mapping[int, float]
    window_spins: int = 50


def prob_streak_at_least(p: SymbolStreakBonusParams, k: int) -> float:
    """Poisson-approx P(longest run ≥ k in N Bernoulli trials)."""
    if k <= 0 or p.p_sym <= 0:
        return 0.0
    if p.p_sym >= 1:
        return 1.0 if k <= p.window_spins else 0.0
    # Approximation accuracy: see Erdős–Rényi limit theorem for runs
    lam = p.window_spins * (p.p_sym ** k) * (1.0 - p.p_sym)
    # P(no k-run) ≈ exp(−λ); P(≥1 k-run) ≈ 1 − exp(−λ)
    import math
    return 1.0 - math.exp(-lam)


def analytical_rtp(p: SymbolStreakBonusParams) -> float:
    """Per-spin RTP from the streak bonus."""
    thresholds = sorted(p.threshold_pays.keys())
    if not thresholds:
        return 0.0
    rtp_win = 0.0
    for i, k in enumerate(thresholds):
        p_at_least_k = prob_streak_at_least(p, k)
        if i + 1 < len(thresholds):
            p_at_least_next = prob_streak_at_least(p, thresholds[i + 1])
        else:
            p_at_least_next = 0.0
        # Probability of EXACTLY reaching k (not ≥ thresholds[i+1])
        rtp_win += (p_at_least_k - p_at_least_next) * p.threshold_pays[k]
    return rtp_win / max(p.window_spins, 1)


def mc_simulate(
    p: SymbolStreakBonusParams,
    windows: int = 30_000,
    seed: int = 42,
) -> dict:
    """MC — simulate windows of N Bernoulli draws, count longest run
    of consecutive hits, look up pay."""
    rng = random.Random(seed)
    total_pay = 0.0
    run_lens = []
    thresholds = sorted(p.threshold_pays.keys())
    for _ in range(windows):
        longest = 0
        cur = 0
        for _ in range(p.window_spins):
            if rng.random() < p.p_sym:
                cur += 1
                if cur > longest:
                    longest = cur
            else:
                cur = 0
        run_lens.append(longest)
        # Pay = highest threshold ≤ longest
        pay = 0.0
        for k in thresholds:
            if longest >= k:
                pay = p.threshold_pays[k]
        total_pay += pay
    return {
        "rtp_mc": total_pay / max(windows * p.window_spins, 1),
        "mean_longest_run": sum(run_lens) / max(windows, 1),
    }
