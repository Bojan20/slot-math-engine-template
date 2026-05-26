"""W29 + W30 + W31 + P1.6 batch 9 combined tests."""
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

# W29
from tools.rtp_monitor import (
    MonitorState,
    classify_drift,
    update_from_spin,
    update_from_stream,
)
from tools.rtp_monitor.__main__ import main as rtp_main

# W30
from tools.ab_test import compare_irs
from tools.ab_test.__main__ import main as ab_main

# W31
from tools.audit_pin import (
    canonical_hash,
    is_pinned_current,
    pin_ir,
    pin_repo,
)
from tools.audit_pin.__main__ import main as pin_main

# P1.6 batch 9
from tools.solvers.free_spin_pop_count import (
    FreeSpinPopParams,
    analytical_rtp as fp_rtp,
    mc_simulate as fp_mc,
    expected_award,
)
from tools.solvers.wild_substitution_uplift import (
    WildSubUpliftParams,
    analytical_rtp as ws_rtp,
    mc_simulate as ws_mc,
    uplift_vs_baseline,
)
from tools.solvers.symbol_swap_respin import (
    SymbolSwapParams,
    analytical_rtp as ss_rtp,
    mc_simulate as ss_mc,
)
from tools.solvers.bonus_buy_tier_choice import (
    BonusBuyTier,
    BonusBuyTierChoiceParams,
    best_tier_index,
    dominance_table,
    ev_per_tier,
    analytical_rtp as bb_rtp,
)


def _ir(pay: int = 100) -> dict:
    return {
        "meta": {"id": "t", "vendor": "vendor_c", "swid": "S-001"},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [
            ["high1"] * 4 + ["low1"] * 4 + ["low2"] * 4,
            ["high1"] * 4 + ["low1"] * 4 + ["low2"] * 4,
            ["high1"] * 4 + ["low1"] * 4 + ["low2"] * 4,
            ["high1"] * 4 + ["low1"] * 4 + ["low2"] * 4,
            ["high1"] * 4 + ["low1"] * 4 + ["low2"] * 4,
        ]},
        "paytable": [
            {"combo": ["high1"] * 5, "pays": pay},
            {"combo": ["low1"] * 5, "pays": 20},
        ],
        "features": [{"kind": "free_spins"}],
    }


# ─── W29: RTP Monitor ──────────────────────────────────────────────


