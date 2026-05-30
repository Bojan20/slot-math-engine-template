"""Build + structure tests for `reports/dashboards/mc-parity-dashboard.html`."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "build_mc_parity_dashboard.py"
OUT = REPO / "reports" / "dashboards" / "mc-parity-dashboard.html"


@pytest.fixture(scope="module")
def html_doc() -> str:
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    assert result.returncode == 0, (
        f"builder exit {result.returncode}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert OUT.exists()
    return OUT.read_text()


def test_dashboard_is_offline_safe(html_doc: str):
    """No remote URLs, no external script/style imports."""
    for forbidden in ("http://", "https://", "<script", "src=", "@import"):
        assert forbidden not in html_doc, f"dashboard contains '{forbidden}' — not offline-safe"


def test_dashboard_under_25_kb(html_doc: str):
    """KPI: HTML body ≤ 25 KB so it fits any operator-package size budget."""
    assert len(html_doc) <= 25_000


def test_dashboard_lists_par_components(html_doc: str):
    for component in ("Line pay", "Scatter pay", "FS / bonus pay", "Total RTP"):
        assert component in html_doc


def test_dashboard_renders_at_least_5_pass_badges(html_doc: str):
    """Closed-form + MC together expose ≥ 5 gates; expect all green."""
    assert html_doc.count("badge pass") >= 5
    assert html_doc.count("badge fail") == 0


def test_dashboard_lists_real_market_portfolio(html_doc: str):
    """The five source games + the template must be name-checked."""
    for game in (
        "Skeleton Key",
        "Fortune Coin Boost Classic",
        "Cash Eruption",
        "Fort Knox Wolf Run",
        "book-expanding-bonusbuy",
    ):
        assert game in html_doc, f"missing game row: {game}"


def test_dashboard_shows_book_pmf_section(html_doc: str):
    """The PMF section + scatter probabilities for k ∈ {3, 4, 5} must be visible."""
    assert "Book PMF" in html_doc
    assert "3 BOOK" in html_doc
    assert "4 BOOK" in html_doc
    assert "5 BOOK" in html_doc


def test_dashboard_documents_fs_limitation_honestly(html_doc: str):
    """FS RTP-share limitation must be disclosed (no over-promising)."""
    assert "FS RTP-share" in html_doc or "FS RTP" in html_doc
    assert "sticky-reel" in html_doc or "informational" in html_doc.lower()


def test_dashboard_displays_runtime_for_mc(html_doc: str):
    """MC sample-size KPI is part of the sales surface.

    W244 wave 6 — wall-clock throughput numbers (spins/sec, elapsed_seconds)
    were excised from the MC JSON for Merkle determinism (machine-load
    timing was the cascade root that dirtied 6 files per rebuild). The
    dashboard now renders only the spin count + fixed-seed note. Wall-clock
    throughput lives in CI logs and README, not the regulator manifest.
    """
    assert "spinova" in html_doc or "spins" in html_doc
    assert "fixed seed" in html_doc.lower() or "CI log" in html_doc.lower() or "ci logs" in html_doc.lower()
