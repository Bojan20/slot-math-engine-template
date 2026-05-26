"""IR Lock & Sign — Merkle tree + ed25519 signature.

Lock format (sidecar `<ir>.lock.json`):

    {
      "version": 1,
      "ir_path": "ir.json",
      "ir_sha256": "<hex>",          # full canonical-bytes hash
      "merkle_root": "<hex>",        # per-subtree Merkle root
      "subtrees": {                   # signed inventory
        "meta":       {"sha256": "<hex>"},
        "topology":   {"sha256": "<hex>"},
        "paytable":   {"sha256": "<hex>", "rows": <N>},
        "reels":      {"sha256": "<hex>", "rows": <N>},
        "features":   {"sha256": "<hex>", "kinds": ["..."]},
        ...
      },
      "signature": "<base64 ed25519>",
      "public_key_pem": "<PEM>",
      "signed_at_utc": "<iso8601>"
    }

Merkle construction (RFC-6962 style):
  • Each subtree → leaf = SHA-256(0x00 ‖ subtree_canonical_bytes)
  • Internal = SHA-256(0x01 ‖ left ‖ right)
  • Odd nodes promoted (RFC-6962 convention).
  • Root signed with ed25519 over (ir_sha256 ‖ merkle_root).
"""
from __future__ import annotations
import base64
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey, Ed25519PublicKey,
    )
    _HAS_CRYPTO = True
except Exception:  # pragma: no cover
    _HAS_CRYPTO = False


LOCK_VERSION = 1


# ─── canonicalization ──────────────────────────────────────────────


def canonical_ir_bytes(ir: dict[str, Any]) -> bytes:
    """Stable canonical JSON encoding: sorted keys, compact separators."""
    return json.dumps(ir, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )


def _hash_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _hash_subtree(name: str, value: Any) -> dict[str, Any]:
    """SHA-256 of canonical bytes + a small metadata stub per subtree
    kind (so the regulator sees row/feature counts without parsing)."""
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    out: dict[str, Any] = {"sha256": _hash_bytes(raw)}
    if name == "paytable" and isinstance(value, list):
        out["rows"] = len(value)
    elif name == "reels" and isinstance(value, dict):
        base = value.get("base") or []
        if isinstance(base, list):
            out["rows"] = len(base)
    elif name == "features":
        if isinstance(value, list):
            out["kinds"] = sorted(
                str(f.get("kind") or f.get("type") or "?")
                for f in value
                if isinstance(f, dict)
            )
        elif isinstance(value, dict):
            out["kinds"] = sorted(str(k) for k in value)
    return out


# ─── Merkle tree (RFC-6962 style) ──────────────────────────────────


def _leaf_hash(b: bytes) -> bytes:
    h = hashlib.sha256()
    h.update(b"\x00")
    h.update(b)
    return h.digest()


def _internal_hash(left: bytes, right: bytes) -> bytes:
    h = hashlib.sha256()
    h.update(b"\x01")
    h.update(left)
    h.update(right)
    return h.digest()


def compute_merkle_root(leaves: list[bytes]) -> bytes:
    """RFC-6962-style Merkle root over an arbitrary number of leaves."""
    if not leaves:
        return b"\x00" * 32
    nodes = [_leaf_hash(b) for b in leaves]
    while len(nodes) > 1:
        nxt: list[bytes] = []
        for i in range(0, len(nodes), 2):
            if i + 1 < len(nodes):
                nxt.append(_internal_hash(nodes[i], nodes[i + 1]))
            else:
                nxt.append(nodes[i])  # promote odd node
        nodes = nxt
    return nodes[0]


# ─── IRLock dataclass ──────────────────────────────────────────────


@dataclass
class IRLock:
    version: int = LOCK_VERSION
    ir_path: str = ""
    ir_sha256: str = ""
    merkle_root: str = ""
    subtrees: dict[str, dict[str, Any]] = field(default_factory=dict)
    signature: str = ""
    public_key_pem: str = ""
    signed_at_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "ir_path": self.ir_path,
            "ir_sha256": self.ir_sha256,
            "merkle_root": self.merkle_root,
            "subtrees": self.subtrees,
            "signature": self.signature,
            "public_key_pem": self.public_key_pem,
            "signed_at_utc": self.signed_at_utc,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "IRLock":
        return cls(
            version=int(d.get("version", LOCK_VERSION)),
            ir_path=str(d.get("ir_path", "")),
            ir_sha256=str(d.get("ir_sha256", "")),
            merkle_root=str(d.get("merkle_root", "")),
            subtrees=dict(d.get("subtrees") or {}),
            signature=str(d.get("signature", "")),
            public_key_pem=str(d.get("public_key_pem", "")),
            signed_at_utc=str(d.get("signed_at_utc", "")),
        )


# ─── lock + sign ────────────────────────────────────────────────────


SUBTREE_KEYS_DEFAULT = (
    "meta", "topology", "evaluation", "symbols", "reels",
    "paytable", "features", "limits", "rtp_allocation",
)


