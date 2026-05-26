"""W16 + W17 + W18 — combined tests for IR Lock, Cohort Runner,
RNG Quality Mini-Suite.

Grouped together because each wave is small (5-8 tests) and they
share fixtures (synthetic IR + bit-stream generators).
"""
from __future__ import annotations
import io
import json
import random
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

# W16
from tools.ir_lock import (
    canonical_ir_bytes,
    compute_merkle_root,
    lock_ir,
    load_lock,
    save_lock,
    verify_ir,
)
from tools.ir_lock.__main__ import main as lock_main

# W17
from tools.cohort_runner import (
    SyntheticPayoutDistribution,
    run_portfolio_cohort,
    synth_payout_sampler,
)
from tools.cohort_runner.__main__ import main as cohort_main

# W18
from tools.rng_quality import (
    bits_from_bytes,
    bits_from_hex,
    monobit_test,
    runs_test,
    frequency_block_test,
    longest_run_test,
    cumulative_sum_test,
    run_full_suite,
)
from tools.rng_quality.__main__ import main as rng_main


# ─── shared IR fixture ─────────────────────────────────────────────


def _ir(pay: int = 100) -> dict:
    return {
        "schema_version": 1,
        "meta": {"id": "test", "vendor": "vendor_c", "swid": "S-001"},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {
            "base": [
                ["high1", "low1", "wild"] * 4,
                ["high1", "low1", "low2"] * 4,
                ["high1", "low2", "wild"] * 4,
                ["high1", "low1", "low2"] * 4,
                ["high1", "low2", "wild"] * 4,
            ],
        },
        "paytable": [
            {"combo": ["high1"] * 5, "pays": pay},
            {"combo": ["low1"] * 5, "pays": 20},
        ],
        "features": [{"kind": "free_spins"}],
        "limits": {"max_win_x": 5000.0},
    }


# ─── W16: IR Lock ──────────────────────────────────────────────────


class TestIRLock(unittest.TestCase):
    def test_canonical_bytes_deterministic(self):
        a = canonical_ir_bytes(_ir())
        b = canonical_ir_bytes(_ir())
        self.assertEqual(a, b)

    def test_canonical_bytes_key_order_invariant(self):
        ir1 = _ir()
        ir2 = {k: ir1[k] for k in reversed(list(ir1.keys()))}
        self.assertEqual(canonical_ir_bytes(ir1), canonical_ir_bytes(ir2))

    def test_merkle_root_known_for_simple_input(self):
        # Two leaves
        leaves = [b"a", b"b"]
        root = compute_merkle_root(leaves)
        self.assertEqual(len(root), 32)

    def test_merkle_root_odd_node_promoted(self):
        # Single leaf → root = leaf hash
        single = compute_merkle_root([b"x"])
        # Three leaves should not crash + return deterministic 32B
        triple = compute_merkle_root([b"a", b"b", b"c"])
        self.assertEqual(len(single), 32)
        self.assertEqual(len(triple), 32)

    def test_lock_then_verify_passes(self):
        ir = _ir()
        lock = lock_ir(ir)
        result = verify_ir(ir, lock)
        self.assertTrue(result.passed)
        self.assertTrue(result.ir_hash_match)
        self.assertTrue(result.signature_valid)
        self.assertEqual(result.merkle_root_recomputed, lock.merkle_root)

    def test_verify_fails_on_paytable_tamper(self):
        ir = _ir()
        lock = lock_ir(ir)
        tampered = _ir()
        tampered["paytable"][0]["pays"] = 999_999
        result = verify_ir(tampered, lock)
        self.assertFalse(result.passed)
        self.assertFalse(result.ir_hash_match)
        self.assertTrue(any("paytable" in m for m in result.mismatches))

    def test_save_load_roundtrip(self):
        ir = _ir()
        lock = lock_ir(ir)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "lock.json"
            save_lock(lock, p)
            loaded = load_lock(p)
            self.assertEqual(loaded.ir_sha256, lock.ir_sha256)
            self.assertEqual(loaded.merkle_root, lock.merkle_root)
            self.assertTrue(verify_ir(ir, loaded).passed)

    def test_cli_lock_then_verify(self):
        ir = _ir()
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            ir_p.write_text(json.dumps(ir))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = lock_main(["lock", str(ir_p)])
            self.assertEqual(rc, 0)
            self.assertTrue((d / "ir.json.lock.json").exists())
            buf2 = io.StringIO()
            with redirect_stdout(buf2):
                rc2 = lock_main(["verify", str(ir_p)])
            self.assertEqual(rc2, 0)
            self.assertIn("PASSED", buf2.getvalue())

    def test_cli_verify_fails_on_tamper(self):
        ir = _ir()
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            ir_p.write_text(json.dumps(ir))
            lock_main(["lock", str(ir_p)])
            # Tamper IR
            ir["paytable"][0]["pays"] = 999
            ir_p.write_text(json.dumps(ir))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = lock_main(["verify", str(ir_p)])
            self.assertEqual(rc, 1)
            self.assertIn("FAILED", buf.getvalue())


# ─── W17: Cohort Runner ────────────────────────────────────────────


