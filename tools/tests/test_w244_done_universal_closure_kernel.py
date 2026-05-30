"""W244 wave 43 — DONE-UNIVERSAL #1 + #2 closure acceptance tests."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.asymmetric_showcase import (  # noqa: E402
    asymmetric_showcase_run, twin_spin_proxy, wild_toro_proxy,
    wild_west_gold_proxy,
)
from tools.math_dsl.both_ways import BothWaysParams  # noqa: E402
from tools.math_dsl.both_ways_expanding_wild import (  # noqa: E402
    BothWaysExpandingWildParams, both_ways_expanding_wild_rtp,
)
from tools.math_dsl.expanding_symbol import ExpandingSymbolParams  # noqa: E402


class TestBothWaysExpandingWild(unittest.TestCase):
    """DONE-UNIVERSAL #1: Both-ways + expanding wild composition."""

    def test_composition_sums_correctly(self):
        bw = BothWaysParams(ltr_only_rtp=0.80, line_pay_share=0.7)
        es = ExpandingSymbolParams(
            fs_trigger_p=0.005, fs_initial_spins=10,
            reels=5, rows=3,
            p_per_cell_in_fs=0.12,
            pay_table={3: 1.0, 4: 5.0, 5: 100.0},
            symbol_name="explorer",
        )
        params = BothWaysExpandingWildParams(
            both_ways_params=bw, expanding_params=es,
        )
        r = both_ways_expanding_wild_rtp(params)
        # both_ways: 0.80 × (1 + 0.7) = 1.36
        self.assertAlmostEqual(
            r["both_ways_component"]["rtp_contribution"], 1.36, places=10,
        )
        # Total = both_ways + expanding component
        manual = (
            r["both_ways_component"]["rtp_contribution"]
            + r["expanding_symbol_component"]["rtp_contribution"]
        )
        self.assertAlmostEqual(r["rtp_contribution"], manual)

    def test_components_independent(self):
        """Setting expanding_symbol to zero RTP doesn't affect both_ways."""
        bw = BothWaysParams(ltr_only_rtp=0.50, line_pay_share=0.5)
        es_zero = ExpandingSymbolParams(
            fs_trigger_p=0.0,  # never triggers
            fs_initial_spins=10,
            reels=5, rows=3,
            p_per_cell_in_fs=0.10,
            pay_table={3: 1.0},
            symbol_name="explorer",
        )
        params = BothWaysExpandingWildParams(
            both_ways_params=bw, expanding_params=es_zero,
        )
        r = both_ways_expanding_wild_rtp(params)
        # both_ways = 0.5 × 1.5 = 0.75; expanding = 0 → total = 0.75
        self.assertAlmostEqual(r["rtp_contribution"], 0.75)
        self.assertAlmostEqual(
            r["expanding_symbol_component"]["rtp_contribution"], 0.0,
        )


class TestAsymmetricShowcase(unittest.TestCase):
    """DONE-UNIVERSAL #2: Asymmetric paytable showcase."""

    def test_twin_spin_proxy_runs(self):
        r = asymmetric_showcase_run("twin_spin")
        self.assertEqual(r["proxy_name"], "twin_spin")
        self.assertEqual(r["symbols_count"], 4)
        self.assertGreater(r["rtp_contribution"], 0.0)

    def test_wild_west_gold_proxy_runs(self):
        r = asymmetric_showcase_run("wild_west_gold")
        self.assertEqual(r["proxy_name"], "wild_west_gold")
        self.assertEqual(r["symbols_count"], 4)

    def test_wild_toro_proxy_runs(self):
        r = asymmetric_showcase_run("wild_toro")
        self.assertEqual(r["proxy_name"], "wild_toro")
        self.assertEqual(r["symbols_count"], 3)

    def test_rejects_unknown_proxy(self):
        with self.assertRaises(ValueError):
            asymmetric_showcase_run("unknown_proxy")

    def test_factory_proxies_distinct(self):
        """Each proxy returns different per_symbol_contributions."""
        ts = twin_spin_proxy()
        ww = wild_west_gold_proxy()
        wt = wild_toro_proxy()
        self.assertNotEqual(
            set(ts.per_symbol_contributions.keys()),
            set(ww.per_symbol_contributions.keys()),
        )
        self.assertNotEqual(
            set(ww.per_symbol_contributions.keys()),
            set(wt.per_symbol_contributions.keys()),
        )


if __name__ == "__main__":
    unittest.main()
