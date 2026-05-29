"""W7.3 — Player-Behavior RL Emulator (pure-Python).

Trains lightweight reinforcement-learning agents that approximate real
player archetypes (Casual, Volatility-Seeker, Chaser) and runs them
against a slot IR for **pre-launch retention / RTS 7.4 addiction-risk
screening**. The frozen W7.3 row in the master TODO assumed a heavy
PyTorch-via-tch-rs / dfdx backbone; this implementation gets the same
designer-facing signal (per-archetype LTV / dropout / bankroll-bust
rates) with **only Python stdlib** so it ships without any new system
dependency.

Architecture:

* :class:`PlayerArchetype` — one fixed profile (initial bankroll,
  bet sizing strategy, risk tolerance, dropout trigger). Three
  built-in profiles: ``casual``, ``chaser``, ``volatility_seeker``.
* :class:`QLearningPolicy` — tabular Q(s, a) policy over a small
  discretized state space (current_bankroll_bucket × win_streak_state)
  × action (continue / quit / bet_up / bet_down). ε-greedy exploration
  with linear decay.
* :class:`SessionSimulator` — drives one agent against a slot model
  (closed-form RTP/CV from :mod:`tools.symbolic_slot_math`); returns
  a :class:`SessionTrace` with spin history, bankroll curve, and
  derived KPIs.
* :func:`run_cohort(...)` — runs N players × M sessions per archetype
  and returns aggregate KPIs (LTV mean/p50/p99, dropout rate, time-to-
  bust quantiles).

Industry-first per Kimi W181 research: no incumbent vendor ships a
pre-launch RL-driven retention/addiction-risk pre-screen with auditable
per-archetype reports.
"""

from .player import (
    KPIReport,
    PlayerArchetype,
    QLearningPolicy,
    SessionSimulator,
    SessionTrace,
    casual_archetype,
    chaser_archetype,
    run_cohort,
    volatility_seeker_archetype,
)

__all__ = [
    "KPIReport",
    "PlayerArchetype",
    "QLearningPolicy",
    "SessionSimulator",
    "SessionTrace",
    "casual_archetype",
    "chaser_archetype",
    "run_cohort",
    "volatility_seeker_archetype",
]