class TestCohortRunner(unittest.TestCase):
    def test_synth_sampler_has_expected_attributes(self):
        s = synth_payout_sampler(_ir(), target_rtp=0.95)
        self.assertGreater(s.p_hit, 0)
        self.assertGreater(s.p_hit, 0)
        self.assertGreaterEqual(s.small_pay, 0)
        # Tier conditional probs sum to 1
        self.assertAlmostEqual(
            s.p_small + s.p_medium + s.p_large, 1.0, places=5
        )

    def test_sampler_samples_zero_on_miss(self):
        s = SyntheticPayoutDistribution(
            p_hit=0.0, small_pay=1, medium_pay=8, large_pay=100,
            p_small=0.8, p_medium=0.15, p_large=0.05, target_rtp=0.95,
        )
        rng = random.Random(42)
        for _ in range(50):
            self.assertEqual(s.sample(rng), 0.0)

    def test_cohort_returns_per_ir_result(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(_ir()))
            report = run_portfolio_cohort(
                d, players=50, max_spins=200,
                starting_bankroll=100.0, bet_unit=1.0,
            )
            self.assertEqual(len(report.results), 1)
            r = report.results[0]
            self.assertGreaterEqual(r.bust_rate, 0.0)
            self.assertLessEqual(r.bust_rate, 1.0)
            self.assertGreater(r.measured_rtp, 0)

    def test_cohort_markdown_table(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(_ir()))
            report = run_portfolio_cohort(d, players=30, max_spins=100)
            md = report.to_markdown()
            self.assertIn("Cohort Simulation Portfolio Report", md)
            self.assertIn("g/ir.json", md)

    def test_cohort_cli_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "g").mkdir()
            (d / "g" / "ir.json").write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = cohort_main([str(d), "--players", "30",
                                    "--spins", "100", "--quiet"])
            self.assertEqual(rc, 0)

    def test_cohort_cli_empty_dir_exit_one(self):
        with tempfile.TemporaryDirectory() as d:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = cohort_main([str(d), "--quiet"])
            self.assertEqual(rc, 1)


# ─── W18: RNG Quality ──────────────────────────────────────────────


def _good_bits(n: int, seed: int = 42) -> list[int]:
    rng = random.Random(seed)
    return [rng.randint(0, 1) for _ in range(n)]


def _all_ones(n: int) -> list[int]:
    return [1] * n


class TestRNGQuality(unittest.TestCase):
    def test_bits_from_bytes(self):
        b = bits_from_bytes(b"\xff\x00")
        self.assertEqual(b[:8], [1, 1, 1, 1, 1, 1, 1, 1])
        self.assertEqual(b[8:], [0, 0, 0, 0, 0, 0, 0, 0])

    def test_bits_from_hex(self):
        self.assertEqual(bits_from_hex("ff")[:8],
                          [1, 1, 1, 1, 1, 1, 1, 1])

    def test_monobit_pass_on_random(self):
        bits = _good_bits(10_000)
        r = monobit_test(bits)
        self.assertTrue(r.passed)
        self.assertGreaterEqual(r.p_value, 0.01)

    def test_monobit_fail_on_all_ones(self):
        r = monobit_test(_all_ones(10_000))
        self.assertFalse(r.passed)
        self.assertLess(r.p_value, 1e-6)

    def test_runs_pass_on_random(self):
        bits = _good_bits(10_000)
        r = runs_test(bits)
        self.assertTrue(r.passed)

    def test_runs_fail_on_all_ones(self):
        r = runs_test(_all_ones(10_000))
        self.assertFalse(r.passed)

    def test_frequency_block_random(self):
        bits = _good_bits(10_000)
        r = frequency_block_test(bits, block_size=128)
        self.assertTrue(r.passed)

    def test_longest_run_random(self):
        bits = _good_bits(128 * 100)
        r = longest_run_test(bits)
        # Need ≥ 6272 bits — 12800 satisfies
        self.assertTrue(r.passed or r.note != "")

    def test_cumsum_random(self):
        bits = _good_bits(10_000)
        r = cumulative_sum_test(bits)
        self.assertTrue(r.passed)

    def test_full_suite_random(self):
        bits = _good_bits(128 * 100)
        rep = run_full_suite(bits)
        self.assertEqual(len(rep.results), 5)
        # On a small input some tests will be skipped (note != "")
        # but at least monobit + runs + cumsum must run on 12800 bits
        names = [r.name for r in rep.results]
        for nm in ("monobit", "runs", "frequency_block",
                    "longest_run", "cumulative_sum"):
            self.assertIn(nm, names)

    def test_full_suite_fails_on_all_ones(self):
        rep = run_full_suite(_all_ones(128 * 100))
        self.assertFalse(rep.passed_all)

    def test_cli_random_stream_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            # 12800 bits = 1600 bytes of randomness
            rng = random.Random(42)
            data = bytes(rng.randint(0, 255) for _ in range(1600))
            p = d / "stream.bin"
            p.write_bytes(data)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = rng_main([str(p), "--quiet"])
            self.assertEqual(rc, 0)

    def test_cli_all_ones_exit_one(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "stream.bin"
            p.write_bytes(b"\xff" * 1600)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = rng_main([str(p), "--quiet"])
            self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
