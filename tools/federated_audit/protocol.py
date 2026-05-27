"""PHASE 22 — Federated audit protocol primitives.

Each party (operator, auditor, regulator) computes their own RTP
estimate from their copy of the IR + commits SHA-256(rtp || nonce ||
party_id). The orchestrator collects the three commits, then asks each
party to reveal. On reveal, every party can verify everyone else's
commit + check that the cohort's RTP estimates agree within tolerance.

This is **not** a zero-knowledge protocol — it's a commit-reveal
fairness protocol. ZK would require a full SNARK stack; we deliberately
keep this dependency-free.

Domain tag `slotmath-federated-audit-v1` prevents replay against W7.5
PAR provenance or PHASE 19 theorem-prover signatures.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import struct
from dataclasses import dataclass, asdict, field
from typing import Any


_DOMAIN_TAG = b"slotmath-federated-audit-v1"


@dataclass(frozen=True)
class PartyCommit:
    party_id: str
    commit_hash_hex: str
    revealed_rtp: float | None = None     # populated after reveal
    revealed_nonce_hex: str | None = None


@dataclass
class AuditTranscript:
    schema_version: str = "urn:slotmath:federated-audit:v1"
    domain_tag: str = field(default=_DOMAIN_TAG.decode())
    parties: list[PartyCommit] = field(default_factory=list)
    tolerance: float = 0.005
    consensus_rtp: float | None = None
    max_pairwise_delta: float = 0.0
    passed: bool = False
    failure_reason: str = ""


def party_commit(
    party_id: str,
    rtp: float,
    *,
    nonce_hex: str | None = None,
) -> PartyCommit:
    """Build a PartyCommit (commit phase only — revealed_* are None)."""
    if not party_id:
        raise ValueError("party_id must be non-empty")
    if nonce_hex is None:
        nonce_hex = secrets.token_hex(32)
    else:
        try:
            bytes.fromhex(nonce_hex)
        except ValueError as exc:
            raise ValueError(f"nonce_hex must be valid hex: {exc}") from None
    payload = (
        _DOMAIN_TAG
        + party_id.encode("utf-8")
        + struct.pack(">d", float(rtp))
        + bytes.fromhex(nonce_hex)
    )
    commit = hashlib.sha256(payload).hexdigest()
    return PartyCommit(
        party_id=party_id,
        commit_hash_hex=commit,
        revealed_rtp=None,
        revealed_nonce_hex=None,
    )


def verify_party_commit(
    commit: PartyCommit,
    *,
    revealed_rtp: float,
    revealed_nonce_hex: str,
) -> bool:
    """Re-hash the reveal + compare to the original commit."""
    try:
        re_payload = (
            _DOMAIN_TAG
            + commit.party_id.encode("utf-8")
            + struct.pack(">d", float(revealed_rtp))
            + bytes.fromhex(revealed_nonce_hex)
        )
    except ValueError:
        return False
    expected = hashlib.sha256(re_payload).hexdigest()
    return hmac.compare_digest(expected, commit.commit_hash_hex)


def build_audit_transcript(
    *,
    parties: list[tuple[str, float, str]],   # (party_id, revealed_rtp, nonce_hex)
    tolerance: float = 0.005,
) -> AuditTranscript:
    """Single-call helper: build commits, reveal, run consensus check.

    Each party tuple is `(party_id, revealed_rtp, nonce_hex)`.
    """
    if len(parties) < 2:
        raise ValueError("federated audit requires ≥ 2 parties")
    if tolerance < 0:
        raise ValueError("tolerance must be ≥ 0")

    transcript = AuditTranscript(tolerance=tolerance)
    commits: list[PartyCommit] = []
    for party_id, rtp, nonce in parties:
        c = party_commit(party_id, rtp, nonce_hex=nonce)
        # Attach reveal data immediately for transcript record
        c = PartyCommit(
            party_id=c.party_id,
            commit_hash_hex=c.commit_hash_hex,
            revealed_rtp=float(rtp),
            revealed_nonce_hex=nonce,
        )
        commits.append(c)
    transcript.parties = commits

    return audit_consensus(transcript)


def audit_consensus(transcript: AuditTranscript) -> AuditTranscript:
    """Run consensus check on a transcript whose parties are revealed.

    Each party_commit is re-verified; pairwise RTP deltas are computed;
    `passed=True` iff every commit verifies AND max delta ≤ tolerance.
    Mutates the transcript in place AND returns it.
    """
    if len(transcript.parties) < 2:
        transcript.passed = False
        transcript.failure_reason = "fewer than 2 parties"
        return transcript

    rtps: list[float] = []
    for p in transcript.parties:
        if p.revealed_rtp is None or p.revealed_nonce_hex is None:
            transcript.passed = False
            transcript.failure_reason = f"party {p.party_id!r} not revealed"
            return transcript
        if not verify_party_commit(p,
                                     revealed_rtp=p.revealed_rtp,
                                     revealed_nonce_hex=p.revealed_nonce_hex):
            transcript.passed = False
            transcript.failure_reason = (
                f"party {p.party_id!r} commit verification failed"
            )
            return transcript
        rtps.append(p.revealed_rtp)

    consensus = sum(rtps) / len(rtps)
    max_delta = max(abs(r - consensus) for r in rtps)
    transcript.consensus_rtp = consensus
    transcript.max_pairwise_delta = max_delta
    if max_delta > transcript.tolerance:
        transcript.passed = False
        transcript.failure_reason = (
            f"max delta {max_delta:.6f} > tolerance {transcript.tolerance:.6f}"
        )
    else:
        transcript.passed = True
        transcript.failure_reason = ""
    return transcript


def transcript_to_dict(transcript: AuditTranscript) -> dict[str, Any]:
    return asdict(transcript)