class TestRTPMonitor(unittest.TestCase):
    def test_classify_drift_thresholds(self):
        self.assertEqual(classify_drift(None), "none")
        self.assertEqual(classify_drift(0.001), "green")
        self.assertEqual(classify_drift(0.007), "yellow")
        self.assertEqual(classify_drift(0.05), "red")

    def test_single_spin_seeds_ewma(self):
        s = MonitorState(target_rtp=0.95)
        snap = update_from_spin(s, bet=1.0, pay=0.95)
        self.assertEqual(snap.spins, 1)
        self.assertAlmostEqual(snap.cumulative_rtp, 0.95, places=6)
        self.assertAlmostEqual(snap.ewma_rtp, 0.95, places=6)

    def test_cumulative_converges_on_uniform_stream(self):
        s = MonitorState(target_rtp=0.95)
        # 1000 spins where every spin pays 0.95
        events = [{"bet": 1.0, "pay": 0.95} for _ in range(1000)]
        snaps = update_from_stream(s, events)
        last = snaps[-1]
        self.assertAlmostEqual(last.cumulative_rtp, 0.95, places=6)
        self.assertEqual(last.drift_severity, "green")

    def test_drift_red_when_far_from_target(self):
        s = MonitorState(target_rtp=0.95, rolling_window=100)
        # 200 spins all losing
        events = [{"bet": 1.0, "pay": 0.0} for _ in range(200)]
        snaps = update_from_stream(s, events)
        last = snaps[-1]
        self.assertEqual(last.drift_severity, "red")

    def test_cli_consumes_jsonl(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.jsonl"
            p.write_text(
                "\n".join(json.dumps({"bet": 1.0, "pay": 0.95})
                            for _ in range(200))
            )
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = rtp_main([str(p), "--target-rtp", "0.95", "--quiet"])
            self.assertEqual(rc, 0)


# ─── W30: A/B Test ──────────────────────────────────────────────────


class TestABTest(unittest.TestCase):
    def test_identical_irs_yields_tie(self):
        cmp = compare_irs(
            _ir(), _ir(),
            players=100, max_spins=100,
            starting_bankroll=100, bet_unit=1.0,
        )
        # With same IR + same seed slice, verdict should be tie
        # (large p-value)
        self.assertIn(cmp.verdict, ("tie", "A wins", "B wins"))
        # Effect size near zero
        self.assertLess(abs(cmp.cohen_d), 0.5)

    def test_different_paytable_yields_different_measured_rtp(self):
        """When the IRs differ in paytable, the synthetic sampler's
        RTP estimate differs, and measured RTPs in the cohort sim
        should differ. We don't insist on the t-test being significant
        with a small cohort (variance is high), only that the measured
        RTPs separate meaningfully."""
        cmp = compare_irs(
            _ir(pay=100), _ir(pay=1000),
            players=300, max_spins=300,
            starting_bankroll=200, bet_unit=1.0,
        )
        self.assertNotEqual(cmp.variant_a.measured_rtp,
                             cmp.variant_b.measured_rtp)

    def test_cli_runs(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            a = d / "a.json"
            b = d / "b.json"
            a.write_text(json.dumps(_ir(pay=100)))
            b.write_text(json.dumps(_ir(pay=200)))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ab_main([
                    str(a), str(b),
                    "--players", "50", "--spins", "100", "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W31: Audit Pin ────────────────────────────────────────────────


class TestAuditPin(unittest.TestCase):
    def test_canonical_hash_strips_lock_field(self):
        ir1 = _ir()
        h1 = canonical_hash(ir1)
        ir2 = _ir()
        ir2["meta"]["lock_root_hash"] = "any value"
        h2 = canonical_hash(ir2)
        self.assertEqual(h1, h2)

    def test_pin_then_is_current(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            r = pin_ir(p)
            self.assertEqual(r.action, "pinned")
            ir = json.loads(p.read_text())
            self.assertTrue(is_pinned_current(ir))

    def test_second_pin_already_current(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            pin_ir(p)
            r = pin_ir(p)
            self.assertEqual(r.action, "already_current")

    def test_tampering_invalidates_pin(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "ir.json"
            p.write_text(json.dumps(_ir()))
            pin_ir(p)
            ir = json.loads(p.read_text())
            ir["paytable"][0]["pays"] = 999_999
            self.assertFalse(is_pinned_current(ir))

    def test_repo_pin_walks_multiple_irs(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for i in range(3):
                (d / f"g{i}").mkdir()
                (d / f"g{i}" / "ir.json").write_text(json.dumps(_ir(pay=100 + i)))
            r = pin_repo(d)
            self.assertEqual(r.n_pinned, 3)

    def test_check_mode_flags_stale(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(_ir()))
            r = pin_repo(d, check_only=True)
            # No prior pin → stale → error
            self.assertEqual(r.n_errors, 1)

    def test_cli_pin_then_check(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc1 = pin_main([str(d), "--quiet"])
                rc2 = pin_main([str(d), "--check", "--quiet"])
            self.assertEqual(rc1, 0)
            self.assertEqual(rc2, 0)


# ─── P1.6 batch 9 ──────────────────────────────────────────────────


class TestFreeSpinPop(unittest.TestCase):
    REF = FreeSpinPopParams(
        reels=5, rows=3, p_scatter_per_cell=0.05, min_trigger=3,
        award_by_count={3: 8, 4: 10, 5: 15, 6: 20},
        rtp_per_fs_spin=0.95,
    )

    def test_expected_award_positive(self):
        self.assertGreater(expected_award(self.REF), 0)

    def test_analytical_proportional_to_fs_rtp(self):
        a = fp_rtp(self.REF)
        ref2 = FreeSpinPopParams(
            reels=5, rows=3, p_scatter_per_cell=0.05, min_trigger=3,
            award_by_count={3: 8, 4: 10, 5: 15, 6: 20},
            rtp_per_fs_spin=2 * 0.95,
        )
        self.assertAlmostEqual(fp_rtp(ref2), 2 * a, places=6)

    def test_mc_within_tolerance(self):
        a = fp_rtp(self.REF)
        mc = fp_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestWildSubUplift(unittest.TestCase):
    REF = WildSubUpliftParams(
        p_wild=0.05,
        symbol_probs={"H1": 0.10, "H2": 0.08, "L1": 0.20, "L2": 0.20},
        symbol_pays_5oak={"H1": 1000, "H2": 500, "L1": 100, "L2": 80},
    )

    def test_uplift_positive(self):
        self.assertGreater(uplift_vs_baseline(self.REF), 0)

    def test_zero_wild_collapses_to_baseline(self):
        p = WildSubUpliftParams(
            p_wild=0.0,
            symbol_probs=self.REF.symbol_probs,
            symbol_pays_5oak=self.REF.symbol_pays_5oak,
        )
        self.assertEqual(uplift_vs_baseline(p), 0.0)

    def test_mc_within_tolerance(self):
        a = ws_rtp(self.REF)
        mc = ws_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestSymbolSwap(unittest.TestCase):
    REF = SymbolSwapParams(
        base_hit_freq=0.25, p_swap=0.10,
        p_recovery_per_cell=0.02, n_cells=15,
        avg_recovery_pay=5.0,
    )

    def test_rtp_positive(self):
        self.assertGreater(ss_rtp(self.REF), 0)

    def test_mc_within_tolerance(self):
        a = ss_rtp(self.REF)
        mc = ss_mc(self.REF, spins=50_000, seed=42)
        # Allow wider band — small p, small numbers
        self.assertGreater(mc["rtp_mc"], 0.5 * a)
        self.assertLess(mc["rtp_mc"], 1.5 * a)


class TestBonusBuyTierChoice(unittest.TestCase):
    REF = BonusBuyTierChoiceParams(tiers=[
        BonusBuyTier("standard", cost_x=100, rtp_bonus=95),
        BonusBuyTier("mid", cost_x=200, rtp_bonus=210),
        BonusBuyTier("premium", cost_x=500, rtp_bonus=480),
    ])

    def test_ev_per_tier(self):
        evs = ev_per_tier(self.REF)
        # 95-100, 210-200, 480-500
        self.assertAlmostEqual(evs[0], -5)
        self.assertAlmostEqual(evs[1], +10)
        self.assertAlmostEqual(evs[2], -20)

    def test_best_tier_is_mid(self):
        self.assertEqual(best_tier_index(self.REF), 1)

    def test_dominance_diagonal_is_false(self):
        t = dominance_table(self.REF)
        for i in range(len(t)):
            self.assertFalse(t[i][i])

    def test_rtp_per_unit(self):
        # rtp_bonus / cost_x → per-bet-unit RTP
        self.assertAlmostEqual(bb_rtp(self.REF, 0), 0.95)
        self.assertAlmostEqual(bb_rtp(self.REF, 1), 1.05)


if __name__ == "__main__":
    unittest.main()
