"""Marketplace registry abstraction — filesystem + in-memory backends.

A real production marketplace would be S3/Postgres/CDN; for the
verifier loop we need two interchangeable test surfaces:

  • ``InMemoryMarketplace`` — dict-keyed bytes for fast unit tests
  • ``FilesystemMarketplace`` — copies the ZIP into a registry directory
    indexed by ``(plugin_id, version)``

Both implement ``MarketplaceRegistry`` so the verifier can target
either one without branching.
"""
from __future__ import annotations
import hashlib
import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol


class MarketplaceError(RuntimeError):
    pass


@dataclass
class PublishReceipt:
    plugin_id: str
    version: str
    handle: str                    # opaque "download key"
    body_sha256: str               # SHA-256 of the published ZIP body
    published_at_utc: str
    signature_b64: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "plugin_id": self.plugin_id,
            "version": self.version,
            "handle": self.handle,
            "body_sha256": self.body_sha256,
            "published_at_utc": self.published_at_utc,
            "signature_b64": self.signature_b64,
        }


class MarketplaceRegistry(Protocol):
    def publish(
        self,
        zip_path: Path,
        *,
        plugin_id: str,
        version: str,
        signature_b64: str | None = None,
    ) -> PublishReceipt: ...

    def download(self, handle: str, out_path: Path) -> Path: ...

    def lookup(self, handle: str) -> PublishReceipt: ...

    def list_handles(self) -> list[str]: ...


# ─── in-memory ──────────────────────────────────────────────────────


@dataclass
class InMemoryMarketplace:
    """Volatile registry backed by a dict; lives only for the test run."""

    _store: dict[str, bytes] = field(default_factory=dict)
    _receipts: dict[str, PublishReceipt] = field(default_factory=dict)

    def publish(
        self,
        zip_path: Path,
        *,
        plugin_id: str,
        version: str,
        signature_b64: str | None = None,
    ) -> PublishReceipt:
        data = Path(zip_path).read_bytes()
        body_sha = hashlib.sha256(data).hexdigest()
        handle = f"mem://{plugin_id}@{version}"
        self._store[handle] = data
        receipt = PublishReceipt(
            plugin_id=plugin_id,
            version=version,
            handle=handle,
            body_sha256=body_sha,
            published_at_utc=datetime.now(timezone.utc).isoformat(),
            signature_b64=signature_b64,
        )
        self._receipts[handle] = receipt
        return receipt

    def download(self, handle: str, out_path: Path) -> Path:
        if handle not in self._store:
            raise MarketplaceError(f"handle not found: {handle!r}")
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(self._store[handle])
        return out_path

    def lookup(self, handle: str) -> PublishReceipt:
        if handle not in self._receipts:
            raise MarketplaceError(f"handle not found: {handle!r}")
        return self._receipts[handle]

    def list_handles(self) -> list[str]:
        return sorted(self._receipts)


# ─── filesystem ─────────────────────────────────────────────────────


@dataclass
class FilesystemMarketplace:
    """Disk-backed registry — useful for end-to-end smoke tests."""

    root: Path

    def __post_init__(self) -> None:
        self.root = Path(self.root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _receipts_path(self) -> Path:
        return self.root / "receipts.json"

    def _load_receipts(self) -> dict[str, dict[str, Any]]:
        p = self._receipts_path()
        if not p.exists():
            return {}
        return json.loads(p.read_text())

    def _save_receipts(self, data: dict[str, dict[str, Any]]) -> None:
        self._receipts_path().write_text(json.dumps(data, indent=2,
                                                    sort_keys=True))

    def publish(
        self,
        zip_path: Path,
        *,
        plugin_id: str,
        version: str,
        signature_b64: str | None = None,
    ) -> PublishReceipt:
        zip_path = Path(zip_path)
        target_dir = self.root / plugin_id / version
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / zip_path.name
        shutil.copy2(zip_path, target)
        body_sha = hashlib.sha256(target.read_bytes()).hexdigest()
        handle = f"fs://{plugin_id}@{version}/{zip_path.name}"
        receipt = PublishReceipt(
            plugin_id=plugin_id,
            version=version,
            handle=handle,
            body_sha256=body_sha,
            published_at_utc=datetime.now(timezone.utc).isoformat(),
            signature_b64=signature_b64,
        )
        receipts = self._load_receipts()
        receipts[handle] = receipt.to_dict()
        receipts[handle]["_local_path"] = str(target)
        self._save_receipts(receipts)
        return receipt

    def download(self, handle: str, out_path: Path) -> Path:
        receipts = self._load_receipts()
        if handle not in receipts:
            raise MarketplaceError(f"handle not found: {handle!r}")
        src = Path(receipts[handle]["_local_path"])
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, out_path)
        return out_path

    def lookup(self, handle: str) -> PublishReceipt:
        receipts = self._load_receipts()
        if handle not in receipts:
            raise MarketplaceError(f"handle not found: {handle!r}")
        r = receipts[handle]
        return PublishReceipt(
            plugin_id=r["plugin_id"],
            version=r["version"],
            handle=r["handle"],
            body_sha256=r["body_sha256"],
            published_at_utc=r["published_at_utc"],
            signature_b64=r.get("signature_b64"),
        )

    def list_handles(self) -> list[str]:
        return sorted(self._load_receipts())
