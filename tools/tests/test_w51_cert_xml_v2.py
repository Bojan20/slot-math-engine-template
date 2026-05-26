"""W51 — Cert XML v2 (Jurisdiction-Tagged Provenance) tests."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from tools.slot_build.cert_xml_v2 import (
    JurisdictionEntry,
    NS_URI_V2,
    emit_cert_xml_v2,
    ir_digest,
    validate_cert_xml_v2,
)


def _ir() -> dict:
    return {
        "meta": {
            "id": "test_game",
            "name": "Test Game",
            "vendor": "vendor_a",
            "swid": "S-TEST-0001",
            "version": "1.0.0",
            "target_rtp": 0.96,
            "notes": ["wave W51 smoke", "regulator pre-flight"],
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {"max_win_x": 5000.0, "min_spin_duration_ms": 2500},
        "features": [{"kind": "free_spins"}, {"kind": "hold_and_win"}],
        "reels": {"base": [["A"] * 30 for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
    }


def _mc() -> dict:
    return {
        "rtp": 0.9601,
        "spins": 10_000_000,
        "hit_freq": 0.27,
        "win_freq": 0.22,
        "volatility": 18.5,
        "per_feature_rtp": {"free_spins": 0.11, "hold_and_win": 0.42},
        "per_feature_trigger": {"free_spins": 0.014, "hold_and_win": 0.008},
    }


class V2EmitTest(unittest.TestCase):
    def test_emit_writes_v2_namespace(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert_v2.xml"
            emit_cert_xml_v2(_ir(), out, mc_report=_mc())
            text = out.read_text()
            self.assertIn(NS_URI_V2, text)
            self.assertIn('cert_version="2.0"', text)

    def test_emit_includes_per_jurisdiction_provenance(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            entries = [
                JurisdictionEntry(
                    id="ukgc",
                    passed=True,
                    profile_version="v1.4",
                    regulator_url="https://www.gamblingcommission.gov.uk/",
                    ir_digest_sha256=ir_digest(_ir()),
                    signature_b64="UKGCsig==",
                    signed_at_utc="2026-05-26T16:00:00Z",
                    notes=["RTS 14D compliant"],
                ),
                JurisdictionEntry(
                    id="mga",
                    passed=True,
                    profile_version="2024.1",
                    regulator_url="https://www.mga.org.mt/",
                    ir_digest_sha256=ir_digest(_ir()),
                    signature_b64="MGAsig==",
                ),
                JurisdictionEntry(
                    id="ontario",
                    passed=False,
                    profile_version="2025.q2",
                    errors=["max-win cap below regulator-mandated floor"],
                ),
            ]
            emit_cert_xml_v2(
                _ir(),
                out,
                mc_report=_mc(),
                jurisdictions=entries,
            )
            tree = ET.parse(out)
            root = tree.getroot()
            mj = root.find(f"{{{NS_URI_V2}}}MultiJurisdiction")
            self.assertIsNotNone(mj)
            children = mj.findall(f"{{{NS_URI_V2}}}JurisdictionProvenance")
            ids = sorted(c.attrib["id"] for c in children)
            self.assertEqual(ids, ["mga", "ontario", "ukgc"])
            self.assertEqual(mj.attrib["count"], "3")

    def test_emit_degrades_gracefully_without_jurisdictions(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            emit_cert_xml_v2(_ir(), out, mc_report=_mc())
            tree = ET.parse(out)
            root = tree.getroot()
            mj = root.find(f"{{{NS_URI_V2}}}MultiJurisdiction")
            self.assertIsNotNone(mj)
            self.assertEqual(mj.attrib["count"], "0")

    def test_emit_attaches_provenance_block_when_provided(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            emit_cert_xml_v2(
                _ir(),
                out,
                mc_report=_mc(),
                provenance={
                    "ir_sha256": "a" * 64,
                    "par_merkle_root": "b" * 64,
                    "signature": "PROV==",
                },
            )
            tree = ET.parse(out)
            root = tree.getroot()
            prov = root.find(f"{{{NS_URI_V2}}}Provenance")
            self.assertIsNotNone(prov)
            self.assertEqual(prov.attrib["ir_sha256"], "a" * 64)


class V2ValidateTest(unittest.TestCase):
    def test_validate_clean_pass(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            emit_cert_xml_v2(
                _ir(),
                out,
                mc_report=_mc(),
                jurisdictions=[JurisdictionEntry(id="ukgc", passed=True)],
            )
            report = validate_cert_xml_v2(out)
            self.assertTrue(report["passed"], msg=report)
            self.assertEqual(report["namespace"], NS_URI_V2)
            self.assertEqual(report["cert_version"], "2.0")
            self.assertIn("MultiJurisdiction", report["sections"])
            self.assertEqual(report["jurisdiction_ids"], ["ukgc"])

    def test_validate_reports_missing_sections(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "minimal.xml"
            # Hand-craft an intentionally-broken XML to confirm
            # the validator surfaces missing sections.
            broken = (
                '<?xml version="1.0" ?>'
                f'<SlotMathCert xmlns="{NS_URI_V2}" cert_version="2.0"/>'
            )
            out.write_text(broken)
            report = validate_cert_xml_v2(out)
            self.assertFalse(report["passed"])
            self.assertTrue(report["missing"])
            self.assertEqual(report["namespace"], NS_URI_V2)


class IrDigestTest(unittest.TestCase):
    def test_digest_is_deterministic(self):
        d1 = ir_digest(_ir())
        d2 = ir_digest(_ir())
        self.assertEqual(d1, d2)
        self.assertEqual(len(d1), 64)

    def test_digest_changes_on_paytable_edit(self):
        ir1 = _ir()
        ir2 = _ir()
        ir2["paytable"][0]["pays"] = 200
        self.assertNotEqual(ir_digest(ir1), ir_digest(ir2))


class V2CliTest(unittest.TestCase):
    def test_cli_smoke_with_juris_entries(self):
        from tools.slot_build.cert_xml_v2 import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ir_path = td / "ir.json"
            out_path = td / "cert.xml"
            ir_path.write_text(json.dumps(_ir()))
            rc = main(
                [
                    str(ir_path),
                    "--out",
                    str(out_path),
                    "--juris-entry",
                    'ukgc:{"passed":true,"profile_version":"v1.4"}',
                    "--juris-entry",
                    'mga:{"passed":true}',
                    "--validate",
                ]
            )
            self.assertEqual(rc, 0)
            self.assertTrue(out_path.exists())
            report = validate_cert_xml_v2(out_path)
            self.assertTrue(report["passed"])
            self.assertEqual(sorted(report["jurisdiction_ids"]),
                             ["mga", "ukgc"])


if __name__ == "__main__":
    unittest.main()
