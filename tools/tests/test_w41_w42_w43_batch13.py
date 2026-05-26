"""W41 + W42 + W43 + P1.6 batch 13 combined tests."""
from __future__ import annotations
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

# W41
from tools.feature_coverage import (
    FEATURE_KIND_TO_KERNEL,
    audit,
    audit_irs,
)
from tools.feature_coverage.__main__ import main as cov_main

# W42
from tools.release_notes import (
    parse_commits,
    render_markdown,
    ReleaseNotes,
)
from tools.release_notes.__main__ import main as rn_main

# W43
from tools.perf_budget import (
    BudgetEntry,
    measure,
    run_budget,
)
from tools.perf_budget.__main__ import main as perf_main

# P1.6 batch 13
from tools.solvers.jackpot_seed_growth import (
    JackpotSeedGrowthParams,
    analytical_rtp as jp_rtp,
    mc_simulate as jp_mc,
    expected_award,
)
from tools.solvers.sticky_respin_meter import (
    StickyRespinMeterParams,
    analytical_rtp as sr_rtp,
    mc_simulate as sr_mc,
)
from tools.solvers.walking_wild_persistence import (
    WalkingWildParams,
    analytical_rtp as ww_rtp,
    mc_simulate as ww_mc,
    expected_lifetime,
)
from tools.solvers.chain_combo_progressive import (
    ChainComboParams,
    analytical_rtp as cc_rtp,
    mc_simulate as cc_mc,
    expected_combo_sum,
)


def _ir(*, features=None, vendor: str = "vendor_c") -> dict:
    features = features or [{"kind": "free_spins"}, {"kind": "wild_expand"}]
    return {
        "meta": {"id": "g", "vendor": vendor, "swid": "S"},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A"] for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
        "features": features,
    }


# ─── W41: Feature Coverage Audit ───────────────────────────────────


