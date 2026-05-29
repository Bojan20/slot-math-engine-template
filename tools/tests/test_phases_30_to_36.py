"""PHASE 30 + 31 + 33 + 34 + 35 + 36 — combined regression."""

from __future__ import annotations


import pytest


# ─── PHASE 30 — Hybrid GA+Annealing ──────────────────────────────────────

from tools.hybrid_opt import HybridConfig, HybridResult, hybrid_optimize


def test_p30_config_validates():
    with pytest.raises(ValueError):
        HybridConfig(population_size=3)
    with pytest.raises(ValueError):
        HybridConfig(elite_count=0)
    with pytest.raises(ValueError):
        HybridConfig(generations=0)
    with pytest.raises(ValueError):
        HybridConfig(mutation_sigma=0)


def test_p30_optimize_minimises_quadratic_1d():
    res = hybrid_optimize(
        lambda x: (x[0] - 0.5) ** 2,
        bounds=[(0.0, 1.0)],
        config=HybridConfig(
            population_size=10, elite_count=2,
            generations=10, anneal_iterations_per_elite=20,
            seed=42,
        ),
    )
    assert isinstance(res, HybridResult)
    assert abs(res.best_x[0] - 0.5) < 0.1
    assert res.best_cost < 0.05


def test_p30_optimize_2d():
    res = hybrid_optimize(
        lambda v: (v[0] - 0.3) ** 2 + (v[1] + 0.4) ** 2,
        bounds=[(-1, 1), (-1, 1)],
        config=HybridConfig(
            population_size=12, elite_count=3,
            generations=15, anneal_iterations_per_elite=30,
            seed=7,
        ),
    )
    assert abs(res.best_x[0] - 0.3) < 0.15
    assert abs(res.best_x[1] + 0.4) < 0.15


def test_p30_empty_bounds_rejected():
    with pytest.raises(ValueError):
        hybrid_optimize(lambda x: 0.0, bounds=[])


def test_p30_cost_trace_length_matches_generations():
    res = hybrid_optimize(
        lambda x: x[0] ** 2,
        bounds=[(-1, 1)],
        config=HybridConfig(generations=5, seed=1),
    )
    assert len(res.cost_trace_per_generation) == 5


def test_p30_seed_deterministic():
    cfg = HybridConfig(
        population_size=8, elite_count=2, generations=5,
        anneal_iterations_per_elite=10, seed=99,
    )
    r1 = hybrid_optimize(lambda x: x[0] ** 2, bounds=[(-1, 1)], config=cfg)
    r2 = hybrid_optimize(lambda x: x[0] ** 2, bounds=[(-1, 1)], config=cfg)
    assert r1.best_x == r2.best_x


# ─── PHASE 31 — LTV Forecaster ───────────────────────────────────────────

from tools.ltv_forecast import (
    LTVInputs, forecast_closed_form, simulate_ltv_cohort,
)


def test_p31_inputs_validation():
    with pytest.raises(ValueError):
        LTVInputs(avg_deposit_per_session=-1, retention=0.5, house_take_rate=0.05)
    with pytest.raises(ValueError):
        LTVInputs(avg_deposit_per_session=10, retention=1.1, house_take_rate=0.05)
    with pytest.raises(ValueError):
        LTVInputs(avg_deposit_per_session=10, retention=0.8, house_take_rate=1.5)
    with pytest.raises(ValueError):
        LTVInputs(avg_deposit_per_session=10, retention=0.8,
                   house_take_rate=0.05, horizon_sessions=0)


def test_p31_infinite_horizon_formula():
    inp = LTVInputs(avg_deposit_per_session=100, retention=0.8,
                     house_take_rate=0.05)
    r = forecast_closed_form(inp)
    # session_sum = 1 / (1 - 0.8) = 5; LTV = 100 * 5 * 0.05 = 25
    assert r.closed_form_ltv == pytest.approx(25.0)
    assert r.horizon_used == "infinite"


def test_p31_finite_horizon_formula():
    inp = LTVInputs(100, 0.5, 0.04, horizon_sessions=3)
    r = forecast_closed_form(inp)
    # sum = (1 - 0.5^4) / 0.5 = 1.875; LTV = 100 * 1.875 * 0.04 = 7.5
    assert r.closed_form_ltv == pytest.approx(7.5, abs=1e-6)
    assert r.horizon_used == "H=3"


def test_p31_zero_retention_collapses_to_one_session():
    inp = LTVInputs(100, 0.0, 0.05)
    r = forecast_closed_form(inp)
    assert r.expected_sessions == pytest.approx(1.0)
    assert r.closed_form_ltv == pytest.approx(5.0)


