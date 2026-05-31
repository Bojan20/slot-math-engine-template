"""SLOT-MATH Faza 6.3 — Real-time PAR diff editor (Studio backend).

When designer edits canonical PAR YAML in Studio:
  1. Editor POSTs draft PAR to /api/par/preview
  2. Backend re-normalizes, re-maps to IR, runs T1 MC (1M × 32 = ~10s)
  3. Returns delta vs current production: RTP / hit_freq / variance / max_win
  4. Designer sees live "you'd be moving RTP from 96.0% → 96.34%" gauge
  5. Designer can "Save as new variant" or "Discard" — does not touch live

Read-only path — no live impact until promote_variant call.
"""
from tools.par_diff_editor.preview import (
    PreviewRequest,
    PreviewResponse,
    compute_preview_diff,
    diff_metrics,
)

__all__ = [
    "PreviewRequest",
    "PreviewResponse",
    "compute_preview_diff",
    "diff_metrics",
]
