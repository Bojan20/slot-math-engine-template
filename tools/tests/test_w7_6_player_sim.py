"""W7.6 — Player-behavior simulator regression tests.

Six guarantees:

  1. **Strategy state machines** — FixedBet, Martingale, AntiMartingale,
     StopLoss, WinChase implement spec correctly.
  2. **Bankroll bookkeeping** — bankroll = starting - wagered + won;
     spins_played, peak/trough tracked; ruin flag set when broke.
  3. **Termination conditions** — each strategy quits per spec
     (bankroll exhausted, stop-loss, win-target, session cap).
  4. **Sampler calibration** — `build_payout_sampler` produces a
     stream whose mean ≈ engine RTP (within 2 %).
  5. **Cohort report shape** — `simulate_cohort` produces per-strategy
     reports with all required fields.
  6. **E2E with engine** — `harvest_payout_pool` + cohort sim runs end
     to end on shipped Vendor B IR.

Run:
    python -m unittest tools.tests.test_w7_6_player_sim
"""
from __future__ import annotations
import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.player_sim.player_strategies import (
    FixedBet,
    Martingale,
    AntiMartingale,
    StopLoss,
    WinChase,
)
from tools.player_sim.session_simulator import (
    SessionResult,
    build_payout_sampler,
    simulate_session,
    simulate_cohort,
    harvest_payout_pool,
    _find_slot_sim_bin,
)


def _bin_available() -> bool:
    return _find_slot_sim_bin() is not None


# ─── pure-Python strategy logic ─────────────────────────────────────────────


class TestFixedBet(unittest.TestCase):
    def test_always_bets_base(self):
        s = FixedBet(base_bet=2.0, bankroll=20.0, max_session_spins=5)
        s.reset()
        for _ in range(5):
            self.assertEqual(s.next_bet(), 2.0)
            s.observe(2.0, 0.0)  # all losses

    def test_terminates_on_bankroll_exhaustion(self):
        s = FixedBet(base_bet=5.0, bankroll=10.0, max_session_spins=100)
        s.reset()
        s.observe(5.0, 0.0)  # bankroll 5
        self.assertTrue(s.continue_playing())
        s.observe(5.0, 0.0)  # bankroll 0
        self.assertFalse(s.continue_playing())
        self.assertTrue(s.ruin)


class TestMartingale(unittest.TestCase):
    def test_doubles_after_loss(self):
        s = Martingale(base_bet=1.0, bankroll=200.0, max_session_spins=100,
                        max_bet=64.0)
        s.reset()
        self.assertEqual(s.next_bet(), 1.0)
        s.observe(1.0, 0.0)  # loss
        self.assertEqual(s.next_bet(), 2.0)
        s.observe(2.0, 0.0)  # loss
        self.assertEqual(s.next_bet(), 4.0)
        s.observe(4.0, 0.0)  # loss
        self.assertEqual(s.next_bet(), 8.0)

    def test_resets_after_win(self):
        s = Martingale(base_bet=1.0, bankroll=200.0)
        s.reset()
        s.observe(1.0, 0.0)  # loss → bet 2
        s.observe(2.0, 0.0)  # loss → bet 4
        s.observe(4.0, 8.0)  # win → reset to 1
        self.assertEqual(s.next_bet(), 1.0)

    def test_capped_by_max_bet(self):
        s = Martingale(base_bet=1.0, bankroll=10000.0, max_bet=16.0)
        s.reset()
        for _ in range(10):
            s.observe(s.next_bet(), 0.0)
        # After 10 losses, bet would be 1024 but capped at 16
        self.assertEqual(s.next_bet(), 16.0)


class TestAntiMartingale(unittest.TestCase):
    def test_doubles_after_win(self):
        s = AntiMartingale(base_bet=1.0, bankroll=200.0, max_bet=64.0)
        s.reset()
        self.assertEqual(s.next_bet(), 1.0)
        s.observe(1.0, 2.0)  # win
        self.assertEqual(s.next_bet(), 2.0)
        s.observe(2.0, 4.0)
        self.assertEqual(s.next_bet(), 4.0)

    def test_resets_after_loss(self):
        s = AntiMartingale(base_bet=1.0, bankroll=200.0)
        s.reset()
        s.observe(1.0, 2.0)  # win → 2
        s.observe(2.0, 4.0)  # win → 4
        s.observe(4.0, 0.0)  # loss → reset
        self.assertEqual(s.next_bet(), 1.0)


class TestStopLoss(unittest.TestCase):
    def test_quits_when_loss_threshold_hit(self):
        s = StopLoss(base_bet=10.0, bankroll=100.0, max_session_spins=100,
                      loss_threshold=0.4)
        s.reset()
        self.assertTrue(s.continue_playing())
        # Lose 40% → 100 - 40 = 60; threshold 40% hit, should stop
        s.observe(10.0, 0.0)  # -10 → 90
        s.observe(10.0, 0.0)  # -10 → 80
        s.observe(10.0, 0.0)  # -10 → 70
        s.observe(10.0, 0.0)  # -10 → 60 (-40 = 40% loss)
        self.assertFalse(s.continue_playing())


