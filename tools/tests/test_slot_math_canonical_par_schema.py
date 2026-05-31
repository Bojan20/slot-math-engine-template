"""SLOT-MATH wave 1.1 — canonical PAR JSON Schema acceptance.

Verifies that `reports/schemas/canonical_par.schema.json`:
  • Parses as valid JSON
  • Has Draft 2020-12 declaration
  • Covers all 11 game topology kinds (reel_grid, cluster_grid,
    megaways, infinireels, cascade_grid, crash, plinko, pachislot,
    class_ii_bingo, wheel_only, scratch)
  • Covers 5 RNG algorithms
  • Has lossless audit fields
  • Is included in schemas_manifest.json

This is foundation file za PAR → playable game pipeline (FAZA 1.1).
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA = ROOT / "reports" / "schemas" / "canonical_par.schema.json"
MANIFEST = ROOT / "reports" / "schemas" / "schemas_manifest.json"


class TestCanonicalParSchema(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(SCHEMA.read_text())

    def test_schema_file_exists(self):
        self.assertTrue(SCHEMA.exists())

    def test_draft_2020_12_declared(self):
        self.assertEqual(
            self.d.get("$schema"),
            "https://json-schema.org/draft/2020-12/schema",
        )

    def test_schema_id_matches_filename(self):
        self.assertIn("canonical_par.schema.json", self.d.get("$id", ""))

    def test_const_schema_version(self):
        self.assertEqual(
            self.d["properties"]["schema"]["const"],
            "slot-math-canonical-par/v1",
        )

    def test_required_top_level_fields(self):
        required = set(self.d.get("required", []))
        expected = {
            "schema", "merkle_root_sha256", "meta", "topology",
            "reels", "paytable", "rtp", "rng_profile",
        }
        self.assertTrue(
            expected.issubset(required),
            f"missing required: {expected - required}",
        )

    def test_merkle_pattern_is_64_hex(self):
        pat = self.d["properties"]["merkle_root_sha256"]["pattern"]
        self.assertEqual(pat, "^[0-9a-f]{64}$")

    def test_all_11_topology_kinds_supported(self):
        kinds = set(
            self.d["properties"]["topology"]["properties"]["kind"]["enum"]
        )
        expected = {
            "reel_grid", "cluster_grid", "megaways", "infinireels",
            "cascade_grid", "crash", "plinko", "pachislot",
            "class_ii_bingo", "wheel_only", "scratch",
        }
        self.assertEqual(kinds, expected)

    def test_5_rng_algorithms_supported(self):
        algos = set(
            self.d["properties"]["rng_profile"]
                  ["properties"]["algorithm"]["enum"]
        )
        expected = {"philox_4x32_10", "pcg64", "chacha20",
                    "xoshiro256pp", "splitmix64"}
        self.assertEqual(algos, expected)

    def test_symbol_kinds_cover_all_special_behaviors(self):
        kinds = set(
            self.d["properties"]["symbols"]["items"]
                  ["properties"]["kind"]["enum"]
        )
        # Must cover at least these critical special-behavior kinds
        critical = {
            "wild", "scatter", "bonus", "jackpot", "money_value",
            "multiplier", "mystery", "transformer",
            "expanding_wild", "walking_wild", "sticky_wild",
            "stacked_wild", "linked_pot", "regular",
        }
        self.assertTrue(
            critical.issubset(kinds),
            f"missing kinds: {critical - kinds}",
        )

    def test_jurisdiction_enum_covers_top_10(self):
        jurisdictions = set(
            self.d["properties"]["rng_profile"]
                  ["properties"]["jurisdiction_allowed"]
                  ["items"]["enum"]
        )
        # Must cover at least these 10 (per Faza 4.8 multi-jurisdiction)
        critical = {"UKGC", "MGA", "GLI-19", "Quebec", "AAMS",
                    "Ontario", "Michigan", "Pennsylvania",
                    "Nevada", "NewJersey"}
        self.assertTrue(
            critical.issubset(jurisdictions),
            f"missing: {critical - jurisdictions}",
        )

    def test_audit_section_has_lossless_byte_diff(self):
        audit = self.d["properties"]["audit"]["properties"]
        self.assertIn("lossless_byte_diff", audit)
        self.assertEqual(audit["lossless_byte_diff"]["minimum"], 0)

    def test_no_additional_properties_at_root(self):
        """Strict schema — no extra fields allowed at root."""
        self.assertFalse(self.d.get("additionalProperties", True))


class TestCanonicalParInManifest(unittest.TestCase):
    """canonical_par.schema.json must be referenced in schemas_manifest.json."""

    def test_manifest_includes_canonical_par(self):
        m = json.loads(MANIFEST.read_text())
        filenames = {s["filename"] for s in m["schemas"]}
        self.assertIn("canonical_par.schema.json", filenames)

    def test_manifest_sha256_matches_actual_file(self):
        m = json.loads(MANIFEST.read_text())
        for s in m["schemas"]:
            if s["filename"] == "canonical_par.schema.json":
                import hashlib
                actual = hashlib.sha256(
                    SCHEMA.read_bytes()).hexdigest()
                self.assertEqual(s["sha256"], actual)
                break
        else:
            self.fail("canonical_par.schema.json not in manifest entries")


if __name__ == "__main__":
    unittest.main()
