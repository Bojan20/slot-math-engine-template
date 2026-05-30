"""W244 wave 19 — persistent_multiplier closed-form kernel acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.persistent_multiplier import (  # noqa: E402
    PersistentMultiplierParams,
    _dp_multiplier_path,
    expected_fs_total,
    expected_multiplier_at_spin,
    persistent_multiplier_rtp,
)


class TestExpectedMultiplierAtSpin(unittest.TestCase):
    def test_spin_1_equals_initial(self):
        """Spin 1: no bumps yet → expected = initial."""
        params = PersistentMultiplierParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.1,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
        )
        self.assertAlmostEqual(expected_multiplier_at_spin(params, 1), 1.0)

    def test_spin_t_linear_uncapped(self):
        """Spin t uncapped: 1 + 0.3 × (t-1).

        Spin 5: 1 + 0.3 × 4 = 2.2
        """
        params = PersistentMultiplierParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.1,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
            max_multiplier=None,
        )
        self.assertAlmostEqual(expected_multiplier_at_spin(params, 5), 2.2)

    def test_cap_clamps(self):
        """Cap=2.0: spin 5 raw=2.2 but clamp → 2.0."""
        params = PersistentMultiplierParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.1,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
            max_multiplier=2.0,
        )
        self.assertAlmostEqual(expected_multiplier_at_spin(params, 5), 2.0)


class TestDpMultiplierPath(unittest.TestCase):
    def test_uncapped_spin_1(self):
        """Spin 1: multiplier = initial = 1.0 exactly."""
        params = PersistentMultiplierParams(
            fs_trigger_p=0.01,
            fs_initial_spins=3,
            base_pay_per_spin_x_bet=0.1,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
        )
        path = _dp_multiplier_path(params)
        self.assertAlmostEqual(path[0], 1.0)
        # Spin 2 after 0.3 chance of bump: E = 0.3×2 + 0.7×1 = 1.3
        self.assertAlmostEqual(path[1], 1.3)
        # Spin 3: P(0 bumps)=0.49, P(1)=2*0.3*0.7=0.42, P(2)=0.09 → E = 0.49+1.26+0.81=...
        # 0.49 × 1 + 0.42 × 2 + 0.09 × 3 = 0.49 + 0.84 + 0.27 = 1.6
        self.assertAlmostEqual(path[2], 1.6)

    def test_capped_multiplier_clamps(self):
        """Cap=2.0: P(reach cap) accumulates, paths above 2.0 collapse."""
        params = PersistentMultiplierParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.1,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.9,  # bumps almost every spin
            max_multiplier=2.0,
        )
        path = _dp_multiplier_path(params)
        # By spin 10 with p_bump=0.9, P(at-cap) ≈ 1
        # Last few spins should converge to cap=2.0
        self.assertAlmostEqual(path[-1], 2.0, places=2)


class TestExpectedFsTotal(unittest.TestCase):
    def test_total_aggregates(self):
        """E[total] = base_pay × sum_t E[m_t]."""
        params = PersistentMultiplierParams(
            fs_trigger_p=0.01,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.1,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
        )
        e_total = expected_fs_total(params)
        path = _dp_multiplier_path(params)
        self.assertAlmostEqual(e_total, 0.1 * sum(path))


class TestPersistentMultiplierRtp(unittest.TestCase):
    def test_full_breakdown(self):
        params = PersistentMultiplierParams(
            fs_trigger_p=0.005,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.5,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
        )
        r = persistent_multiplier_rtp(params)
        self.assertIn("rtp_contribution", r)
        self.assertIn("expected_multiplier_per_spin", r)
        self.assertIn("average_multiplier", r)
        self.assertGreater(r["rtp_contribution"], 0.0)
        # 10 elements in path
        self.assertEqual(len(r["expected_multiplier_per_spin"]), 10)


class TestValidation(unittest.TestCase):
    def test_rejects_negative_pay(self):
        with self.assertRaises(ValueError):
            PersistentMultiplierParams(0.01, 10, -0.1)

    def test_rejects_zero_fs_spins(self):
        with self.assertRaises(ValueError):
            PersistentMultiplierParams(0.01, 0, 0.1)

    def test_rejects_cap_below_initial(self):
        with self.assertRaises(ValueError):
            PersistentMultiplierParams(
                0.01, 10, 0.1, initial_multiplier=5.0, max_multiplier=3.0,
            )

    def test_rejects_p_bump_above_one(self):
        with self.assertRaises(ValueError):
            PersistentMultiplierParams(0.01, 10, 0.1, p_bump_per_spin=1.5)

    def test_rejects_negative_bump(self):
        with self.assertRaises(ValueError):
            PersistentMultiplierParams(0.01, 10, 0.1, bump_increment=-1.0)


if __name__ == "__main__":
    unittest.main()
