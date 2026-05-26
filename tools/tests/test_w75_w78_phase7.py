"""W75 + W76 + W77 + W78 — Phase 7 commercialization tests."""
from __future__ import annotations
import csv
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools.marketplace_catalog.builder import (
    PricingTier,
    build_catalog,
    emit_catalog,
)
from tools.pilot_outreach.package import (
    OutreachConfig,
    build_outreach_package,
)
from tools.public_benchmark.benchmark import (
    PUBLISHED_REFERENCES,
    build_benchmark,
    emit_benchmark,
)
from tools.community_contribute.flow import (
    StarterParams,
    bootstrap_contribution,
)


def _ir(slug: str = "g1", target_rtp: float = 0.96,
         features: list | None = None) -> dict:
    return {
        "meta": {
            "id": slug,
            "name": slug.replace("-", " ").title(),
            "vendor": "v",
            "swid": f"S-{slug.upper()}",
            "target_rtp": target_rtp,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {"max_win_x": 5000.0},
        "features": [{"kind": k} for k in (features or ["free_spins"])],
        "reels": {"base": [["A", "B"] * 16 for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
    }


# ─── W75 — Marketplace Catalog Builder ─────────────────────────────


class MarketplaceCatalogTest(unittest.TestCase):
    def test_empty_root_yields_empty_catalog(self):
        with tempfile.TemporaryDirectory() as td:
            cat = build_catalog(Path(td))
            self.assertEqual(cat.counts.get("total", 0), 0)

    def test_catalog_picks_free_tier_for_single_feature(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g.ir.json").write_text(json.dumps(_ir("g")))
            cat = build_catalog(td)
            self.assertEqual(len(cat.cards), 1)
            self.assertEqual(cat.cards[0].pricing_tier, PricingTier.FREE.value)

    def test_catalog_picks_premium_tier_for_many_features(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g.ir.json").write_text(json.dumps(_ir(
                "g", features=[
                    "free_spins", "hold_and_win", "cascade",
                    "respin", "wheel",
                ],
            )))
            cat = build_catalog(td)
            self.assertEqual(cat.cards[0].pricing_tier,
                             PricingTier.PREMIUM.value)
            self.assertGreater(cat.cards[0].price_eur, 1000)

    def test_emit_writes_json_md_and_per_card_files(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g1.ir.json").write_text(json.dumps(_ir("g1")))
            (td / "g2.ir.json").write_text(json.dumps(_ir("g2")))
            cat = build_catalog(td)
            paths = emit_catalog(cat, td / "out")
            self.assertTrue(paths["json"].exists())
            self.assertTrue(paths["md"].exists())
            self.assertEqual(
                len(list((td / "out" / "cards").glob("*.md"))), 2
            )

    def test_cli_smoke(self):
        from tools.marketplace_catalog.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g.ir.json").write_text(json.dumps(_ir("g")))
            rc = main([str(td), "--out", str(td / "out"), "--json"])
            self.assertEqual(rc, 0)


# ─── W76 — Pilot Outreach Package ──────────────────────────────────


class PilotOutreachTest(unittest.TestCase):
    def test_outreach_produces_all_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            cfg = OutreachConfig(
                operator_name="Acme Casino",
                operator_contact="Jane Doe",
                game_title="Demo Game",
                template_id="demo-game",
                swid="S-DEMO",
                vendor="community",
                target_rtp=0.96,
                volatility="high",
                features=["free_spins", "hold_and_win"],
                jurisdictions=["ukgc", "mga"],
                tier="BASIC",
                price_eur=999,
            )
            pkg = build_outreach_package(Path(td), cfg)
            self.assertTrue(pkg.cover_letter.exists())
            self.assertTrue(pkg.tech_brief.exists())
            self.assertTrue(pkg.pricing_csv.exists())
            self.assertTrue(pkg.bundle_zip.exists())

    def test_cover_letter_substitutes_operator_name(self):
        with tempfile.TemporaryDirectory() as td:
            cfg = OutreachConfig(
                operator_name="Acme Casino",
                template_id="g1",
                game_title="G1",
            )
            pkg = build_outreach_package(Path(td), cfg)
            cover = pkg.cover_letter.read_text()
            self.assertIn("Acme Casino", cover)
            self.assertIn("G1", cover)

    def test_pricing_csv_has_one_row(self):
        with tempfile.TemporaryDirectory() as td:
            cfg = OutreachConfig(
                operator_name="X",
                template_id="t1",
                game_title="T1",
                price_eur=2499,
            )
            pkg = build_outreach_package(Path(td), cfg)
            rows = list(csv.reader(pkg.pricing_csv.open()))
            self.assertEqual(rows[0],
                             ["template_id", "tier", "price_eur_year", "swid"])
            self.assertEqual(rows[1][2], "2499")

    def test_zip_bundle_contains_three_files(self):
        with tempfile.TemporaryDirectory() as td:
            cfg = OutreachConfig(
                operator_name="X", template_id="t", game_title="T",
            )
            pkg = build_outreach_package(Path(td), cfg)
            with zipfile.ZipFile(pkg.bundle_zip) as zf:
                names = sorted(zf.namelist())
            self.assertIn("cover_letter.md", names)
            self.assertIn("tech_brief.md", names)
            self.assertIn("pricing.csv", names)

    def test_attachments_included(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            cert = td / "cert.zip"
            cert.write_bytes(b"PKfake")
            cfg = OutreachConfig(
                operator_name="X", template_id="t", game_title="T",
            )
            pkg = build_outreach_package(td, cfg, attachments=[cert])
            with zipfile.ZipFile(pkg.bundle_zip) as zf:
                names = sorted(zf.namelist())
            self.assertIn("attachments/cert.zip", names)

    def test_cli_smoke(self):
        from tools.pilot_outreach.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            rc = main([
                "--out", str(td),
                "--operator-name", "Acme",
                "--game-title", "Demo",
                "--template-id", "demo",
                "--json",
            ])
            self.assertEqual(rc, 0)


# ─── W77 — Public Benchmark ────────────────────────────────────────


class PublicBenchmarkTest(unittest.TestCase):
    def test_reference_dataset_is_populated(self):
        self.assertGreaterEqual(len(PUBLISHED_REFERENCES), 5)

    def test_benchmark_emits_entry_per_ir(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g.ir.json").write_text(json.dumps(_ir(
                "g", features=["free_spins", "tumble"]
            )))
            r = build_benchmark(td)
            self.assertEqual(len(r.entries), 1)
            self.assertGreater(r.entries[0].speedup_factor, 1000)

    def test_accuracy_band_classification(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            # target_rtp aligned to ~0.9651 (Sweet Bonanza)
            (td / "g.ir.json").write_text(json.dumps(_ir(
                "g", target_rtp=0.9651,
                features=["tumble", "free_spins", "multiplier"],
            )))
            r = build_benchmark(td)
            self.assertEqual(r.entries[0].accuracy_band, "green")

    def test_emit_writes_json_and_markdown(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g.ir.json").write_text(json.dumps(_ir("g")))
            r = build_benchmark(td)
            paths = emit_benchmark(r, td / "out")
            self.assertTrue(paths["json"].exists())
            self.assertTrue(paths["md"].exists())

    def test_cli_smoke(self):
        from tools.public_benchmark.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "g.ir.json").write_text(json.dumps(_ir("g")))
            rc = main([str(td), "--out", str(td / "out"), "--json"])
            self.assertEqual(rc, 0)


# ─── W78 — Community Contributor Flow ──────────────────────────────


class CommunityContributeTest(unittest.TestCase):
    def test_bootstrap_creates_all_files(self):
        with tempfile.TemporaryDirectory() as td:
            params = StarterParams(
                template_id="my-game",
                contributor="alice",
                title="My Game",
                features=["free_spins"],
            )
            pkg = bootstrap_contribution(Path(td), params)
            self.assertTrue(pkg.ir_path.exists())
            self.assertTrue(pkg.cert_xml_stub.exists())
            self.assertTrue(pkg.pr_description.exists())
            self.assertTrue(pkg.contributing_md.exists())
            self.assertTrue(pkg.contribution_meta.exists())

    def test_ir_starter_is_valid_json_and_carries_template_id(self):
        with tempfile.TemporaryDirectory() as td:
            params = StarterParams(template_id="abc-game")
            pkg = bootstrap_contribution(Path(td), params)
            data = json.loads(pkg.ir_path.read_text())
            self.assertEqual(data["meta"]["id"], "abc-game")
            self.assertIn("paytable", data)
            self.assertIn("reels", data)

    def test_cert_stub_is_v2_namespace(self):
        with tempfile.TemporaryDirectory() as td:
            params = StarterParams(template_id="g")
            pkg = bootstrap_contribution(Path(td), params)
            self.assertIn("urn:slotmath:cert:v2",
                          pkg.cert_xml_stub.read_text())

    def test_pr_description_contains_contributor(self):
        with tempfile.TemporaryDirectory() as td:
            params = StarterParams(
                template_id="g", contributor="bob",
            )
            pkg = bootstrap_contribution(Path(td), params)
            self.assertIn("bob", pkg.pr_description.read_text())

    def test_cli_smoke(self):
        from tools.community_contribute.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            rc = main([
                "--out", str(td),
                "--template-id", "cli-demo",
                "--contributor", "alice",
                "--json",
            ])
            self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
