"""W57 — Operator Dashboard tests."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path

from tools.operator_dashboard.aggregator import (
    aggregate,
    emit_dashboard,
)


def _ir(name: str = "g1", target_rtp: float = 0.96,
         paytable_pays: int = 100, extra_meta: dict | None = None) -> dict:
    meta = {
        "id": name,
        "name": name,
        "vendor": "vendor_a",
        "swid": f"S-{name.upper()}",
        "target_rtp": target_rtp,
    }
    if extra_meta:
        meta.update(extra_meta)
    return {
        "meta": meta,
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {"max_win_x": 5000.0},
        "features": [{"kind": "free_spins"}, {"kind": "hold_and_win"}],
        "reels": {"base": [["A", "B", "C", "D"] * 8 for _ in range(5)]},
        "paytable": [
            {"combo": ["A"] * 5, "pays": paytable_pays},
            {"combo": ["A"] * 4, "pays": paytable_pays // 2},
            {"combo": ["A"] * 3, "pays": 5},
        ],
    }


class AggregateTest(unittest.TestCase):
    def test_aggregate_empty_dir(self):
        with tempfile.TemporaryDirectory() as td:
            report = aggregate(Path(td))
            self.assertEqual(report.counts.get("total", 0), 0)

    def test_aggregate_single_game(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g1.ir.json").write_text(json.dumps(_ir()))
            report = aggregate(td)
            self.assertEqual(report.counts.get("total"), 1)
            self.assertEqual(len(report.games), 1)
            g = report.games[0]
            self.assertEqual(g.name, "g1")
            self.assertEqual(g.feature_kinds, ["free_spins", "hold_and_win"])
            self.assertGreater(g.paytable_depth, 0)

    def test_traffic_light_red_on_huge_rtp_drift(self):
        # Inject a target_rtp ridiculously different from estimate.
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g_big.ir.json").write_text(json.dumps(
                _ir("g_big", target_rtp=0.10, paytable_pays=10_000)
            ))
            report = aggregate(td)
            g = report.games[0]
            self.assertEqual(g.rtp_severity, "red")
            self.assertEqual(g.traffic_light, "red")
            self.assertTrue(any("RTP drift" in i for i in g.issues))

    def test_traffic_light_yellow_when_sidecars_missing_but_rtp_ok(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ir = _ir("g_yel", target_rtp=None)
            (td / "g_yel.ir.json").write_text(json.dumps(ir))
            report = aggregate(td)
            g = report.games[0]
            self.assertIn(g.traffic_light, ("yellow",))
            self.assertTrue(any("cert.xml" in i for i in g.issues))

    def test_traffic_light_green_when_target_unset_and_sidecars_present(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ir = _ir(
                "g_grn",
                target_rtp=None,
                extra_meta={"telemetry": {"endpoint": "rgs://x"}},
            )
            (td / "g_grn.ir.json").write_text(json.dumps(ir))
            (td / "g_grn.cert.xml").write_text("<x/>")
            (td / "g_grn.cert.zip").write_bytes(b"PKfake")
            report = aggregate(td)
            g = report.games[0]
            self.assertEqual(g.traffic_light, "green")
            self.assertEqual(g.issues, [])
            self.assertTrue(g.cert_xml_present)
            self.assertTrue(g.cert_zip_present)
            self.assertTrue(g.telemetry_pointer)


class EmitDashboardTest(unittest.TestCase):
    def test_emit_writes_html_and_json(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g1.ir.json").write_text(json.dumps(_ir()))
            (td / "g2.ir.json").write_text(json.dumps(_ir("g2")))
            report = aggregate(td)
            out = td / "out"
            paths = emit_dashboard(report, out)
            self.assertTrue(paths["html"].exists())
            self.assertTrue(paths["json"].exists())
            data = json.loads(paths["json"].read_text())
            self.assertEqual(data["counts"]["total"], 2)
            self.assertIn("Operator Dashboard", paths["html"].read_text())


class CliTest(unittest.TestCase):
    def test_cli_smoke(self):
        from tools.operator_dashboard.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            # target_rtp=None → RTP severity is "none", no red trigger
            # from the RTP rule. Missing sidecars push the game to
            # yellow, but exit_code is only 1 on RED.
            (td / "g1.ir.json").write_text(
                json.dumps(_ir(target_rtp=None))
            )
            rc = main([str(td), "--out", str(td / "dash"), "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((td / "dash" / "dashboard.html").exists())

    def test_cli_returns_1_when_red_game_present(self):
        from tools.operator_dashboard.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "red.ir.json").write_text(json.dumps(
                _ir("red", target_rtp=0.10, paytable_pays=10_000)
            ))
            rc = main([str(td), "--out", str(td / "dash"), "--quiet"])
            self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
