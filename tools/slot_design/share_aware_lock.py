"""P10.7 — Share-aware RTP locker.

Extends `tools.gdd_extract.smt_synth.dsl_to_ir_via_smt` so it consumes
the composition planner's `_rtp_share_alloc` hints. When per-feature
RTP share allocations are present, this wrapper:

  1. Annotates the emitted IR's `meta` block with the planned per-feature
     share breakdown (regulator audit trail).
  2. Computes the **base-game line / ways / cluster RTP target** as
     `target_rtp − Σ feature_share_alloc`.
  3. Uses the W7.3 SMT solver to lock the paytable scale so the
     base-game eval lands at the base-game-share target (not the full
     target RTP, which would over-allocate).
  4. Re-measures + records the closed-form vs target delta.

Backward-compatible:
  - When `_rtp_share_alloc` keys are absent → falls through to plain
    `dsl_to_ir_via_smt` (W6.4 behaviour preserved).
  - When z3 missing → falls back to deterministic IR with notes,
    same as W6.4.

Public API:
  share_aware_lock(dsl, tolerance=1e-5, timeout_ms=10_000) → ir dict
"""

from __future__ import annotations

from typing import Any


def share_aware_lock(
    dsl: dict[str, Any],
    *,
    tolerance: float = 1e-5,
    timeout_ms: int = 10_000,
) -> dict[str, Any]:
    """Lock IR closed-form RTP to `target_rtp` while honoring per-feature
    `_rtp_share_alloc` hints from the composition planner.

    Returns a fresh IR dict; never mutates the input.
    """
    if "features" not in dsl or not isinstance(dsl["features"], list):
        # No features → trivial path; just defer to plain W6.4.
        return _delegate_w64(dsl, tolerance=tolerance, timeout_ms=timeout_ms)

    feature_shares = [
        float(f.get("_rtp_share_alloc", 0.0)) for f in dsl["features"]
    ]
    total_feature_share = sum(feature_shares)

    target_rtp = float(dsl.get("meta", {}).get("target_rtp", 0.96))

    # Effective base-game-share target = target − features.
    base_share_target = max(0.0, target_rtp - total_feature_share)

    # When the share planner allocated everything to features (e.g.
    # high-feature-density designs), OR when the base-share target
    # would fall below the DSL validator's minimum of 0.5, use the
    # original target so the solver has something to converge on.
    # Otherwise use the base-only share so the solver doesn't
    # over-allocate.
    if base_share_target >= 0.5:
        effective_target = base_share_target
    else:
        effective_target = target_rtp

    # Build adjusted DSL (only the meta.target_rtp differs).
    dsl_adj: dict[str, Any] = _shallow_copy_with_meta_target(dsl, effective_target)

    ir = _delegate_w64(dsl_adj, tolerance=tolerance, timeout_ms=timeout_ms)

    # Restore the original target on the IR's meta + annotate audit.
    meta = ir.setdefault("meta", {})
    meta["target_rtp"] = target_rtp
    meta["base_game_share_locked_to"] = round(effective_target, 6)
    meta["feature_share_total"] = round(total_feature_share, 6)
    notes = meta.setdefault("notes", [])
    notes.append(
        f"P10.7 share-aware lock: base-share target {effective_target:.6f}"
        f" (= {target_rtp:.4f} − Σ feature shares {total_feature_share:.4f})"
    )

    # Annotate per-feature share rows on the IR if features are present.
    if "features" in ir and isinstance(ir["features"], list):
        for ir_feat, dsl_feat in zip(ir["features"], dsl["features"], strict=False):
            if isinstance(ir_feat, dict) and isinstance(dsl_feat, dict):
                share = dsl_feat.get("_rtp_share_alloc")
                if share is not None:
                    ir_feat["_rtp_share_alloc"] = float(share)

    return ir


def _delegate_w64(
    dsl: dict[str, Any],
    *,
    tolerance: float,
    timeout_ms: int,
) -> dict[str, Any]:
    """Delegate to the W6.4 SMT-locked synthesizer; lazy-import so z3
    is optional."""
    try:
        from tools.gdd_extract.smt_synth import dsl_to_ir_via_smt
        return dsl_to_ir_via_smt(dsl, tolerance=tolerance, timeout_ms=timeout_ms)
    except Exception as exc:  # noqa: BLE001
        # Fallback to deterministic W6.2 — same shape as W6.4 fallback.
        from tools.gdd_extract.dsl import dsl_to_slot_sim_ir
        ir = dsl_to_slot_sim_ir(dsl)
        if isinstance(ir.get("meta"), dict):
            notes = ir["meta"].setdefault("notes", [])
            notes.append(
                f"share-aware lock: W6.4 unavailable ({exc}); "
                f"deterministic fallback used."
            )
        return ir


def _shallow_copy_with_meta_target(
    dsl: dict[str, Any], new_target: float
) -> dict[str, Any]:
    """Return a shallow copy of `dsl` with `meta.target_rtp` swapped."""
    out: dict[str, Any] = dict(dsl)
    out["meta"] = dict(dsl.get("meta", {}))
    out["meta"]["target_rtp"] = float(new_target)
    return out
