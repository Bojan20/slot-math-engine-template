"""W5.6 — cert package builder regression tests.

Four guarantees:

  1. **Bundle completeness** — emitted ZIP contains all required entries
     (manifest, signatures, IRs, audit, verify.sh, README).
  2. **Signature verifies** — ed25519 signature over manifest.json
     validates against the embedded public key.
  3. **SHA-256 commitments match** — every IR file's SHA-256 in
     manifest.ir_commitments matches the actual file content.
  4. **CLI integration** — `slot-build --cert-package DIR` emits a
     valid bundle as part of the standard build pipeline.

Run:
    python -m unittest tools.tests.test_w5_6_cert_package
"""
from __future__ import annotations
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.hazmat.primitives import serialization
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False


from tools.slot_build.cert_package import (
    build_cert_package,
    compute_par_commitments,
    build_manifest,
    _sha256_file,
)


@unittest.skipUnless(_HAS_CRYPTO, "cryptography library required")
class TestCertPackageBuilder(unittest.TestCase):
    """End-to-end: build cert ZIP from L&W IR + verify integrity."""

    @classmethod
    def setUpClass(cls):
        cls.universal_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        cls.vendor_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.ir.json"
        if not cls.universal_ir.exists():
            raise unittest.SkipTest(f"missing test IR: {cls.universal_ir}")

    def _build(self, out_dir: Path):
        return build_cert_package(
            out_dir=out_dir,
            game_id="test-game",
            swid="200-1637-001",
            vendor="lw",
            universal_ir_path=self.universal_ir,
            vendor_ir_path=self.vendor_ir,
        )

    def test_bundle_has_required_entries(self):
        with tempfile.TemporaryDirectory() as td:
            zip_path = self._build(Path(td))
            self.assertTrue(zip_path.exists())
            with zipfile.ZipFile(zip_path, "r") as zf:
                names = zf.namelist()
            required = [
                "manifest.json",
                "signatures/manifest.sig",
                "signatures/hsm_pubkey.pem",
                "ir/universal.ir.json",
                "ir/vendor.ir.json",
                "audit/par_commitments.json",
                "audit/build_metadata.json",
                "verify.sh",
                "README.md",
            ]
            for entry in required:
                self.assertIn(entry, names, f"missing bundle entry: {entry}")

    def test_signature_verifies(self):
        with tempfile.TemporaryDirectory() as td:
            zip_path = self._build(Path(td))
            with zipfile.ZipFile(zip_path, "r") as zf:
                manifest_bytes = zf.read("manifest.json")
                sig = zf.read("signatures/manifest.sig")
                pub_pem = zf.read("signatures/hsm_pubkey.pem")
            pub = serialization.load_pem_public_key(pub_pem)
            self.assertIsInstance(pub, Ed25519PublicKey)
            # Should not raise
            pub.verify(sig, manifest_bytes)

    def test_signature_fails_on_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            zip_path = self._build(Path(td))
            with zipfile.ZipFile(zip_path, "r") as zf:
                manifest_bytes = zf.read("manifest.json")
                sig = zf.read("signatures/manifest.sig")
                pub_pem = zf.read("signatures/hsm_pubkey.pem")
            pub = serialization.load_pem_public_key(pub_pem)
            # Tamper with the manifest — flip a byte
            tampered = bytearray(manifest_bytes)
            tampered[100] ^= 0xFF
            with self.assertRaises(Exception):
                pub.verify(sig, bytes(tampered))

    def test_ir_commitments_match(self):
        with tempfile.TemporaryDirectory() as td:
            zip_path = self._build(Path(td))
            with zipfile.ZipFile(zip_path, "r") as zf:
                manifest = json.loads(zf.read("manifest.json"))
                universal_data = zf.read("ir/universal.ir.json")
                vendor_data = zf.read("ir/vendor.ir.json")
            universal_sha = hashlib.sha256(universal_data).hexdigest()
            vendor_sha = hashlib.sha256(vendor_data).hexdigest()
            self.assertEqual(manifest["ir_commitments"]["universal_sha256"], universal_sha)
            self.assertEqual(manifest["ir_commitments"]["vendor_sha256"], vendor_sha)

    def test_manifest_carries_game_metadata(self):
        with tempfile.TemporaryDirectory() as td:
            zip_path = self._build(Path(td))
            with zipfile.ZipFile(zip_path, "r") as zf:
                manifest = json.loads(zf.read("manifest.json"))
            self.assertEqual(manifest["game"]["swid"], "200-1637-001")
            self.assertEqual(manifest["game"]["vendor"], "lw")
            self.assertIn("rtp_target", manifest["math"])
            self.assertIn("rtp_breakdown", manifest["math"])
            self.assertIn("git_commit", manifest["build"])

    def test_par_commitments_when_raw_dir_provided(self):
        raw_dir = ROOT / "games/ce-copy-test/raw"
        if not raw_dir.exists():
            self.skipTest(f"raw dir missing (W-SANITIZE local-only): {raw_dir}")
        with tempfile.TemporaryDirectory() as td:
            zip_path = build_cert_package(
                out_dir=Path(td),
                game_id="test-game",
                swid="200-1637-001",
                vendor="lw",
                universal_ir_path=self.universal_ir,
                vendor_ir_path=self.vendor_ir,
                raw_dir=raw_dir,
            )
            with zipfile.ZipFile(zip_path, "r") as zf:
                par = json.loads(zf.read("audit/par_commitments.json"))
            self.assertGreater(len(par), 0, "PAR commitments should not be empty")
            # Every value should be a 64-char hex SHA-256
            for fname, sha in par.items():
                self.assertEqual(len(sha), 64, f"bad SHA len for {fname}")
                int(sha, 16)  # validates hex


