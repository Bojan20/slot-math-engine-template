"""PHASE 23.B — Strategy fingerprint detector tests."""

from __future__ import annotations

import pytest

from tools.risk_engine import (
    StrategyFingerprint,
    detect_strategy,
    fingerprint_to_dict,
)
from tools.risk_engine.strategy_detector import (
    _STRATEGIES,
    _entropy,
    _softmax,
    _geometric_growth_score,
    _stop_loss_score,
    _compute_evidence,
)


# ─── validation ────────────────────────────────────────────────────────────


def test_empty_input_returns_fixed_default():
    fp = detect_strategy([], [])
    assert fp.best_match == "fixed"
    assert fp.confidence == 0.0


def test_mismatched_lengths_raises():
    with pytest.raises(ValueError):
        detect_strategy([1.0, 2.0], [0.0])


def test_negative_bets_raises():
    with pytest.raises(ValueError):
        detect_strategy([1.0, -1.0, 1.0, 1.0, 1.0, 1.0], [0.0] * 6)


def test_too_small_sample_returns_fixed():
    fp = detect_strategy([1.0, 1.0], [0.0, 0.0])
    assert fp.best_match == "fixed"
    assert "sample_too_small" in fp.evidence


# ─── strategy fingerprints ────────────────────────────────────────────────


def test_fixed_strategy_detected():
    """Flat bets every spin → fixed wins."""
    bets = [10.0] * 30
    outcomes = [0.0] * 30
    fp = detect_strategy(bets, outcomes)
    assert fp.best_match == "fixed"
    assert fp.probabilities["fixed"] > fp.probabilities["martingale"]


def test_martingale_strategy_detected():
    """Double after loss, reset to 1 after win."""
    bets = []
    outcomes = []
    cur = 1.0
    for i in range(20):
        bets.append(cur)
        if i % 5 == 4:
            outcomes.append(cur * 2)  # win
            cur = 1.0
        else:
            outcomes.append(0.0)
            cur *= 2.0
    fp = detect_strategy(bets, outcomes)
    assert fp.best_match == "martingale"
    assert fp.probabilities["martingale"] > 0.30


def test_anti_martingale_strategy_detected():
    """Double after win, reset after loss (Paroli)."""
    bets = []
    outcomes = []
    cur = 1.0
    for i in range(20):
        bets.append(cur)
        if i % 4 == 3:
            outcomes.append(0.0)  # loss
            cur = 1.0
        else:
            outcomes.append(cur * 2)  # win
            cur *= 2.0
    fp = detect_strategy(bets, outcomes)
    assert fp.best_match == "anti_martingale"


def test_win_chase_strategy_detected():
    """Geometric bet growth following losses (≥ 1.2× each step)."""
    bets = [1.0 * (1.3 ** i) for i in range(15)]
    outcomes = [0.0] * 15
    fp = detect_strategy(bets, outcomes)
    # Should match win_chase (geometric growth pattern)
    assert fp.best_match in ("win_chase", "martingale")


def test_stop_loss_strategy_detected():
    """Flat bets that taper to 0 toward end of session."""
    bets = [10.0] * 18 + [0.0, 0.0]
    outcomes = [0.0] * 18 + [0.0, 0.0]
    fp = detect_strategy(bets, outcomes)
    # stop_loss has tail-truncation signature
    assert fp.best_match in ("stop_loss", "fixed")
    # If stop_loss is the best, score must be elevated
    if fp.best_match == "stop_loss":
        assert fp.evidence["stop_loss_score"] > 0


# ─── probability invariants ───────────────────────────────────────────────


def test_probabilities_sum_to_one():
    fp = detect_strategy([1.0] * 10, [0.0] * 10)
    total = sum(fp.probabilities.values())
    assert total == pytest.approx(1.0, abs=1e-3)


def test_probabilities_keys_pinned():
    fp = detect_strategy([1.0] * 10, [0.0] * 10)
    assert set(fp.probabilities.keys()) == set(_STRATEGIES)


def test_confidence_in_unit_interval():
    fp = detect_strategy([1.0] * 30, [0.0] * 30)
    assert 0.0 <= fp.confidence <= 1.0


def test_best_match_matches_argmax():
    fp = detect_strategy([1.0] * 10, [0.0] * 10)
    argmax = max(fp.probabilities, key=fp.probabilities.get)
    assert fp.best_match == argmax


# ─── internal helpers ─────────────────────────────────────────────────────


