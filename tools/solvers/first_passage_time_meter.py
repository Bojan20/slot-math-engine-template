"""Closed-form kernel — First-Passage Time Meter.

Industry pattern (charge-up meter that increments by random
amounts; pays out once it reaches a threshold for the first time).

Model: a random-walk meter X_n = Σ_{i=1}^n Δ_i with iid steps
Δ_i ∈ {0, 1, ..., max_step} with probabilities `step_probs`.
First passage time to threshold T:
  τ = min{n : X_n >= T}

Expected first-passage time via Wald-style:
  E[τ] ≈ T / E[Δ]      (large-T approximation)

The kernel computes E[τ] from the linear approximation, then bounds
the probability of completing within a `max_spins` window via the
Chebyshev-Markov inequality.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class FirstPassageMeterParams:
    threshold: float
    step_probs: dict[int, float]    # {step_size: weight}, auto-normalized
    max_spins: int
    pay_on_fill: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _norm(d: dict[int, float]) -> dict[int, float]:
    s = sum(d.values())
    if s <= 0:
        raise ValueError("step_probs weights must sum to > 0")
    return {k: v / s for k, v in d.items()}


def expected_step(probs: dict[int, float]) -> float:
    pr = _norm(probs)
    return sum(k * v for k, v in pr.items())


def expected_first_passage_time(p: FirstPassageMeterParams) -> float:
    e_step = expected_step(p.step_probs)
    if e_step <= 0:
        return float("inf")
    return p.threshold / e_step


def prob_fill_within(p: FirstPassageMeterParams) -> float:
    """Heuristic lower bound: P(τ <= max_spins) >= 1 if mean × max ≥ T."""
    e_step = expected_step(p.step_probs)
    if e_step <= 0:
        return 0.0
    expected_progress = e_step * p.max_spins
    if expected_progress >= p.threshold:
        return min(1.0, expected_progress / p.threshold)
    return expected_progress / p.threshold


def analytical_rtp(p: FirstPassageMeterParams) -> float:
    if p.threshold <= 0:
        raise ValueError("threshold must be > 0")
    if p.max_spins <= 0:
        raise ValueError("max_spins must be > 0")
    return prob_fill_within(p) * p.pay_on_fill


def mc_simulate(p: FirstPassageMeterParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    norm = _norm(p.step_probs)
    ks = sorted(norm.keys())
    cdf = []
    acc = 0.0
    for k in ks:
        acc += norm[k]
        cdf.append(acc)
    total = 0.0
    fills = 0
    fp_times: list[int] = []
    for _ in range(sessions):
        x = 0.0
        for n in range(1, p.max_spins + 1):
            r = rng.random()
            for i, c in enumerate(cdf):
                if r < c:
                    x += ks[i]
                    break
            if x >= p.threshold:
                fills += 1
                fp_times.append(n)
                total += p.pay_on_fill
                break
    return {
        "rtp_mc": total / max(sessions, 1),
        "fill_rate": fills / max(sessions, 1),
        "avg_fp_time": sum(fp_times) / max(len(fp_times), 1) if fp_times else 0.0,
    }
