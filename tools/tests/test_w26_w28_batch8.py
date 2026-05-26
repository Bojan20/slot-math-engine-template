"""W26 + W28 + P1.6 batch 8 combined tests."""
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

# W26
from tools.config_validator import validate_repo
from tools.config_validator.__main__ import main as cfg_main

# W28
from tools.changelog import build_changelog, parse_log
from tools.changelog.__main__ import main as cl_main

# P1.6 batch 8
from tools.solvers.cluster_expand_chain import (
    ClusterExpandParams,
    analytical_rtp as ce_rtp,
    mc_simulate as ce_mc,
    expected_final_cluster_size,
)
from tools.solvers.level_up_bonus import (
    LevelUpParams,
    analytical_rtp as lu_rtp,
    mc_simulate as lu_mc,
    expected_levels,
)
from tools.solvers.mystery_multiplier_symbol import (
    MysteryMultParams,
    analytical_rtp as mm_rtp,
    mc_simulate as mm_mc,
    expected_multiplier,
)
from tools.solvers.scatter_pay_bonus_chain import (
    ScatterChainParams,
    analytical_rtp as sc_rtp,
    mc_simulate as sc_mc,
    expected_scatter_pay,
)


def _ir(*, target_rtp: float = 0.95, max_win: float = 5000.0,
        vendor: str = "vendor_c",
        features: list | None = None) -> dict:
    return {
        "meta": {
            "id": "test", "vendor": vendor, "swid": "S-001",
            "target_rtp": target_rtp,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "limits": {
            "max_win_x": max_win,
            "min_spin_duration_ms": 2500,
        },
        "features": features if features is not None else [
            {"kind": "free_spins"},
        ],
    }


# ─── W26: Config Validator ─────────────────────────────────────────


class TestConfigValidator(unittest.TestCase):
    def test_empty_repo_passes(self):
        with tempfile.TemporaryDirectory() as d:
            r = validate_repo(Path(d))
            self.assertTrue(r.passed)
            self.assertEqual(r.n_games, 0)

    def test_rtp_in_range_passes(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(_ir(target_rtp=0.95)))
            r = validate_repo(d, jurisdictions=["ukgc"])
            # 0.95 should be within UKGC range
            self.assertTrue(r.passed,
                             f"issues: {[i.to_dict() for i in r.issues]}")

    def test_rtp_outside_range_errors(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            # 0.50 RTP — outside any reasonable jurisdiction range
            (d / "g" / "ir.json").write_text(json.dumps(_ir(target_rtp=0.50)))
            r = validate_repo(d, jurisdictions=["ukgc"])
            self.assertFalse(r.passed)
            self.assertTrue(any(
                "rtp.range" in i.rule for i in r.issues
            ))

    def test_unknown_vendor_warns(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(
                json.dumps(_ir(vendor="vendor_zzz"))
            )
            r = validate_repo(d, jurisdictions=[])
            self.assertTrue(any(
                "vendor.registered" in i.rule for i in r.issues
            ))

    def test_unknown_feature_warns(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(
                _ir(features=[{"kind": "weird_unknown_kind"}])
            ))
            r = validate_repo(d, jurisdictions=[])
            self.assertTrue(any(
                "feature.kind" in i.rule for i in r.issues
            ))

    def test_malformed_ir_errors(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text("not json")
            r = validate_repo(d, jurisdictions=[])
            self.assertFalse(r.passed)
            self.assertTrue(any("ir.parse" in i.rule for i in r.issues))

    def test_cli_clean_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = cfg_main([str(d), "--quiet"])
            self.assertEqual(rc, 0)


# ─── W28: Changelog ────────────────────────────────────────────────


class TestChangelog(unittest.TestCase):
    SAMPLE = (
        "abc1234\t2026-05-26T10:00:00+00:00\tBoki\tfeat(W11): drift sentinel\n"
        "def5678\t2026-05-26T11:00:00+00:00\tBoki\tfix(W11): replay bug\n"
        "9991234\t2026-05-25T22:00:00+00:00\tBoki\tfeat(P1.6+): kernels\n"
        "8881234\t2026-05-25T20:00:00+00:00\tBoki\tdocs: README update\n"
    )

    def test_parse_log_extracts_4_entries(self):
        entries = parse_log(self.SAMPLE)
        self.assertEqual(len(entries), 4)
        self.assertEqual(entries[0].commit_hash, "abc1234")
        self.assertEqual(entries[0].scope, "W11")
        self.assertEqual(entries[0].type, "feat")

    def test_build_changelog_groups_by_wave_id(self):
        cl = build_changelog(Path("."), log_text=self.SAMPLE)
        scopes = cl.by_scope()
        self.assertIn("W11", scopes)
        # "P1.6+" is normalized to "P1.6" so batches like P1.6++++ all
        # group under the same family.
        self.assertIn("P1.6", scopes)
        self.assertEqual(len(scopes["W11"]), 2)

    def test_markdown_includes_all_scopes(self):
        cl = build_changelog(Path("."), log_text=self.SAMPLE)
        md = cl.to_markdown()
        self.assertIn("## W11", md)
        self.assertIn("## P1.6", md)
        self.assertIn("Changelog", md)

    def test_to_dict_is_json_safe(self):
        cl = build_changelog(Path("."), log_text=self.SAMPLE)
        json.dumps(cl.to_dict())   # must not raise

    def test_cli_runs_against_real_repo(self):
        # Run against the slot-math-engine-template repo itself
        repo = Path(__file__).resolve().parent.parent.parent
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = cl_main([str(repo), "--max-commits", "20", "--quiet"])
        self.assertEqual(rc, 0)


# ─── P1.6 batch 8 ──────────────────────────────────────────────────


class TestClusterExpand(unittest.TestCase):
    REF = ClusterExpandParams(
        initial_cluster_size=5,
        p_grow_per_round=0.3,
        max_cluster_size=20,
        pay_by_size={5: 10, 7: 20, 10: 50, 15: 200, 20: 1000},
        p_trigger=0.10,
    )

    def test_expected_size_grows_with_p(self):
        a = expected_final_cluster_size(self.REF)
        b = ClusterExpandParams(
            initial_cluster_size=5, p_grow_per_round=0.6,
            max_cluster_size=20,
            pay_by_size={5: 10, 20: 1000},
        )
        self.assertGreater(expected_final_cluster_size(b), a)

    def test_rtp_positive(self):
        self.assertGreater(ce_rtp(self.REF), 0)

    def test_mc_runs(self):
        mc = ce_mc(self.REF, sessions=5_000, seed=42)
        self.assertGreaterEqual(mc["mean_final_size"], 5)


class TestLevelUp(unittest.TestCase):
    REF = LevelUpParams(
        rtp_at_level=[0.90, 0.92, 0.95, 0.98, 1.02],
        level_up_progress=0.01,    # 1% per spin → 100 spins per level
        session_spins=300,
    )

    def test_expected_levels(self):
        # 300 × 0.01 = 3
        self.assertAlmostEqual(expected_levels(self.REF), 3.0, places=4)

    def test_analytical_within_session_average(self):
        # Session spans levels 0, 1, 2 fully + boundary at 3
        r = lu_rtp(self.REF)
        # Should be average of first 3-4 levels' RTP
        self.assertGreater(r, 0.90)
        self.assertLess(r, 1.00)

    def test_mc_close_to_analytical(self):
        a = lu_rtp(self.REF)
        mc = lu_mc(self.REF, sessions=2_000, seed=42)
        # MC is deterministic up to level transitions; tight band
        self.assertAlmostEqual(mc["rtp_mc"], a, delta=0.01)


class TestMysteryMult(unittest.TestCase):
    REF = MysteryMultParams(
        reels=5, rows=3,
        p_land_per_cell=0.05,
        mult_dist={1: 0.6, 2: 0.25, 5: 0.10, 10: 0.05},
        base_line_rtp=0.50,
    )

    def test_em(self):
        # 0.6 + 0.5 + 0.5 + 0.5 = 2.10
        self.assertAlmostEqual(expected_multiplier(self.REF), 2.10, places=4)

    def test_rtp_uplift(self):
        r = mm_rtp(self.REF)
        # Must be ≥ base_line_rtp (multipliers can't reduce pay)
        self.assertGreaterEqual(r, 0.50)

    def test_mc_convergence(self):
        a = mm_rtp(self.REF)
        mc = mm_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestScatterChain(unittest.TestCase):
    REF = ScatterChainParams(
        reels=5, rows=3,
        p_scatter_per_cell=0.04,
        scatter_pay_per_scatter=2.0,
        p_bonus_per_scatter=0.05,
        chain_length=5,
        chain_pay_per_step=10.0,
    )

    def test_scatter_pay(self):
        # 15 × 0.04 × 2 = 1.2
        self.assertAlmostEqual(expected_scatter_pay(self.REF), 1.2, places=4)

    def test_total_rtp_positive(self):
        self.assertGreater(sc_rtp(self.REF), 0)

    def test_mc_convergence(self):
        a = sc_rtp(self.REF)
        mc = sc_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.92)
        self.assertLess(ratio, 1.08)


if __name__ == "__main__":
    unittest.main()