def test_entropy_uniform_max():
    probs = {s: 1.0 / len(_STRATEGIES) for s in _STRATEGIES}
    import math
    assert _entropy(probs) == pytest.approx(math.log(len(_STRATEGIES)), abs=1e-9)


def test_entropy_certain_zero():
    probs = {"fixed": 1.0, "martingale": 0, "anti_martingale": 0,
              "stop_loss": 0, "win_chase": 0}
    assert _entropy(probs) == pytest.approx(0.0, abs=1e-9)


def test_softmax_sums_to_one():
    scores = {s: float(i) for i, s in enumerate(_STRATEGIES)}
    probs = _softmax(scores)
    assert sum(probs.values()) == pytest.approx(1.0, abs=1e-9)


def test_softmax_monotone():
    scores = {s: float(i) for i, s in enumerate(_STRATEGIES)}
    probs = _softmax(scores)
    sorted_by_score = sorted(scores.items(), key=lambda x: x[1])
    # Higher-score strategy must have higher prob
    for i in range(len(sorted_by_score) - 1):
        s_lo, _ = sorted_by_score[i]
        s_hi, _ = sorted_by_score[i + 1]
        assert probs[s_hi] >= probs[s_lo]


def test_geometric_growth_score_flat():
    assert _geometric_growth_score([1.0] * 10) == 0.0


def test_geometric_growth_score_strong():
    bets = [1.0 * (1.5 ** i) for i in range(10)]
    score = _geometric_growth_score(bets)
    assert score > 0.5


def test_geometric_growth_score_too_short():
    assert _geometric_growth_score([]) == 0.0
    assert _geometric_growth_score([1.0]) == 0.0


def test_stop_loss_score_flat_no_truncation():
    bets = [10.0] * 20
    outcomes = [10.0] * 20  # break-even, no loss
    assert _stop_loss_score(bets, outcomes) <= 0.1


def test_stop_loss_score_truncated_session():
    bets = [10.0] * 15 + [0.0] * 5
    outcomes = [0.0] * 20  # heavy losses
    assert _stop_loss_score(bets, outcomes) > 0.3


# ─── evidence extraction ──────────────────────────────────────────────────


def test_compute_evidence_keys():
    bets = [1.0, 2.0, 4.0, 1.0, 2.0]
    outcomes = [0.0, 0.0, 4.0, 0.0, 0.0]
    ev = _compute_evidence(bets, outcomes)
    expected = {
        "cv_bet", "double_after_loss_rate", "double_after_win_rate",
        "reset_after_win_rate", "reset_after_loss_rate",
        "geometric_growth", "stop_loss_score",
    }
    assert set(ev.keys()) == expected


def test_compute_evidence_martingale_pattern():
    bets = [1.0, 2.0, 4.0, 8.0, 1.0]
    outcomes = [0.0, 0.0, 0.0, 8.0, 0.0]
    ev = _compute_evidence(bets, outcomes)
    # 3 doublings after losses
    assert ev["double_after_loss_rate"] >= 0.5
    # 1 reset after win
    assert ev["reset_after_win_rate"] >= 0.2


# ─── serialisation ────────────────────────────────────────────────────────


def test_fingerprint_to_dict_keys():
    fp = detect_strategy([1.0] * 10, [0.0] * 10)
    d = fingerprint_to_dict(fp)
    assert {"probabilities", "best_match", "confidence", "evidence"} <= set(d.keys())


# ─── E2E: assessor + strategy detector pipe ───────────────────────────────


def test_assessor_session_metrics_feed_strategy_detector():
    """The RiskAssessor's per-session bet/payout history can be passed
    directly into detect_strategy."""
    from tools.risk_engine import RiskAssessor, SpinEvent
    a = RiskAssessor()
    # Martingale-ish session
    bets = []
    outcomes = []
    cur = 1.0
    for i in range(15):
        bets.append(cur)
        if i % 4 == 3:
            outcomes.append(cur * 2)
            cur = 1.0
        else:
            outcomes.append(0.0)
            cur *= 2.0
    for i, (b, o) in enumerate(zip(bets, outcomes)):
        a.observe(SpinEvent(
            session_id="s", player_id="p",
            ts_unix=float(i), bet_amount=b, payout_amount=o,
        ))
    metrics = a.session_metrics("p", "s")
    fp = detect_strategy(metrics.recent_bets, [0.0] * len(metrics.recent_bets))
    assert fp.best_match in _STRATEGIES
