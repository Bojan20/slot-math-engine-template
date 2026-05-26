"""Closed-form kernel — Sticky Wild Persistence Markov.

Industry pattern (NetEnt Gonzo's Quest Megaways, Pragmatic Bigger Bass
Splash, Vendor C Lightning Wild): during FS sessions, wilds can land
and remain "sticky" for the remainder of the session. State = current
wild count W; transition = drop additional + expire none (sticky).

Closed-form derivation
======================

Per FS spin, expected new wilds landed = N_cells × p_wild_landing.
Sticky wilds persist; expected wild count after k spins:

  E[W_k] = E[W_{k-1}] + N_cells × p_wild  (no decay)
         = k × N_cells × p_wild

Cumulative RTP contribution from sticky wilds is the expected wild
count weighted by pay-completion probability:

  RTP_sticky = Σ_{k=1..K_max} P(at spin k) × E[W_k] × pay_contribution

Approximate `pay_contribution` per wild as `wild_pay_rate × pay_HT`
where wild_pay_rate is a kernel parameter (per-wild-cell expected
line-completion contribution under the engine's L-to-R model).

Stationary Markov state distribution is degenerate (absorbing at
max grid coverage) — practical model truncates at K_max FS spins.

Acceptance band
===============

±2 % at 100K MC. Stickiness correlation across spins doesn't impair
the linear E[W_k] = k × λ identity (Wald).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class StickyWildParams:
    """Parameters for sticky-wild Markov kernel.

    n_cells:          FS grid cells
    p_wild_landing:   per-cell probability of NEW wild landing per spin
    fs_spins_total:   total FS spins (typically 6-20)
    wild_pay_rate:    avg pay × bet contribution per sticky wild per
                      remaining FS spin (engine-derived constant; e.g.
                      0.05 means each wild ≈ 5% RTP per FS spin to a
                      single payline)
    """

    n_cells: int
    p_wild_landing: float
    fs_spins_total: int
    wild_pay_rate: float


ACCEPTANCE_TOLERANCE_MC = 0.02


def expected_total_wilds(p: StickyWildParams) -> float:
    """E[final W] = fs_spins × n_cells × p_wild_landing (Wald)."""
    return p.fs_spins_total * p.n_cells * p.p_wild_landing


def analytical_rtp(p: StickyWildParams) -> float:
    """RTP_sticky per FS session.

    Per FS spin k (1-indexed), expected wild count = k × N × p_wild.
    Each sticky wild contributes wild_pay_rate to the remaining FS
    spins. Total = Σ_{k=1..K} (k × N × p_wild) × wild_pay_rate.

    Closed form: Σ_{k=1..K} k = K(K+1)/2, so:

      RTP = N_cells × p_wild × wild_pay_rate × K(K+1)/2
    """
    if p.fs_spins_total <= 0 or p.p_wild_landing <= 0:
        return 0.0
    sum_k = p.fs_spins_total * (p.fs_spins_total + 1) / 2.0
    return p.n_cells * p.p_wild_landing * p.wild_pay_rate * sum_k


def mc_simulate(
    p: StickyWildParams,
    sessions: int = 100_000,
    seed: int = 42,
) -> dict[str, float]:
    """MC reference — simulate `sessions` FS sessions, each fs_spins_total
    spins long, tracking sticky wild count + accumulating pay."""
    rng = random.Random(seed)
    total_pay = 0.0
    total_final_wilds = 0
    for _ in range(sessions):
        wild_count = 0
        session_pay = 0.0
        for _spin in range(p.fs_spins_total):
            # New wilds this spin: Binomial(n_cells, p_wild_landing)
            new_wilds = sum(
                1 for _ in range(p.n_cells)
                if rng.random() < p.p_wild_landing
            )
            wild_count += new_wilds
            # Pay from current sticky wild count this spin
            session_pay += wild_count * p.wild_pay_rate
        total_pay += session_pay
        total_final_wilds += wild_count
    return {
        "rtp_mc": total_pay / max(sessions, 1),
        "mean_final_wild_count": total_final_wilds / max(sessions, 1),
    }
