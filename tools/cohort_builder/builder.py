"""PHASE 43 — Cohort builder kernel."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SegmentSpec:
    """One player segment: name + per-spin parameters."""
    name: str
    weight: float                       # cohort-share weight (relative)
    bet_size_mean: float
    bet_size_sigma: float
    payout_mean_per_bet: float          # RTP-implied per-spin payout factor
    payout_sigma: float
    session_spins_mean: float
    session_spins_sigma: float

    def __post_init__(self) -> None:
        if not self.name:
            raise ValueError("segment name must be non-empty")
        if self.weight < 0:
            raise ValueError("weight must be ≥ 0")
        if self.bet_size_mean <= 0:
            raise ValueError("bet_size_mean must be > 0")
        if self.bet_size_sigma < 0:
            raise ValueError("bet_size_sigma must be ≥ 0")
        if self.payout_mean_per_bet < 0:
            raise ValueError("payout_mean_per_bet must be ≥ 0")
        if self.session_spins_mean <= 0:
            raise ValueError("session_spins_mean must be > 0")


@dataclass
class CohortSpec:
    segments: list[SegmentSpec]
    n_players: int = 100
    seed: int = 0xc0_c0_c0

    def __post_init__(self) -> None:
        if not self.segments:
            raise ValueError("segments list must be non-empty")
        if self.n_players < 1:
            raise ValueError("n_players must be ≥ 1")
        if sum(s.weight for s in self.segments) <= 0:
            raise ValueError("sum of segment weights must be > 0")


@dataclass
class PlayerProfile:
    player_id: str
    segment: str
    bet_size: float
    n_spins: int
    seed: int


def _pick_segment(
    segments: list[SegmentSpec], rng: random.Random,
) -> SegmentSpec:
    weights = [s.weight for s in segments]
    total = sum(weights)
    u = rng.random() * total
    acc = 0.0
    for s, w in zip(segments, weights):
        acc += w
        if u <= acc:
            return s
    return segments[-1]


def _sample_positive(rng: random.Random, mean: float, sigma: float) -> float:
    if sigma <= 0:
        return mean
    # Reflect at 0 to keep positive
    v = rng.gauss(mean, sigma)
    return abs(v) if v < 0 else v


def _sample_positive_int(rng: random.Random, mean: float, sigma: float) -> int:
    return max(1, int(round(_sample_positive(rng, mean, sigma))))


def generate_cohort_events(
    spec: CohortSpec,
) -> list[dict[str, Any]]:
    """Generate a flat list of spin-event dicts (compatible with PHASE 23
    SpinEvent shape).

    Each event is:
      {"player_id": ..., "session_id": ..., "ts_unix": float,
       "bet_amount": float, "payout_amount": float}
    """
    rng = random.Random(spec.seed)
    profiles: list[PlayerProfile] = []
    for p in range(spec.n_players):
        seg = _pick_segment(spec.segments, rng)
        bet = _sample_positive(rng, seg.bet_size_mean, seg.bet_size_sigma)
        n_spins = _sample_positive_int(
            rng, seg.session_spins_mean, seg.session_spins_sigma,
        )
        profiles.append(PlayerProfile(
            player_id=f"player-{p:04d}",
            segment=seg.name,
            bet_size=round(bet, 4),
            n_spins=n_spins,
            seed=rng.randint(0, 2**31 - 1),
        ))

    events: list[dict[str, Any]] = []
    seg_lookup = {s.name: s for s in spec.segments}
    for p in profiles:
        seg = seg_lookup[p.segment]
        player_rng = random.Random(p.seed)
        for i in range(p.n_spins):
            payout = _sample_positive(
                player_rng,
                seg.payout_mean_per_bet * p.bet_size,
                seg.payout_sigma * p.bet_size,
            )
            events.append({
                "player_id": p.player_id,
                "session_id": f"{p.player_id}-s1",
                "ts_unix": float(i),
                "bet_amount": p.bet_size,
                "payout_amount": round(payout, 4),
                "segment": p.segment,
            })
    return events
