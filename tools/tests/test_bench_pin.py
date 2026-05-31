"""SLOT-MATH bench-history pin + trend — multi-run ledger gate.

Validates the per-run JSON pinning logic + trend analysis. Designed so
the CI workflow can call `slot-math bench-pin` on every successful main
run and accumulate a regulator-readable history ledger.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from tools.par_kernels.bench_pin import (
    INDEX_NAME,
    compute_trend,
    format_trend_markdown,
    load_history,
    pin_bench,
)

REPO = Path(__file__).resolve().parents[2]


def _make_bench(generated_at: str, *, mc_rtp: float = 0.96,
                composer_delta: float = 0.0, overall_ok: bool = True,
                rounds_per_sec: float = 100_000_000.0) -> dict:
    return {
        "schema_version": "1.0.0",
        "generated_at": generated_at,
        "wallclock_secs": 4.0,
        "config": {"mc_spins": 100000, "seed": 42,
                   "tolerance_bps": 50.0, "filter": None},
        "summary": {
            "games_total": 1, "games_passed": 1 if overall_ok else 0,
            "games_failed": 0 if overall_ok else 1, "overall_ok": overall_ok,
        },
        "games": [{
            "game": "wrath", "variant": "v1", "shape": "lines",
            "target_rtp": 0.96, "composed_rtp": 0.96,
            "composer_delta_bps": composer_delta,
            "composer_ok": True, "composer_secs": 0.01,
            "mc": {"kind": "wrath", "secs": 0.05, "rtp": mc_rtp,
                   "delta_bps": (mc_rtp - 0.96) * 10000.0, "pass": overall_ok,
                   "rounds_per_sec": rounds_per_sec, "threads": 1},
            "overall_ok": overall_ok, "error": None,
        }],
    }


def _write_bench(td: Path, name: str, payload: dict) -> Path:
    p = td / name
    p.write_text(json.dumps(payload) + "\n")
    return p


def _pin_one(td: Path, pin_dir: Path, ts: str, **kwargs) -> None:
    """Helper: make a bench payload, write it, pin it. Used in trend tests."""
    fname = f"bench-{ts.replace(':', '').replace('-', '')}.json"
    p = _write_bench(td, fname, _make_bench(ts, **kwargs))
    pin_bench(p, pin_dir=pin_dir)


# ───────── unit-level pin behavior ─────────


def test_pin_first_time_creates_file_and_index():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        bench = _write_bench(td, "bench.json", _make_bench("2026-05-31T10:00:00Z"))
        pin_dir = td / "history"
        res = pin_bench(bench, pin_dir=pin_dir, git_sha="abc1234")
        assert res.pinned is True
        assert res.path.is_file()
        assert (pin_dir / INDEX_NAME).is_file()
        idx = load_history(pin_dir)
        assert len(idx) == 1
        assert idx[0]["git_sha"] == "abc1234"
        assert idx[0]["ts"] == "2026-05-31T10:00:00Z"
        assert idx[0]["content_sha"] == res.content_sha


def test_pin_same_payload_is_idempotent():
    """Same content_sha → skip, return existing entry."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        bench = _write_bench(td, "bench.json", _make_bench("2026-05-31T10:00:00Z"))
        pin_dir = td / "history"
        r1 = pin_bench(bench, pin_dir=pin_dir)
        r2 = pin_bench(bench, pin_dir=pin_dir)
        assert r1.pinned is True
        assert r2.pinned is False
        assert r1.path == r2.path
        idx = load_history(pin_dir)
        assert len(idx) == 1


def test_pin_different_payloads_stack():
    """Two distinct payloads → two index entries."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        a = _write_bench(td, "a.json", _make_bench("2026-05-31T10:00:00Z", mc_rtp=0.96))
        b = _write_bench(td, "b.json", _make_bench("2026-05-31T10:05:00Z", mc_rtp=0.95))
        pin_dir = td / "history"
        pin_bench(a, pin_dir=pin_dir)
        pin_bench(b, pin_dir=pin_dir)
        idx = load_history(pin_dir)
        assert len(idx) == 2
        # Index is sorted by ts ascending
        assert idx[0]["ts"] < idx[1]["ts"]


def test_pin_rejects_unsupported_schema():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        bad = td / "bad.json"
        bad.write_text(json.dumps({"schema_version": "9.0.0"}))
        with pytest.raises(ValueError, match="unsupported bench schema_version"):
            pin_bench(bad, pin_dir=td / "history")


def test_pin_filename_is_safe_and_contains_sha():
    """Filename must be filesystem-safe (no colons) and embed content_sha."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        bench = _write_bench(td, "bench.json", _make_bench("2026-05-31T10:00:00Z"))
        res = pin_bench(bench, pin_dir=td / "history")
        assert ":" not in res.path.name
        assert res.content_sha in res.path.name
        # Generic shape: <ts_safe>-<sha>.json
        assert res.path.name.endswith(".json")


# ───────── trend analysis ─────────


