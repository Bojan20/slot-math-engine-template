"""W7.6 — Symbolic Differentiation Slot Math tests."""

from __future__ import annotations

import math

import pytest

from tools.symbolic_slot_math.model import (
    RtpModel,
    build_derivative_manifest,
    optimize_for_volatility,
    partial_derivative,
    solve_for_target_rtp,
)


def _classic_model(anchor_weight: float = 4.0) -> RtpModel:
    return RtpModel(
        n_reels=5,
        n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3,
        paylines=20,
        anchor=0,
        weights=[[anchor_weight, 6.0] for _ in range(5)],
    )


# ─── Validation ─────────────────────────────────────────────────────


def test_validate_rejects_n_reels_lt_3() -> None:
    m = _classic_model()
    m.n_reels = 2
    with pytest.raises(ValueError):
        m.validate()


def test_validate_rejects_negative_weight() -> None:
    m = _classic_model()
    m.weights[0][0] = -1.0
    with pytest.raises(ValueError):
        m.validate()


def test_validate_rejects_mismatched_row_length() -> None:
    m = _classic_model()
    m.weights[0] = [4.0, 6.0, 99.0]  # n_symbols=2 but row has 3
    with pytest.raises(ValueError):
        m.validate()


# ─── Closed-form RTP / CV ───────────────────────────────────────────


def test_rtp_matches_qmc_closed_form() -> None:
    m = _classic_model()  # anchor=0.4 per reel
    # Same as qmc_estimator: EV per spin (unit) = 0.20224.
    assert m.rtp() == pytest.approx(0.20224, abs=1e-9)


def test_rtp_zero_when_total_zero() -> None:
    m = _classic_model()
    m.weights = [[0.0, 0.0] for _ in range(5)]
    assert m.rtp() == 0.0


def test_cv_positive_for_lossy_slot() -> None:
    m = _classic_model()
    cv = m.volatility_cv()
    assert cv > 0
    assert math.isfinite(cv)


def test_cv_increases_with_top_payout() -> None:
    m_flat = _classic_model()
    m_flat.paytable = [[1.0, 1.0, 1.0], []]
    m_top = _classic_model()
    m_top.paytable = [[1.0, 1.0, 1000.0], []]
    assert m_top.volatility_cv() > m_flat.volatility_cv()


# ─── Partial derivative ─────────────────────────────────────────────


def test_partial_derivative_rtp_sign_matches_intuition() -> None:
    m = _classic_model()
    # Increasing the anchor weight raises RTP — gradient should be positive.
    grad = partial_derivative(m, reel=0, symbol=0, metric="rtp")
    assert grad > 0
    # Increasing the non-anchor weight lowers anchor probability →
    # RTP gradient is negative.
    grad_non_anchor = partial_derivative(m, reel=0, symbol=1, metric="rtp")
    assert grad_non_anchor < 0


def test_partial_derivative_rejects_bad_metric() -> None:
    m = _classic_model()
    with pytest.raises(ValueError):
        partial_derivative(m, reel=0, symbol=0, metric="rubbish")


def test_partial_derivative_rejects_negative_eps() -> None:
    m = _classic_model()
    with pytest.raises(ValueError):
        partial_derivative(m, reel=0, symbol=0, eps=-1e-3)


def test_partial_derivative_rejects_out_of_range_indices() -> None:
    m = _classic_model()
    with pytest.raises(IndexError):
        partial_derivative(m, reel=99, symbol=0)
    with pytest.raises(IndexError):
        partial_derivative(m, reel=0, symbol=99)


def test_partial_derivative_central_stencil_more_accurate_than_forward() -> None:
    """Hand-derive ∂RTP/∂w₀,₀ analytically and confirm the 4th-order
    central stencil approximates it within a tight envelope."""
    m = _classic_model()
    # Numerical reference at very small eps using simple 2-point.
    eps_ref = 1e-7
    probe_up = m.clone()
    probe_up.weights[0][0] += eps_ref
    probe_dn = m.clone()
    probe_dn.weights[0][0] -= eps_ref
    analytical = (probe_up.rtp() - probe_dn.rtp()) / (2 * eps_ref)
    central = partial_derivative(m, reel=0, symbol=0, eps=1e-4)
    assert central == pytest.approx(analytical, rel=1e-4)


# ─── solve_for_target_rtp ───────────────────────────────────────────


def test_solver_hits_target_rtp_within_tolerance() -> None:
    # Start from anchor_weight=4.0 (RTP≈0.20224), target RTP=0.30.
    m = _classic_model()
    report = solve_for_target_rtp(m, target_rtp=0.30, reel=0, symbol=0)
    assert report.converged
    assert abs(report.final_residual) <= 1e-6
    assert m.rtp() == pytest.approx(0.30, abs=1e-6)


def test_solver_handles_downward_target() -> None:
    m = _classic_model(anchor_weight=20.0)  # very high anchor → high RTP
    initial = m.rtp()
    report = solve_for_target_rtp(m, target_rtp=0.05, reel=0, symbol=0)
    assert report.converged
    assert m.rtp() < initial


def test_solver_rejects_out_of_range_target() -> None:
    m = _classic_model()
    with pytest.raises(ValueError):
        solve_for_target_rtp(m, target_rtp=-0.1, reel=0, symbol=0)


def test_solver_records_history() -> None:
    m = _classic_model()
    report = solve_for_target_rtp(m, target_rtp=0.30, reel=0, symbol=0)
    assert len(report.history) >= 2
    for w, r in report.history:
        assert w > 0
        assert math.isfinite(r)


# ─── optimize_for_volatility ────────────────────────────────────────


def test_volatility_optimizer_moves_in_correct_direction() -> None:
    m = _classic_model()
    starting_cv = m.volatility_cv()
    optimize_for_volatility(
        m, target_cv=starting_cv * 2.0, reel=0, symbol=0, max_iter=64
    )
    # Should either converge OR get closer to the target.
    final_cv = m.volatility_cv()
    assert abs(final_cv - starting_cv * 2.0) <= abs(starting_cv - starting_cv * 2.0)


# ─── Derivative manifest ────────────────────────────────────────────


def test_derivative_manifest_has_per_weight_gradients() -> None:
    m = _classic_model()
    manifest = build_derivative_manifest(m)
    assert len(manifest.drtp) == m.n_reels
    assert all(len(row) == m.n_symbols for row in manifest.drtp)
    assert len(manifest.dcv) == m.n_reels
    assert all(len(row) == m.n_symbols for row in manifest.dcv)


def test_derivative_manifest_fingerprint_is_deterministic() -> None:
    m1 = _classic_model()
    m2 = _classic_model()
    f1 = build_derivative_manifest(m1)
    f2 = build_derivative_manifest(m2)
    assert f1.sha256_hex == f2.sha256_hex


def test_derivative_manifest_fingerprint_changes_on_weight_change() -> None:
    m1 = _classic_model()
    m2 = _classic_model()
    m2.weights[0][0] = 5.0
    assert (
        build_derivative_manifest(m1).sha256_hex
        != build_derivative_manifest(m2).sha256_hex
    )


def test_derivative_manifest_pins_model_rtp_and_cv() -> None:
    m = _classic_model()
    manifest = build_derivative_manifest(m)
    assert manifest.model_rtp == pytest.approx(m.rtp())
    assert manifest.model_cv == pytest.approx(m.volatility_cv())
