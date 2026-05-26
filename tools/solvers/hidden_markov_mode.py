"""Closed-form kernel — Hidden Markov Mode (Hot/Cold Switching).

Industry pattern (the bonus trigger rate switches between hot and
cold modes via a hidden Markov chain — operator chooses transition
matrix to control long-run hit frequency):

  Hidden state s_t ∈ {hot, cold}
  Trans matrix P = [[1 - p_hc, p_hc], [p_ch, 1 - p_ch]]
  Trigger | s = mode_rate[mode]

Stationary distribution:
  π_hot = p_ch / (p_hc + p_ch)
  π_cold = p_hc / (p_hc + p_ch)

Long-run trigger rate:
  λ = π_hot · rate_hot + π_cold · rate_cold

Per-spin uplift = λ · pay_per_trigger
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class HiddenMarkovModeParams:
    p_hot_to_cold: float       # P(transition hot → cold per spin)
    p_cold_to_hot: float       # P(transition cold → hot per spin)
    rate_hot: float            # trigger probability in hot mode
    rate_cold: float           # trigger probability in cold mode
    pay_per_trigger: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def stationary_distribution(p: HiddenMarkovModeParams) -> tuple[float, float]:
    if not (0.0 <= p.p_hot_to_cold <= 1.0):
        raise ValueError("p_hot_to_cold out of [0, 1]")
    if not (0.0 <= p.p_cold_to_hot <= 1.0):
        raise ValueError("p_cold_to_hot out of [0, 1]")
    total = p.p_hot_to_cold + p.p_cold_to_hot
    if total <= 0:
        return (1.0, 0.0)
    pi_hot = p.p_cold_to_hot / total
    return (pi_hot, 1.0 - pi_hot)


def long_run_trigger_rate(p: HiddenMarkovModeParams) -> float:
    pi_hot, pi_cold = stationary_distribution(p)
    return pi_hot * p.rate_hot + pi_cold * p.rate_cold


def analytical_rtp(p: HiddenMarkovModeParams) -> float:
    return long_run_trigger_rate(p) * p.pay_per_trigger


def mc_simulate(p: HiddenMarkovModeParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    # Start in stationary mode
    pi_hot, _ = stationary_distribution(p)
    state = "hot" if rng.random() < pi_hot else "cold"
    total = 0.0
    triggers = 0
    hot_spins = 0
    for _ in range(spins):
        rate = p.rate_hot if state == "hot" else p.rate_cold
        if state == "hot":
            hot_spins += 1
        if rng.random() < rate:
            total += p.pay_per_trigger
            triggers += 1
        # Mode transition
        if state == "hot" and rng.random() < p.p_hot_to_cold:
            state = "cold"
        elif state == "cold" and rng.random() < p.p_cold_to_hot:
            state = "hot"
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
        "frac_hot": hot_spins / max(spins, 1),
    }
