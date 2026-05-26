"""Pub-key bundle builder + verifier."""
from __future__ import annotations
import base64
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _import_crypto():
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey, Ed25519PublicKey,
        )
        return serialization, Ed25519PrivateKey, Ed25519PublicKey
    except ImportError:
        return None, None, None


@dataclass
class BundleEntry:
    plugin_id: str
    version: str
    pubkey_pem_sha256: str
    pubkey_pem_rel_path: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "plugin_id": self.plugin_id,
            "version": self.version,
            "pubkey_pem_sha256": self.pubkey_pem_sha256,
            "pubkey_pem_rel_path": self.pubkey_pem_rel_path,
        }


@dataclass
class BundleReport:
    generated_at_utc: str
    entries: list[BundleEntry] = field(default_factory=list)
    bundle_sig_b64: str = ""
    master_pubkey_sha256: str = ""

    @property
    def n_entries(self) -> int:
        return len(self.entries)

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at_utc": self.generated_at_utc,
            "n_entries": self.n_entries,
            "entries": [e.to_dict() for e in self.entries],
            "bundle_sig_b64": self.bundle_sig_b64,
            "master_pubkey_sha256": self.master_pubkey_sha256,
        }


@dataclass
class VerifyReport:
    bundle_path: str
    n_entries: int
    n_pubkey_mismatch: int
    sig_valid: bool | None        # None = no master key supplied
    issues: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        if self.n_pubkey_mismatch > 0:
            return False
        if self.sig_valid is False:
            return False
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "bundle_path": self.bundle_path,
            "n_entries": self.n_entries,
            "n_pubkey_mismatch": self.n_pubkey_mismatch,
            "sig_valid": self.sig_valid,
            "passed": self.passed,
            "issues": list(self.issues),
        }


def canonical_json(payload: dict[str, Any]) -> bytes:
    """Stable byte encoding used for signature computation."""
    # Strip the signature field so the canonical body is independent
    # of the signature itself.
    cleaned = {k: v for k, v in payload.items() if k != "bundle_sig_b64"}
    return json.dumps(cleaned, sort_keys=True, separators=(",", ":")).encode()


def _sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _walk_pubkeys(keys_root: Path) -> list[BundleEntry]:
    """Walk `<keys_root>/<plugin_id>/<version>/public.pem` layout."""
    out: list[BundleEntry] = []
    if not keys_root.exists():
        return out
    for plugin_dir in sorted(p for p in keys_root.iterdir() if p.is_dir()):
        for ver_dir in sorted(p for p in plugin_dir.iterdir() if p.is_dir()):
            pub = ver_dir / "public.pem"
            if not pub.exists():
                continue
            sha = _sha256(pub.read_bytes())
            out.append(BundleEntry(
                plugin_id=plugin_dir.name,
                version=ver_dir.name,
                pubkey_pem_sha256=sha,
                pubkey_pem_rel_path=str(pub.relative_to(keys_root)),
            ))
    return out


def build_bundle(
    *,
    keys_root: Path,
    out_path: Path,
    master_private_pem: Path | None = None,
    master_public_pem: Path | None = None,
) -> BundleReport:
    """Build pubkey_bundle.json from `keys_root` layout."""
    keys_root = Path(keys_root)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    report = BundleReport(generated_at_utc=_now_utc())
    report.entries = _walk_pubkeys(keys_root)

    # Compute master pubkey hash FIRST so it's part of the canonical
    # payload the signature covers.
    if master_public_pem is not None and Path(master_public_pem).exists():
        report.master_pubkey_sha256 = _sha256(
            Path(master_public_pem).read_bytes()
        )

    if master_private_pem is not None:
        serialization, _PrivCls, _ = _import_crypto()
        if serialization is None:
            report.bundle_sig_b64 = ""
        else:
            sk = serialization.load_pem_private_key(
                Path(master_private_pem).read_bytes(), password=None,
            )
            canonical = canonical_json(report.to_dict())
            raw_sig = sk.sign(canonical)
            report.bundle_sig_b64 = base64.b64encode(raw_sig).decode("ascii")

    # Write bundle with refreshed signature/master_pubkey_sha256 fields.
    out_path.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    return report


def verify_bundle(
    *,
    bundle_path: Path,
    keys_root: Path,
    master_public_pem: Path | None = None,
) -> VerifyReport:
    bundle_path = Path(bundle_path)
    keys_root = Path(keys_root)
    if not bundle_path.exists():
        return VerifyReport(
            bundle_path=str(bundle_path), n_entries=0,
            n_pubkey_mismatch=0, sig_valid=False,
            issues=[f"bundle not found: {bundle_path}"],
        )
    data = json.loads(bundle_path.read_text())
    entries = data.get("entries") or []
    issues: list[str] = []
    n_mismatch = 0
    for entry in entries:
        rel = entry.get("pubkey_pem_rel_path")
        expected = entry.get("pubkey_pem_sha256", "")
        if not rel:
            issues.append("entry missing pubkey_pem_rel_path")
            n_mismatch += 1
            continue
        p = keys_root / rel
        if not p.exists():
            issues.append(f"pubkey file missing: {rel}")
            n_mismatch += 1
            continue
        actual = _sha256(p.read_bytes())
        if actual != expected:
            issues.append(
                f"sha256 mismatch for {rel}: {expected[:12]}… vs {actual[:12]}…"
            )
            n_mismatch += 1

    sig_valid: bool | None = None
    sig_b64 = data.get("bundle_sig_b64") or ""
    if master_public_pem is not None:
        serialization, _, Ed25519PublicKey = _import_crypto()
        if serialization is None:
            sig_valid = False
            issues.append("cryptography library not installed; sig skipped")
        elif not sig_b64:
            sig_valid = False
            issues.append("bundle has no signature")
        else:
            try:
                pk = serialization.load_pem_public_key(
                    Path(master_public_pem).read_bytes(),
                )
                if not isinstance(pk, Ed25519PublicKey):
                    sig_valid = False
                    issues.append("master key is not ed25519")
                else:
                    raw_sig = base64.b64decode(sig_b64.encode())
                    pk.verify(raw_sig, canonical_json(data))
                    sig_valid = True
            except Exception as e:  # noqa: BLE001
                sig_valid = False
                issues.append(f"signature verify failed: {e}")

    return VerifyReport(
        bundle_path=str(bundle_path),
        n_entries=len(entries),
        n_pubkey_mismatch=n_mismatch,
        sig_valid=sig_valid,
        issues=issues,
    )
