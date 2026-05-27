"""PHASE 39 — RTP time-series decomposition kernel."""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class DecompositionResult:
    schema_version: str = "urn:slotmath:rtp-decompose:v1"
    trend_slope: float = 0.0
    trend_intercept: float = 0.0
    seasonal_amplitude: float = 0.0
    seasonal_phase: float = 0.0
    seasonal_period_steps: float = 0.0
    residual_std_dev: float = 0.0
    residuals: list[float] = field(default_factory=list)
    trend_series: list[float] = field(default_factory=list)
    seasonal_series: list[float] = field(default_factory=list)


def _linear_fit(xs: list[float], ys: list[float]) -> tuple[float, float]:
    """OLS linear fit: returns (slope, intercept)."""
    n = len(xs)
    if n < 2:
        return 0.0, ys[0] if ys else 0.0
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    den = sum((xs[i] - mean_x) ** 2 for i in range(n))
    if den == 0:
        return 0.0, mean_y
    slope = num / den
    intercept = mean_y - slope * mean_x
    return slope, intercept


def _sinusoid_fit(
    detrended: list[float], period_steps: float,
) -> tuple[float, float]:
    """Fit y[t] ≈ A·cos(2πt/T) + B·sin(2πt/T); return (amplitude, phase).

    Closed-form OLS for two coefficients (A, B); amplitude = √(A² + B²),
    phase = atan2(B, A).
    """
    n = len(detrended)
    if n < 2 or period_steps <= 0:
        return 0.0, 0.0
    w = 2 * math.pi / period_steps
    sum_cos2 = 0.0
    sum_sin2 = 0.0
    sum_cos_sin = 0.0
    sum_y_cos = 0.0
    sum_y_sin = 0.0
    for t, y in enumerate(detrended):
        c = math.cos(w * t)
        s = math.sin(w * t)
        sum_cos2 += c * c
        sum_sin2 += s * s
        sum_cos_sin += c * s
        sum_y_cos += y * c
        sum_y_sin += y * s
    # Solve 2×2 system: [[Σcos² Σcs] [Σcs Σsin²]] [A B]^T = [Σyc Σys]^T
    det = sum_cos2 * sum_sin2 - sum_cos_sin ** 2
    if abs(det) < 1e-12:
        return 0.0, 0.0
    A = (sum_y_cos * sum_sin2 - sum_y_sin * sum_cos_sin) / det
    B = (sum_y_sin * sum_cos2 - sum_y_cos * sum_cos_sin) / det
    amplitude = math.sqrt(A * A + B * B)
    phase = math.atan2(B, A)
    return amplitude, phase


def decompose(
    series: list[float],
    *,
    period_steps: float = 24.0,
) -> DecompositionResult:
    """Decompose `series` into trend + seasonal + residual.

    Args:
        series:        per-window RTP samples (oldest first)
        period_steps:  expected seasonal period (e.g. 24 for hourly buckets
                        with daily seasonality)
    """
    if period_steps <= 0:
        raise ValueError("period_steps must be > 0")
    if not series:
        return DecompositionResult(seasonal_period_steps=period_steps)
    n = len(series)
    xs = list(range(n))

    # Stage 1: linear trend
    slope, intercept = _linear_fit(xs, list(series))
    trend = [slope * t + intercept for t in xs]
    detrended = [series[t] - trend[t] for t in xs]

    # Stage 2: single-period sinusoid (only if n > 2 × period)
    amplitude = 0.0
    phase = 0.0
    if n >= int(2 * period_steps):
        amplitude, phase = _sinusoid_fit(detrended, period_steps)
    w = 2 * math.pi / period_steps
    seasonal = [amplitude * math.cos(w * t - phase) for t in xs]

    # Stage 3: residuals + std-dev
    residuals = [series[t] - trend[t] - seasonal[t] for t in xs]
    mean_r = sum(residuals) / n if n > 0 else 0.0
    var_r = sum((r - mean_r) ** 2 for r in residuals) / n if n > 0 else 0.0
    sd_r = math.sqrt(var_r)

    return DecompositionResult(
        trend_slope=slope,
        trend_intercept=intercept,
        seasonal_amplitude=amplitude,
        seasonal_phase=phase,
        seasonal_period_steps=period_steps,
        residual_std_dev=sd_r,
        residuals=residuals,
        trend_series=trend,
        seasonal_series=seasonal,
    )
