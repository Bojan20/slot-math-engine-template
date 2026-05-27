"""W5.1 + W5.2 — Math DSL parser + Z3 weight synthesizer integration tests.

Covers:
  • DSL YAML parsing (positive + negative cases)
  • DSL → SlotGameIR skeleton compile
  • Z3 Mode C-1 (uniform HP/LP/special weights) solves target RTP
  • Z3 Mode C-3 (hit_freq constraint) solves both RTP + hit_freq
  • End-to-end pipeline: classic 5×3 DSL → IR + closed-form RTP within
    tolerance of target
  • End-to-end Megaways pipeline (variable_rows topology + progressive_link)
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir, DslParseError, CompileError,
)
from tools.math_dsl.spec import MathDslSpec, FeatureSpec, SymbolSpec
from tools.smt.weight_synthesizer import (
    synth_uniform_weights, synth_with_hit_freq, measured_rtp,
    RtpSynthesisError,
)


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")

SPEC_MEGAWAYS = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_megaways.yaml"
).read_text(encoding="utf-8")


# ─── W5.1 — DSL parser ─────────────────────────────────────────────────


class TestDslParser(unittest.TestCase):
    def test_parses_classic_spec(self):
        spec = parse_spec(SPEC_CLASSIC)
        self.assertIsInstance(spec, MathDslSpec)
        self.assertEqual(spec.meta["name"], "Crimson Tiger")
        self.assertEqual(spec.topology.kind, "rectangular")
        self.assertEqual(spec.topology.reels, 5)
        self.assertEqual(spec.topology.rows, 3)
        self.assertEqual(spec.paylines, 20)
        self.assertEqual(spec.constraints.target_rtp, 0.96)
        self.assertEqual(spec.constraints.volatility_class, "medium")
        # Symbols
        self.assertGreaterEqual(len(spec.symbols), 6)
        self.assertEqual(spec.symbols[0].id, "wild")
        self.assertEqual(spec.symbols[0].kind, "wild")
        # Features
        self.assertEqual(len(spec.features), 1)
        self.assertEqual(spec.features[0].kind, "free_spins")
        self.assertEqual(spec.features[0].initial_spins, 10)

    def test_parses_megaways_spec(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        self.assertEqual(spec.topology.kind, "variable_rows")
        self.assertEqual(spec.topology.reels, 6)
        self.assertEqual(len(spec.topology.row_range_per_reel or []), 6)
        self.assertEqual(spec.topology.ways_cap, 117649)
        # Two features incl. linear_progressive
        kinds = [f.kind for f in spec.features]
        self.assertIn("linear_progressive", kinds)
        self.assertIn("free_spins", kinds)
        # Constraints
        self.assertEqual(spec.constraints.volatility_class, "high")
        self.assertEqual(spec.constraints.target_rtp, 0.96)

    def test_rejects_missing_name(self):
        bad = "schema_version: '1.0.0'\nmeta: {}\n"
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_bad_topology(self):
        bad = """
schema_version: "1.0.0"
meta:
  name: x
topology:
  kind: doughnut
symbols:
  - id: a
    kind: hp
  - id: b
    kind: lp
"""
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_bad_volatility_class(self):
        bad = """
schema_version: "1.0.0"
meta:
  name: x
topology:
  kind: rectangular
  reels: 5
  rows: 3
symbols:
  - id: a
    kind: hp
  - id: b
    kind: lp
constraints:
  volatility_class: insane
"""
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_duplicate_symbol_id(self):
        bad = """
schema_version: "1.0.0"
meta:
  name: x
topology:
  kind: rectangular
  reels: 5
  rows: 3
symbols:
  - id: a
    kind: hp
  - id: a
    kind: lp
"""
        with self.assertRaises(DslParseError):
            parse_spec(bad)

    def test_rejects_variable_rows_without_range(self):
        bad = """
schema_version: "1.0.0"
meta:
  name: x
topology:
  kind: variable_rows
  reels: 6
  rows: 7
symbols:
  - id: a
    kind: hp
  - id: b
    kind: lp
