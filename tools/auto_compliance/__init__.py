"""PHASE 36 — Auto-Compliance Doc Generator.

Per-jurisdiction markdown disclosure document generator. Walks IR +
P19 theorem-prover certs + P23 risk-engine summary + P29 drift state
and emits a regulator-deliverable markdown report.

Supported jurisdictions (covered rule packs):
  - UKGC RTS 7.4 + 12 + 14
  - MGA PPD §11
  - GLI-19
  - eCOGRA §4.1.3
  - EU GA 2024 Art. 7

Public API:
    from tools.auto_compliance import emit_compliance_doc, ComplianceInputs
"""

from __future__ import annotations

from tools.auto_compliance.doc_gen import (
    ComplianceInputs,
    emit_compliance_doc,
    SUPPORTED_JURISDICTIONS,
)

__all__ = ["ComplianceInputs", "emit_compliance_doc", "SUPPORTED_JURISDICTIONS"]
