"""W4.8 + W4.12 — Parity validator smoke tests.

Re-runs the two closed-form parity verifiers and pins the gate-pass
contract so any future regression in the IR template or the
analyzer surfaces immediately.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
MEGAWAYS_SCRIPT = REPO_ROOT / "tools/parity/megaways_closed_form.py"
WALKING_WILD_SCRIPT = REPO_ROOT / "tools/parity/walking_wild_closed_form.py"
MEGAWAYS_REPORT = REPO_ROOT / "reports/acceptance/megaways_parity.json"
WALKING_WILD_REPORT = REPO_ROOT / "reports/acceptance/walking_wild_parity.json"


def _run(script: Path) -> int:
    rc = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    return rc.returncode


# ─── Megaways ────────────────────────────────────────────────────────


def test_megaways_validator_exits_zero() -> None:
    if not MEGAWAYS_SCRIPT.exists():
        pytest.skip("megaways parity script missing")
    rc = _run(MEGAWAYS_SCRIPT)
    assert rc == 0, f"megaways parity validator exited {rc}"


def test_megaways_report_emits_all_gates() -> None:
    _run(MEGAWAYS_SCRIPT)
    report = json.loads(MEGAWAYS_REPORT.read_text())
    assert report["all_gates_pass"] is True
    expected_gates = {
        "trigger_finite_in_open_unit",
        "bg_shares_non_negative",
        "bg_shares_finite",
        "scatter_share_non_negative",
        "fs_rtp_reference_in_unit",
        "closed_form_total_finite",
    }
    assert set(report["gates"].keys()) == expected_gates


def test_megaways_per_anchor_shares_sum_positive() -> None:
    _run(MEGAWAYS_SCRIPT)
    report = json.loads(MEGAWAYS_REPORT.read_text())
    assert report["bg_total"] > 0
    assert report["expected_rows_per_reel"] > 0


def test_megaways_scatter_trigger_in_open_unit() -> None:
    _run(MEGAWAYS_SCRIPT)
    report = json.loads(MEGAWAYS_REPORT.read_text())
    p = report["scatter_trigger_p_4_of_6"]
    assert 0 < p < 1


# ─── Walking Wild ───────────────────────────────────────────────────


def test_walking_wild_validator_exits_zero() -> None:
    if not WALKING_WILD_SCRIPT.exists():
        pytest.skip("walking-wild parity script missing")
    rc = _run(WALKING_WILD_SCRIPT)
    assert rc == 0, f"walking wild parity validator exited {rc}"


def test_walking_wild_all_gates_pass() -> None:
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    assert report["all_gates_pass"] is True


def test_walking_wild_scatter_triggers_monotone_in_n() -> None:
    """P(≥3 scatter) > P(≥4 scatter) > P(≥5 scatter)."""
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    t = report["p_fs_trigger"]
    assert t["≥3"] > t["≥4"] > t["≥5"] > 0


def test_walking_wild_sticky_ttl_mean_in_pmf_support() -> None:
    """E[TTL] must lie inside the PMF support range (1..5)."""
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    e_ttl = report["sticky_wild"]["expected_ttl"]
    assert 1.0 <= e_ttl <= 5.0


def test_walking_wild_walking_steps_mean_in_pmf_support() -> None:
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    e_steps = report["walking_wild"]["expected_steps"]
    assert 1.0 <= e_steps <= 5.0


def test_walking_wild_direction_pmf_sums_to_one() -> None:
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    direction = report["walking_wild"]["direction_pmf"]
    assert abs(sum(direction.values()) - 1.0) < 1e-9


def test_walking_wild_distance_capped_at_grid_edge() -> None:
    """For the edge reels (0 and 4 in a 5-wide grid), expected walking
    distance must be ≤ for the inner reels (1..3)."""
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    distances = report["walking_wild"]["expected_walking_distance_per_start_reel"]
    edge_distance = (distances["0"] + distances["4"]) / 2
    inner_distance = (distances["1"] + distances["2"] + distances["3"]) / 3
    assert edge_distance <= inner_distance


def test_walking_wild_breakdown_components_consistent() -> None:
    _run(WALKING_WILD_SCRIPT)
    report = json.loads(WALKING_WILD_REPORT.read_text())
    assert report["rtp_breakdown_components_sum"] == pytest.approx(
        report["rtp_breakdown_total"], abs=1e-9
    )
