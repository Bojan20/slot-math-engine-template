"""W6.1 — GDD PDF extractor regression tests.

Generates a synthetic GDD PDF on disk via reportlab, then verifies
that each section parser correctly recovers the fields. Tests skip
cleanly when pypdf / reportlab not installed.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    import pypdf  # noqa: F401
    from reportlab.lib.pagesizes import letter  # noqa: F401
    from reportlab.pdfgen import canvas
    _HAS_PDF = True
except ImportError:
    _HAS_PDF = False

if _HAS_PDF:
    from tools.gdd_extract.extract import (
        detect_sections,
        extract_gdd,
        parse_bet_range,
        parse_free_spins,
        parse_max_win,
        parse_paylines,
        parse_paytable,
        parse_rtp,
        parse_topology,
        parse_volatility,
        pdf_to_lines,
    )


# ─── Synthetic GDD PDF builder ──────────────────────────────────────────


def _make_test_gdd(path: Path) -> None:
    """Generate a complete test GDD PDF using reportlab."""
    c = canvas.Canvas(str(path), pagesize=letter)
    y = 750  # top of page

    def line(text: str, x: int = 72) -> None:
        nonlocal y
        c.drawString(x, y, text)
        y -= 14

    line("Test Slot Game GDD v1.0")
    line("")
    line("Math Specification:")
    line("RTP target: 96.5%")
    line("")
    line("Volatility: medium")
    line("")
    line("Reel Configuration:")
    line("5 reels x 3 rows")
    line("")
    line("Paylines:")
    line("20 paylines, left-to-right only")
    line("")
    line("Paytable:")
    line("Red7 3 100 4 250 5 1000")
    line("Bell 3 50 4 150 5 500")
    line("Cherry 3 10 4 25 5 100")
    line("Wild 5-OAK 5000")
    line("")
    line("Free Spins Feature:")
    line("3 scatters trigger 10 free spins")
    line("Retrigger awards +5 free spins")
    line("Max 50 spins per bonus")
    line("")
    line("Bet Range:")
    line("Min bet: 0.20")
    line("Max bet: 100.00")
    line("")
    line("Max Win:")
    line("5000x total bet cap")

    c.save()


# ─── Tests ──────────────────────────────────────────────────────────────


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab not installed")
class TestSectionDetection(unittest.TestCase):

    def test_detect_basic_headings(self):
        lines = [
            "Game Info: Test Slot",
            "extra context",
            "RTP: 96%",
            "more",
            "Paytable:",
            "Red7 5 1000",
        ]
        sections = detect_sections(lines)
        self.assertIn("meta", sections)
        self.assertIn("rtp", sections)
        self.assertIn("paytable", sections)


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab not installed")
class TestParsers(unittest.TestCase):

    def test_topology_5x3(self):
        topo = parse_topology(["Reel Configuration:", "5 reels x 3 rows"])
        self.assertEqual(topo, {"reels": 5, "rows": 3})

    def test_topology_alt_syntax(self):
        topo = parse_topology(["Grid: 6×5 layout"])
        self.assertEqual(topo, {"reels": 6, "rows": 5})

    def test_rtp_pct(self):
        rtp = parse_rtp(["RTP target: 96.5%"])
        self.assertAlmostEqual(rtp, 0.965, places=4)

    def test_rtp_out_of_range_skipped(self):
        """Bogus '50% off coupon' shouldn't be picked as RTP."""
        rtp = parse_rtp(["Discount: 50%"])
        self.assertIsNone(rtp)

    def test_volatility_levels(self):
        self.assertEqual(parse_volatility(["Volatility: low"]), "low")
        self.assertEqual(parse_volatility(["very high variance"]), "very_high")
        self.assertEqual(parse_volatility(["Volatility class: ultra"]), "ultra")

    def test_paylines_20(self):
        n = parse_paylines(["Paylines: 20"])
        self.assertEqual(n, 20)

    def test_paylines_117649_megaways(self):
        n = parse_paylines(["117649 ways"])
        self.assertEqual(n, 117_649)

    def test_paytable_multi_tier(self):
        entries = parse_paytable(["Red7 3 100 4 250 5 1000"])
        self.assertEqual(len(entries), 3)
        self.assertEqual(entries[0], {"symbol": "Red7", "count": 3, "pays": 100.0})
        self.assertEqual(entries[2], {"symbol": "Red7", "count": 5, "pays": 1000.0})

    def test_paytable_single_oak(self):
        entries = parse_paytable(["Wild 5-OAK 5000"])
        self.assertEqual(entries, [{"symbol": "Wild", "count": 5, "pays": 5000.0}])

    def test_free_spins_full(self):
        fs = parse_free_spins([
            "3 scatters trigger 10 free spins",
            "Retrigger awards +5 free spins",
            "Max 50 spins per bonus",
        ])
        self.assertEqual(fs["trigger_count_min"], 3)
        self.assertEqual(fs["initial_spins"], 10)
        self.assertEqual(fs["retrigger_spins"], 5)
        self.assertEqual(fs["max_total_spins"], 50)

    def test_bet_range(self):
        br = parse_bet_range([
            "Min bet: 0.20",
            "Max bet: 100",
        ])
        self.assertEqual(br["min_bet"], 0.20)
        self.assertEqual(br["max_bet"], 100.0)

    def test_max_win(self):
        mw = parse_max_win(["5000x total bet cap"])
        self.assertEqual(mw, 5000.0)


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab not installed")
class TestEndToEnd(unittest.TestCase):
    """Full PDF → JSON pipeline on a synthetic GDD."""

    def test_full_synthetic_gdd(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "test.gdd.pdf"
            _make_test_gdd(pdf)

            result = extract_gdd(pdf)
            self.assertEqual(result["topology"], {"reels": 5, "rows": 3,
                                                   "paylines": 20})
            self.assertAlmostEqual(result["meta"]["target_rtp"], 0.965,
                                    places=4)
            self.assertEqual(result["meta"]["volatility"], "medium")
            self.assertEqual(result["meta"]["max_win_x"], 5000.0)
            self.assertGreater(len(result["paytable"]), 8)  # 3 × 3 tiers + Wild
            self.assertEqual(result["bet_range"], {"min_bet": 0.2,
                                                    "max_bet": 100.0})
            fs = next(f for f in result["features"]
                      if f["kind"] == "free_spins")
            self.assertEqual(fs["trigger_count_min"], 3)
            self.assertEqual(fs["initial_spins"], 10)

    def test_minimal_pdf_still_returns_skeleton(self):
        """A 1-line PDF returns at least empty meta + raw_sections."""
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "minimal.pdf"
            c = canvas.Canvas(str(pdf))
            c.drawString(72, 750, "Just a header line.")
            c.save()
            result = extract_gdd(pdf)
            self.assertIn("meta", result)
            self.assertIn("raw_sections", result)


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab not installed")
class TestPdfToLines(unittest.TestCase):

    def test_lines_extracted(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "lines.pdf"
            c = canvas.Canvas(str(pdf))
            c.drawString(72, 750, "Line one")
            c.drawString(72, 736, "Line two")
            c.save()
            lines = pdf_to_lines(pdf)
            self.assertIn("Line one", lines)
            self.assertIn("Line two", lines)


class TestCliModuleLoadable(unittest.TestCase):

    def test_main_module_importable(self):
        if not _HAS_PDF:
            self.skipTest("pypdf not installed")
        from tools.gdd_extract import __main__  # noqa: F401


if __name__ == "__main__":
    unittest.main()
