"""SLOT-MATH bench-history diff — regression detector unit + CLI gate.

Covers:
  - identical seeds → no regression (drift == 0, speed ~1.0)
  - composer regression > 10 bps → has_regression == True
  - pass flip (✅ → 🔴) → has_regression == True
  - speed regression (< 0.80×) → has_regression == True
  - new game / removed game enumeration
  - config diff capture
  - CLI subcommand exit codes (with/without --fail-on-regression)
"""
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from tools.par_kernels.bench_history import (
    diff_bench,
    format_diff_markdown,
    load_bench,
)

REPO = Path(__file__).resolve().parents[2]


def _make_payload(
    *, generated_at: str = "2026-05-31T16:00:00Z",
    games: list[dict] | None = None,
    overall_ok: bool = True,
    config: dict | None = None,
) -> dict:
    games = games or []
    n_pass = sum(1 for g in games if g.get("overall_ok"))
    n_fail = len(games) - n_pass
    return {
        "schema_version": "1.0.0",
        "generated_at": generated_at,
        "wallclock_secs": 4.0,
        "config": config or {"mc_spins": 100_000, "seed": 42,
                             "tolerance_bps": 50.0, "filter": None},
        "summary": {
            "games_total": len(games),
            "games_passed": n_pass,
            "games_failed": n_fail,
            "overall_ok": overall_ok and n_fail == 0,
        },
        "games": games,
    }


def _make_game(
    name: str = "wrath", variant: str = "v1.0.0", shape: str = "lines",
    composer_delta_bps: float = 0.0, mc_rtp: float = 0.96,
    rounds_per_sec: float = 100_000_000.0, overall_ok: bool = True,
) -> dict:
    return {
        "game": name, "variant": variant, "shape": shape,
        "target_rtp": 0.96, "composed_rtp": 0.96,
        "composer_delta_bps": composer_delta_bps,
        "composer_ok": True, "composer_secs": 0.01,
        "mc": {
            "kind": shape, "secs": 0.05, "rtp": mc_rtp,
            "delta_bps": (mc_rtp - 0.96) * 10000.0, "pass": True,
            "rounds_per_sec": rounds_per_sec, "threads": 1,
        },
        "overall_ok": overall_ok, "error": None,
    }


def test_diff_identical_payloads_has_no_regression():
    base = _make_payload(games=[_make_game()])
    curr = copy.deepcopy(base)
    diff = diff_bench(curr, base)
    assert not diff.has_regression
    assert not diff.overall_pass_flipped
    assert len(diff.games) == 1
    g = diff.games[0]
    assert g.composer_drift_bps == 0.0
    assert g.mc_drift_bps == 0.0
    assert g.speed_ratio == 1.0
    assert not g.pass_flipped


def test_diff_composer_drift_above_10bps_flags_regression():
    base = _make_payload(games=[_make_game(composer_delta_bps=0.0)])
    curr = _make_payload(games=[_make_game(composer_delta_bps=15.0)])
    diff = diff_bench(curr, base)
    assert diff.has_regression
    assert diff.games[0].composer_drift_bps == 15.0


def test_diff_composer_drift_below_10bps_no_regression():
    """Sub-threshold drift (≤ 10 bps) is noted but not flagged."""
    base = _make_payload(games=[_make_game(composer_delta_bps=0.0)])
    curr = _make_payload(games=[_make_game(composer_delta_bps=8.0)])
    diff = diff_bench(curr, base)
    assert not diff.has_regression
    assert diff.games[0].composer_drift_bps == 8.0


def test_diff_pass_flip_to_fail_flags_regression():
    base = _make_payload(games=[_make_game(overall_ok=True)])
    curr = _make_payload(games=[_make_game(overall_ok=False)],
                         overall_ok=False)
    diff = diff_bench(curr, base)
    assert diff.has_regression
    assert diff.games[0].pass_flipped
    assert diff.overall_pass_flipped
    md = format_diff_markdown(diff)
    assert "Overall portfolio gate flipped **✅ → 🔴**" in md
    assert "REGRESSION" in md


def test_diff_pass_flip_recovery_not_regression():
    """🔴 → ✅ flip is recovery, must NOT register as regression."""
    base = _make_payload(games=[_make_game(overall_ok=False)],
                         overall_ok=False)
    curr = _make_payload(games=[_make_game(overall_ok=True)])
    diff = diff_bench(curr, base)
    assert diff.overall_pass_flipped
    assert not diff.has_regression
    md = format_diff_markdown(diff)
    assert "Overall portfolio gate flipped **🔴 → ✅**" in md


def test_diff_speed_regression_flags_when_below_80pct():
    """Speed dropping to < 80% of baseline = perf regression."""
    base = _make_payload(games=[_make_game(rounds_per_sec=1_000_000_000.0)])
    curr = _make_payload(games=[_make_game(rounds_per_sec=700_000_000.0)])  # 0.70×
    diff = diff_bench(curr, base)
    assert diff.has_regression
    assert diff.games[0].speed_ratio == pytest.approx(0.70, rel=1e-6)


