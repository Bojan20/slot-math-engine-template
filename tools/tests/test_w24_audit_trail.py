"""W24 — Audit trail aggregator tests."""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.audit_trail import (
    AuditTrail,
    aggregate_game_trail,
    emit_trail,
)
from tools.audit_trail.__main__ import main as audit_main


def _seed_game_dir(td: Path) -> Path:
    """Create a fake game dir with one IR, MC report, drift report,
    jurisdiction report, cert zip, operator pilot log."""
    g = td / "games" / "test-game"
    g.mkdir(parents=True)
    out = g / "out"
    out.mkdir()
    # IR with meta.notes
    ir = {
        "meta": {
            "name": "Test Slot", "vendor": "synth",
            "schema_version": 3,
            "notes": ["First parse", "RTP lift to 0.96"],
        },
        "topology": {"reels": 5, "rows": 3},
    }
    (out / "test.ir.json").write_text(json.dumps(ir))
    # MC report
    (out / "mc-report.json").write_text(
        json.dumps({"rtp": 0.9598, "spins": 100_000}),
    )
    # drift report
    (out / "drift-2026-05.json").write_text(
        json.dumps({"severity": "green", "delta": 0.001}),
    )
    # jurisdiction report
    (out / "jurisdiction-ukgc.json").write_text(
        json.dumps({"profile_id": "ukgc", "passed": True}),
    )
    (out / "jurisdiction-bundle.json").write_text(
        json.dumps({"reports": [
            {"profile_id": "mga", "passed": True},
            {"profile_id": "gli16", "passed": False},
        ]}),
    )
    # cert zip
    (out / "test.cert.zip").write_bytes(b"\x50\x4b\x05\x06" + b"\x00" * 18)
    # operator pilot log
    (out / "operator_pilot-run1.json").write_text(
        json.dumps({"verdict": "passed", "steps": 6}),
    )
    return g


class TestAggregator(unittest.TestCase):
    def test_aggregates_every_kind(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            trail = aggregate_game_trail(g)
            kinds = {e.kind for e in trail.entries}
            for expected in ("ir_note", "mc_report", "cert_zip",
                              "drift", "jurisdiction", "operator_pilot"):
                self.assertIn(expected, kinds,
                                f"missing {expected} entries: {kinds}")

    def test_entries_sorted_ascending(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            trail = aggregate_game_trail(g)
            timestamps = [e.timestamp for e in trail.entries]
            self.assertEqual(timestamps, sorted(timestamps))

    def test_warns_on_missing_dir(self):
        trail = aggregate_game_trail(Path("/nonexistent/path"))
        self.assertIsInstance(trail, AuditTrail)
        self.assertGreaterEqual(len(trail.warnings), 1)

    def test_ir_notes_extracted_per_note(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            trail = aggregate_game_trail(g)
            ir_notes = [e for e in trail.entries if e.kind == "ir_note"]
            # Two notes seeded above
            self.assertEqual(len(ir_notes), 2)

    def test_jurisdiction_bundle_expanded(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            trail = aggregate_game_trail(g)
            jur = [e for e in trail.entries if e.kind == "jurisdiction"]
            ids = {e.detail.get("profile_id") for e in jur}
            # 1 single + 2 from bundle
            self.assertGreaterEqual(len(jur), 3)
            self.assertIn("ukgc", ids)
            self.assertIn("mga", ids)
            self.assertIn("gli16", ids)


class TestEmit(unittest.TestCase):
    def test_emits_json_and_md(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            out = Path(td) / "out"
            trail = aggregate_game_trail(g)
            paths = emit_trail(trail, out)
            self.assertTrue(paths["json"].is_file())
            self.assertTrue(paths["md"].is_file())

    def test_json_round_trips(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            out = Path(td) / "out"
            trail = aggregate_game_trail(g)
            paths = emit_trail(trail, out)
            data = json.loads(paths["json"].read_text())
            self.assertIn("entries", data)
            self.assertGreaterEqual(len(data["entries"]), 5)

    def test_md_has_table(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            out = Path(td) / "out"
            trail = aggregate_game_trail(g)
            paths = emit_trail(trail, out)
            md = paths["md"].read_text()
            self.assertIn("| Timestamp | Kind |", md)


class TestCli(unittest.TestCase):
    def test_cli_happy_path(self):
        with tempfile.TemporaryDirectory() as td:
            g = _seed_game_dir(Path(td))
            out = Path(td) / "out"
            rc = audit_main([str(g), "--out", str(out), "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((out / "audit_trail.json").is_file())

    def test_cli_missing_dir(self):
        rc = audit_main(["/nonexistent", "--out", "/tmp/x", "--quiet"])
        self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
