"""W244 wave 64 — slot-math CLI smoke tests.

Verifies that the `slot-math` CLI entry point (declared via
[project.scripts] in pyproject.toml) is functional from vendored source.

CLI is the downstream-user-friendly face of slot-math-kernels — broken
CLI = broken first impression. This gate ensures the 5 sub-commands
exit 0 + produce valid JSON.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PKG_SRC = ROOT / "packages" / "slot-math-kernels" / "src"


def _run_cli(args: list[str]) -> subprocess.CompletedProcess:
    """Run `python -m slot_math_kernels._cli ARGS` with isolated import path."""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PKG_SRC)
    return subprocess.run(
        [sys.executable, "-m", "slot_math_kernels._cli"] + args,
        capture_output=True, text=True, cwd=str(ROOT),
        env=env, timeout=15,
    )


class TestCliSmoke(unittest.TestCase):

    def test_list_succeeds(self):
        r = _run_cli(["list"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("22 kernels", r.stdout)
        # All 22 kernel names should appear
        for k in ("charge_meter", "both_ways", "money_collect", "wheel",
                  "buy_feature", "cascade", "cluster_pays"):
            self.assertIn(k, r.stdout, f"missing kernel {k}")

    def test_info_succeeds(self):
        r = _run_cli(["info", "charge_meter"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("charge_meter", r.stdout)
        self.assertIn("Public API", r.stdout)
        self.assertIn("ChargeMeterParams", r.stdout)

    def test_info_rejects_unknown_kernel(self):
        r = _run_cli(["info", "fake_kernel_xyz"])
        self.assertNotEqual(r.returncode, 0)

    def test_both_ways_computes(self):
        r = _run_cli([
            "both-ways", "--ltr-rtp", "0.96", "--share", "0.7",
        ])
        self.assertEqual(r.returncode, 0, r.stderr)
        result = json.loads(r.stdout)
        self.assertAlmostEqual(result["rtp_contribution"], 1.632, places=6)
        self.assertAlmostEqual(
            result["bidirectional_multiplier"], 1.7, places=6,
        )

    def test_charge_meter_wald(self):
        r = _run_cli([
            "charge-meter",
            "--expected-charge", "0.5",
            "--tier", "classic:50:10",
        ])
        self.assertEqual(r.returncode, 0, r.stderr)
        result = json.loads(r.stdout)
        # Wald: 10 / (50 / 0.5) = 0.10
        self.assertAlmostEqual(
            result["rtp_contribution"], 0.10, places=10,
        )

    def test_buy_feature_compliance_audit(self):
        r = _run_cli([
            "buy-feature",
            "--bonus", "95", "--cost", "100",
            "--base-rtp", "0.965", "--target", "0.95",
        ])
        self.assertEqual(r.returncode, 0, r.stderr)
        result = json.loads(r.stdout)
        self.assertAlmostEqual(result["buy_rtp"], 0.95, places=9)
        # |0.95 - 0.965| = 1.5pp > 0.5pp → UKGC fail @0.5
        self.assertFalse(result["ukgc_rts13c_pass_0p5"])
        # 0.95 <= 0.96 → MGA OK
        self.assertTrue(result["mga_2021_02_pass_0p96"])

    def test_version_flag(self):
        r = _run_cli(["--version"])
        self.assertEqual(r.returncode, 0)
        self.assertIn("1.0.0", r.stdout)


class TestCliRunFromJsonConfig(unittest.TestCase):
    """`slot-math run <kernel> --config <file>` loads JSON params."""

    def setUp(self):
        self.tmp = Path("/tmp/smk-cli-cfg-test.json")

    def tearDown(self):
        if self.tmp.exists():
            self.tmp.unlink()

    def test_run_both_ways_from_config(self):
        self.tmp.write_text(json.dumps({
            "ltr_only_rtp": 0.96,
            "line_pay_share": 0.5,
        }))
        r = _run_cli(["run", "both_ways", "--config", str(self.tmp)])
        self.assertEqual(r.returncode, 0, r.stderr)
        result = json.loads(r.stdout)
        # 0.96 × 1.5 = 1.44
        self.assertAlmostEqual(result["rtp_contribution"], 1.44, places=6)


if __name__ == "__main__":
    unittest.main()
