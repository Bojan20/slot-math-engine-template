"""PHASE 25 — Hawkes self-exciting process simulator.

Univariate Hawkes process intensity:
    λ(t) = μ + Σ_{t_i < t} α · exp(-β · (t − t_i))

Generates event timestamps via the standard thinning algorithm
(Ogata 1981). Pure stdlib (math + random).
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field


@dataclass
class HawkesParams:
    """Hawkes process parameters."""
    mu: float = 1.0        # baseline rate (events/sec)
    alpha: float = 0.5     # self-excitation jump
    beta: float = 1.0      # decay rate
    t_max: float = 60.0    # horizon (sec)
    seed: int = 0xfee1_dead

    def __post_init__(self) -> None:
        if self.mu < 0 or self.alpha < 0 or self.beta <= 0:
            raise ValueError("require mu ≥ 0, alpha ≥ 0, beta > 0")
        if self.alpha >= self.beta:
            raise ValueError(
                "Hawkes stability requires alpha < beta "
                "(branching ratio alpha/beta < 1)"
            )
        if self.t_max <= 0:
            raise ValueError("t_max must be > 0")


@dataclass
class StressReport:
    schema_version: str = "urn:slotmath:hawkes-stress:v1"
    total_events: int = 0
    duration_seconds: float = 0.0
    mean_rate: float = 0.0
    p50_inter_arrival: float = 0.0
    p95_inter_arrival: float = 0.0
    max_burst_size: int = 0
    burst_window_seconds: float = 1.0
    branching_ratio: float = 0.0
    final_intensity: float = 0.0
    timestamps: list[float] = field(default_factory=list)


def simulate_hawkes(params: HawkesParams) -> list[float]:
    """Generate Hawkes event timestamps via Ogata thinning.

    Returns sorted list of event timestamps in [0, t_max].
    """
    rng = random.Random(params.seed)
    events: list[float] = []
    t = 0.0

    while t < params.t_max:
        # Upper-bound intensity at current `t`: max of baseline + sum of
        # all past excitations (geometric decay) → use λ_bar = current λ.
        lam_bar = params.mu + sum(
            params.alpha * math.exp(-params.beta * (t - ti))
            for ti in events
        )
        if lam_bar <= 0:
            break
        # Sample next candidate event time
        u1 = rng.random()
        if u1 == 0:
            u1 = 1e-12
        t = t - math.log(u1) / lam_bar
        if t >= params.t_max:
            break
        # Acceptance probability
        lam_at_t = params.mu + sum(
            params.alpha * math.exp(-params.beta * (t - ti))
            for ti in events
        )
        if rng.random() <= lam_at_t / lam_bar:
            events.append(t)
    return events


def capacity_report(
    params: HawkesParams,
    *,
    burst_window_seconds: float = 1.0,
) -> StressReport:
    """Run a single Hawkes simulation + summarise."""
    if burst_window_seconds <= 0:
        raise ValueError("burst_window_seconds must be > 0")
    ts = simulate_hawkes(params)
    report = StressReport(
        burst_window_seconds=burst_window_seconds,
        branching_ratio=params.alpha / params.beta,
        timestamps=list(ts),
    )
    report.total_events = len(ts)
    report.duration_seconds = params.t_max
    report.mean_rate = report.total_events / params.t_max if params.t_max > 0 else 0.0

    if len(ts) >= 2:
        inter = [ts[i] - ts[i - 1] for i in range(1, len(ts))]
        inter.sort()
        report.p50_inter_arrival = inter[len(inter) // 2]
        idx95 = max(0, int(round(0.95 * len(inter))) - 1)
        report.p95_inter_arrival = inter[idx95]
    elif len(ts) == 1:
        report.p50_inter_arrival = ts[0]
        report.p95_inter_arrival = ts[0]
    else:
        report.p50_inter_arrival = 0.0
        report.p95_inter_arrival = 0.0

    # Max burst: max # events in any sliding window of width burst_window_seconds
    if ts:
        max_burst = 1
        left = 0
        for right in range(len(ts)):
            while ts[right] - ts[left] > burst_window_seconds:
                left += 1
            burst = right - left + 1
            if burst > max_burst:
                max_burst = burst
        report.max_burst_size = max_burst
    else:
        report.max_burst_size = 0

    # Intensity at end (informational)
    report.final_intensity = params.mu + sum(
        params.alpha * math.exp(-params.beta * (params.t_max - ti)) for ti in ts
    )
    return report
