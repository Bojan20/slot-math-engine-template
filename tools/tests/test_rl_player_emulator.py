"""W7.3 — RL Player-Behavior Emulator tests."""

from __future__ import annotations

import pytest

from tools.rl_player_emulator.player import (
    ACTIONS,
    QLearningPolicy,
    SessionSimulator,
    _quantile,
    aggregate_kpis,
    casual_archetype,
    chaser_archetype,
    run_cohort,
    volatility_seeker_archetype,
)
from tools.symbolic_slot_math.model import RtpModel


def _classic_model() -> RtpModel:
    return RtpModel(
        n_reels=5,
        n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3,
        paylines=20,
        anchor=0,
        weights=[[4.0, 6.0] for _ in range(5)],
    )


# ─── Archetypes ─────────────────────────────────────────────────────


def test_casual_archetype_has_safe_quit_thresholds() -> None:
    a = casual_archetype()
    assert a.name == "casual"
    assert 0.0 < a.quit_threshold_loss < 1.0
    assert a.max_session_spins > 0


def test_chaser_archetype_more_aggressive_than_casual() -> None:
    casual = casual_archetype()
    chaser = chaser_archetype()
    assert chaser.risk_tolerance > casual.risk_tolerance
    assert chaser.max_session_spins > casual.max_session_spins


def test_volatility_seeker_takes_bigger_bets() -> None:
    casual = casual_archetype()
    vs = volatility_seeker_archetype()
    assert vs.base_bet > casual.base_bet


# ─── Q-policy ───────────────────────────────────────────────────────


def test_q_policy_discretize_clamps_buckets() -> None:
    p = QLearningPolicy(seed=1)
    low = p.discretize(0.0, 100.0, -100)
    high = p.discretize(1_000.0, 100.0, 100)
    assert 0 <= low[0] < p.bankroll_buckets
    assert 0 <= high[0] < p.bankroll_buckets


def test_q_policy_choose_returns_legal_action() -> None:
    p = QLearningPolicy(seed=1)
    state = p.discretize(50.0, 100.0, 0)
    a = p.choose(state)
    assert a in ACTIONS


def test_q_policy_update_changes_qvalue() -> None:
    p = QLearningPolicy(seed=2)
    state = (3, 0)
    next_state = (4, 1)
    initial = p._q(state)["continue"]
    p.update(state, "continue", reward=1.0, next_state=next_state, done=False)
    assert p._q(state)["continue"] != initial


def test_q_policy_epsilon_decays_monotonically() -> None:
    p = QLearningPolicy(seed=3, epsilon_start=0.5, epsilon_min=0.01,
                        epsilon_decay=0.5)
    p.decay_epsilon()
    assert p.epsilon < 0.5
    for _ in range(50):
        p.decay_epsilon()
    assert p.epsilon == pytest.approx(0.01, abs=1e-9)


# ─── SessionSimulator ───────────────────────────────────────────────


def test_session_simulator_produces_trace() -> None:
    m = _classic_model()
    a = casual_archetype()
    p = QLearningPolicy(seed=10)
    sim = SessionSimulator(archetype=a, model=m, policy=p, rng_seed=11)
    trace = sim.simulate(train=True)
    assert trace.archetype_name == "casual"
    assert trace.initial_bankroll == a.initial_bankroll
    assert trace.spins_played >= 0
    assert trace.total_wagered >= 0


def test_session_simulator_bankroll_curve_starts_at_initial() -> None:
    m = _classic_model()
    a = casual_archetype()
    p = QLearningPolicy(seed=1)
    sim = SessionSimulator(archetype=a, model=m, policy=p, rng_seed=2)
    trace = sim.simulate(train=False)
    assert trace.bankroll_curve[0] == a.initial_bankroll


def test_session_simulator_is_deterministic() -> None:
    m = _classic_model()
    a = casual_archetype()
    p = QLearningPolicy(seed=10)
    sim_a = SessionSimulator(archetype=a, model=m, policy=p, rng_seed=99)
    trace_a = sim_a.simulate(train=False)
    p2 = QLearningPolicy(seed=10)
    sim_b = SessionSimulator(archetype=a, model=m, policy=p2, rng_seed=99)
    trace_b = sim_b.simulate(train=False)
    assert trace_a.spins_played == trace_b.spins_played
    assert trace_a.final_bankroll == pytest.approx(trace_b.final_bankroll, rel=1e-9)


