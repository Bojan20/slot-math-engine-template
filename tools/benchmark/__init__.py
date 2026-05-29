"""W7 — Public benchmark suite for the math compiler.

Quantifies how fast our pipeline (DSL → SMT → engine MC) converges to a
target RTP/hit-freq versus a naive uniform-weight baseline.  Output is a
reproducible, regulator-runnable benchmark report under
``reports/benchmark/``.

Public entry-points:

    from tools.benchmark import run_benchmark, BenchmarkConfig

    run_benchmark(BenchmarkConfig(mode="quick"))

Layout:

    generator.py   — deterministic 50-sample synthetic spec factory
    baseline.py    — uniform-weight closed-form RTP computer
    runner.py      — per-sample driver (uniform → SMT → engine MC)
    report.py      — Markdown + JSON + inline SVG emitters
"""

from __future__ import annotations

from .runner import BenchmarkConfig, run_benchmark

__all__ = ["BenchmarkConfig", "run_benchmark"]
