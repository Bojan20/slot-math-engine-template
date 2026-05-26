"""Trust anchor rotation core (W72)."""
from __future__ import annotations
import base64
import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _import_crypto():
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
            Ed25519PublicKey,
        )
        return serialization, Ed25519PrivateKey, Ed25519PublicKey
    except ImportError:  # pragma: no cover
        return None, None, None


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


# ─── data shapes ──────────────────────────────────────────────────


@dataclass
class RotationManifest:
    """One rotation step."""

    rotation_id: str                         # `<short-sha-of-new-pem>-<utc>`
    created_at_utc: str = ""
    old_pubkey_sha256: str = ""
    new_pubkey_sha256: str = ""
    overlap_starts_utc: str = ""
    overlap_ends_utc: str = ""               # when old key MUST be retired
    transition_signature_b64: str = ""        # OLD master signs canonical
                                              # bytes of the new pubkey PEM
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RotationResult:
    manifest: RotationManifest
    manifest_path: Path
    new_master_pubkey_path: Path
    new_master_private_path: Path | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "manifest": self.manifest.to_dict(),
            "manifest_path": str(self.manifest_path),
            "new_master_pubkey_path": str(self.new_master_pubkey_path),
            "new_master_private_path": (
                str(self.new_master_private_path)
                if self.new_master_private_path is not None else None
            ),
        }


@dataclass
class RevocationEntry:
    plugin_id: str
    version: str
    reason: str = ""
    revoked_at_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RevocationLog:
    entries: list[RevocationEntry] = field(default_factory=list)
    updated_at_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "updated_at_utc": self.updated_at_utc,
            "entries": [e.to_dict() for e in self.entries],
        }

    @classmethod
    def load(cls, path: Path) -> "RevocationLog":
        path = Path(path)
        if not path.exists():
            return cls()
        data = json.loads(path.read_text())
        return cls(
            updated_at_utc=data.get("updated_at_utc", ""),
            entries=[
                RevocationEntry(**e) for e in (data.get("entries") or [])
            ],
        )

    def is_revoked(self, plugin_id: str, version: str) -> bool:
        return any(
            e.plugin_id == plugin_id and e.version == version
            for e in self.entries
        )


# ─── rotation ──────────────────────────────────────────────────────


def rotate_anchor(
    *,
    old_master_private_pem: Path,
    out_dir: Path,
    overlap_days: int = 30,
    notes: list[str] | None = None,
) -> RotationResult:
    """Generate a fresh ed25519 master keypair, sign its public PEM
    with the OLD master, and emit a RotationManifest."""
    serialization, Ed25519PrivateKey, _ = _import_crypto()
    if serialization is None:
        raise RuntimeError("cryptography library required for rotation")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Generate new master keypair.
    new_sk = Ed25519PrivateKey.generate()
    new_pk = new_sk.public_key()
    new_priv_pem = new_sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    new_pub_pem = new_pk.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    new_priv_path = out_dir / "new_master_private.pem"
    new_pub_path = out_dir / "new_master_public.pem"
    new_priv_path.write_bytes(new_priv_pem)
    new_pub_path.write_bytes(new_pub_pem)

    # OLD master signs the canonical bytes of the new pubkey PEM.
    old_priv_bytes = Path(old_master_private_pem).read_bytes()
    old_sk = serialization.load_pem_private_key(old_priv_bytes, password=None)
    if not isinstance(old_sk, Ed25519PrivateKey):
        raise ValueError("expected ed25519 PKCS8 PEM for old master")
    transition_sig = old_sk.sign(new_pub_pem)
    transition_sig_b64 = base64.b64encode(transition_sig).decode("ascii")

    # Old pubkey hash for reference.
    old_pub = old_sk.public_key()
    old_pub_pem = old_pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    rotation_id = f"{_sha256(new_pub_pem)[:12]}-{_now_utc()}"
    now = _now_utc()
    from datetime import timedelta
    ends_dt = datetime.now(timezone.utc) + timedelta(days=overlap_days)
    manifest = RotationManifest(
        rotation_id=rotation_id,
        created_at_utc=now,
        old_pubkey_sha256=_sha256(old_pub_pem),
        new_pubkey_sha256=_sha256(new_pub_pem),
        overlap_starts_utc=now,
        overlap_ends_utc=ends_dt.isoformat(),
        transition_signature_b64=transition_sig_b64,
        notes=list(notes or []),
    )
    manifest_path = out_dir / "rotation_manifest.json"
    manifest_path.write_text(json.dumps(manifest.to_dict(), indent=2,
                                        sort_keys=True))
    return RotationResult(
        manifest=manifest,
        manifest_path=manifest_path,
        new_master_pubkey_path=new_pub_path,
        new_master_private_path=new_priv_path,
    )


# ─── revocation ────────────────────────────────────────────────────


def record_revocation(
    log_path: Path,
    *,
    plugin_id: str,
    version: str,
    reason: str = "",
) -> RevocationLog:
    log_path = Path(log_path)
    log = RevocationLog.load(log_path)
    if not log.is_revoked(plugin_id, version):
        log.entries.append(RevocationEntry(
            plugin_id=plugin_id,
            version=version,
            reason=reason,
            revoked_at_utc=_now_utc(),
        ))
    log.updated_at_utc = _now_utc()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(json.dumps(log.to_dict(), indent=2, sort_keys=True))
    return log


# ─── verification ──────────────────────────────────────────────────


def verify_rotation(
    *,
    manifest_path: Path,
    old_master_public_pem: Path,
    new_master_public_pem: Path,
) -> dict[str, Any]:
    """Verify the transition signature embedded in the rotation
    manifest: old master must have signed the canonical bytes of the
    new master's pubkey PEM."""
    serialization, _PrivCls, Ed25519PublicKey = _import_crypto()
    if serialization is None:
        return {"passed": False, "error": "cryptography library missing"}
    manifest = json.loads(Path(manifest_path).read_text())
    new_pem = Path(new_master_public_pem).read_bytes()
    if _sha256(new_pem) != manifest.get("new_pubkey_sha256"):
        return {
            "passed": False,
            "error": "new pubkey sha256 does not match manifest",
        }
    old_pem = Path(old_master_public_pem).read_bytes()
    if _sha256(old_pem) != manifest.get("old_pubkey_sha256"):
        return {
            "passed": False,
            "error": "old pubkey sha256 does not match manifest",
        }
    try:
        pk = serialization.load_pem_public_key(old_pem)
        if not isinstance(pk, Ed25519PublicKey):
            return {"passed": False, "error": "old key is not ed25519"}
        raw_sig = base64.b64decode(manifest.get("transition_signature_b64",
                                                 "").encode())
        pk.verify(raw_sig, new_pem)
        return {"passed": True}
    except Exception as e:  # noqa: BLE001
        return {"passed": False, "error": str(e)}
