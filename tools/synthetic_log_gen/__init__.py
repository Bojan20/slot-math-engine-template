"""W49 — Synthetic Spin Log Generator.

Produces a JSONL spin event stream calibrated to a target RTP +
volatility tier + player cohort mix. Used to:

  • Stress-test W29 RTP monitor + W37 cohort analyzer with known
    ground-truth distributions.
  • Smoke-test pipelines without real production traffic.
  • Generate CI fixtures.

Event schema:
  { "player_id": "...", "session_id": "...", "bet": 1.0, "pay": 0.0,
    "ts": 1700000000.0 }
"""
from tools.synthetic_log_gen.generator import (
    GeneratorConfig,
    generate_events,
    generate_jsonl,
)

__all__ = [
    "GeneratorConfig",
    "generate_events",
    "generate_jsonl",
]