def test_trend_empty_history_returns_zero():
    with tempfile.TemporaryDirectory() as td:
        trend = compute_trend(pin_dir=td)
        assert trend["n_entries"] == 0
        assert trend["games"] == {}
        assert trend["overall_pass_rate"] is None


def test_trend_aggregates_per_game_series():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pin_dir = td / "history"
        for i, rtp in enumerate([0.96, 0.95, 0.97]):
            _pin_one(td, pin_dir, f"2026-05-31T10:0{i}:00Z", mc_rtp=rtp)
        trend = compute_trend(pin_dir=pin_dir)
        assert trend["n_entries"] == 3
        assert trend["overall_pass_rate"] == 1.0
        g = trend["games"]["wrath/v1"]
        assert g["rtp_series"] == [0.96, 0.95, 0.97]
        # 3 points, OLS slope on bps: y = [9600, 9500, 9700], x=[0,1,2]
        # mean y = 9600, slope = sum((xi-1)(yi-9600)) / sum((xi-1)^2) =
        # ((0-1)*(9600-9600) + (1-1)*(9500-9600) + (2-1)*(9700-9600)) / 2 = 50
        assert g["rtp_slope_bps_per_run"] == pytest.approx(50.0, abs=0.001)
        assert g["pass_streak"] == 3
        assert g["rtp_min"] == 0.95
        assert g["rtp_max"] == 0.97


def test_trend_pass_streak_breaks_on_fail():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pin_dir = td / "history"
        for i, ok in enumerate([True, False, True, True]):
            _pin_one(td, pin_dir, f"2026-05-31T10:0{i}:00Z", overall_ok=ok)
        trend = compute_trend(pin_dir=pin_dir)
        # tail streak = 2 (last two passed; pass before was fail)
        assert trend["games"]["wrath/v1"]["pass_streak"] == 2
        assert trend["overall_pass_rate"] == 0.75  # 3 of 4


def test_trend_last_n_window():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pin_dir = td / "history"
        for i in range(5):
            _pin_one(td, pin_dir, f"2026-05-31T10:0{i}:00Z",
                     mc_rtp=0.96 + i*0.001)
        trend = compute_trend(pin_dir=pin_dir, last_n=2)
        assert trend["n_entries"] == 2
        g = trend["games"]["wrath/v1"]
        # Last 2 = 0.963, 0.964
        assert g["rtp_series"] == [pytest.approx(0.963), pytest.approx(0.964)]


def test_format_trend_markdown_has_required_columns():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pin_dir = td / "history"
        _pin_one(td, pin_dir, "2026-05-31T10:00:00Z")
        md = format_trend_markdown(compute_trend(pin_dir=pin_dir))
        for col in ("Game", "Variant", "Shape", "Last RTP",
                    "RTP min..max", "RTP slope", "Pass streak"):
            assert col in md, f"missing column: {col}"


def test_format_trend_markdown_empty_history():
    md = format_trend_markdown({"n_entries": 0, "games": {},
                                "overall_pass_rate": None})
    assert "No pinned bench history yet" in md


# ───────── CLI integration ─────────


def test_cli_bench_pin_first_run_pinned():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        bench = _write_bench(td, "bench.json", _make_bench("2026-05-31T10:00:00Z"))
        pin_dir = td / "history"
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli",
             "bench-pin", str(bench), "--pin-dir", str(pin_dir)],
            cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
        )
        assert proc.returncode == 0
        assert "✓ Pinned" in proc.stdout
        assert (pin_dir / INDEX_NAME).is_file()


def test_cli_bench_pin_idempotent_second_run():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        bench = _write_bench(td, "bench.json", _make_bench("2026-05-31T10:00:00Z"))
        pin_dir = td / "history"
        cmd = [sys.executable, "-m", "tools.par_kernels.cli",
               "bench-pin", str(bench), "--pin-dir", str(pin_dir)]
        proc1 = subprocess.run(cmd, cwd=REPO, capture_output=True,
                               text=True, check=False, timeout=30)
        proc2 = subprocess.run(cmd, cwd=REPO, capture_output=True,
                               text=True, check=False, timeout=30)
        assert proc1.returncode == 0 and proc2.returncode == 0
        assert "✓ Pinned" in proc1.stdout
        assert "= Already pinned" in proc2.stdout


def test_cli_bench_trend_renders_after_two_pins():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pin_dir = td / "history"
        for i, rtp in enumerate([0.96, 0.97]):
            b = _make_bench(f"2026-05-31T10:0{i}:00Z", mc_rtp=rtp)
            p = td / f"b{i}.json"
            p.write_text(json.dumps(b))
            subprocess.run(
                [sys.executable, "-m", "tools.par_kernels.cli",
                 "bench-pin", str(p), "--pin-dir", str(pin_dir)],
                cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
            )
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli",
             "bench-trend", "--pin-dir", str(pin_dir)],
            cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
        )
        assert proc.returncode == 0
        assert "Portfolio Trend" in proc.stdout
        assert "2 pinned runs" in proc.stdout
        assert "wrath" in proc.stdout
