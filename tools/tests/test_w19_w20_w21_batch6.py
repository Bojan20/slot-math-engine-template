"""W19 + W20 + W21 + P1.6++++ batch 6 — combined wave tests."""
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

# W19
from tools.telemetry import (
    EventKind,
    sample_session,
    validate_event,
    validate_stream,
)
from tools.telemetry.__main__ import main as tele_main

# W20
from tools.plugin_bundle import (
    build_bundle,
    inspect_bundle,
    parse_semver,
)
from tools.plugin_bundle.__main__ import main as bundle_main

# W21
from tools.replay_gate import (
    load_baseline,
    record_baseline,
    replay_check,
    save_baseline,
)
from tools.replay_gate.__main__ import main as replay_main

# P1.6++++ batch 6
from tools.solvers.lightning_bomb_multiplier import (
    LightningBombParams,
    analytical_rtp as lb_rtp,
    expected_multiplier,
)
from tools.solvers.coin_storm_collect import (
    CoinStormParams,
    expected_pay_per_trigger,
    variance_pay_per_trigger,
    analytical_rtp as cs_rtp,
    mc_simulate as cs_mc,
)
from tools.solvers.respin_lock_geometric import (
    RespinLockParams,
    analytical_rtp as rl_rtp,
    mc_simulate as rl_mc,
)
from tools.solvers.wild_path_clear import (
    WildPathClearParams,
    expected_path_length,
    analytical_rtp as wp_rtp,
    mc_simulate as wp_mc,
)


# ─── shared fixtures ──────────────────────────────────────────────


def _ir(pay: int = 100) -> dict:
    """Tight-strip + dense paytable to keep Bernoulli hit_freq high
    enough that 100-spin streams actually have hits (needed by
    replay-gate determinism tests)."""
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
            {"combo": ["high1"] * 4, "pays": pay // 4},
            {"combo": ["high1"] * 3, "pays": pay // 10},
            {"combo": ["low1"] * 5, "pays": 20},
            {"combo": ["low1"] * 4, "pays": 5},
            {"combo": ["low1"] * 3, "pays": 2},
            {"combo": ["low2"] * 5, "pays": 10},
            {"combo": ["low2"] * 4, "pays": 3},
            {"combo": ["low2"] * 3, "pays": 1},
        ],
        "features": [{"kind": "free_spins"}],
    }


# ─── W19: Telemetry ────────────────────────────────────────────────


