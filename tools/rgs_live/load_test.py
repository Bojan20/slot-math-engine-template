"""PHASE 12 — in-process load test harness.

Drives N spins through a single SpinServer instance (NO TCP, just
in-process line dispatch) to measure pure engine throughput.

For TCP-side load testing the operator can run multiple `asyncio.open_connection`
clients against the bound port; this harness is the deterministic in-
process equivalent used for CI / benchmarking.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, asdict, field
from typing import Any

from tools.rgs_live.engine import default_synthetic_ir
from tools.rgs_live.server import SpinServer


@dataclass
class LoadTestResult:
    total_spins: int
    elapsed_seconds: float
    throughput_spins_per_sec: float
    avg_latency_us: float
    p50_latency_us: int
    p95_latency_us: int
    p99_latency_us: int
    max_latency_us: int
    errors: int
    server_seed_commit: str
    schema_version: str = "urn:slotmath:rgs-live-loadtest:v1"
    distribution_histogram: dict[str, int] = field(default_factory=dict)


def _percentile(sorted_xs: list[int], pct: float) -> int:
    if not sorted_xs:
        return 0
    idx = max(0, int(round(pct * len(sorted_xs))) - 1)
    return sorted_xs[idx]


def _bucket(us: int) -> str:
    if us < 100:
        return "<100us"
    if us < 250:
        return "100-250us"
    if us < 500:
        return "250-500us"
    if us < 1000:
        return "500-1000us"
    if us < 5000:
        return "1-5ms"
    if us < 10000:
        return "5-10ms"
    if us < 50000:
        return "10-50ms"
    return ">=50ms"


def run_load_test(
    *,
    spins: int = 10_000,
    server_seed_hex: str = "ab" * 32,
    session_count: int = 1,
    bet_amount: float = 1.0,
    ir: dict | None = None,
) -> LoadTestResult:
    """Drive `spins` spin requests in-process; return latency stats."""
    if spins < 1:
        raise ValueError("spins must be ≥ 1")
    if session_count < 1:
        raise ValueError("session_count must be ≥ 1")

    server = SpinServer(server_seed_hex=server_seed_hex, ir=ir)

    t0 = time.perf_counter()
    for i in range(spins):
        session_id = f"sess-{i % session_count}"
        req = {
            "type": "spin",
            "request_id": f"r-{i}",
            "session_id": session_id,
            "client_seed": "loadtest",
            "nonce": i,
            "bet_amount": bet_amount,
        }
        line = json.dumps(req)
        _resp_line = server.handle_spin(line)
        # We intentionally do not parse the response back; the line
        # serialisation cost is what we want to measure.
    elapsed = time.perf_counter() - t0

    sorted_us = sorted(server.stats.latencies_us)
    p50 = _percentile(sorted_us, 0.50)
    p95 = _percentile(sorted_us, 0.95)
    p99 = _percentile(sorted_us, 0.99)

    histogram: dict[str, int] = {}
    for us in sorted_us:
        b = _bucket(us)
        histogram[b] = histogram.get(b, 0) + 1

    return LoadTestResult(
        total_spins=server.stats.spins_served,
        elapsed_seconds=round(elapsed, 4),
        throughput_spins_per_sec=round(server.stats.spins_served / elapsed, 2) if elapsed > 0 else 0.0,
        avg_latency_us=round(server.avg_latency_us, 2),
        p50_latency_us=p50,
        p95_latency_us=p95,
        p99_latency_us=p99,
        max_latency_us=server.stats.latency_us_max,
        errors=server.stats.errors,
        server_seed_commit=server.server_seed_commit,
        distribution_histogram=histogram,
    )


def load_test_as_dict(result: LoadTestResult) -> dict[str, Any]:
    return asdict(result)
