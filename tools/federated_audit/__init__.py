"""PHASE 22 — Federated Math Audit.

Multi-party verification protocol where operator + regulator + 3rd-party
auditor can each verify a math claim without sharing private inputs.

Protocol:
  1. Operator commits SHA-256(IR + nonce) → publishes commit hash
  2. Auditor + regulator independently compute closed-form RTP from
     their cached copy of the IR (or a redacted view) → publish their
     own commit hashes
  3. Operator reveals IR + nonce → everyone verifies their commit
  4. Consensus claim: all three parties' computed RTPs agree within
     tolerance → audit passes.

This kernel implements the cryptographic glue + the consensus check.
Pure stdlib.
"""

from __future__ import annotations

from tools.federated_audit.protocol import (
    PartyCommit,
    AuditTranscript,
    party_commit,
    verify_party_commit,
    build_audit_transcript,
    audit_consensus,
)

__all__ = [
    "PartyCommit",
    "AuditTranscript",
    "party_commit",
    "verify_party_commit",
    "build_audit_transcript",
    "audit_consensus",
]
