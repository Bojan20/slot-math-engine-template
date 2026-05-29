"""PHASE 11 — slot-math-bench tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.slot_bench import (
    run_benchmark,
    emit_benchmark_json,
    emit_benchmark_md,
)
from tools.slot_bench.runner import (
    _REQUIRED_CERT_SECTIONS,
    _REQUIRED_TOURNAMENT_RULES,
    _grade_for,
    _compute_overall_score,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── unit ─────────────────────────────────────────────────────────────────


def test_grade_thresholds():
    assert _grade_for(0.99) == "A+"
    assert _grade_for(0.92) == "A"
    assert _grade_for(0.85) == "B"
    assert _grade_for(0.75) == "C"
    assert _grade_for(0.5) == "D"


def test_overall_score_weights():
    """Verify weighted formula: 0.4 rtp + 0.25 cert + 0.25 tourn + 0.1 speedup."""
    s = _compute_overall_score(
        rtp_pass_rate=1.0,
        speedup=1_000_000,
        cert_pct=100.0,
        tourn_pct=100.0,
    )
    # 0.4*1 + 0.25*1 + 0.25*1 + 0.1*(log10(1e6)/6) = 0.4 + 0.25 + 0.25 + 0.1 = 1.0
    assert s == pytest.approx(1.0, abs=1e-6)


def test_overall_score_zero_rtp_penalises():
    s_perfect = _compute_overall_score(
        rtp_pass_rate=1.0, speedup=1e6, cert_pct=100, tourn_pct=100,
    )
    s_zero = _compute_overall_score(
        rtp_pass_rate=0.0, speedup=1e6, cert_pct=100, tourn_pct=100,
    )
    assert s_zero < s_perfect
    assert s_zero == pytest.approx(s_perfect - 0.4, abs=1e-6)


def test_required_section_counts():
    """Required cert sections + tournament rules counts are pinned."""
    assert len(_REQUIRED_CERT_SECTIONS) == 8
    assert len(_REQUIRED_TOURNAMENT_RULES) == 7


# ─── benchmark runner: empty directory ────────────────────────────────────


def test_run_benchmark_empty_dir(tmp_path: Path):
    """No fixtures → all RTP metrics zeroed; cert + tourn still 100 %."""
    res = run_benchmark(tmp_path)
    assert res.rtp_recovery_n_fixtures == 0
    assert res.rtp_recovery_mean_abs_delta == 0.0
    assert res.cert_completeness_pct == 100.0
    assert res.tournament_completeness_pct == 100.0
    assert res.overall_grade in ("A+", "A", "B")


# ─── benchmark runner: synthetic IR fixtures ──────────────────────────────


def _make_ir_fixture(
    target_rtp: float,
    base_symbol: str = "S",
    pay: float = 10.0,
) -> dict:
    """Build a tiny but valid IR fixture for the Bernoulli RTP estimator."""
    return {
        "meta": {"target_rtp": target_rtp, "name": "Test"},
        "topology": {"reels": 5, "rows": 3, "paylines": 1, "shape": "lines"},
        "paytable": [
            {"combo": [base_symbol] * 5, "pays": pay, "scope": "line"},
        ],
        "reels": {
            "base": [
                {
                    "set": 1,
                    "reels": [
                        [
                            {"symbol": base_symbol, "weight": 1},
                            {"symbol": "X", "weight": 9},
                        ]
                        for _ in range(5)
                    ],
                }
            ],
        },
    }


def test_run_benchmark_with_single_fixture(tmp_path: Path):
    """One synthetic IR — estimator returns deterministic RTP."""
    ir = _make_ir_fixture(target_rtp=0.96, pay=10.0)
    (tmp_path / "test.ir.json").write_text(json.dumps(ir))
    res = run_benchmark(tmp_path)
    assert res.rtp_recovery_n_fixtures == 1
    # closed-form = (1/10)^5 × 10 = 1e-5 × 10 = 1e-4
    # delta = |1e-4 - 0.96| ≈ 0.96
    assert res.rtp_recovery_mean_abs_delta > 0.9
    assert res.rtp_recovery_pass_rate == 0.0  # Δ way over 0.5 %


def test_run_benchmark_with_matching_fixture(tmp_path: Path):
    """Single IR where estimate matches target → pass rate 100 %."""
    # Craft IR where closed-form RTP ≈ 0.0 and target = 0.0 → delta 0.
    ir = _make_ir_fixture(target_rtp=0.0, pay=0.0)
    (tmp_path / "match.ir.json").write_text(json.dumps(ir))
    res = run_benchmark(tmp_path)
    assert res.rtp_recovery_n_fixtures == 1
    assert res.rtp_recovery_pass_rate == 1.0


def test_run_benchmark_ignores_malformed(tmp_path: Path):
    """Non-JSON / non-IR files are silently skipped."""
    (tmp_path / "garbage.ir.json").write_text("{not valid json}")
    (tmp_path / "missing_target.ir.json").write_text(json.dumps({"meta": {}}))
    res = run_benchmark(tmp_path)
    assert res.rtp_recovery_n_fixtures == 0  # both skipped


def test_run_benchmark_time_to_ir_speedup(tmp_path: Path):
    res = run_benchmark(tmp_path)
    # Speedup vs industry 12 months → arbitrarily large.
    assert res.time_to_ir_speedup_x > 1_000_000


def test_run_benchmark_emit_timestamp_iso(tmp_path: Path):
    res = run_benchmark(tmp_path)
    # ISO 8601 with timezone
    assert "T" in res.emit_timestamp_iso
    assert res.emit_timestamp_iso.endswith("+00:00") or "Z" in res.emit_timestamp_iso


# ─── emitters ─────────────────────────────────────────────────────────────


def test_emit_benchmark_json_writes_parseable(tmp_path: Path):
    res = run_benchmark(tmp_path)
    out_path = tmp_path / "BENCHMARK.json"
    emit_benchmark_json(res, out_path)
    assert out_path.exists()
    parsed = json.loads(out_path.read_text())
    assert parsed["overall_grade"] in ("A+", "A", "B", "C", "D")
    assert parsed["schema_version"] == "urn:slotmath:bench:v1"


def test_emit_benchmark_md_writes_landing_artifact(tmp_path: Path):
    res = run_benchmark(tmp_path)
    out_path = tmp_path / "BENCHMARK.md"
    emit_benchmark_md(res, out_path)
    md = out_path.read_text()
    assert "# slot-math-engine — Public Benchmark" in md
    assert "## Overall grade:" in md
    assert "RTP Recovery" in md
    assert "Time-to-IR" in md
    assert "Cert Pipeline Completeness" in md
    assert "Tournament Audit Completeness" in md
    # All UKGC rules should appear
    for rule in _REQUIRED_TOURNAMENT_RULES:
        assert rule in md
    # All cert sections too
    for sec in _REQUIRED_CERT_SECTIONS:
        assert sec in md


def test_emit_md_truncates_fixtures_over_20(tmp_path: Path):
    # 25 synthetic IRs
    for i in range(25):
        (tmp_path / f"fixture-{i:02d}.ir.json").write_text(
            json.dumps(_make_ir_fixture(0.5 + i * 0.01))
        )
    res = run_benchmark(tmp_path)
    md_path = tmp_path / "out.md"
    emit_benchmark_md(res, md_path)
    md = md_path.read_text()
    # Some 25 fixtures should appear in the listing; only 20 visible + tail note
    listing_lines = [ln for ln in md.split("\n") if "fixture-" in ln]
    assert len(listing_lines) <= 20
    assert "more" in md


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.slot_bench", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_smoke(tmp_path: Path):
    out_dir = tmp_path / "out"
    rc = _run_cli([
        "--par-dir", str(tmp_path),
        "--out", str(out_dir),
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    assert (out_dir / "BENCHMARK.json").exists()
    assert (out_dir / "BENCHMARK.md").exists()


def test_cli_rejects_missing_par_dir(tmp_path: Path):
    rc = _run_cli([
        "--par-dir", str(tmp_path / "does-not-exist"),
        "--out", str(tmp_path / "out"),
    ])
    assert rc.returncode == 2


def test_cli_emits_grade_line(tmp_path: Path):
    rc = _run_cli([
        "--par-dir", str(tmp_path),
        "--out", str(tmp_path / "out"),
    ])
    assert rc.returncode == 0
    assert "grade=" in rc.stdout


# ─── E2E: full repo scan (smoke against real games/) ──────────────────────


def test_e2e_against_real_games_dir(tmp_path: Path):
    """Run benchmark on real games/ directory; we just assert it
    doesn't crash and produces valid output, not specific numbers
    (which would couple the test to game data)."""
    games_dir = REPO_ROOT / "games"
    if not games_dir.exists():
        pytest.skip("games/ directory absent")
    out_dir = tmp_path / "e2e-bench"
    rc = _run_cli([
        "--par-dir", str(games_dir),
        "--out", str(out_dir),
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    parsed = json.loads((out_dir / "BENCHMARK.json").read_text())
    assert parsed["overall_grade"] in ("A+", "A", "B", "C", "D")
