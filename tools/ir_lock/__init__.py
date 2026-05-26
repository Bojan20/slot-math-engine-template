"""W16 — IR Lock & Sign.

Crypto-binds a universal IR to a signed lock-file:

  • Canonical IR → sorted-keys JSON bytes
  • Per-node Merkle tree (paytable rows + reel rows + features + meta)
    so a regulator can audit which subtree changed when a lock breaks
  • SHA-256 root + ed25519 signature → IR.lock.json (sidecar)
  • verify(ir, lock) returns (passed, merkle_root, mismatches[])

Use cases:
  • Slot studio publishes ir.json + ir.lock.json. RGS verifies the
    lock before loading the IR.
  • W14 CI gate gets a per-IR integrity check that can be checked
    in version control without uploading the full IR to a cert
    server.
  • Drift Sentinel (W11) cross-checks fingerprint vs lock root —
    they should agree, except the lock root is signed.
"""
from tools.ir_lock.lock import (
    IRLock,
    LockVerifyResult,
    canonical_ir_bytes,
    compute_merkle_root,
    lock_ir,
    save_lock,
    load_lock,
    verify_ir,
)

__all__ = [
    "IRLock",
    "LockVerifyResult",
    "canonical_ir_bytes",
    "compute_merkle_root",
    "lock_ir",
    "save_lock",
    "load_lock",
    "verify_ir",
]
