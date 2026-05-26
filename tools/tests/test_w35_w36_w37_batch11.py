"""W35 + W36 + W37 + P1.6 batch 11 combined tests."""
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

# W35
from tools.ir_diff_heatmap import (
    diff_irs,
    render_markdown,
    HIGH_IMPACT_PREFIXES,
)
from tools.ir_diff_heatmap.__main__ import main as diff_main

# W36
from tools.rtp_sweep import sweep, ascii_chart
from tools.rtp_sweep.__main__ import main as sweep_main

# W37
from tools.cohort_segment import (
    aggregate,
    analyze_jsonl,
    classify_segments,
)
from tools.cohort_segment.__main__ import main as cohort_main

# P1.6 batch 11
from tools.solvers.pyramid_multiplier_stack import (
    PyramidMultiplierParams,
    analytical_rtp as py_rtp,
    mc_simulate as py_mc,
    expected_average_multiplier,
)
from tools.solvers.random_wild_reel_drop import (
    WildReelDropParams,
    analytical_rtp as wd_rtp,
    mc_simulate as wd_mc,
)
from tools.solvers.cluster_consolidation_bonus import (
    ClusterConsolidationParams,
    analytical_rtp as cc_rtp,
    mc_simulate as cc_mc,
)
from tools.solvers.respin_charge_meter import (
    RespinChargeMeterParams,
    analytical_rtp as rm_rtp,
    mc_simulate as rm_mc,
    prob_fill,
)


def _ir(pay: int = 100, target_rtp: float = 0.96) -> dict:
    return {
        "meta": {"id": "t", "vendor": "vendor_c", "swid": "S",
                  "target_rtp": target_rtp},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A"] * 4 for _ in range(5)]},
        "paytable": [
            {"combo": ["A"] * 5, "pays": pay},
        ],
        "features": [{"kind": "free_spins"}],
    }


# ─── W35: IR Diff Heatmap ──────────────────────────────────────────


