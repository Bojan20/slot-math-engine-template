"""W44 + W45 + W46 + P1.6 batch 14 combined tests."""
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

# W44
from tools.backtest_runner import (
    JurisdictionSnapshot,
    backtest,
    check_against_rules,
)
from tools.backtest_runner.__main__ import main as bt_main

# W45
from tools.designer_lint import lint_ir, DEFAULT_RULES
from tools.designer_lint.__main__ import main as lint_main

# W46
from tools.bundle_verify import verify_bundle
from tools.bundle_verify.__main__ import main as bv_main
from tools.regulator_export import export_game

# P1.6 batch 14
from tools.solvers.tumble_streak_freezer import (
    TumbleFreezerParams,
    analytical_rtp as tf_rtp,
    mc_simulate as tf_mc,
    expected_wins,
)
from tools.solvers.multi_screen_sync_bonus import (
    MultiScreenSyncParams,
    analytical_rtp as mss_rtp,
    mc_simulate as mss_mc,
)
from tools.solvers.instant_win_scratch_pattern import (
    InstantWinScratchParams,
    analytical_rtp as iw_rtp,
    mc_simulate as iw_mc,
    prob_win,
)
from tools.solvers.wild_morph_chain import (
    WildMorphChainParams,
    analytical_rtp as wm_rtp,
    mc_simulate as wm_mc,
    expected_per_respin,
)


def _ir(*, target_rtp=0.96, vol="medium", features=None) -> dict:
    return {
        "meta": {"id": "g", "vendor": "vendor_c", "swid": "S",
                  "target_rtp": target_rtp, "volatility": vol},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A", "B"] for _ in range(5)]},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 100},
            {"combo": ["B"] * 5, "pays": 20},
        ],
        "features": features or [{"kind": "free_spins"}],
    }


# ─── W44: Backtest Runner ──────────────────────────────────────────


