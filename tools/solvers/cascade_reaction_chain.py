"""Closed-form kernel — Cascade Reaction Chain RTP.

Industry pattern (NetEnt Aloha! Cluster Pays, Pragmatic Sweet Bonanza,
Hacksaw Mining Pots): a winning spin removes the winning symbols and
new ones cascade in from the top. Each cascade is itself an
independent winning trial with a (smaller) probability per cell.

Closed-form derivation
======================

Let:
  p_win   = probability that a fresh cascade draw produces ≥ 1 win
  E_pay   = expected pay × bet per winning cascade
  p_geom  = retention probability — same as p_win under the iid
            cascade assumption (each cascade is identically
            distributed; this is exact when fresh symbols are drawn
            from the same source distribution as the base spin)

Expected number of cascades per spin (geometric chain stopped at
first non-winning cascade, including the trigger spin if it wins):

  E[N] = 1 / (1 − p_win)           (Geometric tail)

But the FIRST evaluation is independent — it may not even be a win.
So conditional on the spin starting a chain (prob p_win):

  E[total pay | chain started] = E_pay × E[N]
                               = E_pay / (1 − p_win)

Unconditional:

  E[RTP] = p_win × E_pay / (1 − p_win)
         = E_pay × p_win / (1 − p_win)

Variance — geometric distribution of N has Var[N] = p / (1−p)².
Assuming pay-per-cascade variance is dominated by chain length:

  Var[total pay] ≈ E_pay² × p_win / (1 − p_win)²

Acceptance band
===============
±2 % at 50K spins.  Independence between cascades is exact when the
RNG resamples cells from the same distribution; in practice a few
games tweak the cascade reel weights to keep RTP steady (we don't
model that here — solver assumes iid cascades).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class CascadeChainParams:
    """Parameters for the cascade-chain closed-form solver.

    p_win:    per-cascade win probability (Bernoulli)
    e_pay:    expected pay (× bet) per winning cascade
    max_chain: hard cap on chain length (some games cap at e.g. 10)
    """

    p_win: float
    e_pay: float
    max_chain: int = 10_000


def expected_chain_length(p: CascadeChainParams) -> float:
    """E[N | a chain started] under geometric tail with cap."""
    if p.p_win <= 0:
        return 1.0
    if p.p_win >= 1:
        return float(p.max_chain)
    # Truncated geometric with cap K:
    #   E[N | started] = (1 − p^K) / (1 − p)
    return (1.0 - p.p_win ** p.max_chain) / (1.0 - p.p_win)


def analytical_rtp(p: CascadeChainParams) -> float:
    """Unconditional E[RTP] = p_win × E[N | started] × e_pay."""
    return p.p_win * expected_chain_length(p) * p.e_pay


def variance_total_pay(p: CascadeChainParams) -> float:
    """Approximate Var assuming pay-per-cascade is constant E_pay."""
    if p.p_win <= 0 or p.p_win >= 1:
        return 0.0
    e_n = expected_chain_length(p)
    var_n = p.p_win / (1.0 - p.p_win) ** 2
    # Total pay = e_pay × N → Var = e_pay² × Var[N]
    # plus contribution from initial Bernoulli trigger.
    return (p.e_pay ** 2) * var_n * p.p_win + (p.e_pay * e_n) ** 2 * p.p_win * (1.0 - p.p_win)


def mc_simulate(
    p: CascadeChainParams,
    spins: int = 50_000,
    seed: int = 42,
) -> dict:
    """MC reference — sample N as a truncated geometric, pay = N × e_pay
    on success (with the first cascade gated by Bernoulli p_win)."""
    rng = random.Random(seed)
    total_pay = 0.0
    chain_lens = []
    for _ in range(spins):
        if rng.random() >= p.p_win:
            chain_lens.append(0)
            continue
        n = 1
        while n < p.max_chain and rng.random() < p.p_win:
            n += 1
        chain_lens.append(n)
        total_pay += n * p.e_pay
    mean_n = sum(chain_lens) / max(spins, 1)
    var_n = sum((n - mean_n) ** 2 for n in chain_lens) / max(spins, 1)
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "mean_chain": mean_n,
        "var_chain": var_n,
    }
