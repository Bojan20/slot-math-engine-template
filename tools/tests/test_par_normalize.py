"""Faza 1 test gate — 1.8.

Covers:
  * detect.py     — magic bytes + text heuristics
  * generic_xlsx  — heuristic PAR extraction
  * audit.py      — lossless gate + merkle pin
  * CLI           — add/list/info/remove round-trip

Minimum 10 tests, all must PASS for Faza 1 acceptance.
"""
from __future__ import annotations
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from tools.par_normalize.detect import detect_format
from tools.par_normalize.adapters.generic_xlsx import adapt as adapt_xlsx
from tools.par_normalize.audit import audit, compute_merkle, sha256_file
from tools.par_normalize.adapters import adapt
from tools import par_library_cli

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_par_dir():
    d = tempfile.mkdtemp(prefix="par_test_")
    yield Path(d)
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def sample_xlsx_path(tmp_par_dir: Path) -> Path:
    """Synthetic XLSX PAR with Reels, Paytable, Summary sheets."""
    openpyxl = pytest.importorskip("openpyxl")
    p = tmp_par_dir / "sample.par.xlsx"
    wb = openpyxl.Workbook()

    # Reels sheet
    ws_reels = wb.active
    ws_reels.title = "Reel Strips"
    ws_reels.append(["Reel 1", "Reel 2", "Reel 3", "Reel 4", "Reel 5"])
    for _ in range(30):
        ws_reels.append(["A", "K", "Q", "J", "10"])
    ws_reels.append(["WILD", "WILD", "WILD", "WILD", "WILD"])

    # Paytable sheet
    ws_pay = wb.create_sheet(title="Paytable")
    ws_pay.append(["Symbol", "3", "4", "5"])
    ws_pay.append(["A", 10.0, 50.0, 200.0])
    ws_pay.append(["K", 5.0, 25.0, 100.0])
    ws_pay.append(["WILD", 0.0, 0.0, 0.0])

    # Summary sheet
    ws_sum = wb.create_sheet(title="Summary")
    ws_sum.append(["Game Name", "Test Slot"])
    ws_sum.append(["RTP", 96.5])
    ws_sum.append(["Volatility", "high"])
    ws_sum.append(["Max Win", 50000])

    wb.save(str(p))
    wb.close()
    return p


@pytest.fixture
def sample_json_path(tmp_par_dir: Path) -> Path:
    p = tmp_par_dir / "sample.par.json"
    data = {
        "schema": "slot-math-canonical-par/v1",
        "meta": {"game_name": "J", "variant_id": "v1", "rtp_target_pct": 96.0},
        "topology": {"type": "lines", "reel_count": 5, "rows_per_reel": 3, "paylines": 10},
        "reels": {"1": {"strip": ["A", "K"]}},
        "paytable": {"A": {"3": 10}},
        "rtp": {"target_pct": 96.0},
        "rng_profile": {"algorithm": "Pcg64", "jurisdiction": "MGA"},
    }
    p.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    return p


@pytest.fixture
def sample_csv_path(tmp_par_dir: Path) -> Path:
    p = tmp_par_dir / "sample.par.csv"
    p.write_text("symbol,3,4,5\nA,10,50,200\nK,5,25,100\n", encoding="utf-8")
    return p


@pytest.fixture
def sample_yaml_path(tmp_par_dir: Path) -> Path:
    p = tmp_par_dir / "sample.par.yaml"
    p.write_text("schema: slot-math-canonical-par/v1\nmeta:\n  game_name: Y\n  variant_id: v1\n  rtp_target_pct: 96.0\n", encoding="utf-8")
    return p


