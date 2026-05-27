"""PHASE 23 — Real-Time Player Risk Engine.

UKGC RTS 7.4 addiction-risk-detection. Streams per-player session
telemetry (spin events) → continuous risk score (0-1) + intervention
recommendation.

Composes:
  - PHASE 12 RGS Live (spin events source)
  - W7.6 Player-Behavior Simulator (Martingale / Anti-M / StopLoss /
    WinChase strategy fingerprints)
  - UKGC RTS 7.4 (operator MUST detect harm before threshold crossing)
  - MGA Player Protection Directive §11 (deposit-limit + reality-check
    interaction)

Public API:

    from tools.risk_engine import (
        RiskAssessor,
        SpinEvent,
        RiskScore,
        InterventionLevel,
        RiskPolicy,
    )

    assessor = RiskAssessor(policy=RiskPolicy.ukgc_default())
    for spin in stream:
        score = assessor.observe(spin)
        if score.intervention != InterventionLevel.NONE:
            operator.notify(score)

CLI:
    python -m tools.risk_engine assess --stream events.jsonl --out report.json
"""

from __future__ import annotations

from tools.risk_engine.assessor import (
    RiskAssessor,
    SpinEvent,
    RiskScore,
    InterventionLevel,
    RiskPolicy,
    SessionMetrics,
)
from tools.risk_engine.strategy_detector import (
    StrategyFingerprint,
    detect_strategy,
    fingerprint_to_dict,
)

__all__ = [
    "RiskAssessor",
    "SpinEvent",
    "RiskScore",
    "InterventionLevel",
    "RiskPolicy",
    "SessionMetrics",
    "StrategyFingerprint",
    "detect_strategy",
    "fingerprint_to_dict",
]
