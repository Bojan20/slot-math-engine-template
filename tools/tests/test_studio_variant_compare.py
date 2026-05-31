"""SLOT-MATH Faza 5.1+5.2+5.4+5.5 — Studio variant-compare UI test gate."""
from __future__ import annotations

from pathlib import Path

import pytest


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


# ─── Faza 5.4 — Compare report HTML ──────────────────────────────────────

from tools.par_deploy.variant_compare_report import (
    VariantSnapshot,
    emit_compare_report,
    render_compare_report,
)


def _variant_snapshot(vid: str, rtp: float) -> VariantSnapshot:
    return VariantSnapshot(
        variant_id=vid,
        par={
            "merkle_root_sha256": vid * 32,
            "rtp": {"rtp_total": rtp, "variance": 100.0},
            "limits": {"hit_freq_target": 0.25, "max_win_x": 5000.0},
        },
        ir={"provenance": {"ir_sha256": (vid[0] * 64)}},
        mc_attestation={
            "attestation_sha256": "m" * 64,
            "tier": "T3",
        },
        build_manifest={"deploy_signature": "d" * 64},
    )


def test_compare_report_renders_html():
    variants = [
        _variant_snapshot("a", 0.92),
        _variant_snapshot("b", 0.94),
        _variant_snapshot("c", 0.96),
        _variant_snapshot("d", 0.98),
    ]
    html_out = render_compare_report("crimson-tiger", variants)
    assert "<!DOCTYPE html>" in html_out
    assert "crimson-tiger" in html_out
    assert "variant_a" in html_out and "variant_d" in html_out
    # All RTPs visible
    assert "92.00%" in html_out
    assert "98.00%" in html_out


def test_compare_report_picks_baseline_min_rtp():
    variants = [
        _variant_snapshot("c", 0.96),
        _variant_snapshot("a", 0.92),  # lowest → baseline
        _variant_snapshot("b", 0.94),
    ]
    html_out = render_compare_report("g", variants)
    # Subtitle should call out baseline=a
    assert "baseline: <code>variant_a</code>" in html_out


def test_compare_report_explicit_baseline():
    variants = [
        _variant_snapshot("a", 0.92),
        _variant_snapshot("b", 0.94),
    ]
    html_out = render_compare_report("g", variants, baseline_variant_id="b")
    assert "baseline: <code>variant_b</code>" in html_out


def test_compare_report_writes_to_disk(tmp_path):
    variants = [
        _variant_snapshot("a", 0.92),
        _variant_snapshot("b", 0.96),
    ]
    out = tmp_path / "variant-compare-test.html"
    written = emit_compare_report("game-x", variants, out)
    assert written == out
    assert out.is_file()
    content = out.read_text(encoding="utf-8")
    assert "game-x" in content
    assert "Paper trail" in content


def test_compare_report_rejects_empty_variants():
    with pytest.raises(ValueError):
        render_compare_report("g", [])


def test_compare_report_rejects_unknown_baseline():
    variants = [_variant_snapshot("a", 0.92)]
    with pytest.raises(ValueError):
        render_compare_report("g", variants, baseline_variant_id="nope")


def test_compare_report_includes_merkle_chain():
    variants = [_variant_snapshot("a", 0.92)]
    html_out = render_compare_report("g", variants)
    # PAR/IR/MC/deploy hashes should appear (truncated form)
    assert "Merkle attestation chain" in html_out
    assert "par</span>" in html_out
    assert "ir</span>" in html_out
    assert "mc_sweep</span>" in html_out
    assert "deploy</span>" in html_out
