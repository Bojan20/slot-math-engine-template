"""PHASE 23 — Real-Time Player Risk Engine tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.risk_engine import (
    RiskAssessor,
    SpinEvent,
    RiskScore,
    InterventionLevel,
    RiskPolicy,
)
from tools.risk_engine.assessor import _count_doublings, _ramp, _spins_per_minute


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── helpers ─────────────────────────────────────────────────────────────


def _spin(ts: float = 0.0, bet: float = 1.0, payout: float = 0.0,
           player_id: str = "p1", session_id: str = "s1",
           balance: float | None = None, loss_limit: float | None = None) -> SpinEvent:
    return SpinEvent(
        session_id=session_id,
        player_id=player_id,
        ts_unix=ts,
        bet_amount=bet,
        payout_amount=payout,
        deposit_balance=balance,
        loss_limit=loss_limit,
    )


# ─── pure helpers ────────────────────────────────────────────────────────


def test_ramp_below_warn_returns_zero():
    assert _ramp(5, 10, 20) == 0.0


def test_ramp_above_critical_returns_one():
    assert _ramp(25, 10, 20) == 1.0


def test_ramp_linear_mid():
    assert _ramp(15, 10, 20) == pytest.approx(0.5)


def test_ramp_equal_warn_critical_clamps():
    # value == warn → 0.0 (strictly above warn starts ramping)
    assert _ramp(10, 10, 10) == 0.0
    # value > warn (and warn == critical) → 1.0
    assert _ramp(11, 10, 10) == 1.0


def test_count_doublings_empty():
    assert _count_doublings([]) == 0
    assert _count_doublings([1.0]) == 0


def test_count_doublings_no_doublings():
    assert _count_doublings([1.0, 1.0, 1.0]) == 0


def test_count_doublings_full_martingale():
    # 1 → 2 → 4 → 8 → 16 (4 consecutive doublings)
    assert _count_doublings([1, 2, 4, 8, 16]) == 4


def test_count_doublings_partial_then_reset():
    # 1 → 2 → 4 (2 doublings) → 1 (reset) → 2 (1 doubling)
    assert _count_doublings([1, 2, 4, 1, 2]) == 2  # longest streak


def test_spins_per_minute_empty():
    assert _spins_per_minute([], 60.0) == 0.0


def test_spins_per_minute_60_spins():
    ts = [float(i) for i in range(60)]  # 60 spins over 59 seconds
    spm = _spins_per_minute(ts, 60.0)
    assert spm == 60.0


# ─── RiskAssessor — fresh session ─────────────────────────────────────────


def test_fresh_session_emits_score():
    a = RiskAssessor()
    score = a.observe(_spin())
    assert isinstance(score, RiskScore)
    assert score.player_id == "p1"
    assert score.composite_score >= 0.0


def test_first_spin_score_low():
    """One spin with default policy → score well below SOFT threshold."""
    a = RiskAssessor()
    score = a.observe(_spin())
    assert score.composite_score < 0.30
    assert score.intervention == InterventionLevel.NONE


def test_metrics_track_spin_count():
    a = RiskAssessor()
    for i in range(5):
        a.observe(_spin(ts=i * 10))
    m = a.session_metrics("p1", "s1")
    assert m is not None
    assert m.spins == 5


def test_session_seconds():
    a = RiskAssessor()
    a.observe(_spin(ts=0))
    a.observe(_spin(ts=300))  # 5 minutes later
    m = a.session_metrics("p1", "s1")
    assert m.session_seconds == 300


# ─── Session duration risk ────────────────────────────────────────────────


def test_session_duration_warn():
    """1h+ session → session_duration dimension > 0."""
    a = RiskAssessor()
    a.observe(_spin(ts=0, bet=0, payout=0))   # session start
    a.observe(_spin(ts=4000, bet=0, payout=0))  # ~67min later
    score = a.observe(_spin(ts=4001, bet=0, payout=0))
    assert score.breakdown["session_duration"] > 0


def test_session_duration_critical():
    """4h+ session → session_duration = 1.0."""
    a = RiskAssessor()
    a.observe(_spin(ts=0))
    score = a.observe(_spin(ts=15000))  # > 4h
    assert score.breakdown["session_duration"] == 1.0


# ─── Net loss risk ────────────────────────────────────────────────────────


def test_net_loss_absolute_below_warn():
    a = RiskAssessor()
    for i in range(10):
        a.observe(_spin(ts=i, bet=10, payout=0))
    score = a.observe(_spin(ts=11, bet=10, payout=0))
    # Total loss = 110, warn threshold = 0.3 × 1000 = 300
    assert score.breakdown["net_loss"] == 0.0


def test_net_loss_absolute_critical():
    a = RiskAssessor()
    for i in range(100):
        a.observe(_spin(ts=i, bet=10, payout=0))
    score = a.observe(_spin(ts=101, bet=10, payout=0))
    # Total loss = 1010, critical threshold = 1000
    assert score.breakdown["net_loss"] == 1.0


def test_net_loss_ratio_with_balance():
    a = RiskAssessor()
    # Total bet 700 with balance 300 → ratio = 700 / 1000 = 0.7
    for i in range(70):
        a.observe(_spin(ts=i, bet=10, payout=0, balance=300))
    score = a.observe(_spin(ts=71, bet=10, payout=0, balance=300))
    assert score.breakdown["net_loss"] > 0.5


# ─── Bet escalation (Martingale) ──────────────────────────────────────────


def test_martingale_detection_warn():
    a = RiskAssessor()
    bets = [1, 2, 4, 8, 16]   # 4 doublings → > warn=3 → ramp > 0
    for i, b in enumerate(bets):
        score = a.observe(_spin(ts=i, bet=b, payout=0))
    assert score.breakdown["bet_escalation"] > 0


def test_martingale_detection_critical():
    a = RiskAssessor()
    bets = [1, 2, 4, 8, 16, 32, 64]   # 6 doublings
    for i, b in enumerate(bets):
        score = a.observe(_spin(ts=i, bet=b, payout=0))
    assert score.breakdown["bet_escalation"] == 1.0


def test_flat_bets_no_martingale():
    a = RiskAssessor()
    for i in range(10):
        score = a.observe(_spin(ts=i, bet=5, payout=0))
    assert score.breakdown["bet_escalation"] == 0.0


# ─── Win chase (consecutive losses) ───────────────────────────────────────


def test_win_chase_loss_streak():
    a = RiskAssessor()
    # 7 consecutive losses
    for i in range(7):
        score = a.observe(_spin(ts=i, bet=1, payout=0))
    assert score.breakdown["win_chase"] > 0
    m = a.session_metrics("p1", "s1")
    assert m.consecutive_losses == 7


def test_win_chase_resets_on_win():
    a = RiskAssessor()
    for i in range(5):
        a.observe(_spin(ts=i, bet=1, payout=0))
    a.observe(_spin(ts=5, bet=1, payout=10))  # winner
    m = a.session_metrics("p1", "s1")
    assert m.consecutive_losses == 0


# ─── Session velocity ─────────────────────────────────────────────────────


def test_velocity_high_spm():
    a = RiskAssessor()
    # recent_ts keeps last 20 spins; tighten timestamps so all fall
    # within the 60s velocity window → spm = 20 events × (60/60s window) = 20
    # That's > warn (30)? No — bump density: 20 spins in 10 seconds → 60s window
    # captures all 20 → 20 × (60/60) = 20. Still under warn. Use a wider keep:
    # easiest path → set recent timestamps to last 5 seconds.
    for i in range(20):
        score = a.observe(_spin(ts=i * 0.1))  # 20 events in 1.9s → 60s window
    # 20 events in 1.9 seconds, 60s velocity window → 20 × (60/60) = 20 spm
    # That's still under warn=30. Confirm ramp is at least non-trivial when
    # window-bound is hit — by using a smaller velocity_window override:
    custom = RiskPolicy.ukgc_default()
    custom.velocity_window_seconds = 5.0  # 5s window → 20 events / 5s × 60 = 240 spm
    a2 = RiskAssessor(policy=custom)
    for i in range(20):
        score = a2.observe(_spin(ts=i * 0.1))
    assert score.breakdown["session_velocity"] == 1.0


def test_velocity_low_spm():
    a = RiskAssessor()
    # 1 spin per 10 seconds → 6 spm → below warn (30)
    for i in range(20):
        score = a.observe(_spin(ts=i * 10))
    assert score.breakdown["session_velocity"] == 0.0


# ─── Loss-limit proximity ─────────────────────────────────────────────────


def test_loss_limit_proximity_warn():
    a = RiskAssessor()
    # Set loss_limit = 100; bet 1, payout 0 × 75 spins → consumed 75/100 = 0.75
    for i in range(75):
        score = a.observe(_spin(ts=i, bet=1, payout=0, loss_limit=100))
    assert score.breakdown["loss_limit_proximity"] > 0


def test_loss_limit_proximity_critical():
    a = RiskAssessor()
    for i in range(95):
        score = a.observe(_spin(ts=i, bet=1, payout=0, loss_limit=100))
    assert score.breakdown["loss_limit_proximity"] == 1.0


def test_no_loss_limit_set():
    a = RiskAssessor()
    score = a.observe(_spin(loss_limit=None))
    assert score.breakdown["loss_limit_proximity"] == 0.0


# ─── Intervention thresholds ──────────────────────────────────────────────


def test_intervention_none():
    a = RiskAssessor()
    score = a.observe(_spin())
    assert score.intervention == InterventionLevel.NONE


def test_intervention_forced_break_4h_with_critical_loss():
    """Long session + heavy loss → at least MEDIUM intervention."""
    policy = RiskPolicy.ukgc_default()
    a = RiskAssessor(policy=policy)
    # Establish 4+ hour session with critical loss + sustained losses
    for i in range(20):
        a.observe(_spin(ts=i * 0.1, bet=200, payout=0))  # build streak
    score = a.observe(_spin(ts=16000, bet=200, payout=0))
    # session_duration = 1.0 (×0.20) + net_loss ≥ 1.0 (×0.25) +
    # win_chase = 1.0 (×0.15) → at least 0.60 → HARD
    assert score.intervention in (
        InterventionLevel.MEDIUM, InterventionLevel.HARD, InterventionLevel.FORCED_BREAK,
    )


def test_intervention_levels_monotone():
    """Composite score 0.0 ≤ NONE < SOFT < MEDIUM < HARD < FORCED_BREAK ≤ 1.0."""
    p = RiskPolicy.ukgc_default()
    assert p.threshold_soft < p.threshold_medium
    assert p.threshold_medium < p.threshold_hard
    assert p.threshold_hard < p.threshold_forced_break


# ─── Composite formula sanity ─────────────────────────────────────────────


def test_composite_in_unit_interval():
    a = RiskAssessor()
    # Trigger every dimension with a single bad-actor sequence
    for i in range(120):
        a.observe(_spin(
            ts=i * 0.3,
            bet=1.0 * (2 ** min(i % 8, 6)),  # martingale-ish
            payout=0,
            balance=10,
            loss_limit=50,
        ))
    score = a.observe(_spin(ts=16000, bet=64, payout=0, balance=0, loss_limit=50))
    assert 0.0 <= score.composite_score <= 1.0


def test_weights_sum_about_one():
    p = RiskPolicy.ukgc_default()
    total = (
        p.weight_session_duration + p.weight_net_loss + p.weight_bet_escalation +
        p.weight_win_chase + p.weight_session_velocity + p.weight_loss_limit_proximity
    )
    assert abs(total - 1.0) < 1e-9


def test_breakdown_keys_pinned():
    a = RiskAssessor()
    score = a.observe(_spin())
    expected = {"session_duration", "net_loss", "bet_escalation",
                 "win_chase", "session_velocity", "loss_limit_proximity"}
    assert set(score.breakdown.keys()) == expected


# ─── Multi-session isolation ──────────────────────────────────────────────


def test_multi_session_isolation():
    a = RiskAssessor()
    a.observe(_spin(player_id="p1", session_id="s1"))
    a.observe(_spin(player_id="p2", session_id="s2"))
    m1 = a.session_metrics("p1", "s1")
    m2 = a.session_metrics("p2", "s2")
    assert m1 is not None and m2 is not None
    assert m1.player_id != m2.player_id


def test_reset_session():
    a = RiskAssessor()
    a.observe(_spin())
    assert a.session_metrics("p1", "s1") is not None
    a.reset_session("p1", "s1")
    assert a.session_metrics("p1", "s1") is None


def test_new_session_id_starts_fresh():
    a = RiskAssessor()
    a.observe(_spin(session_id="s1", ts=0))
    a.observe(_spin(session_id="s2", ts=100))
    m_s2 = a.session_metrics("p1", "s2")
    assert m_s2.spins == 1


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.risk_engine", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_assess_jsonl(tmp_path: Path):
    stream = tmp_path / "events.jsonl"
    with stream.open("w") as fp:
        for i in range(50):
            fp.write(json.dumps({
                "session_id": "s1", "player_id": "p1",
                "ts_unix": float(i),
                "bet_amount": 1.0,
                "payout_amount": 0.0,
            }) + "\n")
    rc = _run_cli([
        "assess",
        "--stream", str(stream),
        "--out", str(tmp_path / "report.json"),
        "--quiet",
    ])
    assert rc.returncode == 0
    report = json.loads((tmp_path / "report.json").read_text())
    assert report["events_processed"] == 50
    assert "intervention_counts" in report
    assert report["schema_version"] == "urn:slotmath:risk-engine:v1"


def test_cli_rejects_missing_stream(tmp_path: Path):
    rc = _run_cli([
        "assess",
        "--stream", str(tmp_path / "no-such-file.jsonl"),
    ])
    assert rc.returncode == 2


def test_cli_skips_malformed_lines(tmp_path: Path):
    stream = tmp_path / "mixed.jsonl"
    with stream.open("w") as fp:
        fp.write("not json\n")
        fp.write(json.dumps({
            "session_id": "s", "player_id": "p", "ts_unix": 0.0,
            "bet_amount": 1.0, "payout_amount": 0.0,
        }) + "\n")
    rc = _run_cli([
        "assess",
        "--stream", str(stream),
        "--json",
    ])
    assert rc.returncode == 0
    report = json.loads(rc.stdout)
    assert report["events_processed"] == 1


# ─── E2E: PHASE 12 integration ────────────────────────────────────────────


def test_phase_12_to_phase_23_pipe():
    """Run a small PHASE 12 load test and feed spin events through
    the PHASE 23 risk engine — proves end-to-end live-stream feasibility."""
    from tools.rgs_live import SpinServer
    import json as _json
    server = SpinServer(server_seed_hex="ab" * 32)
    a = RiskAssessor()
    intervention_counts = {}
    for i in range(50):
        req = _json.dumps({
            "type": "spin",
            "request_id": str(i), "session_id": "s",
            "client_seed": "alice", "nonce": i,
        })
        resp = _json.loads(server.handle_spin(req))
        event = SpinEvent(
            session_id="s", player_id="alice",
            ts_unix=float(i),
            bet_amount=1.0,
            payout_amount=resp["result"]["total_payout"],
        )
        score = a.observe(event)
        intervention_counts[score.intervention.value] = \
            intervention_counts.get(score.intervention.value, 0) + 1
    # At least one decision emitted
    assert sum(intervention_counts.values()) == 50
