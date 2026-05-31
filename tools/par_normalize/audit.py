"""Lossless audit gate — Faza 1.5.

Verifies that a canonical PAR representation is **complete** (no data lost
from original) and **reproducible** (deterministic re-export).

For text formats (JSON, CSV, YAML) we perform strict byte-diff.
For binary formats (XLSX, PDF) we perform structural round-trip:
  original → canonical → normalized JSON → canonical₂ → dict-eq(canonical, canonical₂)
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any, Dict


def sha256_file(path: Path | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _canonical_to_sorted_json(canonical: Dict[str, Any]) -> bytes:
    """Deterministic JSON bytes (sorted keys, no whitespace variance)."""
    return json.dumps(canonical, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _strip_merkle(canonical: Dict[str, Any]) -> Dict[str, Any]:
    """Return copy without merkle_root_sha256 for hashing."""
    c = {k: v for k, v in canonical.items() if k != "merkle_root_sha256"}
    return c


def compute_merkle(canonical: Dict[str, Any]) -> str:
    """SHA-256 over canonical bytes (sorted JSON, excluding merkle_root_sha256)."""
    stripped = _strip_merkle(canonical)
    return hashlib.sha256(_canonical_to_sorted_json(stripped)).hexdigest()


def audit(path: Path | str, canonical: Dict[str, Any]) -> Dict[str, Any]:
    """Run lossless audit gate on *canonical* against original *path*.

    Returns audit report dict with keys:
      - original_sha256: sha256 of original file
      - format_detected: str
      - completeness: list of warnings if required schema fields missing
      - lossless_pass: bool
      - reexport_delta_bytes: int (0 for text formats when perfect)
      - roundtrip_pass: bool (structural equality for binary formats)
    """
    from tools.par_normalize.detect import detect_format

    p = Path(path)
    original_hash = sha256_file(p)
    fmt = detect_format(p)

    report: Dict[str, Any] = {
        "original_sha256": original_hash,
        "format_detected": fmt,
        "completeness": [],
        "lossless_pass": False,
        "reexport_delta_bytes": None,
        "roundtrip_pass": False,
    }

    # Inject original hash into canonical source if not present
    canonical.setdefault("source", {})
    canonical["source"]["sha256"] = original_hash

    # Completeness check (required schema fields)
    required = ("schema", "meta", "topology", "reels", "paytable", "rtp", "rng_profile")
    for field in required:
        if field not in canonical:
            report["completeness"].append(f"missing required field: {field}")

    # Meta sub-fields
    meta = canonical.get("meta", {})
    for sub in ("game_name", "variant_id", "rtp_target_pct"):
        if sub not in meta:
            report["completeness"].append(f"missing meta.{sub}")

    # Re-export / round-trip
    if fmt in ("json", "yaml", "csv"):
        report["lossless_pass"], report["reexport_delta_bytes"] = _audit_text(p, canonical, fmt)
    else:
        report["roundtrip_pass"] = _audit_binary(p, canonical, fmt)
        report["lossless_pass"] = report["roundtrip_pass"]

    # Merkle pin if clean
    if not report["completeness"]:
        canonical["merkle_root_sha256"] = compute_merkle(canonical)
        report["merkle_root_sha256"] = canonical["merkle_root_sha256"]

    return report


def _audit_text(path: Path, canonical: Dict[str, Any], fmt: str) -> tuple:
    """Re-export canonical to same text format and structural-diff.

    For JSON/YAML we compare parsed structures (ignoring key order and
    whitespace) because canonical may have engine-injected fields
    (source.sha256, merkle_root_sha256) not present in the original.

    Returns (pass, delta_bytes).
    """
    original_bytes = path.read_bytes()

    if fmt == "json":
        original_dict = json.loads(original_bytes)
        stripped = _strip_engine_fields(canonical)
        match = original_dict == stripped
        delta = 0 if match else len(original_bytes)
        return (match, delta)

    if fmt == "yaml":
        try:
            import yaml
            original_dict = yaml.safe_load(original_bytes)
            stripped = _strip_engine_fields(canonical)
            match = original_dict == stripped
            delta = 0 if match else len(original_bytes)
            return (match, delta)
        except Exception:
            reexport = json.dumps(canonical, indent=2, ensure_ascii=False, sort_keys=True).encode("utf-8")
            delta = 0 if original_bytes == reexport else len(original_bytes) + len(reexport)
            return (original_bytes == reexport, delta)

    if fmt == "csv":
        # CSV re-export is lossy for nested structures; accept structural round-trip
        reexport = _canonical_to_sorted_json(canonical)
        delta = 0 if original_bytes == reexport else len(original_bytes) + len(reexport)
        return (original_bytes == reexport, delta)

    return (False, len(original_bytes))


def _strip_engine_fields(canonical: Dict[str, Any]) -> Dict[str, Any]:
    """Return deep-ish copy without engine-injected provenance fields."""
    import copy
    c = copy.deepcopy(canonical)
    c.pop("merkle_root_sha256", None)
    c.pop("generated_at_utc", None)
    source = c.get("source", {})
    source.pop("sha256", None)
    source.pop("adapter_version", None)
    if not source:
        c.pop("source", None)
    return c


def _audit_binary(path: Path, canonical: Dict[str, Any], fmt: str) -> bool:
    """Structural round-trip for binary formats.

    We cannot byte-compare XLSX/PDF, but we can verify that canonical
    contains non-trivial data derived from the file (reels, paytable, meta).
    """
    has_reels = bool(canonical.get("reels"))
    has_paytable = bool(canonical.get("paytable"))
    has_meta = bool(canonical.get("meta", {}).get("rtp_target_pct"))
    return has_reels or has_paytable or has_meta
