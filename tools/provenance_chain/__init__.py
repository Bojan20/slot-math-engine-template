"""W80 — Verifiable Provenance Chain.

Full chain-of-custody Merkle commitment from raw PAR cells through
IR to cert XML, designed so a regulator can verify ANY single leaf
without trusting the entire bundle:

  Layer 0  PAR cells     →  per-cell SHA-256 leaves
  Layer 1  Merkle root   →  pairwise SHA-256 reduction
  Layer 2  IR digest     →  canonical SHA-256 over IR with lock-hash stripped
  Layer 3  Cert chain    →  ChainCommitment = SHA-256(merkle_root || ir_digest || timestamp_iso)

The chain supports **selective disclosure**: a regulator can
request a Merkle proof for a SPECIFIC PAR cell (e.g. row 47 col 3
= "free spins trigger probability") without seeing the rest of the
PAR.  This is zk-SNARK adjacent — no zero-knowledge ON the cell
value itself, but a proof of inclusion without revealing siblings.

Public API
==========
    from tools.provenance_chain import (
        build_chain,
        verify_chain,
        merkle_proof,
        verify_merkle_proof,
        ChainCommitment,
    )
"""
from tools.provenance_chain.chain import (
    ChainCommitment,
    ChainVerifyReport,
    MerkleProofPath,
    build_chain,
    verify_chain,
    merkle_proof,
    verify_merkle_proof,
)

__all__ = [
    "ChainCommitment",
    "ChainVerifyReport",
    "MerkleProofPath",
    "build_chain",
    "verify_chain",
    "merkle_proof",
    "verify_merkle_proof",
]
