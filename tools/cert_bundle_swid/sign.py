"""Ed25519 signer wrapper — leans on `tools.plugin_sign` for the crypto.

We don't re-roll any of the key handling: the existing
`tools.plugin_sign.signer` is the source-of-truth signer that's
already covered by W6.10's acceptance suite. This module just exposes
the two operations the cert bundle needs:

  • `load_or_generate_key()` — find an existing private PEM at one of
     the conventional paths, or mint a deterministic ephemeral keypair
     so that bundles are reproducible across runs of `python3 -m
     tools.cert_bundle_swid`.
  • `sign_bytes()` — raw ed25519 signature over a blob (MANIFEST.json).
  • `verify_signature()` — inverse, used by the acceptance test.

For W4.15 we sign per-bundle MANIFEST bytes (not the whole ZIP), which
matches the spec's `SIGNATURE.sig` being a sidecar inside the ZIP.
"""
from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from pathlib import Path

from tools.plugin_sign.signer import (  # type: ignore
    SigningUnavailable,
    _import_crypto,
)


REPO = Path(__file__).resolve().parents[2]
KEYS_DIR = REPO / "reports" / "cert-bundle-swid" / "keys"
DEFAULT_PRIV = KEYS_DIR / "private.pem"
DEFAULT_PUB = KEYS_DIR / "public.pem"


# Deterministic seed for the ephemeral signing key. This is intentionally
# **not** a production secret — its only job is to make the bundle byte-
# reproducible. Anyone with this repo can regenerate it. For lab
# submission the operator overrides with a real HSM key path.
_REPRO_SEED = b"slotmath-cert-bundle-swid/v1/reproducible-ed25519-seed-W4.15-mission"


@dataclass
class KeyPair:
    private_pem_path: Path
    public_pem_path: Path
    pubkey_fingerprint: str  # sha256 of public PEM bytes, first 16 hex


def _fingerprint(pub_pem_bytes: bytes) -> str:
    return hashlib.sha256(pub_pem_bytes).hexdigest()[:16]


def load_or_generate_key(
    *,
    private_pem: Path | None = None,
    public_pem: Path | None = None,
) -> KeyPair:
    """Locate (or deterministically mint) the ed25519 keypair.

    Resolution order:
      1. Explicit paths passed in by the caller.
      2. The conventional `reports/cert-bundle-swid/keys/{private,public}.pem`
         pair if both already exist on disk.
      3. Generate a deterministic keypair from `_REPRO_SEED` and write it
         to (2), so subsequent runs reuse the same key.

    The chosen path keeps the bundles reproducible across two runs from
    the same checkout, while still allowing an operator to drop in a
    real key for production.
    """
    serialization, Ed25519PrivateKey, _ = _import_crypto()

    if private_pem and public_pem and Path(private_pem).exists() and Path(public_pem).exists():
        priv = Path(private_pem)
        pub = Path(public_pem)
        return KeyPair(priv, pub, _fingerprint(pub.read_bytes()))

    priv = DEFAULT_PRIV
    pub = DEFAULT_PUB

    if priv.exists() and pub.exists():
        return KeyPair(priv, pub, _fingerprint(pub.read_bytes()))

    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    # Deterministic 32-byte ed25519 seed.
    seed32 = hashlib.sha256(_REPRO_SEED).digest()
    sk = Ed25519PrivateKey.from_private_bytes(seed32)
    private_bytes = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    priv.write_bytes(private_bytes)
    pub.write_bytes(public_bytes)
    try:
        priv.chmod(0o600)
        pub.chmod(0o644)
    except OSError:
        pass
    return KeyPair(priv, pub, _fingerprint(public_bytes))


def sign_bytes(blob: bytes, *, private_pem_path: Path) -> bytes:
    """Raw ed25519 signature over `blob`."""
    serialization, Ed25519PrivateKey, _ = _import_crypto()
    sk = serialization.load_pem_private_key(
        Path(private_pem_path).read_bytes(), password=None,
    )
    if not isinstance(sk, Ed25519PrivateKey):
        raise SigningUnavailable("expected ed25519 PKCS8 PEM key")
    return sk.sign(blob)


def verify_signature(
    blob: bytes, signature: bytes, *, public_pem_path: Path,
) -> bool:
    """Verify `signature` against `blob` using the given public PEM."""
    serialization, _, Ed25519PublicKey = _import_crypto()
    pk = serialization.load_pem_public_key(Path(public_pem_path).read_bytes())
    if not isinstance(pk, Ed25519PublicKey):
        return False
    try:
        pk.verify(signature, blob)
        return True
    except Exception:  # noqa: BLE001
        return False


def b64(blob: bytes) -> str:
    return base64.b64encode(blob).decode("ascii")
