"""SLOT-MATH Faza 3.2 — MC tier matrix.

5 tiers from fast feedback to ultimate regulator audit.

| Tier | Spins/seed | Seeds | Total      | Wallclock (M-series 12-core) |
|------|-----------:|------:|-----------:|------------------------------|
| T1   |        1 M |    32 |       32 M | ~15 s   (designer feedback)  |
| T2   |       10 M |    16 |      160 M | ~1 min  (CI gate)            |
| T3   |        1 B |     8 |        8 B | ~10 min (regulator GLI-19)   |
| T4   |       10 B |     4 |       40 B | ~30 min (pre-deploy stress)  |
| T5   |      100 B |     2 |      200 B | ~30-60 min (ultimate audit)  |
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import Enum


class Tier(str, Enum):
    T1 = "T1"
    T2 = "T2"
    T3 = "T3"
    T4 = "T4"
    T5 = "T5"


@dataclass(frozen=True)
class TierConfig:
    """One tier's compute envelope."""

    tier: Tier
    spins_per_seed: int
    seed_count: int
    description: str
    expected_wallclock_seconds: int  # for M-series 12-core, closed-form kernel path

    @property
    def total_spins(self) -> int:
        return self.spins_per_seed * self.seed_count


TIERS: dict[Tier, TierConfig] = {
    Tier.T1: TierConfig(
        tier=Tier.T1,
        spins_per_seed=1_000_000,
        seed_count=32,
        description="designer fast feedback",
        expected_wallclock_seconds=15,
    ),
    Tier.T2: TierConfig(
        tier=Tier.T2,
        spins_per_seed=10_000_000,
        seed_count=16,
        description="CI gate per PR/commit",
        expected_wallclock_seconds=60,
    ),
    Tier.T3: TierConfig(
        tier=Tier.T3,
        spins_per_seed=1_000_000_000,
        seed_count=8,
        description="regulator GLI-19 default",
        expected_wallclock_seconds=600,
    ),
    Tier.T4: TierConfig(
        tier=Tier.T4,
        spins_per_seed=10_000_000_000,
        seed_count=4,
        description="pre-deploy stress",
        expected_wallclock_seconds=1800,
    ),
    Tier.T5: TierConfig(
        tier=Tier.T5,
        spins_per_seed=100_000_000_000,
        seed_count=2,
        description="ultimate audit (opt-in)",
        expected_wallclock_seconds=3600,
    ),
}


def tier_seeds(tier: Tier, game_id: str, variant_id: str) -> list[int]:
    """Deterministic seed grid derived from (tier, game, variant).

    Seeds are reproducible — same (tier, game, variant) → identičan list
    every time. Auditor can re-run exactly.
    """
    config = TIERS[tier]
    seeds: list[int] = []
    for i in range(config.seed_count):
        material = f"slot-math/mc-tier/{tier.value}/{game_id}/{variant_id}/seed/{i}"
        h = hashlib.sha256(material.encode("utf-8")).digest()
        # First 8 bytes → u64 seed
        seed = int.from_bytes(h[:8], byteorder="big", signed=False)
        seeds.append(seed)
    return seeds


def tier_from_string(s: str) -> Tier:
    """Parse 'T1'..'T5' or '1'..'5' into Tier enum."""
    s = s.upper().strip()
    if not s.startswith("T"):
        s = "T" + s
    return Tier(s)
