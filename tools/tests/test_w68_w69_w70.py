"""W68 + W69 + W70 combined tests."""
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

# W68
from tools.pubkey_bundle import (
    build_bundle,
    verify_bundle,
    canonical_json,
)
from tools.pubkey_bundle.__main__ import main as pkb_main

# W69
from tools.sbom_diff import diff_sboms, render_markdown
from tools.sbom_diff.__main__ import main as sd_main
from tools.cert_sbom.emitter import build_sbom

# W70
from tools.pilot_signoff_pdf import emit_pdf, text_to_pdf
from tools.pilot_signoff_pdf.__main__ import main as ps_pdf_main
from tools.vendor_onboard.wizard import run_onboarding


try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: F401
        Ed25519PrivateKey,
    )
    from tools.plugin_sign.signer import generate_keypair
    HAVE_CRYPTO = True
except ImportError:
    HAVE_CRYPTO = False


# ─── W68: Pub-key Bundle ───────────────────────────────────────────


@unittest.skipUnless(HAVE_CRYPTO, "cryptography not installed")
class TestPubkeyBundle(unittest.TestCase):
    def _seed_keys(self, root: Path, plugins: list[tuple[str, str]]) -> None:
        for plugin_id, version in plugins:
            sub = root / plugin_id / version
            generate_keypair(sub)
            # Strip the private key — bundle only cares about public
            (sub / "private.pem").unlink(missing_ok=True)

    def test_build_walks_pubkey_layout(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            keys = d / "keys"
            self._seed_keys(keys, [("p1", "1.0.0"), ("p2", "1.0.0")])
            out = d / "bundle.json"
            report = build_bundle(keys_root=keys, out_path=out)
            self.assertEqual(report.n_entries, 2)
            self.assertTrue(out.exists())
            for e in report.entries:
                self.assertEqual(len(e.pubkey_pem_sha256), 64)

    def test_verify_intact_bundle(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            keys = d / "keys"
            self._seed_keys(keys, [("p1", "1.0.0")])
            out = d / "bundle.json"
            build_bundle(keys_root=keys, out_path=out)
            r = verify_bundle(bundle_path=out, keys_root=keys)
            self.assertTrue(r.passed)
            self.assertEqual(r.n_pubkey_mismatch, 0)

    def test_verify_detects_tampered_pubkey(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            keys = d / "keys"
            self._seed_keys(keys, [("p1", "1.0.0")])
            out = d / "bundle.json"
            build_bundle(keys_root=keys, out_path=out)
            # Tamper one pubkey file
            (keys / "p1" / "1.0.0" / "public.pem").write_text("FAKE")
            r = verify_bundle(bundle_path=out, keys_root=keys)
            self.assertFalse(r.passed)
            self.assertEqual(r.n_pubkey_mismatch, 1)

    def test_build_with_master_signature(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            keys = d / "keys"
            self._seed_keys(keys, [("p1", "1.0.0")])
            master_dir = d / "master"
            master_priv, master_pub = generate_keypair(master_dir)
            out = d / "bundle.json"
            report = build_bundle(
                keys_root=keys, out_path=out,
                master_private_pem=master_priv,
                master_public_pem=master_pub,
            )
            self.assertTrue(report.bundle_sig_b64)
            r = verify_bundle(
                bundle_path=out, keys_root=keys,
                master_public_pem=master_pub,
            )
            self.assertTrue(r.passed)
            self.assertTrue(r.sig_valid)

    def test_wrong_master_public_fails_sig(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            keys = d / "keys"
            self._seed_keys(keys, [("p1", "1.0.0")])
            master_dir = d / "master"
            master_priv, _ = generate_keypair(master_dir)
            wrong_dir = d / "wrong"
            _, wrong_pub = generate_keypair(wrong_dir)
            out = d / "bundle.json"
            build_bundle(
                keys_root=keys, out_path=out,
                master_private_pem=master_priv,
            )
            r = verify_bundle(
                bundle_path=out, keys_root=keys,
                master_public_pem=wrong_pub,
            )
            self.assertFalse(r.sig_valid)

    def test_canonical_json_strips_signature(self):
        payload = {
            "entries": [{"a": 1}],
            "bundle_sig_b64": "should-be-stripped",
            "generated_at_utc": "2026-05-26T00:00:00Z",
        }
        blob = canonical_json(payload)
        self.assertNotIn(b"bundle_sig_b64", blob)
        self.assertIn(b"entries", blob)

    def test_cli_build_and_verify(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            keys = d / "keys"
            self._seed_keys(keys, [("plg", "0.0.1")])
            bundle = d / "bundle.json"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc1 = pkb_main([
                    "build",
                    "--keys-root", str(keys),
                    "--out", str(bundle),
                    "--quiet",
                ])
            self.assertEqual(rc1, 0)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc2 = pkb_main([
                    "verify",
                    "--bundle", str(bundle),
                    "--keys-root", str(keys),
                    "--quiet",
                ])
            self.assertEqual(rc2, 0)


# ─── W69: SBOM Diff ────────────────────────────────────────────────


class TestSBOMDiff(unittest.TestCase):
    def _sbom(self, *, components: list[dict], entry_points: dict[str, str] | None = None):
        eps = entry_points or {}
        return {
            "bomFormat": "CycloneDX",
            "specVersion": "1.4",
            "metadata": {
                "timestamp": "2026-05-26T00:00:00Z",
                "component": {"type": "application", "name": "t", "version": "1.0.0"},
            },
            "components": components,
            "annotations": [{
                "text": json.dumps({"entry_points": eps}),
            }],
        }

    def _comp(self, name: str, version: str = "1.0.0", sha: str = "a" * 64):
        purl = f"pkg:python/{name}@{version}"
        return {
            "type": "library",
            "bom-ref": purl,
            "name": name,
            "version": version,
            "purl": purl,
            "hashes": [{"alg": "SHA-256", "content": sha}],
        }

    def test_identical_sboms_pass(self):
        old = self._sbom(components=[self._comp("a"), self._comp("b")])
        r = diff_sboms(old, old)
        self.assertTrue(r.passed)

    def test_added_component_is_compatible(self):
        old = self._sbom(components=[self._comp("a")])
        new = self._sbom(components=[self._comp("a"), self._comp("b")])
        r = diff_sboms(old, new)
        self.assertEqual(r.added, ["pkg:python/b@1.0.0"])
        self.assertTrue(r.passed)

    def test_removed_component_is_breaking(self):
        old = self._sbom(components=[self._comp("a"), self._comp("b")])
        new = self._sbom(components=[self._comp("a")])
        r = diff_sboms(old, new)
        self.assertEqual(r.removed, ["pkg:python/b@1.0.0"])
        self.assertFalse(r.passed)

    def test_hash_drift_on_existing_is_breaking(self):
        # Same purl (so a == a) but different hash → hash_drift
        old_a = self._comp("a", sha="a" * 64)
        new_a = self._comp("a", sha="b" * 64)
        # Pin both to the SAME version + purl so they're matched up
        new_a["purl"] = old_a["purl"]
        new_a["bom-ref"] = old_a["bom-ref"]
        new_a["version"] = old_a["version"]
        old = self._sbom(components=[old_a])
        new = self._sbom(components=[new_a])
        r = diff_sboms(old, new)
        self.assertEqual(len(r.deltas), 1)
        self.assertTrue(r.deltas[0].hash_drift)
        self.assertFalse(r.passed)

    def test_entry_point_removal_is_breaking(self):
        old = self._sbom(components=[], entry_points={"slot-a": "x", "slot-b": "y"})
        new = self._sbom(components=[], entry_points={"slot-a": "x"})
        r = diff_sboms(old, new)
        self.assertIn("slot-b", r.entry_points_removed)
        self.assertFalse(r.passed)

    def test_entry_point_addition_is_compatible(self):
        old = self._sbom(components=[], entry_points={"slot-a": "x"})
        new = self._sbom(components=[], entry_points={"slot-a": "x", "slot-b": "y"})
        r = diff_sboms(old, new)
        self.assertIn("slot-b", r.entry_points_added)
        self.assertTrue(r.passed)

    def test_real_sbom_self_diff_compatible(self):
        s1 = build_sbom(repo_root=ROOT, bump_serial=False)
        s2 = build_sbom(repo_root=ROOT, bump_serial=False)
        r = diff_sboms(s1.to_cyclonedx(), s2.to_cyclonedx())
        self.assertTrue(r.passed)
        self.assertEqual(r.added, [])
        self.assertEqual(r.removed, [])

    def test_markdown_render_includes_verdict(self):
        old = self._sbom(components=[self._comp("a"), self._comp("b")])
        new = self._sbom(components=[self._comp("a")])
        r = diff_sboms(old, new)
        md = render_markdown(r)
        self.assertIn("SBOM Diff", md)
        self.assertIn("BREAKING", md)
        self.assertIn("Removed components", md)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            old = self._sbom(components=[self._comp("a")])
            new = self._sbom(components=[self._comp("a"), self._comp("b")])
            (d / "o.json").write_text(json.dumps(old))
            (d / "n.json").write_text(json.dumps(new))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = sd_main([
                    "--old", str(d / "o.json"),
                    "--new", str(d / "n.json"),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W70: Pilot Sign-off PDF ───────────────────────────────────────


class TestPilotSignoffPDF(unittest.TestCase):
    def test_text_to_pdf_starts_with_pdf_header(self):
        blob = text_to_pdf("hello world")
        self.assertTrue(blob.startswith(b"%PDF-1.4"))
        self.assertIn(b"%%EOF", blob)

    def test_text_to_pdf_has_xref(self):
        blob = text_to_pdf("line one\nline two\nline three")
        self.assertIn(b"xref", blob)
        self.assertIn(b"trailer", blob)
        self.assertIn(b"startxref", blob)

    def test_multi_page_split(self):
        # Force multi-page: 120 lines → 3 pages with MAX_LINES_PER_PAGE=56
        text = "\n".join(f"line {i:03d}" for i in range(120))
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            out = d / "multi.pdf"
            report = emit_pdf(text, out)
            self.assertEqual(report.n_pages, 3)
            self.assertGreater(report.size_bytes, 0)
            # Sanity: file starts with PDF magic
            self.assertTrue(out.read_bytes().startswith(b"%PDF-1.4"))

    def test_escape_handles_special_chars(self):
        # Should not crash on parentheses, backslashes, or non-ASCII
        blob = text_to_pdf("a (b) c\\d e ✅ f")
        self.assertTrue(blob.startswith(b"%PDF-1.4"))
        # Escape should produce `\(` and `\)` inside the stream
        # (after FlateDecode compression we can't easily inspect; just
        # confirm the file decodes without error by re-finding markers)
        self.assertIn(b"%%EOF", blob)

    def test_deflate_vs_no_deflate_size_difference(self):
        text = "monotone line\n" * 100
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            r1 = emit_pdf(text, d / "deflated.pdf", deflate=True)
            r2 = emit_pdf(text, d / "raw.pdf", deflate=False)
            # Raw should be larger than deflated for repeating content
            self.assertGreater(r2.size_bytes, r1.size_bytes)

    def test_sha256_recorded(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            out = d / "x.pdf"
            r = emit_pdf("abc", out)
            import hashlib
            actual = hashlib.sha256(out.read_bytes()).hexdigest()
            self.assertEqual(r.sha256, actual)

    def test_cli_with_real_pilot(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            run_onboarding(
                vendor_id="pdf_e2e",
                display_name="PDF E2E Pilot",
                out_dir=d,
            )
            pilot = d / "pilot_pdf_e2e"
            out_pdf = d / "signoff.pdf"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ps_pdf_main([
                    "--pilot", str(pilot),
                    "--out", str(out_pdf),
                    "--quiet",
                ])
            # No jurisdictions → exit 1 (signoff blocked) but PDF
            # must still exist
            self.assertEqual(rc, 1)
            self.assertTrue(out_pdf.exists())
            self.assertTrue(out_pdf.read_bytes().startswith(b"%PDF-1.4"))


if __name__ == "__main__":
    unittest.main()
