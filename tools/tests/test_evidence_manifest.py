"""Tests for the SHA-256 W4.11 evidence manifest."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "build_evidence_manifest.py"
OUT = REPO / "reports" / "acceptance" / "W4_11_EVIDENCE_MANIFEST.json"


@pytest.fixture(scope="module")
def manifest() -> dict:
    r = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, cwd=str(REPO))
    assert r.returncode == 0, f"exit {r.returncode}\nstdout: {r.stdout}\nstderr: {r.stderr}"
    assert OUT.exists()
    return json.loads(OUT.read_text())


def test_manifest_schema(manifest: dict):
    assert manifest["schema"] == "w4-11-evidence-manifest/v1"
    assert "merkle_root_sha256" in manifest
    assert len(manifest["merkle_root_sha256"]) == 64  # SHA-256 hex


def test_manifest_records_all_20_files(manifest: dict):
    assert manifest["file_count"] == 20
    assert manifest["missing_files"] == []


def test_manifest_records_have_hex_digests(manifest: dict):
    for rec in manifest["records"]:
        assert len(rec["sha256"]) == 64
        # Make sure each digest is valid hex
        int(rec["sha256"], 16)


def test_manifest_merkle_root_reproducible(manifest: dict):
    """A regulator can re-derive `merkle_root_sha256` from the records alone."""
    records = sorted(manifest["records"], key=lambda r: r["path"])
    leaf_lines = [f"{r['path']}|{r['size_bytes']}|{r['sha256']}\n" for r in records]
    derived = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()
    assert derived == manifest["merkle_root_sha256"]


def test_manifest_per_file_digest_matches_disk(manifest: dict):
    """For each recorded file, the digest must equal the on-disk SHA-256."""
    for rec in manifest["records"]:
        fp = REPO / rec["path"]
        assert fp.exists(), f"missing file: {rec['path']}"
        h = hashlib.sha256()
        h.update(fp.read_bytes())
        assert h.hexdigest() == rec["sha256"], f"digest mismatch: {rec['path']}"


def test_manifest_includes_all_dashboards(manifest: dict):
    paths = {r["path"] for r in manifest["records"]}
    for dash in (
        "reports/dashboards/index.html",
        "reports/dashboards/sales-one-pager.html",
        "reports/dashboards/mc-parity-dashboard.html",
        "reports/dashboards/real-market-portfolio.html",
        "reports/dashboards/portfolio-validator-dashboard.html",
        "reports/dashboards/unified-audit.html",
        "reports/dashboards/live-par-compiler.html",
    ):
        assert dash in paths, f"manifest missing dashboard: {dash}"


def test_manifest_includes_workflow(manifest: dict):
    paths = {r["path"] for r in manifest["records"]}
    assert ".github/workflows/template-parity.yml" in paths


def test_manifest_includes_commercial_pitch(manifest: dict):
    paths = {r["path"] for r in manifest["records"]}
    assert "docs/COMMERCIAL_PITCH.md" in paths


def test_manifest_total_bytes_positive(manifest: dict):
    assert manifest["total_bytes"] > 100_000
    assert manifest["total_bytes"] < 10_000_000  # sanity ceiling
