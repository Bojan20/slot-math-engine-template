"""Closed-form kernel — Markov Absorption Free-Spin Retrigger.

Industry pattern (free-spin retrigger chain with N intermediate
states): the free-spin session is modeled as a Markov chain over
"remaining spins" states. Each spin either:

  • triggers a retrigger (transition to state + retrigger_award)
  • does not retrigger (state -= 1)
  • absorbs at state 0

Closed-form expected total free spins played = fundamental matrix
N · 1 vector where N = (I - Q)^(-1) for transient Q.

Expected payout per session:
  uplift = base_pay · E[total_spins_played]
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class MarkovAbsorptionFreespinsParams:
    initial_spins: int
    p_retrigger_per_spin: float
    retrigger_award: int
    base_pay_per_spin: float
    max_state: int = 200


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_total_spins(p: MarkovAbsorptionFreespinsParams) -> float:
    """Solve the absorption time E[T | start at initial_spins].

    Recursion: let h(s) = E[spins played starting at s].
      h(0) = 0
      h(s) = 1 + p_re · h(s - 1 + retrigger_award) + (1 - p_re) · h(s - 1)

    We solve iteratively bottom-up via fixed-point.
    """
    if p.initial_spins < 0:
        raise ValueError("initial_spins must be >= 0")
    if p.initial_spins == 0:
        return 0.0
    if not (0.0 <= p.p_retrigger_per_spin <= 1.0):
        raise ValueError("p_retrigger out of [0, 1]")
    if p.retrigger_award < 0:
        raise ValueError("retrigger_award must be >= 0")
    # Upper state bound: cap at max_state
    H = [0.0] * (p.max_state + 1)
    # Use a finite-horizon Bellman iteration
    # Iterate until convergence
    for _ in range(p.max_state * 3):
        new_H = [0.0] * (p.max_state + 1)
        for s in range(1, p.max_state + 1):
            s_no_re = s - 1
            s_re = min(s - 1 + p.retrigger_award, p.max_state)
            new_H[s] = 1.0 + (
                p.p_retrigger_per_spin * H[s_re]
                + (1.0 - p.p_retrigger_per_spin) * H[s_no_re]
            )
        if all(abs(new_H[s] - H[s]) < 1e-9 for s in range(p.max_state + 1)):
            H = new_H
            break
        H = new_H
    return H[min(p.initial_spins, p.max_state)]


def analytical_rtp(p: MarkovAbsorptionFreespinsParams) -> float:
    return p.base_pay_per_spin * expected_total_spins(p)


def mc_simulate(p: MarkovAbsorptionFreespinsParams, sessions: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    spins_total = 0
    for _ in range(sessions):
        s = p.initial_spins
        spins_this_session = 0
        while s > 0 and spins_this_session < p.max_state * 4:
            spins_this_session += 1
            s -= 1
            if rng.random() < p.p_retrigger_per_spin:
                s += p.retrigger_award
        spins_total += spins_this_session
        total += spins_this_session * p.base_pay_per_spin
    return {
        "rtp_mc": total / max(sessions, 1),
        "avg_spins_per_session": spins_total / max(sessions, 1),
    }
