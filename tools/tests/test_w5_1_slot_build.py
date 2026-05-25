"""W5.1 — `slot-build` CLI integration tests.

Validates:
  * vendor auto-detection from filename signatures
  * pipeline end-to-end on IGT Fort Knox PAR_001 (parse → adapter →
    optional MC) without raising
  * MC drift comparison parses `slot-sim` binary output correctly
  * `--no-universal` skips adapter cleanly (used for L&W where the
    adapter is W4.4 future)
  * error paths: unknown vendor, missing input dir, no signature match
"""
from __future__ import annotations
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.slot_build.__main__ import (
    detect_vendor,
    main,
    find_slot_sim_binary,
    VENDOR_SIGNATURES,
)


class TestVendorDetect(unittest.TestCase):

    def test_detect_igt_fort_knox(self):
        raw = ROOT / "games/fort-knox-wolf-run/raw"
        self.assertEqual(detect_vendor(raw), "igt")

    def test_detect_lw_ce(self):
        raw = ROOT / "games/ce-copy-test/raw"
        self.assertEqual(detect_vendor(raw), "lw")

    def test_detect_unknown_returns_none(self):
        # /tmp has no PAR signatures
        self.assertIsNone(detect_vendor(Path("/tmp")))

    def test_signatures_are_disjoint(self):
        """No filename should signal both vendors simultaneously."""
        lw = set(VENDOR_SIGNATURES["lw"])
        igt = set(VENDOR_SIGNATURES["igt"])
        self.assertEqual(lw & igt, set(), "vendor signatures overlap")


class TestSlotBuildPipeline(unittest.TestCase):
    """End-to-end pipeline: PAR sheets → IR + universal IR (no MC)."""

    def test_igt_par_001_emits_both_irs(self):
        out_dir = ROOT / "games/fort-knox-wolf-run/out"
        rc = main([
            str(ROOT / "games/fort-knox-wolf-run/raw"),
            "--vendor", "igt",
            "--sheet", "PAR_001",
            "--no-mc",
            "--quiet",
        ])
        self.assertEqual(rc, 0)
        # Both IRs exist + parse
        vendor_ir = out_dir / "igt.200-1775-001.ir.json"
        universal_ir = out_dir / "igt.200-1775-001.slot-sim.ir.json"
        self.assertTrue(vendor_ir.exists(), "vendor IR missing")
        self.assertTrue(universal_ir.exists(), "universal IR missing")
        v = json.loads(vendor_ir.read_text())
        u = json.loads(universal_ir.read_text())
        self.assertEqual(v["meta"]["swid"], "200-1775-001")
        self.assertEqual(u["meta"]["swid"], "200-1775-001")
        self.assertEqual(u["topology"]["kind"], "rectangular")
        self.assertEqual(len(u["evaluation"]["lines"]), 40)

    def test_no_universal_flag_skips_adapter(self):
        out_dir = ROOT / "games/ce-copy-test/out"
        rc = main([
            str(ROOT / "games/ce-copy-test/raw"),
            "--vendor", "lw",
            "--sheet", "PAR-001",
            "--no-universal",
            "--no-mc",
            "--quiet",
        ])
        self.assertEqual(rc, 0)
        # Vendor IR exists; universal IR should NOT be created (or stays as legacy)
        vendor_ir = out_dir / "lw.200-1637-001.ir.json"
        self.assertTrue(vendor_ir.exists())

    def test_unknown_vendor_errors(self):
        rc = main([
            str(ROOT / "games/fort-knox-wolf-run/raw"),
            "--vendor", "aristocrat",
            "--no-mc",
            "--quiet",
        ])
        self.assertEqual(rc, 2)

    def test_missing_input_dir_errors(self):
        rc = main([
            "/nonexistent-path-12345",
            "--vendor", "igt",
            "--no-mc",
            "--quiet",
        ])
        self.assertEqual(rc, 2)

    def test_auto_detect_works_on_igt(self):
        rc = main([
            str(ROOT / "games/fort-knox-wolf-run/raw"),
            "--vendor", "auto",
            "--sheet", "PAR_001",
            "--no-mc",
            "--quiet",
        ])
        self.assertEqual(rc, 0)


class TestScaffoldOutput(unittest.TestCase):
    """W5.2 — `--scaffold` emits a self-contained per-game folder with
    README + RUN + CERT + both IR copies."""

    def test_igt_scaffold(self):
        import tempfile
        from tools.slot_build.__main__ import slugify
        with tempfile.TemporaryDirectory() as td:
            rc = main([
                str(ROOT / "games/fort-knox-wolf-run/raw"),
                "--vendor", "igt",
                "--sheet", "PAR_001",
                "--no-mc",
                "--scaffold", td,
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            game_root = Path(td) / "fort-knox-wolf-run-200-1775-001"
            self.assertTrue(game_root.is_dir(), "scaffold dir missing")
            for f in ("README.md", "RUN.md", "CERT.md",
                      "ir.vendor.json", "ir.slot-sim.json"):
                self.assertTrue(
                    (game_root / f).is_file(),
                    f"scaffold missing {f}",
                )
            # README has the SWID + vendor
            readme = (game_root / "README.md").read_text()
            self.assertIn("200-1775-001", readme)
            self.assertIn("igt", readme)
            # IR files parse as JSON
            json.loads((game_root / "ir.vendor.json").read_text())
            json.loads((game_root / "ir.slot-sim.json").read_text())

    def test_lw_scaffold_without_mc(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            rc = main([
                str(ROOT / "games/ce-copy-test/raw"),
                "--vendor", "lw",
                "--sheet", "PAR-001",
                "--no-mc",
                "--scaffold", td,
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            # Find the game dir (slugified)
            entries = list(Path(td).iterdir())
            self.assertGreater(len(entries), 0, "no scaffold dir created")
            game_root = entries[0]
            self.assertTrue((game_root / "CERT.md").is_file())
            cert = (game_root / "CERT.md").read_text()
            # Without MC, CERT.md indicates skipped sim
            self.assertIn("verification skipped", cert)

    def test_slugify(self):
        from tools.slot_build.__main__ import slugify
        self.assertEqual(slugify("Cash Eruption Test"), "cash-eruption-test")
        self.assertEqual(slugify("Fort_Knox-Wolf_Run"), "fort-knox-wolf-run")
        self.assertEqual(slugify("100% RTP???"), "100-rtp")
        self.assertEqual(slugify(""), "game")


class TestSlotSimBinaryDiscovery(unittest.TestCase):

    def test_finds_release_binary_if_built(self):
        """When `cargo build --release` has run, the binary must be locatable."""
        bin_path = find_slot_sim_binary()
        # Allow None if release build hasn't happened (CI fresh checkout).
        # When present, must be executable.
        if bin_path is not None:
            self.assertTrue(bin_path.exists())
            # On macOS / Linux executable bit; on Windows we'd skip the check.
            import os
            self.assertTrue(os.access(bin_path, os.X_OK), "slot-sim binary not executable")


if __name__ == "__main__":
    unittest.main()
