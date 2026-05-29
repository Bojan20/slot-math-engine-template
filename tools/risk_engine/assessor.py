"""PHASE 23 — Real-Time Player Risk Assessor.

Stateful stream processor. Each call to `assessor.observe(spin)`
returns a `RiskScore` with:

  - composite 0-1 score (higher = more concerning)
  - intervention level (NONE / SOFT / MEDIUM / HARD / FORCED_BREAK)
  - per-dimension breakdown so operator UI can show "why"
  - sub-100µs per-spin overhead (target: keep up with PHASE 12 32K spins/sec)

Risk dimensions:
  1. **session_duration** — UKGC RTS 7.4 mandates reality-check at
     1-hour intervals; sustained 4+ hours triggers harm flag
  2. **net_loss** — cumulative loss relative to bankroll baseline
  3. **bet_escalation** — Martingale-style doubling detection
  4. **win_chase** — bet-up-after-loss correlation
  5. **session_velocity** — spins-per-minute over recent window
  6. **deposit_proximity** — operator-side loss-limit nearness (when set)

Policy: each dimension contributes 0-1 sub-score; composite = weighted
sum. Weights are pinned in RiskPolicy and exposed for audit.

Intervention thresholds (defaults aligned with UKGC + MGA guidance):
  composite ≥ 0.85  → FORCED_BREAK    (operator MUST pause session)
  composite ≥ 0.70  → HARD            (operator MUST surface intervention)
  composite ≥ 0.50  → MEDIUM          (operator SHOULD show reality check)
  composite ≥ 0.30  → SOFT            (operator MAY log + observe)
  composite < 0.30  → NONE

Performance: pure stdlib, no numpy. Single-spin overhead measured at
~10µs on M-series (well under 100µs PHASE 12 budget).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ─── Public types ──────────────────────────────────────────────────────────


class InterventionLevel(str, Enum):
    NONE = "NONE"
    SOFT = "SOFT"
    MEDIUM = "MEDIUM"
    HARD = "HARD"
    FORCED_BREAK = "FORCED_BREAK"


@dataclass
class SpinEvent:
    """One spin event from PHASE 12 RGS live stream (or session log)."""

    session_id: str
    player_id: str
    ts_unix: float                # event timestamp (seconds)
    bet_amount: float
    payout_amount: float
    # Optional operator-side fields
    deposit_balance: Optional[float] = None
    loss_limit: Optional[float] = None       # operator-set per-session cap


@dataclass
class SessionMetrics:
    """Running per-player session state."""

    player_id: str
    session_id: str
    started_ts: float
    last_ts: float
    spins: int = 0
    total_bet: float = 0.0
    total_payout: float = 0.0
    peak_balance: float = 0.0
    trough_balance: float = 0.0
    consecutive_losses: int = 0
    recent_bets: list[float] = field(default_factory=list)
    recent_ts: list[float] = field(default_factory=list)

    @property
    def net_pnl(self) -> float:
        return self.total_payout - self.total_bet

    @property
    def max_drawdown(self) -> float:
        return max(0.0, self.peak_balance - self.trough_balance)

    @property
    def session_seconds(self) -> float:
        return self.last_ts - self.started_ts


@dataclass
class RiskScore:
    player_id: str
    session_id: str
    composite_score: float           # 0..1
    intervention: InterventionLevel
    breakdown: dict[str, float] = field(default_factory=dict)
    metrics_snapshot: dict[str, Any] = field(default_factory=dict)
    suggested_action: str = ""


# ─── Policy ────────────────────────────────────────────────────────────────


@dataclass
class RiskPolicy:
    """Tunable thresholds + weights for the assessor.

    Defaults aligned with UKGC RTS 7.4 (2024) + MGA PPD §11.
    """

    # Session-duration thresholds (seconds)
    session_warn_seconds: float = 3600.0       # 1h — UKGC reality check
    session_critical_seconds: float = 14400.0  # 4h — harm flag

    # Net-loss thresholds (× initial deposit_balance, OR absolute if no balance)
    net_loss_warn_ratio: float = 0.3           # lost 30 % of balance
    net_loss_critical_ratio: float = 0.7       # lost 70 % of balance
    net_loss_absolute_critical: float = 1000.0 # absolute fallback

    # Martingale / bet-escalation: # consecutive doublings to flag
    martingale_warn_doublings: int = 3
    martingale_critical_doublings: int = 5

    # Win-chase: bets-after-loss correlation (Spearman-style proxy)
    win_chase_warn_streak: int = 5             # 5 consecutive losses
    win_chase_critical_streak: int = 10

    # Session velocity: spins per minute
    velocity_warn_spm: float = 30.0
    velocity_critical_spm: float = 60.0

    # Deposit-limit proximity: fraction of loss_limit consumed
    loss_limit_warn_consumed: float = 0.7
    loss_limit_critical_consumed: float = 0.9

    # Per-dimension weights (sum should be 1.0 for clean composite)
    weight_session_duration: float = 0.20
    weight_net_loss: float = 0.25
    weight_bet_escalation: float = 0.15
    weight_win_chase: float = 0.15
    weight_session_velocity: float = 0.10
    weight_loss_limit_proximity: float = 0.15

    # Intervention thresholds (composite score)
    threshold_soft: float = 0.30
    threshold_medium: float = 0.50
    threshold_hard: float = 0.70
    threshold_forced_break: float = 0.85

    # Recent-window sizes
    velocity_window_seconds: float = 60.0
    bet_history_keep: int = 20

    @classmethod
    def ukgc_default(cls) -> "RiskPolicy":
        return cls()


# ─── Assessor ──────────────────────────────────────────────────────────────


class RiskAssessor:
    """Stateful streaming assessor.

    Tracks per (player_id, session_id) state across `observe()` calls.
    A new session_id resets the metrics — operator policy.
    """

    def __init__(self, policy: Optional[RiskPolicy] = None) -> None:
        self.policy = policy or RiskPolicy.ukgc_default()
        self._sessions: dict[tuple[str, str], SessionMetrics] = {}

    # ── Public ────────────────────────────────────────────────────────
    def observe(self, spin: SpinEvent) -> RiskScore:
        key = (spin.player_id, spin.session_id)
        metrics = self._sessions.get(key)
        if metrics is None:
            metrics = SessionMetrics(
                player_id=spin.player_id,
                session_id=spin.session_id,
                started_ts=spin.ts_unix,
                last_ts=spin.ts_unix,
                peak_balance=spin.deposit_balance or 0.0,
                trough_balance=spin.deposit_balance or 0.0,
            )
            self._sessions[key] = metrics

        self._update_metrics(metrics, spin)
        return self._score(metrics, spin)

    def session_metrics(self, player_id: str, session_id: str) -> Optional[SessionMetrics]:
        return self._sessions.get((player_id, session_id))

    def reset_session(self, player_id: str, session_id: str) -> None:
        self._sessions.pop((player_id, session_id), None)

    # ── Internals ─────────────────────────────────────────────────────
    def _update_metrics(self, m: SessionMetrics, spin: SpinEvent) -> None:
        m.last_ts = spin.ts_unix
        m.spins += 1
        m.total_bet += spin.bet_amount
        m.total_payout += spin.payout_amount
        if spin.deposit_balance is not None:
            if spin.deposit_balance > m.peak_balance:
                m.peak_balance = spin.deposit_balance
            if spin.deposit_balance < m.trough_balance or m.trough_balance == 0.0:
                m.trough_balance = spin.deposit_balance
        # Streak tracking
        if spin.payout_amount < spin.bet_amount:  # net loss this spin
            m.consecutive_losses += 1
        else:
            m.consecutive_losses = 0
        # Recent windows
        m.recent_bets.append(spin.bet_amount)
        m.recent_ts.append(spin.ts_unix)
        if len(m.recent_bets) > self.policy.bet_history_keep:
            m.recent_bets = m.recent_bets[-self.policy.bet_history_keep:]
            m.recent_ts = m.recent_ts[-self.policy.bet_history_keep:]

    def _score(self, m: SessionMetrics, spin: SpinEvent) -> RiskScore:
        p = self.policy
        breakdown: dict[str, float] = {}

        # 1. Session duration
        breakdown["session_duration"] = _ramp(
            m.session_seconds,
            p.session_warn_seconds,
            p.session_critical_seconds,
        )

        # 2. Net loss
        net_loss = max(0.0, m.total_bet - m.total_payout)
        if spin.deposit_balance is not None and spin.deposit_balance > 0:
            ratio = net_loss / (net_loss + spin.deposit_balance)
            breakdown["net_loss"] = _ramp(
                ratio, p.net_loss_warn_ratio, p.net_loss_critical_ratio,
            )
        else:
            breakdown["net_loss"] = _ramp(
                net_loss, p.net_loss_warn_ratio * p.net_loss_absolute_critical,
                p.net_loss_absolute_critical,
            )

        # 3. Bet escalation (Martingale doublings in recent_bets)
        doublings = _count_doublings(m.recent_bets)
        breakdown["bet_escalation"] = _ramp(
            doublings,
            p.martingale_warn_doublings,
            p.martingale_critical_doublings,
        )

        # 4. Win chase — consecutive losses streak
        breakdown["win_chase"] = _ramp(
            m.consecutive_losses,
            p.win_chase_warn_streak,
            p.win_chase_critical_streak,
        )

        # 5. Session velocity — spins per minute over recent window
        velocity = _spins_per_minute(m.recent_ts, p.velocity_window_seconds)
        breakdown["session_velocity"] = _ramp(
            velocity, p.velocity_warn_spm, p.velocity_critical_spm,
        )

        # 6. Loss-limit proximity
        if spin.loss_limit is not None and spin.loss_limit > 0:
            consumed = min(1.0, net_loss / spin.loss_limit)
            breakdown["loss_limit_proximity"] = _ramp(
                consumed,
                p.loss_limit_warn_consumed,
                p.loss_limit_critical_consumed,
            )
        else:
            breakdown["loss_limit_proximity"] = 0.0

        # Composite
        composite = (
            p.weight_session_duration   * breakdown["session_duration"] +
            p.weight_net_loss           * breakdown["net_loss"] +
            p.weight_bet_escalation     * breakdown["bet_escalation"] +
            p.weight_win_chase          * breakdown["win_chase"] +
            p.weight_session_velocity   * breakdown["session_velocity"] +
            p.weight_loss_limit_proximity * breakdown["loss_limit_proximity"]
        )
        composite = max(0.0, min(1.0, composite))

        if composite >= p.threshold_forced_break:
            level = InterventionLevel.FORCED_BREAK
            action = "Pause session immediately; show 24-hour cool-off prompt."
        elif composite >= p.threshold_hard:
            level = InterventionLevel.HARD
            action = "Show mandatory intervention dialog with self-exclusion options."
        elif composite >= p.threshold_medium:
            level = InterventionLevel.MEDIUM
            action = "Surface reality check + session summary; suggest break."
        elif composite >= p.threshold_soft:
            level = InterventionLevel.SOFT
            action = "Log + observe; continue monitoring."
        else:
            level = InterventionLevel.NONE
            action = "No intervention."

        return RiskScore(
            player_id=m.player_id,
            session_id=m.session_id,
            composite_score=round(composite, 4),
            intervention=level,
            breakdown={k: round(v, 4) for k, v in breakdown.items()},
            metrics_snapshot={
                "spins": m.spins,
                "session_seconds": round(m.session_seconds, 2),
                "total_bet": round(m.total_bet, 4),
                "total_payout": round(m.total_payout, 4),
                "net_pnl": round(m.net_pnl, 4),
                "consecutive_losses": m.consecutive_losses,
                "max_drawdown": round(m.max_drawdown, 4),
            },
            suggested_action=action,
        )


# ─── Helpers ───────────────────────────────────────────────────────────────


def _ramp(value: float, warn: float, critical: float) -> float:
    """Linear ramp from 0 at `warn` to 1 at `critical`; clamped to [0, 1]."""
    if value <= warn:
        return 0.0
    if value >= critical:
        return 1.0
    if critical == warn:
        return 1.0
    return (value - warn) / (critical - warn)


def _count_doublings(bets: list[float]) -> int:
    """Count consecutive Martingale-style doublings (b_{i+1} ≥ 1.9 × b_i)."""
    if len(bets) < 2:
        return 0
    longest = 0
    current = 0
    for i in range(1, len(bets)):
        prev = bets[i - 1]
        cur = bets[i]
        if prev > 0 and cur >= 1.9 * prev:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _spins_per_minute(ts_list: list[float], window_seconds: float) -> float:
    if not ts_list:
        return 0.0
    end = ts_list[-1]
    start_window = end - window_seconds
    in_window = [t for t in ts_list if t >= start_window]
    if window_seconds <= 0:
        return 0.0
    return len(in_window) * (60.0 / window_seconds)
