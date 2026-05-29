"""W4.9 (Cluster Pays spec) + W4.10 (Cascade spec) + W5.6 (multi-objective synth)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import parse_spec, compile_to_ir, extract_from_ir
from tools.smt.weight_synthesizer import (
    synth_multi_objective, measured_rtp,
    coefficient_of_variation, RtpSynthesisError,
)


SPEC_CLUSTER = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_cluster_pays.yaml"
).read_text(encoding="utf-8")

SPEC_CASCADE = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_cascade.yaml"
).read_text(encoding="utf-8")

SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")


# ─── W4.9 — Cluster Pays ────────────────────────────────────────────────


class TestClusterPaysSpec(unittest.TestCase):
    def test_parses_cluster_topology(self):
        spec = parse_spec(SPEC_CLUSTER)
        self.assertEqual(spec.topology.kind, "cluster_grid")
        self.assertEqual(spec.topology.rows, 7)
        self.assertEqual(spec.topology.adjacency, "orthogonal")

    def test_compiles_to_cluster_evaluation(self):
        spec = parse_spec(SPEC_CLUSTER)
        ir = compile_to_ir(spec)
        self.assertEqual(ir["evaluation"]["kind"], "cluster")
        self.assertGreater(ir["evaluation"]["min_cluster_size"], 0)
        self.assertGreater(len(ir["evaluation"]["cluster_pay_table"]), 0)

    def test_emits_cascade_feature(self):
        spec = parse_spec(SPEC_CLUSTER)
        ir = compile_to_ir(spec)
        kinds = [f["kind"] for f in ir["features"]]
        self.assertIn("cascade", kinds)
        self.assertIn("free_spins", kinds)

    def test_cluster_spec_round_trip(self):
        spec = parse_spec(SPEC_CLUSTER)
        ir = compile_to_ir(spec)
        recovered = extract_from_ir(ir)
        # cluster_grid kind preserved through extract; columns is the
        # extractor's reconstructed key (uses topology.columns or reels).
        self.assertEqual(recovered.topology.kind, "cluster_grid")


# ─── W4.10 — Cascade ────────────────────────────────────────────────────


class TestCascadeSpec(unittest.TestCase):
    def test_parses_cascade_feature(self):
        spec = parse_spec(SPEC_CASCADE)
        kinds = [f.kind for f in spec.features]
        self.assertIn("cascade", kinds)
        cascade = next(f for f in spec.features if f.kind == "cascade")
        self.assertEqual(cascade.replacement, "drop")
        self.assertEqual(cascade.max_chain, 25)

    def test_compiles_6x5_topology(self):
        spec = parse_spec(SPEC_CASCADE)
        ir = compile_to_ir(spec)
        self.assertEqual(ir["topology"]["reels"], 6)
        self.assertEqual(ir["topology"]["rows"], 5)
        # cascade Feature variant emitted
        kinds = [f["kind"] for f in ir["features"]]
        self.assertIn("cascade", kinds)

    def test_cascade_max_chain_propagated(self):
        spec = parse_spec(SPEC_CASCADE)
        ir = compile_to_ir(spec)
        cascade = next(f for f in ir["features"] if f["kind"] == "cascade")
        self.assertEqual(cascade["max_chain"], 25)
        self.assertEqual(cascade["replacement"], "drop")

    def test_cascade_high_volatility(self):
        spec = parse_spec(SPEC_CASCADE)
        self.assertEqual(spec.constraints.volatility_class, "high")
        ir = compile_to_ir(spec)
        self.assertEqual(ir["limits"]["target_volatility"], "high")

    def test_cascade_round_trip(self):
        spec = parse_spec(SPEC_CASCADE)
        ir = compile_to_ir(spec)
        recovered = extract_from_ir(ir)
        kinds = [f.kind for f in recovered.features]
        self.assertIn("cascade", kinds)
        cascade = next(f for f in recovered.features if f.kind == "cascade")
        self.assertEqual(cascade.replacement, "drop")


# ─── W5.6 — Multi-objective synth ─────────────────────────────────────


class TestMultiObjectiveSynth(unittest.TestCase):
    def test_rtp_only_mode_equivalent_to_c1(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_multi_objective(
            ir, target_rtp=0.96, reel_length=50.0, rtp_tolerance=0.005,
        )
        rtp = measured_rtp(solved)
        self.assertAlmostEqual(rtp, 0.96, delta=0.01)
        self.assertEqual(solved["_synth_log"]["mode"], "C-5_multi_objective")

    def test_rtp_and_volatility_joint(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_multi_objective(
            ir, target_rtp=0.96, volatility_class="medium",
            reel_length=50.0, rtp_tolerance=0.01,
        )
        rtp = measured_rtp(solved)
        cv = coefficient_of_variation(solved)
        self.assertAlmostEqual(rtp, 0.96, delta=0.02)
        # CV should land in or near the medium bucket [4, 8]
        self.assertGreaterEqual(cv, 3.5)
        self.assertLess(cv, 9.0)

    def test_unsat_when_volatility_bad(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        with self.assertRaises(RtpSynthesisError):
            synth_multi_objective(
                ir, target_rtp=0.96, volatility_class="invalid_class",
            )

    def test_log_block_captures_constraints(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_multi_objective(
            ir, target_rtp=0.96, target_hit_freq=0.25,
            volatility_class="medium",
            reel_length=50.0, rtp_tolerance=0.01,
            hit_freq_tolerance=0.05,
        )
        log = solved["_synth_log"]
        self.assertEqual(log["target_rtp"], 0.96)
        self.assertEqual(log["target_hit_freq"], 0.25)
        self.assertEqual(log["volatility_class"], "medium")


if __name__ == "__main__":
    unittest.main()
