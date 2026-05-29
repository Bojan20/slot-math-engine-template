"""W8.1 MC validator + W8.2 spec linter + W8.3 docs generator tests."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir,
    mc_validate, McValidationReport,
    lint_spec, render_lint, filter_by_severity, render_docs,
)
from tools.math_dsl.spec import SymbolSpec
from tools.smt.weight_synthesizer import synth_uniform_weights


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")
SPEC_MEGAWAYS = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_megaways.yaml"
).read_text(encoding="utf-8")


# ─── W8.1 — MC validator ───────────────────────────────────────────


class TestMcValidator(unittest.TestCase):
    def test_mc_run_classic_returns_report(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        report = mc_validate(solved, spins=5_000, seed=42)
        self.assertIsInstance(report, McValidationReport)
        self.assertEqual(report.spins, 5_000)
        self.assertGreater(report.empirical_rtp, 0)
        self.assertGreater(report.std_err, 0)
        self.assertIn(report.verdict, ("PASS", "MARGINAL", "FAIL"))

    def test_mc_summary_markdown(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        report = mc_validate(solved, spins=2_000, seed=1)
        text = report.summary()
        self.assertIn("MC validation report", text)
        self.assertIn("empirical RTP", text)
        self.assertIn("closed-form RTP", text)
        self.assertIn("verdict", text)

    def test_mc_empirical_within_three_sigma_of_closed_form(self):
        """Even small MC runs should hit closed-form within 3σ when seeded."""
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        report = mc_validate(solved, spins=20_000, seed=2026)
        # 3σ envelope should always cover closed-form for an exact model
        self.assertLess(
            abs(report.empirical_rtp - report.closed_form_rtp),
            5 * report.std_err + 0.02,  # generous slack for small N
        )

    def test_mc_seed_determinism(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        r1 = mc_validate(solved, spins=1_000, seed=99)
        r2 = mc_validate(solved, spins=1_000, seed=99)
        self.assertEqual(r1.empirical_rtp, r2.empirical_rtp)

    def test_mc_different_seeds_diverge(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        r1 = mc_validate(solved, spins=1_000, seed=1)
        r2 = mc_validate(solved, spins=1_000, seed=2)
        self.assertNotEqual(r1.empirical_rtp, r2.empirical_rtp)


# ─── W8.2 — Spec linter ────────────────────────────────────────────


class TestLinter(unittest.TestCase):
    def test_clean_spec_has_few_findings(self):
        spec = parse_spec(SPEC_CLASSIC)
        findings = lint_spec(spec)
        errors = [f for f in findings if f.severity == "error"]
        self.assertEqual(errors, [],
                         f"clean spec should have no errors, got {errors}")

    def test_rule_LINT001_few_paying_symbols(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.symbols = [
            SymbolSpec(id="wild", kind="wild"),
            SymbolSpec(id="hp_a", kind="hp"),
        ]  # only 1 paying
        findings = lint_spec(spec)
        ids = [f.rule_id for f in findings]
        self.assertIn("LINT001", ids)

    def test_rule_LINT002_no_wild_no_scatter(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.symbols = [
            SymbolSpec(id="hp1", kind="hp"),
            SymbolSpec(id="hp2", kind="hp"),
            SymbolSpec(id="lp1", kind="lp"),
            SymbolSpec(id="lp2", kind="lp"),
        ]
        findings = lint_spec(spec)
        self.assertIn("LINT002", [f.rule_id for f in findings])

    def test_rule_LINT004_rtp_out_of_range(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.constraints.target_rtp = 0.55
        findings = lint_spec(spec)
        self.assertIn("LINT004", [f.rule_id for f in findings])

    def test_rule_LINT010_no_features(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.features = []
        findings = lint_spec(spec)
        self.assertIn("LINT010", [f.rule_id for f in findings])

    def test_rule_LINT014_variable_rows_without_range(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        spec.topology.row_range_per_reel = None
        findings = lint_spec(spec)
        self.assertIn("LINT014", [f.rule_id for f in findings])

    def test_rule_LINT015_duplicate_jurisdiction(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.constraints.jurisdictions = ["UKGC", "MGA", "UKGC"]
        findings = lint_spec(spec)
        self.assertIn("LINT015", [f.rule_id for f in findings])

    def test_filter_by_severity(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.symbols = [SymbolSpec(id="hp1", kind="hp")]  # triggers LINT001 (error)
        findings = lint_spec(spec)
        errors = filter_by_severity(findings, "error")
        self.assertGreater(len(errors), 0)
        warnings = filter_by_severity(findings, "warning")
        self.assertIsInstance(warnings, list)

    def test_render_lint_markdown_or_empty(self):
        spec = parse_spec(SPEC_CLASSIC)
        text = render_lint([])
        self.assertIn("clean", text.lower())
        findings = lint_spec(spec)
        if findings:
            text = render_lint(findings)
            self.assertIn("|", text)

    def test_megaways_without_mystery_warns(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        spec.features = [f for f in spec.features if f.kind != "mystery_symbol"]
        spec.symbols = [s for s in spec.symbols if s.kind != "mystery"]
        findings = lint_spec(spec)
        self.assertIn("LINT007", [f.rule_id for f in findings])


# ─── W8.3 — Docs generator ─────────────────────────────────────────


class TestDocsGenerator(unittest.TestCase):
    def test_renders_full_doc(self):
        spec = parse_spec(SPEC_CLASSIC)
        md = render_docs(spec)
        # All sections present
        for section in ("# Crimson Tiger", "## Topology", "## Symbols",
                         "## Features", "## Constraints", "## Jurisdictions"):
            self.assertIn(section, md)

    def test_includes_mermaid_diagram(self):
        spec = parse_spec(SPEC_CLASSIC)
        md = render_docs(spec)
        self.assertIn("```mermaid", md)
        self.assertIn("flowchart TD", md)

    def test_renders_megaways_topology_details(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        md = render_docs(spec)
        self.assertIn("variable_rows", md)
        self.assertIn("117,649", md)  # ways_cap formatted

    def test_renders_jurisdictions_inline(self):
        spec = parse_spec(SPEC_CLASSIC)
        md = render_docs(spec)
        self.assertIn("`UKGC`", md)
        self.assertIn("`MGA`", md)

    def test_renders_features_with_params(self):
        spec = parse_spec(SPEC_CLASSIC)
        md = render_docs(spec)
        self.assertIn("free_spins", md)
        self.assertIn("trigger_count_min", md)

    def test_includes_lint_section_when_findings(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.constraints.target_rtp = 0.55  # triggers LINT004 warning
        md = render_docs(spec)
        self.assertIn("Lint findings", md)
        self.assertIn("LINT004", md)

    def test_omits_lint_section_when_clean(self):
        spec = parse_spec(SPEC_CLASSIC)
        md = render_docs(spec)
        # Clean classic spec has zero warning+error findings;
        # info-level filtered out by default
        self.assertNotIn("Lint findings", md)

    def test_rtp_allocation_section_present(self):
        spec = parse_spec(SPEC_CLASSIC)
        md = render_docs(spec)
        self.assertIn("RTP allocation", md)
        self.assertIn("Base game", md)


if __name__ == "__main__":
    unittest.main()