def test_p31_simulate_cohort_converges():
    inp = LTVInputs(100, 0.7, 0.05)
    avg = simulate_ltv_cohort(inp, n_players=5000, seed=42)
    expected = forecast_closed_form(inp).closed_form_ltv
    # within 10 % of closed-form for 5000 players
    assert abs(avg - expected) / expected < 0.10


def test_p31_simulate_validates():
    with pytest.raises(ValueError):
        simulate_ltv_cohort(LTVInputs(100, 0.5, 0.05), n_players=0)


def test_p31_result_schema():
    r = forecast_closed_form(LTVInputs(10, 0.5, 0.05))
    assert r.schema_version == "urn:slotmath:ltv-forecast:v1"


# ─── PHASE 33 — Vendor Translator ────────────────────────────────────────

from tools.vendor_translator import (
    translate_ir, list_supported_vendors,
)


def test_p33_list_vendors():
    vendors = list_supported_vendors()
    assert "vendor_a" in vendors
    assert "vendor_b" in vendors


def test_p33_unknown_vendor_raises():
    with pytest.raises(ValueError):
        translate_ir({}, from_vendor="nonexistent")


def test_p33_two_vendor_hop_rejected():
    with pytest.raises(ValueError):
        translate_ir({}, from_vendor="vendor_a", to_vendor="vendor_b")


def test_p33_vendor_a_to_universal_renames():
    vendor_ir = {
        "rtpTarget": 0.96,
        "reelsCount": 5,
        "rowsCount": 3,
        "features": [{"kind": "FreeSpinsBonus"}],
    }
    out, report = translate_ir(vendor_ir, from_vendor="vendor_a",
                                 to_vendor="universal")
    assert "target_rtp" in out
    assert "reels" in out
    assert "rows" in out
    assert out["features"][0]["kind"] == "free_spins"
    assert report.fields_renamed >= 3
    assert report.enums_remapped >= 1


def test_p33_universal_to_vendor_inverts():
    universal = {"target_rtp": 0.96, "reels": 5,
                  "features": [{"kind": "free_spins"}]}
    out, report = translate_ir(universal, from_vendor="universal",
                                 to_vendor="vendor_a")
    assert "rtpTarget" in out
    assert "reelsCount" in out
    assert out["features"][0]["kind"] == "FreeSpinsBonus"


def test_p33_round_trip_preserves_shape():
    universal = {
        "target_rtp": 0.96, "reels": 5, "rows": 3,
        "features": [{"kind": "free_spins"}],
        "paytable": [{"combo": ["A"] * 5, "pays": 100, "scope": "line"}],
    }
    vendor, _ = translate_ir(universal, from_vendor="universal",
                              to_vendor="vendor_a")
    back, _ = translate_ir(vendor, from_vendor="vendor_a",
                            to_vendor="universal")
    assert back["target_rtp"] == universal["target_rtp"]
    assert back["features"][0]["kind"] == "free_spins"


def test_p33_report_schema():
    out, report = translate_ir(
        {"rtpTarget": 0.9}, from_vendor="vendor_a", to_vendor="universal",
    )
    assert report.schema_version == "urn:slotmath:vendor-translator:v1"


def test_p33_paytable_scope_remapped():
    ir = {"paytable": [{"combo": ["A"], "pays": 1, "scope": "PER_LINE"}]}
    out, _ = translate_ir(ir, from_vendor="vendor_a", to_vendor="universal")
    assert out["paytable"][0]["scope"] == "line"


# ─── PHASE 34 — Cert XML v3 ───────────────────────────────────────────────

from tools.cert_xml_v3 import emit_cert_xml_v3, validate_cert_xml_v3
from tools.cert_xml_v3.emitter import CertV3Input, _REQUIRED_SECTIONS


def _cert_v3_input() -> CertV3Input:
    return CertV3Input(
        game_id="GAME-001", swid="001",
        target_rtp=0.96, measured_rtp=0.9601,
        reels=5, rows=3,
        par_merkle_root_hex="ab" * 32,
        theorem_prover_cert_hashes=["c" * 64],
        federated_audit_transcript_hash="d" * 64,
        dp_export_log=[("session_count", 0.5, 1e-5)],
        type_check_passed=True,
        jurisdictions=["UKGC", "MGA"],
        notes=["test note"],
    )


def test_p34_emit_xml_contains_namespace():
    xml = emit_cert_xml_v3(_cert_v3_input())
    assert "urn:slotmath:cert:v3" in xml
    assert "<?xml" in xml


