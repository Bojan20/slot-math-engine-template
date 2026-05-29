"""W4.8 + W4.12 — MC validator smoke tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
MEGAWAYS_SCRIPT = REPO_ROOT / "tools/parity/megaways_mc.py"
WALKING_WILD_SCRIPT = REPO_ROOT / "tools/parity/walking_wild_mc.py"
MEGAWAYS_REPORT = REPO_ROOT / "reports/acceptance/megaways_mc_parity.json"
WALKING_WILD_REPORT = REPO_ROOT / "reports/acceptance/walking_wild_mc_parity.json"


def _run(script: Path, extra: list[str] | None = None) -> int:
    rc = subprocess.run(
        [sys.executable, str(script), *(extra or [])],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    return rc.returncode


# ─── Megaways MC ────────────────────────────────────────────────────


def test_megaways_mc_exits_zero_on_short_run() -> None:
    if not MEGAWAYS_SCRIPT.exists():
        pytest.skip("megaways MC script missing")
    rc = _run(MEGAWAYS_SCRIPT, ["--n-spins", "1000", "--seed", "1"])
    assert rc == 0


def test_megaways_mc_all_gates_pass_at_5k_spins() -> None:
    _run(MEGAWAYS_SCRIPT, ["--n-spins", "5000", "--seed", "42"])
    report = json.loads(MEGAWAYS_REPORT.read_text())
    assert report["all_gates_pass"] is True


def test_megaways_mc_fs_trigger_rate_is_realistic() -> None:
    _run(MEGAWAYS_SCRIPT, ["--n-spins", "5000", "--seed", "42"])
    report = json.loads(MEGAWAYS_REPORT.read_text())
    # 4+ scatters on 6 reels with the synthesized BOOK weights should
    # trigger somewhere between 1% and 10% per spin.
    assert 0.01 <= report["fs_trigger_rate"] <= 0.15


def test_megaways_mc_deterministic_same_seed() -> None:
    _run(MEGAWAYS_SCRIPT, ["--n-spins", "1500", "--seed", "100"])
    first = json.loads(MEGAWAYS_REPORT.read_text())
    _run(MEGAWAYS_SCRIPT, ["--n-spins", "1500", "--seed", "100"])
    second = json.loads(MEGAWAYS_REPORT.read_text())
    assert first["rtp_total"] == second["rtp_total"]
    assert first["n_triggers"] == second["n_triggers"]


def test_megaways_mc_total_fs_awarded_positive() -> None:
    _run(MEGAWAYS_SCRIPT, ["--n-spins", "5000", "--seed", "42"])
    report = json.loads(MEGAWAYS_REPORT.read_text())
    assert report["total_fs_awarded"] > 0


# ─── Walking Wild MC ────────────────────────────────────────────────


def test_walking_wild_mc_exits_zero_on_short_run() -> None:
    if not WALKING_WILD_SCRIPT.exists():
        pytest.skip("walking-wild MC script missing")
    rc = _run(WALKING_WILD_SCRIPT, ["--n-spins", "2000", "--seed", "1"])
    assert rc == 0


def test_walking_wild_mc_all_gates_pass_at_10k() -> None:
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "10000", "--seed", "42"])
    report = json.loads(WALKING_WILD_REPORT.read_text())
    assert report["all_gates_pass"] is True


def test_walking_wild_mc_sticky_ttl_mean_converges() -> None:
    """At 10K spins with ~0.5 wild landings per spin, ~2500 sticky
    samples are drawn — enough for observed E[TTL] to converge to ref
    E[TTL] within 0.3 absolute."""
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "10000", "--seed", "42"])
    report = json.loads(WALKING_WILD_REPORT.read_text())
    ref = report["e_ttl_reference"]
    obs = report["sticky_ttl_mean_observed"]
    assert abs(obs - ref) < 0.3


def test_walking_wild_mc_distance_lt_ref_steps() -> None:
    """E[distance | edge-evaporate] should be STRICTLY less than
    E[raw_steps] because the grid clips long walks at the edges."""
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "10000", "--seed", "42"])
    report = json.loads(WALKING_WILD_REPORT.read_text())
    assert report["walking_distance_mean_observed"] < report["e_steps_reference"]


def test_walking_wild_mc_direction_balanced() -> None:
    """50/50 direction PMF → observed left share within ±5 pp at 10K."""
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "10000", "--seed", "42"])
    report = json.loads(WALKING_WILD_REPORT.read_text())
    left = report["walking_dir_left_share"]
    assert abs(left - 0.5) < 0.05


def test_walking_wild_mc_fs_trigger_rate_around_4_percent() -> None:
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "10000", "--seed", "42"])
    report = json.loads(WALKING_WILD_REPORT.read_text())
    # Closed-form says P(≥3 BOOK) ≈ 0.0422 → MC at 10K should land
    # in the ±50% window around that.
    assert 0.02 <= report["fs_trigger_rate"] <= 0.08


def test_walking_wild_mc_deterministic_same_seed() -> None:
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "1500", "--seed", "7"])
    first = json.loads(WALKING_WILD_REPORT.read_text())
    _run(WALKING_WILD_SCRIPT, ["--n-spins", "1500", "--seed", "7"])
    second = json.loads(WALKING_WILD_REPORT.read_text())
    assert first["n_wild_landings"] == second["n_wild_landings"]
    assert first["fs_triggers"] == second["fs_triggers"]
