"""PHASE 35 — Volatility classifier kernel."""

from __future__ import annotations

import math
from dataclasses import dataclass, field


_BANDS = (
    (1.5, "low"),
    (4.0, "medium"),
    (10.0, "high"),
    (math.inf, "ultra"),
)


@dataclass
class VolReport:
    schema_version: str = "urn:slotmath:vol-class:v1"
    label: str = ""
    coefficient_of_variation: float = 0.0
    mean: float = 0.0
    std_dev: float = 0.0
    sample_size: int = 0


def classify_volatility(payouts: list[float]) -> VolReport:
    """Classify the volatility band from a sample of per-spin payouts.

    Returns VolReport with `label` ∈ {"low", "medium", "high", "ultra"}.
    Empty input yields label="low" sa CV=0.
    """
    n = len(payouts)
    if n == 0:
        return VolReport(label="low", sample_size=0)
    mean = sum(payouts) / n
    if mean <= 0:
        return VolReport(
            label="low", coefficient_of_variation=0.0,
            mean=0.0, std_dev=0.0, sample_size=n,
        )
    var = sum((p - mean) ** 2 for p in payouts) / n
    sd = math.sqrt(var)
    cv = sd / mean
    label = "ultra"
    for threshold, band_label in _BANDS:
        if cv <= threshold:
            label = band_label
            break
    return VolReport(
        label=label,
        coefficient_of_variation=round(cv, 6),
        mean=round(mean, 6),
        std_dev=round(sd, 6),
        sample_size=n,
    )
