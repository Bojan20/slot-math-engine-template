"""W6.3 + W6.6 — LLM-assist + review UI emit tests.

Verifies the LLM-assist provider abstraction (deterministic + env-OpenAI
fallback) and the human-in-loop review UI emit clean files.

Run:
    python -m unittest tools.tests.test_w6_3_llm_assist
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
    from reportlab.pdfgen import canvas
    _HAS_PDF = True
except ImportError:
    _HAS_PDF = False

from tools.gdd_extract.llm_assist import (
    DeterministicEchoProvider,
    EnvOpenAIProvider,
    Provider,
    gdd_to_dsl_assisted,
)
from tools.gdd_extract.review_ui import emit_review_ui, main as review_main


def _make_gdd_pdf(path: Path) -> None:
    c = canvas.Canvas(str(path))
    y = 750

    def line(t):
        nonlocal y
        c.drawString(72, y, t)
        y -= 14

    line("LLM Assist Test Slot")
    line("Math Specification:")
    line("RTP target: 96.0%")
    line("Volatility: medium")
    line("Reel Configuration:")
    line("5 reels x 3 rows")
    line("Paylines: 20")
    line("Paytable:")
    line("Red7 3 100 4 250 5 1000")
    line("Bet Range:")
    line("Min bet: 0.20")
    line("Max bet: 100.0")
    c.save()


class TestProviderProtocol(unittest.TestCase):
    def test_deterministic_returns_baseline(self):
        p = DeterministicEchoProvider()
        baseline = {"meta": {"name": "X"},
                    "topology": {"reels": 5, "rows": 3, "paylines": 20}}
        out = p.refine({"raw_sections": {}}, baseline)
        self.assertEqual(out, baseline)

    def test_env_openai_falls_back_without_key(self):
        # Strip OPENAI_API_KEY for this assertion
        import os
        prev = os.environ.pop("OPENAI_API_KEY", None)
        try:
            p = EnvOpenAIProvider()
            baseline = {"meta": {"name": "Y"},
                        "topology": {"reels": 5, "rows": 3, "paylines": 1}}
            out = p.refine({}, baseline)
            self.assertEqual(out, baseline)
        finally:
            if prev is not None:
                os.environ["OPENAI_API_KEY"] = prev

    def test_provider_protocol_runtime_check(self):
        # Provider is a Protocol — must accept any object with refine()
        class Custom:
            def refine(self, extracted, baseline):
                return baseline
        p: Provider = Custom()  # type: ignore[assignment]
        self.assertEqual(p.refine({}, {"meta": {}}), {"meta": {}})


@unittest.skipUnless(_HAS_PDF, "pypdf / reportlab missing")
class TestGddToDslAssisted(unittest.TestCase):
    def test_no_provider_is_pure_pipeline(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "x.gdd.pdf"
            _make_gdd_pdf(pdf)
            dsl = gdd_to_dsl_assisted(pdf, provider=None)
            self.assertIn("meta", dsl)
            self.assertIn("topology", dsl)

    def test_deterministic_provider_adds_notes(self):
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "x.gdd.pdf"
            _make_gdd_pdf(pdf)
            dsl = gdd_to_dsl_assisted(
                pdf, provider=DeterministicEchoProvider())
            notes = (dsl.get("meta") or {}).get("notes") or []
            self.assertTrue(
                any("W6.3" in n for n in notes),
                f"expected W6.3 note, got {notes}",
            )

    def test_malformed_provider_falls_back(self):
        class BadProvider:
            def refine(self, extracted, baseline):
                return {"garbage": 1}  # not a valid DSL
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(td) / "x.gdd.pdf"
            _make_gdd_pdf(pdf)
            dsl = gdd_to_dsl_assisted(pdf, provider=BadProvider())
            # Baseline preserved
            self.assertIn("topology", dsl)
            notes = (dsl.get("meta") or {}).get("notes") or []
            self.assertTrue(any("malformed" in n for n in notes))

    def test_missing_pdf_raises(self):
        with self.assertRaises(FileNotFoundError):
            gdd_to_dsl_assisted(Path("/nonexistent/x.pdf"),
                                 provider=DeterministicEchoProvider())


class TestEmitReviewUI(unittest.TestCase):
    def test_emit_writes_two_files(self):
        with tempfile.TemporaryDirectory() as td:
            h, j = emit_review_ui(Path(td))
            self.assertTrue(h.is_file())
            self.assertTrue(j.is_file())
            self.assertEqual(h.name, "review.html")
            self.assertEqual(j.name, "review.js")

    def test_html_has_two_panes_and_controls(self):
        with tempfile.TemporaryDirectory() as td:
            h, _ = emit_review_ui(Path(td))
            txt = h.read_text()
            for marker in ("gdd-sections", "dsl", "btn-export",
                            "btn-copy", "GDD JSON", "DSL TOML"):
                self.assertIn(marker, txt)

    def test_js_has_load_export_handlers(self):
        with tempfile.TemporaryDirectory() as td:
            _, j = emit_review_ui(Path(td))
            txt = j.read_text()
            for marker in ("renderGdd", "btn-export", "btn-copy",
                            "FileReader", "clipboard"):
                self.assertIn(marker, txt)

    def test_cli_emits_files(self):
        with tempfile.TemporaryDirectory() as td:
            rc = review_main([td, "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((Path(td) / "review.html").is_file())
            self.assertTrue((Path(td) / "review.js").is_file())


if __name__ == "__main__":
    unittest.main()
