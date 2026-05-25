"""W7.5 — End-to-end PAR provenance bundle.

Combines `merkle_tree` (commitment over PAR rows) with an ed25519
signature (re-using W5.6 `cryptography` dependency) so a regulator can
verify any individual PAR cell value with three pieces of evidence:

  1. The cell content (PAR row dict)
  2. The inclusion proof (path from leaf to root)
  3. The signed root + public key

`build_provenance()` returns a `ProvenanceArtifact` that serializes to
a JSON dict suitable for inclusion in the W5.6 cert bundle under
`provenance/par_provenance.json`.

Verification is offline + stand-alone — only stdlib `hashlib`,
`json`, and `cryptography.hazmat.primitives.asymmetric.ed25519`.
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature

from .merkle_tree import (
    InclusionProof,
    MerkleTree,
    build_merkle_tree,
    canonicalize_par_row,
    hash_leaf,
    hash_inner,
)


@dataclass
class ProvenanceArtifact:
    """Full signed provenance bundle.

    Fields:
      merkle_root_hex   — SHA-256 root of the canonicalized PAR Merkle tree
      tree_size         — number of leaves (PAR rows committed)
      signature_hex     — ed25519 signature over (root || tree_size || meta_hash)
      pubkey_pem        — ed25519 SubjectPublicKeyInfo PEM
      meta              — { vendor, swid, par_source, build_time_utc }
      meta_hash_hex     — SHA-256 over canonical meta JSON
      version           — provenance schema version
    """
    merkle_root_hex: str
    tree_size: int
    signature_hex: str
    pubkey_pem: bytes
    meta: dict[str, Any]
    meta_hash_hex: str
    version: str = "1.0.0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "merkle_root": self.merkle_root_hex,
            "tree_size": self.tree_size,
            "signature": self.signature_hex,
            "pubkey_pem": self.pubkey_pem.decode("ascii"),
            "meta": self.meta,
            "meta_hash": self.meta_hash_hex,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ProvenanceArtifact":
        return cls(
            version=d.get("version", "1.0.0"),
            merkle_root_hex=d["merkle_root"],
            tree_size=int(d["tree_size"]),
            signature_hex=d["signature"],
            pubkey_pem=d["pubkey_pem"].encode("ascii"),
            meta=d["meta"],
            meta_hash_hex=d["meta_hash"],
        )


def _meta_hash(meta: dict[str, Any]) -> bytes:
    """Canonical SHA-256 over meta dict (stable across Python versions)."""
    blob = json.dumps(meta, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).digest()


def _signing_payload(root: bytes, tree_size: int, meta_hash: bytes) -> bytes:
    """Bytes that get ed25519-signed: domain-tag || root || tree_size_be ||
    meta_hash. Domain-separation tag prevents cross-protocol reuse."""
    return (
        b"slot-math-engine-template/par-provenance/v1\x00"
        + root
        + tree_size.to_bytes(8, "big")
        + meta_hash
    )


def build_provenance(
    par_rows: list[Any],
    *,
    sign_key_pem: bytes | None = None,
    meta: dict[str, Any] | None = None,
) -> tuple[ProvenanceArtifact, MerkleTree]:
    """Build a signed provenance artifact + return the Merkle tree.

    `sign_key_pem` — ed25519 PKCS8 PEM. If None, generates ephemeral.
    `meta`         — vendor / swid / build info; canonical-hashed into
                     the signing payload.

    Returns:
      (artifact, tree) — tree is kept so caller can emit per-cell proofs.
    """
    if not par_rows:
        raise ValueError("cannot build provenance over zero PAR rows")

    tree = build_merkle_tree(par_rows)

    # Sign root + meta
    if sign_key_pem is None:
        sk = Ed25519PrivateKey.generate()
    else:
        loaded = serialization.load_pem_private_key(sign_key_pem, password=None)
        if not isinstance(loaded, Ed25519PrivateKey):
            raise ValueError("expected ed25519 PKCS8 PEM key")
        sk = loaded

    meta = meta or {}
    mh = _meta_hash(meta)
    payload = _signing_payload(tree.root_hash, tree.size, mh)
    sig = sk.sign(payload)

    pub_pem = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    artifact = ProvenanceArtifact(
        merkle_root_hex=tree.root_hash.hex(),
        tree_size=tree.size,
        signature_hex=sig.hex(),
        pubkey_pem=pub_pem,
        meta=meta,
        meta_hash_hex=mh.hex(),
    )
    return artifact, tree


def verify_signed_root(artifact: ProvenanceArtifact) -> bool:
    """Verify the ed25519 signature over (root || tree_size || meta_hash)."""
    try:
        pub = serialization.load_pem_public_key(artifact.pubkey_pem)
        if not isinstance(pub, Ed25519PublicKey):
            return False
        root = bytes.fromhex(artifact.merkle_root_hex)
        mh = bytes.fromhex(artifact.meta_hash_hex)
        payload = _signing_payload(root, artifact.tree_size, mh)
        pub.verify(bytes.fromhex(artifact.signature_hex), payload)

        # Also verify meta_hash matches meta dict (catches meta tamper)
        recomputed_mh = _meta_hash(artifact.meta)
        if recomputed_mh.hex() != artifact.meta_hash_hex:
            return False
        return True
    except (InvalidSignature, ValueError, KeyError):
        return False


def verify_proof(
    cell: Any, proof: InclusionProof, artifact: ProvenanceArtifact,
) -> bool:
    """Verify that `cell` is the row at `proof.leaf_index` and that the
    proof reconstructs the artifact's signed root.

    Three checks:
      1. Signed root verifies under artifact's public key
      2. `proof.leaf_hash` == SHA-256(0x00 || canonicalize(cell))
      3. Path reconstructs to artifact.merkle_root
    """
    if not verify_signed_root(artifact):
        return False
    expected_leaf = hash_leaf(canonicalize_par_row(cell))
    if expected_leaf != proof.leaf_hash:
        return False
    root = bytes.fromhex(artifact.merkle_root_hex)
    return proof.verify(root)