def test_diff_speed_within_threshold_no_regression():
    """Speed at 90% of baseline = noise, not regression."""
    base = _make_payload(games=[_make_game(rounds_per_sec=1_000_000_000.0)])
    curr = _make_payload(games=[_make_game(rounds_per_sec=900_000_000.0)])  # 0.90×
    diff = diff_bench(curr, base)
    assert not diff.has_regression
    assert diff.games[0].speed_ratio == pytest.approx(0.90, rel=1e-6)


def test_diff_new_games_enumerated():
    base = _make_payload(games=[_make_game(name="wrath")])
    curr = _make_payload(games=[_make_game(name="wrath"),
                                _make_game(name="brand-new", shape="cluster_pays")])
    diff = diff_bench(curr, base)
    assert diff.new_games == ["brand-new/v1.0.0"]
    assert diff.removed_games == []
    md = format_diff_markdown(diff)
    assert "New games" in md
    assert "brand-new" in md


def test_diff_removed_games_enumerated():
    base = _make_payload(games=[_make_game(name="wrath"),
                                _make_game(name="legacy")])
    curr = _make_payload(games=[_make_game(name="wrath")])
    diff = diff_bench(curr, base)
    assert diff.removed_games == ["legacy/v1.0.0"]
    assert diff.new_games == []
    md = format_diff_markdown(diff)
    assert "Removed games" in md
    assert "legacy" in md


def test_diff_config_changes_captured():
    base = _make_payload(config={"mc_spins": 100_000, "seed": 42,
                                 "tolerance_bps": 50.0, "filter": None})
    curr = _make_payload(config={"mc_spins": 1_000_000, "seed": 42,
                                 "tolerance_bps": 25.0, "filter": None})
    diff = diff_bench(curr, base)
    assert "mc_spins" in diff.config_diff
    assert "tolerance_bps" in diff.config_diff
    assert "seed" not in diff.config_diff
    md = format_diff_markdown(diff)
    assert "Config changes" in md
    assert "mc_spins" in md


def test_load_bench_rejects_unknown_schema():
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "bad.json"
        p.write_text(json.dumps({"schema_version": "9.0.0"}))
        with pytest.raises(ValueError, match="unsupported bench schema_version"):
            load_bench(p)


def test_load_bench_accepts_1x_schema():
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "ok.json"
        p.write_text(json.dumps(_make_payload(games=[_make_game()])))
        data = load_bench(p)
        assert data["schema_version"].startswith("1.")


# ───────── CLI subcommand integration ─────────

def _write_payload(td: Path, name: str, payload: dict) -> Path:
    p = td / name
    p.write_text(json.dumps(payload) + "\n")
    return p


def test_cli_bench_diff_no_regression_exits_zero():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        base = _write_payload(td, "base.json",
                              _make_payload(games=[_make_game()]))
        curr = _write_payload(td, "curr.json",
                              _make_payload(games=[_make_game()]))
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli",
             "bench-diff", str(curr), str(base), "--fail-on-regression"],
            cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
        )
        assert proc.returncode == 0, proc.stderr
        assert "no regression" in proc.stdout


def test_cli_bench_diff_regression_exits_one_with_flag():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        base = _write_payload(td, "base.json",
                              _make_payload(games=[_make_game(composer_delta_bps=0.0)]))
        curr = _write_payload(td, "curr.json",
                              _make_payload(games=[_make_game(composer_delta_bps=50.0)]))
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli",
             "bench-diff", str(curr), str(base), "--fail-on-regression"],
            cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
        )
        assert proc.returncode == 1
        assert "REGRESSION" in proc.stdout


def test_cli_bench_diff_regression_exits_zero_without_flag():
    """Without --fail-on-regression, diff is informational (exit 0)."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        base = _write_payload(td, "base.json",
                              _make_payload(games=[_make_game(composer_delta_bps=0.0)]))
        curr = _write_payload(td, "curr.json",
                              _make_payload(games=[_make_game(composer_delta_bps=50.0)]))
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli",
             "bench-diff", str(curr), str(base)],
            cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
        )
        assert proc.returncode == 0
        assert "REGRESSION" in proc.stdout  # still reported, just not failed


def test_cli_bench_diff_writes_out_file():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        base = _write_payload(td, "base.json",
                              _make_payload(games=[_make_game()]))
        curr = _write_payload(td, "curr.json",
                              _make_payload(games=[_make_game()]))
        out = td / "diff.md"
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli",
             "bench-diff", str(curr), str(base), "--out", str(out)],
            cwd=REPO, capture_output=True, text=True, check=False, timeout=30,
        )
        assert proc.returncode == 0
        assert out.is_file()
        body = out.read_text()
        assert "Portfolio Sweep — diff vs baseline" in body
