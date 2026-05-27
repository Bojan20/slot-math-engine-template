"""PHASE 11 — `slot-math-bench` CLI entry."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools.slot_bench.runner import (
    run_benchmark,
    emit_benchmark_json,
    emit_benchmark_md,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-math-bench",
        description="Public benchmark harness for slot-math-engine.",
    )
    parser.add_argument(
        "--par-dir",
        required=True,
        help="Directory containing `*.ir.json` fixtures to score.",
    )
    parser.add_argument(
        "--out",
        default="reports/bench/",
        help="Output directory for BENCHMARK.json + BENCHMARK.md.",
    )
    parser.add_argument(
        "--ir-glob",
        default="**/*.ir.json",
        help="Glob for IR file discovery (default: **/*.ir.json).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress non-error output.",
    )
    args = parser.parse_args(argv)

    par_dir = Path(args.par_dir)
    if not par_dir.exists():
        print(f"error: par-dir does not exist: {par_dir}", file=sys.stderr)
        return 2

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    result = run_benchmark(par_dir, ir_glob=args.ir_glob)

    json_path = out_dir / "BENCHMARK.json"
    md_path = out_dir / "BENCHMARK.md"
    emit_benchmark_json(result, json_path)
    emit_benchmark_md(result, md_path)

    if not args.quiet:
        print(f"[slot-math-bench] OK · grade={result.overall_grade} ({result.overall_score:.4f})")
        print(f"  fixtures: {result.rtp_recovery_n_fixtures}")
        print(f"  mean Δ: {result.rtp_recovery_mean_abs_delta:.6f}")
        print(f"  speedup: {result.time_to_ir_speedup_x:,.0f}×")
        print(f"  cert: {result.cert_completeness_pct:.2f} %")
        print(f"  tournament: {result.tournament_completeness_pct:.2f} %")
        print(f"  json: {json_path}")
        print(f"  md:   {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
