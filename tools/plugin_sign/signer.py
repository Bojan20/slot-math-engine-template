"""Plugin signer — ed25519 sidecar over a published ZIP body."""
from __future__ import annotations
import base64
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class SigningUnavailable(RuntimeError):
    """Raised when the cryptography library is missing."""


def _import_crypto():
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey, Ed25519PublicKey,
        )
        return serialization, Ed25519PrivateKey, Ed25519PublicKey
    except ImportError as e:
        raise SigningUnavailable(
            "cryptography library not installed; "
            "`pip install cryptography>=41` to enable signing"
        ) from e


@dataclass
class SignResult:
    body_sha256: str
    signature_b64: str
    sig_path: str
    sig_b64_path: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "body_sha256": self.body_sha256,
            "signature_b64": self.signature_b64,
            "sig_path": self.sig_path,
            "sig_b64_path": self.sig_b64_path,
        }


@dataclass
class VerifyResult:
    body_sha256: str
    passed: bool
    error: str = ""
    signature_b64: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "body_sha256": self.body_sha256,
            "passed": self.passed,
            "error": self.error,
            "signature_b64": self.signature_b64,
        }


def generate_keypair(out_dir: Path) -> tuple[Path, Path]:
    """Write `private.pem` + `public.pem` into `out_dir`; return paths.

    Files are written with restrictive permissions (0o600 private,
    0o644 public) — best-effort, ignored on platforms that don't
    enforce POSIX modes.
    """
    serialization, Ed25519PrivateKey, _ = _import_crypto()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    sk = Ed25519PrivateKey.generate()
    private_pem = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    priv_path = out_dir / "private.pem"
    pub_path = out_dir / "public.pem"
    priv_path.write_bytes(private_pem)
    pub_path.write_bytes(public_pem)
    try:
        priv_path.chmod(0o600)
        pub_path.chmod(0o644)
    except OSError:
        pass
    return priv_path, pub_path


def _hash_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def sign_zip(zip_path: Path, *, private_pem_path: Path) -> SignResult:
    """Sign a ZIP body and emit two sidecar files.

    The signature is taken over the raw ZIP bytes (not the SHA-256
    digest) so a verifier can cross-check both digest equality AND
    Ed25519 validity without trusting our digest computation.
    """
    serialization, Ed25519PrivateKey, _ = _import_crypto()
    zip_path = Path(zip_path)
    blob = zip_path.read_bytes()
    body_sha = _hash_bytes(blob)

    sk = serialization.load_pem_private_key(
        Path(private_pem_path).read_bytes(), password=None,
    )
    if not isinstance(sk, Ed25519PrivateKey):
        raise ValueError("expected ed25519 PKCS8 PEM key")
    raw_sig = sk.sign(blob)
    b64_sig = base64.b64encode(raw_sig).decode("ascii")

    sig_path = zip_path.with_suffix(zip_path.suffix + ".sig")
    sig_b64_path = zip_path.with_suffix(zip_path.suffix + ".sig.b64")
    sig_path.write_bytes(raw_sig)
    sig_b64_path.write_text(b64_sig + "\n")

    return SignResult(
        body_sha256=body_sha,
        signature_b64=b64_sig,
        sig_path=str(sig_path),
        sig_b64_path=str(sig_b64_path),
    )


def verify_zip(
    zip_path: Path,
    *,
    public_pem_path: Path,
    sig_path: Path | None = None,
) -> VerifyResult:
    """Verify a ZIP body against its `.sig` sidecar (or explicit path)."""
    serialization, _, Ed25519PublicKey = _import_crypto()
    zip_path = Path(zip_path)
    blob = zip_path.read_bytes()
    body_sha = _hash_bytes(blob)

    if sig_path is None:
        sig_path = zip_path.with_suffix(zip_path.suffix + ".sig")
    sig_path = Path(sig_path)
    if not sig_path.exists():
        return VerifyResult(
            body_sha256=body_sha, passed=False,
            error=f"signature sidecar not found: {sig_path}",
        )
    raw_sig = sig_path.read_bytes()

    pk = serialization.load_pem_public_key(
        Path(public_pem_path).read_bytes(),
    )
    if not isinstance(pk, Ed25519PublicKey):
        return VerifyResult(
            body_sha256=body_sha, passed=False,
            error="expected ed25519 PEM public key",
        )

    try:
        pk.verify(raw_sig, blob)
        return VerifyResult(
            body_sha256=body_sha,
            passed=True,
            signature_b64=base64.b64encode(raw_sig).decode("ascii"),
        )
    except Exception as e:  # noqa: BLE001
        return VerifyResult(
            body_sha256=body_sha, passed=False, error=str(e),
        )
