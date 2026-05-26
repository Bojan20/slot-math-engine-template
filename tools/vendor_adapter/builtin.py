"""Built-in vendor adapters (vendor_a, vendor_b, vendor_c stub).

These delegate the heavy parsing to `tools/parse_par/` (W4.2) and
the YAML profiles in `tools/vendor_profiles/`. The adapter layer
just wraps those into the SDK contract.
"""
from __future__ import annotations
from typing import Any


def _vendor_a_detect(raw: bytes) -> bool:
    text = raw[:4096].decode("utf-8", errors="ignore").lower()
    return ("vendor a" in text) or ("vendora" in text) or ("par_001" in text)


def _vendor_b_detect(raw: bytes) -> bool:
    text = raw[:4096].decode("utf-8", errors="ignore").lower()
    return ("vendor b" in text) or ("vendorb" in text) or ("swid=" in text)


def _vendor_c_detect(raw: bytes) -> bool:
    text = raw[:4096].decode("utf-8", errors="ignore").lower()
    return "vendor_c" in text or "vendor-c" in text


def _stub_convert(raw: bytes, profile: dict[str, Any]) -> dict[str, Any]:
    """Minimal placeholder converter for new vendors. Real adapters
    delegate to `tools.parse_par.<vendor>.convert`; the stub
    surfaces enough structure to flow through invariant + IR fuzz
    tests, but is NOT production-grade."""
    vendor_id = profile.get("vendor_id", "unknown")
    text = raw.decode("utf-8", errors="ignore")
    swid = "S-STUB-0001"
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("swid="):
            swid = line.split("=", 1)[1].strip()
            break
    return {
        "meta": {
            "id": f"{vendor_id}_stub",
            "vendor": vendor_id,
            "swid": swid,
            "adapter_stub": True,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A", "B", "C", "D"] for _ in range(5)]},
        "paytable": [
            {"combo": ["A", "A", "A", "A", "A"], "pays": 100},
        ],
        "features": [],
    }


def register_builtin(registry) -> None:
    from tools.vendor_adapter.registry import VendorAdapter

    registry.register(VendorAdapter(
        vendor_id="vendor_a",
        description="Vendor A (PAR_001/PAR_002 family) — stub adapter",
        detect=_vendor_a_detect,
        convert=_stub_convert,
        version="0.1.0",
    ))
    registry.register(VendorAdapter(
        vendor_id="vendor_b",
        description="Vendor B (SWID-keyed text PAR) — stub adapter",
        detect=_vendor_b_detect,
        convert=_stub_convert,
        version="0.1.0",
    ))
    registry.register(VendorAdapter(
        vendor_id="vendor_c",
        description="Vendor C (universal native) — stub adapter",
        detect=_vendor_c_detect,
        convert=_stub_convert,
        version="0.1.0",
    ))
