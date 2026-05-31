"""SLOT-MATH Faza 4.7 — End-to-end Merkle attestation chain finalizer.

Combines all stage Merkle roots into single deploy.signature.sha256:

    par.merkle          ← from PAR library
    ir.merkle           ← from IR build
    mc_sweep.merkle     ← from MC convergence attestation
    bundle.merkle       ← from web + RGS bundle SHA-256
    kernel.merkle       ← from W244 kernel bundle hash (master)
            ↓
    deploy.signature.sha256 = sha256(sorted chain bytes)
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class DeployAttestation:
    """Single root that proves the entire build chain."""
    game_id: str
    variant_id: str
    par_merkle: str
    ir_merkle: str
    mc_sweep_merkle: str
    bundle_merkle: str
    kernel_merkle: str
    jurisdiction_codes: list[str]
    mc_tier: str
    built_at_utc: str

    def chain_bytes(self) -> bytes:
        """Canonical bytes (sorted) over chain — input to deploy.signature."""
        payload = {
            "game_id": self.game_id,
            "variant_id": self.variant_id,
            "par_merkle_sha256": self.par_merkle,
            "ir_merkle_sha256": self.ir_merkle,
            "mc_sweep_merkle_sha256": self.mc_sweep_merkle,
            "bundle_merkle_sha256": self.bundle_merkle,
            "kernel_merkle_sha256": self.kernel_merkle,
            "jurisdictions": sorted(self.jurisdiction_codes),
            "mc_tier": self.mc_tier,
            "built_at_utc": self.built_at_utc,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def deploy_signature(self) -> str:
        return hashlib.sha256(self.chain_bytes()).hexdigest()


def build_deploy_attestation(
    game_id: str,
    variant_id: str,
    par_merkle: str,
    ir_merkle: str,
    mc_sweep_merkle: str,
    bundle_merkle: str,
    kernel_merkle: str = "",
    jurisdiction_codes: list[str] | None = None,
    mc_tier: str = "T3",
    built_at_utc: str | None = None,
) -> DeployAttestation:
    """Construct a DeployAttestation. Defaults built_at_utc to deterministic
    timestamp if omitted (allowed only for testing — production should pass
    real UTC ISO-8601)."""
    return DeployAttestation(
        game_id=game_id,
        variant_id=variant_id,
        par_merkle=par_merkle,
        ir_merkle=ir_merkle,
        mc_sweep_merkle=mc_sweep_merkle,
        bundle_merkle=bundle_merkle,
        kernel_merkle=kernel_merkle,
        jurisdiction_codes=jurisdiction_codes or [],
        mc_tier=mc_tier,
        built_at_utc=built_at_utc or "deterministic-by-merkle",
    )


def write_attestation_chain(att: DeployAttestation, out_dir: Path) -> dict[str, Any]:
    """Write attestation/ folder with per-stage .merkle files + signature."""
    att_dir = out_dir / "attestation"
    att_dir.mkdir(parents=True, exist_ok=True)

    (att_dir / "par.merkle").write_text(att.par_merkle + "\n", encoding="utf-8")
    (att_dir / "ir.merkle").write_text(att.ir_merkle + "\n", encoding="utf-8")
    (att_dir / "mc_sweep.merkle").write_text(att.mc_sweep_merkle + "\n", encoding="utf-8")
    (att_dir / "bundle.merkle").write_text(att.bundle_merkle + "\n", encoding="utf-8")
    if att.kernel_merkle:
        (att_dir / "kernel.merkle").write_text(att.kernel_merkle + "\n", encoding="utf-8")

    sig = att.deploy_signature()
    (att_dir / "deploy.signature.sha256").write_text(sig + "\n", encoding="utf-8")

    # Verbose JSON dump for human/regulator reading
    chain_json = {
        "schema": "slot-math-deploy-attestation/v1",
        "game_id": att.game_id,
        "variant_id": att.variant_id,
        "stages": {
            "par_merkle_sha256": att.par_merkle,
            "ir_merkle_sha256": att.ir_merkle,
            "mc_sweep_merkle_sha256": att.mc_sweep_merkle,
            "bundle_merkle_sha256": att.bundle_merkle,
            "kernel_merkle_sha256": att.kernel_merkle,
        },
        "jurisdictions": sorted(att.jurisdiction_codes),
        "mc_tier": att.mc_tier,
        "built_at_utc": att.built_at_utc,
        "deploy_signature_sha256": sig,
    }
    (att_dir / "chain.json").write_text(
        json.dumps(chain_json, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )

    return {
        "attestation_dir": str(att_dir),
        "deploy_signature_sha256": sig,
        "files": [
            "par.merkle", "ir.merkle", "mc_sweep.merkle", "bundle.merkle",
            "deploy.signature.sha256", "chain.json",
        ] + (["kernel.merkle"] if att.kernel_merkle else []),
    }


def verify_attestation_chain(att_dir: Path) -> tuple[bool, list[str]]:
    """Re-read attestation/ files and verify deploy.signature.sha256 matches.

    Returns (pass_flag, issues_list).
    """
    issues: list[str] = []

    chain_path = att_dir / "chain.json"
    sig_path = att_dir / "deploy.signature.sha256"
    if not chain_path.exists():
        issues.append("chain.json missing")
        return False, issues
    if not sig_path.exists():
        issues.append("deploy.signature.sha256 missing")
        return False, issues

    chain = json.loads(chain_path.read_text())
    stored_sig = sig_path.read_text().strip()

    att = DeployAttestation(
        game_id=chain["game_id"],
        variant_id=chain["variant_id"],
        par_merkle=chain["stages"]["par_merkle_sha256"],
        ir_merkle=chain["stages"]["ir_merkle_sha256"],
        mc_sweep_merkle=chain["stages"]["mc_sweep_merkle_sha256"],
        bundle_merkle=chain["stages"]["bundle_merkle_sha256"],
        kernel_merkle=chain["stages"]["kernel_merkle_sha256"],
        jurisdiction_codes=chain["jurisdictions"],
        mc_tier=chain["mc_tier"],
        built_at_utc=chain["built_at_utc"],
    )
    recomputed = att.deploy_signature()

    if recomputed != stored_sig:
        issues.append(
            f"deploy.signature.sha256 mismatch: stored {stored_sig[:16]}... vs recomputed {recomputed[:16]}..."
        )
        return False, issues

    return True, issues


def utc_now_iso() -> str:
    """ISO-8601 UTC timestamp for non-deterministic builds."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