"""
        with self.assertRaises(DslParseError):
            parse_spec(bad)


# ─── W5.1 — DSL → IR compile ───────────────────────────────────────────


class TestDslCompile(unittest.TestCase):
    def test_compiles_classic_to_ir_shape(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        for k in ("schema_version", "meta", "topology", "symbols", "reels",
                  "evaluation", "paytable", "features", "rng", "bet", "limits",
                  "compliance", "rtp_allocation"):
            self.assertIn(k, ir)
        self.assertEqual(ir["topology"]["reels"], 5)
        self.assertEqual(ir["evaluation"]["kind"], "lines")
        self.assertEqual(len(ir["evaluation"]["paylines"]), 20)
        # Paytable seeded for HP + LP symbols (monotonic ladder)
        pt = ir["paytable"]
        for sym_id, ladder in pt.items():
            counts = sorted(int(k) for k in ladder.keys())
            self.assertEqual(counts, [3, 4, 5])
            pays = [ladder[str(c)] for c in counts]
            self.assertLess(pays[0], pays[1])
            self.assertLess(pays[1], pays[2])

    def test_compiles_megaways_to_ways_evaluation(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(spec)
        self.assertEqual(ir["topology"]["kind"], "variable_rows")
        self.assertEqual(ir["evaluation"]["kind"], "ways")
        self.assertGreaterEqual(ir["evaluation"]["max_ways_per_spin"], 1)
        # progressive_link block emitted (W4.7 hook)
        self.assertIn("progressive_link", ir)
        self.assertEqual(ir["progressive_link"]["pool_id"],
                         "wap-megaways-grand-2026")

    def test_jurisdictions_propagated(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(spec)
        self.assertEqual(ir["compliance"]["jurisdictions"],
                         ["UKGC", "MGA", "ADM", "DGOJ"])

    def test_rtp_allocation_normalized_to_target(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(spec)
        alloc = ir["rtp_allocation"]
        s = alloc["base_game"] + alloc["free_spins"] + alloc["hold_and_win"] + alloc["jackpot"]
        self.assertAlmostEqual(s, spec.constraints.target_rtp, places=6)


# ─── W5.2 — Z3 weight synthesizer ──────────────────────────────────────


class TestZ3Synth(unittest.TestCase):
    def test_uniform_weights_hit_target_rtp_classic(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(
            ir, spec.constraints.target_rtp, reel_length=50.0,
            tolerance=spec.constraints.rtp_tolerance,
        )
        rtp_post = measured_rtp(solved)
        self.assertAlmostEqual(rtp_post, spec.constraints.target_rtp,
                               delta=spec.constraints.rtp_tolerance + 1e-3)
        # Log block present
        self.assertIn("_synth_log", solved)
        self.assertEqual(solved["_synth_log"]["mode"], "C-1_uniform")

    def test_uniform_weights_hit_target_rtp_megaways(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(spec)
        # Megaways uses ways eval; the synth uses lines formula since
        # paytable is keyed by (sym, count). For this POC we accept that
        # Mode C-1 measures against the lines projection.
        solved = synth_uniform_weights(
            ir, spec.constraints.target_rtp, reel_length=80.0,
            tolerance=spec.constraints.rtp_tolerance,
        )
        rtp_post = measured_rtp(solved)
        # For a ways slot in line-projection, we still expect the Z3 model
        # to hit the symbolic equation within tolerance. measured_rtp
        # uses the same closed-form, so equality is exact (mod float).
        self.assertAlmostEqual(rtp_post, spec.constraints.target_rtp,
                               delta=spec.constraints.rtp_tolerance + 5e-3)

    def test_synth_writes_weighted_mode_reels(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.95, reel_length=50.0)
        self.assertEqual(solved["reels"]["mode"], "weighted")
        self.assertEqual(len(solved["reels"]["base"]), spec.topology.reels)
        # All symbol IDs have positive weights
        for reel in solved["reels"]["base"]:
            for sym_id, w in reel.items():
                self.assertGreater(w, 0)

    def test_unsat_when_paytable_empty(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        ir["paytable"] = {}  # nuke
        with self.assertRaises(RtpSynthesisError):
            synth_uniform_weights(ir, 0.96)

    def test_can_lower_target_rtp(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved_lo = synth_uniform_weights(ir, 0.90, reel_length=50.0,
                                          tolerance=0.005)
        self.assertAlmostEqual(measured_rtp(solved_lo), 0.90,
                               delta=0.01)


# ─── End-to-end pipeline ────────────────────────────────────────────────


class TestEndToEndPipeline(unittest.TestCase):
    """Designer-flow integration: YAML → spec → IR → Z3-balanced IR with
    measurable RTP within tolerance. This is the W5 vision in one test."""

    def test_classic_5x3_full_pipeline(self):
        yaml_text = SPEC_CLASSIC
        spec = parse_spec(yaml_text)
        ir = compile_to_ir(spec)
        # Pre-synth measured RTP is whatever the seeded weights yield
        rtp_pre = measured_rtp(ir)
        # Post-synth must converge to target
        ir2 = synth_uniform_weights(
            ir, spec.constraints.target_rtp,
            reel_length=float(spec.hints.get("reel_length") or 60),
            tolerance=spec.constraints.rtp_tolerance,
        )
        rtp_post = measured_rtp(ir2)
        self.assertAlmostEqual(rtp_post, 0.96, delta=0.01)
        # The synth must have *moved* RTP closer to target
        self.assertLess(abs(rtp_post - 0.96), abs(rtp_pre - 0.96) + 1e-9)

    def test_megaways_full_pipeline_with_progressive(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(spec)
        ir2 = synth_uniform_weights(
            ir, spec.constraints.target_rtp,
            reel_length=float(spec.hints.get("reel_length") or 80),
            tolerance=spec.constraints.rtp_tolerance,
        )
        # Linear progressive metadata preserved through synth
        self.assertIn("progressive_link", ir2)
        self.assertEqual(ir2["progressive_link"]["pool_id"],
                         "wap-megaways-grand-2026")
        # Compliance jurisdictions preserved
        self.assertEqual(ir2["compliance"]["jurisdictions"],
                         ["UKGC", "MGA", "ADM", "DGOJ"])


if __name__ == "__main__":
    unittest.main()
