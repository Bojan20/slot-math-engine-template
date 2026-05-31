"""SLOT-MATH Faza 6.2 — Zero-knowledge attestation.

RGS proves to regulator that EACH spin was produced from the cryptographically-
pinned PAR Merkle WITHOUT revealing the proprietary paytable or reels.

Construction: hash-based commit/reveal w/ HMAC-SHA256.
  - At deploy: commit = HMAC(par_merkle, deploy_secret) → public commit_hash
  - Per spin: rgs emits {spin_seed, payout_x, hmac(spin_seed || payout_x, deploy_secret)}
  - Regulator can verify spin_hash matches HMAC w/o seeing deploy_secret OR PAR contents
  - At end-of-window: rgs reveals deploy_secret + PAR Merkle → regulator recomputes
    chain head and verifies every spin in the window is genuine

This is NOT a SNARK/STARK — those are overkill for slot-math RTP audit.
This is the same primitive Stake/crash games use (provably fair commit/reveal)
extended across the entire spin sequence, not just one spin.
"""
from tools.par_zk_attest.commit_reveal import (
    DeploymentCommitment,
    SpinProof,
    WindowReveal,
    commit_deployment,
    generate_spin_proof,
    open_window,
    verify_spin_proof_in_window,
)

__all__ = [
    "DeploymentCommitment",
    "SpinProof",
    "WindowReveal",
    "commit_deployment",
    "generate_spin_proof",
    "open_window",
    "verify_spin_proof_in_window",
]
