"""W5.6+ — Regulator XML cert emitter tests.

Verifies the XML build pipeline:
  • required sections present + namespace-tagged
  • RtpReport delta math
  • feature breakdown picks up per_feature_rtp + per_feature_trigger
  • jurisdiction reports accept both list + summary dict shapes
  • provenance optional
  • validate_cert_xml roundtrip
  • CLI happy path + error branches

Run:
    python -m unittest tools.tests.test_w5_6_cert_xml
"""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.slot_build.cert_xml import (
    NS_URI,
    build_cert_tree,
    emit_cert_xml,
    main as xml_main,
    validate_cert_xml,
)


_IR = {
    "meta": {
        "name": "Test Slot",
        "vendor": "synth",
        "swid": "SYNTH-TEST-001",
        "version": "1.0",
        "target_rtp": 0.96,
        "notes": ["W4.3e patched", "P1.6 audit"],
    },
    "topology": {"reels": 5, "rows": 3, "kind": "rectangular"},
    "evaluation": {"paylines": [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1]]},
    "limits": {"max_win_x": 500000, "min_spin_duration_ms": 2000},
    "features": [
        {"kind": "free_spins"},
        {"kind": "hold_and_win"},
    ],
}

_MC = {
    "rtp": 0.9598,
    "spins": 10_000_000,
    "hit_freq": 0.27,
    "win_freq": 0.22,
    "volatility": 14.3,
    "per_feature_rtp": {"free_spins": 0.10, "hold_and_win": 0.20},
    "per_feature_trigger": {"free_spins": 0.014, "hold_and_win": 0.008},
}

_JURIS = [
    {"profile_id": "ukgc", "passed": True, "error_count": 0, "warning_count": 2},
    {"profile_id": "mga", "errors": [], "warnings": ["LDW missing"]},
]


def _qn(tag: str) -> str:
    """Namespace-prefixed tag for findall queries."""
    return f"{{{NS_URI}}}{tag}"


# ─── Tree builder ──────────────────────────────────────────────────────────


class TestBuildTree(unittest.TestCase):
    def test_root_element_namespace(self):
        tree = build_cert_tree(_IR)
        root = tree.getroot()
        self.assertEqual(root.tag, _qn("SlotMathCert"))
        self.assertEqual(root.get("cert_version"), "1.0")
        self.assertIn("emitted_at", root.attrib)

    def test_all_required_sections_present(self):
        tree = build_cert_tree(_IR)
        root = tree.getroot()
        for sec in ("Meta", "Topology", "Limits", "RtpReport",
                     "FeatureBreakdown", "Jurisdictions",
                     "Provenance", "AuditTrail"):
            self.assertIsNotNone(root.find(_qn(sec)), f"missing {sec}")

    def test_meta_fields_propagate(self):
        root = build_cert_tree(_IR).getroot()
        meta = root.find(_qn("Meta"))
        self.assertEqual(meta.get("name"), "Test Slot")
        self.assertEqual(meta.get("vendor"), "synth")
        self.assertEqual(meta.get("swid"), "SYNTH-TEST-001")

    def test_topology_counts_paylines(self):
        root = build_cert_tree(_IR).getroot()
        topo = root.find(_qn("Topology"))
        self.assertEqual(topo.get("paylines"), "2")
        self.assertEqual(topo.get("reels"), "5")

    def test_rtp_report_computes_delta(self):
        root = build_cert_tree(_IR, mc_report=_MC).getroot()
        rtp = root.find(_qn("RtpReport"))
        # target 0.96, measured 0.9598 → delta 0.0002
        self.assertAlmostEqual(float(rtp.get("delta")), 0.0002, places=5)
        self.assertEqual(rtp.get("sample_size"), "10000000")

    def test_rtp_report_no_mc_passes_target_only(self):
        root = build_cert_tree(_IR).getroot()
        rtp = root.find(_qn("RtpReport"))
        self.assertEqual(float(rtp.get("target")), 0.96)
        self.assertIsNone(rtp.get("measured"))

    def test_feature_breakdown_picks_rtp_contribution(self):
        root = build_cert_tree(_IR, mc_report=_MC).getroot()
        fb = root.find(_qn("FeatureBreakdown"))
        kinds = [f.get("kind") for f in fb.findall(_qn("Feature"))]
        self.assertIn("free_spins", kinds)
        self.assertIn("hold_and_win", kinds)
        fs = next(f for f in fb.findall(_qn("Feature"))
                   if f.get("kind") == "free_spins")
        self.assertAlmostEqual(float(fs.get("rtp_contribution")), 0.10, places=4)

    def test_jurisdictions_accept_both_shapes(self):
        root = build_cert_tree(_IR, jurisdiction_reports=_JURIS).getroot()
        js = root.find(_qn("Jurisdictions"))
        profiles = js.findall(_qn("Profile"))
        self.assertEqual(len(profiles), 2)
        ids = {p.get("id") for p in profiles}
        self.assertEqual(ids, {"ukgc", "mga"})
        # Both should be passed=true (mga has 0 errors)
        for p in profiles:
            self.assertEqual(p.get("passed"), "true")

    def test_provenance_passthrough(self):
        prov = {
            "ir_sha256": "deadbeef",
            "par_merkle_root": "cafef00d",
            "signature": "ABCD…",
        }
        root = build_cert_tree(_IR, provenance=prov).getroot()
        pe = root.find(_qn("Provenance"))
        self.assertEqual(pe.get("ir_sha256"), "deadbeef")
        self.assertEqual(pe.get("signature"), "ABCD…")

    def test_audit_trail_emits_notes(self):
        root = build_cert_tree(_IR).getroot()
        at = root.find(_qn("AuditTrail"))
        notes = at.findall(_qn("Note"))
        self.assertEqual(len(notes), 2)
        self.assertEqual(notes[0].text, "W4.3e patched")