class TestIRDiffHeatmap(unittest.TestCase):
    def test_identical_irs_no_changes(self):
        r = diff_irs(_ir(), _ir())
        self.assertEqual(len(r.changes), 0)

    def test_paytable_change_is_high_impact(self):
        r = diff_irs(_ir(pay=100), _ir(pay=200))
        self.assertGreater(r.n_high, 0)
        # Aggregate score reflects high impact
        self.assertGreaterEqual(r.aggregate_score, 5)

    def test_meta_notes_change_is_low_impact(self):
        a = _ir()
        b = _ir()
        a["meta"]["notes"] = "foo"
        b["meta"]["notes"] = "bar"
        r = diff_irs(a, b)
        self.assertEqual(r.n_high, 0)
        self.assertEqual(r.n_medium, 0)

    def test_target_rtp_change_is_medium_impact(self):
        r = diff_irs(_ir(target_rtp=0.96), _ir(target_rtp=0.97))
        self.assertGreaterEqual(r.n_medium, 1)

    def test_markdown_rendering(self):
        r = diff_irs(_ir(pay=100), _ir(pay=300))
        md = render_markdown(r)
        self.assertIn("# IR Diff Heatmap", md)
        self.assertIn("paytable", md)

    def test_cli_runs(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            a = d / "a.json"
            b = d / "b.json"
            a.write_text(json.dumps(_ir(pay=100)))
            b.write_text(json.dumps(_ir(pay=100)))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = diff_main([str(a), str(b), "--quiet"])
            # identical IRs → no high changes → exit 0
            self.assertEqual(rc, 0)


# ─── W36: RTP Sweep ────────────────────────────────────────────────


class TestRTPSweep(unittest.TestCase):
    def test_constant_fn_yields_zero_range(self):
        result = sweep(lambda x: 0.5, param_name="x",
                        start=0, stop=1, n=11)
        self.assertEqual(result.y_range, 0.0)

    def test_linear_fn_increasing(self):
        result = sweep(lambda x: 2 * x, param_name="x",
                        start=0, stop=10, n=11)
        ys = [p.y for p in result.points]
        self.assertEqual(ys[0], 0)
        self.assertEqual(ys[-1], 20)
        self.assertEqual(result.y_range, 20)

    def test_ascii_chart_render(self):
        result = sweep(lambda x: x ** 2, param_name="x",
                        start=0, stop=10, n=21)
        chart = ascii_chart(result, width=40, height=8)
        self.assertIn("RTP sweep", chart)
        self.assertIn("•", chart)

    def test_cli_sweep_real_kernel(self):
        # Sweep `p_charge` of respin_charge_meter
        base = {
            "p_trigger": 1.0, "p_charge": 0.5,
            "meter_capacity": 5, "max_respins": 10,
            "fill_pay": 100.0,
        }
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            base_p = d / "base.json"
            base_p.write_text(json.dumps(base))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = sweep_main([
                    "tools.solvers.respin_charge_meter",
                    "p_charge",
                    "--start", "0.1", "--stop", "0.9",
                    "--n", "9",
                    "--base", str(base_p),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W37: Cohort Segment Analyzer ──────────────────────────────────


def _spin_events():
    """Create synthetic spin events with 3 player tiers."""
    events = []
    rng_seed = 0
    # Low-rollers (10 players, bet=1, RTP 0.95)
    for pi in range(10):
        for _ in range(100):
            events.append({
                "player_id": f"low_{pi}",
                "bet": 1.0,
                "pay": 0.95,
            })
    # Mid-rollers (10 players, bet=5, RTP 0.96)
    for pi in range(10):
        for _ in range(100):
            events.append({
                "player_id": f"mid_{pi}",
                "bet": 5.0,
                "pay": 4.80,
            })
    # High-rollers (10 players, bet=25, RTP 0.97)
    for pi in range(10):
        for _ in range(100):
            events.append({
                "player_id": f"high_{pi}",
                "bet": 25.0,
                "pay": 24.25,
            })
    return events


class TestCohortSegment(unittest.TestCase):
    def test_classify_segments_three_tiers(self):
        bets = {f"p{i}": float(i) for i in range(30)}
        seg = classify_segments(bets)
        # Should produce 3 segments
        counts = {"low": 0, "mid": 0, "high": 0}
        for s in seg.values():
            counts[s] += 1
        # Quantile-based — roughly balanced
        self.assertGreater(counts["low"], 5)
        self.assertGreater(counts["mid"], 5)
        self.assertGreater(counts["high"], 5)

    def test_aggregate_separates_segments(self):
        events = _spin_events()
        report = aggregate(events)
        self.assertEqual(report.n_events, len(events))
        low = report.segments["low"]
        high = report.segments["high"]
        self.assertGreater(low.n_players, 0)
        self.assertGreater(high.n_players, 0)
        # High-roller RTP should be > low-roller RTP per fixture design
        self.assertGreater(high.rtp, low.rtp)

    def test_jsonl_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.jsonl"
            p.write_text("\n".join(json.dumps(e) for e in _spin_events()))
            report = analyze_jsonl(p)
            self.assertEqual(report.n_events, 3000)

    def test_cli_with_tight_tolerance_exits_1(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.jsonl"
            p.write_text("\n".join(json.dumps(e) for e in _spin_events()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                # tolerance is 0.005 — segments differ by up to 0.02
                rc = cohort_main([
                    str(p), "--rtp-tolerance", "0.005", "--quiet",
                ])
            self.assertEqual(rc, 1)


# ─── P1.6 batch 11 ─────────────────────────────────────────────────


class TestPyramidMultiplier(unittest.TestCase):
    REF = PyramidMultiplierParams(
        rows=3, row_hit_freq=0.10, row_pay=1.0,
        mult_base=1.0, mult_step=1.0,
    )

    def test_avg_mult_matches_arithmetic_mean(self):
        # rows=3, base=1, step=1 → multipliers [1, 2, 3], mean=2
        self.assertAlmostEqual(expected_average_multiplier(self.REF), 2.0)

    def test_rtp_proportional_to_row_pay(self):
        a = py_rtp(self.REF)
        b = py_rtp(PyramidMultiplierParams(
            rows=3, row_hit_freq=0.10, row_pay=2.0,
            mult_base=1.0, mult_step=1.0,
        ))
        self.assertAlmostEqual(b, 2 * a, places=6)

    def test_mc_within_tolerance(self):
        a = py_rtp(self.REF)
        mc = py_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestRandomWildReelDrop(unittest.TestCase):
    REF = WildReelDropParams(
        reels=5, p_trigger=0.10,
        wild_reels_dist={1: 0.6, 2: 0.3, 3: 0.1},
        pay_5oak=100.0, min_wild_reels=5,
    )

    def test_min_wild_5_with_low_k_returns_small(self):
        # No k=5 in dist → contribution should be tiny
        self.assertLess(wd_rtp(self.REF), 0.01)

    def test_full_dist_at_5_pays(self):
        full = WildReelDropParams(
            reels=5, p_trigger=0.10,
            wild_reels_dist={5: 1.0},
            pay_5oak=100.0, min_wild_reels=5,
        )
        # P(line | k=5, reels=5) = 1.0; uplift = 0.10 · 1.0 · 100 = 10
        self.assertAlmostEqual(wd_rtp(full), 10.0, places=4)

    def test_zero_weights_raises(self):
        bad = WildReelDropParams(
            reels=5, p_trigger=0.10, wild_reels_dist={},
            pay_5oak=100.0,
        )
        with self.assertRaises(ValueError):
            wd_rtp(bad)


class TestClusterConsolidation(unittest.TestCase):
    REF = ClusterConsolidationParams(
        max_clusters=3, p_cluster_lands=0.20, base_pay=10.0,
        factor_curve={0: 0.0, 1: 1.0, 2: 3.0, 3: 10.0},
    )

    def test_rtp_positive(self):
        self.assertGreater(cc_rtp(self.REF), 0)

    def test_higher_p_gives_higher_rtp(self):
        a = cc_rtp(self.REF)
        b = cc_rtp(ClusterConsolidationParams(
            max_clusters=3, p_cluster_lands=0.50, base_pay=10.0,
            factor_curve={0: 0.0, 1: 1.0, 2: 3.0, 3: 10.0},
        ))
        self.assertGreater(b, a)

    def test_mc_within_tolerance(self):
        a = cc_rtp(self.REF)
        mc = cc_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestRespinChargeMeter(unittest.TestCase):
    REF = RespinChargeMeterParams(
        p_trigger=0.05, p_charge=0.30, meter_capacity=5,
        max_respins=15, fill_pay=200.0,
    )

    def test_prob_fill_bounded(self):
        pf = prob_fill(self.REF)
        self.assertGreater(pf, 0)
        self.assertLess(pf, 1)

    def test_zero_charge_zero_fill(self):
        p = RespinChargeMeterParams(
            p_trigger=0.05, p_charge=0.0, meter_capacity=5,
            max_respins=15, fill_pay=200.0,
        )
        self.assertEqual(prob_fill(p), 0)

    def test_always_charge_always_fill(self):
        p = RespinChargeMeterParams(
            p_trigger=0.05, p_charge=1.0, meter_capacity=5,
            max_respins=15, fill_pay=200.0,
        )
        self.assertAlmostEqual(prob_fill(p), 1.0)

    def test_mc_within_tolerance(self):
        a = rm_rtp(self.REF)
        mc = rm_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


if __name__ == "__main__":
    unittest.main()
