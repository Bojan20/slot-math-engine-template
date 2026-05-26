"""W38 + W39 + W40 + P1.6 batch 12 combined tests."""
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

# W38
from tools.regulator_export import export_game, ExportManifest
from tools.regulator_export.__main__ import main as export_main

# W39
from tools.portfolio_compare import compare, summarize_ir, render_markdown
from tools.portfolio_compare.__main__ import main as portfolio_main

# W40
from tools.volatility_classifier import (
    VolTier,
    classify,
    classify_from_samples,
)
from tools.volatility_classifier.__main__ import main as vol_main

# P1.6 batch 12
from tools.solvers.megaways_cascade_compound import (
    MegawaysCascadeParams,
    analytical_rtp as mw_rtp,
    mc_simulate as mw_mc,
    expected_cascades,
)
from tools.solvers.wheel_segments_weighted_pick import (
    WheelSegmentsParams,
    analytical_rtp as ws_rtp,
    mc_simulate as ws_mc,
)
from tools.solvers.skill_bonus_completion import (
    SkillBonusParams,
    analytical_rtp as sb_rtp,
    mc_simulate as sb_mc,
    expected_payout_per_trigger,
)
from tools.solvers.expanding_symbol_reel import (
    ExpandingSymbolParams,
    analytical_rtp as es_rtp,
    mc_simulate as es_mc,
    prob_line,
)


