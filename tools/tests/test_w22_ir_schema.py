"""W22 — IR schema versioning + migration tests."""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.ir_schema import (
    CURRENT_SCHEMA_VERSION,
    detect_version,
    list_migrations,
    migrate,
    migrate_to_latest,
)
from tools.ir_schema.__main__ import main as migrate_main


class TestDetectVersion(unittest.TestCase):
    def test_missing_meta_defaults_v1(self):
        self.assertEqual(detect_version({}), 1)

    def test_meta_without_schema_version_defaults_v1(self):
        self.assertEqual(detect_version({"meta": {"name": "X"}}), 1)

    def test_explicit_version_propagates(self):
        self.assertEqual(
            detect_version({"meta": {"schema_version": 2}}), 2,
        )

    def test_invalid_version_falls_to_v1(self):
        self.assertEqual(
            detect_version({"meta": {"schema_version": "abc"}}), 1,
        )


class TestMigrationChain(unittest.TestCase):
    def test_list_migrations_returns_steps(self):
        steps = list_migrations()
        self.assertGreaterEqual(len(steps), 2)
        for (a, b) in steps:
            self.assertEqual(b, a + 1)

    def test_v1_to_v2_hoists_legacy_reels(self):
        ir = {
            "meta": {"name": "X"},
            "bg_reel_sets": [{"reels": [["A"]]}],
            "fg_reel_sets": [{"reels": [["B"]]}],
        }
        out = migrate(ir, 2)
        self.assertEqual(out["meta"]["schema_version"], 2)
        self.assertIn("reels", out)
        self.assertEqual(out["reels"]["base"], ir["bg_reel_sets"])
        self.assertEqual(out["reels"]["fs"], ir["fg_reel_sets"])
        # legacy keys preserved
        self.assertIn("bg_reel_sets", out)

    def test_v2_to_v3_aliases_evaluation(self):
        ir_v2 = {
            "meta": {"schema_version": 2},
            "evaluation": {"paylines": [[0, 0, 0]]},
        }
        out = migrate(ir_v2, 3)
        self.assertEqual(out["meta"]["schema_version"], 3)
        self.assertEqual(out["evaluation"]["lines"],
                          out["evaluation"]["paylines"])
        self.assertEqual(out["meta"]["target_rtp"], 0.96)

    def test_v2_to_v3_preserves_existing_target_rtp(self):
        ir_v2 = {
            "meta": {"schema_version": 2, "target_rtp": 0.94},
            "evaluation": {"lines": [[0]]},
        }
        out = migrate(ir_v2, 3)
        self.assertEqual(out["meta"]["target_rtp"], 0.94)

    def test_migrate_to_latest_is_idempotent_on_current_ir(self):
        ir = {
            "meta": {"schema_version": CURRENT_SCHEMA_VERSION,
                     "target_rtp": 0.96},
            "evaluation": {"paylines": [], "lines": []},
        }
        out = migrate_to_latest(ir)
        self.assertEqual(out["meta"]["schema_version"],
                          CURRENT_SCHEMA_VERSION)

    def test_full_chain_v1_to_latest(self):
        ir = {"meta": {}, "bg_reel_sets": [], "evaluation": {"paylines": []}}
        out = migrate_to_latest(ir)
        self.assertEqual(out["meta"]["schema_version"],
                          CURRENT_SCHEMA_VERSION)
        # All v2 + v3 invariants
        self.assertIn("reels", out)
        self.assertIn("lines", out["evaluation"])
        self.assertIn("target_rtp", out["meta"])

    def test_downgrade_raises(self):
        ir = {"meta": {"schema_version": 3}}
        with self.assertRaises(ValueError):
            migrate(ir, 1)


class TestCli(unittest.TestCase):
    def test_cli_list(self):
        rc = migrate_main(["--list"])
        self.assertEqual(rc, 0)

    def test_cli_detect(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.json"
            p.write_text(json.dumps({"meta": {}}))
            rc = migrate_main([str(p), "--detect"])
            self.assertEqual(rc, 0)

    def test_cli_migrate_writes_out(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "in.json"
            out = Path(td) / "out.json"
            src.write_text(json.dumps(
                {"meta": {}, "evaluation": {"paylines": [[0]]}},
            ))
            rc = migrate_main([str(src), "--out", str(out), "--quiet"])
            self.assertEqual(rc, 0)
            data = json.loads(out.read_text())
            self.assertEqual(data["meta"]["schema_version"],
                              CURRENT_SCHEMA_VERSION)

    def test_cli_missing_file(self):
        rc = migrate_main(["/nonexistent/x.json", "--quiet"])
        self.assertEqual(rc, 2)

    def test_cli_downgrade_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "x.json"
            src.write_text(json.dumps(
                {"meta": {"schema_version": CURRENT_SCHEMA_VERSION}},
            ))
            rc = migrate_main([str(src), "--target", "1", "--quiet"])
            self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
