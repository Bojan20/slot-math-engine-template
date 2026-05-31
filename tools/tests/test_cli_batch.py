"""SLOT-MATH CLI `batch` subcommand — portfolio aggregate gate.

Validates the `slot-math batch` subcommand:
  - iterates the full PAR library
  - shape-dispatches MC per game (cluster/ways/crash/wrath/pay_anywhere)
  - emits a single Markdown dashboard
  - exits 0 iff every game passes (composer ∧ MC convergence)
  - supports --filter, --out, --mc-spins, --seed, --tolerance-bps

Designed for CI portfolio sweeps and studio demo (one command → health snapshot).
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _run(args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(
        [sys.executable, "-m", "tools.par_kernels.cli", "batch", *args],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return proc.returncode, proc.stdout, proc.stderr


def test_batch_no_mc_passes_for_all_known_games():
    """Batch without MC should pass for every game (composer parity only)."""
    ec, stdout, stderr = _run([])
    assert ec == 0, f"batch exit {ec}\nSTDERR:\n{stderr}\nSTDOUT (tail):\n{stdout[-2000:]}"
    # Roll-up section must appear with Overall portfolio gate ✅
    assert "## Roll-up" in stdout
    assert "**Overall portfolio gate** | **✅**" in stdout


def test_batch_with_mc_100k_passes_for_all_known_games():
    """Batch with --mc-spins 100_000 should pass for every game."""
    ec, stdout, stderr = _run(["--mc-spins", "100000"])
    assert ec == 0, (
        f"batch --mc-spins 100000 exit {ec}\nSTDERR:\n{stderr}\n"
        f"STDOUT (tail):\n{stdout[-3000:]}"
    )
    # Every game must show its dispatched MC engine in the table
    for engine_kind in ("`cluster`", "`ways`", "`crash`", "`wrath`", "`skip (CF exact)`"):
        assert engine_kind in stdout, f"expected MC kind {engine_kind} missing"


def test_batch_table_has_required_columns():
    """Header row must expose all dashboard columns."""
    ec, stdout, _ = _run([])
    assert ec == 0
    expected = [
        "| Game | Variant | Shape | Target RTP | Composed | Composer Δ | "
        "MC engine | MC RTP | MC Δ | MC rate | Status |"
    ]
    for col_row in expected:
        assert col_row in stdout, f"missing header row: {col_row}"


def test_batch_filter_narrows_scope():
    """--filter mystic should keep only mystic-cluster."""
    ec, stdout, _ = _run(["--filter", "mystic"])
    assert ec == 0
    assert "| mystic-cluster |" in stdout
    assert "| wrath-of-olympus |" not in stdout
    assert "| stake-rush |" not in stdout
    # Roll-up should report 1 game
    assert "| Games evaluated | 1 |" in stdout


def test_batch_filter_no_match_exits_nonzero():
    """Filter that matches nothing → exit 1 with notice."""
    ec, _, stderr = _run(["--filter", "no-such-game"])
    assert ec == 1
    assert "No games matched filter" in stderr


def test_batch_writes_dashboard_to_out_file():
    """--out flag writes the Markdown to a file and prints note to stderr."""
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "dashboard.md"
        ec, stdout, stderr = _run(["--out", str(out)])
        assert ec == 0
        assert out.is_file(), "dashboard file not created"
        body = out.read_text()
        assert "# SLOT-MATH Portfolio Health Dashboard" in body
        assert "## Roll-up" in body
        # When --out is used, stdout should NOT contain the report body
        assert "## Roll-up" not in stdout
        assert f"Dashboard written to {out}" in stderr


def test_batch_seed_is_deterministic_across_runs():
    """Same seed → identical MC RTP per game (wallclock/rate vary, RTP doesn't)."""
    import re
    ec1, out1, _ = _run(["--mc-spins", "50000", "--seed", "12345"])
    ec2, out2, _ = _run(["--mc-spins", "50000", "--seed", "12345"])
    assert ec1 == 0 and ec2 == 0

    # Parse the dashboard table: extract (game, mc_rtp_str, mc_delta_str) tuples.
    # Format: | game | variant | shape | target | composed | composer_Δ | mc_kind |
    #         mc_rtp | mc_Δ | mc_rate | status |
    row_re = re.compile(
        r"^\|\s+([a-z][a-z0-9\-]+)\s+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|"
        r"\s*([\d.%—]+)\s*\|\s*([\-+\d. bps—]+)\s*\|"
    )

    def _per_game_rtp(out: str) -> dict[str, tuple[str, str]]:
        result = {}
        for line in out.splitlines():
            m = row_re.match(line)
            if m:
                result[m.group(1)] = (m.group(2).strip(), m.group(3).strip())
        return result

    rtps1 = _per_game_rtp(out1)
    rtps2 = _per_game_rtp(out2)
    assert rtps1 == rtps2, (
        f"per-game MC RTP differs across runs (seed-determinism broken):\n"
        f"run1: {rtps1}\nrun2: {rtps2}"
    )
    # Sanity: we extracted ≥ 5 games (1 may be pay_anywhere with — — cells)
    assert len(rtps1) >= 5, f"expected ≥5 games extracted, got {len(rtps1)}"


def test_batch_smoke_overrides_mc_spins_to_1000():
    """--smoke must force mc_spins to 1000 and surface notice on stderr."""
    proc = subprocess.run(
        [sys.executable, "-m", "tools.par_kernels.cli", "batch",
         "--smoke", "--mc-spins", "999999999"],
        cwd=REPO, capture_output=True, text=True, timeout=120, check=False,
    )
    assert proc.returncode == 0
    assert "[smoke] forcing --mc-spins 1000" in proc.stderr
    # The bench (if requested) would reflect the override, but the
    # plain dashboard renders the config line:
    assert "--mc-spins 1000" in proc.stdout
    # 999999999 must NOT appear (override worked)
    assert "999999999" not in proc.stdout


def test_batch_smoke_with_bench_records_overridden_value():
    """--smoke + --bench must record mc_spins=1000 in JSON config block."""
    with tempfile.TemporaryDirectory() as td:
        bench = Path(td) / "bench.json"
        proc = subprocess.run(
            [sys.executable, "-m", "tools.par_kernels.cli", "batch",
             "--smoke", "--bench", str(bench)],
            cwd=REPO, capture_output=True, text=True, timeout=120, check=False,
        )
        assert proc.returncode == 0
        import json
        data = json.loads(bench.read_text())
        assert data["config"]["mc_spins"] == 1000


def test_batch_lists_all_six_reference_games():
    """No filter → all 6 reference games appear."""
    ec, stdout, _ = _run([])
    assert ec == 0
    for game in (
        "wrath-of-olympus", "mystic-cluster", "lightning-ways",
        "stake-rush", "sky-cascade", "oracle-of-delphi",
    ):
        assert f"| {game} |" in stdout, f"game {game} missing from batch dashboard"
