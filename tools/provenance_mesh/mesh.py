"""W7.5 — Provenance Mesh implementation."""

from __future__ import annotations

import base64
import dataclasses
import hashlib
import json
from pathlib import Path
from typing import Any

from tools.provenance_chain.chain import (
    MerkleProofPath,
    merkle_proof,
    merkle_root,
    verify_merkle_proof,
)


# ─── Per-spin receipt ───────────────────────────────────────────────


@dataclasses.dataclass
class SpinReceipt:
    """One immutable spin record. ``parent_sha256_hex`` is the sha256
    of the *previous* receipt's canonical bytes (or empty string for
    receipt 0), giving the session a linear hash chain on top of the
    Merkle root.

    Canonical encoding (deterministic, sort_keys=True)::

        {
          "session_id": "...",
          "index": N,
          "server_seed_hex": "...",
          "client_seed": "...",
          "nonce": M,
          "outcome": <any JSON-serializable>,
          "parent_sha256_hex": "..."
        }
    """

    session_id: str
    index: int
    server_seed_hex: str
    client_seed: str
    nonce: int
    outcome: Any
    parent_sha256_hex: str

    def canonical_bytes(self) -> bytes:
        return json.dumps(
            {
                "session_id": self.session_id,
                "index": self.index,
                "server_seed_hex": self.server_seed_hex,
                "client_seed": self.client_seed,
                "nonce": self.nonce,
                "outcome": self.outcome,
                "parent_sha256_hex": self.parent_sha256_hex,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()

    def sha256_hex(self) -> str:
        return hashlib.sha256(self.canonical_bytes()).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


# ─── Session mesh ───────────────────────────────────────────────────


@dataclasses.dataclass
class SessionMesh:
    """Append-only ledger of spin receipts + Merkle root."""

    session_id: str
    receipts: list[SpinReceipt]
    merkle_root_hex: str

    def receipt_count(self) -> int:
        return len(self.receipts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "merkle_root_hex": self.merkle_root_hex,
            "receipts": [r.to_dict() for r in self.receipts],
        }


def build_session_mesh(
    session_id: str,
    spins: list[dict[str, Any]],
) -> SessionMesh:
    """Construct a SessionMesh from a list of raw spin dicts.

    Each input dict must carry ``server_seed_hex``, ``client_seed``,
    ``nonce``, ``outcome``. The function fills in ``parent_sha256_hex``
    automatically by linking each receipt to the previous one's hash.
    Order in `spins` is the on-chain order.
    """
    receipts: list[SpinReceipt] = []
    prev_hash = ""
    for i, raw in enumerate(spins):
        rec = SpinReceipt(
            session_id=session_id,
            index=i,
            server_seed_hex=str(raw["server_seed_hex"]),
            client_seed=str(raw["client_seed"]),
            nonce=int(raw["nonce"]),
            outcome=raw["outcome"],
            parent_sha256_hex=prev_hash,
        )
        receipts.append(rec)
        prev_hash = rec.sha256_hex()

    leaves = [bytes.fromhex(r.sha256_hex()) for r in receipts]
    root = merkle_root(leaves) if leaves else b""
    return SessionMesh(
        session_id=session_id,
        receipts=receipts,
        merkle_root_hex=root.hex() if leaves else "",
    )


# ─── Per-spin inclusion proof ───────────────────────────────────────


@dataclasses.dataclass
class SpinProof:
    session_id: str
    index: int
    receipt: SpinReceipt
    leaf_hash_hex: str
    siblings: list[dict[str, str]]
    merkle_root_hex: str

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def mint_spin_proof(mesh: SessionMesh, index: int) -> SpinProof:
    if not (0 <= index < mesh.receipt_count()):
        raise IndexError(f"spin index {index} out of range")
    leaves = [bytes.fromhex(r.sha256_hex()) for r in mesh.receipts]
    path: MerkleProofPath = merkle_proof(leaves, index)
    rec = mesh.receipts[index]
    return SpinProof(
        session_id=mesh.session_id,
        index=index,
        receipt=rec,
        leaf_hash_hex=path.leaf_hash,
        siblings=[{"hash": h, "dir": d} for h, d in path.siblings],
        merkle_root_hex=mesh.merkle_root_hex,
    )


def verify_spin_proof(
    proof: SpinProof, claimed_receipt: SpinReceipt, root_hex: str,
) -> bool:
    """Re-derive the Merkle root from `claimed_receipt`'s canonical
    bytes + sibling path; compare to `root_hex`."""
    leaf_hash = hashlib.sha256(claimed_receipt.canonical_bytes()).hexdigest()
    if leaf_hash != proof.leaf_hash_hex:
        return False
    rebuilt = MerkleProofPath(
        leaf_index=proof.index,
        leaf_hash=leaf_hash,
        siblings=[(s["hash"], s["dir"]) for s in proof.siblings],
    )
    return verify_merkle_proof(
        leaf_hash_hex=leaf_hash, proof=rebuilt, root_hex=root_hex,
    )


# ─── ed25519 sign / verify ──────────────────────────────────────────


@dataclasses.dataclass
class SignedSessionRoot:
    session_id: str
    merkle_root_hex: str
    n_receipts: int
    signature_b64: str

    def canonical_payload(self) -> bytes:
        return json.dumps(
            {
                "session_id": self.session_id,
                "merkle_root_hex": self.merkle_root_hex,
                "n_receipts": self.n_receipts,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def sign_session_root(
    mesh: SessionMesh, *, private_pem: Path,
) -> SignedSessionRoot:
    """Sign (session_id, merkle_root, n_receipts) with the bundle's ed25519 key."""
    from tools.cert_bundle_swid.sign import sign_bytes  # noqa: PLC0415

    payload = json.dumps(
        {
            "session_id": mesh.session_id,
            "merkle_root_hex": mesh.merkle_root_hex,
            "n_receipts": mesh.receipt_count(),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    sig = sign_bytes(payload, private_pem_path=private_pem)
    return SignedSessionRoot(
        session_id=mesh.session_id,
        merkle_root_hex=mesh.merkle_root_hex,
        n_receipts=mesh.receipt_count(),
        signature_b64=base64.b64encode(sig).decode("ascii"),
    )


def verify_session_signature(
    signed: SignedSessionRoot, *, public_pem: Path,
) -> bool:
    from tools.cert_bundle_swid.sign import verify_signature  # noqa: PLC0415

    sig = base64.b64decode(signed.signature_b64.encode("ascii"))
    return verify_signature(
        signed.canonical_payload(),
        sig,
        public_pem_path=public_pem,
    )
