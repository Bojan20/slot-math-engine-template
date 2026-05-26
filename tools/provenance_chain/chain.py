"""Provenance chain — PAR cells → Merkle → IR → cert commitment."""
from __future__ import annotations
import copy
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── Helpers ───────────────────────────────────────────────────────


def _h(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def _hex(data: bytes) -> str:
    return data.hex()


def _ir_canonical_bytes(ir: dict[str, Any]) -> bytes:
    """Canonical IR encoding (lock_root_hash stripped, sort_keys)."""
    ir_copy = copy.deepcopy(ir)
    meta = ir_copy.get("meta")
    if isinstance(meta, dict):
        meta.pop("lock_root_hash", None)
    return json.dumps(ir_copy, sort_keys=True, separators=(",", ":")).encode()


# ─── Merkle tree (deterministic, duplicate-last-on-odd) ────────────


def _next_layer(leaves: list[bytes]) -> list[bytes]:
    if len(leaves) % 2 == 1:
        leaves = leaves + [leaves[-1]]
    return [
        _h(leaves[i] + leaves[i + 1])
        for i in range(0, len(leaves), 2)
    ]


def merkle_root(leaves: list[bytes]) -> bytes:
    """Pairwise SHA-256 reduction with last-duplication for odd layers."""
    if not leaves:
        return _h(b"")
    layer = list(leaves)
    while len(layer) > 1:
        layer = _next_layer(layer)
    return layer[0]


# ─── Inclusion proof ───────────────────────────────────────────────


@dataclass
class MerkleProofPath:
    leaf_index: int
    leaf_hash: str
    siblings: list[tuple[str, str]] = field(default_factory=list)
    # (sibling_hex, "L"|"R") — direction tells the verifier which side
    # to concatenate on at each layer.

    def to_dict(self) -> dict[str, Any]:
        return {
            "leaf_index": self.leaf_index,
            "leaf_hash": self.leaf_hash,
            "siblings": [
                {"hash": h, "dir": d} for h, d in self.siblings
            ],
        }


def merkle_proof(leaves: list[bytes], index: int) -> MerkleProofPath:
    """Produce a sibling-path proof for `leaves[index]`."""
    if not (0 <= index < len(leaves)):
        raise IndexError(f"leaf index {index} out of range")
    path: list[tuple[str, str]] = []
    layer = list(leaves)
    idx = index
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer = layer + [layer[-1]]
        if idx % 2 == 0:
            sibling = layer[idx + 1]
            direction = "R"      # sibling is to the right
        else:
            sibling = layer[idx - 1]
            direction = "L"
        path.append((_hex(sibling), direction))
        layer = _next_layer(layer)
        idx //= 2
    return MerkleProofPath(
        leaf_index=index,
        leaf_hash=_hex(leaves[index]),
        siblings=path,
    )


def verify_merkle_proof(
    *, leaf_hash_hex: str, proof: MerkleProofPath, root_hex: str,
) -> bool:
    """Re-derive root by walking siblings; compare to claimed root."""
    if leaf_hash_hex != proof.leaf_hash:
        return False
    cur = bytes.fromhex(leaf_hash_hex)
    for sib_hex, direction in proof.siblings:
        sib = bytes.fromhex(sib_hex)
        if direction == "R":
            cur = _h(cur + sib)
        elif direction == "L":
            cur = _h(sib + cur)
        else:
            return False
    return _hex(cur) == root_hex


# ─── Chain commitment ──────────────────────────────────────────────


@dataclass
class ChainCommitment:
    par_leaves_count: int
    par_merkle_root_hex: str
    ir_digest_hex: str
    timestamp_utc: str
    chain_commitment_hex: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "par_leaves_count": self.par_leaves_count,
            "par_merkle_root_hex": self.par_merkle_root_hex,
            "ir_digest_hex": self.ir_digest_hex,
            "timestamp_utc": self.timestamp_utc,
            "chain_commitment_hex": self.chain_commitment_hex,
        }


