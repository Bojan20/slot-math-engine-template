"""PHASE 27 + 28 + 29 + 32 — Bayesian / DP / Drift / TypeSystem tests."""

from __future__ import annotations

import math
import random

import pytest


# ─── PHASE 27 — Bayesian Calibration ──────────────────────────────────────

from tools.bayes_calib import (
    BetaPosterior, NormalPosterior,
    update_beta_binomial, update_normal_normal,
    credible_interval_beta, credible_interval_normal,
)
from tools.bayes_calib.calibrator import _inverse_normal_cdf


def test_p27_beta_update_canonical():
    post = update_beta_binomial(BetaPosterior(1, 1), trials=10, successes=7)
    assert post.alpha == 8 and post.beta == 4


def test_p27_beta_mean_mode_variance():
    p = BetaPosterior(5, 3)
    assert p.mean == pytest.approx(5 / 8)
    assert p.mode == pytest.approx(4 / 6)
    assert p.variance > 0


def test_p27_beta_mode_none_when_flat():
    p = BetaPosterior(1, 1)
    assert p.mode is None


def test_p27_beta_validates():
    with pytest.raises(ValueError):
        update_beta_binomial(BetaPosterior(1, 1), trials=-1, successes=0)
    with pytest.raises(ValueError):
        update_beta_binomial(BetaPosterior(1, 1), trials=5, successes=10)
    with pytest.raises(ValueError):
        update_beta_binomial(BetaPosterior(0, 1), trials=5, successes=2)


def test_p27_normal_update_shrinks_variance():
    prior = NormalPosterior(mu=0.0, sigma_sq=1.0)
    post = update_normal_normal(prior, sample_mean=0.5, n=10, observation_variance=1.0)
    assert post.sigma_sq < prior.sigma_sq
    assert 0 < post.mu < 0.5


def test_p27_normal_update_validates():
    with pytest.raises(ValueError):
        update_normal_normal(NormalPosterior(0, 1), 0.5, n=0, observation_variance=1)
    with pytest.raises(ValueError):
        update_normal_normal(NormalPosterior(0, 1), 0.5, n=10, observation_variance=0)
    with pytest.raises(ValueError):
        update_normal_normal(NormalPosterior(0, 0), 0.5, n=10, observation_variance=1)


def test_p27_credible_interval_beta_unit_band():
    post = BetaPosterior(50, 50)
    lo, hi = credible_interval_beta(post, level=0.95)
    assert 0 <= lo < hi <= 1


def test_p27_credible_interval_normal_symmetric():
    post = NormalPosterior(mu=10.0, sigma_sq=4.0)
    lo, hi = credible_interval_normal(post, level=0.95)
    assert lo < 10.0 < hi
    # ≈ ±2σ = ±4 → CI width ≈ 8
    assert abs((hi - lo) - 2 * 1.959963984540054 * 2.0) < 0.01


def test_p27_credible_interval_rejects_bad_level():
    with pytest.raises(ValueError):
        credible_interval_beta(BetaPosterior(2, 2), level=1.5)
    with pytest.raises(ValueError):
        credible_interval_normal(NormalPosterior(0, 1), level=0.0)


def test_p27_inverse_normal_cdf_critical_values():
    # 97.5 % → ~1.959964
    assert _inverse_normal_cdf(0.975) == pytest.approx(1.959964, abs=1e-4)
    # 50 % → 0
    assert _inverse_normal_cdf(0.5) == pytest.approx(0.0, abs=1e-6)


# ─── PHASE 28 — DP telemetry ──────────────────────────────────────────────

from tools.dp_telemetry import (
    PrivacyBudget,
    PrivacyBudgetExhausted,
    laplace_mechanism,
    gaussian_mechanism,
)


def test_p28_laplace_validates():
    with pytest.raises(ValueError):
        laplace_mechanism(0.0, sensitivity=0, epsilon=1.0)
    with pytest.raises(ValueError):
        laplace_mechanism(0.0, sensitivity=1, epsilon=0)


def test_p28_laplace_noise_bounded_in_expectation():
    rng = random.Random(0)
    samples = [
        laplace_mechanism(100.0, sensitivity=1, epsilon=10, rng=rng)
        for _ in range(2000)
    ]
    mean = sum(samples) / len(samples)
    # Expected mean = true value; ε=10 → low noise
    assert abs(mean - 100.0) < 0.05


