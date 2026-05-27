"""PHASE 42 — Semantic IR Differ.

Classifies cross-IR diffs into:
  - MATH        (paytable, reels, features, topology dimensions, target_rtp)
  - COSMETIC    (meta.name, meta.notes, design audit log)
  - UNKNOWN     (fields not in known taxonomy)

Emits a human-readable patch w/ verdict per category.

Public API:
    from tools.ir_diff_semantic import (
        DiffEntry, DiffReport, semantic_diff, render_patch_md,
    )
"""

from __future__ import annotations

from tools.ir_diff_semantic.differ import (
    DiffEntry,
    DiffReport,
    semantic_diff,
    render_patch_md,
)

__all__ = ["DiffEntry", "DiffReport", "semantic_diff", "render_patch_md"]