@unittest.skipUnless(_HAS_CRYPTO, "cryptography library required")
class TestVerifyScript(unittest.TestCase):
    """Re-run the embedded verify.sh and ensure exit 0 on intact bundle."""

    def test_verify_passes_on_intact_bundle(self):
        universal_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        if not universal_ir.exists():
            self.skipTest("missing test IR")
        with tempfile.TemporaryDirectory() as td:
            zip_path = build_cert_package(
                out_dir=Path(td),
                game_id="test-game",
                swid="200-1637-001",
                vendor="lw",
                universal_ir_path=universal_ir,
            )
            unpack = Path(td) / "unpack"
            unpack.mkdir()
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(unpack)
            proc = subprocess.run(
                ["bash", "verify.sh"],
                capture_output=True, text=True, cwd=str(unpack), timeout=30,
            )
            self.assertEqual(proc.returncode, 0, f"verify.sh failed: {proc.stdout}\n{proc.stderr}")
            self.assertIn("cert bundle integrity verified", proc.stdout)

    def test_verify_fails_on_tampered_ir(self):
        universal_ir = ROOT / "games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json"
        if not universal_ir.exists():
            self.skipTest("missing test IR")
        with tempfile.TemporaryDirectory() as td:
            zip_path = build_cert_package(
                out_dir=Path(td),
                game_id="test-game",
                swid="200-1637-001",
                vendor="lw",
                universal_ir_path=universal_ir,
            )
            unpack = Path(td) / "unpack"
            unpack.mkdir()
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(unpack)
            # Tamper with universal IR
            ir_path = unpack / "ir/universal.ir.json"
            data = ir_path.read_text()
            ir_path.write_text(data.replace('"name":', '"name_tampered":', 1))
            proc = subprocess.run(
                ["bash", "verify.sh"],
                capture_output=True, text=True, cwd=str(unpack), timeout=30,
            )
            self.assertEqual(proc.returncode, 1, "tampered bundle should fail verify")


@unittest.skipUnless(_HAS_CRYPTO, "cryptography library required")
class TestCliIntegration(unittest.TestCase):
    """`slot-build --cert-package DIR` produces a valid bundle."""

    def test_slot_build_cert_package_e2e(self):
        raw_dir = ROOT / "games/ce-copy-test/raw"
        if not raw_dir.exists():
            self.skipTest("raw dir missing")
        with tempfile.TemporaryDirectory() as td:
            cert_out = Path(td) / "cert"
            proc = subprocess.run(
                [sys.executable, "-m", "tools.slot_build",
                 str(raw_dir),
                 "--sheet", "PAR-001",
                 "--no-mc",
                 "--cert-package", str(cert_out),
                 "--quiet"],
                capture_output=True, text=True, cwd=str(ROOT), timeout=60,
            )
            self.assertEqual(proc.returncode, 0, f"slot-build failed: {proc.stderr}")
            zips = list(cert_out.glob("*.cert.zip"))
            self.assertEqual(len(zips), 1, f"expected 1 zip, got {zips}")
            # Verify integrity
            unpack = Path(td) / "unpack"
            unpack.mkdir()
            with zipfile.ZipFile(zips[0], "r") as zf:
                zf.extractall(unpack)
            verify = subprocess.run(
                ["bash", "verify.sh"],
                capture_output=True, text=True, cwd=str(unpack), timeout=30,
            )
            self.assertEqual(verify.returncode, 0, f"verify.sh failed: {verify.stdout}")


if __name__ == "__main__":
    unittest.main()
