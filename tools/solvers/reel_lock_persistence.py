"""Closed-form kernel — Reel Lock + Hold (sticky-reel persistence).

Industry pattern (NetEnt Starburst expanding wild, Vendor C Pixies
respin, Pragmatic Sticky Bandits): when a target symbol/wild lands on
a reel, that reel locks for the next K free respins. Locks compound:
each spin can add new locks; chain terminates when no new lock for
`miss_streak` consecutive respins OR all reels locked.

Closed-form
===========

Per spin, prob a given un-locked reel locks: p_lock.
Sum over reels = E[locks per spin]. Expected session length until
all reels locked OR terminator fires:

  E[spins | start] = min(n_reels / p_lock, miss_streak / (1 − p_lock))

This is an approximation; engine MC remains source of truth. Per-spin
RTP contribution from locks = base_pay_per_spin × E[locked reels].
"""
from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass
class ReelLockParams:
    n_reels: int
    p_lock_per_reel: float
    miss_streak: int
    base_pay_per_spin: float
    pay_per_locked_reel: float


def expected_session_length(p: ReelLockParams) -> float:
    if p.p_lock_per_reel <= 0 or p.n_reels <= 0:
        return 0.0
    n_bound = p.n_reels / p.p_lock_per_reel
    if p.p_lock_per_reel >= 1.0:
        return float(p.miss_streak)
    miss_bound = p.miss_streak / (1.0 - p.p_lock_per_reel)
    return min(n_bound, miss_bound)


def expected_locked_reels(p: ReelLockParams) -> float:
    """E[locked reels at session end]."""
    if p.p_lock_per_reel <= 0:
        return 0.0
    e_spins = expected_session_length(p)
    return min(p.n_reels, e_spins * p.p_lock_per_reel)


def analytical_rtp(p: ReelLockParams) -> float:
    """Per-trigger expected pay (base + locked bonus)."""
    e_spins = expected_session_length(p)
    e_locked = expected_locked_reels(p)
    return e_spins * p.base_pay_per_spin + e_locked * p.pay_per_locked_reel


def mc_simulate(p: ReelLockParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    spin_total = 0
    lock_total = 0
    for _ in range(sessions):
        locked = [False] * p.n_reels
        miss = 0
        spins = 0
        while miss < p.miss_streak and not all(locked):
            spins += 1
            new_lock = False
            for r in range(p.n_reels):
                if not locked[r] and rng.random() < p.p_lock_per_reel:
                    locked[r] = True
                    new_lock = True
            if new_lock:
                miss = 0
            else:
                miss += 1
        n_locked = sum(locked)
        total_pay += spins * p.base_pay_per_spin
        total_pay += n_locked * p.pay_per_locked_reel
        spin_total += spins
        lock_total += n_locked
    return {
        "rtp_mc": total_pay / max(sessions, 1),
        "mean_spins": spin_total / max(sessions, 1),
        "mean_locked": lock_total / max(sessions, 1),
    }