class TestTelemetrySchema(unittest.TestCase):
    def test_sample_session_validates(self):
        evs = sample_session()
        rep = validate_stream(evs)
        self.assertTrue(rep.passed,
                         f"sample session must validate: {rep.to_dict()}")
        self.assertGreater(rep.total_events, 0)

    def test_missing_event_type_errors(self):
        bad = {"event_id": "x", "ts_utc": "2026-01-01T00:00:00Z",
                "session_id": "x", "swid": "x", "payload": {}}
        issues = validate_event(bad)
        self.assertTrue(any(i.severity == "error" for i in issues))

    def test_unknown_event_type_warns(self):
        ev = {
            "event_type": "slot.made_up",
            "event_id": "550e8400-e29b-41d4-a716-446655440000",
            "ts_utc": "2026-01-01T00:00:00Z",
            "session_id": "550e8400-e29b-41d4-a716-446655440000",
            "swid": "X", "payload": {},
        }
        issues = validate_event(ev)
        self.assertTrue(any(i.severity == "warning" for i in issues))

    def test_required_payload_keys_enforced(self):
        ev = {
            "event_type": EventKind.SPIN_STARTED.value,
            "event_id": "550e8400-e29b-41d4-a716-446655440000",
            "ts_utc": "2026-01-01T00:00:00Z",
            "session_id": "550e8400-e29b-41d4-a716-446655440000",
            "swid": "X",
            "payload": {"bet": 1.0},   # missing stake_unit + rng_state
        }
        issues = validate_event(ev)
        msgs = [i.message for i in issues if i.severity == "error"]
        self.assertTrue(any("stake_unit" in m for m in msgs))

    def test_monotone_seq_enforced(self):
        evs = sample_session()
        # Inject a non-monotone seq
        evs[3]["seq"] = 1   # was 4
        rep = validate_stream(evs)
        self.assertFalse(rep.passed)
        self.assertTrue(any("seq" in (i.field or "")
                              for i in rep.issues))

    def test_cli_sample_emits_valid_json(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = tele_main(["--sample"])
        self.assertEqual(rc, 0)
        evs = json.loads(buf.getvalue())
        self.assertIsInstance(evs, list)

    def test_cli_validate_file(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "evs.json"
            p.write_text(json.dumps(sample_session()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = tele_main([str(p), "--quiet"])
            self.assertEqual(rc, 0)


# ─── W20: Plugin Bundle ────────────────────────────────────────────


class TestPluginBundle(unittest.TestCase):
    def test_semver_accepts_normal_strings(self):
        self.assertEqual(parse_semver("1.2.3"), (1, 2, 3, "", ""))
        self.assertEqual(parse_semver("0.1.0-alpha.1"),
                          (0, 1, 0, "alpha.1", ""))

    def test_semver_rejects_garbage(self):
        with self.assertRaises(ValueError):
            parse_semver("1.x.3")

    def test_build_bundle_zip_contains_manifest_and_games(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            games = d / "games"
            (games / "g").mkdir(parents=True)
            (games / "g" / "ir.json").write_text(json.dumps(_ir()))
            out = d / "dist"
            bundle = build_bundle(
                plugin_id="testplug",
                name="Test Plug",
                version="1.0.0",
                out_dir=out,
                games_dir=games,
                description="demo",
            )
            self.assertTrue(bundle.zip_path.exists())
            inspect = inspect_bundle(bundle.zip_path)
            self.assertEqual(inspect["manifest"]["id"], "testplug")
            self.assertEqual(inspect["manifest"]["version"], "1.0.0")
            self.assertTrue(inspect["passed"])

    def test_bad_plugin_id_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                build_bundle(
                    plugin_id="9badstart",
                    name="x", version="1.0.0",
                    out_dir=Path(d),
                )

    def test_cli_build_then_inspect(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "games" / "g").mkdir(parents=True)
            (d / "games" / "g" / "ir.json").write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = bundle_main([
                    "build",
                    "--id", "testplug",
                    "--name", "Test",
                    "--version", "0.1.0",
                    "--out", str(d / "out"),
                    "--games", str(d / "games"),
                ])
            self.assertEqual(rc, 0)
            zip_path = next((d / "out").iterdir())
            buf2 = io.StringIO()
            with redirect_stdout(buf2):
                rc2 = bundle_main(["inspect", str(zip_path)])
            self.assertEqual(rc2, 0)


# ─── W21: Replay Gate ──────────────────────────────────────────────


class TestReplayGate(unittest.TestCase):
    def test_record_then_check_passes(self):
        ir = _ir()
        bl = record_baseline(ir, seed=42, n_spins=100)
        result = replay_check(ir, bl)
        self.assertTrue(result.passed)
        self.assertEqual(result.mismatch_count, 0)

    def test_seed_change_breaks_replay(self):
        ir = _ir()
        bl = record_baseline(ir, seed=42, n_spins=100)
        bl_diff = record_baseline(ir, seed=99, n_spins=100)
        # Sanity: different seeds should produce different output hashes
        self.assertNotEqual(bl.output_sha256, bl_diff.output_sha256)

    def test_ir_tamper_breaks_replay(self):
        ir = _ir(pay=100)
        bl = record_baseline(ir, seed=42, n_spins=100)
        ir_tampered = _ir(pay=999)
        result = replay_check(ir_tampered, bl)
        # Synthetic sampler uses IR's RTP estimate which depends on
        # paytable; tampering pay changes RTP → output stream differs
        self.assertFalse(result.passed)
        self.assertGreater(result.mismatch_count, 0)

    def test_save_load_roundtrip(self):
        ir = _ir()
        bl = record_baseline(ir, seed=42, n_spins=50)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "bl.json"
            save_baseline(bl, p)
            loaded = load_baseline(p)
            self.assertEqual(loaded.output_sha256, bl.output_sha256)

    def test_cli_record_then_check(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            ir_p.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc1 = replay_main(["record", str(ir_p),
                                     "--seed", "42", "--spins", "100"])
            self.assertEqual(rc1, 0)
            buf2 = io.StringIO()
            with redirect_stdout(buf2):
                rc2 = replay_main(["check", str(ir_p)])
            self.assertEqual(rc2, 0)
            self.assertIn("PASSED", buf2.getvalue())


# ─── P1.6++++ batch 6 ──────────────────────────────────────────────


class TestLightningBomb(unittest.TestCase):
    REF = LightningBombParams(
        p_trigger=0.05,
        n_bombs=3,
        reels=5,
        rows=3,
        mult_dist={2: 0.5, 3: 0.3, 5: 0.15, 10: 0.05},
        base_line_rtp=0.5,
    )

    def test_em(self):
        em = expected_multiplier(self.REF)
        # 2*0.5 + 3*0.3 + 5*0.15 + 10*0.05 = 1 + 0.9 + 0.75 + 0.5 = 3.15
        self.assertAlmostEqual(em, 3.15, places=4)

    def test_rtp_positive(self):
        r = lb_rtp(self.REF)
        self.assertGreater(r, 0)

    def test_invalid_p_trigger_rejected(self):
        bad = LightningBombParams(
            p_trigger=2.0, n_bombs=1, reels=5, rows=3,
            mult_dist={2: 1.0}, base_line_rtp=0.5,
        )
        with self.assertRaises(ValueError):
            lb_rtp(bad)


class TestCoinStorm(unittest.TestCase):
    REF = CoinStormParams(
        p_trigger=0.02,
        n_cells=15,
        p_coin_per_cell=0.10,
        coin_dist={1.0: 0.5, 5.0: 0.3, 25.0: 0.15, 100.0: 0.05},
    )

    def test_expected_per_trigger(self):
        # E[V] = 0.5 + 1.5 + 3.75 + 5 = 10.75
        # n*p*E[V] = 15 * 0.10 * 10.75 = 16.125
        self.assertAlmostEqual(expected_pay_per_trigger(self.REF),
                                16.125, places=4)

    def test_variance_positive(self):
        self.assertGreater(variance_pay_per_trigger(self.REF), 0)

    def test_mc_convergence(self):
        a = cs_rtp(self.REF)
        mc = cs_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestRespinLock(unittest.TestCase):
    REF = RespinLockParams(
        total_cells=15,
        n_initial_locks=3,
        p_land_per_cell=0.05,
        consec_misses_to_end=3,
        locked_cell_value=1.0,
    )

    def test_rtp_positive(self):
        r = rl_rtp(self.REF)
        self.assertGreater(r, 0)

    def test_mc_yields_at_least_initial(self):
        mc = rl_mc(self.REF, sessions=5_000, seed=42)
        self.assertGreaterEqual(mc["mean_final_locks"], 3)

    def test_full_grid_caps_locked(self):
        # Maximum is total_cells
        self.assertLessEqual(rl_rtp(self.REF), self.REF.total_cells)


class TestWildPathClear(unittest.TestCase):
    REF = WildPathClearParams(
        p_trigger=0.10,
        p_continue=0.5,
        reels=5,
        reward_per_reel=2.0,
    )

    def test_expected_path_length(self):
        # (1 - 0.5^5) / (1 - 0.5) = (1 - 0.03125) / 0.5 = 1.9375
        L = expected_path_length(self.REF)
        self.assertAlmostEqual(L, 1.9375, places=4)

    def test_rtp_formula(self):
        # 0.10 × 1.9375 × 2 = 0.3875
        self.assertAlmostEqual(wp_rtp(self.REF), 0.3875, places=4)

    def test_mc_convergence(self):
        a = wp_rtp(self.REF)
        mc = wp_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)

    def test_zero_continue_collapses_to_single_reel(self):
        p = WildPathClearParams(p_trigger=0.1, p_continue=0.0,
                                  reels=5, reward_per_reel=1.0)
        self.assertEqual(expected_path_length(p), 1.0)


if __name__ == "__main__":
    unittest.main()
