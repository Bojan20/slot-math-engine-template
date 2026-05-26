"""Closed-form kernel — Dirichlet-Sampled Segment Weights.

Industry pattern (operator wants the wheel segment probabilities
to themselves be uncertain / drawn from a Dirichlet prior — e.g.
when calibrating to a target RTP from limited field data).

Closed-form
===========

Segment weights w_i ~ Dirichlet(α_1, ..., α_N). Marginal mean of
each w_i is α_i / Σ α_j. Expected per-spin pay equals the
Dirichlet-expected weighted average:

  E[pay] = Σ_i (α_i / α_0) · pay_i,     α_0 = Σ α_j

This kernel exposes the closed-form mean and the variance of the
Dirichlet-induced pay distribution.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class DirichletSegmentParams:
    alphas: list[float]            # Dirichlet concentration params
    segment_pays: list[float]


ACCEPTANCE_TOLERANCE_MC = 0.05


def _alpha_sum(alphas: list[float]) -> float:
    s = sum(alphas)
    if s <= 0:
        raise ValueError("alphas must sum to > 0")
    return s


def expected_pay(p: DirichletSegmentParams) -> float:
    if len(p.alphas) != len(p.segment_pays):
        raise ValueError("alphas / segment_pays length mismatch")
    a0 = _alpha_sum(p.alphas)
    return sum((a / a0) * pay for a, pay in zip(p.alphas, p.segment_pays))


def variance_pay(p: DirichletSegmentParams) -> float:
    """Var of E[pay] = Σ_i w_i · pay_i where w ~ Dir(α)."""
    a0 = _alpha_sum(p.alphas)
    a0_sq = a0 * (a0 + 1)
    # Var(Σ w_i v_i) = Σ_i Var(w_i) v_i^2 + 2 Σ_{i<j} Cov(w_i, w_j) v_i v_j
    # Var(w_i) = α_i(α_0 - α_i) / (α_0^2 (α_0 + 1))
    # Cov(w_i, w_j) = -α_i α_j / (α_0^2 (α_0 + 1))
    total = 0.0
    for i, (ai, vi) in enumerate(zip(p.alphas, p.segment_pays)):
        var_i = ai * (a0 - ai) / (a0 ** 2 * (a0 + 1))
        total += var_i * vi ** 2
        for j in range(i + 1, len(p.alphas)):
            aj = p.alphas[j]
            vj = p.segment_pays[j]
            cov = -ai * aj / (a0 ** 2 * (a0 + 1))
            total += 2 * cov * vi * vj
    return total


def analytical_rtp(p: DirichletSegmentParams) -> float:
    return expected_pay(p)


def mc_simulate(p: DirichletSegmentParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    # Use a fresh Dirichlet sample per spin (operator uncertainty)
    total = 0.0
    for _ in range(spins):
        # Dirichlet via Gamma deviates
        gammas = [rng.gammavariate(a, 1.0) for a in p.alphas]
        s = sum(gammas)
        if s <= 0:
            continue
        # Single weighted pay draw
        weights = [g / s for g in gammas]
        cdf = []
        acc = 0.0
        for w in weights:
            acc += w
            cdf.append(acc)
        r = rng.random()
        for i, c in enumerate(cdf):
            if r < c:
                total += p.segment_pays[i]
                break
    return {
        "rtp_mc": total / max(spins, 1),
    }
