"""SLOT-MATH `demo` subcommand — end-to-end pipeline showcase gate.

Validates `slot-math demo` produces a complete 4-step Markdown report
(evaluate → batch → bench-pin → bench-trend) and exits 0 on a healthy
PAR library. Designed for screencast / sales-demo / onboarding use.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _run_demo(extra: list[str] | None = None) -> tuple[int, str, str, str]:
    """Run `slot-math demo --out <tmp>` and return (ec, stdout, stderr, body)."""
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "demo.md"
        cmd = [
            sys.executable, "-m", "tools.par_kernels.cli", "demo",
            "--mc-spins", "10000",
            "--out", str(out),
            *(extra or []),
        ]
        proc = subprocess.run(
            cmd, cwd=REPO, capture_output=True, text=True,
            timeout=180, check=False,
        )
        body = out.read_text() if out.is_file() else ""
        return proc.returncode, proc.stdout, proc.stderr, body


def test_demo_exits_zero():
    ec, _, stderr, body = _run_demo()
    assert ec == 0, f"demo exit {ec}\nstderr:\n{stderr}\nbody (head):\n{body[:1500]}"
    assert body, "demo body is empty"


def test_demo_report_has_all_four_steps():
    """All 4 numbered headings must appear."""
    ec, _, _, body = _run_demo()
    assert ec == 0
    for heading in (
        "## 1. Evaluate one game",
        "## 2. Batch evaluate (entire PAR library)",
        "## 3. Pin bench JSON into portfolio-history ledger",
        "## 4. Render portfolio trend (across ledger)",
        "## Pipeline summary",
    ):
        assert heading in body, f"missing demo step: {heading}"


def test_demo_evaluates_default_game():
    """Default featured game is wrath-of-olympus/v12.0.0."""
    ec, _, _, body = _run_demo()
    assert ec == 0
    assert "wrath-of-olympus/v12.0.0" in body


def test_demo_custom_game_override():
    """--game --variant must change the featured single-evaluate step."""
    ec, _, _, body = _run_demo(["--game", "mystic-cluster", "--variant", "v1.0.0"])
    assert ec == 0
    assert "mystic-cluster/v1.0.0" in body
    # The batch dashboard always lists all games, so we explicitly check
    # that the FEATURED step heading reflects the override.
    assert "## 1. Evaluate one game (`mystic-cluster/v1.0.0`)" in body


def test_demo_shows_idempotency_of_pin():
    """Demo step 3 must demonstrate pin twice → first new, second skipped."""
    ec, _, _, body = _run_demo()
    assert ec == 0
    assert "pinned=True" in body
    assert "pinned=False" in body
    assert "idempotent ✅" in body


def test_demo_includes_batch_dashboard_and_trend():
    """Batch dashboard table + portfolio trend must both be embedded."""
    ec, _, _, body = _run_demo()
    assert ec == 0
    # Batch dashboard table header
    assert "| Game | Variant | Shape | Target RTP |" in body
    # Trend table header
    assert "| Game | Variant | Shape | Last RTP |" in body
    # Pipeline summary tail
    assert "All four primitives are CI-wired" in body


def test_demo_writes_to_file_keeps_stdout_quiet_of_report():
    """When --out is given, stdout should NOT contain the report body."""
    ec, stdout, _, body = _run_demo()
    assert ec == 0
    # Report body lives in file; stdout has only progress chatter
    assert "## 1. Evaluate one game" not in stdout
    assert "## 1. Evaluate one game" in body
