"""W6.1 cert bundle + W6.2 DSL diff tests."""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir, apply_mutation, diff_specs, render_diff,
    build_cert_bundle,
)
from tools.smt.weight_synthesizer import synth_uniform_weights


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")


# ─── W6.2 — DSL diff ────────────────────────────────────────────────────


class TestDiff(unittest.TestCase):
    def test_no_changes_empty_diff(self):
        a = parse_spec(SPEC_CLASSIC)
        b = parse_spec(SPEC_CLASSIC)
        entries = diff_specs(a, b)
        self.assertEqual(entries, [])

    def test_rtp_change_detected(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "raise RTP to 97")
        entries = diff_specs(a, b)
        rtp_entries = [e for e in entries if "target_rtp" in e.path]
        self.assertEqual(len(rtp_entries), 1)
        self.assertEqual(rtp_entries[0].after, 0.97)
        self.assertEqual(rtp_entries[0].before, 0.96)

    def test_volatility_change_detected(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "set volatility to high")
        entries = diff_specs(a, b)
        vol_entries = [e for e in entries if "volatility_class" in e.path]
        self.assertEqual(len(vol_entries), 1)
        self.assertEqual(vol_entries[0].after, "high")

    def test_jurisdiction_added(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "add jurisdiction KSA")
        entries = diff_specs(a, b)
        j_entries = [e for e in entries if "jurisdictions" in e.path]
        self.assertGreaterEqual(len(j_entries), 1)

    def test_feature_added(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "add feature linear_progressive")
        entries = diff_specs(a, b)
        feat_entries = [e for e in entries if "linear_progressive" in e.path]
        self.assertGreaterEqual(len(feat_entries), 1)
        self.assertEqual(feat_entries[0].kind, "added")

    def test_feature_removed(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "remove feature free_spins")
        entries = diff_specs(a, b)
        rem = [e for e in entries if e.kind == "removed" and "free_spins" in e.path]
        self.assertEqual(len(rem), 1)

    def test_render_diff_markdown_table(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "raise RTP to 95.5; set volatility to ultra")
        entries = diff_specs(a, b)
        text = render_diff(entries)
        self.assertIn("|", text)
        self.assertIn("target_rtp", text)
        self.assertIn("volatility_class", text)

    def test_empty_diff_renders_no_changes(self):
        a = parse_spec(SPEC_CLASSIC)
        text = render_diff(diff_specs(a, a))
        self.assertIn("no semantic changes", text.lower())

    def test_topology_swap_detected(self):
        a = parse_spec(SPEC_CLASSIC)
        b, _ = apply_mutation(a, "swap topology to 6x4")
        entries = diff_specs(a, b)
        top_entries = [e for e in entries if "topology" in e.path]
        # Expect at least reels + rows changes
        paths = {e.path for e in top_entries}
        self.assertIn("topology.reels", paths)
        self.assertIn("topology.rows", paths)


# ─── W6.1 — Cert bundle ────────────────────────────────────────────────


class TestCertBundle(unittest.TestCase):
    def _build_solved_ir(self):
        spec = parse_spec(SPEC_CLASSIC)
        ir = compile_to_ir(spec)
        solved = synth_uniform_weights(ir, 0.96, reel_length=50.0,
                                       tolerance=0.005)
        return spec, solved

    def test_bundle_zip_created(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            self.assertTrue(zp.exists())
            self.assertTrue(zp.name.endswith(".zip"))
            self.assertGreater(zp.stat().st_size, 1000)

    def test_bundle_contains_all_required_files(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            with zipfile.ZipFile(zp) as z:
                names = set(z.namelist())
        required = {"README.md", "design.yaml", "game.ir.json",
                    "synth_log.json", "provenance.json", "verify.sh",
                    "manifest.json"}
        self.assertTrue(required.issubset(names),
                        f"missing: {required - names}")

    def test_manifest_sha256_matches_file_contents(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            with zipfile.ZipFile(zp) as z:
                manifest = json.loads(z.read("manifest.json"))
                for name, meta in manifest["files"].items():
                    data = z.read(name)
                    got = hashlib.sha256(data).hexdigest()
                    self.assertEqual(got, meta["sha256"],
                                     f"{name} SHA mismatch")

    def test_provenance_contains_target_rtp(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            with zipfile.ZipFile(zp) as z:
                prov = json.loads(z.read("provenance.json"))
        self.assertEqual(prov["math"]["target_rtp"], spec.constraints.target_rtp)
        self.assertEqual(prov["math"]["volatility_class"], "medium")
        self.assertEqual(prov["game"]["name"], "Crimson Tiger")

    def test_design_yaml_roundtrips_in_bundle(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            with zipfile.ZipFile(zp) as z:
                yaml_text = z.read("design.yaml").decode("utf-8")
        # Re-parse and assert constraint equivalence
        re_parsed = parse_spec(yaml_text)
        self.assertEqual(re_parsed.constraints.target_rtp,
                         spec.constraints.target_rtp)
        self.assertEqual(re_parsed.topology.kind, spec.topology.kind)
        self.assertEqual(re_parsed.topology.reels, spec.topology.reels)

    def test_solved_ir_excludes_transient_keys(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            with zipfile.ZipFile(zp) as z:
                ir_in_bundle = json.loads(z.read("game.ir.json"))
                synth_log = json.loads(z.read("synth_log.json"))
        # _synth_log and _cache_meta should NOT be in game.ir.json
        self.assertNotIn("_synth_log", ir_in_bundle)
        self.assertNotIn("_cache_meta", ir_in_bundle)
        # But synth_log.json should carry the log
        self.assertEqual(synth_log.get("mode"), "C-1_uniform")

    def test_bundle_digest_in_manifest(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td)
            with zipfile.ZipFile(zp) as z:
                manifest = json.loads(z.read("manifest.json"))
        self.assertIn("bundle_digest_sha256", manifest)
        self.assertEqual(len(manifest["bundle_digest_sha256"]), 64)

    def test_bundle_with_notes(self):
        spec, solved = self._build_solved_ir()
        with tempfile.TemporaryDirectory() as td:
            zp = build_cert_bundle(spec, solved, td, notes="iTechLabs Q3 submission")
            with zipfile.ZipFile(zp) as z:
                prov = json.loads(z.read("provenance.json"))
        self.assertEqual(prov.get("notes"), "iTechLabs Q3 submission")


if __name__ == "__main__":
    unittest.main()
