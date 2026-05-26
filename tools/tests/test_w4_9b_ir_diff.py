"""W4.9b — Cross-IR diff tool tests.

Verifies:
  • identical IRs → no changes
  • meta + topology deltas captured
  • paytable added / removed / changed lookup by signature
  • feature presence diff (both directions)
  • reel-set count delta
  • Bernoulli RTP estimate Δ
  • emit JSON + HTML
  • CLI happy path + error branches + stdout default

Run:
    python -m unittest tools.tests.test_w4_9b_ir_diff
"""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.diagnostics.ir_diff import (
    compute_diff,
    emit_diff,
    main as diff_main,
)


_BASE_IR = {
    "meta": {"name": "Slot A", "swid": "X-001", "vendor": "synth",
             "target_rtp": 0.96},
    "topology": {"reels": 5, "rows": 3, "paylines": 20},
    "paytable": [
        {"combo": ["Red", "Red", "Red"], "pays": 5.0, "scope": "line"},
        {"combo": ["Red", "Red", "Red", "Red"], "pays": 20.0, "scope": "line"},
        {"combo": ["Blue", "Blue", "Blue"], "pays": 2.0, "scope": "line"},
    ],
    "features": [{"kind": "free_spins"}, {"kind": "hold_and_win"}],
    "bg_reel_sets": [{"reels": [["Red", "Blue", "Red", "Wild"] for _ in range(5)]}],
    "fg_reel_sets": [{"reels": [["Red", "Wild", "Red"] for _ in range(5)]}],
}


def _ir_b_with_changes() -> dict:
    """Variant: bumped pay on Red3oak + new Yellow row + added feature."""
    import copy
    b = copy.deepcopy(_BASE_IR)
    b["meta"]["name"] = "Slot B"
    b["paytable"][0]["pays"] = 10.0  # Red3oak: 5 → 10
    b["paytable"].append(
        {"combo": ["Yellow", "Yellow", "Yellow"], "pays": 3.0, "scope": "line"}
    )
    # Remove Blue3oak
    b["paytable"] = [e for e in b["paytable"]
                       if e["combo"][0] != "Blue"]
    b["features"].append({"kind": "wild_expand"})
    return b


class TestComputeDiff(unittest.TestCase):
    def test_identical_irs_no_changes(self):
        d = compute_diff(_BASE_IR, _BASE_IR)
        self.assertFalse(d.has_changes)
        self.assertEqual(d.meta_delta, {})
        self.assertEqual(d.topology_delta, {})
        self.assertEqual(d.paytable_added, [])
        self.assertEqual(d.paytable_changed, [])

    def test_meta_delta_caught(self):
        b = {**_BASE_IR, "meta": {**_BASE_IR["meta"], "name": "Slot B"}}
        d = compute_diff(_BASE_IR, b)
        self.assertIn("name", d.meta_delta)
        self.assertEqual(d.meta_delta["name"]["a"], "Slot A")
        self.assertEqual(d.meta_delta["name"]["b"], "Slot B")
        self.assertTrue(d.has_changes)

    def test_topology_delta_caught(self):
        b = {**_BASE_IR, "topology": {**_BASE_IR["topology"], "reels": 6}}
        d = compute_diff(_BASE_IR, b)
        self.assertIn("reels", d.topology_delta)
        self.assertEqual(d.topology_delta["reels"]["a"], 5)
        self.assertEqual(d.topology_delta["reels"]["b"], 6)

    def test_paytable_added_detected(self):
        b = _ir_b_with_changes()
        d = compute_diff(_BASE_IR, b)
        sigs = [e["combo"][0] for e in d.paytable_added]
        self.assertIn("Yellow", sigs)

    def test_paytable_removed_detected(self):
        b = _ir_b_with_changes()
        d = compute_diff(_BASE_IR, b)
        sigs = [e["combo"][0] for e in d.paytable_removed]
        self.assertIn("Blue", sigs)

    def test_paytable_changed_detected(self):
        b = _ir_b_with_changes()
        d = compute_diff(_BASE_IR, b)
        self.assertEqual(len(d.paytable_changed), 1)
        ch = d.paytable_changed[0]
        self.assertEqual(ch["pays_a"], 5.0)
        self.assertEqual(ch["pays_b"], 10.0)
        self.assertAlmostEqual(ch["delta"], 5.0)

    def test_features_diff_bidirectional(self):
        b = _ir_b_with_changes()
        d = compute_diff(_BASE_IR, b)
        self.assertEqual(d.features_a_only, [])
        self.assertIn("wild_expand", d.features_b_only)

    def test_reel_set_count_delta(self):
        b = _ir_b_with_changes()
        b["bg_reel_sets"].append(
            {"reels": [["Red", "Wild"] for _ in range(5)]},
        )
        d = compute_diff(_BASE_IR, b)
        self.assertEqual(d.reel_set_count_delta["base"], 1)
        self.assertEqual(d.reel_set_count_delta["fs"], 0)

    def test_rtp_estimate_delta_present(self):
        b = _ir_b_with_changes()
        d = compute_diff(_BASE_IR, b)
        # Both have non-trivial reel sets + paytables, so both should
        # produce non-None RTP estimates.
        self.assertIsNotNone(d.rtp_estimate_a)
        self.assertIsNotNone(d.rtp_estimate_b)
        # B has higher pays on Red3oak → B should be ≥ A.
        self.assertGreaterEqual(d.rtp_estimate_b, d.rtp_estimate_a)