class TestBacktestRunner(unittest.TestCase):
    def test_check_rules_low_rtp_violation(self):
        issues = check_against_rules(_ir(target_rtp=0.80), {"min_rtp": 0.90})
        self.assertTrue(any("min_rtp" in i for i in issues))

    def test_check_rules_disallowed_feature(self):
        issues = check_against_rules(
            _ir(features=[{"kind": "autoplay_unlimited"}]),
            {"disallowed_features": ["autoplay_unlimited"]},
        )
        self.assertTrue(any("autoplay_unlimited" in i for i in issues))

    def test_check_rules_allowlist_excludes(self):
        issues = check_against_rules(
            _ir(features=[{"kind": "exotic_feature"}]),
            {"allowed_features": ["free_spins", "wild_expand"]},
        )
        self.assertTrue(any("exotic_feature" in i for i in issues))

    def test_volatility_cap(self):
        issues = check_against_rules(
            _ir(vol="extreme"),
            {"max_volatility": "high"},
        )
        self.assertTrue(any("volatility" in i for i in issues))

    def test_backtest_aggregates_per_snapshot(self):
        snaps = [
            JurisdictionSnapshot("2024-Q4", "UKGC", {"min_rtp": 0.90}),
            JurisdictionSnapshot("2025-Q1", "MGA", {"min_rtp": 0.95}),
        ]
        r = backtest(_ir(target_rtp=0.93), snaps)
        # Q4 OK, Q1 fail
        ok = [e for e in r.entries if e.passed]
        bad = [e for e in r.entries if not e.passed]
        self.assertEqual(len(ok), 1)
        self.assertEqual(len(bad), 1)

    def test_cli_pass(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            snap_p = d / "snaps.json"
            ir_p.write_text(json.dumps(_ir()))
            snap_p.write_text(json.dumps([
                {"snapshot_date": "2024-Q4", "jurisdiction": "UKGC",
                 "rules": {"min_rtp": 0.90}},
            ]))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = bt_main([
                    "--ir", str(ir_p), "--snapshots", str(snap_p),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W45: Designer Lint ────────────────────────────────────────────


class TestDesignerLint(unittest.TestCase):
    def test_default_ir_passes(self):
        r = lint_ir(_ir())
        self.assertTrue(r.passed)

    def test_missing_target_rtp_errors(self):
        ir = _ir()
        del ir["meta"]["target_rtp"]
        r = lint_ir(ir)
        self.assertFalse(r.passed)
        rules = {i.rule for i in r.issues}
        self.assertIn("target_rtp_present", rules)

    def test_out_of_range_rtp_errors(self):
        r = lint_ir(_ir(target_rtp=0.3))
        rules = {i.rule for i in r.issues}
        self.assertIn("target_rtp_in_range", rules)

    def test_duplicate_paytable_row_warning(self):
        ir = _ir()
        ir["paytable"].append({"combo": ["A"] * 5, "pays": 100})
        r = lint_ir(ir)
        rules = {i.rule for i in r.issues}
        self.assertIn("no_duplicate_paytable_rows", rules)

    def test_orphan_symbol_warning(self):
        ir = _ir()
        ir["paytable"].append({"combo": ["Z"] * 5, "pays": 999})
        r = lint_ir(ir)
        rules = {i.rule for i in r.issues}
        self.assertIn("no_orphan_symbols", rules)

    def test_volatility_label_unknown_warning(self):
        ir = _ir(vol="apocalyptic")
        r = lint_ir(ir)
        rules = {i.rule for i in r.issues}
        self.assertIn("volatility_label_known", rules)

    def test_duplicate_feature_kind_warning(self):
        ir = _ir(features=[{"kind": "free_spins"}, {"kind": "free_spins"}])
        r = lint_ir(ir)
        rules = {i.rule for i in r.issues}
        self.assertIn("feature_kinds_unique", rules)

    def test_cli_strict_fails_on_warning(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir = _ir()
            ir["paytable"].append({"combo": ["A"] * 5, "pays": 100})
            p = d / "ir.json"
            p.write_text(json.dumps(ir))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = lint_main([str(p), "--strict", "--quiet"])
            self.assertEqual(rc, 1)


# ─── W46: Bundle Verify ────────────────────────────────────────────


class TestBundleVerify(unittest.TestCase):
    def test_verify_intact_bundle(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            export_game(_ir(), out_dir=d)
            r = verify_bundle(d)
            self.assertTrue(r.passed)
            for e in r.entries:
                self.assertEqual(e.status, "ok")

    def test_verify_detects_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            export_game(_ir(), out_dir=d)
            # Tamper with one file
            ir_files = list(d.glob("*_ir.json"))
            ir_files[0].write_text("tampered")
            r = verify_bundle(d)
            self.assertFalse(r.passed)

    def test_verify_detects_missing(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            export_game(_ir(), out_dir=d)
            # Delete one file
            ir_files = list(d.glob("*_ir.json"))
            ir_files[0].unlink()
            r = verify_bundle(d)
            self.assertFalse(r.passed)
            statuses = {e.status for e in r.entries}
            self.assertIn("missing", statuses)

    def test_cli_pass(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            export_game(_ir(), out_dir=d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = bv_main([str(d), "--quiet"])
            self.assertEqual(rc, 0)


# ─── P1.6 batch 14 ─────────────────────────────────────────────────


class TestTumbleFreezer(unittest.TestCase):
    REF = TumbleFreezerParams(
        p_trigger=0.20, p_tumble=0.40, p_freeze_per_win=0.10,
        freeze_window=3, base_pay=1.0,
    )

    def test_expected_wins_formula(self):
        # p_tumble=0.5 → 1/(1-0.5) = 2
        self.assertAlmostEqual(expected_wins(0.5), 2.0)

    def test_rtp_positive(self):
        self.assertGreater(tf_rtp(self.REF), 0)

    def test_zero_trigger_zero_rtp(self):
        p = TumbleFreezerParams(
            p_trigger=0.0, p_tumble=0.40, p_freeze_per_win=0.10,
            freeze_window=3, base_pay=1.0,
        )
        self.assertEqual(tf_rtp(p), 0.0)


class TestMultiScreenSync(unittest.TestCase):
    REF = MultiScreenSyncParams(
        n_screens=3, p_align_per_screen=0.1, bonus_pay=1000.0,
    )

    def test_rtp_is_power(self):
        # 0.1^3 · 1000 = 1.0
        self.assertAlmostEqual(mss_rtp(self.REF), 1.0, places=6)

    def test_mc_within_tolerance(self):
        a = mss_rtp(self.REF)
        mc = mss_mc(self.REF, spins=200_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestInstantWinScratch(unittest.TestCase):
    REF = InstantWinScratchParams(
        n_cells=9, p_target=0.20, min_matches=3, pay_when_win=10.0,
    )

    def test_prob_win_bounded(self):
        p = prob_win(self.REF)
        self.assertGreater(p, 0)
        self.assertLess(p, 1)

    def test_min_zero_certain(self):
        p = InstantWinScratchParams(
            n_cells=9, p_target=0.20, min_matches=0, pay_when_win=10.0,
        )
        self.assertAlmostEqual(prob_win(p), 1.0)

    def test_mc_within_tolerance(self):
        a = iw_rtp(self.REF)
        mc = iw_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.95)
        self.assertLess(ratio, 1.05)


class TestWildMorphChain(unittest.TestCase):
    REF = WildMorphChainParams(
        p_spawn=0.10,
        transition_matrix=[
            [0.5, 0.3, 0.2],
            [0.2, 0.6, 0.2],
            [0.1, 0.3, 0.6],
        ],
        identity_pays=[10.0, 20.0, 50.0],
        n_respins=5,
    )

    def test_per_respin_positive(self):
        v = expected_per_respin(self.REF)
        self.assertGreater(v, 0)
        # Within range [min_pay, max_pay]
        self.assertGreater(v, 10.0)
        self.assertLess(v, 50.0)

    def test_invalid_matrix_raises(self):
        bad = WildMorphChainParams(
            p_spawn=0.10,
            transition_matrix=[[0.5, 0.6]],
            identity_pays=[1.0, 1.0],
            n_respins=1,
        )
        with self.assertRaises(ValueError):
            expected_per_respin(bad)

    def test_mc_within_tolerance(self):
        a = wm_rtp(self.REF)
        mc = wm_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        # 5-step truncation vs stationary — wider band acceptable
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


if __name__ == "__main__":
    unittest.main()