def test_p28_gaussian_validates():
    with pytest.raises(ValueError):
        gaussian_mechanism(0, sensitivity=1, epsilon=1, delta=0)
    with pytest.raises(ValueError):
        gaussian_mechanism(0, sensitivity=1, epsilon=1, delta=1)


def test_p28_gaussian_noise_low_for_large_eps():
    rng = random.Random(0)
    samples = [
        gaussian_mechanism(50, sensitivity=1, epsilon=10, delta=1e-5, rng=rng)
        for _ in range(1000)
    ]
    mean = sum(samples) / len(samples)
    assert abs(mean - 50.0) < 0.1


def test_p28_budget_charges_epsilon():
    b = PrivacyBudget(epsilon_cap=2.0, delta_cap=1e-3)
    laplace_mechanism(0, sensitivity=1, epsilon=0.5, budget=b)
    assert b.epsilon_spent == pytest.approx(0.5)
    laplace_mechanism(0, sensitivity=1, epsilon=0.5, budget=b)
    assert b.epsilon_spent == pytest.approx(1.0)
    assert len(b.query_log) == 2


def test_p28_budget_exhausted_raises():
    b = PrivacyBudget(epsilon_cap=1.0)
    laplace_mechanism(0, sensitivity=1, epsilon=0.6, budget=b)
    with pytest.raises(PrivacyBudgetExhausted):
        laplace_mechanism(0, sensitivity=1, epsilon=0.5, budget=b)


def test_p28_budget_remaining():
    b = PrivacyBudget(epsilon_cap=2.0)
    laplace_mechanism(0, sensitivity=1, epsilon=0.5, budget=b)
    assert b.remaining_epsilon == pytest.approx(1.5)


def test_p28_budget_validates():
    with pytest.raises(ValueError):
        PrivacyBudget(epsilon_cap=0)
    with pytest.raises(ValueError):
        PrivacyBudget(epsilon_cap=1, delta_cap=-1)


def test_p28_gaussian_with_budget_charges_delta():
    b = PrivacyBudget(epsilon_cap=2.0, delta_cap=1e-3)
    gaussian_mechanism(0, sensitivity=1, epsilon=1, delta=1e-4, budget=b)
    assert b.delta_spent == pytest.approx(1e-4)


# ─── PHASE 29 — Drift detectors ──────────────────────────────────────────

from tools.drift_detector import EWMA, CUSUM, PageHinkley


def test_p29_ewma_flat_no_alert():
    e = EWMA(target=0.96, sigma=0.01, lam=0.2, z=3.0)
    final = None
    for _ in range(50):
        final = e.update(0.96)
    assert final is not None
    assert not final.is_alerting


def test_p29_ewma_shift_alert():
    e = EWMA(target=0.96, sigma=0.01, lam=0.2, z=2.0)
    alerted = False
    for _ in range(100):
        sig = e.update(1.0)  # 4σ above target → must alert eventually
        if sig.is_alerting:
            alerted = True
            break
    assert alerted


def test_p29_ewma_validates():
    with pytest.raises(ValueError):
        EWMA(target=0, sigma=0, lam=0.2)
    with pytest.raises(ValueError):
        EWMA(target=0, sigma=1, lam=0)
    with pytest.raises(ValueError):
        EWMA(target=0, sigma=1, lam=0.2, z=0)


def test_p29_cusum_validates():
    with pytest.raises(ValueError):
        CUSUM(target=0, k=-1, h=1)
    with pytest.raises(ValueError):
        CUSUM(target=0, k=0, h=0)


def test_p29_cusum_shift_detects():
    c = CUSUM(target=0.0, k=0.005, h=0.5)
    alerted = False
    for _ in range(200):
        sig = c.update(0.1)
        if sig.is_alerting:
            alerted = True
            break
    assert alerted


def test_p29_cusum_reset_restores_zero():
    c = CUSUM(target=0.0, k=0.1, h=1.0)
    c.update(2.0)
    assert c.s_high > 0
    c.reset()
    assert c.s_high == 0.0


