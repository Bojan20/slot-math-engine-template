"""W4.2 — Universal parse_par regression tests.

Three guarantees:

  1. **L&W round-trip** — the new engine + `lw` profile reproduce the
     legacy CE-COPY-TEST IR byte-for-byte (modulo the new `vendor: lw`
     enrichment field added in W4.2).
  2. **IGT minimum coverage** — the new engine + `igt` profile pull
     SWID, RTP breakdown, bet table, paytable, FS bonus summary, and
     linear progressive odds from the Fort Knox Wolf Run dump.
  3. **YAML schema** — every shipped vendor profile loads cleanly and
     declares every required top-level key.

Run as:
    python -m tools.tests.test_w4_2_parse_par
or via the project's existing test orchestrator:
    python -m unittest tools.tests.test_w4_2_parse_par
"""
from __future__ import annotations
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.parse_par import load_profile, parse_par
from tools.parse_par.profile import list_profiles


def _norm(x):
    """Recursively convert dict int-keys to str-keys for JSON-stable diff."""
    if isinstance(x, dict):
        return {str(k): _norm(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_norm(e) for e in x]
    return x


class TestLwRoundTrip(unittest.TestCase):
    """Bit-identical round-trip vs the original parse_par.py output."""

    LEGACY_KEYS = [
        "meta",
        "symbol_counts_per_reel",
        "paytable",
        "bg_reel_set_weights",
        "bg_reel_sets",
        "fg_reel_set_weights",
        "fg_reel_sets",
        "fs_paytable",
        "bonus_summary",
        "cash_eruption_feature_pages",
        "paylines",
    ]

    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile("lw")
        cls.raw_dir = ROOT / "games/ce-copy-test/raw"
        cls.legacy_dir = ROOT / "games/ce-copy-test/out"

    def _build_remapped(self, sheet: str) -> dict:
        new_ir = parse_par(self.profile, self.raw_dir, sheet=sheet)
        # New IR keys → legacy IR keys
        return {
            "meta": new_ir["meta"],
            "symbol_counts_per_reel": new_ir.get("symbol_counts_per_reel", {}),
            "paytable": new_ir.get("paytable", []),
            "bg_reel_set_weights": new_ir.get("bg_reel_set_weights", {}),
            "bg_reel_sets": new_ir.get("bg_reel_sets", []),
            "fg_reel_set_weights": new_ir.get("fg_reel_set_weights", {}),
            "fg_reel_sets": new_ir.get("fg_reel_sets", []),
            "fs_paytable": new_ir.get("free_spins", {}).get("fs_paytable", []),
            "bonus_summary": new_ir.get("free_spins", {}).get("bonus_summary", {}),
            "cash_eruption_feature_pages": new_ir.get("cash_eruption_pages", []),
            "paylines": new_ir.get("paylines", []),
        }

    def _compare_swid(self, sheet: str, swid: str):
        remapped = self._build_remapped(sheet)
        legacy_path = self.legacy_dir / f"ce-copy-test.{swid}.ir.json"
        legacy = json.loads(legacy_path.read_text())
        # Strip new-only enrichment fields from new IR so diff isolates math
        meta = dict(remapped["meta"])
        meta.pop("vendor", None)
        remapped["meta"] = meta
        a = _norm(remapped)
        b = _norm(legacy)
        ja = json.dumps(a, sort_keys=True, default=str)
        jb = json.dumps(b, sort_keys=True, default=str)
        self.assertEqual(ja, jb, f"IR mismatch for {sheet} ({swid})")

    def test_par_001_match(self):
        self._compare_swid("PAR-001", "200-1637-001")

    def test_par_002_match(self):
        self._compare_swid("PAR-002", "200-1637-002")

    def test_par_003_match(self):
        self._compare_swid("PAR-003", "200-1637-003")


class TestIgtFortKnoxCoverage(unittest.TestCase):
    """IGT profile minimum coverage on Fort Knox Wolf Run dump."""

    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile("igt")
        cls.raw_dir = ROOT / "games/fort-knox-wolf-run/raw"

    def test_par_001_meta(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_001")
        m = ir["meta"]
        self.assertEqual(m["swid"], "200-1775-001")
        self.assertEqual(m["reels"], 5)
        self.assertEqual(m["rows"], 4)
        self.assertEqual(m["lines"], 40)
        self.assertAlmostEqual(m["hold"], 0.035557, places=5)
        self.assertAlmostEqual(m["hit_frequency_all_line"], 0.244331, places=5)
        self.assertAlmostEqual(m["win_frequency_all_line"], 0.114904, places=5)
        # Bet table
        self.assertEqual(len(m["bet_multipliers"]), 24)
        self.assertEqual(m["bet_multipliers"][0], 1)
        self.assertEqual(m["bet_multipliers"][-1], 300)

    def test_par_001_rtp_breakdown(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_001")
        rb = ir["meta"]["rtp_breakdown"]
        self.assertAlmostEqual(rb["base_game"], 0.7098799, places=6)
        self.assertAlmostEqual(rb["bonus"], 0.0742835, places=6)
        self.assertAlmostEqual(rb["base_plus_bonus"], 0.7841635, places=6)

    def test_par_001_paytable(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_001")
        pt = ir["paytable"]
        self.assertGreater(len(pt), 25)
        # WildWolf 5-of-a-kind pays 1000
        wild5 = next((r for r in pt if r["combo"] == ["WildWolf"] * 5), None)
        self.assertIsNotNone(wild5, "WildWolf 5oak row missing")
        self.assertEqual(wild5["pays"], 1000)

    def test_par_001_free_spins(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_001")
        fs = ir["free_spins"]
        # Bonus summary
        bs = fs["bonus_summary"]
        self.assertAlmostEqual(bs["avg_free_spins"], 5.84315, places=4)
        self.assertAlmostEqual(bs["total_payback_pct"], 14.90759, places=3)
        # FS paytable rows
        self.assertGreater(len(fs["fs_paytable"]), 30)

    def test_par_001_linear_progressive(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_001")
        lp = ir["linear_progressive"]["per_bet_multiplier"]
        bms = lp["bet_multipliers"]
        odds = lp["progressive_odds"]
        self.assertEqual(bms[0], 1)
        self.assertAlmostEqual(odds[0], 7_500_000, places=-1)
        # Linear: odds * bm ≈ constant
        for bm, o in zip(bms, odds):
            self.assertAlmostEqual(o * bm, 7_500_000, delta=1.0)

    def test_par_001_fort_knox_pick_bonus(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_001")
        fkb = ir["fort_knox_pick_bonus"]
        # Per-bet-multiplier FK RTP column should be populated
        per_bm = fkb["per_bet_multiplier"]
        self.assertEqual(len(per_bm), 24)
        # Every row should have ~0.17727 RTP (FK Bonus is BM-invariant)
        for r in per_bm:
            self.assertAlmostEqual(r["fkb_rtp"], 0.17727915, delta=1e-5)

    def test_par_002_swid_differs(self):
        ir = parse_par(self.profile, self.raw_dir, sheet="PAR_002")
        self.assertEqual(ir["meta"]["swid"], "200-1775-002")
        # PAR_002 has a different hold (higher house edge)
        self.assertGreater(ir["meta"]["hold"], 0.05)


class TestVendorProfileSchema(unittest.TestCase):
    """Every shipped profile must load cleanly + carry required keys."""

    REQUIRED = ("vendor", "display_name", "profile_version", "sheets", "meta", "dimensions")

    def test_all_profiles_load(self):
        names = list_profiles()
        self.assertGreaterEqual(len(names), 2, "at least lw + igt expected")
        for v in names:
            with self.subTest(vendor=v):
                p = load_profile(v)
                for k in self.REQUIRED:
                    self.assertIn(k, p.data, f"profile {v} missing key {k}")
                self.assertIsInstance(p.data["profile_version"], int)


class TestMiniYamlParser(unittest.TestCase):
    """Direct unit tests for the tiny YAML loader in profile.py."""

    def test_inline_map_and_list(self):
        from tools.parse_par.profile import _parse_yaml
        text = """
key:
  cell: { row: 7, col: 12 }
  list: [1, 2, 3]
  bool_t: true
  bool_f: false
  null_v: null
  flt: 3.14
        """
        d = _parse_yaml(text)["key"]
        self.assertEqual(d["cell"], {"row": 7, "col": 12})
        self.assertEqual(d["list"], [1, 2, 3])
        self.assertTrue(d["bool_t"])
        self.assertFalse(d["bool_f"])
        self.assertIsNone(d["null_v"])
        self.assertAlmostEqual(d["flt"], 3.14)

    def test_single_quoted_regex(self):
        from tools.parse_par.profile import _parse_yaml
        d = _parse_yaml("pattern: 'BET MULTIPLIER\\s+(\\d+)'")
        self.assertEqual(d["pattern"], r"BET MULTIPLIER\s+(\d+)")

    def test_double_quoted_escape(self):
        from tools.parse_par.profile import _parse_yaml
        d = _parse_yaml('tab: "a\\tb"\nnl: "x\\ny"')
        self.assertEqual(d["tab"], "a\tb")
        self.assertEqual(d["nl"], "x\ny")

    def test_nested_list_of_maps(self):
        from tools.parse_par.profile import _parse_yaml
        text = """
features:
  - type: a
    config:
      x: 1
  - type: b
    config:
      y: 2
"""
        d = _parse_yaml(text)
        self.assertEqual(len(d["features"]), 2)
        self.assertEqual(d["features"][0], {"type": "a", "config": {"x": 1}})
        self.assertEqual(d["features"][1], {"type": "b", "config": {"y": 2}})


if __name__ == "__main__":
    unittest.main()
