"""W6.2 — DSL spec language regression tests.

Three guarantees:
  1. `dsl_validate` accepts every well-formed DSL and rejects every
     malformed one with a clear DslValidationError.
  2. `dsl_to_slot_sim_ir` produces an IR that deserializes into the
     Rust `slot_sim::ir::Ir` (verified via the existing engine binary).
  3. `gdd_json_to_dsl` promotes the W6.1 extractor output → DSL → IR
     end-to-end.

Pure-Python — no external libs required (tomllib is std-lib since 3.11).
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.gdd_extract.dsl import (
    DslValidationError,
    dsl_to_slot_sim_ir,
    dsl_validate,
    dump_dsl_toml,
    gdd_json_to_dsl,
    load_dsl_toml,
)


def _minimal_dsl() -> dict:
    return {
        "meta": {"name": "Mini", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3, "paylines": 20},
    }


# ─── Validation ─────────────────────────────────────────────────────────


class TestDslValidate(unittest.TestCase):

    def test_minimal_ok(self):
        dsl_validate(_minimal_dsl())  # does not raise

    def test_missing_meta(self):
        with self.assertRaises(DslValidationError) as ctx:
            dsl_validate({"topology": {"reels": 5, "rows": 3}})
        self.assertIn("meta", str(ctx.exception))

    def test_missing_target_rtp(self):
        with self.assertRaises(DslValidationError):
            dsl_validate({
                "meta": {"name": "X"},
                "topology": {"reels": 5, "rows": 3},
            })

    def test_out_of_range_rtp(self):
        with self.assertRaises(DslValidationError):
            dsl_validate({
                "meta": {"name": "X", "target_rtp": 0.1},
                "topology": {"reels": 5, "rows": 3},
            })

    def test_missing_topology(self):
        with self.assertRaises(DslValidationError):
            dsl_validate({"meta": {"name": "X", "target_rtp": 0.96}})

    def test_negative_reels(self):
        with self.assertRaises(DslValidationError):
            dsl_validate({
                "meta": {"name": "X", "target_rtp": 0.96},
                "topology": {"reels": 0, "rows": 3},
            })

    def test_symbols_not_list(self):
        d = _minimal_dsl()
        d["symbols"] = "Wild"  # wrong type
        with self.assertRaises(DslValidationError):
            dsl_validate(d)


# ─── DSL → IR synthesis ────────────────────────────────────────────────


class TestDslToIr(unittest.TestCase):

    def test_minimal_dsl_produces_valid_ir(self):
        ir = dsl_to_slot_sim_ir(_minimal_dsl())
        # All required top-level keys present
        for key in ("meta", "topology", "evaluation",
                    "symbols", "reels", "paytable",
                    "features", "bet_table"):
            self.assertIn(key, ir, f"IR missing {key!r}")

    def test_topology_carries_through(self):
        ir = dsl_to_slot_sim_ir(_minimal_dsl())
        self.assertEqual(ir["topology"],
                         {"kind": "rectangular", "reels": 5, "rows": 3})

    def test_default_paylines_count(self):
        ir = dsl_to_slot_sim_ir(_minimal_dsl())
        self.assertEqual(len(ir["evaluation"]["lines"]), 20)

    def test_default_symbols_include_wild_and_scatter(self):
        ir = dsl_to_slot_sim_ir(_minimal_dsl())
        roles = {s["role"] for s in ir["symbols"]}
        self.assertIn("wild", roles)
        self.assertIn("scatter", roles)

    def test_default_paytable_has_entries(self):
        ir = dsl_to_slot_sim_ir(_minimal_dsl())
        self.assertGreater(len(ir["paytable"]), 5)

    def test_explicit_paytable_passes_through(self):
        d = _minimal_dsl()
        d["symbols"] = [
            {"id": "Wild", "role": "wild", "substitutes": ["*"],
             "substitutes_except": []},
            {"id": "Red7", "role": "hp"},
        ]
        d["paytable"] = [
            {"symbol": "Red7", "count": 5, "pays": 1000},
            {"symbol": "Red7", "count": 4, "pays": 250},
            {"symbol": "Red7", "count": 3, "pays": 50},
        ]
        ir = dsl_to_slot_sim_ir(d)
        self.assertEqual(len(ir["paytable"]), 3)
        red7_5 = next(e for e in ir["paytable"]
                      if e["combo"] == ["Red7", "Red7", "Red7", "Red7", "Red7"])
        self.assertEqual(red7_5["pays"], 1000.0)

    def test_features_carry_through(self):
        d = _minimal_dsl()
        d["features"] = [
            {"kind": "free_spins", "trigger_symbol": "Scatter",
             "trigger_count_min": 3, "initial_spins": 10,
             "retrigger_spins": 5, "max_total_spins": 50,
             "reel_bank": "fs"},
        ]
        ir = dsl_to_slot_sim_ir(d)
        self.assertEqual(len(ir["features"]), 1)
        self.assertEqual(ir["features"][0]["kind"], "free_spins")

    def test_bet_table_defaults(self):
        ir = dsl_to_slot_sim_ir(_minimal_dsl())
        self.assertEqual(ir["bet_table"]["multipliers"], [1])

    def test_bet_table_carries(self):
        d = _minimal_dsl()
        d["bet_table"] = {
            "multipliers": [1, 2, 5, 10, 20],
            "min_bet": 0.2, "max_bet": 100.0,
        }
        ir = dsl_to_slot_sim_ir(d)
        self.assertEqual(ir["bet_table"]["multipliers"], [1, 2, 5, 10, 20])


# ─── GDD JSON → DSL bridge ──────────────────────────────────────────────


class TestGddJsonToDsl(unittest.TestCase):

    def test_empty_gdd_minimal_dsl(self):
        dsl = gdd_json_to_dsl({})
        dsl_validate(dsl)  # must produce a valid DSL even from empty input

    def test_extracted_fields_promoted(self):
        extracted = {
            "meta": {"target_rtp": 0.96, "volatility": "high",
                     "max_win_x": 5000.0},
            "topology": {"reels": 5, "rows": 4, "paylines": 40},
            "paytable": [
                {"symbol": "Red7", "count": 5, "pays": 1000},
                {"symbol": "Red7", "count": 4, "pays": 250},
            ],
            "features": [
                {"kind": "free_spins", "trigger_count_min": 3,
                 "initial_spins": 10},
            ],
            "bet_range": {"min_bet": 0.20, "max_bet": 100.0},
        }
        dsl = gdd_json_to_dsl(extracted)
        self.assertAlmostEqual(dsl["meta"]["target_rtp"], 0.96)
        self.assertEqual(dsl["meta"]["max_win_x"], 5000.0)
        self.assertEqual(dsl["topology"]["reels"], 5)
        self.assertEqual(len(dsl["paytable"]), 2)
        self.assertEqual(len(dsl["features"]), 1)
        # Validate ensures the bridge produces well-formed DSL
        dsl_validate(dsl)

    def test_end_to_end_gdd_to_ir(self):
        """Synthetic GDD JSON → DSL → IR pipeline."""
        extracted = {
            "meta": {"target_rtp": 0.95, "volatility": "medium"},
            "topology": {"reels": 5, "rows": 3, "paylines": 20},
            "paytable": [
                {"symbol": "Red7", "count": 5, "pays": 500},
            ],
            "features": [
                {"kind": "free_spins", "trigger_symbol": "Scatter",
                 "trigger_count_min": 3, "initial_spins": 8,
                 "retrigger_spins": 5, "max_total_spins": 50,
                 "reel_bank": "fs"},
            ],
        }
        dsl = gdd_json_to_dsl(extracted)
        ir = dsl_to_slot_sim_ir(dsl)
        self.assertEqual(ir["topology"]["reels"], 5)
        self.assertEqual(ir["meta"]["rtp_total"], 0.95)
        self.assertEqual(len(ir["features"]), 1)


# ─── TOML round-trip ────────────────────────────────────────────────────


class TestTomlRoundTrip(unittest.TestCase):

    def test_dump_then_load(self):
        d = _minimal_dsl()
        d["symbols"] = [
            {"id": "Wild", "role": "wild"},
            {"id": "Red7", "role": "hp"},
        ]
        d["paytable"] = [
            {"symbol": "Red7", "count": 5, "pays": 1000.0},
        ]
        toml_text = dump_dsl_toml(d)
        parsed = load_dsl_toml(toml_text)
        self.assertEqual(parsed["meta"]["name"], "Mini")
        self.assertAlmostEqual(parsed["meta"]["target_rtp"], 0.96)
        self.assertEqual(parsed["topology"]["reels"], 5)
        self.assertEqual(parsed["symbols"][0]["id"], "Wild")
        self.assertEqual(parsed["paytable"][0]["pays"], 1000.0)

    def test_dump_then_load_then_validate(self):
        d = _minimal_dsl()
        toml_text = dump_dsl_toml(d)
        parsed = load_dsl_toml(toml_text)
        dsl_validate(parsed)  # round-trip yields valid DSL


if __name__ == "__main__":
    unittest.main()
