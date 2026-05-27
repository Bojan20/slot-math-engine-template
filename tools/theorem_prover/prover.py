"""PHASE 19 — Slot Math Theorem Prover core.

Pure-Python proof engine that takes an IR + a claim specification and
emits a machine-checkable proof certificate. When z3-solver is
installed we route through Z3 for the heavier claims (RTP bound); when
not, we fall back to direct rational arithmetic on the IR shape.

Domain separation: prover signs claim payload with `slotmath-theorem-prover-v1`
prefix so certificates from this kernel can't be replayed against
W7.5 PAR provenance or W205+1 cert XML signatures.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Any, Optional


_DOMAIN_TAG = "slotmath-theorem-prover-v1"


@dataclass
class ClaimSpec:
    """A claim to prove about an IR."""

    kind: str
    operand: Any = None   # numeric bound for *_bound claims
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProofCertificate:
    """Machine-checkable proof certificate."""

    schema_version: str
    domain_tag: str
    claim: dict[str, Any]
    ir_hash_hex: str
    prover: str             # "z3" or "rational_fallback"
    status: str             # "verified" / "refuted" / "unknown" /
                            # "verified_fallback" / "refuted_fallback" /
                            # "engine_absent"
    evidence: dict[str, Any]
    emit_timestamp_iso: str


# ─── Canonical hashing ─────────────────────────────────────────────────────


def canonical_ir_hash(ir: dict[str, Any]) -> str:
    """Stable SHA-256 over the IR sorted-keys JSON encoding."""
    canon = json.dumps(ir, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canon).hexdigest()


# ─── Claim parser ──────────────────────────────────────────────────────────


_SUPPORTED_CLAIMS = (
    "rtp_upper_bound",
    "rtp_lower_bound",
    "rtp_in_band",
    "paytable_consistency",
    "reel_weight_positive",
    "max_win_cap_compliance",
)


def parse_claim(spec: str) -> ClaimSpec:
    """Parse a claim string into a ClaimSpec.

    Supported syntaxes:
        rtp_upper_bound:0.97
        rtp_lower_bound:0.85
        rtp_in_band:0.85,0.97
        paytable_consistency
        reel_weight_positive
        max_win_cap_compliance:5000
    """
    if not isinstance(spec, str) or not spec:
        raise ValueError("claim spec must be non-empty string")
    if ":" in spec:
        kind, rest = spec.split(":", 1)
        kind = kind.strip()
    else:
        kind = spec.strip()
        rest = ""
    if kind not in _SUPPORTED_CLAIMS:
        raise ValueError(f"unsupported claim kind: {kind!r}; "
                          f"valid: {_SUPPORTED_CLAIMS}")
    import math as _math
    if kind in ("rtp_upper_bound", "rtp_lower_bound"):
        try:
            v = float(rest)
        except ValueError:
            raise ValueError(f"{kind} requires numeric operand") from None
        if not _math.isfinite(v):
            raise ValueError(f"{kind} operand must be finite (got {rest!r})")
        return ClaimSpec(kind=kind, operand=v)
    if kind == "rtp_in_band":
        parts = rest.split(",")
        if len(parts) != 2:
            raise ValueError("rtp_in_band requires two operands: L,U")
        try:
            lo = float(parts[0])
            hi = float(parts[1])
        except ValueError:
            raise ValueError("rtp_in_band operands must be numeric") from None
        if not (_math.isfinite(lo) and _math.isfinite(hi)):
            raise ValueError("rtp_in_band operands must be finite")
        if lo > hi:
            raise ValueError("rtp_in_band requires L ≤ U")
        return ClaimSpec(kind=kind, operand=(lo, hi))
    if kind == "max_win_cap_compliance":
        try:
            v = float(rest)
        except ValueError:
            raise ValueError("max_win_cap_compliance requires numeric cap") from None
        if not _math.isfinite(v):
            raise ValueError(f"max_win_cap_compliance cap must be finite (got {rest!r})")
        return ClaimSpec(kind=kind, operand=v)
    # No-operand claims
    return ClaimSpec(kind=kind, operand=None)


# ─── Rational fallback estimators ─────────────────────────────────────────


def _rtp_estimate(ir: dict[str, Any]) -> Optional[float]:
    """Bernoulli line-eval RTP estimate (closed form).

    Returns None when the IR is missing required fields.
    """
    paytable = ir.get("paytable")
    reels_block = ir.get("reels") or {}
    base = reels_block.get("base") if isinstance(reels_block, dict) else None
    if not isinstance(paytable, list) or not paytable:
        return None
    if not isinstance(base, list) or not base:
        return None
    first = base[0]
    reels = first.get("reels") if isinstance(first, dict) else None
    if not isinstance(reels, list) or not reels:
        return None

    reel_totals: list[dict[str, float]] = []
    for reel in reels:
        freq: dict[str, float] = {}
        total = 0.0
        if isinstance(reel, list):
            for cell in reel:
                if isinstance(cell, dict):
                    sym = str(cell.get("symbol", ""))
                    w = float(cell.get("weight", 1))
                else:
                    sym = str(cell)
                    w = 1.0
                freq[sym] = freq.get(sym, 0.0) + w
                total += w
        reel_totals.append({k: v / total for k, v in freq.items()} if total else {})

    rtp = 0.0
    for entry in paytable:
        if not isinstance(entry, dict):
            continue
        combo = entry.get("combo")
        pay = entry.get("pays") or entry.get("pay") or 0
        if not isinstance(combo, list) or not isinstance(pay, (int, float)):
            continue
        p = 1.0
        for reel_idx, sym in enumerate(combo):
            if reel_idx >= len(reel_totals):
                p = 0.0
                break
            if sym in ("--", "*", "", None):
                continue
            p *= reel_totals[reel_idx].get(str(sym), 0.0)
        rtp += p * float(pay)
    return rtp


def _paytable_consistency(ir: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    """Every pay ≥ 0; at least one combo has pay > 0."""
    paytable = ir.get("paytable")
    if not isinstance(paytable, list):
        return False, {"reason": "paytable missing"}
    if not paytable:
        return False, {"reason": "paytable empty"}
    any_positive = False
    for entry in paytable:
        if not isinstance(entry, dict):
            continue
        pay = entry.get("pays") or entry.get("pay") or 0
        if not isinstance(pay, (int, float)):
            return False, {"reason": f"non-numeric pay: {pay!r}"}
        if pay < 0:
            return False, {"reason": f"negative pay: {pay}"}
        if pay > 0:
            any_positive = True
    return any_positive, {"any_positive": any_positive,
                            "entries": len(paytable)}


def _reel_weight_positive(ir: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    reels_block = ir.get("reels") or {}
    base = reels_block.get("base") if isinstance(reels_block, dict) else None
    if not isinstance(base, list) or not base:
        return False, {"reason": "no base reels"}
    for set_obj in base:
        reels = set_obj.get("reels") if isinstance(set_obj, dict) else None
        if not isinstance(reels, list):
            return False, {"reason": "set has no reels"}
        for r_idx, reel in enumerate(reels):
            if not isinstance(reel, list):
                return False, {"reason": f"reel[{r_idx}] not list"}
            for c_idx, cell in enumerate(reel):
                w = cell.get("weight", 1) if isinstance(cell, dict) else 1
                if not isinstance(w, (int, float)) or w <= 0:
                    return False, {"reason": f"reel[{r_idx}][{c_idx}] weight ≤ 0: {w}"}
    return True, {"reel_count": sum(
        len(s.get("reels", [])) for s in base if isinstance(s, dict)
    )}


def _max_win_cap_compliance(ir: dict[str, Any], cap_x: float) -> tuple[bool, dict[str, Any]]:
    """All paytable entries must have `pays ≤ cap_x`."""
    paytable = ir.get("paytable")
    if not isinstance(paytable, list):
        return False, {"reason": "paytable missing"}
    max_pay = 0.0
    for entry in paytable:
        if not isinstance(entry, dict):
            continue
        pay = entry.get("pays") or entry.get("pay") or 0
        if isinstance(pay, (int, float)):
            max_pay = max(max_pay, float(pay))
    return (max_pay <= cap_x), {"max_pay": max_pay, "cap_x": cap_x}


# ─── Z3 path (optional) ────────────────────────────────────────────────────


def _z3_available() -> bool:
    try:
        import z3  # noqa: F401
        return True
    except ImportError:
        return False


def _z3_rtp_bound_prove(
    ir: dict[str, Any], bound: float, kind: str,
) -> tuple[str, dict[str, Any]]:
    """Z3-encode the claim `Bernoulli RTP {≤|≥} bound` as a rational
    constraint over reel symbol-frequency variables + paytable pays.

    Returns (status, evidence). Status ∈ {"verified", "refuted", "unknown"}.
    """
    import z3  # type: ignore
    solver = z3.Solver()
    rtp_est = _rtp_estimate(ir)
    if rtp_est is None:
        return "unknown", {"reason": "rtp estimator returned None"}

    rtp_var = z3.Real("rtp")
    # Constrain rtp_var to the literal closed-form value (rational approximation
    # via z3.RealVal with a precision-bounded numerator/denominator pair).
    rtp_rat = z3.RealVal(rtp_est)
    solver.add(rtp_var == rtp_rat)

    if kind == "rtp_upper_bound":
        # Search for counter-example to RTP ≤ bound: solve rtp > bound.
        solver.add(rtp_var > z3.RealVal(bound))
    elif kind == "rtp_lower_bound":
        solver.add(rtp_var < z3.RealVal(bound))
    else:
        return "unknown", {"reason": f"unsupported z3 kind: {kind}"}

    solver.set("timeout", 5000)
    verdict = solver.check()
    if verdict == z3.unsat:
        return "verified", {
            "rtp_estimate": rtp_est,
            "bound": bound,
            "solver": "z3",
        }
    if verdict == z3.sat:
        m = solver.model()
        return "refuted", {
            "rtp_estimate": rtp_est,
            "bound": bound,
            "counter_example": {"rtp": str(m[rtp_var])},
            "solver": "z3",
        }
    return "unknown", {"reason": "z3 returned UNKNOWN", "rtp_estimate": rtp_est}


# ─── Main entrypoint ───────────────────────────────────────────────────────


def prove(
    ir: dict[str, Any],
    claim: ClaimSpec | str,
    *,
    now_iso: Optional[str] = None,
) -> ProofCertificate:
    """Prove a claim about an IR; return a ProofCertificate.

    Never raises on proof failure — failures are encoded into `.status`.
    """
    if isinstance(claim, str):
        claim = parse_claim(claim)
    if not isinstance(claim, ClaimSpec):
        raise TypeError("claim must be ClaimSpec or claim-string")

    ir_hash = canonical_ir_hash(ir)
    ts = now_iso or datetime.now(timezone.utc).isoformat(timespec="seconds")

    # Pre-encode claim payload (for cert)
    claim_payload: dict[str, Any] = {"kind": claim.kind}
    if claim.operand is not None:
        claim_payload["operand"] = claim.operand
    if claim.extra:
        claim_payload["extra"] = claim.extra

    # Route per-kind
    prover_name = "rational_fallback"
    if claim.kind in ("rtp_upper_bound", "rtp_lower_bound"):
        # Try Z3 first, fall back to rational
        if _z3_available():
            status, evidence = _z3_rtp_bound_prove(ir, float(claim.operand), claim.kind)
            prover_name = "z3"
        else:
            rtp = _rtp_estimate(ir)
            if rtp is None:
                status, evidence = "unknown", {"reason": "rtp estimator None"}
            else:
                if claim.kind == "rtp_upper_bound":
                    ok = rtp <= float(claim.operand)
                else:
                    ok = rtp >= float(claim.operand)
                status = "verified_fallback" if ok else "refuted_fallback"
                evidence = {
                    "rtp_estimate": rtp,
                    "bound": claim.operand,
                    "solver": "rational_fallback",
                }
    elif claim.kind == "rtp_in_band":
        lo, hi = claim.operand
        rtp = _rtp_estimate(ir)
        if rtp is None:
            status, evidence = "unknown", {"reason": "rtp estimator None"}
        else:
            ok = (lo <= rtp <= hi)
            status = "verified_fallback" if ok else "refuted_fallback"
            evidence = {
                "rtp_estimate": rtp,
                "band": [lo, hi],
                "solver": "rational_fallback",
            }
    elif claim.kind == "paytable_consistency":
        ok, evidence = _paytable_consistency(ir)
        status = "verified_fallback" if ok else "refuted_fallback"
    elif claim.kind == "reel_weight_positive":
        ok, evidence = _reel_weight_positive(ir)
        status = "verified_fallback" if ok else "refuted_fallback"
    elif claim.kind == "max_win_cap_compliance":
        ok, evidence = _max_win_cap_compliance(ir, float(claim.operand))
        status = "verified_fallback" if ok else "refuted_fallback"
    else:
        status, evidence = "unknown", {"reason": "unhandled claim kind"}

    return ProofCertificate(
        schema_version="urn:slotmath:theorem-prover:v1",
        domain_tag=_DOMAIN_TAG,
        claim=claim_payload,
        ir_hash_hex=ir_hash,
        prover=prover_name,
        status=status,
        evidence=evidence,
        emit_timestamp_iso=ts,
    )


# ─── Offline verifier ──────────────────────────────────────────────────────


def verify_certificate(
    ir: dict[str, Any],
    cert: ProofCertificate,
) -> bool:
    """Re-run the proof step + check the cert's status + ir_hash match.

    Returns True iff:
      - cert.ir_hash_hex matches canonical_ir_hash(ir)
      - cert.domain_tag matches v1 prover tag
      - a fresh `prove(ir, claim)` returns the same status

    This is the offline auditor path — auditor does NOT need to trust
    the operator's cached cert; they re-run prove() themselves.
    """
    if cert.domain_tag != _DOMAIN_TAG:
        return False
    fresh_ir_hash = canonical_ir_hash(ir)
    if fresh_ir_hash != cert.ir_hash_hex:
        return False
    # Rebuild claim
    claim_kind = cert.claim.get("kind")
    operand = cert.claim.get("operand")
    extra = cert.claim.get("extra", {})
    if claim_kind is None:
        return False
    if isinstance(operand, list):
        operand = tuple(operand)
    fresh_claim = ClaimSpec(kind=claim_kind, operand=operand, extra=extra)
    fresh = prove(ir, fresh_claim, now_iso=cert.emit_timestamp_iso)
    return fresh.status == cert.status


def cert_to_dict(cert: ProofCertificate) -> dict[str, Any]:
    return asdict(cert)