def test_p34_emit_xml_validates_clean():
    xml = emit_cert_xml_v3(_cert_v3_input())
    report = validate_cert_xml_v3(xml)
    assert report.passed is True
    assert report.issues == []


def test_p34_all_required_sections_present():
    xml = emit_cert_xml_v3(_cert_v3_input())
    report = validate_cert_xml_v3(xml)
    assert set(_REQUIRED_SECTIONS) <= set(report.sections_found)


def test_p34_parse_error_caught():
    report = validate_cert_xml_v3("<bad>not closed")
    assert report.passed is False
    assert any("parse_error" in i for i in report.issues)


def test_p34_missing_section_detected():
    xml = "<CertV3 xmlns='urn:slotmath:cert:v3'><Meta/></CertV3>"
    report = validate_cert_xml_v3(xml)
    assert report.passed is False
    assert any("Topology" in i for i in report.issues)


def test_p34_dp_export_log_serialised():
    xml = emit_cert_xml_v3(_cert_v3_input())
    assert "session_count" in xml
    assert "epsilon" in xml


def test_p34_theorem_cert_hashes_emitted():
    xml = emit_cert_xml_v3(_cert_v3_input())
    assert "c" * 64 in xml


# ─── PHASE 35 — Volatility Classifier ────────────────────────────────────

from tools.vol_class_auto import classify_volatility


def test_p35_empty_input_low():
    r = classify_volatility([])
    assert r.label == "low"
    assert r.sample_size == 0


def test_p35_flat_payouts_low_cv():
    r = classify_volatility([10.0] * 100)
    assert r.label == "low"
    assert r.coefficient_of_variation == 0.0


def test_p35_mild_variance_low():
    payouts = [10.0, 11.0, 9.0, 10.5, 9.5] * 20
    r = classify_volatility(payouts)
    assert r.label == "low"
    assert r.coefficient_of_variation < 1.5


def test_p35_high_variance_high():
    # CV = sd/mean; jackpot-heavy payouts
    payouts = [0.0] * 95 + [1000.0] * 5
    r = classify_volatility(payouts)
    assert r.label in ("high", "ultra")
    assert r.coefficient_of_variation > 4.0


def test_p35_ultra_extreme():
    payouts = [0.0] * 999 + [100000.0]
    r = classify_volatility(payouts)
    assert r.label == "ultra"
    assert r.coefficient_of_variation > 10.0


def test_p35_mean_zero_returns_low():
    r = classify_volatility([0.0] * 50)
    assert r.label == "low"
    assert r.coefficient_of_variation == 0.0


def test_p35_report_schema():
    r = classify_volatility([1.0, 2.0, 3.0])
    assert r.schema_version == "urn:slotmath:vol-class:v1"
    assert r.sample_size == 3


# ─── PHASE 36 — Auto-Compliance Doc Generator ────────────────────────────

from tools.auto_compliance import (
    ComplianceInputs, emit_compliance_doc, SUPPORTED_JURISDICTIONS,
)


def _ci(jur: str) -> ComplianceInputs:
    return ComplianceInputs(
        game_id="GAME-001", swid="001",
        target_rtp=0.96, measured_rtp=0.9601,
        volatility_label="high", max_win_x=5000,
        jurisdiction=jur,
        theorem_cert_hashes=["a" * 64],
        risk_engine_summary={"policy": "ukgc_default"},
        drift_state_summary="no_drift_detected",
    )


def test_p36_supported_jurisdictions_count():
    assert len(SUPPORTED_JURISDICTIONS) == 5


def test_p36_unsupported_jurisdiction_raises():
    with pytest.raises(ValueError):
        emit_compliance_doc(_ci("NEVER_HEARD_OF_IT"))


@pytest.mark.parametrize("jur", SUPPORTED_JURISDICTIONS)
def test_p36_each_jurisdiction_emits_doc(jur: str):
    md = emit_compliance_doc(_ci(jur))
    assert f"# Compliance Disclosure — {jur}" in md
    assert "## Per-rule disclosure" in md
    assert "GAME-001" in md


def test_p36_theorem_cert_hashes_section():
    md = emit_compliance_doc(_ci("UKGC"))
    assert "Theorem-prover certificate hashes" in md
    assert "a" * 64 in md


def test_p36_ukgc_rules_count():
    md = emit_compliance_doc(_ci("UKGC"))
    assert "UKGC RTS 7.4 §a" in md
    assert "UKGC RTS-12 §a" in md


def test_p36_eu_ga_low_rtp_warns():
    inp = _ci("EU-GA-2024")
    inp.measured_rtp = 0.5
    md = emit_compliance_doc(inp)
    assert "WARN" in md
