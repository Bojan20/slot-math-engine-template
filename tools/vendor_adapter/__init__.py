"""W33 — Vendor Adapter SDK.

Stable plugin contract for vendor PAR/spec → universal IR
converters. Each adapter ships:

  • `vendor_id` (matches the YAML profile in `tools/vendor_profiles/`)
  • `detect(raw_bytes) -> bool` (sniffs whether this format)
  • `convert(raw_bytes, profile) -> ir` (returns universal IR dict)
  • `roundtrip_fingerprint(ir) -> str` (hex hash for bit-identical
    round-trip checks)

The registry below auto-discovers built-in adapters; downstream
projects may register additional vendors via `register()`.
"""
from tools.vendor_adapter.registry import (
    VendorAdapter,
    AdapterRegistry,
    register,
    list_adapters,
    get,
    detect_vendor,
    DEFAULT_REGISTRY,
)
from tools.vendor_adapter.builtin import register_builtin

# Register the bundled adapters on import.
register_builtin(DEFAULT_REGISTRY)


__all__ = [
    "VendorAdapter",
    "AdapterRegistry",
    "register",
    "list_adapters",
    "get",
    "detect_vendor",
    "DEFAULT_REGISTRY",
    "register_builtin",
]
