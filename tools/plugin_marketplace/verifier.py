"""Marketplace publish→download→verify round-trip harness.

Builds atop ``tools.plugin_bundle`` (W20):

  1. publish: take a built bundle ZIP, hand it to a MarketplaceRegistry
  2. lookup:  fetch the receipt by handle and check body SHA-256
  3. download: pull the bytes back to a local path
  4. verify:   re-run ``inspect_bundle`` and confirm SHA-256 of the
               downloaded ZIP matches the publish receipt + every
               manifest entry's per-file hash matches the in-zip body.

Any mismatch flags a tamper and the report carries the specific
mismatch list.
"""
from __future__ import annotations
import hashlib
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tools.plugin_bundle.bundler import inspect_bundle
from tools.plugin_marketplace.registry import (
    MarketplaceRegistry,
    PublishReceipt,
)


def _safe_inspect(zip_path: Path) -> dict[str, Any]:
    """Wrap inspect_bundle so a corrupted ZIP body downgrades to a
    structured tamper report instead of an exception."""
    try:
        return inspect_bundle(zip_path)
    except zipfile.BadZipFile as e:
        return {
            "manifest": None,
            "passed": False,
            "mismatches": [f"bad zip body: {e}"],
            "body_sha256": "",
        }
    except (OSError, KeyError) as e:
        return {
            "manifest": None,
            "passed": False,
            "mismatches": [f"inspect error: {e}"],
            "body_sha256": "",
        }


@dataclass
class RoundTripReport:
    publish_handle: str
    publish_body_sha256: str
    download_body_sha256: str
    body_sha_matches: bool
    manifest_passed: bool
    manifest_mismatches: list[str] = field(default_factory=list)
    tamper_detected: bool = False
    tamper_kind: str | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return (
            self.body_sha_matches
            and self.manifest_passed
            and not self.tamper_detected
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "publish_handle": self.publish_handle,
            "publish_body_sha256": self.publish_body_sha256,
            "download_body_sha256": self.download_body_sha256,
            "body_sha_matches": self.body_sha_matches,
            "manifest_passed": self.manifest_passed,
            "manifest_mismatches": list(self.manifest_mismatches),
            "tamper_detected": self.tamper_detected,
            "tamper_kind": self.tamper_kind,
            "notes": list(self.notes),
            "passed": self.passed,
        }


@dataclass
class MarketplaceVerifier:
    registry: MarketplaceRegistry

    def round_trip(
        self,
        zip_path: Path,
        *,
        plugin_id: str,
        version: str,
        download_dir: Path,
        signature_b64: str | None = None,
    ) -> RoundTripReport:
        zip_path = Path(zip_path)
        download_dir = Path(download_dir)
        download_dir.mkdir(parents=True, exist_ok=True)

        # 1) publish
        receipt = self.registry.publish(
            zip_path,
            plugin_id=plugin_id,
            version=version,
            signature_b64=signature_b64,
        )

        # 2) lookup
        looked_up = self.registry.lookup(receipt.handle)
        notes: list[str] = []
        if looked_up.body_sha256 != receipt.body_sha256:
            notes.append("lookup receipt sha drift")

        # 3) download
        dl_path = download_dir / zip_path.name
        self.registry.download(receipt.handle, dl_path)
        dl_sha = hashlib.sha256(dl_path.read_bytes()).hexdigest()
        sha_matches = (dl_sha == receipt.body_sha256)

        # 4) re-inspect
        inspect = _safe_inspect(dl_path)
        mismatches: list[str] = list(inspect.get("mismatches") or [])
        manifest_passed = bool(inspect.get("passed", False))

        tamper = False
        tamper_kind: str | None = None
        if not sha_matches:
            tamper = True
            tamper_kind = "body_sha_drift"
        elif not manifest_passed:
            tamper = True
            tamper_kind = "manifest_mismatch"

        return RoundTripReport(
            publish_handle=receipt.handle,
            publish_body_sha256=receipt.body_sha256,
            download_body_sha256=dl_sha,
            body_sha_matches=sha_matches,
            manifest_passed=manifest_passed,
            manifest_mismatches=mismatches,
            tamper_detected=tamper,
            tamper_kind=tamper_kind,
            notes=notes,
        )

    def verify_existing(
        self,
        handle: str,
        download_dir: Path,
    ) -> RoundTripReport:
        """Verify an already-published handle (no rebuild).

        Useful for periodic CI gates that re-pull live bundles and
        confirm nothing has shifted server-side.
        """
        download_dir = Path(download_dir)
        download_dir.mkdir(parents=True, exist_ok=True)
        receipt: PublishReceipt = self.registry.lookup(handle)
        dl_path = download_dir / f"{receipt.plugin_id}-{receipt.version}.zip"
        self.registry.download(handle, dl_path)
        dl_sha = hashlib.sha256(dl_path.read_bytes()).hexdigest()
        sha_matches = (dl_sha == receipt.body_sha256)
        inspect = _safe_inspect(dl_path)
        mismatches: list[str] = list(inspect.get("mismatches") or [])
        manifest_passed = bool(inspect.get("passed", False))

        tamper = False
        tamper_kind: str | None = None
        if not sha_matches:
            tamper = True
            tamper_kind = "body_sha_drift"
        elif not manifest_passed:
            tamper = True
            tamper_kind = "manifest_mismatch"

        return RoundTripReport(
            publish_handle=handle,
            publish_body_sha256=receipt.body_sha256,
            download_body_sha256=dl_sha,
            body_sha_matches=sha_matches,
            manifest_passed=manifest_passed,
            manifest_mismatches=mismatches,
            tamper_detected=tamper,
            tamper_kind=tamper_kind,
        )
