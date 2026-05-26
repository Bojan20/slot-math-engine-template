"""W56 — Cert XML Verify tests."""
from __future__ import annotations
import base64
import json
import tempfile
import unittest
from pathlib import Path

from tools.cert_verify.verifier import (
    CertVerdict,
    verify_cert_xml,
    verify_cert_xml_against_ir,
    verify_cert_xml_signatures,
    verify_signature_b64,
)
from tools.slot_build.cert_xml import emit_cert_xml
from tools.slot_build.cert_xml_v2 import (
    JurisdictionEntry,
    emit_cert_xml_v2,
    ir_digest,
)


def _ir() -> dict:
    return {
        "meta": {
            "id": "g1",
            "name": "Test",
            "vendor": "vendor_a",
            "swid": "S-XX-001",
            "version": "1.0.0",
            "target_rtp": 0.96,
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {"max_win_x": 5000.0},
        "features": [{"kind": "free_spins"}],
        "reels": {"base": [["A"] * 30 for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
    }


class StructuralVerifyTest(unittest.TestCase):
    def test_verify_v2_clean_pass(self):
        with tempfile.TemporaryDirectory() as td:
            cert = Path(td) / "cert.xml"
            emit_cert_xml_v2(
                _ir(), cert,
                jurisdictions=[JurisdictionEntry(id="ukgc", passed=True)],
            )
            report = verify_cert_xml(cert)
            self.assertEqual(report.verdict, CertVerdict.PASS)
            self.assertEqual(report.detected_schema, "v2")
            self.assertIn("ukgc", report.jurisdiction_ids)

    def test_verify_v1_clean_pass(self):
        with tempfile.TemporaryDirectory() as td:
            cert = Path(td) / "cert.xml"
            emit_cert_xml(_ir(), cert)
            report = verify_cert_xml(cert)
            self.assertEqual(report.verdict, CertVerdict.PASS, msg=report.errors)
            self.assertEqual(report.detected_schema, "v1")

    def test_verify_missing_file(self):
        report = verify_cert_xml(Path("/nonexistent/cert.xml"))
        self.assertEqual(report.verdict, CertVerdict.FAIL)
        self.assertTrue(any("missing" in e for e in report.errors))

    def test_verify_unknown_namespace_fails(self):
        with tempfile.TemporaryDirectory() as td:
            cert = Path(td) / "broken.xml"
            cert.write_text(
                '<?xml version="1.0"?><Cert xmlns="urn:bogus:v1"/>'
            )
            report = verify_cert_xml(cert)
            self.assertEqual(report.verdict, CertVerdict.FAIL)
            self.assertTrue(any("unrecognized" in e for e in report.errors))

    def test_verify_malformed_xml(self):
        with tempfile.TemporaryDirectory() as td:
            cert = Path(td) / "bad.xml"
            cert.write_text("not xml at all")
            report = verify_cert_xml(cert)
            self.assertEqual(report.verdict, CertVerdict.FAIL)


class IrDigestCrossCheckTest(unittest.TestCase):
    def test_matching_digest_passes(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ir = _ir()
            d = ir_digest(ir)
            cert = td / "cert.xml"
            ir_path = td / "ir.json"
            ir_path.write_text(json.dumps(ir))
            emit_cert_xml_v2(
                ir, cert,
                jurisdictions=[
                    JurisdictionEntry(
                        id="ukgc", passed=True, ir_digest_sha256=d
                    )
                ],
            )
            report = verify_cert_xml_against_ir(cert, ir_path)
            self.assertEqual(report.verdict, CertVerdict.PASS, msg=report.errors)
            self.assertTrue(report.ir_digest_matches)

    def test_mismatching_digest_fails(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ir = _ir()
            cert = td / "cert.xml"
            ir_path = td / "ir.json"
            ir_path.write_text(json.dumps(ir))
            emit_cert_xml_v2(
                ir, cert,
                jurisdictions=[
                    JurisdictionEntry(
                        id="ukgc", passed=True,
                        ir_digest_sha256="0" * 64,
                    ),
                ],
            )
            report = verify_cert_xml_against_ir(cert, ir_path)
            self.assertEqual(report.verdict, CertVerdict.FAIL)
            self.assertFalse(report.ir_digest_matches)

    def test_no_digest_in_cert_warns_not_fails(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            ir = _ir()
            cert = td / "cert.xml"
            ir_path = td / "ir.json"
            ir_path.write_text(json.dumps(ir))
            emit_cert_xml_v2(ir, cert)
            report = verify_cert_xml_against_ir(cert, ir_path)
            self.assertIsNone(report.ir_digest_matches)
            self.assertTrue(any("no IR digest" in w for w in report.warnings))


class SignatureTest(unittest.TestCase):
    def _gen_keypair(self):
        from cryptography.hazmat.primitives.asymmetric import ed25519
        from cryptography.hazmat.primitives import serialization
        sk = ed25519.Ed25519PrivateKey.generate()
        pk_pem = sk.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return sk, pk_pem

    def test_valid_signature_passes(self):
        sk, pk_pem = self._gen_keypair()
        payload = b"hello"
        sig_b64 = base64.b64encode(sk.sign(payload)).decode("ascii")
        self.assertTrue(verify_signature_b64(payload, sig_b64, pk_pem))

    def test_tampered_payload_fails(self):
        sk, pk_pem = self._gen_keypair()
        sig_b64 = base64.b64encode(sk.sign(b"original")).decode("ascii")
        self.assertFalse(verify_signature_b64(b"tampered", sig_b64, pk_pem))

    def test_no_signatures_yields_warning(self):
        sk, pk_pem = self._gen_keypair()
        with tempfile.TemporaryDirectory() as td:
            cert = Path(td) / "cert.xml"
            emit_cert_xml_v2(_ir(), cert)
            report = verify_cert_xml_signatures(cert, pk_pem)
            self.assertIsNone(report.signature_verified)
            self.assertTrue(any("no per-jurisdiction" in w
                                for w in report.warnings))


class CliTest(unittest.TestCase):
    def test_cli_pass(self):
        from tools.cert_verify.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            cert = td / "cert.xml"
            emit_cert_xml_v2(
                _ir(), cert,
                jurisdictions=[JurisdictionEntry(id="ukgc", passed=True)],
            )
            rc = main([str(cert), "--json"])
            self.assertEqual(rc, 0)

    def test_cli_fail_on_unknown_ns(self):
        from tools.cert_verify.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            cert = Path(td) / "x.xml"
            cert.write_text('<?xml version="1.0"?><A xmlns="urn:bogus:v9"/>')
            rc = main([str(cert)])
            self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
