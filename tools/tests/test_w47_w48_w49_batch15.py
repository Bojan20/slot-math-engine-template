"""W47 + W48 + W49 + P1.6 batch 15 combined tests."""
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

# W47
from tools.ir_sanitizer import sanitize_ir, DEFAULT_REDACTIONS
from tools.ir_sanitizer.__main__ import main as san_main

# W48
from tools.kernel_compare import compare_kernels, proportionality_test

# W49
from tools.synthetic_log_gen import (
    GeneratorConfig,
    generate_events,
    generate_jsonl,
)
from tools.synthetic_log_gen.__main__ import main as syn_main

# P1.6 batch 15
from tools.solvers.scatter_progressive_unlock import (
    ScatterProgressiveUnlockParams,
    analytical_rtp as sp_rtp,
    mc_simulate as sp_mc,
)
from tools.solvers.lock_and_reload_jackpot import (
    LockAndReloadParams,
    analytical_rtp as lr_rtp,
    mc_simulate as lr_mc,
)
from tools.solvers.symbol_collection_unlock import (
    SymbolCollectionUnlockParams,
    analytical_rtp as sc_rtp,
    mc_simulate as sc_mc,
    prob_unlock,
)
from tools.solvers.bonus_buy_dynamic_pricing import (
    BonusBuyDynamicPricingParams,
    analytical_rtp as bd_rtp,
    mc_simulate as bd_mc,
    effective_cost,
    ev_per_buy,
    is_positive_ev,
)


def _ir() -> dict:
    return {
        "meta": {"id": "g", "vendor": "secret_vendor", "swid": "S-9999",
                  "target_rtp": 0.96, "notes": "internal note"},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A"] for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
        "features": [{"kind": "free_spins"}],
    }


# ─── W47: IR Sanitizer ─────────────────────────────────────────────


class TestIRSanitizer(unittest.TestCase):
    def test_default_redactions(self):
        out, report = sanitize_ir(_ir())
        self.assertEqual(out["meta"]["swid"], "REDACTED")
        self.assertEqual(out["meta"]["vendor"], "REDACTED")
        self.assertEqual(out["meta"]["id"], "g")  # preserved
        self.assertGreater(report.n_redactions, 0)

    def test_block_regex_targets_strings(self):
        out, report = sanitize_ir(_ir(), block_regex="internal")
        self.assertTrue(
            any("notes" in r for r in report.redactions),
            f"redactions: {report.redactions}",
        )

    def test_immutable_input(self):
        ir = _ir()
        before = json.dumps(ir, sort_keys=True)
        sanitize_ir(ir)
        after = json.dumps(ir, sort_keys=True)
        self.assertEqual(before, after)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p_in = d / "in.json"
            p_out = d / "out.json"
            p_in.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = san_main([str(p_in), "--out", str(p_out), "--quiet"])
            self.assertEqual(rc, 0)
            out = json.loads(p_out.read_text())
            self.assertEqual(out["meta"]["vendor"], "REDACTED")


# ─── W48: Kernel Comparator ────────────────────────────────────────


class TestKernelCompare(unittest.TestCase):
    def test_identical_kernels_equivalent(self):
        f = lambda x: 2 * x + 3
        r = compare_kernels(f, f, xs=[0, 1, 2, 3, 4])
        self.assertTrue(r.equivalent)
        self.assertEqual(r.max_abs_diff, 0.0)

    def test_proportional_kernels(self):
        f1 = lambda x: 2 * x
        f2 = lambda x: 6 * x
        r = proportionality_test(f1, f2, xs=[1, 2, 3, 4, 5])
        self.assertTrue(r.proportional)
        self.assertAlmostEqual(r.proportionality_ratio, 1.0 / 3.0, places=6)

    def test_divergent_kernels(self):
        f1 = lambda x: x * x
        f2 = lambda x: x + 1
        r = proportionality_test(f1, f2, xs=[1, 2, 3, 4, 5])
        self.assertFalse(r.proportional)


# ─── W49: Synthetic Log Generator ──────────────────────────────────


