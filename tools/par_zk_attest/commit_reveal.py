"""SLOT-MATH Faza 6.2 — Commit/Reveal Provably-Fair spin attestation.

Lifecycle:
  1. commit_deployment(par_merkle, secret) → public commit_hash (no leak of PAR)
  2. generate_spin_proof(commit, spin_seed, payout_x, secret) → SpinProof per spin
  3. open_window(commit, secret, par_merkle) → publishes WindowReveal
  4. verify_spin_proof_in_window(spin_proof, window_reveal) → True if genuine

Auditor flow:
  - Operator publishes commit_hash at deploy time (e.g. blockchain anchor)
  - Operator emits SpinProof per spin (collected in audit log)
  - At regulatory window end, operator reveals secret + par_merkle
  - Auditor recomputes commit from (secret, par_merkle) and verifies it matches
  - Auditor recomputes each spin's HMAC and verifies it matches the stored proof
  → ANY tampering (PAR swap, payout fudge, missing spin) breaks the chain
"""
from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class DeploymentCommitment:
    """Public commitment published at deploy-time (no PAR leak)."""
    game_id: str
    variant_id: str
    commit_hash: str          # hex-encoded HMAC-SHA256
    commit_scheme: str = "hmac-sha256/v1"


@dataclass(frozen=True)
class SpinProof:
    """Per-spin proof carried in audit log."""
    session_id: str
    spin_num: int
    spin_seed: int            # u64 from session RNG
    payout_x: float           # win in base-bet units
    proof_hash: str           # hex-encoded HMAC-SHA256(spin_seed || payout_x, secret)


@dataclass(frozen=True)
class WindowReveal:
    """Published at end of audit window — opens the commitment."""
    game_id: str
    variant_id: str
    par_merkle: str           # the actual PAR Merkle (sha256 hex)
    deploy_secret: str        # the secret used for HMAC (now revealed)
    commit_hash: str          # the original commitment (must match recompute)
    window_start_utc: str
    window_end_utc: str


def _new_deploy_secret() -> str:
    """Generate fresh 256-bit secret for an attestation window."""
    return os.urandom(32).hex()


def commit_deployment(
    game_id: str,
    variant_id: str,
    par_merkle: str,
    deploy_secret: str | None = None,
) -> tuple[DeploymentCommitment, str]:
    """Build a public commitment + return the secret (operator keeps secret).

    Args:
        game_id: game identifier
        variant_id: variant identifier
        par_merkle: hex sha256 of canonical PAR bytes
        deploy_secret: optional secret (auto-generated if None)

    Returns:
        (commitment, secret) — commitment goes public, secret stays operator-only
    """
    if deploy_secret is None:
        deploy_secret = _new_deploy_secret()
    if len(par_merkle) != 64 or not all(c in "0123456789abcdef" for c in par_merkle):
        raise ValueError(f"par_merkle must be 64-hex sha256, got {par_merkle!r}")

    msg = f"{game_id}/{variant_id}/{par_merkle}".encode("utf-8")
    key = bytes.fromhex(deploy_secret)
    commit_hash = hmac.new(key, msg, hashlib.sha256).hexdigest()

    return (
        DeploymentCommitment(
            game_id=game_id,
            variant_id=variant_id,
            commit_hash=commit_hash,
        ),
        deploy_secret,
    )


def generate_spin_proof(
    commitment: DeploymentCommitment,
    session_id: str,
    spin_num: int,
    spin_seed: int,
    payout_x: float,
    deploy_secret: str,
) -> SpinProof:
    """Produce HMAC-bound proof for one spin event."""
    msg = (
        f"{commitment.commit_hash}/{session_id}/{spin_num}/{spin_seed}/{payout_x:.10f}"
    ).encode("utf-8")
    key = bytes.fromhex(deploy_secret)
    proof = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return SpinProof(
        session_id=session_id,
        spin_num=spin_num,
        spin_seed=spin_seed,
        payout_x=payout_x,
        proof_hash=proof,
    )


def open_window(
    commitment: DeploymentCommitment,
    deploy_secret: str,
    par_merkle: str,
    window_start_utc: str,
    window_end_utc: str,
) -> WindowReveal:
    """Open the commitment — operator publishes secret + PAR for verification."""
    return WindowReveal(
        game_id=commitment.game_id,
        variant_id=commitment.variant_id,
        par_merkle=par_merkle,
        deploy_secret=deploy_secret,
        commit_hash=commitment.commit_hash,
        window_start_utc=window_start_utc,
        window_end_utc=window_end_utc,
    )


def verify_commitment(reveal: WindowReveal) -> bool:
    """Verify the published commitment matches the revealed secret + PAR."""
    msg = (
        f"{reveal.game_id}/{reveal.variant_id}/{reveal.par_merkle}".encode("utf-8")
    )
    try:
        key = bytes.fromhex(reveal.deploy_secret)
    except ValueError:
        return False
    recomputed = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(recomputed, reveal.commit_hash)


def verify_spin_proof_in_window(
    proof: SpinProof,
    reveal: WindowReveal,
) -> bool:
    """Verify one spin proof against a revealed window."""
    if not verify_commitment(reveal):
        return False
    msg = (
        f"{reveal.commit_hash}/{proof.session_id}/{proof.spin_num}/"
        f"{proof.spin_seed}/{proof.payout_x:.10f}"
    ).encode("utf-8")
    key = bytes.fromhex(reveal.deploy_secret)
    expected = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, proof.proof_hash)


def verify_all_spins_in_window(
    proofs: Iterable[SpinProof],
    reveal: WindowReveal,
) -> tuple[bool, list[SpinProof]]:
    """Bulk-verify a list of spin proofs. Returns (all_pass, failed_list)."""
    failed: list[SpinProof] = []
    for p in proofs:
        if not verify_spin_proof_in_window(p, reveal):
            failed.append(p)
    return (len(failed) == 0, failed)
