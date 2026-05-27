"""PHASE 19 — Slot Math Theorem Prover.

Z3-driven (with graceful pure-Python fallback) formal-proof generator
for slot-math claims. Emits a machine-checkable proof certificate
that a regulator/auditor can re-verify offline without re-running MC.

Supported claim kinds (initial):
  - `rtp_upper_bound`         RTP(ir) ≤ U
  - `rtp_lower_bound`         RTP(ir) ≥ L
  - `rtp_in_band`             L ≤ RTP(ir) ≤ U
  - `paytable_consistency`    every paytable entry's pay is ≥ 0 and
                              non-zero for at least one combo
  - `reel_weight_positive`    every reel weight > 0 (rational sample)
  - `max_win_cap_compliance`  max single-win-multiplier ≤ jurisdiction cap

Output: `ProofCertificate(claim, ir_hash, prover, status, evidence,
                            timestamp, schema_version)`.

CLI:
  python -m tools.theorem_prover prove --ir IR.json \\
      --claim "rtp_upper_bound:0.97" --out cert.json

Status values:
  - "verified"        prover returned UNSAT (no counter-example exists)
                       — claim is true under the SMT theory chosen
  - "refuted"         prover returned SAT with concrete counter-example
  - "unknown"         solver timed out or returned UNKNOWN
  - "engine_absent"   z3-solver lib not installed; pure-Python fallback
                       could prove the claim by direct inspection
                       (returned status = "verified_fallback")
"""

from __future__ import annotations

from tools.theorem_prover.prover import (
    ProofCertificate,
    ClaimSpec,
    prove,
    parse_claim,
    verify_certificate,
    canonical_ir_hash,
)

__all__ = [
    "ProofCertificate",
    "ClaimSpec",
    "prove",
    "parse_claim",
    "verify_certificate",
    "canonical_ir_hash",
]
