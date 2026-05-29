"""W58 — IR Diff CI Gate tests."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path

from tools.ir_diff_gate.gate import (
    GateConfig,
    GateSeverity,
    run_gate,
)


def _ir(seed: int = 0) -> dict:
    return {
        "meta": {
            "id": "g1",
            "name": "Test",
            "vendor": "vendor_a",
            "swid": "S-TEST",
            "target_rtp": 0.96,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3,
                     "paylines": 20},
        "evaluation": {"paylines": list(range(20))},
        "limits": {"max_win_x": 5000.0},
        "features": [{"kind": "free_spins"}],
        "reels": {"base": [["A", "B", "C", "D"] * 8 for _ in range(5)]},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 100 + seed},
            {"combo": ["A"] * 4, "pays": 50},
        ],
    }


class GatePassTest(unittest.TestCase):
    def test_identical_irs_pass(self):
        a, b = _ir(), _ir()
        report = run_gate(a, b)
        self.assertEqual(report.verdict, GateSeverity.PASS)
        self.assertEqual(report.exit_code(), 0)
        self.assertEqual(report.findings, [])

    def test_unrelated_meta_drift_allowed_by_default(self):
        a = _ir()
        b = _ir()
        b["meta"]["version"] = "1.0.1"
        report = run_gate(a, b)
        self.assertEqual(report.verdict, GateSeverity.PASS, msg=report.findings)

    def test_meta_drift_fails_when_disallowed(self):
        a = _ir()
        b = _ir()
        b["meta"]["version"] = "1.0.1"
        report = run_gate(a, b, config=GateConfig(allow_meta_drift=False))
        self.assertEqual(report.verdict, GateSeverity.WARN)
        self.assertEqual(report.exit_code(), 1)
        self.assertTrue(any(f.rule == "meta_drift" for f in report.findings))


class GateFailTest(unittest.TestCase):
    def test_paytable_pay_change_fails(self):
        a = _ir(0)
        b = _ir(50)
        report = run_gate(a, b)
        self.assertEqual(report.verdict, GateSeverity.FAIL)
        self.assertEqual(report.exit_code(), 2)
        rules = [f.rule for f in report.findings]
        self.assertIn("max_paytable_changes", rules)

    def test_paytable_changes_allowed_with_higher_limit(self):
        a = _ir(0)
        b = _ir(50)
        report = run_gate(
            a, b, config=GateConfig(max_paytable_changes=10,
                                    max_rtp_delta=1.0),
        )
        # max_rtp_delta=1.0 swallows the RTP delta; paytable_changes
        # limit raised → no findings.
        self.assertEqual(report.verdict, GateSeverity.PASS,
                         msg=[f.to_dict() for f in report.findings])

    def test_new_feature_addition_blocked_by_default(self):
        a = _ir()
        b = _ir()
        b["features"] = [{"kind": "free_spins"}, {"kind": "hold_and_win"}]
        report = run_gate(a, b, config=GateConfig(max_rtp_delta=1.0,
                                                  max_paytable_changes=100))
        self.assertEqual(report.verdict, GateSeverity.FAIL)
        self.assertTrue(any(f.rule == "feature_additions"
                            for f in report.findings))

    def test_new_feature_addition_allowed_when_flag_set(self):
        a = _ir()
        b = _ir()
        b["features"] = [{"kind": "free_spins"}, {"kind": "hold_and_win"}]
        report = run_gate(
            a, b,
            config=GateConfig(
                max_rtp_delta=1.0,
                max_paytable_changes=100,
                allow_feature_additions=True,
            ),
        )
        self.assertEqual(report.verdict, GateSeverity.PASS,
                         msg=[f.to_dict() for f in report.findings])

    def test_feature_removal_blocked_by_default(self):
        a = _ir()
        a["features"] = [{"kind": "free_spins"}, {"kind": "extra"}]
        b = _ir()
        b["features"] = [{"kind": "free_spins"}]
        report = run_gate(a, b, config=GateConfig(max_rtp_delta=1.0,
                                                  max_paytable_changes=100))
        self.assertEqual(report.verdict, GateSeverity.FAIL)
        self.assertTrue(any(f.rule == "feature_removals"
                            for f in report.findings))

    def test_topology_change_blocked_by_default(self):
        a = _ir()
        b = _ir()
        b["topology"]["reels"] = 6
        report = run_gate(a, b, config=GateConfig(max_rtp_delta=1.0,
                                                  max_paytable_changes=100))
        self.assertEqual(report.verdict, GateSeverity.FAIL)
        self.assertTrue(any(f.rule == "topology_change"
                            for f in report.findings))


class CliTest(unittest.TestCase):
    def test_cli_pass_exit_0(self):
        from tools.ir_diff_gate.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "a.json").write_text(json.dumps(_ir()))
            (td / "b.json").write_text(json.dumps(_ir()))
            rc = main([str(td / "a.json"), str(td / "b.json"), "--json"])
            self.assertEqual(rc, 0)

    def test_cli_fail_exit_2(self):
        from tools.ir_diff_gate.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "a.json").write_text(json.dumps(_ir(0)))
            (td / "b.json").write_text(json.dumps(_ir(50)))
            out = td / "report.json"
            rc = main([
                str(td / "a.json"), str(td / "b.json"),
                "--out", str(out),
            ])
            self.assertEqual(rc, 2)
            data = json.loads(out.read_text())
            self.assertEqual(data["verdict"], "fail")
            self.assertIn("findings", data)


if __name__ == "__main__":
    unittest.main()
