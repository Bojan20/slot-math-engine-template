"""Sales one-pager build + structure tests."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "build_sales_one_pager.py"
OUT = REPO / "reports" / "dashboards" / "sales-one-pager.html"
MANIFEST = REPO / "reports" / "dashboards" / "sales-one-pager.manifest.json"


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


def test_one_pager_offline_safe(html_doc: str):
    for f in ("http://", "https://", "<script", "src=", "@import"):
        assert f not in html_doc


def test_one_pager_print_friendly(manifest: dict):
    assert manifest["print_friendly"] is True


def test_one_pager_size_budget(html_doc: str):
    assert 4_000 <= len(html_doc) <= 20_000


def test_one_pager_hero_lede_present(html_doc: str):
    assert "Sales One-Pager" in html_doc
    assert "real-market released-game PAR" in html_doc


def test_one_pager_kpi_strip_complete(html_doc: str):
    """8 KPI cards required."""
    assert html_doc.count('class="kpi"') >= 8


def test_one_pager_parity_table_present(html_doc: str):
    assert "Parity gates" in html_doc
    assert "Line pay" in html_doc
    assert "Scatter pay" in html_doc
    assert "Bonus-Buy fair-price" in html_doc


def test_one_pager_portfolio_table_lists_all_games(html_doc: str):
    for game in (
        "Cash Eruption",
        "Fort Knox Wolf Run",
        "Fortune Coin Boost Classic",
        "Skeleton Key",
        "book-expanding-bonusbuy",
    ):
        assert game in html_doc, f"missing game: {game}"


def test_one_pager_sourced_from_six_reports(manifest: dict):
    assert len(manifest["sourced_from"]) == 6


def test_one_pager_includes_pitch_closer(html_doc: str):
    assert "What this means for you" in html_doc
    assert "externally verified" in html_doc


def test_one_pager_no_copyright_leak(html_doc: str):
    for leak in ("ParSheets_BookOfUnseen", "Book of Unseen"):
        assert leak not in html_doc, f"copyright leak: {leak}"
