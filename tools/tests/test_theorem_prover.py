"""PHASE 19 — Slot Math Theorem Prover tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.theorem_prover import (
    ProofCertificate,
    ClaimSpec,
    prove,
    parse_claim,
    verify_certificate,
    canonical_ir_hash,
)
from tools.theorem_prover.prover import cert_to_dict


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── fixtures ─────────────────────────────────────────────────────────────


def _ir_low_rtp() -> dict:
    """IR with very low (Bernoulli) RTP — useful to test upper bounds."""
    return {
        "meta": {"name": "LowRtp", "target_rtp": 0.05},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 1.0},  # tiny pay
        ],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 1}, {"symbol": "B", "weight": 9}]
                    for _ in range(5)
                ]}
            ],
        },
    }


def _ir_high_rtp() -> dict:
    """IR with explicit RTP large enough to fail rtp_upper_bound:0.05."""
    return {
        "meta": {"name": "HighRtp", "target_rtp": 0.95},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 100000.0},
        ],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 1}]
                    for _ in range(5)
                ]}
            ],
        },
    }


def _ir_negative_pay() -> dict:
    return {
        "meta": {"name": "NegPay", "target_rtp": 0.9},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "paytable": [
            {"combo": ["A"] * 5, "pays": -10.0},  # invalid
        ],
        "reels": {"base": [{"set": 1, "reels": [[{"symbol": "A", "weight": 1}]] * 5}]},
    }


def _ir_zero_weight() -> dict:
    return {
        "meta": {"name": "ZeroW", "target_rtp": 0.9},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "paytable": [{"combo": ["A"] * 5, "pays": 10.0}],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 0}]
                    for _ in range(5)
                ]}
            ]
        },
    }


# ─── canonical hash ───────────────────────────────────────────────────────


def test_canonical_ir_hash_deterministic():
    ir = _ir_low_rtp()
    h1 = canonical_ir_hash(ir)
    h2 = canonical_ir_hash(ir)
    assert h1 == h2
    assert len(h1) == 64


def test_canonical_ir_hash_key_order_invariant():
    ir1 = {"a": 1, "b": 2}
    ir2 = {"b": 2, "a": 1}
    assert canonical_ir_hash(ir1) == canonical_ir_hash(ir2)


def test_canonical_ir_hash_detects_change():
    ir = _ir_low_rtp()
    h_before = canonical_ir_hash(ir)
    ir["meta"]["name"] = "Changed"
    h_after = canonical_ir_hash(ir)
    assert h_before != h_after


# ─── claim parser ─────────────────────────────────────────────────────────


def test_parse_claim_rtp_upper_bound():
    c = parse_claim("rtp_upper_bound:0.97")
    assert c.kind == "rtp_upper_bound"
    assert c.operand == pytest.approx(0.97)


def test_parse_claim_rtp_in_band():
    c = parse_claim("rtp_in_band:0.85,0.97")
    assert c.kind == "rtp_in_band"
    assert c.operand == (0.85, 0.97)


def test_parse_claim_paytable_consistency():
    c = parse_claim("paytable_consistency")
    assert c.kind == "paytable_consistency"
    assert c.operand is None


def test_parse_claim_reel_weight_positive():
    c = parse_claim("reel_weight_positive")
    assert c.kind == "reel_weight_positive"


def test_parse_claim_max_win_cap():
    c = parse_claim("max_win_cap_compliance:5000")
    assert c.kind == "max_win_cap_compliance"
    assert c.operand == 5000.0


@pytest.mark.parametrize("bad", [
    "", "unknown_claim", "rtp_upper_bound:not-a-float",
    "rtp_in_band:single", "rtp_in_band:1,0",  # L > U
    "max_win_cap_compliance:abc",
])
def test_parse_claim_rejects_bad(bad: str):
    with pytest.raises(ValueError):
        parse_claim(bad)


# ─── rtp_upper_bound ─────────────────────────────────────────────────────


def test_prove_rtp_upper_bound_low_rtp_verified():
    cert = prove(_ir_low_rtp(), "rtp_upper_bound:0.5")
    assert cert.status in ("verified", "verified_fallback")
    assert cert.evidence["rtp_estimate"] < 0.5


def test_prove_rtp_upper_bound_high_rtp_refuted():
    cert = prove(_ir_high_rtp(), "rtp_upper_bound:0.5")
    assert cert.status in ("refuted", "refuted_fallback")


# ─── rtp_lower_bound ─────────────────────────────────────────────────────


def test_prove_rtp_lower_bound_high_verified():
    cert = prove(_ir_high_rtp(), "rtp_lower_bound:0.5")
    assert cert.status in ("verified", "verified_fallback")


def test_prove_rtp_lower_bound_low_refuted():
    cert = prove(_ir_low_rtp(), "rtp_lower_bound:0.5")
    assert cert.status in ("refuted", "refuted_fallback")


# ─── rtp_in_band ─────────────────────────────────────────────────────────


def test_prove_rtp_in_band_outside_refuted():
    cert = prove(_ir_low_rtp(), "rtp_in_band:0.90,0.97")
    assert cert.status == "refuted_fallback"


def test_prove_rtp_in_band_inside_verified():
    cert = prove(_ir_low_rtp(), "rtp_in_band:0.0,1.0")
    assert cert.status == "verified_fallback"


# ─── paytable_consistency ────────────────────────────────────────────────


def test_prove_paytable_consistency_pass():
    cert = prove(_ir_low_rtp(), "paytable_consistency")
    assert cert.status == "verified_fallback"


def test_prove_paytable_consistency_fail_on_negative_pay():
    cert = prove(_ir_negative_pay(), "paytable_consistency")
    assert cert.status == "refuted_fallback"
    assert "negative" in str(cert.evidence)


def test_prove_paytable_consistency_fail_on_empty():
    ir = _ir_low_rtp()
    ir["paytable"] = []
    cert = prove(ir, "paytable_consistency")
    assert cert.status == "refuted_fallback"


# ─── reel_weight_positive ────────────────────────────────────────────────


def test_prove_reel_weight_positive_pass():
    cert = prove(_ir_low_rtp(), "reel_weight_positive")
    assert cert.status == "verified_fallback"


def test_prove_reel_weight_positive_fail_on_zero_weight():
    cert = prove(_ir_zero_weight(), "reel_weight_positive")
    assert cert.status == "refuted_fallback"


# ─── max_win_cap_compliance ──────────────────────────────────────────────


def test_prove_max_win_cap_compliance_pass():
    cert = prove(_ir_low_rtp(), "max_win_cap_compliance:5000")
    assert cert.status == "verified_fallback"


def test_prove_max_win_cap_compliance_fail():
    cert = prove(_ir_low_rtp(), "max_win_cap_compliance:0.5")
    assert cert.status == "refuted_fallback"
    assert cert.evidence["max_pay"] > cert.evidence["cap_x"]


# ─── certificate shape ────────────────────────────────────────────────────


def test_proof_certificate_shape():
    cert = prove(_ir_low_rtp(), "paytable_consistency")
    assert isinstance(cert, ProofCertificate)
    assert cert.schema_version == "urn:slotmath:theorem-prover:v1"
    assert cert.domain_tag == "slotmath-theorem-prover-v1"
    assert len(cert.ir_hash_hex) == 64
    assert cert.emit_timestamp_iso


def test_proof_certificate_serialisable():
    cert = prove(_ir_low_rtp(), "paytable_consistency")
    d = cert_to_dict(cert)
    encoded = json.dumps(d, indent=2)
    re_parsed = json.loads(encoded)
    assert re_parsed["claim"]["kind"] == "paytable_consistency"


# ─── offline verifier ─────────────────────────────────────────────────────


def test_verify_certificate_happy_path():
    ir = _ir_low_rtp()
    cert = prove(ir, "rtp_upper_bound:0.5")
    assert verify_certificate(ir, cert) is True


def test_verify_certificate_rejects_tampered_ir():
    ir = _ir_low_rtp()
    cert = prove(ir, "paytable_consistency")
    # Tamper IR
    ir["meta"]["name"] = "Tampered"
    assert verify_certificate(ir, cert) is False


def test_verify_certificate_rejects_bad_domain_tag():
    cert = prove(_ir_low_rtp(), "paytable_consistency")
    cert.domain_tag = "wrong-tag-v0"
    assert verify_certificate(_ir_low_rtp(), cert) is False


def test_verify_certificate_in_band():
    ir = _ir_low_rtp()
    cert = prove(ir, "rtp_in_band:0.0,1.0")
    assert verify_certificate(ir, cert) is True


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.theorem_prover", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_prove_verified(tmp_path: Path):
    ir_path = tmp_path / "ir.json"
    ir_path.write_text(json.dumps(_ir_low_rtp()))
    rc = _run_cli([
        "prove",
        "--ir", str(ir_path),
        "--claim", "paytable_consistency",
        "--quiet",
    ])
    assert rc.returncode == 0


def test_cli_prove_refuted(tmp_path: Path):
    ir_path = tmp_path / "ir.json"
    ir_path.write_text(json.dumps(_ir_negative_pay()))
    rc = _run_cli([
        "prove",
        "--ir", str(ir_path),
        "--claim", "paytable_consistency",
        "--quiet",
    ])
    assert rc.returncode == 1  # refuted


def test_cli_prove_missing_ir(tmp_path: Path):
    rc = _run_cli([
        "prove",
        "--ir", str(tmp_path / "no.json"),
        "--claim", "paytable_consistency",
    ])
    assert rc.returncode == 2


def test_cli_prove_emits_json(tmp_path: Path):
    ir_path = tmp_path / "ir.json"
    ir_path.write_text(json.dumps(_ir_low_rtp()))
    out = tmp_path / "cert.json"
    rc = _run_cli([
        "prove",
        "--ir", str(ir_path),
        "--claim", "rtp_upper_bound:0.5",
        "--out", str(out),
        "--quiet",
    ])
    assert rc.returncode == 0
    cert_data = json.loads(out.read_text())
    assert cert_data["schema_version"] == "urn:slotmath:theorem-prover:v1"


def test_cli_verify_round_trip(tmp_path: Path):
    ir_path = tmp_path / "ir.json"
    ir_path.write_text(json.dumps(_ir_low_rtp()))
    out = tmp_path / "cert.json"
    rc = _run_cli([
        "prove", "--ir", str(ir_path), "--claim", "paytable_consistency",
        "--out", str(out), "--quiet",
    ])
    assert rc.returncode == 0
    rc2 = _run_cli([
        "verify", "--ir", str(ir_path), "--cert", str(out), "--quiet",
    ])
    assert rc2.returncode == 0
