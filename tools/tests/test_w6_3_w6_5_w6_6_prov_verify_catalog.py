"""W6.3 (provenance auto-sign) + W6.5 (closed-form verifier) + W6.6 (catalog index)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir,
    sign_ir, verify_ir, sign_and_inject_provenance, verify_provenance,
    ir_sha256,
    verify_rtp, verify_volatility, verify_all,
    VerifyReport, hit_freq_closed_form,
    build_catalog, filter_catalog,
)
from tools.smt.weight_synthesizer import synth_uniform_weights


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")


# ─── W6.3 — Provenance auto-sign ───────────────────────────────────────


class TestProvenanceSign(unittest.TestCase):
    def test_sign_and_verify_round_trip(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        sig = sign_ir(ir)
        self.assertEqual(len(sig), 64)
        self.assertTrue(verify_ir(ir, sig))

    def test_signature_changes_on_ir_mutation(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        sig1 = sign_ir(ir)
        # Mutate paytable
        first_sym = next(iter(ir["paytable"]))
        ir["paytable"][first_sym]["5"] = ir["paytable"][first_sym]["5"] + 100
        sig2 = sign_ir(ir)
        self.assertNotEqual(sig1, sig2)

    def test_transient_keys_ignored_by_signature(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        sig1 = sign_ir(ir)
        ir["_synth_log"] = {"mode": "C-1", "elapsed_ms": 42}
        ir["_cache_meta"] = {"hit_count": 5}
        sig2 = sign_ir(ir)
        # Transient keys must NOT affect signature
        self.assertEqual(sig1, sig2)

    def test_inject_provenance_round_trip(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        signed = sign_and_inject_provenance(
            ir, vendor="vendor_b", par_source="PAR_001.tsv",
            swid="200-1637-001", build_hash="abc123",
        )
        ok, reason = verify_provenance(signed)
        self.assertTrue(ok, f"verify failed: {reason}")
        self.assertEqual(signed["provenance"]["vendor"], "vendor_b")
        self.assertEqual(signed["provenance"]["swid"], "200-1637-001")
        self.assertEqual(signed["provenance"]["build_hash"], "abc123")

    def test_tampered_ir_fails_verify(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        signed = sign_and_inject_provenance(
            ir, vendor="x", par_source="x.tsv",
        )
        # Tamper paytable
        first_sym = next(iter(signed["paytable"]))
        signed["paytable"][first_sym]["3"] = signed["paytable"][first_sym]["3"] + 1
        ok, reason = verify_provenance(signed)
        self.assertFalse(ok)
        self.assertIn("mismatch", reason.lower())

    def test_no_provenance_block_fails_verify(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        ok, reason = verify_provenance(ir)
        self.assertFalse(ok)
        self.assertIn("no provenance", reason.lower())

    def test_custom_key_must_match(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        sig = sign_ir(ir, key=b"secret-key-A")
        self.assertTrue(verify_ir(ir, sig, key=b"secret-key-A"))
        self.assertFalse(verify_ir(ir, sig, key=b"secret-key-B"))

    def test_ir_sha256_deterministic(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir1 = compile_to_ir(spec)
        ir2 = compile_to_ir(spec)
        self.assertEqual(ir_sha256(ir1), ir_sha256(ir2))


# ─── W6.5 — Closed-form verifier ───────────────────────────────────────


class TestClosedFormVerify(unittest.TestCase):
    def test_verify_rtp_pass(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0,
                                       tolerance=0.005)
        res = verify_rtp(solved, target=0.96, tolerance=0.01)
        self.assertTrue(res.ok)
        self.assertLess(res.delta, 0.01)

    def test_verify_rtp_fail_when_target_off(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0,
                                       tolerance=0.005)
        # Synth hit 0.96 — verify against 0.80 must fail
        res = verify_rtp(solved, target=0.80, tolerance=0.005)
        self.assertFalse(res.ok)

    def test_hit_freq_closed_form_returns_fraction(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        hf = hit_freq_closed_form(solved)
        self.assertGreaterEqual(hf, 0.0)
        self.assertLessEqual(hf, 1.0)

    def test_verify_volatility_class_matches(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        from tools.smt.weight_synthesizer import volatility_class_of
        actual = volatility_class_of(solved)
        res = verify_volatility(solved, actual)
        self.assertTrue(res.ok)

    def test_verify_all_aggregates(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0,
                                       tolerance=0.005)
        report = verify_all(
            solved, target_rtp=0.96, rtp_tolerance=0.01,
            target_hit_freq=0.24, hit_freq_tolerance=0.5,
            ir_name="Crimson Tiger",
        )
        self.assertIsInstance(report, VerifyReport)
        self.assertEqual(len(report.checks), 2)
        # rtp check must pass
        rtp_check = next(c for c in report.checks if c.name == "rtp")
        self.assertTrue(rtp_check.ok)

    def test_verify_report_summary_markdown(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0)
        report = verify_all(solved, target_rtp=0.96, rtp_tolerance=0.01)
        text = report.summary()
        self.assertIn("Verify report", text)
        self.assertIn("|", text)


# ─── W6.6 — Catalog index ─────────────────────────────────────────────


class TestCatalogBuild(unittest.TestCase):
    def test_catalog_indexes_all_specs(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        # We have 4 sample specs (classic, megaways, cluster, cascade)
        self.assertGreaterEqual(cat["count"], 4)
        names = {e["name"] for e in cat["specs"]}
        self.assertIn("Crimson Tiger", names)
        self.assertIn("Lion Megaways", names)
        self.assertIn("Coral Cluster", names)
        self.assertIn("Cascade Quest", names)

    def test_catalog_has_by_topology_index(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        self.assertIn("rectangular", cat["by_topology"])
        self.assertIn("variable_rows", cat["by_topology"])
        self.assertIn("cluster_grid", cat["by_topology"])

    def test_catalog_has_by_volatility_index(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        self.assertIn("medium", cat["by_volatility"])
        self.assertIn("high", cat["by_volatility"])

    def test_catalog_has_by_jurisdiction_index(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        self.assertIn("UKGC", cat["by_jurisdiction"])
        self.assertIn("MGA", cat["by_jurisdiction"])

    def test_filter_by_volatility(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        medium = filter_catalog(cat, volatility_class="medium")
        self.assertEqual(len(medium), 1)
        self.assertEqual(medium[0]["name"], "Crimson Tiger")

    def test_filter_by_topology_kind(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        ways = filter_catalog(cat, topology_kind="variable_rows")
        self.assertEqual(len(ways), 1)
        self.assertEqual(ways[0]["name"], "Lion Megaways")

    def test_filter_by_feature(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        cascading = filter_catalog(cat, feature_kind="cascade")
        # Cluster and Cascade specs both have cascade feature
        self.assertGreaterEqual(len(cascading), 2)

    def test_filter_combined(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        combo = filter_catalog(
            cat, jurisdiction="MGA", volatility_class="high",
        )
        self.assertGreaterEqual(len(combo), 1)

    def test_filter_no_match_returns_empty(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        out = filter_catalog(cat, jurisdiction="ZZZ")
        self.assertEqual(out, [])

    def test_catalog_sha256_present(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        for e in cat["specs"]:
            self.assertEqual(len(e["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
