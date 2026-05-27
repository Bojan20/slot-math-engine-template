"""PHASE 29 — Streaming change-point detectors."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class DriftSignal:
    """Emitted by every detector after each `update()` call."""

    is_alerting: bool
    statistic: float            # current detector statistic
    threshold_upper: float      # upper control limit
    threshold_lower: float      # lower control limit
    n_observations: int


# ─── EWMA ──────────────────────────────────────────────────────────────────


class EWMA:
    """Exponentially-Weighted Moving Average with z·σ control limits.

    EWMA_t = λ·x_t + (1−λ)·EWMA_{t−1}
    σ_t² = σ²·(λ/(2−λ))·(1 − (1−λ)^{2t})
    """

    def __init__(
        self,
        *,
        target: float,
        sigma: float,
        lam: float = 0.2,
        z: float = 3.0,
    ) -> None:
        if not 0 < lam <= 1:
            raise ValueError("lam must be in (0, 1]")
        if sigma <= 0:
            raise ValueError("sigma must be > 0")
        if z <= 0:
            raise ValueError("z must be > 0")
        self.target = target
        self.sigma = sigma
        self.lam = lam
        self.z = z
        self.ewma = target
        self.n = 0

    def update(self, x: float) -> DriftSignal:
        self.n += 1
        self.ewma = self.lam * x + (1 - self.lam) * self.ewma
        var = (self.sigma ** 2) * (self.lam / (2 - self.lam)) * \
              (1 - (1 - self.lam) ** (2 * self.n))
        sd = math.sqrt(var)
        upper = self.target + self.z * sd
        lower = self.target - self.z * sd
        alerting = self.ewma > upper or self.ewma < lower
        return DriftSignal(
            is_alerting=alerting,
            statistic=self.ewma,
            threshold_upper=upper,
            threshold_lower=lower,
            n_observations=self.n,
        )

    def reset(self) -> None:
        self.ewma = self.target
        self.n = 0


# ─── CUSUM ──────────────────────────────────────────────────────────────────


class CUSUM:
    """Two-sided Cumulative Sum detector.

    S_high_t = max(0, S_high_{t−1} + (x_t − target − k))
    S_low_t  = min(0, S_low_{t−1}  + (x_t − target + k))
    Alert when |S| > h.
    """

    def __init__(
        self,
        *,
        target: float,
        k: float,
        h: float,
    ) -> None:
        if k < 0:
            raise ValueError("k must be ≥ 0")
        if h <= 0:
            raise ValueError("h must be > 0")
        self.target = target
        self.k = k
        self.h = h
        self.s_high = 0.0
        self.s_low = 0.0
        self.n = 0

    def update(self, x: float) -> DriftSignal:
        self.n += 1
        d = x - self.target
        self.s_high = max(0.0, self.s_high + d - self.k)
        self.s_low = min(0.0, self.s_low + d + self.k)
        # Composite statistic = max abs side
        stat = max(self.s_high, -self.s_low)
        alerting = stat > self.h
        return DriftSignal(
            is_alerting=alerting,
            statistic=stat,
            threshold_upper=self.h,
            threshold_lower=-self.h,
            n_observations=self.n,
        )

    def reset(self) -> None:
        self.s_high = 0.0
        self.s_low = 0.0
        self.n = 0


# ─── Page-Hinkley ──────────────────────────────────────────────────────────


class PageHinkley:
    """Page-Hinkley test for shifts in stream mean.

    m_t = Σ (x_i − mean_running − δ)
    PH_t = m_t − min_{i ≤ t} m_i
    Alert when PH_t > threshold.
    """

    def __init__(
        self,
        *,
        delta: float = 0.005,
        threshold: float = 50.0,
    ) -> None:
        if delta < 0:
            raise ValueError("delta must be ≥ 0")
        if threshold <= 0:
            raise ValueError("threshold must be > 0")
        self.delta = delta
        self.threshold = threshold
        self.mean = 0.0
        self.m = 0.0
        self.min_m = 0.0
        self.n = 0

    def update(self, x: float) -> DriftSignal:
        self.n += 1
        # Running mean (Welford-style for stability)
        self.mean += (x - self.mean) / self.n
        self.m += x - self.mean - self.delta
        if self.m < self.min_m:
            self.min_m = self.m
        ph = self.m - self.min_m
        alerting = ph > self.threshold
        return DriftSignal(
            is_alerting=alerting,
            statistic=ph,
            threshold_upper=self.threshold,
            threshold_lower=0.0,
            n_observations=self.n,
        )

    def reset(self) -> None:
        self.mean = 0.0
        self.m = 0.0
        self.min_m = 0.0
        self.n = 0
