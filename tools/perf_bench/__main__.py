"""CLI for the W7-B performance benchmark suite.

Usage::

    python -m tools.perf_bench --n-runs 5 --out reports/acceptance/PERF_BENCH.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .bench import run_perf_suite, write_perf_report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="perf_bench",
        description="W7-B performance benchmark suite (p50/p95/p99 per kernel)",
    )
    parser.add_argument("--n-runs", type=int, default=5)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    report = run_perf_suite(n_runs=args.n_runs)
    out = write_perf_report(report, args.out)

    print("| Kernel | min ms | p50 ms | p95 ms | p99 ms | ops/sec |")
    print("|---|---:|---:|---:|---:|---:|")
    for r in report.rows:
        print(
            f"| {r.name} "
            f"| {r.min_ns / 1e6:.3f} "
            f"| {r.median_ns / 1e6:.3f} "
            f"| {r.p95_ns / 1e6:.3f} "
            f"| {r.p99_ns / 1e6:.3f} "
            f"| {r.mean_throughput_ops_per_s:.2f} |"
        )
    print(f"\n→ {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
