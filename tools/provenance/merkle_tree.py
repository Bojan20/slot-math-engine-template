"""W7.5 — Merkle tree over canonicalized PAR cells.

Canonical SHA-256 binary Merkle tree with sibling-padding (RFC 6962
style). Leaves are SHA-256 of canonical JSON-encoded PAR rows; inner
nodes are SHA-256 of concatenated child hashes.

Public types:

  MerkleTree       — built tree with `root_hash`, leaves, layers.
  InclusionProof   — list of (sibling_hash, side) tuples from leaf to
                     root that lets a verifier reconstruct the root.

Building:

    tree = build_merkle_tree(rows)        # canonicalize + hash + build
    root = tree.root_hash                 # 32-byte SHA-256
    proof = tree.proof_for(leaf_index)    # InclusionProof
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


def canonicalize_par_row(row: Any) -> bytes:
    """Canonical JSON encoding of a single PAR row (or arbitrary cell).

    Sort keys + UTF-8 + no whitespace = deterministic byte serialization
    that produces stable hashes across Python versions / machines.
    Numeric types preserved (int vs float). None / strings unchanged.
    """
    return json.dumps(
        row,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")


def hash_leaf(canonical_bytes: bytes) -> bytes:
    """RFC-6962 leaf hash: H(0x00 || data)."""
    h = hashlib.sha256()
    h.update(b"\x00")
    h.update(canonical_bytes)
    return h.digest()


def hash_inner(left: bytes, right: bytes) -> bytes:
    """RFC-6962 inner hash: H(0x01 || left || right)."""
    h = hashlib.sha256()
    h.update(b"\x01")
    h.update(left)
    h.update(right)
    return h.digest()


@dataclass
class InclusionProof:
    """Proof that `leaf_hash` is at index `leaf_index` in a tree with
    `root_hash` and `tree_size` leaves.

    `path` is a list of (sibling_hash, side) where:
      side == "left"  → sibling was the LEFT child (we are the right)
      side == "right" → sibling was the RIGHT child (we are the left)
    """

    leaf_hash: bytes
    leaf_index: int
    tree_size: int
    path: list[tuple[bytes, str]] = field(default_factory=list)

    def verify(self, root_hash: bytes) -> bool:
        """Walk the path, re-hash to root, compare to expected root_hash."""
        current = self.leaf_hash
        for sibling, side in self.path:
            if side == "left":
                current = hash_inner(sibling, current)
            else:
                current = hash_inner(current, sibling)
        return current == root_hash

    def to_dict(self) -> dict[str, Any]:
        return {
            "leaf_hash": self.leaf_hash.hex(),
            "leaf_index": self.leaf_index,
            "tree_size": self.tree_size,
            "path": [(s.hex(), side) for s, side in self.path],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "InclusionProof":
        return cls(
            leaf_hash=bytes.fromhex(d["leaf_hash"]),
            leaf_index=int(d["leaf_index"]),
            tree_size=int(d["tree_size"]),
            path=[(bytes.fromhex(s), side) for s, side in d["path"]],
        )


@dataclass
class MerkleTree:
    """Built Merkle tree. `layers[0]` = leaves; `layers[-1]` = [root]."""

    layers: list[list[bytes]]

    @property
    def root_hash(self) -> bytes:
        if not self.layers or not self.layers[-1]:
            raise ValueError("empty tree has no root")
        return self.layers[-1][0]

    @property
    def leaves(self) -> list[bytes]:
        return list(self.layers[0])

    @property
    def size(self) -> int:
        return len(self.layers[0])

    def proof_for(self, leaf_index: int) -> InclusionProof:
        """Build an inclusion proof for the leaf at `leaf_index`."""
        if leaf_index < 0 or leaf_index >= self.size:
            raise IndexError(f"leaf_index {leaf_index} out of range [0, {self.size})")
        path: list[tuple[bytes, str]] = []
        idx = leaf_index
        for layer in self.layers[:-1]:
            # Determine sibling
            if idx % 2 == 0:
                # We are LEFT; sibling is at idx+1 (or self if odd-padded)
                sib_idx = idx + 1
                if sib_idx >= len(layer):
                    sib = layer[idx]  # self-padding
                else:
                    sib = layer[sib_idx]
                path.append((sib, "right"))
            else:
                # We are RIGHT; sibling is at idx-1
                sib = layer[idx - 1]
                path.append((sib, "left"))
            idx //= 2
        return InclusionProof(
            leaf_hash=self.layers[0][leaf_index],
            leaf_index=leaf_index,
            tree_size=self.size,
            path=path,
        )


def build_merkle_tree(rows: list[Any]) -> MerkleTree:
    """Canonicalize → hash → build full binary Merkle tree (sibling-pad).

    Empty input is rejected — Merkle commitment requires ≥1 leaf.
    """
    if not rows:
        raise ValueError("cannot build Merkle tree over zero rows")
    leaves: list[bytes] = [hash_leaf(canonicalize_par_row(r)) for r in rows]
    layers: list[list[bytes]] = [leaves]
    current = leaves
    while len(current) > 1:
        next_layer: list[bytes] = []
        for i in range(0, len(current), 2):
            left = current[i]
            right = current[i + 1] if i + 1 < len(current) else current[i]
            next_layer.append(hash_inner(left, right))
        layers.append(next_layer)
        current = next_layer
    return MerkleTree(layers=layers)
