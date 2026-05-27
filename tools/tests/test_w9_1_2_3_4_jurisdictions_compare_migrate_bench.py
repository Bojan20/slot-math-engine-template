"""W9.1-W9.4 — jurisdictions / compare / migrate / bench tests."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir,
    adapt_spec_for_jurisdiction, adapt_for_all, list_jurisdictions,
    render_variants_summary, JURISDICTION_REGISTRY,
    compare_specs, shared_jurisdictions, feature_overlap,
    migrate, current_schema_version, list_migrations, MigrationError,
    bench_corpus, BenchReport,
)


SPECS_DIR = ROOT / "tools" / "math_dsl" / "specs"
SPEC_CLASSIC = (SPECS_DIR / "example_classic_5x3.yaml").read_text()
SPEC_MEGAWAYS = (SPECS_DIR / "example_megaways.yaml").read_text()


# ─── W9.1 — Multi-jurisdiction ────────────────────────────────────


class TestJurisdictions(unittest.TestCase):
    def test_registry_complete(self):
        codes = list_jurisdictions()
        for required in ("UKGC", "MGA", "ADM", "DGOJ", "KSA"):
            self.assertIn(required, codes)
        for code, rules in JURISDICTION_REGISTRY.items():
            self.assertGreater(rules.rtp_min, 0.5)
            self.assertLess(rules.rtp_max, 1.0)
            self.assertLessEqual(rules.rtp_min, rules.rtp_max)

    def test_ukgc_clamps_rtp_up_to_min(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.constraints.target_rtp = 0.80  # below UKGC 0.85 min
        variant = adapt_spec_for_jurisdiction(spec, "UKGC")
        self.assertEqual(variant.spec.constraints.target_rtp, 0.85)
        self.assertGreaterEqual(len(variant.adaptations), 1)
        rtp_adapt = next(a for a in variant.adaptations
                         if "target_rtp" in a.field)
        self.assertEqual(rtp_adapt.after, 0.85)

    def test_adm_clamps_max_win(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.constraints.max_win_x = 100_000.0  # ADM cap is 30k
        variant = adapt_spec_for_jurisdiction(spec, "ADM")
        self.assertEqual(variant.spec.constraints.max_win_x, 30_000.0)

    def test_ir_includes_jurisdiction_overrides_block(self):
        spec = parse_spec(SPEC_CLASSIC)
        variant = adapt_spec_for_jurisdiction(spec, "UKGC")
        self.assertIn("jurisdiction_overrides", variant.ir)
        self.assertIn("UKGC", variant.ir["jurisdiction_overrides"])
        ovr = variant.ir["jurisdiction_overrides"]["UKGC"]
        self.assertTrue(ovr.get("autoplay_forbidden"))
        self.assertEqual(ovr["min_spin_time_ms"], 2500)

    def test_unknown_jurisdiction_passthrough(self):
        spec = parse_spec(SPEC_CLASSIC)
        variant = adapt_spec_for_jurisdiction(spec, "MARS")
        self.assertEqual(variant.code, "MARS")
        # Just adds MARS to the list, no other mutations
        self.assertIn("MARS", variant.spec.constraints.jurisdictions)

    def test_adapt_for_all_uses_spec_jurisdictions(self):
        spec = parse_spec(SPEC_CLASSIC)
        variants = adapt_for_all(spec)
        # SPEC_CLASSIC declares [UKGC, MGA, ADM]
        self.assertEqual(set(variants.keys()), {"UKGC", "MGA", "ADM"})

    def test_render_summary_table(self):
        spec = parse_spec(SPEC_CLASSIC)
        variants = adapt_for_all(spec, ["UKGC", "MGA", "ADM"])
        text = render_variants_summary(variants)
        for code in ("UKGC", "MGA", "ADM"):
            self.assertIn(code, text)

    def test_ksa_92pct_rtp_floor(self):
        spec = parse_spec(SPEC_CLASSIC)
        spec.constraints.target_rtp = 0.90
        variant = adapt_spec_for_jurisdiction(spec, "KSA")
        self.assertGreaterEqual(variant.spec.constraints.target_rtp, 0.925)


# ─── W9.2 — Compare matrix ────────────────────────────────────────


class TestCompareMatrix(unittest.TestCase):
    def test_compare_two_specs(self):
        a = parse_spec(SPEC_CLASSIC)
        b = parse_spec(SPEC_MEGAWAYS)
        matrix = compare_specs([a, b])
        self.assertEqual(matrix.n_specs, 2)
        text = matrix.render()
        self.assertIn("Crimson Tiger", text)
        self.assertIn("Lion Megaways", text)
        self.assertIn("Topology", text)

    def test_compare_all_4_sample_specs(self):
        specs = [parse_spec(p.read_text()) for p in sorted(SPECS_DIR.glob("*.yaml"))]
        matrix = compare_specs(specs)
        self.assertEqual(matrix.n_specs, 4)
        text = matrix.render()
        # All 4 spec names present in header
        for name in ("Crimson Tiger", "Lion Megaways", "Coral Cluster", "Cascade Quest"):
            self.assertIn(name, text)

    def test_shared_jurisdictions(self):
        specs = [parse_spec(p.read_text()) for p in sorted(SPECS_DIR.glob("*.yaml"))]
        shared = shared_jurisdictions(specs)
        # All 4 share at least UKGC + MGA
        self.assertIn("UKGC", shared)
        self.assertIn("MGA", shared)

    def test_feature_overlap_matrix(self):
        a = parse_spec(SPEC_CLASSIC)    # has free_spins
        b = parse_spec(SPEC_MEGAWAYS)   # has free_spins + mystery + progressive
        overlap = feature_overlap([a, b])
        self.assertIn("free_spins", overlap)
        # free_spins present in both
        self.assertEqual(overlap["free_spins"], [True, True])
        # linear_progressive only in megaways
        self.assertEqual(overlap["linear_progressive"], [False, True])

    def test_empty_compare(self):
        matrix = compare_specs([])
        text = matrix.render()
        self.assertIn("no specs", text.lower())


# ─── W9.3 — Migration ────────────────────────────────────────────


class TestMigration(unittest.TestCase):
    def test_current_version_string(self):
        v = current_schema_version()
        self.assertRegex(v, r"^\d+\.\d+\.\d+$")

    def test_migrate_0_0_0_to_current(self):
        raw = {"meta": {"name": "Legacy"}}  # no schema_version
        migrated = migrate(raw)
        self.assertEqual(migrated["schema_version"], current_schema_version())
        self.assertIn("_migrated_steps", migrated)

    def test_migrate_promotes_vendor_id(self):
        raw = {
            "schema_version": "1.0.0",
            "meta": {"name": "X"},
            "vendor_id": "studio-legacy",
        }
        migrated = migrate(raw, target_version="1.1.0")
        self.assertEqual(migrated["meta"]["vendor"], "studio-legacy")
        self.assertNotIn("vendor_id", migrated)

    def test_migrate_uppercases_jurisdictions(self):
        raw = {
            "schema_version": "1.0.0",
            "meta": {"name": "X"},
            "constraints": {"jurisdictions": ["ukgc", "mga", "adm"]},
        }
        migrated = migrate(raw, target_version="1.1.0")
        self.assertEqual(
            migrated["constraints"]["jurisdictions"], ["UKGC", "MGA", "ADM"],
        )

    def test_migrate_idempotent_at_current(self):
        raw = {"schema_version": current_schema_version(), "meta": {"name": "X"}}
        migrated = migrate(raw)
        self.assertEqual(migrated["schema_version"], current_schema_version())

    def test_cannot_downgrade(self):
        raw = {"schema_version": "9.9.9", "meta": {"name": "X"}}
        with self.assertRaises(MigrationError):
            migrate(raw, target_version="1.0.0")

    def test_list_migrations_returns_descriptions(self):
        items = list_migrations()
        self.assertGreater(len(items), 0)
        for item in items:
            self.assertIn("→", item)


# ─── W9.4 — Bench ────────────────────────────────────────────────


class TestBench(unittest.TestCase):
    def test_bench_corpus_emits_entries(self):
        report = bench_corpus(SPECS_DIR, repeats=1, include_mc=False)
        self.assertIsInstance(report, BenchReport)
        self.assertEqual(len(report.entries), 4)
        for e in report.entries:
            self.assertGreater(e.parse_ms, 0)
            self.assertGreater(e.compile_ms, 0)
            self.assertGreater(e.synth_c1_ms, 0)

    def test_bench_summary_markdown(self):
        report = bench_corpus(SPECS_DIR, repeats=1, include_mc=False)
        text = report.summary()
        self.assertIn("Performance benchmark", text)
        self.assertIn("parse", text)
        self.assertIn("compile", text)
        self.assertIn("synth C-1", text)

    def test_bench_median_across_specs(self):
        report = bench_corpus(SPECS_DIR, repeats=1, include_mc=False)
        med_parse = report.median_across_specs("parse_ms")
        med_compile = report.median_across_specs("compile_ms")
        self.assertGreater(med_parse, 0)
        self.assertGreater(med_compile, 0)


if __name__ == "__main__":
    unittest.main()
