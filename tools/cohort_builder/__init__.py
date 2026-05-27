"""PHASE 43 — Player Segment Cohort Builder.

Generates synthetic player cohorts from a CohortSpec sa per-segment
distributions (bet-size buckets, session-length distribution, win-
chase probability). Output feeds P23 RiskAssessor + P29 drift detectors
for capacity / risk testing.

Public API:
    from tools.cohort_builder import (
        SegmentSpec,
        CohortSpec,
        generate_cohort_events,
    )
"""

from __future__ import annotations

from tools.cohort_builder.builder import (
    SegmentSpec,
    CohortSpec,
    PlayerProfile,
    generate_cohort_events,
)

__all__ = [
    "SegmentSpec",
    "CohortSpec",
    "PlayerProfile",
    "generate_cohort_events",
]
