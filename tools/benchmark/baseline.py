"""W7 — naive uniform-weight closed-form baseline.

Given a parsed math-DSL spec, build the ts-IR via ``compile_to_ir`` and
return its closed-form RTP.  The seeded reel weights from
``_seed_weights_uniform`` are intentionally uniform (a designer's
"first-guess" weight assignment), so this is exactly the "no compiler,
no Z3" baseline against which the SMT-fit version is compared.

The function delegates to ``tools.smt.weight_synthesizer.measured_rtp``
so the *same* closed-form formula is used here as in the SMT step — any
implementation drift would otherwise inflate the speedup spuriously.
"""

from __future__ import annotations

from tools.math_dsl.compile import compile_to_ir
from tools.math_dsl.spec import MathDslSpec
from tools.smt.weight_synthesizer import measured_rtp


def uniform_weight_rtp(spec: MathDslSpec) -> float:
    """Closed-form RTP under the math_dsl compiler's UNIFORM weight seed.

    No solver is invoked: this is what a designer would see if they
    declared the spec and accepted the compiler's default weights without
    running anything else.  This is the W7 benchmark baseline.
    """
    ts_ir = compile_to_ir(spec)
    # Mirror the role-injection the greenfield pipeline does so the
    # measured_rtp wild-substitution path matches the SMT step's view —
    # without this, the closed-form numerator would differ between the
    # baseline and the post-SMT measurement, biasing the speedup.
    for sym in ts_ir.get("symbols", []):
        if "role" not in sym and "kind" in sym:
            sym["role"] = sym["kind"]
    return float(measured_rtp(ts_ir))


def uniform_weight_ts_ir(spec: MathDslSpec) -> dict:
    """Return the compiled ts-IR (uniform weights, role-tagged) for the
    spec.  Used by the runner so the SAME ts-IR object can be passed to
    BOTH the closed-form baseline measurement and the SMT step — saves a
    redundant compile() call and keeps the byte-stable role-tag fix in
    one place.
    """
    ts_ir = compile_to_ir(spec)
    for sym in ts_ir.get("symbols", []):
        if "role" not in sym and "kind" in sym:
            sym["role"] = sym["kind"]
    return ts_ir
