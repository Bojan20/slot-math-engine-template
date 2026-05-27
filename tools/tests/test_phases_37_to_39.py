"""PHASE 37 + 38 + 39 — combined regression tests."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest


# ─── PHASE 37 — Regression Spec Generator ─────────────────────────────────

from tools.regen_suite import generate_regression_spec, RegressionSpec


def _ir() -> dict:
    return {
        "meta": {"name": "Regen Test", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "paytable": [{"combo": ["A"] * 5, "pays": 10}],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 1}, {"symbol": "B", "weight": 9}]
                    for _ in range(5)
                ]}
            ]
        },
    }


def test_p37_basic_spec():
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.001, ir_path_for_test="games/test.ir.json",
    )
    assert isinstance(spec, RegressionSpec)
    assert spec.schema_version == "urn:slotmath:regen-suite:v1"
    assert len(spec.ir_hash_hex) == 64
    assert "test_ir_hash_pin" in spec.spec_source
    assert "test_rtp_in_band" in spec.spec_source


def test_p37_slug_derived_from_meta():
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.001, ir_path_for_test="x",
    )
    assert spec.slug == "regen_test"


def test_p37_custom_slug():
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.001, ir_path_for_test="x", slug="custom_name",
    )
    assert spec.slug == "custom_name"


def test_p37_rtp_in_band_pinned():
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.05, rtp_tolerance=0.001,
        ir_path_for_test="x",
    )
    assert "0.05" in spec.spec_source
    assert "0.001" in spec.spec_source


def test_p37_max_win_cap_section():
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.001, ir_path_for_test="x", max_win_cap=5000,
    )
    assert "max_win_cap_compliance:5000" in spec.spec_source


def test_p37_no_cap_skips_test():
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.001, ir_path_for_test="x",
    )
    assert "pytest.skip" in spec.spec_source


def test_p37_validation():
    with pytest.raises(ValueError):
        generate_regression_spec(_ir(), expected_rtp=2.0, ir_path_for_test="x")
    with pytest.raises(ValueError):
        generate_regression_spec(
            _ir(), expected_rtp=0.5, rtp_tolerance=-0.01, ir_path_for_test="x",
        )
    with pytest.raises(ValueError):
        generate_regression_spec(
            _ir(), expected_rtp=0.5, ir_path_for_test="x", max_win_cap=0,
        )


def test_p37_hash_changes_with_ir(tmp_path):
    spec1 = generate_regression_spec(_ir(), expected_rtp=0.0, ir_path_for_test="x")
    ir2 = _ir()
    ir2["paytable"][0]["pays"] = 999
    spec2 = generate_regression_spec(ir2, expected_rtp=0.0, ir_path_for_test="x")
    assert spec1.ir_hash_hex != spec2.ir_hash_hex


def test_p37_spec_source_writable_to_file(tmp_path):
    spec = generate_regression_spec(
        _ir(), expected_rtp=0.001, ir_path_for_test="x",
    )
    p = tmp_path / f"test_regression_{spec.slug}.py"
    p.write_text(spec.spec_source)
    # File should be valid Python (parsable)
    import ast
    ast.parse(p.read_text())


# ─── PHASE 38 — Inspector HTML ────────────────────────────────────────────

from tools.inspector import emit_inspector_html


def test_p38_html_doctype():
    html = emit_inspector_html(_ir())
    assert html.startswith("<!doctype html>")


def test_p38_html_contains_meta_name():
    html = emit_inspector_html(_ir())
    assert "Regen Test" in html


def test_p38_html_contains_rtp_estimate():
    html = emit_inspector_html(_ir())
    assert "Closed-form RTP" in html


def test_p38_html_contains_paytable_rows():
    html = emit_inspector_html(_ir())
    assert "Paytable" in html
    assert "<code>A A A A A</code>" in html


def test_p38_html_contains_reel_frequencies():
    html = emit_inspector_html(_ir())
    assert "Per-reel symbol frequencies" in html
    assert "A: 1/10" in html
    assert "B: 9/10" in html


def test_p38_html_contains_tamper_evidence():
    html = emit_inspector_html(_ir())
    assert "Tamper-evidence" in html
    assert "Canonical SHA-256" in html


def test_p38_html_xss_escape():
    ir = _ir()
    ir["meta"]["name"] = "<script>alert(1)</script>"
    html = emit_inspector_html(ir)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


def test_p38_html_no_features_section_skipped():
    ir = _ir()
    ir.pop("features", None)
    html = emit_inspector_html(ir)
    # Heading shouldn't appear when features is empty
    assert "<h2>Features</h2>" not in html


def test_p38_html_features_section_with_features():
    ir = _ir()
    ir["features"] = [{"kind": "free_spins", "initial_spins": 10}]
    html = emit_inspector_html(ir)
    assert "<h2>Features</h2>" in html
    assert "free_spins" in html


# ─── PHASE 39 — RTP Decomposition ────────────────────────────────────────

from tools.rtp_decompose import decompose, DecompositionResult


def test_p39_empty_series():
    r = decompose([])
    assert r.trend_slope == 0.0
    assert r.residual_std_dev == 0.0


def test_p39_invalid_period():
    with pytest.raises(ValueError):
        decompose([1.0, 2.0], period_steps=0)


def test_p39_constant_series_zero_trend():
    r = decompose([0.96] * 100)
    assert abs(r.trend_slope) < 1e-9
    assert abs(r.trend_intercept - 0.96) < 1e-9


def test_p39_linear_series_detects_slope():
    # y = 0.96 + 0.001·t
    series = [0.96 + 0.001 * t for t in range(100)]
    r = decompose(series)
    assert abs(r.trend_slope - 0.001) < 1e-6
    assert abs(r.trend_intercept - 0.96) < 1e-3


def test_p39_sinusoidal_series_detects_amplitude():
    # Period 24, amplitude 0.05; long enough series (≥ 2·period)
    series = [0.96 + 0.05 * math.cos(2 * math.pi * t / 24) for t in range(200)]
    r = decompose(series, period_steps=24)
    assert abs(r.seasonal_amplitude - 0.05) < 0.01


def test_p39_short_series_no_seasonal_fit():
    # n < 2·period → no sinusoid fit
    series = [0.96 + 0.05 * math.cos(2 * math.pi * t / 24) for t in range(20)]
    r = decompose(series, period_steps=24)
    # amplitude should be 0 because we skip sinusoid fit
    assert r.seasonal_amplitude == 0.0


def test_p39_trend_plus_seasonal():
    # Combine trend + seasonal
    series = [
        0.96 + 0.0005 * t + 0.03 * math.cos(2 * math.pi * t / 12)
        for t in range(100)
    ]
    r = decompose(series, period_steps=12)
    assert abs(r.trend_slope - 0.0005) < 1e-4
    assert abs(r.seasonal_amplitude - 0.03) < 0.005


def test_p39_residual_std_dev_small_for_clean_signal():
    series = [0.96 + 0.001 * t for t in range(100)]
    r = decompose(series, period_steps=24)
    # Pure trend, no noise → residual SD ≈ 0 after trend removal
    # (seasonal fit may introduce small artefact; tolerate 0.01)
    assert r.residual_std_dev < 0.01


def test_p39_series_lengths_match():
    series = [1.0 + t * 0.01 for t in range(50)]
    r = decompose(series, period_steps=10)
    assert len(r.trend_series) == 50
    assert len(r.seasonal_series) == 50
    assert len(r.residuals) == 50


def test_p39_schema_pin():
    r = decompose([1.0, 2.0, 3.0])
    assert r.schema_version == "urn:slotmath:rtp-decompose:v1"
