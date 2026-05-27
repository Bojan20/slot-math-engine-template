"""PHASE 23.B — Player Strategy Fingerprint Detector.

Stateless analytic classifier: given the recent bet sequence + per-spin
outcomes, returns a probability vector over five canonical player
strategies (matching the W7.6 Player-Behavior Simulator):

  - "fixed"          flat bet every spin
  - "martingale"     double after loss; reset after win
  - "anti_martingale" double after win; reset after loss
  - "stop_loss"      bet flat until cumulative loss > X% bankroll, then stop
  - "win_chase"      bet up after consecutive losses (geometric increase)

Output:
  StrategyFingerprint(
      probabilities={"fixed": 0.0, "martingale": 0.9, ...},
      best_match="martingale",
      confidence=0.87,
      evidence={...},
  )

This is the "PROVE you're not enabling addictive strategies" UKGC
disclosure surface — operator can log per-player strategy distribution
over time and surface to regulators on demand.

Math sketch:
  - Compute per-strategy "score" via feature matching:
    * bet variance / mean
    * lag-1 autocorrelation bet_t vs win_{t-1}
    * Martingale double-after-loss ratio
    * stop_loss truncation evidence
  - Soft-max → probabilities
  - confidence = max prob × (1 − entropy / log(N_strategies))
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict, field
from typing import Any


# ─── Public types ──────────────────────────────────────────────────────────


_STRATEGIES = ("fixed", "martingale", "anti_martingale", "stop_loss", "win_chase")


@dataclass
class StrategyFingerprint:
    probabilities: dict[str, float]
    best_match: str
    confidence: float
    evidence: dict[str, float] = field(default_factory=dict)


# ─── Public API ────────────────────────────────────────────────────────────


def detect_strategy(
    bets: list[float],
    outcomes: list[float],
) -> StrategyFingerprint:
    """Classify the player's strategy from recent bet+outcome history.

    Args:
        bets:     list of bet amounts (per spin, oldest first)
        outcomes: list of payouts (per spin, same length as bets);
                   outcome[i] < bets[i] = net loss this spin

    Returns:
        StrategyFingerprint with probabilities over the 5 canonical
        strategies. Returns "fixed" as default when sample is too small
        (< 5 spins).
    """
    if len(bets) != len(outcomes):
        raise ValueError("bets and outcomes must have same length")
    if not bets:
        return _trivial_fingerprint("fixed", 0.0)
    if len(bets) < 5:
        return _trivial_fingerprint("fixed", 0.20, sample_too_small=True)
    if any(b < 0 for b in bets):
        raise ValueError("bet amounts must be non-negative")

    evidence = _compute_evidence(bets, outcomes)
    scores = _score_strategies(evidence)
    probs = _softmax(scores)
    best = max(probs, key=probs.get)
    confidence = probs[best] * (1.0 - _entropy(probs) / math.log(len(_STRATEGIES)))

    return StrategyFingerprint(
        probabilities={k: round(v, 4) for k, v in probs.items()},
        best_match=best,
        confidence=round(max(0.0, min(1.0, confidence)), 4),
        evidence={k: round(v, 4) for k, v in evidence.items()},
    )


# ─── Internals ─────────────────────────────────────────────────────────────


def _trivial_fingerprint(best: str, confidence: float,
                          sample_too_small: bool = False) -> StrategyFingerprint:
    prob_each = 1.0 / len(_STRATEGIES)
    probs = {s: prob_each for s in _STRATEGIES}
    probs[best] = prob_each + 1e-9  # tie-break toward best
    evidence: dict[str, float] = {}
    if sample_too_small:
        evidence["sample_too_small"] = 1.0
    return StrategyFingerprint(
        probabilities={k: round(v, 4) for k, v in probs.items()},
        best_match=best,
        confidence=round(confidence, 4),
        evidence=evidence,
    )


def _compute_evidence(bets: list[float], outcomes: list[float]) -> dict[str, float]:
    """Extract numeric features used by the strategy scorers."""
    n = len(bets)
    mean_bet = sum(bets) / n
    var_bet = sum((b - mean_bet) ** 2 for b in bets) / n
    cv_bet = math.sqrt(var_bet) / mean_bet if mean_bet > 0 else 0.0

    # Lag-1: does bet_t respond to win/loss_{t-1}?
    double_after_loss = 0
    double_after_win = 0
    reset_after_win = 0
    reset_after_loss = 0
    total_transitions = max(1, n - 1)
    for i in range(1, n):
        prev_bet = bets[i - 1]
        cur_bet = bets[i]
        prev_loss = outcomes[i - 1] < prev_bet
        prev_win = outcomes[i - 1] >= prev_bet
        if prev_bet > 0 and cur_bet >= 1.9 * prev_bet:
            if prev_loss:
                double_after_loss += 1
            elif prev_win:
                double_after_win += 1
        if prev_bet > 0 and cur_bet <= 0.55 * prev_bet:
            if prev_win:
                reset_after_win += 1
            elif prev_loss:
                reset_after_loss += 1

    # Geometric bet growth indicator (win-chase signature)
    geometric_growth = _geometric_growth_score(bets)

    # Stop-loss truncation: stable bets then sudden 0 (terminated session)
    stop_loss_score = _stop_loss_score(bets, outcomes)

    return {
        "cv_bet": cv_bet,                            # ~0 = flat
        "double_after_loss_rate": double_after_loss / total_transitions,
        "double_after_win_rate": double_after_win / total_transitions,
        "reset_after_win_rate": reset_after_win / total_transitions,
        "reset_after_loss_rate": reset_after_loss / total_transitions,
        "geometric_growth": geometric_growth,
        "stop_loss_score": stop_loss_score,
    }


def _geometric_growth_score(bets: list[float]) -> float:
    """0..1 score: longest streak of consistent geometric growth bet_{i+1}/bet_i ≈ const > 1."""
    if len(bets) < 3:
        return 0.0
    ratios = []
    for i in range(1, len(bets)):
        prev = bets[i - 1]
        if prev <= 0:
            continue
        ratios.append(bets[i] / prev)
    if not ratios:
        return 0.0
    # Geometric growth = many ratios > 1.5 in a row
    streak = 0
    longest = 0
    for r in ratios:
        if r > 1.2:
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 0
    return min(1.0, longest / len(ratios))


def _stop_loss_score(bets: list[float], outcomes: list[float]) -> float:
    """0..1 score: evidence the session terminated at a loss-limit."""
    if len(bets) < 5:
        return 0.0
    # If the last few bets are 0 or much smaller than the mean → likely stopped.
    tail_n = min(3, len(bets) // 5)
    tail = bets[-tail_n:]
    mean_bet = sum(bets) / len(bets)
    if mean_bet <= 0:
        return 0.0
    truncated = sum(1 for b in tail if b < 0.1 * mean_bet)
    # Plus check cumulative loss
    cum_loss = sum(bets) - sum(outcomes)
    cum_loss_ratio = cum_loss / (sum(bets) + 1e-9)
    truncated_score = truncated / tail_n
    return min(1.0, 0.5 * truncated_score + 0.5 * min(1.0, cum_loss_ratio))


def _score_strategies(ev: dict[str, float]) -> dict[str, float]:
    """Map evidence → per-strategy raw score (higher = more match)."""
    return {
        "fixed":            2.0 * (1.0 - min(1.0, ev["cv_bet"])),
        "martingale":       3.0 * ev["double_after_loss_rate"]
                            + 1.0 * ev["reset_after_win_rate"],
        "anti_martingale":  3.0 * ev["double_after_win_rate"]
                            + 1.0 * ev["reset_after_loss_rate"],
        "stop_loss":        2.0 * ev["stop_loss_score"]
                            + 1.0 * (1.0 - min(1.0, ev["cv_bet"])),
        "win_chase":        2.0 * ev["geometric_growth"]
                            + 0.5 * ev["double_after_loss_rate"],
    }


def _softmax(scores: dict[str, float]) -> dict[str, float]:
    # Mild temperature so a 3.0-score strategy gets ~0.85 probability
    # vs a 1.0-score baseline.
    temperature = 1.5
    exps = {k: math.exp(v / temperature) for k, v in scores.items()}
    total = sum(exps.values())
    if total <= 0:
        return {k: 1.0 / len(scores) for k in scores}
    return {k: v / total for k, v in exps.items()}


def _entropy(probs: dict[str, float]) -> float:
    total = 0.0
    for p in probs.values():
        if p > 0:
            total += -p * math.log(p)
    return total


def fingerprint_to_dict(fp: StrategyFingerprint) -> dict[str, Any]:
    return asdict(fp)
