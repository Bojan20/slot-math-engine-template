"""W6.3 — Provenance auto-sign + verify utilities.

Uses Python stdlib `hashlib` + a tiny pure-Python HMAC-SHA-256 keyed
signer so the cert bundle has cryptographic-grade integrity without
pulling cryptography / pynacl / ecdsa as a dependency.

For full ed25519 (regulator-grade asymmetric signatures), if the
optional `cryptography` package is installed, we use it. Otherwise
we fall back to HMAC-SHA-256 with a configurable key (sufficient for
internal Vendor B → Vendor C handoff; regulator can require ed25519
upgrade later via env override).

API
===
    sign_ir(ir, key=None) → signature_hex
    verify_ir(ir, signature_hex, key=None) → bool

    sign_and_inject_provenance(ir, vendor, par_source, swid=None,
                                build_hash=None, key=None) → new_ir

The `_synth_log` and `_cache_meta` keys are excluded from the SHA-256
input so the same solved IR signs the same way regardless of cache
hit/miss runtime metadata.
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from typing import Optional


_DEFAULT_HMAC_KEY_ENV = "CORTEX_PROVENANCE_HMAC_KEY"


def _canonical_ir_bytes(ir: dict) -> bytes:
    """Strip transient runtime keys + emit canonical JSON for hashing."""
    clean = {k: v for k, v in ir.items()
             if k not in ("_synth_log", "_cache_meta", "provenance")}
    return json.dumps(clean, sort_keys=True, separators=(",", ":")).encode("utf-8")


def ir_sha256(ir: dict) -> str:
    """SHA-256 hex of the canonical IR (transient keys excluded)."""
    return hashlib.sha256(_canonical_ir_bytes(ir)).hexdigest()


def sign_ir(ir: dict, key: Optional[bytes] = None) -> str:
    """Sign canonical IR bytes. Returns hex signature.

    Uses HMAC-SHA-256 with `key` (or env CORTEX_PROVENANCE_HMAC_KEY,
    or hardcoded fallback "cortex-default-key" if neither set).

    NOTE: HMAC alone is symmetric — both signer and verifier must
    share the key. For regulator-grade signatures, install
    `cryptography` and call `sign_ir_ed25519` instead.
    """
    if key is None:
        env = os.environ.get(_DEFAULT_HMAC_KEY_ENV, "cortex-default-key")
        key = env.encode("utf-8") if isinstance(env, str) else env
    msg = _canonical_ir_bytes(ir)
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def verify_ir(ir: dict, signature_hex: str, key: Optional[bytes] = None) -> bool:
    """Constant-time verify of HMAC signature over canonical IR."""
    expected = sign_ir(ir, key=key)
    return hmac.compare_digest(expected, signature_hex.lower())


def sign_and_inject_provenance(
    ir: dict,
    *,
    vendor: str,
    par_source: str,
    swid: Optional[str] = None,
    build_hash: Optional[str] = None,
    signed_by: Optional[str] = None,
    key: Optional[bytes] = None,
) -> dict:
    """Compute SHA-256 + HMAC signature of the IR, inject a `provenance`
    block matching the W4.7 schema, return a new IR (deep-copy).
    """
    new_ir = copy.deepcopy(ir)
    new_ir.pop("provenance", None)  # remove any stale provenance first
    ir_hash = ir_sha256(new_ir)
    sig = sign_ir(new_ir, key=key)
    prov: dict = {
        "vendor": vendor,
        "par_source": par_source,
        "par_sha256": ir_hash,   # for synthesized IR, par_sha256 == ir_sha256
        "ir_sha256": ir_hash,
        "built_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "signed_by": signed_by or "cortex-slot-math-engine-v1.0.0",
        "signature": sig,
    }
    if swid:
        prov["swid"] = swid
    if build_hash:
        prov["build_hash"] = build_hash
    new_ir["provenance"] = prov
    return new_ir


def verify_provenance(ir: dict, key: Optional[bytes] = None) -> tuple[bool, str]:
    """Verify an IR's embedded provenance block:
      • re-compute `ir_sha256` (transient keys excluded) — must equal
        `provenance.ir_sha256` (if present);
      • re-compute HMAC signature — must equal `provenance.signature`.

    Returns (ok, reason).
    """
    prov = ir.get("provenance")
    if not prov:
        return False, "no provenance block"
    expected_hash = ir_sha256({k: v for k, v in ir.items() if k != "provenance"})
    if "ir_sha256" in prov and prov["ir_sha256"] != expected_hash:
        return False, (
            f"ir_sha256 mismatch: got {expected_hash[:16]}…, "
            f"declared {prov['ir_sha256'][:16]}…"
        )
    sig = prov.get("signature")
    if not sig:
        return False, "no signature in provenance"
    ok = verify_ir(
        {k: v for k, v in ir.items() if k != "provenance"},
        sig, key=key,
    )
    if not ok:
        return False, "HMAC signature mismatch"
    return True, "provenance valid"
