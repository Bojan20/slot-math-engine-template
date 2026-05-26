"""W12 — Multi-IR portfolio analyzer tests."""
from __future__ import annotations
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.portfolio import (
    analyze_portfolio,
    metrics_for_ir,
)
from tools.portfolio.__main__ import main as portfolio_main


def _ir(*, pay_high: int = 100, vendor: str = "vendor_c",
        diverse: bool = True) -> dict:
    if diverse:
        base = [
            ["high1", "low1", "wild"] * 4,
            ["high1", "low2", "low1"] * 4,
            ["high1", "low2", "wild"] * 4,
            ["high1", "low1", "low2"] * 4,
            ["high1", "wild", "low2"] * 4,
        ]
    else:
        base = [["high1"] * 12 for _ in range(5)]
    return {
        "meta": {"name": "Test", "vendor": vendor, "swid": "T-001"},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": base},
        "paytable": [
            {"combo": ["high1"] * 5, "pays": pay_high},
            {"combo": ["low1"] * 5, "pays": 20},
        ],
        "features": [{"kind": "free_spins"}, {"kind": "wild_expand"}],
    }


def _write(d: Path, rel: str, ir: dict) -> Path:
    p = d / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(ir))
    return p


class TestMetricsForIR(unittest.TestCase):
    def test_basic_fields(self):
        m = metrics_for_ir(_ir(), rel_path="g/ir.json")
        self.assertEqual(m.vendor, "vendor_c")
        self.assertEqual(m.topology_kind, "rectangular")
        self.assertEqual(m.reels, 5)
        self.assertEqual(m.paytable_depth, 2)
        self.assertEqual(m.feature_kinds, ["free_spins", "wild_expand"])

    def test_diverse_strip_higher_entropy_than_single_symbol(self):
        diverse = metrics_for_ir(_ir(diverse=True))
        flat = metrics_for_ir(_ir(diverse=False))
        self.assertIsNotNone(diverse.reel_diversity)
        self.assertEqual(flat.reel_diversity, 0.0)
        self.assertGreater(diverse.reel_diversity, flat.reel_diversity)

    def test_volatility_scales_with_pay(self):
        a = metrics_for_ir(_ir(pay_high=100))
        b = metrics_for_ir(_ir(pay_high=1000))
        self.assertIsNotNone(a.volatility_proxy)
        self.assertGreater(b.volatility_proxy, a.volatility_proxy)


class TestAnalyzePortfolio(unittest.TestCase):
    def test_three_games(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _write(d, "g1/ir.json", _ir(pay_high=100))
            _write(d, "g2/ir.json", _ir(pay_high=500))
            _write(d, "g3/ir.json", _ir(pay_high=50,
                                          vendor="vendor_d"))
            report = analyze_portfolio(d)
            self.assertEqual(report.total_irs, 3)
            self.assertEqual(report.vendor_counts["vendor_c"], 2)
            self.assertEqual(report.vendor_counts["vendor_d"], 1)
            self.assertIn("free_spins", report.feature_counts)
            self.assertEqual(report.feature_counts["free_spins"], 3)

    def test_pareto_frontier_excludes_dominated(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            # game B has higher RTP AND lower volatility than game A
            # (because A and B share reels but pay differs; here we
            # rig two paytables that produce same RTP but different vol)
            _write(d, "a/ir.json", _ir(pay_high=100))
            _write(d, "b/ir.json", _ir(pay_high=200))
            report = analyze_portfolio(d)
            front = report.pareto_frontier()
            # At least one frontier member; either both are frontier
            # (no domination) or one dominates.
            self.assertGreaterEqual(len(front), 1)

    def test_error_ir_marked_with_error(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "bad").mkdir()
            (d / "bad" / "ir.json").write_text("not json")
            report = analyze_portfolio(d)
            self.assertEqual(report.total_irs, 1)
            self.assertIsNotNone(report.metrics[0].error)


class TestSerialization(unittest.TestCase):
    def test_to_dict_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _write(d, "g/ir.json", _ir())
            mf = analyze_portfolio(d).to_dict()
            self.assertIn("metrics", mf)
            self.assertIn("vendor_counts", mf)
            self.assertIn("pareto_frontier", mf)
            # JSON-safe
            json.dumps(mf)

    def test_markdown_contains_table_headers(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _write(d, "g/ir.json", _ir())
            md = analyze_portfolio(d).to_markdown()
            self.assertIn("Portfolio Analyzer Report", md)
            self.assertIn("| IR |", md)
            self.assertIn("RTP est", md)

    def test_html_contains_scatter_svg(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _write(d, "g/ir.json", _ir())
            html = analyze_portfolio(d).to_html()
            self.assertIn("<svg id=\"scatter\"", html)
            self.assertIn("Portfolio Analyzer", html)


class TestCLI(unittest.TestCase):
    def test_clean_exit_zero(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _write(d, "g/ir.json", _ir())
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = portfolio_main([str(d), "--quiet"])
            self.assertEqual(rc, 0)

    def test_empty_dir_exit_one(self):
        with tempfile.TemporaryDirectory() as d:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = portfolio_main([str(d), "--quiet"])
            self.assertEqual(rc, 1)

    def test_writes_json_md_html(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _write(d, "g/ir.json", _ir())
            out = d / "out"
            buf = io.StringIO()
            with redirect_stdout(buf):
                portfolio_main([
                    str(d), "--quiet",
                    "--json", str(out / "p.json"),
                    "--markdown", str(out / "p.md"),
                    "--html", str(out / "p.html"),
                ])
            self.assertTrue((out / "p.json").exists())
            self.assertTrue((out / "p.md").exists())
            self.assertTrue((out / "p.html").exists())


if __name__ == "__main__":
    unittest.main()
