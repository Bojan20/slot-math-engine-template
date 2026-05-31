"""SLOT-MATH `batch --bench <path>` JSON schema gate.

Validates the structured-metrics JSON output that lets downstream tooling
(bench-history pin, regression detector, dashboards) consume portfolio
sweep results without parsing the Markdown.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _run_batch_bench(extra: list[str] | None = None) -> tuple[int, dict]:
    with tempfile.TemporaryDirectory() as td:
        bench_path = Path(td) / "bench.json"
        out_path = Path(td) / "dash.md"
        cmd = [
            sys.executable, "-m", "tools.par_kernels.cli", "batch",
            "--mc-spins", "10000",
            "--bench", str(bench_path),
            "--out", str(out_path),
            *(extra or []),
        ]
        proc = subprocess.run(
            cmd, cwd=REPO, capture_output=True, text=True,
            timeout=120, check=False,
        )
        assert bench_path.is_file(), (
            f"bench JSON not written. STDERR:\n{proc.stderr}"
        )
        data = json.loads(bench_path.read_text())
        return proc.returncode, data


def test_bench_top_level_schema():
    """Top-level keys present + correct types."""
    ec, data = _run_batch_bench()
    assert ec == 0
    for key in ("schema_version", "generated_at", "wallclock_secs",
                "config", "summary", "games"):
        assert key in data, f"missing top-level key: {key}"
    assert data["schema_version"] == "1.0.0"
    assert isinstance(data["wallclock_secs"], int | float)
    assert isinstance(data["games"], list)
    assert isinstance(data["config"], dict)
    assert isinstance(data["summary"], dict)


def test_bench_generated_at_is_iso_utc():
    """generated_at must parse as UTC ISO 8601 (e.g., 2026-05-31T16:25:00Z)."""
    ec, data = _run_batch_bench()
    assert ec == 0
    assert re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z",
        data["generated_at"],
    ), f"bad generated_at: {data['generated_at']!r}"


def test_bench_config_round_trips_input_flags():
    """config block echoes the run inputs (mc_spins/seed/tolerance/filter)."""
    ec, data = _run_batch_bench(["--seed", "777", "--tolerance-bps", "40"])
    assert ec == 0
    assert data["config"]["mc_spins"] == 10000
    assert data["config"]["seed"] == 777
    assert data["config"]["tolerance_bps"] == 40.0
    assert data["config"]["filter"] is None


def test_bench_summary_counts_match_games():
    """summary.games_total/games_passed/games_failed must add up."""
    ec, data = _run_batch_bench()
    assert ec == 0
    s = data["summary"]
    assert s["games_total"] == len(data["games"])
    assert s["games_total"] == s["games_passed"] + s["games_failed"]
    assert s["overall_ok"] == (s["games_failed"] == 0)
    # First-principles cross-check: each game's overall_ok must agree
    n_pass = sum(1 for g in data["games"] if g["overall_ok"])
    assert s["games_passed"] == n_pass


def test_bench_per_game_schema():
    """Every game row carries the documented field set."""
    ec, data = _run_batch_bench()
    assert ec == 0
    required = {
        "game", "variant", "shape", "target_rtp", "composed_rtp",
        "composer_delta_bps", "composer_ok", "composer_secs",
        "mc", "overall_ok", "error",
    }
    mc_required = {"kind", "secs", "rtp", "delta_bps", "pass",
                   "rounds_per_sec", "threads"}
    for g in data["games"]:
        missing = required - g.keys()
        assert not missing, f"{g['game']} missing fields: {missing}"
        mc_missing = mc_required - g["mc"].keys()
        assert not mc_missing, f"{g['game']}.mc missing: {mc_missing}"


def test_bench_lists_all_six_reference_games():
    """All 6 reference games appear in `games` array."""
    ec, data = _run_batch_bench()
    assert ec == 0
    found = {g["game"] for g in data["games"]}
    expected = {
        "wrath-of-olympus", "mystic-cluster", "lightning-ways",
        "stake-rush", "sky-cascade", "oracle-of-delphi",
    }
    assert expected.issubset(found), (
        f"missing reference games in bench JSON: {expected - found}"
    )


def test_bench_mc_kind_matches_shape_dispatch():
    """Each game's mc.kind must reflect the shape-correct backend."""
    ec, data = _run_batch_bench()
    assert ec == 0
    expected = {
        "wrath-of-olympus": "wrath",
        "oracle-of-delphi": "wrath",
        "mystic-cluster": "cluster",
        "lightning-ways": "ways",
        "stake-rush": "crash",
        "sky-cascade": "skip (CF exact)",
    }
    by_game = {g["game"]: g for g in data["games"]}
    for game, expected_kind in expected.items():
        actual = by_game[game]["mc"]["kind"]
        assert actual == expected_kind, (
            f"{game}: expected mc.kind={expected_kind!r}, got {actual!r}"
        )


def test_bench_filter_narrows_games_array():
    """--filter must shrink the games array, not just the dashboard."""
    ec, data = _run_batch_bench(["--filter", "stake"])
    assert ec == 0
    assert len(data["games"]) == 1
    assert data["games"][0]["game"] == "stake-rush"
    assert data["summary"]["games_total"] == 1
    assert data["config"]["filter"] == "stake"


def test_bench_creates_parent_directory():
    """bench parent path is auto-created if missing."""
    with tempfile.TemporaryDirectory() as td:
        nested = Path(td) / "deep" / "nested" / "path" / "bench.json"
        cmd = [
            sys.executable, "-m", "tools.par_kernels.cli", "batch",
            "--mc-spins", "5000",
            "--filter", "stake",  # tiny subset for speed
            "--bench", str(nested),
        ]
        proc = subprocess.run(
            cmd, cwd=REPO, capture_output=True, text=True,
            timeout=60, check=False,
        )
        assert proc.returncode == 0
        assert nested.is_file(), "nested bench path not created"
