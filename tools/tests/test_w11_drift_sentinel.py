"""W11 — Drift Sentinel tests.

Covers:
  • fingerprint determinism + sensitivity (paytable / reels matter,
    metadata does NOT)
  • RTP estimate works on both universal IR and vendor IR shapes
  • baseline store load/save round-trip
  • scan_directory NEW / UNCHANGED / DRIFTED / REMOVED / ERROR paths
  • severity classification (green/yellow/red)
  • CLI exit code 0/1/2 contract
"""
from __future__ import annotations
import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.drift_sentinel.baselines import (
    BaselineStore,
    load_baselines,
    save_baselines,
)
from tools.drift_sentinel.scanner import (
    bernoulli_rtp_estimate,
    canonical_projection,
    fingerprint,
)
from tools.drift_sentinel.sentinel import (
    DriftClass,
    DriftSeverity,
    scan_directory,
)
from tools.drift_sentinel.__main__ import main as sentinel_main


# ─── fixtures ──────────────────────────────────────────────────────


def _universal_ir(rtp_target: float = 0.95, pay_high: int = 100) -> dict:
    return {
        "schema_version": 1,
        "meta": {
            "id": "drift-test-001",
            "vendor": "vendor_c",
            "swid": "DRIFT-001",
            "target_rtp": rtp_target,
        },
        "topology": {"reels": 5, "rows": 3},
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
            {"combo": ["high1"] * 5, "pays": pay_high},
            {"combo": ["low1"] * 5, "pays": 20},
        ],
        "features": [{"kind": "free_spins", "config": {}}],
    }


def _vendor_ir() -> dict:
    return {
        "meta": {"vendor": "vendor_x", "swid": "VND-001"},
        "bg_reel_sets": [{
            "set": 1,
            "reels": [
                [{"symbol": "A", "weight": 1}] * 5,
                [{"symbol": "A", "weight": 1}] * 5,
                [{"symbol": "A", "weight": 1}] * 5,
                [{"symbol": "A", "weight": 1}] * 5,
                [{"symbol": "A", "weight": 1}] * 5,
            ],
        }],
        "paytable": [{"combo": ["A"] * 5, "pays": 50}],
    }


def _write_ir(d: Path, name: str, ir: dict) -> Path:
    p = d / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(ir, indent=2))
    return p


# ─── canonical / fingerprint ───────────────────────────────────────


class TestCanonicalProjection(unittest.TestCase):
    def test_projection_includes_paytable_and_reels(self):
        ir = _universal_ir()
        proj = canonical_projection(ir)
        self.assertIn("paytable", proj)
        self.assertIn("reels_base", proj)
        self.assertEqual(proj["vendor"], "vendor_c")

    def test_features_normalized_sorted(self):
        ir = _universal_ir()
        ir["features"] = [
            {"kind": "hold_and_win"},
            {"kind": "free_spins"},
            {"type": "wild_expand"},
        ]
        proj = canonical_projection(ir)
        self.assertEqual(
            proj["features"],
            ["free_spins", "hold_and_win", "wild_expand"],
        )


class TestFingerprint(unittest.TestCase):
    def test_deterministic(self):
        ir = _universal_ir()
        a = fingerprint(ir)
        b = fingerprint(copy.deepcopy(ir))
        self.assertEqual(a, b)

    def test_metadata_changes_do_not_affect_fingerprint(self):
        a = fingerprint(_universal_ir())
        ir2 = _universal_ir()
        ir2["meta"]["description"] = "added later"
        ir2["meta"]["author"] = "someone"
        # we hash a stable subset → these fields are not present
        b = fingerprint(ir2)
        self.assertEqual(a, b)

    def test_paytable_change_changes_fingerprint(self):
        a = fingerprint(_universal_ir(pay_high=100))
        b = fingerprint(_universal_ir(pay_high=200))
        self.assertNotEqual(a, b)

    def test_reel_change_changes_fingerprint(self):
        ir1 = _universal_ir()
        ir2 = _universal_ir()
        ir2["reels"]["base"][0][0] = "different"
        self.assertNotEqual(fingerprint(ir1), fingerprint(ir2))


class TestBernoulliRTP(unittest.TestCase):
    def test_returns_float_on_universal_ir(self):
        rtp = bernoulli_rtp_estimate(_universal_ir())
        self.assertIsNotNone(rtp)
        self.assertGreaterEqual(rtp, 0)

    def test_returns_float_on_vendor_ir(self):
        rtp = bernoulli_rtp_estimate(_vendor_ir())
        self.assertIsNotNone(rtp)
        # All-A reels with 5-OAK pays=50 ⇒ 1.0 * 50 = 50 over 1 line
        self.assertAlmostEqual(rtp, 50.0)

    def test_returns_none_without_reels(self):
        ir = {"paytable": [{"combo": ["A"] * 5, "pays": 10}]}
        self.assertIsNone(bernoulli_rtp_estimate(ir))


# ─── baseline store ────────────────────────────────────────────────