# ─── Emit + validate roundtrip ─────────────────────────────────────────────


class TestEmitCertXml(unittest.TestCase):
    def test_emit_writes_xml_file(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            p = emit_cert_xml(_IR, out, mc_report=_MC)
            self.assertTrue(p.is_file())

    def test_validate_passes_full_cert(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            emit_cert_xml(_IR, out, mc_report=_MC,
                           jurisdiction_reports=_JURIS)
            result = validate_cert_xml(out)
            self.assertTrue(result["passed"], result["issues"])
            self.assertGreaterEqual(len(result["sections_found"]), 8)

    def test_validate_detects_corrupt_xml(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "bad.xml"
            out.write_text("<not></valid")
            result = validate_cert_xml(out)
            self.assertFalse(result["passed"])

    def test_emitted_xml_parses_back(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            emit_cert_xml(_IR, out, mc_report=_MC)
            tree = ET.parse(str(out))
            self.assertEqual(tree.getroot().get("cert_version"), "1.0")


# ─── CLI ───────────────────────────────────────────────────────────────────


class TestCli(unittest.TestCase):
    def test_cli_happy_path_with_validate(self):
        with tempfile.TemporaryDirectory() as td:
            ir_path = Path(td) / "ir.json"
            mc_path = Path(td) / "mc.json"
            j_path = Path(td) / "j.json"
            ir_path.write_text(json.dumps(_IR))
            mc_path.write_text(json.dumps(_MC))
            j_path.write_text(json.dumps(_JURIS))
            out = Path(td) / "cert.xml"
            rc = xml_main([
                str(ir_path),
                "--mc", str(mc_path),
                "--juris", str(j_path),
                "--out", str(out),
                "--validate",
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            self.assertTrue(out.is_file())

    def test_cli_minimum_ir_only(self):
        with tempfile.TemporaryDirectory() as td:
            ir_path = Path(td) / "ir.json"
            ir_path.write_text(json.dumps(_IR))
            out = Path(td) / "cert.xml"
            rc = xml_main([str(ir_path), "--out", str(out), "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue(out.is_file())

    def test_cli_missing_ir(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "cert.xml"
            rc = xml_main(["/nonexistent/ir.json",
                            "--out", str(out), "--quiet"])
            self.assertEqual(rc, 2)

    def test_cli_jurisdiction_list_shape(self):
        with tempfile.TemporaryDirectory() as td:
            ir_path = Path(td) / "ir.json"
            j_path = Path(td) / "j.json"
            ir_path.write_text(json.dumps(_IR))
            j_path.write_text(json.dumps({"reports": _JURIS}))
            out = Path(td) / "cert.xml"
            rc = xml_main([
                str(ir_path),
                "--juris", str(j_path),
                "--out", str(out),
                "--quiet",
            ])
            self.assertEqual(rc, 0)
            tree = ET.parse(str(out))
            profiles = tree.getroot().find(_qn("Jurisdictions")).findall(_qn("Profile"))
            self.assertEqual(len(profiles), 2)


if __name__ == "__main__":
    unittest.main()
