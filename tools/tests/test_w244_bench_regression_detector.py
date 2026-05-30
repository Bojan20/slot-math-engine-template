"""W244 wave 68 — perf regression detector acceptance tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.bench_regression_detector import (
    BenchRecord,
    Regression,
    detect_regressions,
    load_current,
)


# ─── BenchRecord ────────────────────────────────────────────────────────


def test_bench_record_key_is_group_slash_bench():
    r = BenchRecord(group="dp", bench="persistent_n10", mean_ns=100.0, ops_per_sec=1.0)
    assert r.key == "dp/persistent_n10"


# ─── detect_regressions: happy path ─────────────────────────────────────


def _mk(group: str, bench: str, mean_ns: float) -> BenchRecord:
    return BenchRecord(group=group, bench=bench, mean_ns=mean_ns, ops_per_sec=0.0)


def test_no_regression_when_current_faster_or_equal():
    base = [_mk("dp", "a", 100.0), _mk("dp", "b", 200.0)]
    cur = [_mk("dp", "a", 90.0), _mk("dp", "b", 200.0)]
    out = detect_regressions(cur, base, threshold=0.10)
    assert out == []


def test_regression_flagged_when_slower_above_threshold():
    base = [_mk("dp", "a", 100.0)]
    cur = [_mk("dp", "a", 115.0)]  # 15 % slower
    out = detect_regressions(cur, base, threshold=0.10)
    assert len(out) == 1
    assert out[0].bench_key == "dp/a"
    assert abs(out[0].pct_slower - 0.15) < 1e-9


def test_no_regression_exactly_at_threshold():
    # `> threshold` means equality is OK (no regression alarm).
    base = [_mk("dp", "a", 100.0)]
    cur = [_mk("dp", "a", 110.0)]  # exactly 10 % slower
    out = detect_regressions(cur, base, threshold=0.10)
    assert out == []


def test_missing_bench_in_baseline_is_skipped():
    # New bench in current run — no baseline to compare against → no alert.
    base: list[BenchRecord] = []
    cur = [_mk("dp", "new_bench", 100.0)]
    out = detect_regressions(cur, base, threshold=0.10)
    assert out == []


def test_zero_baseline_mean_is_skipped_safely():
    # Avoid divide-by-zero — baseline 0 ns is ignored.
    base = [_mk("dp", "a", 0.0)]
    cur = [_mk("dp", "a", 100.0)]
    out = detect_regressions(cur, base, threshold=0.10)
    assert out == []


def test_negative_threshold_raises():
    with pytest.raises(ValueError):
        detect_regressions([], [], threshold=-0.01)


def test_zero_threshold_flags_any_slowdown():
    base = [_mk("dp", "a", 100.0)]
    cur = [_mk("dp", "a", 100.5)]  # 0.5 % slower
    out = detect_regressions(cur, base, threshold=0.0)
    assert len(out) == 1


# ─── load_current happy path ────────────────────────────────────────────


def test_load_current_returns_records_from_live_dossier(tmp_path: Path):
    """Use a synthetic dossier; sanity-check round-trip."""
    payload = {
        "schema": "w244-benchmark-dossier/v1",
        "merkle_root_sha256": "deadbeef",
        "records": [
            {"group": "dp", "bench": "a", "mean_ns": 100.0, "ops_per_sec": 1e7},
            {"group": "solvers", "bench": "b", "mean_ns": 50.0, "ops_per_sec": 2e7},
        ],
    }
    path = tmp_path / "dossier.json"
    path.write_text(json.dumps(payload))
    out = load_current(path)
    assert len(out) == 2
    assert out[0].key == "dp/a"
    assert out[1].key == "solvers/b"


def test_load_current_missing_file_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        load_current(tmp_path / "nope.json")
