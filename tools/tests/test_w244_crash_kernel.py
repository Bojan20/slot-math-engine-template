"""W244 wave 41 — crash_kernel acceptance tests.

Pins closed-form invariants for the Stake-style Crash game mechanic:
  * RTP is INDEPENDENT of player's cashout multiplier T (canonical
    property of Pareto-distributed crash points).
  * Variance grows linearly in T (high T = rare-big swings).
  * Crash CDF: house_edge mass at floor + Pareto tail.
  * Bracket / validation behavior.
"""
from __future__ import annotations

import pytest

from tools.math_dsl.crash_kernel import (
    CrashParams,
    crash_audit,
    expected_rounds_to_ruin,
    probability_of_crash_below,
    probability_of_win,
    rtp,
    variance_per_round,
)


# ─── RTP invariants ──────────────────────────────────────────────────────


def test_rtp_equals_one_minus_house_edge_for_any_cashout():
    """RTP must NOT depend on cashout T."""
    for t in (1.5, 2.0, 5.0, 10.0, 100.0):
        params = CrashParams(house_edge=0.01, cashout_multiplier=t)
        assert abs(rtp(params) - 0.99) < 1e-12, f"T={t} gave RTP {rtp(params)}"


def test_rtp_scales_with_house_edge():
    """RTP = 1 − house_edge for varying house_edge."""
    for he in (0.0, 0.005, 0.01, 0.05, 0.10):
        params = CrashParams(house_edge=he, cashout_multiplier=2.0)
        assert abs(rtp(params) - (1.0 - he)) < 1e-12


# ─── Win probability ────────────────────────────────────────────────────


def test_probability_of_win_at_double():
    # T=2, hE=0.01 → P(win) = 0.99/2 = 0.495
    p = CrashParams(house_edge=0.01, cashout_multiplier=2.0)
    assert abs(probability_of_win(p) - 0.495) < 1e-12


def test_probability_of_win_drops_with_higher_target():
    # Higher T → lower P(win)
    p_low = CrashParams(house_edge=0.01, cashout_multiplier=2.0)
    p_hi = CrashParams(house_edge=0.01, cashout_multiplier=10.0)
    assert probability_of_win(p_low) > probability_of_win(p_hi)


# ─── Variance ───────────────────────────────────────────────────────────


def test_variance_grows_with_cashout():
    """Var should be monotonically increasing in T for fixed hE."""
    p_low = CrashParams(house_edge=0.01, cashout_multiplier=2.0)
    p_hi = CrashParams(house_edge=0.01, cashout_multiplier=10.0)
    assert variance_per_round(p_hi) > variance_per_round(p_low)


def test_variance_formula_matches_closed_form():
    # Var = (1 - hE) × (T - (1 - hE))
    p = CrashParams(house_edge=0.01, cashout_multiplier=5.0)
    expected = 0.99 * (5.0 - 0.99)
    assert abs(variance_per_round(p) - expected) < 1e-12


# ─── Crash CDF ──────────────────────────────────────────────────────────


def test_cdf_at_one_equals_house_edge():
    # P(C < 1.0) only includes instant-crash mass at floor → house_edge.
    # P(C <= 1.0) = house_edge (covered by m == 1.0 branch).
    assert abs(probability_of_crash_below(0.01, 1.0) - 0.01) < 1e-12


def test_cdf_grows_with_multiplier():
    cdf_2 = probability_of_crash_below(0.01, 2.0)
    cdf_10 = probability_of_crash_below(0.01, 10.0)
    # Higher m → more crash mass below.
    assert cdf_10 > cdf_2
    # Pareto sanity: as m → ∞, CDF → 1.
    assert probability_of_crash_below(0.01, 1e9) > 0.9999


def test_cdf_pareto_formula():
    # P(C < 2) = hE + (1 - hE) × (1 - 1/2) = 0.01 + 0.495 = 0.505
    assert abs(probability_of_crash_below(0.01, 2.0) - 0.505) < 1e-12


# ─── Ruin estimate ──────────────────────────────────────────────────────


def test_expected_rounds_to_ruin_inverse_of_edge():
    # bankroll 100 × bet, edge 0.01 → 100 / 0.01 = 10000 rounds
    p = CrashParams(house_edge=0.01, cashout_multiplier=2.0)
    assert abs(expected_rounds_to_ruin(p, 100.0) - 10000.0) < 1e-9


def test_expected_rounds_to_ruin_infinite_for_fair_game():
    p = CrashParams(house_edge=0.0, cashout_multiplier=2.0)
    assert expected_rounds_to_ruin(p, 100.0) == float("inf")


# ─── Strategy classification ────────────────────────────────────────────


def test_audit_strategy_class_conservative():
    p = CrashParams(house_edge=0.01, cashout_multiplier=1.2)
    audit = crash_audit(p)
    assert audit["strategy_class"] == "conservative"


def test_audit_strategy_class_moderate():
    p = CrashParams(house_edge=0.01, cashout_multiplier=3.0)
    audit = crash_audit(p)
    assert audit["strategy_class"] == "moderate"


def test_audit_strategy_class_aggressive():
    p = CrashParams(house_edge=0.01, cashout_multiplier=20.0)
    audit = crash_audit(p)
    assert audit["strategy_class"] == "aggressive"


# ─── Validation ─────────────────────────────────────────────────────────


def test_validate_rejects_house_edge_outside_range():
    with pytest.raises(ValueError):
        CrashParams(house_edge=-0.01, cashout_multiplier=2.0)
    with pytest.raises(ValueError):
        CrashParams(house_edge=1.0, cashout_multiplier=2.0)


def test_validate_rejects_cashout_below_one():
    with pytest.raises(ValueError):
        CrashParams(house_edge=0.01, cashout_multiplier=0.5)
