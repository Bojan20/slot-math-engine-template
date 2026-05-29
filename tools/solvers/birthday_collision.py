"""Closed-form kernel — Birthday-Paradox Collision Bonus.

Industry pattern (Yggdrasil "Same Symbol Twice" feature, NetEnt
mirror-spin bonus): K symbols are drawn uniformly from N possible
identities. Bonus fires when ANY two share the same identity (a
"collision").

Closed-form
===========

  P(no collision) = N! / ((N - K)! · N^K)
                  = Π_{i=0..K-1} (1 - i/N)
  P(collision) = 1 - P(no collision)

Per-spin uplift:
  uplift = P(collision) · pay_on_collision
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class BirthdayCollisionParams:
    n_identities: int        # N
    k_draws: int             # K
    pay_on_collision: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def prob_no_collision(p: BirthdayCollisionParams) -> float:
    if p.n_identities <= 0 or p.k_draws <= 0:
        raise ValueError("counts must be > 0")
    if p.k_draws > p.n_identities:
        return 0.0
    product = 1.0
    for i in range(p.k_draws):
        product *= (1.0 - i / p.n_identities)
    return product


def prob_collision(p: BirthdayCollisionParams) -> float:
    return 1.0 - prob_no_collision(p)


def analytical_rtp(p: BirthdayCollisionParams) -> float:
    return prob_collision(p) * p.pay_on_collision


def mc_simulate(p: BirthdayCollisionParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    collisions = 0
    for _ in range(spins):
        seen = set()
        collided = False
        for _ in range(p.k_draws):
            s = rng.randrange(p.n_identities)
            if s in seen:
                collided = True
                break
            seen.add(s)
        if collided:
            collisions += 1
            total += p.pay_on_collision
    return {
        "rtp_mc": total / max(spins, 1),
        "collision_rate": collisions / max(spins, 1),
    }
