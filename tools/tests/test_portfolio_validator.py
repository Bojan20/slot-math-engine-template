"""Portfolio-wide IR consistency validator tests."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "parity" / "portfolio_validator.py"
REPORT = REPO / "reports" / "acceptance" / "portfolio_validator.json"


@pytest.fixture(scope="module")
def report() -> dict:
    r = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, cwd=str(REPO))
    assert r.returncode == 0, (
        f"validator exit {r.returncode}\nstdout: {r.stdout}\nstderr: {r.stderr}"
    )
    assert REPORT.exists()
    return json.loads(REPORT.read_text())


def test_validator_runs_and_writes_report(report: dict):
    assert "summary" in report
    assert "results" in report


def test_validator_finds_13_irs(report: dict):
    """5 games × dedupe → 3+2+4+3+1 = 13."""
    assert report["summary"]["total_irs"] == 13


def test_all_irs_pass_validator(report: dict):
    assert report["summary"]["failed"] == 0
    assert report["summary"]["passed"] == 13


def test_each_game_covered(report: dict):
    by_game = report["summary"]["by_game"]
    expected = {
        "cash-eruption": {"swids": 3, "passed": 3},
        "fort-knox-wolf-run": {"swids": 2, "passed": 2},
        "fortune-coin-boost-classic": {"swids": 4, "passed": 4},
        "skeleton-key": {"swids": 3, "passed": 3},
        "book-expanding-bonusbuy": {"swids": 1, "passed": 1},
    }
    assert by_game == expected


def test_all_gates_full_pass_count(report: dict):
    """All 6 gates must show 13/13 pass."""
    by_gate = report["summary"]["by_gate"]
    for gate, count in by_gate.items():
        assert count == 13, f"gate {gate}: {count}/13 (expected 13/13)"


def test_per_ir_rtp_total_in_pretty_range(report: dict):
    """Per-IR rtp_total must lie in the published vendor PAR window."""
    for r in report["results"]:
        rtp = r["rtp_total"]
        assert rtp is not None
        assert 0.85 < rtp <= 0.99, f"{r['folder']}/{r['swid']}: rtp_total {rtp}"


def test_no_ir_has_orphan_breakdown(report: dict):
    """Every IR's breakdown_sums gate must pass (no orphan components)."""
    for r in report["results"]:
        assert r["gates"]["breakdown_sums"]["pass"], (
            f"{r['folder']}/{r['swid']}: breakdown_sums failed -- "
            f"{r['gates']['breakdown_sums']['message']}"
        )


def test_paytables_are_monotonic_across_real_market(report: dict):
    """Specifically check real-market games (not template) — paytable
    monotonicity is the simplest sanity check that IR lift didn't garble
    the n-of-a-kind matrix."""
    for r in report["results"]:
        assert r["gates"]["paytable_monotonic"]["pass"], (
            f"{r['folder']}/{r['swid']}: paytable not monotone -- "
            f"{r['gates']['paytable_monotonic']['message']}"
        )
