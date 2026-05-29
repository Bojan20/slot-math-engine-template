"""Tests for the standalone evidence manifest verifier."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "tools" / "parity" / "verify_evidence_manifest.py"
DEFAULT_MANIFEST = REPO / "reports" / "acceptance" / "W4_11_EVIDENCE_MANIFEST.json"
DEFAULT_RECEIPT = REPO / "reports" / "acceptance" / "W4_11_EVIDENCE_RECEIPT.json"


@pytest.fixture(scope="module")
def fresh_run() -> dict:
    """Re-build the evidence manifest first to guarantee a clean baseline,
    then run the verifier."""
    build_manifest = REPO / "tools" / "build_evidence_manifest.py"
    subprocess.run([sys.executable, str(build_manifest)], capture_output=True, check=True, cwd=str(REPO))
    r = subprocess.run([sys.executable, str(SCRIPT), "--quiet"], capture_output=True, text=True, cwd=str(REPO))
    assert r.returncode == 0, f"verifier exit {r.returncode}\nstdout: {r.stdout}\nstderr: {r.stderr}"
    return json.loads(DEFAULT_RECEIPT.read_text())


def test_verifier_succeeds_against_fresh_manifest(fresh_run: dict):
    assert fresh_run["verified"] is True


def test_verifier_writes_receipt_with_schema(fresh_run: dict):
    assert fresh_run["schema"] == "w4-11-evidence-receipt/v1"


def test_verifier_records_merkle_match(fresh_run: dict):
    assert fresh_run["merkle_root_match"] is True
    assert (
        fresh_run["expected_merkle_root_sha256"]
        == fresh_run["derived_merkle_root_sha256"]
    )


def test_verifier_passes_every_file(fresh_run: dict):
    assert fresh_run["passed_count"] == fresh_run["file_count"]
    assert fresh_run["missing"] == []
    assert fresh_run["digest_mismatch"] == []
    assert fresh_run["size_mismatch"] == []


def test_verifier_per_file_records_have_actual_hash(fresh_run: dict):
    for e in fresh_run["per_file"]:
        assert e["ok"] is True
        assert e["actual_sha256"] is not None
        assert e["actual_sha256"] == e["expected_sha256"]


def test_verifier_detects_tampering_via_synthetic_manifest(tmp_path: Path):
    """Build a one-file manifest that points at a temp file we control,
    then mutate the file and confirm the verifier flags the digest mismatch."""
    repo_root = tmp_path / "fake_repo"
    repo_root.mkdir()
    target = repo_root / "test.txt"
    target.write_text("hello, evidence\n")

    size = target.stat().st_size
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    leaf = f"test.txt|{size}|{digest}\n"
    merkle = hashlib.sha256(leaf.encode("utf-8")).hexdigest()
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps({
        "schema": "w4-11-evidence-manifest/v1",
        "merkle_root_sha256": merkle,
        "file_count": 1,
        "records": [{"path": "test.txt", "size_bytes": size, "sha256": digest}],
    }))
    receipt_path = tmp_path / "receipt.json"

    # Baseline pass.
    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--manifest", str(manifest_path),
         "--repo", str(repo_root), "--receipt", str(receipt_path), "--quiet"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0
    assert json.loads(receipt_path.read_text())["verified"] is True

    # Tamper.
    target.write_text("hello, TAMPERED\n")
    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--manifest", str(manifest_path),
         "--repo", str(repo_root), "--receipt", str(receipt_path), "--quiet"],
        capture_output=True, text=True,
    )
    assert r.returncode == 1, "verifier must exit non-zero on digest mismatch"
    receipt = json.loads(receipt_path.read_text())
    assert receipt["verified"] is False
    assert "test.txt" in receipt["digest_mismatch"]


def test_verifier_detects_missing_files(tmp_path: Path):
    """If a recorded file is removed, the verifier flags it."""
    repo_root = tmp_path / "empty_repo"
    repo_root.mkdir()
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps({
        "schema": "w4-11-evidence-manifest/v1",
        "merkle_root_sha256": "0" * 64,
        "file_count": 1,
        "records": [{"path": "ghost.txt", "size_bytes": 0,
                     "sha256": "0" * 64}],
    }))
    receipt_path = tmp_path / "receipt.json"
    r = subprocess.run(
        [sys.executable, str(SCRIPT), "--manifest", str(manifest_path),
         "--repo", str(repo_root), "--receipt", str(receipt_path), "--quiet"],
        capture_output=True, text=True,
    )
    assert r.returncode == 1
    receipt = json.loads(receipt_path.read_text())
    assert receipt["verified"] is False
    assert "ghost.txt" in receipt["missing"]


def test_verifier_help_runs():
    r = subprocess.run([sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True)
    assert r.returncode == 0
    assert "manifest" in r.stdout.lower()