@pytest.fixture
def sample_pdf_path(tmp_par_dir: Path) -> Path:
    p = tmp_par_dir / "sample.par.pdf"
    p.write_bytes(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>")
    return p


# ---------------------------------------------------------------------------
# detect.py tests
# ---------------------------------------------------------------------------

class TestDetectFormat:
    def test_detect_xlsx(self, sample_xlsx_path: Path):
        assert detect_format(sample_xlsx_path) == "xlsx"

    def test_detect_json(self, sample_json_path: Path):
        assert detect_format(sample_json_path) == "json"

    def test_detect_csv(self, sample_csv_path: Path):
        assert detect_format(sample_csv_path) == "csv"

    def test_detect_yaml(self, sample_yaml_path: Path):
        assert detect_format(sample_yaml_path) == "yaml"

    def test_detect_pdf(self, sample_pdf_path: Path):
        assert detect_format(sample_pdf_path) == "pdf"

    def test_detect_unknown_empty(self, tmp_par_dir: Path):
        p = tmp_par_dir / "empty.bin"
        p.write_bytes(b"\x00\x01\x02")
        assert detect_format(p) == "unknown"

    def test_detect_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            detect_format("/nonexistent/path/file.xlsx")


# ---------------------------------------------------------------------------
# generic_xlsx adapter tests
# ---------------------------------------------------------------------------

class TestGenericXlsx:
    def test_adapt_extracts_reels(self, sample_xlsx_path: Path):
        c = adapt_xlsx(sample_xlsx_path)
        assert "reels" in c
        assert len(c["reels"]) == 5
        assert len(c["reels"]["1"]["strip"]) == 31

    def test_adapt_extracts_paytable(self, sample_xlsx_path: Path):
        c = adapt_xlsx(sample_xlsx_path)
        assert "paytable" in c
        assert "A" in c["paytable"]
        assert c["paytable"]["A"]["5"] == 200.0

    def test_adapt_extracts_meta(self, sample_xlsx_path: Path):
        c = adapt_xlsx(sample_xlsx_path)
        assert c["meta"]["game_name"] == "Test Slot"
        assert c["meta"]["rtp_target_pct"] == 96.5
        assert c["meta"]["volatility"] == "high"
        assert c["meta"]["max_win_x_bet"] == 50000

    def test_adapt_topology(self, sample_xlsx_path: Path):
        c = adapt_xlsx(sample_xlsx_path)
        assert c["topology"]["reel_count"] == 5
        assert c["topology"]["rows_per_reel"] == 31


# ---------------------------------------------------------------------------
# audit + merkle tests
# ---------------------------------------------------------------------------

class TestAudit:
    def test_sha256_file(self, sample_json_path: Path):
        h1 = sha256_file(sample_json_path)
        h2 = sha256_file(sample_json_path)
        assert len(h1) == 64
        assert h1 == h2

    def test_compute_merkle_deterministic(self, sample_json_path: Path):
        c = json.loads(sample_json_path.read_text())
        m1 = compute_merkle(c)
        m2 = compute_merkle(c)
        assert m1 == m2
        assert len(m1) == 64

    def test_audit_injects_sha256(self, sample_json_path: Path):
        c = json.loads(sample_json_path.read_text())
        report = audit(sample_json_path, c)
        assert c["source"]["sha256"] == sha256_file(sample_json_path)
        assert report["format_detected"] == "json"

    def test_audit_lossless_json(self, sample_json_path: Path):
        c = json.loads(sample_json_path.read_text())
        report = audit(sample_json_path, c)
        assert report["lossless_pass"] is True
        assert report["reexport_delta_bytes"] == 0

    def test_audit_completeness_warnings(self, tmp_par_dir: Path):
        bad = tmp_par_dir / "bad.json"
        bad.write_text(json.dumps({"schema": "x"}), encoding="utf-8")
        c = json.loads(bad.read_text())
        report = audit(bad, c)
        assert any("missing required field" in w for w in report["completeness"])

    def test_merkle_excludes_own_field(self):
        c = {"a": 1, "merkle_root_sha256": "deadbeef"}
        m1 = compute_merkle(c)
        c2 = {"a": 1}
        m2 = compute_merkle(c2)
        assert m1 == m2


# ---------------------------------------------------------------------------
# auto-dispatch adapter tests
# ---------------------------------------------------------------------------

class TestAutoAdapt:
    def test_auto_adapt_json(self, sample_json_path: Path):
        c = adapt(sample_json_path)
        assert c["source"]["format"] == "json"

    def test_auto_adapt_xlsx(self, sample_xlsx_path: Path):
        c = adapt(sample_xlsx_path)
        assert c["source"]["format"] == "xlsx"
        assert "reels" in c

    def test_auto_adapt_unknown_raises(self, tmp_par_dir: Path):
        p = tmp_par_dir / "unknown.bin"
        p.write_bytes(b"\xde\xad\xbe\xef")
        with pytest.raises(ValueError):
            adapt(p)


# ---------------------------------------------------------------------------
# CLI tests
# ---------------------------------------------------------------------------

class TestCli:
    def test_cli_add_and_list(self, sample_xlsx_path: Path, tmp_par_dir: Path):
        # Override library root to temp
        orig_root = par_library_cli._LIBRARY_ROOT
        par_library_cli._LIBRARY_ROOT = tmp_par_dir / "par-library"
        try:
            ret = par_library_cli.main(["add", str(sample_xlsx_path), "--game", "demo", "--variant", "alpha"])
            assert ret == 0

            ret = par_library_cli.main(["list", "--game", "demo"])
            assert ret == 0

            ret = par_library_cli.main(["info", "demo", "alpha"])
            assert ret == 0

            # Verify artifacts
            vdir = par_library_cli._LIBRARY_ROOT / "demo" / "alpha"
            assert (vdir / "canonical.par.json").exists()
            assert (vdir / "merkle.sha256").exists()
            assert (vdir / "audit.json").exists()
            assert (vdir / "original.xlsx").exists()
        finally:
            par_library_cli._LIBRARY_ROOT = orig_root

    def test_cli_remove(self, sample_xlsx_path: Path, tmp_par_dir: Path):
        orig_root = par_library_cli._LIBRARY_ROOT
        par_library_cli._LIBRARY_ROOT = tmp_par_dir / "par-library"
        try:
            par_library_cli.main(["add", str(sample_xlsx_path), "--game", "g2", "--variant", "v2"])
            vdir = par_library_cli._LIBRARY_ROOT / "g2" / "v2"
            assert vdir.exists()
            ret = par_library_cli.main(["remove", "g2", "v2"])
            assert ret == 0
            assert not vdir.exists()
        finally:
            par_library_cli._LIBRARY_ROOT = orig_root

    def test_cli_info_missing(self, tmp_par_dir: Path):
        orig_root = par_library_cli._LIBRARY_ROOT
        par_library_cli._LIBRARY_ROOT = tmp_par_dir / "par-library"
        try:
            ret = par_library_cli.main(["info", "missing", "game"])
            assert ret == 1
        finally:
            par_library_cli._LIBRARY_ROOT = orig_root

    def test_cli_list_empty(self, tmp_par_dir: Path):
        orig_root = par_library_cli._LIBRARY_ROOT
        par_library_cli._LIBRARY_ROOT = tmp_par_dir / "par-library"
        par_library_cli._LIBRARY_ROOT.mkdir(parents=True, exist_ok=True)
        try:
            ret = par_library_cli.main(["list"])
            assert ret == 0
        finally:
            par_library_cli._LIBRARY_ROOT = orig_root
