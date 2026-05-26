"""W74 — Master Pipeline Gate tests."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path

from tools.master_gate.gate import MasterVerdict, run_master_gate


def _ir(name: str = "g1", target_rtp: float | None = 0.96) -> dict:
    meta = {"id": name, "name": name, "vendor": "v"}
    if target_rtp is not None:
        meta["target_rtp"] = target_rtp
    return {
        "meta": meta,
        "topology": {"reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {},
        "features": [{"kind": "free_spins"}],
        "reels": {"base": [["A", "B", "C", "D"] * 8 for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
    }


class MasterGateTest(unittest.TestCase):
    def test_run_master_gate_emits_report(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g1.ir.json").write_text(json.dumps(_ir()))
            out = td / "out"
            report = run_master_gate(
                repo_root=td,
                games_root=td,
                out_dir=out,
            )
            self.assertGreaterEqual(len(report.steps), 4)
            self.assertTrue((out / "master-gate.json").exists())
            self.assertTrue((out / "master-gate.md").exists())

    def test_step_names_cover_expected_gates(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g1.ir.json").write_text(json.dumps(_ir()))
            report = run_master_gate(
                repo_root=td,
                games_root=td,
                out_dir=td / "out",
            )
            names = {s.name for s in report.steps}
            self.assertIn("drift_sentinel", names)
            self.assertIn("operator_dashboard", names)
            self.assertIn("cert_sbom", names)
            self.assertIn("ir_diff_gate_self", names)

    def test_verdict_at_worst_warn_when_no_red_present(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            # All-green IR (no target_rtp, no red).
            (td / "g1.ir.json").write_text(
                json.dumps(_ir(target_rtp=None))
            )
            (td / "g1.cert.xml").write_text("<x/>")
            (td / "g1.cert.zip").write_bytes(b"PKfake")
            report = run_master_gate(
                repo_root=td,
                games_root=td,
                out_dir=td / "out",
            )
            self.assertIn(
                report.verdict,
                (MasterVerdict.PASS, MasterVerdict.WARN),
                msg=[s.to_dict() for s in report.steps],
            )

    def test_red_game_pushes_verdict_to_fail(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "red.ir.json").write_text(json.dumps({
                "meta": {"id": "red", "target_rtp": 0.10},
                "topology": {"reels": 5, "rows": 3},
                "evaluation": {"paylines": list(range(20))},
                "features": [], "limits": {},
                "reels": {"base": [["A", "B"] * 16 for _ in range(5)]},
                "paytable": [{"combo": ["A"] * 5, "pays": 100000}],
            }))
            report = run_master_gate(
                repo_root=td,
                games_root=td,
                out_dir=td / "out",
            )
            self.assertEqual(report.verdict, MasterVerdict.FAIL)
            self.assertEqual(report.exit_code(), 2)


class CliTest(unittest.TestCase):
    def test_cli_smoke(self):
        from tools.master_gate.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g1.ir.json").write_text(json.dumps(_ir(target_rtp=None)))
            rc = main([
                "--repo-root", str(td),
                "--games-root", str(td),
                "--out", str(td / "out"),
                "--json",
            ])
            # No red games, but missing sidecars yield WARN.
            self.assertIn(rc, (0, 1))


if __name__ == "__main__":
    unittest.main()
