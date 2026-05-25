"""W7.5 — Crypto-verifiable PAR provenance.

Industry-first per Kimi research: no commercial slot studio publishes a
math-provenance chain where a regulator can verify any individual PAR
cell value against a signed commitment without rerunning the full MC.

This module produces:

  ▸ Merkle tree over canonicalized PAR rows (SHA-256 inner nodes)
  ▸ ed25519 signature over the Merkle root + cert manifest hash
  ▸ Per-cell inclusion proofs (path from leaf to root)
  ▸ Stand-alone Python verifier (no external deps beyond
    `cryptography` for ed25519)

Public API:

    from tools.provenance import build_provenance, verify_proof
    artifact = build_provenance(par_rows, sign_key_pem)
    ok = verify_proof(proof, signed_root, pubkey_pem)
"""

from .merkle_tree import (
    MerkleTree,
    InclusionProof,
    canonicalize_par_row,
    build_merkle_tree,
)
from .par_provenance import (
    ProvenanceArtifact,
    build_provenance,
    verify_proof,
    verify_signed_root,
)

__all__ = [
    "MerkleTree",
    "InclusionProof",
    "canonicalize_par_row",
    "build_merkle_tree",
    "ProvenanceArtifact",
    "build_provenance",
    "verify_proof",
    "verify_signed_root",
]
