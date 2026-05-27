"""PHASE 34 — Cert XML v3 schema.

Next-generation regulator cert XML carrying everything v1+v2 already
shipped PLUS:
  - W7.5 PAR Merkle root reference (inclusion-proof-friendly)
  - P19 theorem-prover certificates list (machine-checkable claims)
  - P22 federated-audit transcript hash
  - P28 DP privacy-budget metadata when telemetry was exported
  - P32 type-check report status

Namespace: `urn:slotmath:cert:v3`.

Public API:
    from tools.cert_xml_v3 import emit_cert_xml_v3, validate_cert_xml_v3
"""

from __future__ import annotations

from tools.cert_xml_v3.emitter import (
    CertV3Input,
    CertV3ValidationReport,
    emit_cert_xml_v3,
    validate_cert_xml_v3,
)

__all__ = [
    "CertV3Input",
    "CertV3ValidationReport",
    "emit_cert_xml_v3",
    "validate_cert_xml_v3",
]
