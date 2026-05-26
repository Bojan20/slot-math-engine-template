"""W6.5 — `slot-build --gdd` CLI integration tests.

Verify the end-to-end pipeline: synthetic GDD PDF → IR JSON written to
disk → IR deserializes + has all required fields. Tests skip cleanly
when pypdf / reportlab missing.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    import pypdf  # noqa: F401
    from reportlab.pdfgen import canvas
    _HAS_PDF = True
except ImportError:
    _HAS_PDF = False

if _HAS_PDF:
    from tools.slot_build.gdd_mode import main, run_gdd_pipeline


def _make_gdd_pdf(path: Path) -> None:
    c = canvas.Canvas(str(path))
    y = 750

    def line(text: str) -> None:
        nonlocal y
        c.drawString(72, y, text)
        y -= 14

    line("Pipeline Test Slot v1.0")
    line("Math Specification:")
    line("RTP target: 95.5%")
    line("Volatility: high")
    line("Reel Configuration:")
    line("5 reels x 3 rows")
    line("Paylines:")
    line("Paylines: 20")
    line("Paytable:")
    line("Red7 3 100 4 250 5 1000")
    line("Bell 3 25 4 75 5 250")
    line("Free Spins Feature:")
    line("3 scatters trigger 10 free spins")
    line("Bet Range:")
    line("Min bet: 0.20")
    line("Max bet: 100.0")
    c.save()


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab missing")
class TestGddPipeline(unittest.TestCase):

    def test_run_gdd_pipeline_full(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "test.gdd.pdf"
            _make_gdd_pdf(pdf)
            ir, dsl, extracted = run_gdd_pipeline(pdf, smt_lock=False,
                                                    verbose=False)
            # IR has required keys
            for key in ("meta", "topology", "evaluation",
                        "symbols", "reels", "paytable",
                        "features", "bet_table"):
                self.assertIn(key, ir)
            # Topology recovered from PDF
            self.assertEqual(ir["topology"]["reels"], 5)
            self.assertEqual(ir["topology"]["rows"], 3)
            # DSL is well-formed
            self.assertIn("meta", dsl)
            # Extracted has GDD sections
            self.assertIn("raw_sections", extracted)
            # Audit trail
            notes = ir["meta"]["notes"]
            self.assertTrue(any("W6.5 GDD pipeline" in n for n in notes))

    def test_cli_writes_ir_file(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "cli.gdd.pdf"
            _make_gdd_pdf(pdf)
            out_ir = Path(td) / "out.ir.json"
            rc = main([str(pdf), "--out", str(out_ir),
                       "--no-smt-lock", "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue(out_ir.is_file())
            # Parses as JSON + has IR shape
            ir = json.loads(out_ir.read_text())
            self.assertIn("meta", ir)
            self.assertEqual(ir["topology"]["reels"], 5)

    def test_cli_writes_dsl_and_summary(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "full.gdd.pdf"
            _make_gdd_pdf(pdf)
            out_ir = Path(td) / "out.ir.json"
            out_dsl = Path(td) / "out.dsl.toml"
            out_summary = Path(td) / "out.gdd.json"
            rc = main([str(pdf), "--out", str(out_ir),
                       "--dsl", str(out_dsl),
                       "--summary", str(out_summary),
                       "--no-smt-lock", "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue(out_ir.is_file())
            self.assertTrue(out_dsl.is_file())
            self.assertTrue(out_summary.is_file())
            # DSL TOML round-trips
            import tomllib
            dsl_parsed = tomllib.loads(out_dsl.read_text())
            self.assertIn("meta", dsl_parsed)
            self.assertIn("topology", dsl_parsed)
            # Summary JSON has GDD shape
            summary = json.loads(out_summary.read_text())
            self.assertIn("raw_sections", summary)

    def test_missing_pdf_errors(self):
        rc = main(["/nonexistent/missing.pdf", "--quiet", "--no-smt-lock"])
        self.assertEqual(rc, 2)

    def test_studio_scaffold_emitted(self):
        """W6.5 + W5.4 wire-up: --studio DIR emits playable HTML/JS."""
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "studio.gdd.pdf"
            _make_gdd_pdf(pdf)
            out_ir = Path(td) / "studio.ir.json"
            studio_root = Path(td) / "studio"
            rc = main([str(pdf), "--out", str(out_ir),
                       "--studio", str(studio_root),
                       "--no-smt-lock", "--quiet"])
            self.assertEqual(rc, 0)
            # Studio dir created + has at least one game subfolder
            self.assertTrue(studio_root.is_dir())
            game_dirs = [p for p in studio_root.iterdir() if p.is_dir()]
            self.assertGreater(len(game_dirs), 0,
                                "no game scaffold dir created")
            # Game dir has expected Studio files
            game_root = game_dirs[0]
            for stem in ("index.html", "app.js", "app.css"):
                # Studio scaffold root has its own subdir layout; just
                # check that SOME file with this name exists anywhere
                # under game_root.
                found = list(game_root.rglob(stem))
                self.assertGreater(
                    len(found), 0,
                    f"expected {stem} somewhere under {game_root}",
                )


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab missing")
class TestGddPipelineSmtLocked(unittest.TestCase):
    """When z3-solver is available, full GDD → SMT-locked IR works."""

    def test_smt_locked_ir_audit_note(self):
        try:
            import z3  # noqa: F401
        except ImportError:
            self.skipTest("z3-solver not installed")
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "smt.gdd.pdf"
            _make_gdd_pdf(pdf)
            ir, dsl, extracted = run_gdd_pipeline(pdf, smt_lock=True,
                                                    verbose=False)
            notes = ir["meta"].get("notes") or []
            # Either SMT scaled the paytable OR baseline already matched
            has_smt = any("SMT-locked" in n for n in notes)
            has_already = any("already within" in n for n in notes)
            self.assertTrue(
                has_smt or has_already,
                f"expected SMT note in {notes}",
            )


if __name__ == "__main__":
    unittest.main()
