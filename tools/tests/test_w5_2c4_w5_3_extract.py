"""W5.2 Mode C-4 (volatility) + W5.3 IR→DSL extract + roundtrip tests."""
from __future__ import annotations

import sys
import unittest

import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir, extract_from_ir, serialize_to_yaml,
    ExtractError,
)
from tools.smt.weight_synthesizer import (
    synth_uniform_weights, synth_with_volatility, measured_rtp,
    coefficient_of_variation, volatility_class_of,
    VOLATILITY_CV_BUCKETS, RtpSynthesisError,
)


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")

SPEC_MEGAWAYS = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_megaways.yaml"
).read_text(encoding="utf-8")


# ─── W5.2 Mode C-4 — volatility CV bucket ──────────────────────────────


class TestVolatilitySynth(unittest.TestCase):
    def test_volatility_buckets_defined(self):
        for name, (lo, hi) in VOLATILITY_CV_BUCKETS.items():
            self.assertLess(lo, hi)
            self.assertGreaterEqual(lo, 0)

    def test_coefficient_of_variation_classic(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        # After uniform synth, CV must be a positive finite number
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        cv = coefficient_of_variation(solved)
        self.assertGreater(cv, 0)
        self.assertLess(cv, 1_000)

    def test_volatility_class_of_classifies(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        cls = volatility_class_of(solved)
        self.assertIn(cls, VOLATILITY_CV_BUCKETS)

    @pytest.mark.slow  # W244 wave 7: Z3 NRA volatility CV synth ~14s
    def test_mode_c4_lands_in_medium_bucket(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_with_volatility(
            ir, target_rtp=0.96, volatility_class="medium",
            reel_length=50.0, tolerance=0.01,
        )
        cv = coefficient_of_variation(solved)
        lo, hi = VOLATILITY_CV_BUCKETS["medium"]
        self.assertGreaterEqual(cv, lo - 0.5)
        self.assertLess(cv, hi + 0.5)
        # RTP within tolerance
        rtp = measured_rtp(solved)
        self.assertAlmostEqual(rtp, 0.96, delta=0.02)

    def test_mode_c4_rejects_unknown_class(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        with self.assertRaises(RtpSynthesisError):
            synth_with_volatility(ir, 0.96, "insane")

    @pytest.mark.slow  # W244 wave 7: Z3 NRA volatility CV synth ~14s
    def test_mode_c4_log_block(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_with_volatility(
            ir, 0.96, "medium", reel_length=50.0, tolerance=0.01,
        )
        log = solved["_synth_log"]
        self.assertEqual(log["mode"], "C-4_volatility")
        self.assertEqual(log["volatility_class"], "medium")
        self.assertEqual(log["cv_range"], [4.0, 8.0])


# ─── W5.3 — IR → DSL extract ───────────────────────────────────────────


class TestExtractFromIr(unittest.TestCase):
    def test_extract_classic_ir_round_trip(self):
        original = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(original)
        recovered = extract_from_ir(ir)
        # Topology preserved
        self.assertEqual(recovered.topology.kind, original.topology.kind)
        self.assertEqual(recovered.topology.reels, original.topology.reels)
        self.assertEqual(recovered.topology.rows, original.topology.rows)
        # Symbols preserved (count + IDs)
        self.assertEqual(len(recovered.symbols), len(original.symbols))
        self.assertEqual(
            sorted(s.id for s in recovered.symbols),
            sorted(s.id for s in original.symbols),
        )
        # Constraints — target_rtp / volatility / jurisdictions preserved
        self.assertEqual(recovered.constraints.target_rtp,
                         original.constraints.target_rtp)
        self.assertEqual(recovered.constraints.volatility_class,
                         original.constraints.volatility_class)
        self.assertEqual(recovered.constraints.jurisdictions,
                         original.constraints.jurisdictions)

    def test_extract_megaways_preserves_variable_rows(self):
        original = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(original)
        recovered = extract_from_ir(ir)
        self.assertEqual(recovered.topology.kind, "variable_rows")
        self.assertEqual(recovered.topology.reels, 6)
        self.assertEqual(recovered.topology.ways_cap, 117649)
        # Linear progressive feature preserved
        kinds = [f.kind for f in recovered.features]
        self.assertIn("linear_progressive", kinds)
        prog = next(f for f in recovered.features if f.kind == "linear_progressive")
        self.assertEqual(prog.pool_id, "wap-megaways-grand-2026")
        self.assertEqual(prog.seed_x, 250.0)

    def test_extract_rejects_missing_meta(self):
        with self.assertRaises(ExtractError):
            extract_from_ir({})
        with self.assertRaises(ExtractError):
            extract_from_ir({"meta": {}})

    def test_extract_uses_provenance_vendor(self):
        ir = compile_to_ir(parse_spec(SPEC_CLASSIC))
        # Strip vendor from meta but keep provenance
        ir["meta"].pop("vendor", None)
        ir["provenance"] = {
            "vendor": "vendor_x",
            "par_source": "x.tsv",
            "par_sha256": "a" * 64,
        }
        recovered = extract_from_ir(ir)
        self.assertEqual(recovered.meta.get("vendor"), "vendor_x")

    def test_extract_recovers_hints_from_reels(self):
        original = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(original)
        recovered = extract_from_ir(ir)
        # Reel length and wild/scatter shares recovered from seeded weights
        self.assertIn("reel_length", recovered.hints)
        self.assertGreater(recovered.hints["reel_length"], 0)


# ─── DSL YAML serializer ───────────────────────────────────────────────


class TestSerializeYaml(unittest.TestCase):
    def test_serialize_yaml_parseable_back(self):
        original = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(original)
        recovered = extract_from_ir(ir)
        yaml_text = serialize_to_yaml(recovered)
        # Round-trip through parser
        re_parsed = parse_spec(yaml_text)
        self.assertEqual(re_parsed.topology.kind, recovered.topology.kind)
        self.assertEqual(re_parsed.topology.reels, recovered.topology.reels)
        self.assertEqual(len(re_parsed.symbols), len(recovered.symbols))
        self.assertEqual(re_parsed.constraints.target_rtp,
                         recovered.constraints.target_rtp)
        self.assertEqual(re_parsed.constraints.volatility_class,
                         recovered.constraints.volatility_class)

    def test_megaways_yaml_round_trip(self):
        original = parse_spec(SPEC_MEGAWAYS)
        ir = compile_to_ir(original)
        recovered = extract_from_ir(ir)
        yaml_text = serialize_to_yaml(recovered)
        re_parsed = parse_spec(yaml_text)
        self.assertEqual(re_parsed.topology.kind, "variable_rows")
        self.assertEqual(re_parsed.topology.ways_cap, 117649)
        self.assertEqual(len(re_parsed.topology.row_range_per_reel or []), 6)


# ─── Full pipeline: DSL → IR → DSL → IR (idempotent) ──────────────────


class TestFullPipelineIdempotency(unittest.TestCase):
    def test_dsl_to_ir_to_dsl_to_ir_classic(self):
        original_spec = parse_spec(SPEC_CLASSIC)
        ir1 = compile_to_ir(original_spec)
        recovered_spec = extract_from_ir(ir1)
        ir2 = compile_to_ir(recovered_spec)
        # Critical structural fields must be equal across the round-trip
        self.assertEqual(ir2["topology"], ir1["topology"])
        self.assertEqual(ir2["limits"]["target_rtp"],
                         ir1["limits"]["target_rtp"])
        self.assertEqual(ir2["limits"]["target_volatility"],
                         ir1["limits"]["target_volatility"])
        self.assertEqual(ir2["compliance"]["jurisdictions"],
                         ir1["compliance"]["jurisdictions"])
        self.assertEqual(sorted(ir2["symbols"], key=lambda s: s["id"]),
                         sorted(ir1["symbols"], key=lambda s: s["id"]))


if __name__ == "__main__":
    unittest.main()