class TestEmitDiff(unittest.TestCase):
    def test_emit_dir_writes_both(self):
        d = compute_diff(_BASE_IR, _ir_b_with_changes())
        with tempfile.TemporaryDirectory() as td:
            paths = emit_diff(d, out_dir=Path(td))
            self.assertTrue(paths["json"].is_file())
            self.assertTrue(paths["html"].is_file())

    def test_emit_explicit_paths(self):
        d = compute_diff(_BASE_IR, _ir_b_with_changes())
        with tempfile.TemporaryDirectory() as td:
            jp = Path(td) / "x.json"
            hp = Path(td) / "x.html"
            paths = emit_diff(d, out_json=jp, out_html=hp)
            self.assertEqual(paths["json"], jp)
            self.assertEqual(paths["html"], hp)
            self.assertTrue(jp.is_file())
            self.assertTrue(hp.is_file())

    def test_json_round_trips(self):
        d = compute_diff(_BASE_IR, _ir_b_with_changes())
        with tempfile.TemporaryDirectory() as td:
            paths = emit_diff(d, out_dir=Path(td))
            data = json.loads(paths["json"].read_text())
            self.assertTrue(data["has_changes"])
            self.assertIn("paytable_changed", data)


class TestCli(unittest.TestCase):
    def test_cli_writes_dir_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            a_path = Path(td) / "a.json"
            b_path = Path(td) / "b.json"
            a_path.write_text(json.dumps(_BASE_IR))
            b_path.write_text(json.dumps(_ir_b_with_changes()))
            out = Path(td) / "out"
            rc = diff_main([
                str(a_path), str(b_path),
                "--out-dir", str(out), "--quiet",
            ])
            self.assertEqual(rc, 0)
            self.assertTrue((out / "diff.json").is_file())
            self.assertTrue((out / "diff.html").is_file())

    def test_cli_missing_a(self):
        rc = diff_main(["/nonexistent/a.json", "/nonexistent/b.json",
                         "--quiet"])
        self.assertEqual(rc, 2)

    def test_cli_explicit_json_only(self):
        with tempfile.TemporaryDirectory() as td:
            a_path = Path(td) / "a.json"
            b_path = Path(td) / "b.json"
            a_path.write_text(json.dumps(_BASE_IR))
            b_path.write_text(json.dumps(_BASE_IR))  # identical
            jp = Path(td) / "explicit.json"
            rc = diff_main([
                str(a_path), str(b_path),
                "--out-json", str(jp), "--quiet",
            ])
            self.assertEqual(rc, 0)
            self.assertTrue(jp.is_file())
            data = json.loads(jp.read_text())
            self.assertFalse(data["has_changes"])


if __name__ == "__main__":
    unittest.main()
