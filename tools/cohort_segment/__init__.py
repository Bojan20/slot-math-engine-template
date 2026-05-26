"""W37 — Cohort Segment Analyzer.

Consume a JSONL spin log (player_id, bet, pay, session_id, …) and
emit per-segment summary statistics:

  • Segments: low-roller (bet < q33), mid-roller (q33 ≤ bet < q66),
    high-roller (bet ≥ q66) by player average bet.
  • Per-segment: count, mean RTP, mean session length (spins),
    mean end-bankroll change (% of start), bust rate (player went
    below `bust_threshold`).

Use cases: post-launch sanity check that whales aren't seeing a
significantly different RTP than retail; jurisdiction reports
showing payout fairness across cohort tiers.
"""
from tools.cohort_segment.analyzer import (
    SegmentStats,
    CohortReport,
    classify_segments,
    aggregate,
    analyze_jsonl,
)

__all__ = [
    "SegmentStats",
    "CohortReport",
    "classify_segments",
    "aggregate",
    "analyze_jsonl",
]