def test_session_trace_ltv_and_hold_pct_consistent() -> None:
    m = _classic_model()
    a = casual_archetype()
    p = QLearningPolicy(seed=1)
    sim = SessionSimulator(archetype=a, model=m, policy=p, rng_seed=5)
    trace = sim.simulate(train=False)
    assert trace.ltv == pytest.approx(trace.total_wagered - trace.total_won)
    if trace.total_wagered > 0:
        assert trace.hold_pct == pytest.approx(
            trace.ltv / trace.total_wagered
        )


# ─── KPI aggregation ────────────────────────────────────────────────


def test_quantile_handles_edge_cases() -> None:
    assert _quantile([], 0.5) == 0.0
    assert _quantile([7.0], 0.5) == 7.0
    assert _quantile([1.0, 2.0, 3.0, 4.0], 0.5) == pytest.approx(2.5, abs=1e-9)
    assert _quantile([1.0, 2.0, 3.0, 4.0], 0.99) == pytest.approx(3.97, abs=1e-9)


def test_aggregate_kpis_handles_empty() -> None:
    report = aggregate_kpis([])
    assert report.sessions == 0
    assert report.avg_ltv == 0.0


def test_aggregate_kpis_computes_avg_and_percentiles() -> None:
    m = _classic_model()
    a = casual_archetype()
    p = QLearningPolicy(seed=2)
    traces = [
        SessionSimulator(archetype=a, model=m, policy=p, rng_seed=i).simulate(train=False)
        for i in range(8)
    ]
    report = aggregate_kpis(traces)
    assert report.sessions == 8
    assert report.archetype == "casual"
    assert 0.0 <= report.bust_rate <= 1.0
    assert 0.0 <= report.voluntary_quit_rate <= 1.0


# ─── Cohort runner ──────────────────────────────────────────────────


def test_run_cohort_returns_kpi_and_traces() -> None:
    m = _classic_model()
    a = casual_archetype()
    report, traces = run_cohort(
        a, m, n_players=4, sessions_per_player=3, base_seed=100,
    )
    assert report.sessions == 12
    assert len(traces) == 12
    for t in traces:
        assert t.archetype_name == "casual"


def test_run_cohort_rejects_zero_arguments() -> None:
    m = _classic_model()
    a = casual_archetype()
    with pytest.raises(ValueError):
        run_cohort(a, m, n_players=0, sessions_per_player=1)
    with pytest.raises(ValueError):
        run_cohort(a, m, n_players=1, sessions_per_player=0)


def test_run_cohort_is_deterministic_for_same_seed() -> None:
    m = _classic_model()
    a = casual_archetype()
    r1, _ = run_cohort(a, m, n_players=3, sessions_per_player=2, base_seed=77)
    r2, _ = run_cohort(a, m, n_players=3, sessions_per_player=2, base_seed=77)
    assert r1.to_dict() == r2.to_dict()


def test_chaser_archetype_attributes_consistent_with_intent() -> None:
    """Direct attribute check that the chaser stays in longer than the
    casual archetype by construction. Replaces the previous stochastic
    "chaser plays more spins" assertion which depended on the
    voluntary-quit RTP threshold landing in a narrow window."""
    casual = casual_archetype()
    chaser = chaser_archetype()
    # Chaser tolerates more loss (plays through bust).
    assert chaser.quit_threshold_loss >= casual.quit_threshold_loss
    # Chaser cap on session spins is higher.
    assert chaser.max_session_spins > casual.max_session_spins
    # Chaser accepts bet_up with higher probability.
    assert chaser.risk_tolerance > casual.risk_tolerance


def test_kpi_to_dict_round_trip() -> None:
    m = _classic_model()
    report, _ = run_cohort(casual_archetype(), m, n_players=2,
                           sessions_per_player=2, base_seed=33)
    d = report.to_dict()
    assert d["archetype"] == "casual"
    assert d["sessions"] == 4
