"""CONSOLIDATION PASS — mega-pipeline tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


from tools.mega_pipeline import (
    MegaPipelineReport,
    StageResult,
    run_mega_pipeline,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── unit ─────────────────────────────────────────────────────────────────


def test_mega_pipeline_creates_out_dir(tmp_path: Path):
    out = tmp_path / "demo-mega"
    report = run_mega_pipeline(
        prompt="5×3 Vendor B-style FS RTP 96%", out_dir=out,
    )
    assert isinstance(report, MegaPipelineReport)
    assert out.exists()


def test_mega_pipeline_emits_core_artefacts(tmp_path: Path):
    out = tmp_path / "demo"
    run_mega_pipeline(prompt="5×3 slot with Free Spins RTP 96%", out_dir=out)
    # Core artefacts that all stages should emit
    assert (out / "spec.json").exists()
    assert (out / "game.dsl.json").exists()
    assert (out / "ir.json").exists()
    assert (out / "type_check_report.json").exists()
    assert (out / "derivation.md").exists()
    assert (out / "volatility.json").exists()
    assert (out / "benchmark.json").exists()
    assert (out / "benchmark.md").exists()
    assert (out / "federated_audit.json").exists()
    assert (out / "server_seed.json").exists()
    assert (out / "cert.xml").exists()
    assert (out / "cert_validation.json").exists()
    assert (out / "PIPELINE_MANIFEST.json").exists()
    assert (out / "compliance").is_dir()
    assert (out / "proofs").is_dir()


def test_mega_pipeline_passed_stages(tmp_path: Path):
    out = tmp_path / "demo"
    report = run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    # 12 stages (13 minus manifest itself); all should pass on happy path
    assert report.passed_stages >= 10
    assert report.failed_stages == 0


def test_mega_pipeline_compliance_5_jurisdictions(tmp_path: Path):
    out = tmp_path / "demo"
    run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    comp = out / "compliance"
    for jur in ("UKGC", "MGA", "GLI-19", "eCOGRA", "EU-GA-2024"):
        assert (comp / f"{jur}.md").exists()


def test_mega_pipeline_proofs_3_claims(tmp_path: Path):
    out = tmp_path / "demo"
    run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    proofs = out / "proofs"
    assert len(list(proofs.glob("*.json"))) >= 3


def test_mega_pipeline_manifest_sha256_inventory(tmp_path: Path):
    out = tmp_path / "demo"
    report = run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    assert "spec.json" in report.artefact_sha256
    assert "ir.json" in report.artefact_sha256
    assert "cert.xml" in report.artefact_sha256
    # All hashes must be 64-hex
    for fname, h in report.artefact_sha256.items():
        assert len(h) == 64


def test_mega_pipeline_stage_results_shape(tmp_path: Path):
    out = tmp_path / "demo"
    report = run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    for s in report.stages:
        assert isinstance(s, StageResult)
        assert s.elapsed_ms >= 0
        assert s.stage


def test_mega_pipeline_target_rtp_override(tmp_path: Path):
    out = tmp_path / "demo"
    run_mega_pipeline(
        prompt="5×3 FS",
        out_dir=out,
        target_rtp_override=0.945,
    )
    ir = json.loads((out / "ir.json").read_text())
    assert ir["meta"]["target_rtp"] == 0.945


def test_mega_pipeline_schema_pin(tmp_path: Path):
    out = tmp_path / "demo"
    report = run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    assert report.schema_version == "urn:slotmath:mega-pipeline:v1"


def test_mega_pipeline_total_elapsed_finite(tmp_path: Path):
    out = tmp_path / "demo"
    report = run_mega_pipeline(prompt="5×3 FS RTP 96%", out_dir=out)
    assert 0 < report.total_elapsed_ms < 60_000  # well under 1 minute


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.mega_pipeline", *args],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )


def test_cli_smoke_full_pipeline(tmp_path: Path):
    out = tmp_path / "cli-demo"
    rc = _run_cli([
        "5×3 Vendor B-style FS RTP 96%",
        "--out", str(out),
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    assert (out / "PIPELINE_MANIFEST.json").exists()


def test_cli_json_output(tmp_path: Path):
    out = tmp_path / "cli-json"
    rc = _run_cli([
        "5×3 FS RTP 96%",
        "--out", str(out),
        "--json",
    ])
    assert rc.returncode == 0
    parsed = json.loads(rc.stdout)
    assert parsed["schema_version"] == "urn:slotmath:mega-pipeline:v1"
    assert parsed["passed_stages"] >= 10


def test_cli_human_output_lists_stages(tmp_path: Path):
    out = tmp_path / "cli-human"
    rc = _run_cli([
        "5×3 FS RTP 96%",
        "--out", str(out),
    ])
    assert rc.returncode == 0
    assert "mega-pipeline" in rc.stdout
    assert "parse_prompt" in rc.stdout


def test_cli_swid_threads_through(tmp_path: Path):
    out = tmp_path / "cli-swid"
    rc = _run_cli([
        "5×3 FS RTP 96%",
        "--out", str(out),
        "--swid", "777",
        "--quiet",
    ])
    assert rc.returncode == 0
    cert_xml = (out / "cert.xml").read_text()
    assert "<Swid" in cert_xml
    assert ">777<" in cert_xml
