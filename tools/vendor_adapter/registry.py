"""Adapter registry — pluggable vendor format dispatch.

VendorAdapter is a Protocol-like dataclass binding 3 callables.
The registry maps `vendor_id` → adapter and provides:
  • register() for downstream extension
  • detect_vendor(raw_bytes) sniff returning the first matching id
  • list_adapters() introspection for `slot-vendor-adapter list`
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Callable


# Type aliases for clarity.
DetectFn = Callable[[bytes], bool]
ConvertFn = Callable[[bytes, dict[str, Any]], dict[str, Any]]
FingerprintFn = Callable[[dict[str, Any]], str]


def default_fingerprint(ir: dict[str, Any]) -> str:
    """Canonical SHA-256 of an IR (without `meta.lock_root_hash`)."""
    import copy
    cp = copy.deepcopy(ir)
    meta = cp.get("meta")
    if isinstance(meta, dict):
        meta.pop("lock_root_hash", None)
    blob = json.dumps(cp, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()


@dataclass
class VendorAdapter:
    vendor_id: str
    description: str
    detect: DetectFn
    convert: ConvertFn
    fingerprint: FingerprintFn = default_fingerprint
    version: str = "0.1.0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "vendor_id": self.vendor_id,
            "description": self.description,
            "version": self.version,
        }


@dataclass
class AdapterRegistry:
    _by_id: dict[str, VendorAdapter] = field(default_factory=dict)

    def register(self, adapter: VendorAdapter, *, override: bool = False) -> None:
        if not override and adapter.vendor_id in self._by_id:
            raise ValueError(
                f"vendor_id {adapter.vendor_id!r} already registered; "
                "pass override=True to replace"
            )
        self._by_id[adapter.vendor_id] = adapter

    def get(self, vendor_id: str) -> VendorAdapter:
        try:
            return self._by_id[vendor_id]
        except KeyError as e:
            raise KeyError(
                f"no adapter registered for vendor_id {vendor_id!r}"
            ) from e

    def list_adapters(self) -> list[VendorAdapter]:
        return [self._by_id[k] for k in sorted(self._by_id)]

    def detect_vendor(self, raw_bytes: bytes) -> str | None:
        for vendor_id in sorted(self._by_id):
            try:
                if self._by_id[vendor_id].detect(raw_bytes):
                    return vendor_id
            except Exception:
                continue
        return None


# ─── Module-level convenience ──────────────────────────────────────


DEFAULT_REGISTRY = AdapterRegistry()


def register(adapter: VendorAdapter, *, override: bool = False) -> None:
    DEFAULT_REGISTRY.register(adapter, override=override)


def get(vendor_id: str) -> VendorAdapter:
    return DEFAULT_REGISTRY.get(vendor_id)


def list_adapters() -> list[VendorAdapter]:
    return DEFAULT_REGISTRY.list_adapters()


def detect_vendor(raw_bytes: bytes) -> str | None:
    return DEFAULT_REGISTRY.detect_vendor(raw_bytes)
