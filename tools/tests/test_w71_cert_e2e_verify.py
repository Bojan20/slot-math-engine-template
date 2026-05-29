"""W71 — Cert E2E Verifier tests."""
from __future__ import annotations
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools.cert_e2e_verify.verifier import E2EVerdict, verify_e2e


def _write_manifest(d: Path, entries: list[tuple[str, bytes]]):
    manifest = {
        "entries": [
            {
                "name": name,
                "rel_path": name,
                "sha256": hashlib.sha256(data).hexdigest(),
                "size_bytes": len(data),
            }
            for name, data in entries
        ]
    }
    (d / "manifest.json").write_text(json.dumps(manifest, indent=2))


class DiscoverTest(unittest.TestCase):
    def test_discover_finds_typical_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "manifest.json").write_text("{}")
            (td / "cert.xml").write_text("<x/>")
            (td / "ir.json").write_text("{}")
            (td / "sbom.json").write_text(json.dumps({"components": []}))
            rep = verify_e2e(td)
            self.assertIn("manifest", rep.discovered)
            self.assertIn("cert_xml", rep.discovered)
            self.assertIn("ir", rep.discovered)


class BundleVerifyStepTest(unittest.TestCase):
    def test_bundle_verify_pass(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            data = b"file body"
            (td / "a.bin").write_bytes(data)
            _write_manifest(td, [("a.bin", data)])
            rep = verify_e2e(td)
            bv = next(s for s in rep.steps if s.name == "bundle_verify")
            self.assertEqual(bv.status, "pass")

    def test_bundle_verify_fail_on_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "a.bin").write_bytes(b"actual")
            _write_manifest(td, [("a.bin", b"expected_different")])
            rep = verify_e2e(td)
            bv = next(s for s in rep.steps if s.name == "bundle_verify")
            self.assertEqual(bv.status, "fail")


class CertVerifyStepTest(unittest.TestCase):
    def test_cert_xml_v2_ok(self):
        from tools.slot_build.cert_xml_v2 import (
            emit_cert_xml_v2,
            JurisdictionEntry,
        )

        ir = {
            "meta": {"id": "g", "vendor": "v", "target_rtp": 0.96},
            "topology": {"reels": 5, "rows": 3},
            "evaluation": {"paylines": list(range(20))},
            "limits": {},
            "features": [],
            "reels": {"base": []},
            "paytable": [],
        }
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            emit_cert_xml_v2(
                ir, td / "cert.xml",
                jurisdictions=[JurisdictionEntry(id="ukgc", passed=True)],
            )
            (td / "ir.json").write_text(json.dumps(ir))
            rep = verify_e2e(td)
            cv = next(s for s in rep.steps if s.name == "cert_verify")
            self.assertEqual(cv.status, "pass")

    def test_cert_verify_skip_when_no_xml(self):
        with tempfile.TemporaryDirectory() as td:
            rep = verify_e2e(Path(td))
            cv = next(s for s in rep.steps if s.name == "cert_verify")
            self.assertEqual(cv.status, "skip")


class ZipUnpackTest(unittest.TestCase):
    def test_zip_target_is_extracted(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            zpath = td / "bundle.zip"
            with zipfile.ZipFile(zpath, "w") as zf:
                zf.writestr("manifest.json", "{}")
                zf.writestr("cert.xml", "<x/>")
            rep = verify_e2e(zpath)
            self.assertIn("unpacked_to", rep.discovered)
            # cert.xml should be auto-detected after extraction.
            self.assertIn("cert_xml", rep.discovered)


class CliTest(unittest.TestCase):
    def test_cli_smoke(self):
        from tools.cert_e2e_verify.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            (td / "manifest.json").write_text(
                json.dumps({"entries": []})
            )
            rc = main([str(td), "--json"])
            # Empty bundle: manifest pass, cert_verify skip, others skip
            # → verdict WARN → exit 1
            self.assertEqual(rc, 1)


class VerdictMappingTest(unittest.TestCase):
    def test_all_skip_yields_warn(self):
        with tempfile.TemporaryDirectory() as td:
            rep = verify_e2e(Path(td))
            # All steps skip → verdict WARN
            self.assertEqual(rep.verdict, E2EVerdict.WARN)
            self.assertEqual(rep.exit_code(), 1)


if __name__ == "__main__":
    unittest.main()
