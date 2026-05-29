"""W5.4 (mutation engine) + W5.5 (Z3 solver cache) tests."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir, apply_mutation,
    list_supported_mutations,
)
from tools.smt.weight_synthesizer import (
    synth_uniform_weights,
)
from tools.smt.cache import (
    cache_key, cached_synth, load_cached, store_cached,
)


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")


# ─── W5.4 — Mutation engine ────────────────────────────────────────────


class TestMutateRtp(unittest.TestCase):
    def test_raise_rtp_simple(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "raise RTP to 97")
        self.assertEqual(new.constraints.target_rtp, 0.97)
        self.assertEqual(log.applied_count, 1)
        self.assertEqual(log.ops[0].kind, "rtp")

    def test_rtp_with_percent_sign(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "set RTP to 95.5%")
        self.assertEqual(new.constraints.target_rtp, 0.955)

    def test_rtp_fractional_input(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "set target RTP to 0.93")
        self.assertEqual(new.constraints.target_rtp, 0.93)

    def test_rtp_out_of_range_rejected(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "raise RTP to 150")
        # Out of range → no change
        self.assertEqual(new.constraints.target_rtp, spec.constraints.target_rtp)
        self.assertTrue(any("outside" in e for e in log.errors))


class TestMutateVolatility(unittest.TestCase):
    def test_set_to_high(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "set volatility to high")
        self.assertEqual(new.constraints.volatility_class, "high")
        self.assertEqual(log.ops[0].kind, "volatility")

    def test_unknown_class_rejected(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "set volatility to extreme")
        self.assertEqual(new.constraints.volatility_class, "medium")
        self.assertTrue(log.errors)


class TestMutateHitFreq(unittest.TestCase):
    def test_bump_hit_freq(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "bump hit_freq to 0.30")
        self.assertEqual(new.constraints.hit_freq_target, 0.30)

    def test_hit_freq_percent_normalized(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "set hit_freq to 25%")
        self.assertEqual(new.constraints.hit_freq_target, 0.25)


class TestMutateMaxWin(unittest.TestCase):
    def test_set_max_win(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "set max_win to 25000")
        self.assertEqual(new.constraints.max_win_x, 25000)

    def test_underscore_separator(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "raise max_win to 100_000")
        self.assertEqual(new.constraints.max_win_x, 100000)


class TestMutateTopology(unittest.TestCase):
    def test_swap_5x3_to_6x4(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "swap topology to 6x4")
        self.assertEqual(new.topology.reels, 6)
        self.assertEqual(new.topology.rows, 4)
        self.assertEqual(new.topology.kind, "rectangular")
        self.assertEqual(log.ops[0].kind, "topology")


class TestMutateJurisdictions(unittest.TestCase):
    def test_add_jurisdiction(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "add jurisdiction KSA")
        self.assertIn("KSA", new.constraints.jurisdictions)

    def test_remove_jurisdiction(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "remove jurisdiction ADM")
        self.assertNotIn("ADM", new.constraints.jurisdictions)

    def test_add_already_present_idempotent(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "add jurisdiction UKGC")
        self.assertEqual(new.constraints.jurisdictions,
                         spec.constraints.jurisdictions)
        self.assertEqual(log.ops[0].applied, False)


class TestMutateFeatures(unittest.TestCase):
    def test_add_feature_linear_progressive(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "add feature linear_progressive")
        kinds = [f.kind for f in new.features]
        self.assertIn("linear_progressive", kinds)
        prog = next(f for f in new.features if f.kind == "linear_progressive")
        self.assertEqual(prog.pool_id, "default-progressive")

    def test_remove_feature(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "remove feature free_spins")
        kinds = [f.kind for f in new.features]
        self.assertNotIn("free_spins", kinds)

    def test_unknown_feature_rejected(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(spec, "add feature time_travel")
        kinds = [f.kind for f in new.features]
        self.assertNotIn("time_travel", kinds)
        self.assertTrue(log.errors)


class TestMutateHints(unittest.TestCase):
    def test_set_reel_length(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "set reel_length to 80")
        self.assertEqual(new.hints["reel_length"], 80)


class TestChainedMutations(unittest.TestCase):
    def test_semicolon_chain(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(
            spec,
            "raise RTP to 97.5%; set volatility to high; add jurisdiction KSA",
        )
        self.assertEqual(new.constraints.target_rtp, 0.975)
        self.assertEqual(new.constraints.volatility_class, "high")
        self.assertIn("KSA", new.constraints.jurisdictions)
        self.assertEqual(log.applied_count, 3)

    def test_comma_chain(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, log = apply_mutation(
            spec, "set volatility to high, add jurisdiction KSA",
        )
        self.assertEqual(log.applied_count, 2)

    def test_compiles_after_mutation(self):
        spec = parse_spec(SPEC_CLASSIC)
        new, _ = apply_mutation(spec, "raise RTP to 95; swap topology to 6x4")
        ir = compile_to_ir(new)
        self.assertEqual(ir["topology"]["reels"], 6)
        self.assertEqual(ir["topology"]["rows"], 4)
        self.assertEqual(ir["limits"]["target_rtp"], 0.95)


class TestSupportedListing(unittest.TestCase):
    def test_list_supported_returns_examples(self):
        items = list_supported_mutations()
        self.assertGreater(len(items), 5)
        self.assertTrue(any("RTP" in x for x in items))
        self.assertTrue(any("volatility" in x for x in items))


# ─── W5.5 — Z3 solver cache ────────────────────────────────────────────


class TestCacheKey(unittest.TestCase):
    def test_key_deterministic(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        k1 = cache_key(ir, mode="C-1", target_rtp=0.96, reel_length=50.0,
                       tolerance=0.005)
        k2 = cache_key(ir, mode="C-1", target_rtp=0.96, reel_length=50.0,
                       tolerance=0.005)
        self.assertEqual(k1, k2)
        self.assertEqual(len(k1), 64)  # SHA-256 hex

    def test_key_changes_with_target(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        k1 = cache_key(ir, mode="C-1", target_rtp=0.96, reel_length=50.0)
        k2 = cache_key(ir, mode="C-1", target_rtp=0.95, reel_length=50.0)
        self.assertNotEqual(k1, k2)

    def test_key_changes_with_mode(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        k1 = cache_key(ir, mode="C-1", target_rtp=0.96)
        k2 = cache_key(ir, mode="C-4", target_rtp=0.96,
                       volatility_class="medium")
        self.assertNotEqual(k1, k2)

    def test_key_ignores_reel_weight_values(self):
        """The cache key should be invariant to seeded reel.base values —
        only the IR *shape* matters because the synthesizer overwrites."""
        spec = parse_spec(SPEC_CLASSIC)
        ir1 = compile_to_ir(spec)
        ir2 = compile_to_ir(spec)
        # Mutate seeded weights in ir2
        for reel in ir2["reels"]["base"]:
            for k in list(reel.keys()):
                reel[k] = reel[k] * 2.0
        k1 = cache_key(ir1, mode="C-1", target_rtp=0.96)
        k2 = cache_key(ir2, mode="C-1", target_rtp=0.96)
        self.assertEqual(k1, k2,
                         "cache key must not depend on seeded weights")


class TestCacheStore(unittest.TestCase):
    def test_store_and_load(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            sample = {"meta": {"name": "x"}, "limits": {"target_rtp": 0.96}}
            key = "deadbeef" * 8
            p = store_cached(key, sample, cache_dir=d)
            self.assertTrue(p.exists())
            loaded = load_cached(key, cache_dir=d)
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded["meta"]["name"], "x")
            self.assertIn("_cache_meta", loaded)
            self.assertEqual(loaded["_cache_meta"]["spec_hash"], key)

    def test_load_missing_returns_none(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertIsNone(load_cached("nonexistent" * 8, cache_dir=Path(td)))

    def test_hit_count_increments(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            key = "abc12345" * 8
            store_cached(key, {"x": 1}, cache_dir=d)
            l1 = load_cached(key, cache_dir=d)
            l2 = load_cached(key, cache_dir=d)
            l3 = load_cached(key, cache_dir=d)
            self.assertEqual(l1["_cache_meta"]["hit_count"], 1)
            self.assertEqual(l2["_cache_meta"]["hit_count"], 2)
            self.assertEqual(l3["_cache_meta"]["hit_count"], 3)


class TestCachedSynthIntegration(unittest.TestCase):
    """First call solves (slow), second call hits cache (fast)."""

    def test_classic_c1_cache_round_trip(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            spec = parse_spec(SPEC_CLASSIC)
            ir = compile_to_ir(spec)
            solved_a, info_a = cached_synth(
                synth_uniform_weights, ir,
                mode="C-1", target_rtp=0.96, reel_length=50.0,
                tolerance=0.005, cache_dir=d,
            )
            self.assertFalse(info_a["cache_hit"])
            self.assertGreater(info_a["elapsed_ms"], 0)
            # Re-run identical inputs → cache hit
            solved_b, info_b = cached_synth(
                synth_uniform_weights, ir,
                mode="C-1", target_rtp=0.96, reel_length=50.0,
                tolerance=0.005, cache_dir=d,
            )
            self.assertTrue(info_b["cache_hit"])
            self.assertEqual(info_b["elapsed_ms"], 0.0)
            # Cached IR equal to solved IR (mod _cache_meta)
            a_copy = {k: v for k, v in solved_a.items() if k != "_cache_meta"}
            b_copy = {k: v for k, v in solved_b.items() if k != "_cache_meta"}
            self.assertEqual(a_copy["reels"], b_copy["reels"])

    def test_bypass_flag_skips_cache(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            spec = parse_spec(SPEC_CLASSIC)
            ir = compile_to_ir(spec)
            cached_synth(synth_uniform_weights, ir,
                         mode="C-1", target_rtp=0.96, reel_length=50.0,
                         tolerance=0.005, cache_dir=d)
            # Bypass cache
            _, info = cached_synth(synth_uniform_weights, ir,
                                   mode="C-1", target_rtp=0.96, reel_length=50.0,
                                   tolerance=0.005, cache_dir=d, bypass=True)
            self.assertFalse(info["cache_hit"])
            self.assertGreater(info["elapsed_ms"], 0)


if __name__ == "__main__":
    unittest.main()
