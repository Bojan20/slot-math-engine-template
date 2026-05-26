"""Closed-form kernel — Random Wild Reel Drop.

Industry pattern (NetEnt Wild Reels, Yggdrasil Random Wilds):
on a designated trigger (probability `p_trigger`), a random subset
of reels becomes fully-wild. The number of wild reels is drawn from
a weighted distribution `wild_reels_dist` (e.g. {1: 0.6, 2: 0.3, 3: 0.1}).

If a payline can be paid as 5-OAK whenever ≥ `min_wild_reels`
reels are wild AND aligned with the line, the expected per-spin
payout from the trigger is:

  uplift = p_trigger · Σ_k P(k wild reels) · P(line covered | k) · pay_5oak

For uniformly chosen wild reels on a single line of `reels` length:
  P(line covered | k) = C(reels-1, k-min) / C(reels, k)  (subset-cover)

Simpler conservative model used here:
  P(line covered | k) = 1  if k >= reels  (full board)
                       k / reels  otherwise (single-line approximation)
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class WildReelDropParams:
    reels: int
    p_trigger: float
    wild_reels_dist: dict[int, float]   # {k: weight} — auto-normalized
    pay_5oak: float
    min_wild_reels: int = 5             # default = full line coverage


ACCEPTANCE_TOLERANCE_MC = 0.05


def _normalized(dist: dict[int, float]) -> dict[int, float]:
    s = sum(dist.values())
    if s <= 0:
        raise ValueError("wild_reels_dist weights must sum to > 0")
    return {k: v / s for k, v in dist.items()}


def _p_line_covered(reels: int, k_wilds: int, min_required: int) -> float:
    if reels <= 0:
        return 0.0
    if k_wilds >= reels:
        return 1.0
    if k_wilds < min_required:
        return 0.0
    # single-line approximation: P that the k wild reels include the line
    # By symmetry equal to k_wilds / reels times (k_wilds-1)/(reels-1)...
    # we approximate with k_wilds/reels for tractability.
    return k_wilds / reels


def analytical_rtp(p: WildReelDropParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.reels <= 0:
        raise ValueError("reels must be > 0")
    dist = _normalized(p.wild_reels_dist)
    contrib = 0.0
    for k, prob in dist.items():
        contrib += prob * _p_line_covered(p.reels, k, p.min_wild_reels)
    return p.p_trigger * contrib * p.pay_5oak


def mc_simulate(p: WildReelDropParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    dist = _normalized(p.wild_reels_dist)
    ks = sorted(dist.keys())
    cdf = []
    acc = 0.0
    for k in ks:
        acc += dist[k]
        cdf.append(acc)
    total = 0.0
    fires = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        fires += 1
        r = rng.random()
        chosen_k = ks[-1]
        for i, c in enumerate(cdf):
            if r < c:
                chosen_k = ks[i]
                break
        # Sample chosen_k distinct wild reels uniformly
        wild_idx = set(rng.sample(range(p.reels), min(chosen_k, p.reels)))
        # 5-OAK line uses reels 0..reels-1 (single line approx).
        if len(wild_idx) >= p.min_wild_reels and len(wild_idx) >= p.reels:
            total += p.pay_5oak
        elif len(wild_idx) >= p.min_wild_reels:
            # partial single-line coverage approximation
            if all(i in wild_idx for i in range(p.reels)):
                total += p.pay_5oak
    return {
        "rtp_mc": total / max(spins, 1),
        "fire_rate": fires / max(spins, 1),
    }
