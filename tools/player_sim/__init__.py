"""W7.6 — Player-behavior session simulator.

Industry-first per Kimi research: a deterministic player-strategy
emulator that drives the engine through realistic session patterns
(Fixed bet, Martingale doubling, anti-Martingale, stop-loss, win-chase)
and reports per-strategy retention metrics — net P&L, max drawdown,
ruin probability, session length distribution.

Used by:
  ▸ Responsible-gambling compliance audit (UKGC RTS 7.4 detection of
    high-volatility/high-ruin strategy patterns)
  ▸ Pre-launch design QA — does a Martingale-style chaser go ruin in
    <1000 spins more than X% of the time?
  ▸ Cert audit — does the game produce different per-strategy RTP
    distributions than the published RTP target?
"""

from .player_strategies import (
    Strategy,
    FixedBet,
    Martingale,
    AntiMartingale,
    StopLoss,
    WinChase,
    DEFAULT_STRATEGIES,
)
from .session_simulator import (
    SessionResult,
    StrategyReport,
    simulate_session,
    simulate_cohort,
)

__all__ = [
    "Strategy",
    "FixedBet",
    "Martingale",
    "AntiMartingale",
    "StopLoss",
    "WinChase",
    "DEFAULT_STRATEGIES",
    "SessionResult",
    "StrategyReport",
    "simulate_session",
    "simulate_cohort",
]
