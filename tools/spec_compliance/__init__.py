"""W34 — Spec Compliance Gate.

Cross-checks three sources of truth for one game and reports any
divergence:

  1. **Math doc** (`docs/<game>/MATH.md`) — designer's published spec
     (target RTP, hit_freq, paytable summary, feature trigger rate).
  2. **IR** (`*.ir.json`) — engine-canonical configuration.
  3. **Closed-form kernel param** (Python dataclass instance) — the
     fast estimator used in CI pre-MC.

The gate verifies:

  ✓ IR.meta.target_rtp ↔ math doc target RTP (within ±1 bp)
  ✓ IR.paytable rows match math doc paytable rows (combo + pays)
  ✓ closed-form analytical RTP within tolerance of IR target_rtp
  ✓ no extra paytable rows in IR that aren't in doc (and vice versa)

Exit 1 on any failure. Pre-commit hook ready.
"""
from tools.spec_compliance.gate import (
    ComplianceIssue,
    ComplianceReport,
    extract_doc_facts,
    extract_ir_facts,
    diff_facts,
    run_gate,
)

__all__ = [
    "ComplianceIssue",
    "ComplianceReport",
    "extract_doc_facts",
    "extract_ir_facts",
    "diff_facts",
    "run_gate",
]