@dataclass
class ChainVerifyReport:
    chain: ChainCommitment | None
    recomputed_merkle_hex: str
    recomputed_ir_digest_hex: str
    recomputed_chain_hex: str
    merkle_match: bool
    ir_match: bool
    chain_match: bool

    @property
    def passed(self) -> bool:
        return self.merkle_match and self.ir_match and self.chain_match

    def to_dict(self) -> dict[str, Any]:
        return {
            "chain": self.chain.to_dict() if self.chain else None,
            "recomputed_merkle_hex": self.recomputed_merkle_hex,
            "recomputed_ir_digest_hex": self.recomputed_ir_digest_hex,
            "recomputed_chain_hex": self.recomputed_chain_hex,
            "merkle_match": self.merkle_match,
            "ir_match": self.ir_match,
            "chain_match": self.chain_match,
            "passed": self.passed,
        }


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _par_leaves_from_dir(par_dir: Path) -> list[bytes]:
    """Walk every PAR cell file under `par_dir`, return per-file leaf hashes
    in deterministic alphabetic order."""
    leaves: list[bytes] = []
    if not par_dir.exists():
        return leaves
    for p in sorted(par_dir.rglob("*")):
        if p.is_file():
            leaves.append(_h(p.read_bytes()))
    return leaves


def _par_leaves_from_cells(cells: list[bytes]) -> list[bytes]:
    return [_h(c) for c in cells]


def _commit(
    merkle_root_bytes: bytes,
    ir_digest_bytes: bytes,
    timestamp_iso: str,
) -> bytes:
    return _h(
        merkle_root_bytes + ir_digest_bytes + timestamp_iso.encode()
    )


def build_chain(
    *,
    ir: dict[str, Any],
    par_dir: Path | None = None,
    par_cells: list[bytes] | None = None,
    timestamp_utc: str | None = None,
) -> tuple[ChainCommitment, list[bytes]]:
    """Compute a ChainCommitment and return the underlying leaf hashes.

    Caller supplies EITHER `par_dir` (file-system walk) OR `par_cells`
    (raw bytes per cell). The leaves list is returned alongside the
    commitment so the caller can mint Merkle proofs later.
    """
    if par_dir is not None:
        leaves = _par_leaves_from_dir(Path(par_dir))
    elif par_cells is not None:
        leaves = _par_leaves_from_cells(par_cells)
    else:
        leaves = []

    root_bytes = merkle_root(leaves) if leaves else _h(b"")
    ir_digest_bytes = _h(_ir_canonical_bytes(ir))
    ts = timestamp_utc or _now_utc()
    chain_hex = _hex(_commit(root_bytes, ir_digest_bytes, ts))
    return (
        ChainCommitment(
            par_leaves_count=len(leaves),
            par_merkle_root_hex=_hex(root_bytes),
            ir_digest_hex=_hex(ir_digest_bytes),
            timestamp_utc=ts,
            chain_commitment_hex=chain_hex,
        ),
        leaves,
    )


def verify_chain(
    *,
    ir: dict[str, Any],
    chain: ChainCommitment,
    par_dir: Path | None = None,
    par_cells: list[bytes] | None = None,
) -> ChainVerifyReport:
    if par_dir is not None:
        leaves = _par_leaves_from_dir(Path(par_dir))
    elif par_cells is not None:
        leaves = _par_leaves_from_cells(par_cells)
    else:
        leaves = []

    recomputed_merkle = (
        _hex(merkle_root(leaves)) if leaves else _hex(_h(b""))
    )
    recomputed_ir_digest = _hex(_h(_ir_canonical_bytes(ir)))
    recomputed_chain = _hex(_commit(
        bytes.fromhex(recomputed_merkle),
        bytes.fromhex(recomputed_ir_digest),
        chain.timestamp_utc,
    ))
    return ChainVerifyReport(
        chain=chain,
        recomputed_merkle_hex=recomputed_merkle,
        recomputed_ir_digest_hex=recomputed_ir_digest,
        recomputed_chain_hex=recomputed_chain,
        merkle_match=(recomputed_merkle == chain.par_merkle_root_hex),
        ir_match=(recomputed_ir_digest == chain.ir_digest_hex),
        chain_match=(recomputed_chain == chain.chain_commitment_hex),
    )
