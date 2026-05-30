"""W8.4 health check + W8.5 stress synth + W8.6 prompt parser tests."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir, serialize_to_yaml,
    health_check, HealthReport,
    stress_synth, StressReport,
    parse_prompt, list_prompt_grammar,
)
from tools.math_dsl.spec import SymbolSpec


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")


# ─── W8.4 — Health check ─────────────────────────────────────────


class TestHealthCheck(unittest.TestCase):
    def test_clean_spec_passes(self):
        spec = parse_spec(SPEC_CLASSIC)
        report = health_check(spec)
        self.assertIsInstance(report, HealthReport)
        self.assertTrue(report.ok)
        checks = {c.name for c in report.checks}
        self.assertIn("lint", checks)
        self.assertIn("compile", checks)
        self.assertIn("z3_dry_run_C-1", checks)

    def test_no_synth_flag_skips_z3(self):
        spec = parse_spec(SPEC_CLASSIC)
        report = health_check(spec, dry_run_synth=False)
        names = {c.name for c in report.checks}
        self.assertNotIn("z3_dry_run_C-1", names)

    def test_health_summary_markdown(self):
        spec = parse_spec(SPEC_CLASSIC)
        report = health_check(spec)
        text = report.summary()
        self.assertIn("Health check", text)
        self.assertIn("PASS", text)
        self.assertIn("|", text)

    def test_broken_spec_fails_health(self):
        spec = parse_spec(SPEC_CLASSIC)
        # Kill paying symbols → LINT001 error + likely compile/synth fail
        spec.symbols = [SymbolSpec(id="hp_a", kind="hp")]
        report = health_check(spec, dry_run_synth=False)
        # lint should fail
        lint_check = next(c for c in report.checks if c.name == "lint")
        self.assertFalse(lint_check.ok)
        self.assertFalse(report.ok)


# ─── W8.5 — Stress synth ──────────────────────────────────────────
# W244 wave 7: tagged `slow` — 3 testova × ~70s svaki (Z3 multi-class
# volatility synth across LOW/MED/HIGH/EXTREME). Skipped in qa-quick L3
# but runs in qa-full / CI nightly.


@pytest.mark.slow
class TestStressSynth(unittest.TestCase):
    def test_stress_returns_one_row_per_class(self):
        spec = parse_spec(SPEC_CLASSIC)
        report = stress_synth(spec)
        self.assertIsInstance(report, StressReport)
        classes = {r.volatility_class for r in report.rows}
        self.assertEqual(classes, {"low", "medium", "high", "ultra"})

    def test_stress_summary_markdown(self):
        spec = parse_spec(SPEC_CLASSIC)
        report = stress_synth(spec)
        text = report.summary()
        self.assertIn("Stress synth report", text)
        self.assertIn("low", text)
        self.assertIn("medium", text)
        self.assertIn("high", text)
        self.assertIn("ultra", text)

    def test_at_least_one_volatility_class_reachable(self):
        spec = parse_spec(SPEC_CLASSIC)
        report = stress_synth(spec)
        self.assertGreater(len(report.reachable_classes), 0)


# ─── W8.6 — Prompt parser ────────────────────────────────────────


class TestPromptParser(unittest.TestCase):
    def test_default_5x3_topology(self):
        spec, log = parse_prompt("5x3 lines slot, RTP 96, free spins")
        self.assertEqual(spec.topology.kind, "rectangular")
        self.assertEqual(spec.topology.reels, 5)
        self.assertEqual(spec.topology.rows, 3)

    def test_rtp_parsed(self):
        spec, _ = parse_prompt("5x3, RTP 96.5%, medium volatility")
        self.assertAlmostEqual(spec.constraints.target_rtp, 0.965)

    def test_volatility_parsed(self):
        spec, _ = parse_prompt("5x3, RTP 96, ultra volatility, free spins")
        self.assertEqual(spec.constraints.volatility_class, "ultra")

    def test_paylines_parsed(self):
        spec, _ = parse_prompt("5x3 slot, RTP 96, 20 paylines, free spins")
        self.assertEqual(spec.paylines, 20)

    def test_features_parsed(self):
        spec, _ = parse_prompt(
            "6x5, RTP 96, cascade, free spins, mystery symbol, ante bet"
        )
        kinds = {f.kind for f in spec.features}
        self.assertIn("cascade", kinds)
        self.assertIn("free_spins", kinds)
        self.assertIn("mystery_symbol", kinds)
        self.assertIn("ante_bet", kinds)

    def test_megaways_topology(self):
        spec, log = parse_prompt(
            "megaways with progressive, RTP 96.5, high volatility, for UKGC"
        )
        self.assertEqual(spec.topology.kind, "variable_rows")
        self.assertEqual(spec.topology.reels, 6)
        self.assertEqual(spec.topology.ways_cap, 117649)
        # Default symbol pack for megaways includes mystery
        kinds = {s.kind for s in spec.symbols}
        self.assertIn("mystery", kinds)

    def test_cluster_topology(self):
        spec, _ = parse_prompt(
            "cluster pays slot, RTP 95, high volatility, cascade"
        )
        self.assertEqual(spec.topology.kind, "cluster_grid")
        self.assertEqual(spec.topology.adjacency, "orthogonal")

    def test_max_win_parsed(self):
        spec, _ = parse_prompt("5x3, RTP 96, max win 25000")
        self.assertEqual(spec.constraints.max_win_x, 25000)

    def test_name_quoted_parsed(self):
        spec, _ = parse_prompt("5x3, RTP 96, free spins, name 'Diamond Crown'")
        self.assertEqual(spec.meta["name"], "Diamond Crown")

    def test_vendor_parsed(self):
        spec, _ = parse_prompt("5x3, RTP 96, vendor studio-x, free spins")
        self.assertEqual(spec.meta.get("vendor"), "studio-x")

    def test_jurisdiction_parsed(self):
        spec, _ = parse_prompt("5x3, RTP 96, for UKGC, free spins")
        self.assertIn("UKGC", spec.constraints.jurisdictions)

    def test_generated_spec_compiles(self):
        spec, _ = parse_prompt(
            "6x4 lines, RTP 96, medium volatility, free spins, "
            "20 paylines, max win 5000"
        )
        # Compile should succeed
        ir = compile_to_ir(spec)
        self.assertEqual(ir["topology"]["reels"], 6)
        self.assertEqual(ir["topology"]["rows"], 4)

    def test_generated_yaml_round_trips(self):
        spec, _ = parse_prompt(
            "5x3 lines, RTP 96, medium volatility, free spins, 20 paylines"
        )
        yaml_text = serialize_to_yaml(spec)
        re_parsed = parse_spec(yaml_text)
        self.assertEqual(re_parsed.constraints.target_rtp, 0.96)
        self.assertEqual(re_parsed.topology.reels, 5)

    def test_grammar_examples_all_parse(self):
        for example in list_prompt_grammar():
            try:
                spec, log = parse_prompt(example)
                _ = compile_to_ir(spec)
            except Exception as e:
                self.fail(f"grammar example failed: {example!r} → {e}")


if __name__ == "__main__":
    unittest.main()
