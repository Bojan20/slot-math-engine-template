"""PHASE 39 — Time-Series RTP Decomposition.

Decomposes a measured RTP signal x[t] (per-spin or per-window) into:
  - trend   (linear least-squares slope + intercept)
  - seasonal (single-period sinusoid fit via least squares at given freq)
  - residual (whatever's left)

Pure stdlib. Useful for operator-side "is the RTP drifting?" panel +
P29 drift-detector ingest.

Public API:
    from tools.rtp_decompose import decompose, DecompositionResult
"""

from __future__ import annotations

from tools.rtp_decompose.decomposer import (
    DecompositionResult,
    decompose,
)

__all__ = ["DecompositionResult", "decompose"]
