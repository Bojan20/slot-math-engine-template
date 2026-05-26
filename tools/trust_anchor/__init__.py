"""W72 — Trust Anchor Rotation.

Manages rotation of the master ed25519 signing key for the
``pubkey_bundle.json`` registry. A rotation:

  1. takes the existing master public PEM (the "old anchor"),
  2. generates a fresh keypair (the "new anchor"),
  3. emits a rotation manifest carrying both pubkeys with
     overlapping validity windows + a transition signature where the
     OLD master signs the NEW master's pubkey,
  4. re-signs the existing ``pubkey_bundle.json`` with the new
     master so consumers can switch over.

A separate ``revocation_log.json`` tracks revoked ``(plugin_id,
version)`` pairs. Verifiers consult the log alongside the bundle.

Public API:

  * ``rotate_anchor(...)``         — produces RotationManifest
  * ``record_revocation(...)``     — append to revocation log
  * ``verify_rotation(...)``       — confirm the transition signature
"""
from tools.trust_anchor.anchor import (
    RotationManifest,
    RotationResult,
    RevocationEntry,
    RevocationLog,
    rotate_anchor,
    record_revocation,
    verify_rotation,
)

__all__ = [
    "RotationManifest",
    "RotationResult",
    "RevocationEntry",
    "RevocationLog",
    "rotate_anchor",
    "record_revocation",
    "verify_rotation",
]
