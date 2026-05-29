"""W7 — CLI entry-point.

Usage::

    python3 -m tools.benchmark              # full 50-sample run
    python3 -m tools.benchmark --quick      # 10 samples for CI
    python3 -m tools.benchmark --archetype hold_and_win
    python3 -m tools.benchmark --quick --out-dir /tmp/foo

The CLI is intentionally minimal — the heavy lifting lives in
``runner.run_benchmark``.  All caller-facing knobs land in
``BenchmarkConfig`` (one place to add new flags without touching the
runner internals).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .generator import ARCHETYPES
from .runner import BenchmarkConfig, DEFAULT_OUT_DIR, run_benchmark


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python3 -m tools.benchmark",
        description=(
            "W7 — math-compiler benchmark: quantifies DSL→SMT→MC "
            "convergence vs naive uniform baseline across 5 archetypes."
        ),
    )
    p.add_argument(
        "--quick",
        action="store_true",
        help="run 10 samples (2 per archetype) — for CI; finishes <30 s",
    )
    p.add_argument(
        "--archetype",
        choices=sorted(ARCHETYPES),
        default=None,
        help="restrict the run to one archetype (10 samples)",
    )
    p.add_argument(
        "--mc-spins",
        type=int,
        default=100_000,
        help="MC spins per sample (default 100000)",
    )
    p.add_argument(
        "--mc-seed",
        type=int,
        default=4815162342,
        help="MC seed anchor (default 4815162342)",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="output directory (default reports/benchmark/)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    cfg = BenchmarkConfig(
        mode="quick" if args.quick else "full",
        archetype=args.archetype,
        mc_spins=int(args.mc_spins),
        mc_seed=int(args.mc_seed),
        out_dir=Path(args.out_dir),
    )
    aggregate = run_benchmark(cfg)
    overall = aggregate.get("overall") or {}
    print(
        f"W7 benchmark done: ok={overall.get('samples_ok', 0)} "
        f"errored={overall.get('samples_errored', 0)} "
        f"median_speedup={overall.get('median_speedup', 0):.2f}x "
        f"median_mc_delta={overall.get('median_mc_delta', 0):.4f}"
    )
    print(f"  artefacts → {cfg.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