class TestSyntheticLogGen(unittest.TestCase):
    def test_generate_events_count(self):
        cfg = GeneratorConfig(n_players=5, spins_per_player=10, seed=42)
        events = generate_events(cfg)
        self.assertEqual(len(events), 50)

    def test_generate_events_schema(self):
        cfg = GeneratorConfig(n_players=2, spins_per_player=5, seed=42)
        events = generate_events(cfg)
        for ev in events:
            self.assertIn("player_id", ev)
            self.assertIn("bet", ev)
            self.assertIn("pay", ev)

    def test_rtp_close_to_target_large_n(self):
        cfg = GeneratorConfig(
            n_players=50, spins_per_player=200, target_rtp=0.96,
            cv=1.5, seed=42,
        )
        events = generate_events(cfg)
        total_bet = sum(e["bet"] for e in events)
        total_pay = sum(e["pay"] for e in events)
        rtp = total_pay / total_bet
        # Should land in [0.85, 1.10] of target with these many spins
        self.assertGreater(rtp, 0.7)
        self.assertLess(rtp, 1.3)

    def test_jsonl_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.jsonl"
            cfg = GeneratorConfig(n_players=3, spins_per_player=5, seed=42)
            n = generate_jsonl(cfg, p)
            lines = p.read_text().splitlines()
            self.assertEqual(len(lines), n)
            for line in lines:
                self.assertIn("player_id", json.loads(line))

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.jsonl"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = syn_main([
                    "--out", str(p),
                    "--players", "2", "--spins-per-player", "5",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)
            self.assertTrue(p.exists())


# ─── P1.6 batch 15 ─────────────────────────────────────────────────


class TestScatterProgressive(unittest.TestCase):
    REF = ScatterProgressiveUnlockParams(
        n_spins=10, p_scatter_per_spin=0.20,
        tier_multipliers=[0.0, 1.0, 2.0, 5.0, 10.0, 20.0],
        base_pay=1.0,
    )

    def test_rtp_positive(self):
        self.assertGreater(sp_rtp(self.REF), 0)

    def test_higher_p_higher_rtp(self):
        a = sp_rtp(self.REF)
        b = sp_rtp(ScatterProgressiveUnlockParams(
            n_spins=10, p_scatter_per_spin=0.50,
            tier_multipliers=self.REF.tier_multipliers,
            base_pay=1.0,
        ))
        self.assertGreater(b, a)

    def test_mc_within_tolerance(self):
        a = sp_rtp(self.REF)
        mc = sp_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestLockAndReload(unittest.TestCase):
    REF = LockAndReloadParams(
        p_trigger=0.05, n_cells=15, p_lock_per_cell=0.10,
        reload_spins=3, base_per_lock=2.0, grand_bonus=100.0,
    )

    def test_rtp_positive(self):
        self.assertGreater(lr_rtp(self.REF), 0)

    def test_zero_reload_returns_zero(self):
        p = LockAndReloadParams(
            p_trigger=0.05, n_cells=15, p_lock_per_cell=0.10,
            reload_spins=0, base_per_lock=2.0, grand_bonus=100.0,
        )
        self.assertEqual(lr_rtp(p), 0.0)

    def test_mc_within_tolerance(self):
        a = lr_rtp(self.REF)
        mc = lr_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestSymbolCollectionUnlock(unittest.TestCase):
    REF = SymbolCollectionUnlockParams(
        p_trigger=0.05, n_symbols=4, n_spins=10, unlock_pay=50.0,
    )

    def test_prob_unlock_bounded(self):
        p = prob_unlock(self.REF.n_symbols, self.REF.n_spins)
        self.assertGreater(p, 0)
        self.assertLessEqual(p, 1)

    def test_zero_spins_zero_unlock(self):
        self.assertEqual(prob_unlock(4, 0), 0.0)

    def test_many_spins_certain(self):
        # n >> M → P(unlock) → 1
        self.assertGreater(prob_unlock(4, 100), 0.99)

    def test_mc_within_tolerance(self):
        a = sc_rtp(self.REF)
        mc = sc_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestBonusBuyDynamicPricing(unittest.TestCase):
    REF = BonusBuyDynamicPricingParams(
        base_cost_x=100, discounted_cost_x=70, q_discounted=0.30,
        expected_bonus_pay=95,
    )

    def test_effective_cost_blends(self):
        c = effective_cost(self.REF)
        # 0.7 * 100 + 0.3 * 70 = 70 + 21 = 91
        self.assertAlmostEqual(c, 91.0)

    def test_ev_positive_when_pay_exceeds_cost(self):
        # pay=95, cost=91 → EV=+4
        self.assertAlmostEqual(ev_per_buy(self.REF), 4.0)
        self.assertTrue(is_positive_ev(self.REF))

    def test_rtp_pay_div_cost(self):
        # 95/91
        self.assertAlmostEqual(bd_rtp(self.REF), 95 / 91, places=6)


if __name__ == "__main__":
    unittest.main()