class TestBaselineStore(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            path = d / "bl.json"
            store = BaselineStore()
            store.upsert("a/ir.json", fingerprint="abc", rtp_estimate=0.95)
            store.upsert("b/ir.json", fingerprint="def", rtp_estimate=None)
            save_baselines(store, path)
            loaded = load_baselines(path)
            self.assertEqual(loaded.get("a/ir.json").fingerprint, "abc")
            self.assertEqual(loaded.get("a/ir.json").rtp_estimate, 0.95)
            self.assertIsNone(loaded.get("b/ir.json").rtp_estimate)

    def test_missing_file_yields_empty_store(self):
        store = load_baselines(Path("/nonexistent/path/bl.json"))
        self.assertEqual(store.known_keys(), set())

    def test_malformed_json_yields_empty_store(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "bad.json"
            p.write_text("not json {")
            store = load_baselines(p)
            self.assertEqual(store.known_keys(), set())


# ─── scan_directory ─────────────────────────────────────────────────


class TestScanDirectory(unittest.TestCase):
    def test_new_then_unchanged(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "game1/ir.json", _universal_ir())
            r1 = scan_directory(root, update_baseline=True)
            self.assertEqual(r1.counts[DriftClass.NEW.value], 1)
            r2 = scan_directory(root, update_baseline=False)
            self.assertEqual(r2.counts[DriftClass.UNCHANGED.value], 1)
            self.assertEqual(r2.counts[DriftClass.NEW.value], 0)

    def test_drifted_when_paytable_changes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "game1/ir.json", _universal_ir(pay_high=100))
            scan_directory(root, update_baseline=True)
            # Change pay → drift
            _write_ir(root, "game1/ir.json", _universal_ir(pay_high=200))
            r = scan_directory(root, update_baseline=False)
            self.assertEqual(r.counts[DriftClass.DRIFTED.value], 1)
            entry = next(e for e in r.entries if e.status == DriftClass.DRIFTED)
            self.assertIsNotNone(entry.delta_abs)
            self.assertGreater(entry.delta_abs, 0)

    def test_severity_classification(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=100))
            scan_directory(root, update_baseline=True)
            # Big paytable bump → red
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=1000))
            r = scan_directory(root)
            drifted = [e for e in r.entries if e.status == DriftClass.DRIFTED]
            self.assertEqual(len(drifted), 1)
            self.assertEqual(drifted[0].severity, DriftSeverity.RED)
            self.assertTrue(r.has_red)

    def test_removed_when_ir_disappears(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            ir_path = _write_ir(root, "g/ir.json", _universal_ir())
            scan_directory(root, update_baseline=True)
            ir_path.unlink()
            r = scan_directory(root)
            self.assertEqual(r.counts[DriftClass.REMOVED.value], 1)

    def test_error_on_malformed_ir(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bad").mkdir()
            (root / "bad" / "ir.json").write_text("not valid json")
            r = scan_directory(root)
            self.assertEqual(r.counts[DriftClass.ERROR.value], 1)
            self.assertTrue(r.has_error)

    def test_multiple_games(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g1/ir.json", _universal_ir())
            _write_ir(root, "g2/ir.json", _universal_ir(pay_high=50))
            _write_ir(root, "g3/ir.json", _universal_ir(pay_high=30))
            r = scan_directory(root, update_baseline=True)
            self.assertEqual(r.counts[DriftClass.NEW.value], 3)

    def test_markdown_render_includes_every_entry(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir())
            r = scan_directory(root, update_baseline=True)
            md = r.to_markdown()
            self.assertIn("Drift Sentinel Report", md)
            self.assertIn("g/ir.json", md)


# ─── CLI exit codes ────────────────────────────────────────────────


class TestCLI(unittest.TestCase):
    def test_clean_init_exit_one_unbaselined_new(self):
        """Without --update, NEW IRs are considered an unconfigured
        state → exit 1."""
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir())
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = sentinel_main([str(root)])
            self.assertEqual(rc, 1)
            self.assertIn("scanned", buf.getvalue())

    def test_update_then_clean_run_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir())
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc1 = sentinel_main([str(root), "--update", "--quiet"])
                rc2 = sentinel_main([str(root), "--quiet"])
            self.assertEqual(rc1, 0)
            self.assertEqual(rc2, 0)

    def test_red_drift_exit_one(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=100))
            sentinel_main([str(root), "--update", "--quiet"])
            _write_ir(root, "g/ir.json", _universal_ir(pay_high=10000))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = sentinel_main([str(root), "--quiet"])
            self.assertEqual(rc, 1)

    def test_error_exit_two(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "bad").mkdir()
            (root / "bad" / "ir.json").write_text("not json")
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = sentinel_main([str(root), "--update", "--quiet"])
            self.assertEqual(rc, 2)

    def test_json_and_markdown_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _write_ir(root, "g/ir.json", _universal_ir())
            json_p = root / "out" / "drift.json"
            md_p = root / "out" / "drift.md"
            buf = io.StringIO()
            with redirect_stdout(buf):
                sentinel_main([
                    str(root), "--update", "--quiet",
                    "--json", str(json_p),
                    "--markdown", str(md_p),
                ])
            self.assertTrue(json_p.exists())
            self.assertTrue(md_p.exists())
            j = json.loads(json_p.read_text())
            self.assertIn("entries", j)
            self.assertIn("counts", j)


if __name__ == "__main__":
    unittest.main()
