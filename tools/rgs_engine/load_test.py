"""PHASE 12 — Load test harness for the RGS spin server.

Spawns N concurrent clients, each runs M spins, and records:

  - sustained throughput (spins / sec across the whole window)
  - per-spin latency p50 / p95 / p99 (microseconds, server-reported)
  - error rate
  - bytes in / out

Reports a `LoadTestReport` dataclass for programmatic use; pretty-prints
the same data when invoked through the CLI.

Why an in-process harness rather than a separate process:
  - The point of the test is to characterise the **server engine**, not
    the OS scheduler. We saturate it from the same Python interpreter
    so the headline number is reproducible across machines.
  - Asyncio loop overhead is identical for the server and the clients,
    which is the same condition the eventual prod deployment sees when
    websockets and the spin engine share a process.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from tools.rgs_engine.protocol import (
    SpinRequestFrame,
    decode_frame,
    encode_frame,
)


# ─── Report shape ──────────────────────────────────────────────────────────


@dataclass
class LoadTestReport:
    spins_attempted: int
    spins_completed: int
    spins_failed: int
    duration_s: float
    throughput_per_s: float
    latency_us_p50: int
    latency_us_p95: int
    latency_us_p99: int
    latency_us_max: int
    bytes_in: int
    bytes_out: int
    server_seed_commits_unique: int = 0
    grade: str = field(default="?")

    def to_dict(self) -> dict[str, Any]:
        return {
            "spins_attempted": self.spins_attempted,
            "spins_completed": self.spins_completed,
            "spins_failed": self.spins_failed,
            "duration_s": round(self.duration_s, 6),
            "throughput_per_s": round(self.throughput_per_s, 2),
            "latency_us": {
                "p50": self.latency_us_p50,
                "p95": self.latency_us_p95,
                "p99": self.latency_us_p99,
                "max": self.latency_us_max,
            },
            "bytes_in": self.bytes_in,
            "bytes_out": self.bytes_out,
            "server_seed_commits_unique": self.server_seed_commits_unique,
            "grade": self.grade,
        }

    def to_markdown(self) -> str:
        out = [
            "# RGS Live Engine — Load Test Report",
            "",
            "| Metric | Value |",
            "|---|---:|",
            f"| Spins attempted | {self.spins_attempted} |",
            f"| Spins completed | {self.spins_completed} |",
            f"| Spins failed | {self.spins_failed} |",
            f"| Window duration | {self.duration_s:.3f} s |",
            f"| Throughput | **{self.throughput_per_s:,.0f}** spins/sec |",
            f"| Latency p50 | {self.latency_us_p50} µs |",
            f"| Latency p95 | {self.latency_us_p95} µs |",
            f"| Latency p99 | {self.latency_us_p99} µs |",
            f"| Latency max | {self.latency_us_max} µs |",
            f"| Bytes in / out | {self.bytes_in:,} / {self.bytes_out:,} |",
            f"| Unique server-seed commits | {self.server_seed_commits_unique} |",
            f"| **Grade** | **{self.grade}** |",
            "",
        ]
        return "\n".join(out)


# ─── Grading rubric ────────────────────────────────────────────────────────


def _grade(throughput: float, p99_us: int, error_rate: float) -> str:
    """Vendor-neutral marketing grade. Thresholds tuned to current state of
    the slot-sim pure-Python engine on M2 Max (≥ 5,000 spins/sec single-host,
    ≤ 5 ms p99 latency, < 1% errors)."""
    if error_rate > 0.01:
        return "F"
    if throughput >= 10_000 and p99_us <= 2_000:
        return "A+"
    if throughput >= 5_000 and p99_us <= 5_000:
        return "A"
    if throughput >= 2_500 and p99_us <= 10_000:
        return "B"
    if throughput >= 1_000:
        return "C"
    return "D"


# ─── Client coroutine ──────────────────────────────────────────────────────


async def _client_run(
    host: str,
    port: int,
    spins_per_client: int,
    bet: float,
    client_seed: str,
    latencies_us: list[int],
    commits_seen: list[str],
    counters: dict[str, int],
) -> None:
    reader, writer = await asyncio.open_connection(host, port)
    try:
        hello_line = await reader.readline()
        counters["bytes_in"] += len(hello_line)
        hello = decode_frame(hello_line.rstrip(b"\r\n"))
        if hello.get("type") != "hello":
            counters["errors"] += spins_per_client
            return
        commits_seen.append(hello["server_seed_commit"])
        for nonce in range(spins_per_client):
            req = SpinRequestFrame(
                session_id="placeholder",  # server overrides with authoritative ID
                client_seed=client_seed,
                nonce=nonce,
                bet=bet,
            )
            data = encode_frame(req.to_json())
            counters["bytes_out"] += len(data)
            writer.write(data)
            await writer.drain()
            line = await reader.readline()
            if not line:
                counters["errors"] += 1
                break
            counters["bytes_in"] += len(line)
            try:
                resp = decode_frame(line.rstrip(b"\r\n"))
            except Exception:  # noqa: BLE001
                counters["errors"] += 1
                continue
            if resp.get("type") != "spin_result":
                counters["errors"] += 1
                continue
            counters["completed"] += 1
            latencies_us.append(int(resp.get("latency_us", 0)))
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:  # noqa: BLE001
            pass


# ─── Main entry ────────────────────────────────────────────────────────────


async def run_load_test(
    host: str,
    port: int,
    *,
    n_clients: int,
    spins_per_client: int,
    bet: float = 1.0,
    client_seed_prefix: str = "loadtest",
) -> LoadTestReport:
    """Drive `n_clients` concurrent clients, each emitting
    `spins_per_client` spins. Returns the aggregated report."""
    latencies_us: list[int] = []
    commits_seen: list[str] = []
    counters = {"completed": 0, "errors": 0, "bytes_in": 0, "bytes_out": 0}
    start = time.perf_counter()
    tasks = [
        _client_run(
            host=host,
            port=port,
            spins_per_client=spins_per_client,
            bet=bet,
            client_seed=f"{client_seed_prefix}-{i}",
            latencies_us=latencies_us,
            commits_seen=commits_seen,
            counters=counters,
        )
        for i in range(n_clients)
    ]
    await asyncio.gather(*tasks, return_exceptions=False)
    duration = time.perf_counter() - start

    attempted = n_clients * spins_per_client
    completed = counters["completed"]
    failed = max(0, attempted - completed)
    throughput = completed / duration if duration > 0 else 0.0
    error_rate = failed / attempted if attempted > 0 else 0.0

    sorted_us = sorted(latencies_us) if latencies_us else [0]

    def pct(p: float) -> int:
        if not sorted_us:
            return 0
        idx = min(len(sorted_us) - 1, int(p * len(sorted_us)))
        return int(sorted_us[idx])

    grade = _grade(throughput, pct(0.99), error_rate)
    return LoadTestReport(
        spins_attempted=attempted,
        spins_completed=completed,
        spins_failed=failed,
        duration_s=duration,
        throughput_per_s=throughput,
        latency_us_p50=pct(0.50),
        latency_us_p95=pct(0.95),
        latency_us_p99=pct(0.99),
        latency_us_max=max(sorted_us),
        bytes_in=counters["bytes_in"],
        bytes_out=counters["bytes_out"],
        server_seed_commits_unique=len(set(commits_seen)),
        grade=grade,
    )