def test_p29_page_hinkley_validates():
    with pytest.raises(ValueError):
        PageHinkley(delta=-0.001)
    with pytest.raises(ValueError):
        PageHinkley(threshold=0)


def test_p29_page_hinkley_detects_step():
    """PH detects a step shift within the stream (constant offset
    won't trigger because running mean tracks it)."""
    ph = PageHinkley(delta=0.005, threshold=5.0)
    # Warm-up: 200 samples at 0
    for _ in range(200):
        ph.update(0.0)
    # Step shift to 1.0 → must trigger within bounded window
    alerted = False
    for _ in range(500):
        sig = ph.update(1.0)
        if sig.is_alerting:
            alerted = True
            break
    assert alerted


def test_p29_drift_signal_threshold_pair():
    e = EWMA(target=0.0, sigma=1.0)
    sig = e.update(0.0)
    assert sig.threshold_upper > sig.threshold_lower
    assert sig.n_observations == 1


# ─── PHASE 32 — Type System ───────────────────────────────────────────────

from tools.type_system import type_check_ir, TypeIssue, TypeReport


def _valid_ir() -> dict:
    return {
        "meta": {"name": "Valid", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 100, "scope": "line"},
        ],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 1}]
                    for _ in range(5)
                ]}
            ]
        },
        "features": [{"kind": "free_spins"}],
    }


def test_p32_valid_ir_passes():
    r = type_check_ir(_valid_ir())
    assert r.ok is True
    assert r.issues == []


def test_p32_root_not_dict():
    r = type_check_ir([])
    assert not r.ok
    assert any("root must be dict" in i.message for i in r.issues)


def test_p32_meta_missing():
    ir = _valid_ir()
    del ir["meta"]
    r = type_check_ir(ir)
    assert not r.ok
    assert any(i.path == "meta" for i in r.issues)


def test_p32_meta_target_rtp_out_of_range():
    ir = _valid_ir()
    ir["meta"]["target_rtp"] = 2.0
    r = type_check_ir(ir)
    assert any(i.path == "meta.target_rtp" and i.kind == "out_of_range"
                for i in r.issues)


def test_p32_topology_wrong_type():
    ir = _valid_ir()
    ir["topology"]["reels"] = "five"
    r = type_check_ir(ir)
    assert any(i.path == "topology.reels" and i.kind == "wrong_type"
                for i in r.issues)


def test_p32_paytable_not_list():
    ir = _valid_ir()
    ir["paytable"] = {}
    r = type_check_ir(ir)
    assert any(i.path == "paytable" for i in r.issues)


def test_p32_paytable_negative_pay():
    ir = _valid_ir()
    ir["paytable"][0]["pays"] = -10
    r = type_check_ir(ir)
    assert any("pays" in i.path and i.kind == "out_of_range"
                for i in r.issues)


def test_p32_paytable_bad_scope():
    ir = _valid_ir()
    ir["paytable"][0]["scope"] = "diagonal"
    r = type_check_ir(ir)
    assert any(i.kind == "enum" for i in r.issues)


def test_p32_reel_cell_zero_weight():
    ir = _valid_ir()
    ir["reels"]["base"][0]["reels"][0][0]["weight"] = 0
    r = type_check_ir(ir)
    assert any("weight" in i.path and i.kind == "out_of_range"
                for i in r.issues)


def test_p32_reel_cell_non_dict_non_str():
    ir = _valid_ir()
    ir["reels"]["base"][0]["reels"][0] = [123]
    r = type_check_ir(ir)
    assert any(i.kind == "wrong_type" for i in r.issues)


def test_p32_features_kind_missing():
    ir = _valid_ir()
    ir["features"] = [{}]
    r = type_check_ir(ir)
    assert any("kind" in i.path for i in r.issues)


def test_p32_features_not_list_when_present():
    ir = _valid_ir()
    ir["features"] = {"k": "v"}
    r = type_check_ir(ir)
    assert any(i.path == "features" for i in r.issues)


def test_p32_issue_dataclass_shape():
    r = type_check_ir({})
    for i in r.issues:
        assert isinstance(i, TypeIssue)
        assert isinstance(i.path, str)


def test_p32_report_schema():
    r = type_check_ir(_valid_ir())
    assert r.schema_version == "urn:slotmath:type-system:v1"
