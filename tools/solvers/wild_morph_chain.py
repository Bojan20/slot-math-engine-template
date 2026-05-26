"""Closed-form kernel — Wild Morph Chain.

Industry pattern (Yggdrasil Vikings morphing wilds, Pragmatic
Bigger Bass Bonanza compound wild): a wild lands and morphs into
a new symbol identity on each respin from a transition matrix. The
expected long-run value of the wild equals the stationary-distribution
weighted average of its possible identity pays.

Closed-form
===========

For a regular (irreducible, aperiodic) Markov chain with transition
matrix P and identity-pay vector v, the expected per-respin pay
converges to:

  E[per-respin] = Σ_i π_i · v_i

where π is the stationary distribution. We approximate π by power
iteration up to convergence.

Expected wild value across n_respins:
  E[wild value] = n_respins · E[per-respin]
  uplift = p_spawn · E[wild value]
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class WildMorphChainParams:
    p_spawn: float
    transition_matrix: list[list[float]]   # rows sum to 1
    identity_pays: list[float]
    n_respins: int
    initial_state: int = 0


ACCEPTANCE_TOLERANCE_MC = 0.05


def _stationary(P: list[list[float]], max_iter: int = 500) -> list[float]:
    n = len(P)
    if n == 0:
        return []
    pi = [1.0 / n] * n
    for _ in range(max_iter):
        new_pi = [0.0] * n
        for i in range(n):
            for j in range(n):
                new_pi[j] += pi[i] * P[i][j]
        # check convergence
        diff = sum(abs(new_pi[i] - pi[i]) for i in range(n))
        pi = new_pi
        if diff < 1e-9:
            break
    return pi


def expected_per_respin(p: WildMorphChainParams) -> float:
    n = len(p.identity_pays)
    if n == 0:
        return 0.0
    if len(p.transition_matrix) != n:
        raise ValueError("transition_matrix dimension mismatch")
    for row in p.transition_matrix:
        if len(row) != n:
            raise ValueError("non-square transition_matrix row")
        s = sum(row)
        if abs(s - 1.0) > 1e-6:
            raise ValueError(f"transition row must sum to 1 (got {s})")
    pi = _stationary(p.transition_matrix)
    return sum(pi[i] * p.identity_pays[i] for i in range(n))


def analytical_rtp(p: WildMorphChainParams) -> float:
    if not (0.0 <= p.p_spawn <= 1.0):
        raise ValueError("p_spawn out of [0, 1]")
    if p.n_respins < 0:
        raise ValueError("n_respins must be >= 0")
    per_step = expected_per_respin(p)
    return p.p_spawn * p.n_respins * per_step


def mc_simulate(p: WildMorphChainParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    triggers = 0
    n = len(p.identity_pays)
    if n == 0:
        return {"rtp_mc": 0.0, "trigger_rate": 0.0}
    # Precompute row CDFs
    cdf: list[list[float]] = []
    for row in p.transition_matrix:
        acc = 0.0
        out_row = []
        for w in row:
            acc += w
            out_row.append(acc)
        cdf.append(out_row)
    for _ in range(spins):
        if rng.random() >= p.p_spawn:
            continue
        triggers += 1
        state = p.initial_state
        for _ in range(p.n_respins):
            r = rng.random()
            nxt = n - 1
            for j, c in enumerate(cdf[state]):
                if r < c:
                    nxt = j
                    break
            state = nxt
            total += p.identity_pays[state]
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }
