"""SLOT-MATH Faza 5.1+5.2+5.4+5.5 — Studio variant-compare UI test gate."""
from __future__ import annotations

from pathlib import Path


REPO = Path(__file__).resolve().parent.parent.parent
COMPARE_DIR = REPO / "web" / "studio" / "variant-compare"


def test_compare_html_exists():
    assert (COMPARE_DIR / "index.html").exists(), f"missing: {COMPARE_DIR / 'index.html'}"


def test_compare_js_exists():
    assert (COMPARE_DIR / "compare.js").exists(), f"missing: {COMPARE_DIR / 'compare.js'}"


def test_compare_html_has_required_elements():
    html = (COMPARE_DIR / "index.html").read_text(encoding="utf-8")
    assert "<!DOCTYPE html>" in html
    assert 'id="grid"' in html
    assert 'id="game-select"' in html
    assert 'id="promote-btn"' in html
    assert 'id="audit-pre"' in html
    assert 'Variant Compare' in html


def test_compare_js_wires_promote_endpoint():
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "/api/promote" in js
    assert "discoverGames" in js
    assert "loadVariantData" in js
    assert "renderGrid" in js
    assert "selectedVariantId" in js


def test_compare_js_loads_canonical_par_and_ir():
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "canonical.par.yaml" in js
    assert "game.ir.json" in js
    assert "mc_sweep.attestation.json" in js


def test_compare_html_includes_winner_highlight_css():
    html = (COMPARE_DIR / "index.html").read_text(encoding="utf-8")
    assert ".pane.winner" in html
    assert "rgba(0,255,136" in html or "#00ff88" in html


def test_compare_js_handles_no_backend_fallback():
    """If /api/promote fails, JS should toast CLI fallback command."""
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "slot-math promote" in js


def test_compare_html_includes_metric_grid():
    html = (COMPARE_DIR / "index.html").read_text(encoding="utf-8")
    # CSS class for metric grid presence
    assert ".metric-grid" in html
    assert "metric" in html


def test_compare_js_renders_mc_gate_status():
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "overall_pass" in js
    assert "PASS" in js
    assert "FAIL" in js


def test_compare_js_renders_jurisdictions_per_variant():
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "jurisdictions" in js


def test_compare_audit_log_panel_present():
    html = (COMPARE_DIR / "index.html").read_text(encoding="utf-8")
    assert "promotions.log" in (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "audit-log" in html or "audit-pre" in html


def test_compare_js_uses_par_library_base():
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert "PAR_LIBRARY_BASE" in js
    assert "par-library" in js


def test_compare_js_supports_refresh_button():
    html = (COMPARE_DIR / "index.html").read_text(encoding="utf-8")
    js = (COMPARE_DIR / "compare.js").read_text(encoding="utf-8")
    assert 'id="refresh"' in html
    assert "refresh" in js
