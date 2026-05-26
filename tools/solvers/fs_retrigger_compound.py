"""Closed-form kernel — Free Spins Retrigger Compound (Wald variance).

Industry pattern (Vendor B Cash Eruption / Volcano, Vendor C Lightning
Link, Pragmatic Bigger Bass Megaways): a single FS trigger awards K_0
spins; each spin can re-trigger awarding ΔK extra spins until cap.
Total session length T ~ compound distribution. Wald identity gives
E[total pay].

Closed-form derivation (Wald identity, branching/Galton-Watson)
================================================================

Let:
  K_0 = initial spins on first trigger
  p_re = retrigger probability per FS spin
  ΔK = additional spins awarded per retrigger
  K_max = session cap (total spins)
  pay_per_spin = expected pay × bet per FS spin

Let T = total spins played in a session, N_R = number of retriggers
fired during those T spins. Each played spin is an independent
Bernoulli(p_re) retrigger trial, so:

  T = K_0 + ΔK × N_R
  E[N_R] = E[T] × p_re                     (Wald: stopped sum)
  E[T] = K_0 + ΔK × p_re × E[T]
  → E[T] = K_0 / (1 − p_re × ΔK)           (when p_re × ΔK < 1)

Truncation cap K_max is applied as min(E[T], K_max).

Expected total pay = E[T] × pay_per_spin.

Variance via Wald-II:
  Var[T] = ΔK² × Var[N_R]
  Var[N_R] = E[T] × p_re(1 − p_re) + Var[T] × p_re²
  Solving:
  Var[T] = ΔK² × E[T] × p_re(1 − p_re) / (1 − (ΔK × p_re)²)

Acceptance band
===============

±2 % at 100K MC sessions. Variance estimate is approximate (Wald
formula assumes Poisson-like compound; geometric departures from
mean introduce ±5 % bias).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class FsRetriggerParams:
    """Parameters for the FS retrigger compound kernel.

    initial_spins:    K_0 — first-trigger spin count
    retrigger_prob:   p_re — per-FS-spin retrigger probability
    retrigger_spins:  ΔK — spins added per retrigger
    max_total_spins:  K_max — session cap
    pay_per_spin:     expected RTP × bet contribution per FS spin
                      (from base game's FS line eval — engine-derived)
    """

    initial_spins: int
    retrigger_prob: float
    retrigger_spins: int
    max_total_spins: int
    pay_per_spin: float


ACCEPTANCE_TOLERANCE_MC = 0.02


def expected_total_spins(p: FsRetriggerParams) -> float:
    """Wald-identity expected total spins per session.

    E[T] = K_0 / (1 − p_re × ΔK),  capped at K_max.

    If p_re × ΔK ≥ 1 the branching process is super-critical (mean
    explosion); we clamp directly to K_max in that case.
    """
    if p.retrigger_prob <= 0 or p.retrigger_spins <= 0:
        return float(p.initial_spins)
    m = p.retrigger_prob * p.retrigger_spins
    if m >= 1.0:
        return float(p.max_total_spins)
    expected_t = p.initial_spins / (1.0 - m)
    return min(expected_t, float(p.max_total_spins))


def analytical_rtp(p: FsRetriggerParams) -> float:
    """Expected pay per FS session = E[T] × pay_per_spin."""
    return expected_total_spins(p) * p.pay_per_spin


def variance_total_spins(p: FsRetriggerParams) -> float:
    """Wald-II compound variance:
       Var[T] = ΔK² × E[T] × p_re(1 − p_re) / (1 − (ΔK × p_re)²)
    """
    if p.retrigger_prob <= 0 or p.retrigger_spins <= 0:
        return 0.0
    pr = p.retrigger_prob
    dk = p.retrigger_spins
    m = pr * dk
    if m >= 1.0:
        # Super-critical branching: variance diverges. Return cap-based
        # finite upper bound to keep callers numerically safe.
        return float(p.max_total_spins) ** 2
    e_t = expected_total_spins(p)
    return (dk * dk) * e_t * pr * (1.0 - pr) / max(1.0 - m * m, 1e-12)


def mc_simulate(
    p: FsRetriggerParams,
    sessions: int = 100_000,
    seed: int = 42,
) -> dict[str, float]:
    """MC reference — simulate sessions with Bernoulli retriggers,
    capped at max_total_spins."""
    rng = random.Random(seed)
    total_pay = 0.0
    spin_counts: list[int] = []
    for _ in range(sessions):
        remaining = p.initial_spins
        total = 0
        while remaining > 0 and total < p.max_total_spins:
            remaining -= 1
            total += 1
            total_pay += p.pay_per_spin
            if rng.random() < p.retrigger_prob:
                room = p.max_total_spins - total - remaining
                if room > 0:
                    remaining += min(p.retrigger_spins, room)
        spin_counts.append(total)
    mean_t = sum(spin_counts) / max(sessions, 1)
    var_t = sum((c - mean_t) ** 2 for c in spin_counts) / max(sessions, 1)
    return {
        "rtp_mc": total_pay / max(sessions, 1),
        "mean_total_spins": mean_t,
        "var_total_spins": var_t,
    }
