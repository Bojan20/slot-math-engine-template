"""PHASE 44 — Build Section Audit harness.

Three-agent audit pipeline for the Studio Build section:

  1. Build Button Auditor    — every button is wired, every error path
                               surfaces a UI signal, every mutating
                               handler re-validates the IR.
  2. Weight Precision Auditor — every weight computation is exact
                               within the closed-form contract.
  3. Math Algorithm Auditor  — every math kernel reproduces an
                               independent Fraction-exact derivation.

Public API:

    from tools.build_audit import (
        audit_build_buttons,
        audit_weight_precision,
        audit_math_algorithms,
        run_full_audit,
    )

    report = run_full_audit(repo_root)
    # → BuildAuditReport with per-button / weight / algorithm verdicts.
"""

from tools.build_audit.button_auditor import (
    BUILD_BUTTON_IDS,
    ButtonFinding,
    audit_build_buttons,
)
from tools.build_audit.harness import BuildAuditReport, run_full_audit
from tools.build_audit.math_auditor import (
    MathAlgorithmFinding,
    audit_math_algorithms,
)
from tools.build_audit.weight_auditor import (
    WeightCheckFinding,
    audit_weight_precision,
)

__all__ = [
    "BUILD_BUTTON_IDS",
    "BuildAuditReport",
    "ButtonFinding",
    "MathAlgorithmFinding",
    "WeightCheckFinding",
    "audit_build_buttons",
    "audit_math_algorithms",
    "audit_weight_precision",
    "run_full_audit",
]
