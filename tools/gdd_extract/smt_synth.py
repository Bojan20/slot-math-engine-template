"""W6.4 — DSL → IR synthesizer with SMT-locked target RTP.

Couples W6.2 (DSL → IR with default paytable) and W7.3 (Z3 closed-form
RTP solver) to produce a universal IR whose closed-form RTP matches
the DSL's `meta.target_rtp` EXACTLY (rational solver, not MC).

Pipeline:
    DSL → default IR → measure closed-form RTP → if drift > tolerance,
    SMT-solve a paytable scale that closes the gap → apply → re-measure

Public API:
    from tools.gdd_extract.smt_synth import dsl_to_ir_via_smt
    ir = dsl_to_ir_via_smt(dsl, tolerance=1e-5)

The SMT step is gated behind a `z3-solver` import; when z3 isn't
installed, the function falls back to the W6.2 default synthesis
(returns the unscaled IR plus a `notes` entry flagging the unmet
target).
"""
from __future__ import annotations

from typing import Any

from tools.gdd_extract.dsl import (
    DslValidationError,
    dsl_to_slot_sim_ir,
    dsl_validate,
)


def dsl_to_ir_via_smt(
    dsl: dict[str, Any],
    tolerance: float = 1e-5,
    timeout_ms: int = 10_000,
) -> dict[str, Any]:
    """Synthesize a universal IR with closed-form RTP locked to
    `dsl.meta.target_rtp` (within `tolerance`).

    Strategy:
      1. Build the default IR via `dsl_to_slot_sim_ir`.
      2. Measure baseline closed-form RTP.
      3. If |baseline − target| <= tolerance → return IR as-is.
      4. Otherwise, Z3-solve a single paytable scale `s` such that
         `s × baseline ≈ target` (exact rational).
      5. Apply scale → return new IR with notes documenting the
         solver step.

    Raises `DslValidationError` if DSL is malformed; on SMT failure
    (e.g. z3 missing OR baseline RTP is 0), returns the unscaled IR
    with a flag in `meta.notes`.
    """
    dsl_validate(dsl)
    ir = dsl_to_slot_sim_ir(dsl)

    target = float(dsl["meta"]["target_rtp"])

    # Try W7.3 closed-form synthesis to LOCK the RTP exactly.
    try:
        from tools.smt.rtp_synthesizer import (
            RtpSynthesisError,
            apply_paytable_scale,
            closed_form_line_rtp,
            synth_paytable_scale,
        )
    except ImportError:
        ir.setdefault("meta", {})
        ir["meta"].setdefault("notes", []).append(
            "W6.4: z3-solver not installed; target RTP not locked"
        )
        return ir

    baseline = closed_form_line_rtp(ir)
    if baseline <= 0.0:
        ir["meta"].setdefault("notes", []).append(
            "W6.4: baseline closed-form RTP = 0 (no payable line entries)"
        )
        return ir

    if abs(baseline - target) <= tolerance:
        ir["meta"].setdefault("notes", []).append(
            f"W6.4: baseline {baseline:.6f} already within "
            f"{tolerance} of target {target:.6f}; no scale applied"
        )
        return ir

    try:
        scale = synth_paytable_scale(
            ir,
            target_rtp=target,
            tolerance=tolerance,
            timeout_ms=timeout_ms,
        )
    except RtpSynthesisError as e:
        ir["meta"].setdefault("notes", []).append(
            f"W6.4: SMT failed ({e}); using default paytable"
        )
        return ir

    new_ir = apply_paytable_scale(ir, scale)
    new_ir["meta"].setdefault("notes", []).append(
        f"W6.4: SMT-locked target {target:.6f} via paytable scale "
        f"{scale:.6f} (baseline {baseline:.6f})"
    )
    # Cross-check the post-scale closed-form
    new_rtp = closed_form_line_rtp(new_ir)
    new_ir["meta"]["notes"].append(
        f"W6.4: post-scale closed-form RTP = {new_rtp:.6f}"
    )
    return new_ir
