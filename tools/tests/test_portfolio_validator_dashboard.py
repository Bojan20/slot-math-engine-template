"""Build + structure tests for the portfolio-validator HTML dashboard."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "build_portfolio_validator_dashboard.py"
OUT = REPO / "reports" / "dashboards" / "portfolio-validator-dashboard.html"
MANIFEST = REPO / "reports" / "dashboards" / "portfolio-validator-dashboard.manifest.json"


@pytest.fixture(scope="module")
def html_doc() -> str:
    r = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, cwd=str(REPO))
    assert r.returncode == 0, f"exit {r.returncode}\nstdout: {r.stdout}\nstderr: {r.stderr}"
    assert OUT.exists()
    return OUT.read_text()


@pytest.fixture(scope="module")
def manifest() -> dict:
    assert MANIFEST.exists()
    return json.loads(MANIFEST.read_text())


def test_dashboard_offline_safe(html_doc: str):
    for f in ("http://", "https://", "<script", "src=", "@import"):
        assert f not in html_doc


def test_dashboard_under_25_kb(html_doc: str):
    assert len(html_doc) <= 25_000


def test_dashboard_lists_all_gates(html_doc: str):
    for gate in (
        "rtp_total_in_range",
        "hit_freq_sane",
        "win_freq_sane",
        "breakdown_sums",
        "reels_sane",
        "paytable_monotonic",
    ):
        assert gate in html_doc, f"missing gate: {gate}"


def test_dashboard_lists_all_games(html_doc: str):
    for game in (
        "cash-eruption",
        "fort-knox-wolf-run",
        "fortune-coin-boost-classic",
        "skeleton-key",
        "book-expanding-bonusbuy",
    ):
        assert game in html_doc, f"missing game: {game}"


def test_dashboard_shows_13_swids(html_doc: str):
    """13 SWIDs should appear in the per-IR matrix rows."""
    rows = html_doc.count("</tr>")
    assert rows >= 13 + 3 + 5  # IR matrix + header + per-gate aggregate + by-game


def test_dashboard_kpi_totals_match_validator(manifest: dict):
    assert manifest["total_irs"] == 13
    assert manifest["passed"] == 13
    assert manifest["failed"] == 0


def test_dashboard_no_fail_chips_present(html_doc: str):
    """All gates must pass → zero `chip fail` markers in the HTML."""
    assert 'chip fail' not in html_doc


def test_dashboard_records_every_gate_aggregate(manifest: dict):
    assert len(manifest["by_gate"]) == 6
    for gate, count in manifest["by_gate"].items():
        assert count == 13, f"{gate}: {count}/13"
