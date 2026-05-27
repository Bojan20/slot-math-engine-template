"""PHASE 15 — Crypto-native provably-fair primitives.

Pure stdlib (hashlib + hmac + secrets) for the SHA-256 + HMAC parts;
ed25519 signature uses `cryptography` lazily (graceful fallback to
unsigned commitments when crypto lib absent).

Design notes:
  • Server-seed commit-reveal: standard provably-fair pattern. Operator
    publishes SHA-256(server_seed) BEFORE the session; reveals seed AFTER.
    Player re-derives the RNG stream offline.
  • Spin-seed derivation: HMAC-SHA256(server_seed_bytes, client_seed + nonce_le)
    → 32-byte seed → first 8 bytes interpreted as u64 RNG state.
  • Merkle chain over per-spin hashes: SHA-256(spin_index || spin_payload).
    Hash construction identical to W7.5 PAR provenance for code reuse.
  • Domain separation: signing payload prefix `b"slotmath-crypto-fair-v1"`
    so signatures from this kernel can't be replayed against PAR
    provenance signatures.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import struct
from dataclasses import dataclass, asdict, field
from typing import Any, Optional


_DOMAIN_TAG = b"slotmath-crypto-fair-v1"


# ─── Server-seed commit/reveal ─────────────────────────────────────────────


def commit_server_seed(
    seed_hex: Optional[str] = None,
    *,
    n_bytes: int = 32,
) -> tuple[str, str]:
    """Commit a server seed.

    Returns (commit_hash_hex, server_seed_hex). The operator publishes
    commit_hash before the session; reveals server_seed after.

    Args:
        seed_hex: optional caller-provided seed (hex string). If None, a
                  cryptographically-secure random seed of `n_bytes` is
                  generated via `secrets.token_hex`.
        n_bytes:  seed length when randomly generated; default 32 (256-bit).
    """
    if seed_hex is None:
        seed_hex = secrets.token_hex(n_bytes)
    else:
        # Validate hex
        try:
            bytes.fromhex(seed_hex)
        except ValueError as exc:
            raise ValueError(f"seed_hex must be valid hex: {exc}") from None
    commit = hashlib.sha256(bytes.fromhex(seed_hex)).hexdigest()
    return commit, seed_hex


def verify_server_seed(commit_hash_hex: str, revealed_seed_hex: str) -> bool:
    """Re-hash the revealed seed and compare to the commit. Pure bool."""
    try:
        computed = hashlib.sha256(bytes.fromhex(revealed_seed_hex)).hexdigest()
    except ValueError:
        return False
    return hmac.compare_digest(computed, commit_hash_hex)


# ─── Per-spin RNG seed derivation ──────────────────────────────────────────


def derive_spin_seed(
    server_seed_hex: str,
    client_seed: str,
    nonce: int,
) -> int:
    """Derive a per-spin 64-bit RNG seed.

    Construction:
        key  = server_seed (raw bytes from hex)
        msg  = utf-8(client_seed) || little-endian-u64(nonce)
        mac  = HMAC-SHA256(key, msg)
        seed = int.from_bytes(mac[:8], "little")

    Properties:
      - deterministic: same inputs always yield same seed
      - non-malleable: changing any byte of inputs randomises seed
      - HMAC prevents length-extension attacks (vs plain SHA-256)

    Args:
        server_seed_hex: hex string from `commit_server_seed`
        client_seed:     player-chosen string (any utf-8)
        nonce:           spin index (u64-range), monotonically increasing
    """
    if nonce < 0 or nonce >= 2**64:
        raise ValueError(f"nonce must be in [0, 2**64); got {nonce}")
    key = bytes.fromhex(server_seed_hex)
    msg = client_seed.encode("utf-8") + struct.pack("<Q", nonce)
    mac = hmac.new(key, msg, hashlib.sha256).digest()
    return int.from_bytes(mac[:8], "little")


# ─── Per-spin receipt + chain Merkle ───────────────────────────────────────


@dataclass(frozen=True)
class SpinReceipt:
    """One auditable spin row.

    Persisted to a session log; the chain Merkle is built over the
    `spin_hash` of each receipt. A player can later request the
    inclusion proof for any spin_index they care about.
    """

    spin_index: int
    server_seed_commit: str       # SHA-256 of server seed (published pre-session)
    client_seed: str
    nonce: int
    bet_amount: float
    outcome_payload: dict[str, Any]  # symbols + lines + features

    def to_canonical_bytes(self) -> bytes:
        """Stable serialisation for hashing — sorted keys, no whitespace."""
        d = asdict(self)
        return json.dumps(d, sort_keys=True, separators=(",", ":")).encode("utf-8")

    @property
    def spin_hash(self) -> bytes:
        """SHA-256(0x00 || canonical_bytes) — leaf hash for Merkle chain."""
        return hashlib.sha256(b"\x00" + self.to_canonical_bytes()).digest()


def build_spin_chain_merkle(receipts: list[SpinReceipt]) -> dict[str, Any]:
    """Build a Merkle tree over spin receipts.

    Returns dict:
        {
          "root_hex": "...",
          "tree_size": N,
          "leaf_hashes_hex": [...],   # for inclusion-proof construction
        }

    Hash construction (RFC 6962 binary tree):
        leaf_hash = SHA-256(0x00 || canonical_bytes)
        inner_hash = SHA-256(0x01 || left || right)
    """
    if not receipts:
        raise ValueError("receipts must be non-empty")
    leaves = [r.spin_hash for r in receipts]
    tree_size = len(leaves)
    # Compute root by iterative pairing.
    layer = list(leaves)
    while len(layer) > 1:
        nxt: list[bytes] = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else left  # duplicate odd
            nxt.append(hashlib.sha256(b"\x01" + left + right).digest())
        layer = nxt
    root = layer[0]
    return {
        "root_hex": root.hex(),
        "tree_size": tree_size,
        "leaf_hashes_hex": [h.hex() for h in leaves],
    }


@dataclass
class SpinChainRoot:
    """Signed Merkle root over a contiguous block of spins."""

    root_hex: str
    tree_size: int
    signature_hex: Optional[str]    # None when crypto lib absent
    pubkey_hex: Optional[str]
    domain_tag: str = field(default=_DOMAIN_TAG.decode())


def sign_spin_chain(
    chain_dict: dict[str, Any],
    private_pem: Optional[bytes] = None,
) -> SpinChainRoot:
    """Sign the root with ed25519. Returns SpinChainRoot.

    When `cryptography` lib is missing OR no private_pem provided AND no
    auto-key generation, returns an unsigned `SpinChainRoot` so the
    player can still re-derive the root (commit-only). Operator that
    wants verifiable signatures must install `cryptography`.
    """
    root_bytes = bytes.fromhex(chain_dict["root_hex"])
    tree_size = int(chain_dict["tree_size"])
    payload = _DOMAIN_TAG + root_bytes + struct.pack(">Q", tree_size)

    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
        )
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        return SpinChainRoot(
            root_hex=chain_dict["root_hex"],
            tree_size=tree_size,
            signature_hex=None,
            pubkey_hex=None,
        )

    if private_pem is None:
        sk = Ed25519PrivateKey.generate()
    else:
        sk = serialization.load_pem_private_key(private_pem, password=None)

    signature = sk.sign(payload)
    pubkey = sk.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return SpinChainRoot(
        root_hex=chain_dict["root_hex"],
        tree_size=tree_size,
        signature_hex=signature.hex(),
        pubkey_hex=pubkey.hex(),
    )


def verify_spin_chain_signature(root: SpinChainRoot) -> bool:
    """Verify the ed25519 signature on a SpinChainRoot.

    Returns False when signature absent (unsigned commit) OR cryptography
    lib missing OR verification fails. Use `commit-only` mode if you
    only need the Merkle root.
    """
    if root.signature_hex is None or root.pubkey_hex is None:
        return False
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PublicKey,
        )
        from cryptography.exceptions import InvalidSignature
    except ImportError:
        return False
    root_bytes = bytes.fromhex(root.root_hex)
    tree_size = root.tree_size
    payload = _DOMAIN_TAG + root_bytes + struct.pack(">Q", tree_size)
    try:
        pk = Ed25519PublicKey.from_public_bytes(bytes.fromhex(root.pubkey_hex))
        pk.verify(bytes.fromhex(root.signature_hex), payload)
        return True
    except (InvalidSignature, ValueError):
        return False
