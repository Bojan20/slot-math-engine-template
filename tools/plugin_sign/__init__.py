"""W65 — Marketplace Plugin Signing CLI.

Closes the publisher-side signing gap so W52 marketplace verifier
exercises a full ed25519 signature roundtrip:

  * ``slot-plugin-sign keygen --out keys/``
        generate a fresh ed25519 keypair.
  * ``slot-plugin-sign sign <plugin.zip> --key keys/private.pem``
        produce ``<plugin.zip>.sig`` (raw 64-byte signature) +
        ``<plugin.zip>.sig.b64`` (base64-wrapped, marketplace-friendly).
  * ``slot-plugin-sign verify <plugin.zip> --key keys/public.pem``
        re-hash + verify the sidecar signature.

Uses the same ``cryptography.Ed25519`` primitives the rest of the
cert pipeline already depends on (cert_package.py). If the library
is unavailable the CLI prints a clean error and exits 2 rather than
crashing — keeps CI deterministic on minimal Python images.
"""
from tools.plugin_sign.signer import (
    SignResult,
    VerifyResult,
    generate_keypair,
    sign_zip,
    verify_zip,
    SigningUnavailable,
)

__all__ = [
    "SignResult",
    "VerifyResult",
    "generate_keypair",
    "sign_zip",
    "verify_zip",
    "SigningUnavailable",
]
