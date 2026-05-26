"""W23 + W25 + W27 — localization + coverage + math doc tests."""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.localization import (
    TranslationCatalog,
    list_localizable_strings,
    load_catalog,
    localize_ir,
    save_catalog,
)
from tools.localization.translator import main as loc_main
from tools.coverage_report import aggregate_coverage, emit_coverage
from tools.coverage_report.__main__ import main as cov_main
from tools.math_doc import (
    emit_math_doc,
    generate_math_doc,
)
from tools.math_doc.generator import main as md_main


_IR = {
    "meta": {
        "name": "Cash Eruption",
        "description": "A volcano-themed slot",
        "vendor": "synth",
        "swid": "X-001",
        "target_rtp": 0.96,
        "notes": ["First parse", "RTP raised to 0.96"],
    },
    "topology": {"reels": 5, "rows": 3, "kind": "rectangular"},
    "evaluation": {"paylines": [[0, 0, 0, 0, 0]]},
    "paytable": [
        {"combo": ["Red", "Red", "Red"], "pays": 5.0, "label": "Red 3OAK"},
    ],
    "features": [
        {"kind": "free_spins", "label": "Free Spins"},
    ],
    "symbols": [{"id": "Red", "name": "Red Seven"}],
}


# ─── W23 ───────────────────────────────────────────────────────────────────


class TestLocalization(unittest.TestCase):
    def test_list_strings_includes_all_known_fields(self):
        strs = list_localizable_strings(_IR)
        for expected in ("Cash Eruption", "A volcano-themed slot",
                          "Free Spins", "Red 3OAK", "Red Seven",
                          "First parse"):
            self.assertIn(expected, strs)

    def test_translate_with_catalog_hits_fall_back_on_miss(self):
        cat = TranslationCatalog(
            locale="sr",
            translations={
                "Cash Eruption": "Erupcija Novca",
                "Free Spins": "Besplatni Spinovi",
            },
        )
        out = localize_ir(_IR, cat)
        self.assertEqual(out["meta"]["name"], "Erupcija Novca")
        self.assertEqual(out["features"][0]["label"], "Besplatni Spinovi")
        # Missing key → English fallback + recorded
        self.assertIn("A volcano-themed slot", cat.missing)
        self.assertEqual(out["meta"]["description"], "A volcano-themed slot")

    def test_locale_stamped(self):
        cat = TranslationCatalog(locale="sr")
        out = localize_ir(_IR, cat)
        self.assertEqual(out["meta"]["locale"], "sr")

    def test_save_load_round_trip(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "sr.json"
            cat = TranslationCatalog(
                locale="sr",
                translations={"Cash Eruption": "Erupcija Novca"},
            )
            save_catalog(cat, p)
            loaded = load_catalog(p)
            self.assertEqual(loaded.locale, "sr")
            self.assertEqual(loaded.translations["Cash Eruption"],
                              "Erupcija Novca")

    def test_load_missing_file_empty_catalog(self):
        loaded = load_catalog(Path("/nonexistent/zz.json"))
        self.assertEqual(loaded.translations, {})

    def test_cli_list_strings(self):
        with tempfile.TemporaryDirectory() as td:
            ir = Path(td) / "x.ir.json"
            ir.write_text(json.dumps(_IR))
            rc = loc_main([str(ir), "--list"])
            self.assertEqual(rc, 0)

    def test_cli_localize_writes_file(self):
        with tempfile.TemporaryDirectory() as td:
            ir = Path(td) / "x.ir.json"
            cat = Path(td) / "sr.json"
            ir.write_text(json.dumps(_IR))
            cat.write_text(json.dumps({
                "locale": "sr",
                "translations": {"Cash Eruption": "Erupcija Novca"},
            }))
            out = Path(td) / "x.sr.json"
            rc = loc_main([str(ir), "--catalog", str(cat),
                            "--out", str(out), "--quiet"])
            self.assertEqual(rc, 0)
            data = json.loads(out.read_text())
            self.assertEqual(data["meta"]["name"], "Erupcija Novca")


# ─── W25 ───────────────────────────────────────────────────────────────────


class TestCoverageReport(unittest.TestCase):
    def test_aggregate_picks_up_real_repo(self):
        cov = aggregate_coverage(ROOT)
        # The real repo MUST have at least these (recently landed)
        self.assertGreater(len(cov.solver_kernels), 30)
        self.assertGreater(len(cov.console_scripts), 15)
        self.assertGreater(len(cov.jurisdiction_profiles), 10)
        self.assertGreater(len(cov.vendor_profiles), 3)
        self.assertGreater(cov.test_count_estimated, 100)

    def test_emit_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            cov = aggregate_coverage(ROOT)
            paths = emit_coverage(cov, Path(td))
            self.assertTrue(paths["json"].is_file())
            self.assertTrue(paths["md"].is_file())
            # Smoke MD content
            md = paths["md"].read_text()
            self.assertIn("Slot Math Engine — Coverage Report", md)

    def test_cli_happy_path(self):
        with tempfile.TemporaryDirectory() as td:
            rc = cov_main([str(ROOT), "--out", td, "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((Path(td) / "coverage.json").is_file())


# ─── W27 ───────────────────────────────────────────────────────────────────


class TestMathDocGenerator(unittest.TestCase):
    def test_doc_has_required_sections(self):
        doc = generate_math_doc(_IR)
        titles = {s.title for s in doc.sections}
        for expected in ("Meta", "Topology", "RTP Report",
                          "Paytable", "Features", "Audit notes"):
            self.assertIn(expected, titles)

    def test_doc_meta_fields(self):
        doc = generate_math_doc(_IR)
        self.assertEqual(doc.title, "Cash Eruption")
        self.assertEqual(doc.swid, "X-001")
        self.assertEqual(doc.vendor, "synth")

    def test_rtp_section_uses_mc_when_provided(self):
        mc = {"rtp": 0.9598, "spins": 100_000, "hit_freq": 0.27}
        doc = generate_math_doc(_IR, mc_report=mc)
        rtp = next(s for s in doc.sections if s.title == "RTP Report")
        self.assertIn("0.9598", rtp.body)
        self.assertIn("100000", rtp.body)

    def test_emit_writes_markdown(self):
        with tempfile.TemporaryDirectory() as td:
            doc = generate_math_doc(_IR)
            out = Path(td) / "spec.md"
            p = emit_math_doc(doc, out)
            self.assertTrue(p.is_file())
            md = p.read_text()
            self.assertIn("Math Specification", md)
            self.assertIn("Cash Eruption", md)

    def test_cli_happy_path(self):
        with tempfile.TemporaryDirectory() as td:
            ir = Path(td) / "x.ir.json"
            ir.write_text(json.dumps(_IR))
            out = Path(td) / "spec.md"
            rc = md_main([str(ir), "--out", str(out), "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue(out.is_file())

    def test_cli_missing_ir(self):
        rc = md_main(["/nonexistent/x.json", "--out", "/tmp/spec.md",
                       "--quiet"])
        self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
