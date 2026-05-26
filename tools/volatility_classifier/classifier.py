"""Volatility classifier — CV (coefficient of variation) → industry tier."""
from __future__ import annotations
import math
from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable


class VolTier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"
    UNKNOWN = "unknown"


TIER_THRESHOLDS: list[tuple[float, VolTier]] = [
    (1.5, VolTier.LOW),
    (3.0, VolTier.MEDIUM),
    (6.0, VolTier.HIGH),
    (float("inf"), VolTier.EXTREME),
]


@dataclass
class VolatilityReport:
    tier: VolTier
    cv: float
    mean_pay: float
    stddev_pay: float
    sample_size: int
    rationale: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "tier": self.tier.value,
            "cv": self.cv,
            "mean_pay": self.mean_pay,
            "stddev_pay": self.stddev_pay,
            "sample_size": self.sample_size,
            "rationale": self.rationale,
        }


def _tier_for_cv(cv: float) -> VolTier:
    for upper, tier in TIER_THRESHOLDS:
        if cv < upper:
            return tier
    return VolTier.EXTREME


def _rationale(tier: VolTier, cv: float) -> str:
    bands = {
        VolTier.LOW: "CV < 1.5 → frequent small wins (slot equivalent: cherry-master)",
        VolTier.MEDIUM: "1.5 ≤ CV < 3.0 → balanced rhythm (typical 96% RTP retail)",
        VolTier.HIGH: "3.0 ≤ CV < 6.0 → long dry runs + occasional big hits",
        VolTier.EXTREME: "CV ≥ 6.0 → multi-thousand-x megawin design (BTG-style)",
        VolTier.UNKNOWN: "insufficient data",
    }
    return f"CV={cv:.3f} → {tier.value}. {bands[tier]}"


def classify(*, mean_pay: float, stddev_pay: float,
             sample_size: int = 0) -> VolatilityReport:
    if mean_pay <= 0 or stddev_pay < 0:
        return VolatilityReport(
            tier=VolTier.UNKNOWN, cv=0.0,
            mean_pay=mean_pay, stddev_pay=stddev_pay,
            sample_size=sample_size,
            rationale="invalid mean/stddev (need mean>0 and stddev>=0)",
        )
    cv = stddev_pay / mean_pay
    tier = _tier_for_cv(cv)
    return VolatilityReport(
        tier=tier, cv=cv,
        mean_pay=mean_pay, stddev_pay=stddev_pay,
        sample_size=sample_size,
        rationale=_rationale(tier, cv),
    )


def classify_from_samples(samples: Iterable[float]) -> VolatilityReport:
    pays = [float(x) for x in samples]
    n = len(pays)
    if n == 0:
        return VolatilityReport(
            tier=VolTier.UNKNOWN, cv=0.0,
            mean_pay=0.0, stddev_pay=0.0, sample_size=0,
            rationale="empty sample",
        )
    mean = sum(pays) / n
    if n == 1:
        return classify(mean_pay=mean, stddev_pay=0.0, sample_size=n)
    var = sum((x - mean) ** 2 for x in pays) / (n - 1)
    return classify(mean_pay=mean, stddev_pay=math.sqrt(var), sample_size=n)
