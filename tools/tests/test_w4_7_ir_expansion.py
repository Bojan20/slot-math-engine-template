"""W4.7 — IR Expansion tests (Python side).

Coverage:
  • parse_par.core.parse_meta extracts the new GLI-16 fields when the vendor
    profile declares the coordinates (max_win_x, volatility_class,
    jurisdictions, mystery_prizes).
  • parse_par.to_ts_ir.convert_to_ts_ir emits root-level `progressive_link`
    + `provenance` + populates `limits.max_win_x` / `target_volatility` /
    `compliance.jurisdictions` from the meta block.
  • Legacy universal IRs without the new signals round-trip unaffected.
"""
from __future__ import annotations
import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.parse_par.to_ts_ir import convert_to_ts_ir


def _universal_minimal() -> dict:
    """Smallest viable universal IR (no W4.7 signals)."""
    return {
        "meta": {"name": "Plain", "vendor": "vendor_b", "swid": "200-1637-001",
                  "rtp_total": 0.96, "hit_frequency_all_line": 0.22},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "symbols": [
            {"id": "wild", "role": "wild"},
            {"id": "scatter", "role": "scatter"},
            {"id": "a", "role": "hp"},
            {"id": "b", "role": "lp"},
        ],
        "reels": {"base": [{"set": 1, "reels": [
            [{"symbol": "wild", "weight": 1}, {"symbol": "a", "weight": 30},
             {"symbol": "b", "weight": 30}, {"symbol": "scatter", "weight": 2}],
        ] * 5}], "base_weights": []},
        "evaluation": {"kind": "lines", "lines": [[1, 1, 1, 1, 1]], "min_match": 3},
        "paytable": [
            {"combo": ["a", "a", "a", "--", "--"], "pays": 5},
            {"combo": ["b", "b", "b", "--", "--"], "pays": 2},
        ],
        "features": [],
    }


class TestProgressiveLink(unittest.TestCase):
    def test_emits_progressive_link_root_when_feature_present(self):
        universal = _universal_minimal()
        universal["features"].append({
            "kind": "linear_progressive",
            "pool_id": "wap-uk-grand",
            "contribution_x": 0.005,
            "seed_x": 100.0,
            "must_hit_by_x": 500_000.0,
            "tier_ladder": [
                {"id": "mini", "multiplier": 10.0},
                {"id": "grand", "multiplier": 100000.0},
            ],
        })
        ts = convert_to_ts_ir(universal)
        self.assertIn("progressive_link", ts)
        link = ts["progressive_link"]
        self.assertEqual(link["pool_id"], "wap-uk-grand")
        self.assertEqual(link["contribution_per_spin_x"], 0.005)
        self.assertEqual(link["seed_x"], 100.0)
        self.assertEqual(link["must_hit_by_x"], 500_000.0)
        self.assertEqual(len(link["tier_ladder"]), 2)

    def test_emits_feature_variant_too(self):
        universal = _universal_minimal()
        universal["features"].append({
            "kind": "linear_progressive",
            "pool_id": "p1",
            "contribution_x": 0.005,
            "seed_x": 50.0,
        })
        ts = convert_to_ts_ir(universal)
        kinds = [f["kind"] for f in ts["features"]]
        self.assertIn("linear_progressive", kinds)

    def test_no_progressive_link_when_no_feature(self):
        ts = convert_to_ts_ir(_universal_minimal())
        self.assertNotIn("progressive_link", ts)


class TestProvenance(unittest.TestCase):
    def test_provenance_includes_sha256_of_canonical_input(self):
        universal = _universal_minimal()
        ts = convert_to_ts_ir(universal, par_source="games/x/PAR_001.tsv")
        self.assertIn("provenance", ts)
        prov = ts["provenance"]
        self.assertEqual(prov["vendor"], "vendor_b")
        self.assertEqual(prov["par_source"], "games/x/PAR_001.tsv")
        self.assertEqual(prov["swid"], "200-1637-001")
        # Re-compute and assert the SHA matches what convert_to_ts_ir put in
        canonical = json.dumps(universal, sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.assertEqual(prov["par_sha256"], hashlib.sha256(canonical).hexdigest())
        self.assertIn("built_at_utc", prov)

    def test_no_provenance_when_no_vendor(self):
        universal = _universal_minimal()
        universal["meta"] = {"name": "Anon"}
        ts = convert_to_ts_ir(universal)
        self.assertNotIn("provenance", ts)


class TestMetaExtras(unittest.TestCase):
    def test_max_win_x_propagated_into_limits(self):
        universal = _universal_minimal()
        universal["meta"]["max_win_x"] = 12500.0
        ts = convert_to_ts_ir(universal)
        self.assertEqual(ts["limits"]["max_win_x"], 12500.0)

    def test_volatility_class_propagated(self):
        universal = _universal_minimal()
        universal["meta"]["volatility_class"] = "high"
        ts = convert_to_ts_ir(universal)
        self.assertEqual(ts["limits"]["target_volatility"], "high")

    def test_jurisdictions_propagated(self):
        universal = _universal_minimal()
        universal["meta"]["jurisdictions"] = ["UKGC", "MGA", "ADM"]
        ts = convert_to_ts_ir(universal)
        self.assertEqual(ts["compliance"]["jurisdictions"], ["UKGC", "MGA", "ADM"])

    def test_defaults_unaffected_when_meta_lacks_extras(self):
        ts = convert_to_ts_ir(_universal_minimal())
        self.assertEqual(ts["limits"]["max_win_x"], 5000.0)
        self.assertEqual(ts["limits"]["target_volatility"], "medium")
        self.assertEqual(ts["compliance"]["jurisdictions"], ["UKGC", "MGA"])


class TestLegacyRoundtrip(unittest.TestCase):
    def test_no_w4_7_fields_when_signals_absent(self):
        ts = convert_to_ts_ir(_universal_minimal())
        self.assertNotIn("progressive_link", ts)
        # provenance still emits because meta carries vendor; that's intentional
        # (we want all auto-converted IRs to have a SHA-256 audit anchor).
        self.assertIn("provenance", ts)
        # legacy fields all present
        for k in [
            "schema_version", "meta", "topology", "symbols", "reels", "evaluation",
            "paytable", "features", "rng", "bet", "limits", "compliance",
            "rtp_allocation",
        ]:
            self.assertIn(k, ts)


if __name__ == "__main__":
    unittest.main()
