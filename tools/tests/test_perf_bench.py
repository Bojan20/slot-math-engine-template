"""Tests for the W7-B performance benchmark suite."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.perf_bench.bench import (
    BenchRow,
    bench_kernel,
    run_perf_suite,
    write_perf_report,
)


def test_bench_kernel_returns_well_ordered_quantiles() -> None:
    row = bench_kernel("noop", lambda: None, n_runs=8)
    assert row.n_runs == 8
    assert row.min_ns <= row.median_ns <= row.p95_ns <= row.p99_ns <= row.max_ns
    assert row.mean_throughput_ops_per_s > 0


def test_bench_kernel_rejects_tiny_n_runs() -> None:
    with pytest.raises(ValueError):
        bench_kernel("x", lambda: None, n_runs=1)


def test_bench_kernel_throughput_finite_for_fast_fn() -> None:
    row = bench_kernel("noop", lambda: None, n_runs=4)
    import math
    assert math.isfinite(row.mean_throughput_ops_per_s)
    assert row.mean_throughput_ops_per_s > 1_000_000  # sub-ms


def test_run_perf_suite_covers_every_kernel() -> None:
    report = run_perf_suite(n_runs=2)
    names = {r.name for r in report.rows}
    expected = {
        "W7.1 Math Genome", "W7.3 RL Cohort", "W7.4 Asset Manifest",
        "W7.5 Session Mesh", "W7.6 Derivative Manifest", "W7.7 JS Bundle",
        "W7.9 Vendor Graph Ingest", "W7.10 Self-Play Probe",
        "W7.11 Unified Pipeline",
    }
    assert names == expected
    assert report.n_runs == 2


def test_run_perf_suite_each_row_has_finite_quantiles() -> None:
    report = run_perf_suite(n_runs=2)
    for r in report.rows:
        assert r.min_ns >= 0
        assert r.median_ns >= r.min_ns
        assert r.max_ns >= r.median_ns


def test_write_perf_report_round_trip(tmp_path: Path) -> None:
    report = run_perf_suite(n_runs=2)
    out = tmp_path / "perf.json"
    written = write_perf_report(report, out)
    assert written == out
    doc = json.loads(out.read_text())
    assert doc["n_runs"] == 2
    assert len(doc["rows"]) == len(report.rows)


def test_bench_row_to_dict_round_trip() -> None:
    row = BenchRow(
        name="x", n_runs=4,
        min_ns=10, median_ns=20, p95_ns=30, p99_ns=40, max_ns=50,
        mean_throughput_ops_per_s=1234.5,
    )
    d = row.to_dict()
    assert d["name"] == "x"
    assert d["min_ns"] == 10
