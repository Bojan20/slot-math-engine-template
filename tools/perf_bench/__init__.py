"""W7-B — Performance benchmarking suite for the W7.x kernel layer.

Measures per-kernel latency (p50 / p95 / p99) + per-kernel throughput
(ops/sec) for every shipping W7.x kernel and emits a
:class:`PerfReport` JSON for pre-pilot operator evidence.

Pure stdlib — uses :mod:`time.perf_counter_ns` for wall-clock
measurements and :func:`statistics.quantiles` for the distribution
percentiles.

What is measured (one row per kernel)::

    W7.1  Self-Evolving Math Genome (full evolve())
    W7.3  RL run_cohort
    W7.4  build_asset_manifest
    W7.5  build_session_mesh (per-spin commit chain + Merkle reduction)
    W7.6  build_derivative_manifest (∂RTP + ∂CV per weight)
    W7.7  build_js_bundle
    W7.9  KnowledgeGraph ingest (tools/vendor_profiles/)
    W7.10 run_self_play_sweep (PCG64-driven RTP fan)
    W7.11 run_unified_pipeline (composability commitment)

Each row is run N times (default 5) with warmup discarded; the
returned :class:`BenchRow` carries n / min_ns / median_ns / p95_ns /
p99_ns / max_ns / mean_throughput_ops_per_s.
"""

from .bench import (
    BenchRow,
    PerfReport,
    bench_kernel,
    run_perf_suite,
    write_perf_report,
)

__all__ = [
    "BenchRow",
    "PerfReport",
    "bench_kernel",
    "run_perf_suite",
    "write_perf_report",
]