def _ir(*, game_id: str = "g1", target_rtp: float = 0.96,
         vendor: str = "vendor_c", pay: int = 100) -> dict:
    return {
        "meta": {
            "id": game_id, "vendor": vendor, "swid": f"S-{game_id}",
            "target_rtp": target_rtp, "volatility": "medium",
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A"] * 4 for _ in range(5)]},
        "paytable": [
            {"combo": ["A"] * 5, "pays": pay},
            {"combo": ["B"] * 5, "pays": 20},
        ],
        "features": [{"kind": "free_spins"}, {"kind": "wild_expand"}],
    }


# ─── W38: Regulator Export Package ─────────────────────────────────


class TestRegulatorExport(unittest.TestCase):
    def test_export_minimal_ir(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            manifest = export_game(_ir(), out_dir=d)
            self.assertEqual(manifest.game_id, "g1")
            # at minimum: IR + sha256 + manifest
            names = {e.name for e in manifest.entries}
            self.assertIn("g1_ir.json", names)
            self.assertIn("g1_ir.sha256.txt", names)
            self.assertTrue((d / "manifest.json").exists())

    def test_export_with_math_doc(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            manifest = export_game(
                _ir(), out_dir=d,
                math_doc_text="# math doc\n\nTarget RTP: 96.00%\n",
            )
            names = {e.name for e in manifest.entries}
            self.assertIn("g1_math_doc.md", names)

    def test_export_with_truth_check_and_extras(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            manifest = export_game(
                _ir(), out_dir=d,
                truth_check={"closed_form_rtp": 0.9603, "mc_rtp": 0.9598},
                extra_files={"extra.txt": b"hello"},
            )
            names = {e.name for e in manifest.entries}
            self.assertIn("g1_truth_check.json", names)
            self.assertIn("extra.txt", names)

    def test_cli_export(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            ir_p.write_text(json.dumps(_ir()))
            out_d = d / "out"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = export_main([
                    "--ir", str(ir_p),
                    "--out", str(out_d),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)
            self.assertTrue((out_d / "manifest.json").exists())

    def test_manifest_hashes_match_files(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            manifest = export_game(_ir(), out_dir=d)
            for entry in manifest.entries:
                actual = hashlib.sha256(
                    (d / entry.rel_path).read_bytes()
                ).hexdigest()
                self.assertEqual(actual, entry.sha256)


# ─── W39: Portfolio Comparator ─────────────────────────────────────


class TestPortfolioCompare(unittest.TestCase):
    def test_summarize_ir(self):
        s = summarize_ir(_ir(game_id="g2", target_rtp=0.95))
        self.assertEqual(s.game_id, "g2")
        self.assertEqual(s.paytable_rows, 2)
        self.assertEqual(s.feature_kinds, ["free_spins", "wild_expand"])

    def test_compare_aggregates_vendor_breakdown(self):
        irs = [
            _ir(game_id="g1", vendor="vendor_a"),
            _ir(game_id="g2", vendor="vendor_a"),
            _ir(game_id="g3", vendor="vendor_b"),
        ]
        r = compare(irs)
        self.assertEqual(r.n_games, 3)
        self.assertEqual(r.vendor_breakdown["vendor_a"], 2)
        self.assertEqual(r.vendor_breakdown["vendor_b"], 1)

    def test_rtp_range(self):
        irs = [
            _ir(game_id="g1", target_rtp=0.92),
            _ir(game_id="g2", target_rtp=0.97),
        ]
        r = compare(irs)
        self.assertEqual(r.rtp_range, (0.92, 0.97))

    def test_feature_universe(self):
        ir1 = _ir(game_id="g1")
        ir2 = _ir(game_id="g2")
        ir2["features"] = [{"kind": "hold_and_win"}]
        r = compare([ir1, ir2])
        self.assertEqual(
            set(r.feature_universe),
            {"free_spins", "wild_expand", "hold_and_win"},
        )

    def test_markdown_render(self):
        r = compare([_ir(game_id="g1"), _ir(game_id="g2")])
        md = render_markdown(r)
        self.assertIn("# Portfolio Comparator", md)
        self.assertIn("`g1`", md)
        self.assertIn("`g2`", md)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p1 = d / "g1.json"
            p2 = d / "g2.json"
            p1.write_text(json.dumps(_ir(game_id="g1")))
            p2.write_text(json.dumps(_ir(game_id="g2")))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = portfolio_main([str(p1), str(p2), "--quiet"])
            self.assertEqual(rc, 0)


# ─── W40: Volatility Classifier ────────────────────────────────────


class TestVolatilityClassifier(unittest.TestCase):
    def test_low_volatility_below_1_5(self):
        r = classify(mean_pay=1.0, stddev_pay=1.0)
        self.assertEqual(r.tier, VolTier.LOW)

    def test_medium_volatility(self):
        r = classify(mean_pay=1.0, stddev_pay=2.0)
        self.assertEqual(r.tier, VolTier.MEDIUM)

    def test_high_volatility(self):
        r = classify(mean_pay=1.0, stddev_pay=4.0)
        self.assertEqual(r.tier, VolTier.HIGH)

    def test_extreme_volatility(self):
        r = classify(mean_pay=1.0, stddev_pay=10.0)
        self.assertEqual(r.tier, VolTier.EXTREME)

    def test_invalid_inputs_yield_unknown(self):
        r = classify(mean_pay=0.0, stddev_pay=1.0)
        self.assertEqual(r.tier, VolTier.UNKNOWN)

    def test_from_samples_empty(self):
        r = classify_from_samples([])
        self.assertEqual(r.tier, VolTier.UNKNOWN)

    def test_from_samples_constant(self):
        r = classify_from_samples([5.0, 5.0, 5.0, 5.0])
        self.assertEqual(r.tier, VolTier.LOW)
        self.assertEqual(r.cv, 0.0)

    def test_cli_with_expected_tier(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            samples = d / "samples.txt"
            samples.write_text("\n".join(str(x) for x in [0.0]*90 + [10.0]*10))
            buf = io.StringIO()
            with redirect_stdout(buf):
                # mean=1, var ≈ 9 → stddev=3 → CV=3 → HIGH
                rc = vol_main([
                    "--samples", str(samples),
                    "--expected-tier", "high",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── P1.6 batch 12 ─────────────────────────────────────────────────


class TestMegawaysCascade(unittest.TestCase):
    REF = MegawaysCascadeParams(
        ways_initial=1000, p_cascade=0.4, q_ways_shrink=0.7,
        pay_per_way=0.01, max_cascades=50,
    )

    def test_expected_cascades_geometric(self):
        # p=0.5, large cap → ~ 1/(1-0.5) = 2
        n = expected_cascades(0.5, 100)
        self.assertAlmostEqual(n, 2.0, places=4)

    def test_rtp_positive(self):
        self.assertGreater(mw_rtp(self.REF), 0)

    def test_mc_within_tolerance(self):
        a = mw_rtp(self.REF)
        mc = mw_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # Cascade compound has higher variance; widen band
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestWheelSegments(unittest.TestCase):
    REF = WheelSegmentsParams(
        p_trigger=0.10,
        segment_weights=[50, 30, 15, 4, 1],
        segment_values=[1.0, 2.0, 5.0, 10.0, 50.0],
        n_spins=1,
    )

    def test_rtp_positive(self):
        self.assertGreater(ws_rtp(self.REF), 0)

    def test_multi_spin_multiplies(self):
        single = ws_rtp(self.REF)
        multi = ws_rtp(WheelSegmentsParams(
            p_trigger=0.10,
            segment_weights=self.REF.segment_weights,
            segment_values=self.REF.segment_values,
            n_spins=3,
        ))
        self.assertAlmostEqual(multi, 3 * single, places=6)

    def test_mc_within_tolerance(self):
        a = ws_rtp(self.REF)
        mc = ws_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestSkillBonus(unittest.TestCase):
    REF = SkillBonusParams(
        p_trigger=0.05, p_success=0.6, n_stages=3,
        stage_pays=[0.0, 10.0, 30.0, 100.0],
    )

    def test_per_trigger_sums_pmf(self):
        v = expected_payout_per_trigger(self.REF)
        self.assertGreater(v, 0)

    def test_zero_success_yields_stage_0_pay(self):
        p = SkillBonusParams(
            p_trigger=0.05, p_success=0.0, n_stages=3,
            stage_pays=[5.0, 10.0, 30.0, 100.0],
        )
        # always 0 successes → always 5.0
        self.assertAlmostEqual(expected_payout_per_trigger(p), 5.0)

    def test_mc_within_tolerance(self):
        a = sb_rtp(self.REF)
        mc = sb_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestExpandingSymbol(unittest.TestCase):
    REF = ExpandingSymbolParams(
        reels=5, p_symbol_on_reel=0.15,
        min_reels_for_line=3, pay_5oak=50.0,
    )

    def test_prob_line_bounded(self):
        p = prob_line(self.REF)
        self.assertGreater(p, 0)
        self.assertLess(p, 1)

    def test_min_zero_certain(self):
        p = ExpandingSymbolParams(
            reels=5, p_symbol_on_reel=0.15,
            min_reels_for_line=0, pay_5oak=50.0,
        )
        self.assertAlmostEqual(prob_line(p), 1.0)

    def test_min_above_reels_impossible(self):
        p = ExpandingSymbolParams(
            reels=5, p_symbol_on_reel=0.15,
            min_reels_for_line=10, pay_5oak=50.0,
        )
        self.assertAlmostEqual(prob_line(p), 0.0)

    def test_mc_within_tolerance(self):
        a = es_rtp(self.REF)
        mc = es_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


if __name__ == "__main__":
    unittest.main()
