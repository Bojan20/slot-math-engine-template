"""PHASE 11 — SWE-Math-Bench.

`slot-math-bench` published benchmark harness — one number for vendor
due-diligence. Replaces ad-hoc claim with reproducible metric.

Four benchmarks:

  1. **rtp_recovery**       — mean absolute |Δ| between solver closed-form
                              RTP and PAR-published RTP, across N fixtures
  2. **time_to_ir**          — wall-clock per IR build (compare vs industry
                              baseline 12-18 weeks per title)
  3. **cert_completeness**   — fraction of UKGC/MGA/GLI/EU-GA rules emitted
                              in cert XML
  4. **tournament_completeness** — fraction of UKGC RTS-12 §a/b/c +
                              MGA PPD §11 + eCOGRA + EU GA rules emitted
                              by W204 audit pipeline

Output:
  reports/bench/BENCHMARK.json    machine-readable metrics
  reports/bench/BENCHMARK.md      regulator-friendly + marketing landing

CLI:
  python -m tools.slot_bench --par-dir games/ --out reports/bench/
"""

from __future__ import annotations

from tools.slot_bench.runner import (
    BenchmarkResult,
    run_benchmark,
    emit_benchmark_md,
    emit_benchmark_json,
)

__all__ = [
    "BenchmarkResult",
    "run_benchmark",
    "emit_benchmark_md",
    "emit_benchmark_json",
]
