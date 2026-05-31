"""SLOT-MATH CLI MC shape-dispatch — end-to-end gate.

Verifies `python3 -m tools.par_kernels.cli evaluate --game X --mc-spins N`
correctly routes to the right MC backend based on CF shape:

  - pay_anywhere_symbols    → MC skipped (CF is exact)
  - cluster_distribution    → run_cluster_rust  (Mystic-shape)
  - row_distribution_per_reel → run_ways_rust   (Lightning Ways)
  - house_edge+cashout_multiplier → run_crash_rust (Stake Rush)
  - else (fs_session/hnw_session) → Wrath-shape lines+FS+HW

All games must exit 0 and produce a parseable Markdown report.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]


def _run_cli(game: str, variant: str, mc_spins: int = 10_000) -> tuple[int, str, str]:
    proc = subprocess.run(
        [
            sys.executable, "-m", "tools.par_kernels.cli", "evaluate",
            "--game", game, "--variant", variant,
            "--mc-spins", str(mc_spins),
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return proc.returncode, proc.stdout, proc.stderr


@pytest.mark.parametrize(
    "game,variant,expected_engine_keyword,expected_skip",
    [
        ("wrath-of-olympus", "v12.0.0", "rust wrath", False),
        ("mystic-cluster",   "v1.0.0",  "rust cluster", False),
        ("lightning-ways",   "v1.0.0",  "rust ways", False),
        ("stake-rush",       "v1.0.0",  "rust crash", False),
        ("sky-cascade",      "v1.0.0",  None, True),  # pay_anywhere → skipped
        ("oracle-of-delphi", "v1.0.0",  "rust wrath", False),
    ],
)
def test_cli_mc_dispatch_by_shape(
    game: str, variant: str, expected_engine_keyword: str | None, expected_skip: bool,
):
    """Each game routes to the correct Rust MC backend (or skips for pay_anywhere)."""
    ec, stdout, stderr = _run_cli(game, variant, mc_spins=10_000)
    assert ec == 0, (
        f"{game} exit {ec}.\nSTDERR:\n{stderr}\nSTDOUT (tail):\n{stdout[-1500:]}"
    )
    if expected_skip:
        assert "pay_anywhere shape detected" in stderr, (
            f"Expected pay_anywhere skip notice in stderr for {game}, got:\n{stderr}"
        )
        # Skip case: no MC section in report
        assert "## Monte Carlo runtime" not in stdout, (
            f"Pay-anywhere {game} should not have MC section"
        )
    else:
        assert "## Monte Carlo runtime" in stdout, f"No MC section for {game}"
        assert expected_engine_keyword in stdout, (
            f"Expected engine keyword '{expected_engine_keyword}' in {game} report; "
            f"got engine note context:\n"
            f"{[ln for ln in stdout.splitlines() if 'Engine' in ln]}"
        )
        # Every non-skip MC report must include a convergence verdict
        assert "Convergence (within Wilson 99% CI)" in stdout, (
            f"{game} missing Wilson 99% CI convergence row"
        )


def test_cli_mc_dispatch_exit_codes_all_zero():
    """Sanity: all 6 reference games exit 0 with --mc-spins 10_000."""
    games = [
        ("wrath-of-olympus", "v12.0.0"),
        ("mystic-cluster",   "v1.0.0"),
        ("lightning-ways",   "v1.0.0"),
        ("stake-rush",       "v1.0.0"),
        ("sky-cascade",      "v1.0.0"),
        ("oracle-of-delphi", "v1.0.0"),
    ]
    failures = []
    for g, v in games:
        ec, _, err = _run_cli(g, v, mc_spins=10_000)
        if ec != 0:
            failures.append(f"{g} {v}: exit {ec} — stderr: {err.strip()[:200]}")
    assert not failures, "Non-zero exits:\n  " + "\n  ".join(failures)


def test_cli_extended_report_renders_extended_fields():
    """Cluster/ways/crash reports must show shape-specific fields, not Wrath fields."""
    for game, variant, shape in [
        ("mystic-cluster", "v1.0.0", "cluster"),
        ("lightning-ways", "v1.0.0", "ways"),
        ("stake-rush",     "v1.0.0", "crash"),
    ]:
        ec, stdout, _ = _run_cli(game, variant, mc_spins=10_000)
        assert ec == 0
        # Extended shape uses "Rounds" not "Spins", shows shape label, no FS/HW trigger
        assert "| Rounds |" in stdout, f"{game} ({shape}) missing Rounds row"
        assert f"| Shape | `{shape}` |" in stdout, f"{game} missing shape label '{shape}'"
        assert "| FS trigger |" not in stdout, (
            f"{game} ({shape}) should NOT show FS trigger (that's Wrath-only)"
        )
        assert "| H&W trigger |" not in stdout, (
            f"{game} ({shape}) should NOT show H&W trigger (that's Wrath-only)"
        )


def test_cli_wrath_report_renders_wrath_fields():
    """Wrath shape must show Spins + FS trigger + H&W trigger rows."""
    ec, stdout, _ = _run_cli("wrath-of-olympus", "v12.0.0", mc_spins=10_000)
    assert ec == 0
    assert "| Spins |" in stdout
    assert "| FS trigger |" in stdout
    assert "| H&W trigger |" in stdout
    # And NOT extended shape label
    assert "| Shape | `cluster` |" not in stdout
    assert "| Shape | `ways` |" not in stdout
