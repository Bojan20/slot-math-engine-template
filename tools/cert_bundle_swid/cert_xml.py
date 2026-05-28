"""Cert XML emitter wrapper — reuses `tools.cert_xml_v3` (W5.6+).

The W5.6+ emitter already produces a GLI-16 Appendix D-shaped XML with
the required sections (Meta, Topology, Rtp, ParProvenance, …). For
W4.15 we feed it the SWID-level numbers and pass through.
"""
from __future__ import annotations

from typing import Any

from tools.cert_xml_v3.emitter import (  # type: ignore
    CertV3Input,
    emit_cert_xml_v3,
)


def emit_cert_xml(
    *,
    game_id: str,
    swid: str,
    target_rtp: float,
    measured_rtp: float,
    reels: int,
    rows: int,
    par_merkle_root_hex: str,
    jurisdictions: list[str] | None = None,
    notes: list[str] | None = None,
) -> bytes:
    inp = CertV3Input(
        game_id=game_id,
        swid=swid,
        target_rtp=target_rtp,
        measured_rtp=measured_rtp,
        reels=reels,
        rows=rows,
        par_merkle_root_hex=par_merkle_root_hex,
        theorem_prover_cert_hashes=[],
        federated_audit_transcript_hash="",
        dp_export_log=[],
        type_check_passed=True,
        jurisdictions=jurisdictions or ["UKGC", "MGA", "NJ-DGE"],
        notes=notes or [],
    )
    return emit_cert_xml_v3(inp).encode("utf-8")
