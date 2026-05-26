"""Mission #4 — Vendor profile registry expansion + scaffold CLI tests.

Verifies:
  • all 5 mission-required vendor profiles load via `load_profile()`
  • `list_profiles()` reports the registry expansion
  • scaffold CLI produces a YAML that re-loads via the loader
  • topology / feature variety across the 5 profiles is non-degenerate
"""
from __future__ import annotations
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.parse_par.profile import (
    VendorProfile,
    list_profiles,
    load_profile,
)
from tools.vendor_profiles.scaffold import (
    KNOWN_FEATURES,
    scaffold_profile,
    main as scaffold_main,
)


MISSION_REQUIRED = ("igt", "lw", "vendor_c", "vendor_d", "vendor_e")


class TestRegistry(unittest.TestCase):
    def test_all_five_profiles_register(self):
        registered = set(list_profiles())
        for vid in MISSION_REQUIRED:
            self.assertIn(vid, registered,
                          f"profile {vid!r} missing from registry; "
                          f"got {sorted(registered)}")

    def test_each_profile_loads_and_validates(self):
        for vid in MISSION_REQUIRED:
            with self.subTest(vendor=vid):
                p = load_profile(vid)
                self.assertIsInstance(p, VendorProfile)
                self.assertEqual(p.vendor, vid)
                self.assertGreaterEqual(p.data["profile_version"], 1)
                self.assertIn("main_par", p.sheets)
                self.assertIn("reels", p.dimensions)


class TestTopologyVariety(unittest.TestCase):
    """Verify Mission #4 acceptance: 5 profiles with diverse topology."""

    def test_vendor_c_is_rectangular_5x3(self):
        p = load_profile("vendor_c")
        d = p.dimensions
        self.assertEqual(d["reels"], 5)
        self.assertEqual(d["rows"], 3)
        self.assertEqual(d["paylines"], 20)

    def test_vendor_d_is_cluster_7x7(self):
        p = load_profile("vendor_d")
        d = p.dimensions
        self.assertEqual(d["reels"], 7)
        self.assertEqual(d["rows"], 7)
        self.assertEqual(d["paylines"], "cluster")
        self.assertGreaterEqual(d.get("min_cluster_size", 0), 4)

    def test_vendor_e_is_ways_variable_rows(self):
        p = load_profile("vendor_e")
        d = p.dimensions
        self.assertEqual(d["reels"], 6)
        self.assertEqual(d["paylines"], "ways")
        rows = d["rows"]
        # rows may be int or list[int]; both are valid for ways
        self.assertTrue(isinstance(rows, (int, list)))


class TestFeaturePresence(unittest.TestCase):
    def test_vendor_c_has_pattern_win(self):
        p = load_profile("vendor_c")
        kinds = [f["type"] for f in p.features]
        self.assertIn("pattern_win", kinds)

    def test_vendor_d_has_cascade(self):
        p = load_profile("vendor_d")
        kinds = [f["type"] for f in p.features]
        self.assertIn("cascade", kinds)

    def test_vendor_e_has_sticky_wild(self):
        p = load_profile("vendor_e")
        kinds = [f["type"] for f in p.features]
        self.assertIn("sticky_wild", kinds)


class TestScaffoldGenerator(unittest.TestCase):
    def test_known_features_nonempty(self):
        self.assertGreater(len(KNOWN_FEATURES), 5)
        self.assertIn("free_spins", KNOWN_FEATURES)

    def test_rectangular_scaffold_loads(self):
        text = scaffold_profile(
            vendor_id="vendor_test_rect",
            display_name="Test Rectangular",
            topology="rectangular",
            reels=5, rows=3, paylines=25,
            features=["free_spins", "pick_bonus"],
        )
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "vendor_test_rect.yaml"
            path.write_text(text)
            p = load_profile(str(path))
            self.assertEqual(p.vendor, "vendor_test_rect")
            self.assertEqual(p.dimensions["reels"], 5)
            self.assertEqual(p.dimensions["paylines"], 25)
            kinds = [f["type"] for f in p.features]
            self.assertEqual(kinds, ["free_spins", "pick_bonus"])

    def test_cluster_scaffold_loads(self):
        text = scaffold_profile(
            vendor_id="vendor_test_cluster",
            display_name="Test Cluster",
            topology="cluster",
            reels=6, rows=5, paylines=0,
            features=["cascade"],
        )
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "vendor_test_cluster.yaml"
            path.write_text(text)
            p = load_profile(str(path))
            self.assertEqual(p.dimensions["paylines"], "cluster")
            self.assertIn("min_cluster_size", p.dimensions)

    def test_ways_scaffold_loads(self):
        text = scaffold_profile(
            vendor_id="vendor_test_ways",
            display_name="Test Ways",
            topology="ways",
            reels=6, rows=7, paylines=0,
            features=["ways_evaluation", "sticky_wild"],
        )
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "vendor_test_ways.yaml"
            path.write_text(text)
            p = load_profile(str(path))
            self.assertEqual(p.dimensions["paylines"], "ways")

    def test_scaffold_rejects_bad_vendor_id(self):
        with self.assertRaises(ValueError):
            scaffold_profile(
                vendor_id="bad id!",
                display_name="x",
                features=["free_spins"],
            )

    def test_scaffold_rejects_unknown_topology(self):
        with self.assertRaises(ValueError):
            scaffold_profile(
                vendor_id="vt",
                display_name="x",
                topology="megaways_3d",  # not allowed
                features=["free_spins"],
            )

    def test_scaffold_cli_stdout(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = scaffold_main([
                "vendor_test_cli",
                "--display-name", "Test CLI",
                "--topology", "rectangular",
                "--reels", "5",
                "--rows", "3",
                "--paylines", "10",
                "--feature", "free_spins",
            ])
        self.assertEqual(rc, 0)
        out = buf.getvalue()
        self.assertIn("vendor: vendor_test_cli", out)
        self.assertIn("free_spins", out)

    def test_scaffold_cli_writes_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "vendor_cli_out.yaml"
            rc = scaffold_main([
                "vendor_cli_out",
                "--display-name", "CLI Output",
                "--out", str(path),
            ])
            self.assertEqual(rc, 0)
            self.assertTrue(path.exists())
            p = load_profile(str(path))
            self.assertEqual(p.vendor, "vendor_cli_out")


if __name__ == "__main__":
    unittest.main()