def _subtree_inventory(
    ir: dict[str, Any],
    keys: tuple[str, ...],
) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for k in keys:
        if k in ir:
            out[k] = _hash_subtree(k, ir[k])
    return out


def lock_ir(
    ir: dict[str, Any],
    *,
    ir_path: str = "",
    private_key_pem: bytes | None = None,
    subtree_keys: tuple[str, ...] = SUBTREE_KEYS_DEFAULT,
) -> IRLock:
    """Build an `IRLock` for `ir`. When `private_key_pem` is None an
    ephemeral ed25519 keypair is generated (and the public key embedded
    in the lock for self-contained verification)."""
    if not _HAS_CRYPTO:
        raise RuntimeError(
            "cryptography library required for IR lock signing"
        )
    canonical = canonical_ir_bytes(ir)
    ir_hash = _hash_bytes(canonical)

    subtrees = _subtree_inventory(ir, subtree_keys)
    leaves: list[bytes] = []
    for k in sorted(subtrees):
        leaves.append(bytes.fromhex(subtrees[k]["sha256"]))
    root = compute_merkle_root(leaves)

    # Sign concat of (ir_sha256 ‖ merkle_root)
    msg = (ir_hash + root.hex()).encode("utf-8")
    if private_key_pem is None:
        sk = Ed25519PrivateKey.generate()
        private_key_pem = sk.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    else:
        sk = serialization.load_pem_private_key(private_key_pem,
                                                  password=None)
    pk = sk.public_key()
    pk_pem = pk.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    sig = sk.sign(msg)
    return IRLock(
        ir_path=ir_path,
        ir_sha256=ir_hash,
        merkle_root=root.hex(),
        subtrees=subtrees,
        signature=base64.b64encode(sig).decode("ascii"),
        public_key_pem=pk_pem.decode("utf-8"),
        signed_at_utc=datetime.now(timezone.utc).isoformat(),
    )


def save_lock(lock: IRLock, out_path: Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp.write_text(json.dumps(lock.to_dict(), indent=2, sort_keys=True))
    tmp.replace(out_path)
    return out_path


def load_lock(path: Path) -> IRLock:
    return IRLock.from_dict(json.loads(Path(path).read_text()))


# ─── verify ────────────────────────────────────────────────────────


@dataclass
class LockVerifyResult:
    passed: bool
    ir_hash_match: bool
    signature_valid: bool
    merkle_root_recomputed: str
    mismatches: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "ir_hash_match": self.ir_hash_match,
            "signature_valid": self.signature_valid,
            "merkle_root_recomputed": self.merkle_root_recomputed,
            "mismatches": list(self.mismatches),
        }


def verify_ir(ir: dict[str, Any], lock: IRLock) -> LockVerifyResult:
    """Verify (a) full IR canonical hash, (b) per-subtree hashes,
    (c) Merkle root reconstructs to lock value, (d) ed25519 signature
    is valid under `lock.public_key_pem`."""
    if not _HAS_CRYPTO:
        return LockVerifyResult(
            passed=False, ir_hash_match=False, signature_valid=False,
            merkle_root_recomputed="",
            mismatches=["cryptography library not available"],
        )
    mismatches: list[str] = []

    canonical = canonical_ir_bytes(ir)
    actual_hash = _hash_bytes(canonical)
    ir_hash_match = actual_hash == lock.ir_sha256
    if not ir_hash_match:
        mismatches.append(
            f"ir_sha256 mismatch: expected {lock.ir_sha256}, got {actual_hash}"
        )

    # Per-subtree
    recomputed_subtrees = _subtree_inventory(
        ir, tuple(lock.subtrees.keys())
    )
    for k, expected in lock.subtrees.items():
        actual = recomputed_subtrees.get(k)
        if actual is None:
            mismatches.append(f"subtree missing in IR: {k!r}")
        elif actual["sha256"] != expected["sha256"]:
            mismatches.append(
                f"subtree {k!r} mismatch: "
                f"expected {expected['sha256']}, got {actual['sha256']}"
            )

    # Merkle root
    leaves: list[bytes] = []
    for k in sorted(lock.subtrees):
        leaves.append(bytes.fromhex(lock.subtrees[k]["sha256"]))
    recomputed_root = compute_merkle_root(leaves).hex()
    if recomputed_root != lock.merkle_root:
        mismatches.append(
            f"merkle_root mismatch: expected {lock.merkle_root}, "
            f"got {recomputed_root}"
        )

    # Signature
    sig_valid = False
    try:
        pk: Ed25519PublicKey = serialization.load_pem_public_key(
            lock.public_key_pem.encode("utf-8")
        )
        msg = (lock.ir_sha256 + lock.merkle_root).encode("utf-8")
        pk.verify(base64.b64decode(lock.signature), msg)
        sig_valid = True
    except Exception as e:  # noqa: BLE001
        mismatches.append(f"signature verify failed: {e}")

    passed = ir_hash_match and sig_valid and not mismatches
    return LockVerifyResult(
        passed=passed,
        ir_hash_match=ir_hash_match,
        signature_valid=sig_valid,
        merkle_root_recomputed=recomputed_root,
        mismatches=mismatches,
    )
