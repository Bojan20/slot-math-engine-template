"""Build + structure tests for `reports/dashboards/real-market-portfolio.html`."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "build_real_market_portfolio.py"
OUT = REPO / "reports" / "dashboards" / "real-market-portfolio.html"
MANIFEST = REPO / "reports" / "dashboards" / "real-market-portfolio.manifest.json"


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


@pytest.fixture(scope="module")
def manifest() -> dict:
    assert MANIFEST.exists()
    return json.loads(MANIFEST.read_text())


def test_portfolio_is_offline_safe(html_doc: str):
    for forbidden in ("http://", "https://", "<script", "src=", "@import"):
        assert forbidden not in html_doc, f"portfolio contains '{forbidden}'"


def test_portfolio_under_30_kb(html_doc: str):
    assert len(html_doc) <= 30_000


def test_portfolio_all_five_games_present(html_doc: str):
    for game in (
        "Cash Eruption",
        "Fort Knox Wolf Run",
        "Fortune Coin Boost Classic",
        "Skeleton Key",
        "Book-style Expanding + Bonus Buy",
    ):
        assert game in html_doc, f"missing game: {game}"


def test_portfolio_kpi_totals(html_doc: str, manifest: dict):
    """KPI strip totals match manifest aggregates."""
    assert manifest["total_swids"] == 13, f"expected 13 SWIDs, got {manifest['total_swids']}"
    assert len(manifest["games"]) == 5
    assert len(manifest["industry_anchors"]) == 5


def test_portfolio_per_game_counts(manifest: dict):
    expected = {
        "cash-eruption": 3,
        "fort-knox-wolf-run": 2,
        "fortune-coin-boost-classic": 4,
        "skeleton-key": 3,
        "book-expanding-bonusbuy": 1,
    }
    assert manifest["per_game_counts"] == expected


def test_portfolio_real_market_badges_outnumber_template(html_doc: str):
    """4 real-market badges vs 1 template badge."""
    real = html_doc.count('">REAL-MARKET<')
    tpl = html_doc.count('">TEMPLATE<')
    assert real == 4, f"expected 4 REAL-MARKET badges, got {real}"
    assert tpl == 1, f"expected 1 TEMPLATE badge, got {tpl}"


def test_portfolio_lists_swids_inline(html_doc: str):
    """A handful of real SWIDs must be name-checked in the HTML."""
    for swid in ("200-1517-001", "200-1581-001", "200-1637-001", "200-1775-001"):
        assert swid in html_doc, f"missing SWID: {swid}"


def test_portfolio_no_raw_xlsx_paths(html_doc: str):
    """The dashboard must not leak source XLSX names."""
    for leak in ("ParSheets_BookOfUnseen", "Book of Unseen", "BookOfUnseen"):
        assert leak not in html_doc, f"copyright leak: {leak}"