class TestFeatureCoverage(unittest.TestCase):
    def test_audit_basic_coverage(self):
        irs = [
            _ir(features=[{"kind": "free_spins"}, {"kind": "wild_expand"}]),
            _ir(features=[{"kind": "cluster_pays"}]),
        ]
        r = audit_irs(irs)
        self.assertEqual(r.n_irs, 2)
        self.assertGreater(r.coverage_pct, 0.9)

    def test_uncovered_feature_flagged(self):
        irs = [
            _ir(features=[{"kind": "totally_unknown_feature"}]),
        ]
        r = audit_irs(irs)
        self.assertIn("totally_unknown_feature", r.uncovered_features)

    def test_per_vendor_coverage(self):
        irs = [
            _ir(vendor="vendor_a", features=[{"kind": "free_spins"}]),
            _ir(vendor="vendor_b", features=[{"kind": "wild_expand"}]),
        ]
        r = audit_irs(irs)
        self.assertIn("vendor_a", r.per_vendor_coverage)
        self.assertIn("vendor_b", r.per_vendor_coverage)

    def test_cli_passes_above_threshold(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "g.json"
            p.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = cov_main([str(p), "--min-coverage", "0.5", "--quiet"])
            self.assertEqual(rc, 0)

    def test_catalog_lookup_includes_recent_kernels(self):
        # Ensure feature kinds added in recent batches map correctly.
        self.assertIn("wild_walking", FEATURE_KIND_TO_KERNEL)
        self.assertIn("jackpot_seed_growth", FEATURE_KIND_TO_KERNEL)


# ─── W42: Release Notes ────────────────────────────────────────────


class TestReleaseNotes(unittest.TestCase):
    SAMPLE = [
        "abc1234 feat(W32): IR fuzzer",
        "def5678 fix(parser): handle empty paytable",
        "ghi9012 chore: bump deps",
        "jkl3456 feat!: breaking change to IR schema",
        "mno7890 not a conventional commit",
    ]

    def test_parses_conventional_commits(self):
        entries = parse_commits(self.SAMPLE)
        # 4 valid CC commits (the "not a conventional commit" should be skipped)
        self.assertEqual(len(entries), 4)

    def test_detects_breaking(self):
        entries = parse_commits(self.SAMPLE)
        breaking = [e for e in entries if e.breaking]
        self.assertEqual(len(breaking), 1)
        self.assertEqual(breaking[0].type, "feat")

    def test_render_markdown_groups_by_type(self):
        entries = parse_commits(self.SAMPLE)
        notes = ReleaseNotes(
            title="Test", version="0.2.0",
            entries=entries,
            stats={"tests": 826, "kernels": 55},
        )
        md = render_markdown(notes)
        self.assertIn("Test", md)
        self.assertIn("0.2.0", md)
        self.assertIn("✨ Features", md)
        self.assertIn("🐛 Fixes", md)
        self.assertIn("breaking", md.lower())

    def test_cli_runs(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = rn_main([
                    "--version", "test-0.0.1",
                    "--range", "HEAD~3..HEAD",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W43: Perf Budget ──────────────────────────────────────────────


class TestPerfBudget(unittest.TestCase):
    def test_measure_passes_when_under_budget(self):
        e = measure("noop", lambda: None, budget_ms=1000.0, reps=1)
        self.assertTrue(e.passed)

    def test_measure_fails_when_over_budget(self):
        import time
        e = measure(
            "slow",
            lambda: time.sleep(0.05),
            budget_ms=10.0, reps=1,
        )
        self.assertFalse(e.passed)

    def test_measure_records_error(self):
        def boom():
            raise RuntimeError("boom")
        e = measure("boom", boom, budget_ms=1000.0, reps=1)
        self.assertIsNotNone(e.error)
        self.assertFalse(e.passed)

    def test_report_aggregation(self):
        a = measure("a", lambda: None, budget_ms=1000.0)
        b = measure("b", lambda: None, budget_ms=1000.0)
        r = run_budget([a, b])
        self.assertTrue(r.passed)
        self.assertEqual(r.n_failed, 0)

    def test_cli_runs(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = perf_main(["--reps", "1", "--quiet"])
        # Default budgets are generous; expect pass
        self.assertEqual(rc, 0)


# ─── P1.6 batch 13 ─────────────────────────────────────────────────


class TestJackpotSeedGrowth(unittest.TestCase):
    REF = JackpotSeedGrowthParams(
        bet=1.0, bet_contribution_rate=0.02,
        p_jp_per_spin=0.0001, seed=1000.0,
    )

    def test_expected_award_includes_pool_growth(self):
        ea = expected_award(self.REF)
        # seed + 0.02 * 1 * 10000 = 1000 + 200 = 1200
        self.assertAlmostEqual(ea, 1200.0, places=4)

    def test_rtp_matches_pool_div_bet(self):
        # 0.0001 · 1200 / 1 = 0.12
        self.assertAlmostEqual(jp_rtp(self.REF), 0.12, places=4)

    def test_mc_within_tolerance(self):
        a = jp_rtp(self.REF)
        mc = jp_mc(self.REF, spins=100_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # 0.0001 hit rate → wide MC band acceptable
        self.assertGreater(ratio, 0.3)
        self.assertLess(ratio, 2.0)


class TestStickyRespinMeter(unittest.TestCase):
    REF = StickyRespinMeterParams(
        p_trigger=0.05, p_land_per_spin=0.20,
        respins_reset=3, pay_per_sticky=5.0,
        max_session_spins=200,
    )

    def test_rtp_positive(self):
        self.assertGreater(sr_rtp(self.REF), 0)

    def test_higher_p_land_higher_rtp(self):
        a = sr_rtp(self.REF)
        b = sr_rtp(StickyRespinMeterParams(
            p_trigger=0.05, p_land_per_spin=0.40,
            respins_reset=3, pay_per_sticky=5.0,
        ))
        self.assertGreater(b, a)

    def test_mc_within_tolerance(self):
        a = sr_rtp(self.REF)
        mc = sr_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Markov chain with truncation → looser band
        self.assertGreater(ratio, 0.70)
        self.assertLess(ratio, 1.30)


class TestWalkingWild(unittest.TestCase):
    REF = WalkingWildParams(
        reels=5, p_spawn=0.10, avg_contribution_per_spin=2.0,
    )

    def test_lifetime_formula(self):
        # reels=5 → (5+1)/2 = 3
        self.assertAlmostEqual(expected_lifetime(5), 3.0)

    def test_rtp_proportional(self):
        a = ww_rtp(self.REF)
        b = ww_rtp(WalkingWildParams(
            reels=5, p_spawn=0.20, avg_contribution_per_spin=2.0,
        ))
        self.assertAlmostEqual(b, 2 * a, places=6)

    def test_mc_within_tolerance(self):
        a = ww_rtp(self.REF)
        mc = ww_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestChainCombo(unittest.TestCase):
    REF = ChainComboParams(
        p_trigger=0.10, p_chain=0.50, combo_step=1.0,
        combo_cap=5.0, base_pay=2.0,
    )

    def test_combo_sum_finite_when_p_below_one(self):
        s = expected_combo_sum(0.5, 1.0, 5.0)
        # known series — should be a finite positive number
        self.assertGreater(s, 1.0)
        self.assertLess(s, 20.0)

    def test_constant_combo_collapses_to_geometric(self):
        s = expected_combo_sum(0.5, 0.0, 1.0)
        # constant combo=1, geometric sum → 1/(1-0.5) = 2
        self.assertAlmostEqual(s, 2.0, places=6)

    def test_mc_within_tolerance(self):
        a = cc_rtp(self.REF)
        mc = cc_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


if __name__ == "__main__":
    unittest.main()