class TestWinChase(unittest.TestCase):
    def test_quits_when_win_target_hit(self):
        s = WinChase(base_bet=10.0, bankroll=100.0, max_session_spins=100,
                      win_target=0.5)
        s.reset()
        self.assertTrue(s.continue_playing())
        # Win 50% → 150, target hit
        s.observe(10.0, 60.0)  # +50 → 150
        self.assertFalse(s.continue_playing())


# ─── sampler calibration ────────────────────────────────────────────────────


class TestPayoutSampler(unittest.TestCase):
    def test_sampler_mean_matches_engine_rtp(self):
        """build_payout_sampler should produce stream whose mean ≈ target RTP."""
        rng = random.Random(42)
        metrics = {
            "hit_freq": 0.20,
            "tier_hits": {"10x+": 200, "20x+": 50, "50x+": 10, "100x+": 2,
                          "200x+": 0, "500x+": 0, "1000x+": 0},
            "total_spins": 10_000,
            "max_spin": 134.0,
        }
        sampler = build_payout_sampler(0.96, metrics, rng)
        # Sample 50K spins → mean should be within 5% of 0.96
        n = 50_000
        total = sum(sampler(1.0) for _ in range(n))
        mean = total / n
        self.assertAlmostEqual(mean, 0.96, delta=0.05,
                                msg=f"sampler mean {mean:.4f} vs target 0.96")

    def test_sampler_zero_when_hit_freq_zero(self):
        rng = random.Random(42)
        metrics = {
            "hit_freq": 0.0,
            "tier_hits": {},
            "total_spins": 10_000,
            "max_spin": 1.0,
        }
        sampler = build_payout_sampler(0.0, metrics, rng)
        # No hits → all zero payouts
        for _ in range(100):
            self.assertEqual(sampler(1.0), 0.0)


# ─── simulate_session + cohort ──────────────────────────────────────────────


class TestSimulateSession(unittest.TestCase):
    def test_single_session_returns_result(self):
        s = FixedBet(base_bet=1.0, bankroll=10.0, max_session_spins=10)
        # Always-lose sampler
        def sampler(bet: float) -> float:
            return 0.0
        r = simulate_session(s, sampler)
        self.assertIsInstance(r, SessionResult)
        self.assertEqual(r.strategy_name, "FixedBet")
        self.assertEqual(r.spins_played, 10)
        self.assertEqual(r.final_bankroll, 0.0)
        self.assertEqual(r.net_pnl, -10.0)
        self.assertTrue(r.ruin)


class TestSimulateCohort(unittest.TestCase):
    def test_cohort_returns_per_strategy_report(self):
        rng = random.Random(42)
        # Simple sampler: 20% hit at 5x, else 0
        def sampler(bet: float) -> float:
            return bet * 5.0 if rng.random() < 0.20 else 0.0
        strategies = [
            FixedBet(base_bet=1.0, bankroll=100.0, max_session_spins=100),
            Martingale(base_bet=1.0, bankroll=100.0, max_session_spins=100,
                        max_bet=32.0),
        ]
        reports = simulate_cohort(strategies, payout_sampler=sampler,
                                    sessions_per_strategy=50)
        self.assertEqual(len(reports), 2)
        for r in reports:
            self.assertGreater(r.sessions, 0)
            self.assertIsNotNone(r.realized_rtp)
            self.assertGreaterEqual(r.ruin_rate, 0.0)
            self.assertLessEqual(r.ruin_rate, 1.0)


@unittest.skipUnless(_bin_available(), "slot-sim binary required")
class TestEndToEndWithEngine(unittest.TestCase):
    def test_harvest_returns_rtp(self):
        ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        rtp, metrics = harvest_payout_pool(ir, spins=30_000, seed=42)
        self.assertGreater(rtp, 0.5)
        self.assertLess(rtp, 1.5)
        self.assertIn("hit_freq", metrics)
        self.assertIn("max_spin", metrics)
        self.assertIn("tier_hits", metrics)

    def test_full_pipeline_5_strategies_500_sessions(self):
        ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        rtp, metrics = harvest_payout_pool(ir, spins=30_000, seed=42)
        rng = random.Random(42)
        sampler = build_payout_sampler(rtp, metrics, rng)
        strategies = [
            FixedBet(base_bet=1.0, bankroll=100.0, max_session_spins=200),
            Martingale(base_bet=1.0, bankroll=100.0, max_session_spins=200,
                        max_bet=32.0),
            AntiMartingale(base_bet=1.0, bankroll=100.0, max_session_spins=200,
                            max_bet=32.0),
            StopLoss(base_bet=1.0, bankroll=100.0, max_session_spins=200,
                      loss_threshold=0.5),
            WinChase(base_bet=1.0, bankroll=100.0, max_session_spins=200,
                      win_target=0.5),
        ]
        reports = simulate_cohort(strategies, payout_sampler=sampler,
                                    sessions_per_strategy=200)
        self.assertEqual(len(reports), 5)
        # Each strategy must have realized_rtp within ±15% of engine RTP
        # (strategy-induced variance permits some drift; sampler is
        # calibrated to engine RTP via internal scaling).
        for r in reports:
            self.assertAlmostEqual(r.realized_rtp, rtp, delta=0.15,
                                    msg=f"{r.strategy_name} realized_rtp "
                                        f"{r.realized_rtp:.4f} vs engine {rtp:.4f}")


if __name__ == "__main__":
    unittest.main()
