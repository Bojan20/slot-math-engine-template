"""Build + structure tests for `reports/dashboards/index.html` (operator portal)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "build_operator_portal.py"
OUT = REPO / "reports" / "dashboards" / "index.html"
MANIFEST = REPO / "reports" / "dashboards" / "index.manifest.json"


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


def test_portal_is_offline_safe(html_doc: str):
    for forbidden in ("http://", "https://", "<script", "src=", "@import"):
        assert forbidden not in html_doc, f"portal contains '{forbidden}'"


def test_portal_under_15_kb(html_doc: str):
    assert len(html_doc) <= 15_000


def test_portal_lists_six_dashboards(manifest: dict):
    assert len(manifest["dashboards"]) == 6


def test_portal_links_to_each_dashboard(html_doc: str):
    for href in (
        "mc-parity-dashboard.html",
        "portfolio-validator-dashboard.html",
        "real-market-portfolio.html",
        "unified-audit.html",
        "live-par-compiler.html",
        "par-verification.html",
    ):
        assert href in html_doc, f"missing dashboard link: {href}"


def test_portal_includes_wave_labels(html_doc: str):
    for wave in ("W4.11c", "W4.11d", "W4.11f", "W7.11", "W7.7", "PAR-001"):
        assert wave in html_doc, f"missing wave label: {wave}"


def test_portal_reports_index_has_9_items(manifest: dict):
    assert manifest["report_count"] == 9


def test_portal_links_to_dossier_and_perf_bench(html_doc: str):
    assert "INDUSTRY_FIRST_DOSSIER" in html_doc
    assert "PERF_BENCH" in html_doc
    assert "UNIFIED_AUDIT.json" in html_doc


def test_portal_no_copyright_leak(html_doc: str):
    for leak in ("ParSheets_BookOfUnseen", "Book of Unseen"):
        assert leak not in html_doc, f"copyright leak: {leak}"


def test_portal_pinned_dashboards_exist_on_disk():
    """All linked dashboards must already exist next to index.html."""
    dash_dir = REPO / "reports" / "dashboards"
    for fname in (
        "mc-parity-dashboard.html",
        "portfolio-validator-dashboard.html",
        "real-market-portfolio.html",
        "unified-audit.html",
        "live-par-compiler.html",
        "par-verification.html",
    ):
        assert (dash_dir / fname).exists(), f"missing linked dashboard: {fname}"
