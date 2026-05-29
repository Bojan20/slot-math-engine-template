"""Tests for the clean-room parity portfolio dashboard builder."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "tools/build_clean_room_parity_portfolio.py"
OUT = REPO_ROOT / "reports/dashboards/clean-room-parity-portfolio.html"


def _run() -> int:
    rc = subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    return rc.returncode


def test_portfolio_dashboard_builder_exits_zero() -> None:
    rc = _run()
    assert rc == 0


def test_portfolio_dashboard_html_self_contained() -> None:
    _run()
    text = OUT.read_text(encoding="utf-8")
    assert "<!doctype html>" in text
    # No remote sources allowed in the offline-first HTML.
    for marker in [
        "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "googleapis.com",
        "unpkg.com", '<script src="http', '<link rel="stylesheet" href="http',
    ]:
        assert marker not in text, f"unexpected remote ref: {marker}"


def test_portfolio_dashboard_contains_all_three_template_names() -> None:
    _run()
    text = OUT.read_text(encoding="utf-8")
    assert "Book Expanding + Bonus Buy" in text
    assert "Megaways Variable-Rows Ways" in text
    assert "Sticky + Walking Wild" in text


def test_portfolio_dashboard_lists_wave_anchors() -> None:
    _run()
    text = OUT.read_text(encoding="utf-8")
    for wave in ("W4.8", "W4.11", "W4.12", "W4.15"):
        assert wave in text


def test_portfolio_dashboard_size_bounded() -> None:
    _run()
    size = OUT.stat().st_size
    # Self-contained but compact — under 50 KB.
    assert 3_000 < size < 50_000


def test_portfolio_dashboard_shows_pass_badges_when_all_gates_green() -> None:
    _run()
    text = OUT.read_text(encoding="utf-8")
    # At least one PASS badge present (closed-form gate matrix).
    assert "PASS" in text
