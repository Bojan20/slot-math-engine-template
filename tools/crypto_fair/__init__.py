"""PHASE 15 — Crypto-Native Provably-Fair Extension.

Per-spin commit chain that lets a player verify any historical spin
result was deterministic + unaltered without trusting the operator.

Three primitives:

  1. **Server seed commit/reveal**: operator commits SHA-256(server_seed)
     before player bets; reveals after the session — player checks the
     pre-image matches and re-derives the RNG stream offline.
  2. **Client-seed-influenced RNG**: spin RNG seed = HMAC-SHA256(
     server_seed, client_seed + nonce). Player picks client_seed → no
     operator-only manipulation possible.
  3. **Spin chain Merkle commit**: every N spins, operator publishes
     `merkle_root(all_spin_hashes)` + ed25519 signature; player can
     produce inclusion proof for any historical spin.

Designed to compose with the W7.5 PAR provenance Merkle pipeline (same
hash construction + ed25519 signature scheme).

Public API:

    from tools.crypto_fair import (
        commit_server_seed,            # → (commit_hash, server_seed_hex)
        derive_spin_seed,              # (server, client, nonce) → seed
        verify_server_seed,            # commit hash + reveal → bool
        build_spin_chain_merkle,       # list[spin_hash] → MerkleTree
        sign_spin_chain,               # tree + private key → signed root
        verify_spin_chain_signature,   # root + sig + pubkey → bool
        SpinReceipt,                   # dataclass for per-spin audit row
    )

CLI:
    python -m tools.crypto_fair commit  → emit operator commit + seed
    python -m tools.crypto_fair verify <commit> <reveal>  → 0/1
"""

from __future__ import annotations

from tools.crypto_fair.fair_chain import (
    commit_server_seed,
    derive_spin_seed,
    verify_server_seed,
    build_spin_chain_merkle,
    sign_spin_chain,
    verify_spin_chain_signature,
    SpinReceipt,
    SpinChainRoot,
)

__all__ = [
    "commit_server_seed",
    "derive_spin_seed",
    "verify_server_seed",
    "build_spin_chain_merkle",
    "sign_spin_chain",
    "verify_spin_chain_signature",
    "SpinReceipt",
    "SpinChainRoot",
]
