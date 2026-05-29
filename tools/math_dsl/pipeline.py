"""W7.2 — one-shot DSL → solved → signed → cert pipeline.

The full production flow in a single call:
  1. parse YAML spec
  2. compile to SlotGameIR skeleton
  3. Z3-synth weights (mode selectable: c-1/c-3/c-4/c-5)
  4. inject signed provenance (HMAC or ed25519)
  5. assemble cert bundle ZIP
  6. emit audit trail entry (W7.3)

Designer-facing entry point:
    from tools.math_dsl.pipeline import run_pipeline
    result = run_pipeline(spec_path, out_dir, mode="c-1", vendor="x")
    print(result["cert_zip"])
    print(result["audit_path"])
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .spec import parse_spec
from .compile import compile_to_ir
from .provenance import sign_and_inject_provenance, verify_provenance
from .cert_bundle import build_cert_bundle
from .audit import append_audit


class PipelineError(RuntimeError):
    pass


def run_pipeline(
    spec_path: Path | str,
    out_dir: Path | str,
    *,
    mode: str = "c-1",
    vendor: str = "studio-internal",
    swid: Optional[str] = None,
    build_hash: Optional[str] = None,
    notes: Optional[str] = None,
    algo: str = "auto",
    audit_path: Optional[Path | str] = None,
) -> dict[str, Any]:
    """Execute the full DSL→cert pipeline. Returns:

        {
            "spec_path": str,
            "cert_zip": str,
            "ir_sha256": str,
            "signature": str,
            "rtp_target": float,
            "rtp_measured": float,
            "rtp_delta": float,
            "synth_ms": float,
            "audit_path": str,
            "ok": bool,
        }
    """
    from tools.smt.weight_synthesizer import (
        synth_uniform_weights, synth_with_hit_freq,
        synth_with_volatility, synth_multi_objective,
        measured_rtp, RtpSynthesisError,
    )

    spec_path = Path(spec_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    started = datetime.now(timezone.utc)

    text = spec_path.read_text(encoding="utf-8")
    spec = parse_spec(text)
    ir = compile_to_ir(spec)
    reel_length = float(spec.hints.get("reel_length") or 60)
    tol = spec.constraints.rtp_tolerance + 0.005

    t0 = time.perf_counter()
    try:
        if mode == "c-1":
            solved = synth_uniform_weights(
                ir, spec.constraints.target_rtp,
                reel_length=reel_length, tolerance=tol,
            )
        elif mode == "c-3":
            solved = synth_with_hit_freq(
                ir, spec.constraints.target_rtp,
                spec.constraints.hit_freq_target,
                reel_length=reel_length, tolerance=tol,
            )
        elif mode == "c-4":
            solved = synth_with_volatility(
                ir, spec.constraints.target_rtp,
                spec.constraints.volatility_class,
                reel_length=reel_length, tolerance=tol,
            )
        else:
            solved = synth_multi_objective(
                ir, target_rtp=spec.constraints.target_rtp,
                target_hit_freq=spec.constraints.hit_freq_target,
                volatility_class=spec.constraints.volatility_class,
                reel_length=reel_length, rtp_tolerance=tol,
            )
    except RtpSynthesisError as e:
        raise PipelineError(f"Z3 synthesis failed: {e}") from e
    synth_ms = (time.perf_counter() - t0) * 1000

    # Sign + inject provenance
    signed = sign_and_inject_provenance(
        solved, vendor=vendor,
        par_source=str(spec_path),
        swid=swid, build_hash=build_hash, algo=algo,
    )
    ok, reason = verify_provenance(signed)
    if not ok:
        raise PipelineError(f"provenance verify failed after sign: {reason}")

    cert_zip = build_cert_bundle(spec, signed, out_dir, notes=notes)

    rtp_post = measured_rtp(signed)
    rtp_delta = abs(rtp_post - spec.constraints.target_rtp)

    audit_p = Path(audit_path) if audit_path else out_dir / "audit.log.jsonl"
    audit_entry = append_audit(
        audit_p,
        action="pipeline.run",
        inputs={
            "spec_path": str(spec_path),
            "mode": mode,
            "vendor": vendor,
        },
        outputs={
            "cert_zip": str(cert_zip),
            "ir_sha256": signed["provenance"]["ir_sha256"],
            "signature": signed["provenance"]["signature"][:32] + "...",
            "rtp_measured": rtp_post,
            "synth_ms": synth_ms,
        },
        started_at_utc=started.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
    )

    return {
        "spec_path": str(spec_path),
        "cert_zip": str(cert_zip),
        "ir_sha256": signed["provenance"]["ir_sha256"],
        "signature": signed["provenance"]["signature"],
        "signature_algo": signed["provenance"]["signature_algo"],
        "rtp_target": spec.constraints.target_rtp,
        "rtp_measured": rtp_post,
        "rtp_delta": rtp_delta,
        "synth_ms": synth_ms,
        "audit_path": str(audit_p),
        "audit_sha256_chain": audit_entry["sha256_chain"],
        "ok": True,
    }
