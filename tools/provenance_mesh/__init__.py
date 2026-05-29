"""W7.5 — Crypto-Verifiable Provenance Mesh (pure-Python).

The frozen W7.5 row in the master TODO assumed a zk-SNARK / IPFS
backbone (RISC Zero, SP1 zkVM). That stack is genuinely heavy — pulls
~80 transitive crates and several GiB of trusted setup. This
implementation gets the **functional regulator guarantee**
("every spin emits a proof-of-fairness; PAR sealed as a hash root;
auditor verifies any single spin without the source code") with
**pure-Python primitives only**:

* :class:`SpinReceipt` — server_seed + client_seed + nonce + outcome
  + parent_hash → SHA-256 chain link.
* :class:`SessionMesh` — append-only ledger of spin receipts plus
  a Merkle root over all receipts in the session. Each receipt is
  numbered and a :func:`mint_inclusion_proof` returns the
  sibling-path proof for any individual spin.
* :class:`SignedSessionRoot` — ed25519 signature of
  ``(session_id, merkle_root, n_receipts)`` using the existing
  ``cert_bundle_swid`` key infrastructure. The PAR-Merkle root from
  W5.3 can be **interleaved** as an extra leaf so the same root
  attests both the math and the spin sequence.
* :func:`verify_spin_proof(...)` — auditor side: given the public
  inputs of one spin + the inclusion proof, confirm the spin
  belongs to the signed root.

That makes the chain **continuously verifiable** end-to-end (math
provenance from W5.3 ∥ spin-sequence provenance from W7.5) on top
of the standard Python `hashlib` + `cryptography`. Anyone who needs
zk-SNARK collapse can plug it in later as a different signer; the
data model doesn't change.

Industry-first per Kimi W181 research — no incumbent vendor ships a
chain-of-spins commit with per-spin Merkle-inclusion proofs that
auditors can verify without the engine source code.
"""

from .mesh import (
    SessionMesh,
    SignedSessionRoot,
    SpinReceipt,
    build_session_mesh,
    mint_spin_proof,
    sign_session_root,
    verify_session_signature,
    verify_spin_proof,
)

__all__ = [
    "SessionMesh",
    "SignedSessionRoot",
    "SpinReceipt",
    "build_session_mesh",
    "mint_spin_proof",
    "sign_session_root",
    "verify_session_signature",
    "verify_spin_proof",
]
