"""W6.3 + W6.10 — Provenance auto-sign + verify utilities.

Two algorithm tracks:

  • **HMAC-SHA-256** (default, stdlib-only): symmetric, signer and
    verifier share a key. Env-overridable via `CORTEX_PROVENANCE_HMAC_KEY`.

  • **ed25519** (W6.10, optional asymmetric): private key on build
    machine, public key embedded in provenance. Activated if
    `cryptography` package is installed AND
    `CORTEX_PROVENANCE_ED25519_PRIVATE_KEY` env var (PEM text) is set.

`algo="auto"` (default) picks ed25519 when available, else HMAC.
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
_ED25519_PRIVATE_ENV = "CORTEX_PROVENANCE_ED25519_PRIVATE_KEY"
_ED25519_PUBLIC_ENV = "CORTEX_PROVENANCE_ED25519_PUBLIC_KEY"


def _ed25519_available() -> bool:
    try:
        from cryptography.hazmat.primitives.asymmetric import ed25519  # noqa: F401
        return True
    except ImportError:
        return False


def _ed25519_active() -> bool:
    """ed25519 is active if both `cryptography` is installed AND a
    private key is in the env."""
    return _ed25519_available() and bool(os.environ.get(_ED25519_PRIVATE_ENV))


def _canonical_ir_bytes(ir: dict) -> bytes:
    """Strip transient runtime keys + emit canonical JSON for hashing."""
    clean = {k: v for k, v in ir.items()
             if k not in ("_synth_log", "_cache_meta", "provenance")}
    return json.dumps(clean, sort_keys=True, separators=(",", ":")).encode("utf-8")


def ir_sha256(ir: dict) -> str:
    """SHA-256 hex of the canonical IR (transient keys excluded)."""
    return hashlib.sha256(_canonical_ir_bytes(ir)).hexdigest()


def _sign_hmac(ir: dict, key: Optional[bytes] = None) -> str:
    if key is None:
        env = os.environ.get(_DEFAULT_HMAC_KEY_ENV, "cortex-default-key")
        key = env.encode("utf-8") if isinstance(env, str) else env
    msg = _canonical_ir_bytes(ir)
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def _verify_hmac(ir: dict, sig: str, key: Optional[bytes] = None) -> bool:
    expected = _sign_hmac(ir, key=key)
    return hmac.compare_digest(expected, sig.lower())


def _sign_ed25519(ir: dict) -> str:
    """Sign canonical IR bytes using ed25519. Returns hex signature.
    Requires `cryptography` + `CORTEX_PROVENANCE_ED25519_PRIVATE_KEY`
    env var (PEM text). Raises if either is missing.
    """
    from cryptography.hazmat.primitives import serialization
    pem = os.environ.get(_ED25519_PRIVATE_ENV)
    if not pem:
        raise RuntimeError(
            f"ed25519 signing requested but {_ED25519_PRIVATE_ENV} is not set"
        )
    private_key = serialization.load_pem_private_key(
        pem.encode("utf-8"), password=None,
    )
    sig_bytes = private_key.sign(_canonical_ir_bytes(ir))
    return sig_bytes.hex()


def _verify_ed25519(ir: dict, sig_hex: str, public_pem: Optional[str] = None) -> bool:
    """Verify ed25519 signature. `public_pem` falls back to env
    `CORTEX_PROVENANCE_ED25519_PUBLIC_KEY` if not given.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.exceptions import InvalidSignature

    pem = public_pem or os.environ.get(_ED25519_PUBLIC_ENV)
    if not pem:
        # Auto-derive public from private if available
        priv = os.environ.get(_ED25519_PRIVATE_ENV)
        if not priv:
            return False
        priv_obj = serialization.load_pem_private_key(
            priv.encode("utf-8"), password=None,
        )
        public_key = priv_obj.public_key()
    else:
        public_key = serialization.load_pem_public_key(pem.encode("utf-8"))
    try:
        public_key.verify(bytes.fromhex(sig_hex), _canonical_ir_bytes(ir))
        return True
    except (InvalidSignature, ValueError):
        return False


def sign_ir(
    ir: dict,
    key: Optional[bytes] = None,
    *,
    algo: str = "auto",
) -> str:
    """Sign canonical IR bytes. Returns hex signature.

    algo:
      • "auto"    — ed25519 if available + env key set, else hmac
      • "hmac"    — force HMAC-SHA-256 (key arg / env var)
      • "ed25519" — force ed25519 (env-set private PEM required)
    """
    if algo == "auto":
        algo = "ed25519" if _ed25519_active() else "hmac"
    if algo == "ed25519":
        return _sign_ed25519(ir)
    return _sign_hmac(ir, key=key)


def verify_ir(
    ir: dict,
    signature_hex: str,
    key: Optional[bytes] = None,
    *,
    algo: str = "auto",
    public_pem: Optional[str] = None,
) -> bool:
    """Constant-time / asymmetric verify of signature over canonical IR.

    `algo` mirrors `sign_ir`. For ed25519 verify-only contexts, set
    `CORTEX_PROVENANCE_ED25519_PUBLIC_KEY` env var or pass `public_pem`.
    """
    if algo == "auto":
        algo = "ed25519" if _ed25519_active() else "hmac"
    if algo == "ed25519":
        return _verify_ed25519(ir, signature_hex, public_pem=public_pem)
    return _verify_hmac(ir, signature_hex, key=key)


def sign_and_inject_provenance(
    ir: dict,
    *,
    vendor: str,
    par_source: str,
    swid: Optional[str] = None,
    build_hash: Optional[str] = None,
    signed_by: Optional[str] = None,
    key: Optional[bytes] = None,
    algo: str = "auto",
) -> dict:
    """Compute SHA-256 + signature of the IR (HMAC or ed25519), inject a
    `provenance` block matching the W4.7 schema, return a new IR
    (deep-copy).
    """
    new_ir = copy.deepcopy(ir)
    new_ir.pop("provenance", None)
    ir_hash = ir_sha256(new_ir)
    sig = sign_ir(new_ir, key=key, algo=algo)
    if algo == "auto":
        effective_algo = "ed25519" if _ed25519_active() else "hmac"
    else:
        effective_algo = algo
    prov: dict = {
        "vendor": vendor,
        "par_source": par_source,
        "par_sha256": ir_hash,
        "ir_sha256": ir_hash,
        "built_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "signed_by": signed_by or "cortex-slot-math-engine-v1.0.0",
        "signature": sig,
        "signature_algo": effective_algo,
    }
    if swid:
        prov["swid"] = swid
    if build_hash:
        prov["build_hash"] = build_hash
    new_ir["provenance"] = prov
    return new_ir


def verify_provenance(
    ir: dict,
    key: Optional[bytes] = None,
    *,
    public_pem: Optional[str] = None,
) -> tuple[bool, str]:
    """Verify an IR's embedded provenance block. Algorithm is auto-detected
    from `provenance.signature_algo` (defaults to "hmac" for legacy
    provenance blocks).

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
    algo = prov.get("signature_algo", "hmac")
    ok = verify_ir(
        {k: v for k, v in ir.items() if k != "provenance"},
        sig, key=key, algo=algo, public_pem=public_pem,
    )
    if not ok:
        return False, f"{algo} signature mismatch"
    return True, f"provenance valid ({algo})"
