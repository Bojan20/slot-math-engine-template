"""W52 — Plugin Marketplace Verifier tests."""
from __future__ import annotations
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools.plugin_bundle.bundler import build_bundle
from tools.plugin_marketplace.registry import (
    FilesystemMarketplace,
    InMemoryMarketplace,
    MarketplaceError,
)
from tools.plugin_marketplace.verifier import MarketplaceVerifier


def _build_dummy_bundle(out_dir: Path, plugin_id: str = "demo",
                        version: str = "1.0.0"):
    """Build a tiny plugin bundle from synthetic content."""
    games_dir = out_dir / "games_src"
    games_dir.mkdir(parents=True)
    (games_dir / "game.ir.json").write_text(
        json.dumps({"meta": {"id": "g1", "vendor": "vendor_a"}}, indent=2)
    )
    (games_dir / "README.md").write_text("# demo game\n")
    bundle_out = out_dir / "out"
    bundle_out.mkdir(parents=True)
    return build_bundle(
        plugin_id=plugin_id,
        name="Demo",
        version=version,
        out_dir=bundle_out,
        games_dir=games_dir,
        description="W52 round-trip target",
        author="Corti",
        license_str="MIT",
    )


class InMemoryMarketplaceTest(unittest.TestCase):
    def test_publish_lookup_download(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)
            mkt = InMemoryMarketplace()
            receipt = mkt.publish(
                bundle.zip_path,
                plugin_id="demo",
                version="1.0.0",
            )
            self.assertTrue(receipt.handle.startswith("mem://"))
            self.assertEqual(receipt.body_sha256, bundle.body_sha256)
            looked = mkt.lookup(receipt.handle)
            self.assertEqual(looked.body_sha256, receipt.body_sha256)
            dl = td / "dl.zip"
            mkt.download(receipt.handle, dl)
            self.assertTrue(dl.exists())
            self.assertEqual(
                hashlib.sha256(dl.read_bytes()).hexdigest(),
                receipt.body_sha256,
            )

    def test_lookup_missing_handle_raises(self):
        mkt = InMemoryMarketplace()
        with self.assertRaises(MarketplaceError):
            mkt.lookup("mem://nope@0.0.0")


class FilesystemMarketplaceTest(unittest.TestCase):
    def test_filesystem_publish_persists_to_disk(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)
            registry_dir = td / "registry"
            mkt = FilesystemMarketplace(root=registry_dir)
            receipt = mkt.publish(
                bundle.zip_path,
                plugin_id="demo",
                version="1.0.0",
            )
            self.assertTrue((registry_dir / "demo" / "1.0.0").exists())
            self.assertIn("demo@1.0.0", receipt.handle)
            # Reload via fresh instance — receipts.json round-trips.
            mkt2 = FilesystemMarketplace(root=registry_dir)
            self.assertIn(receipt.handle, mkt2.list_handles())


class RoundTripTest(unittest.TestCase):
    def test_in_memory_round_trip_passes(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)
            verifier = MarketplaceVerifier(registry=InMemoryMarketplace())
            report = verifier.round_trip(
                bundle.zip_path,
                plugin_id="demo",
                version="1.0.0",
                download_dir=td / "dl",
            )
            self.assertTrue(report.passed, msg=report.to_dict())
            self.assertTrue(report.body_sha_matches)
            self.assertTrue(report.manifest_passed)
            self.assertFalse(report.tamper_detected)

    def test_filesystem_round_trip_passes(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)
            mkt = FilesystemMarketplace(root=td / "registry")
            verifier = MarketplaceVerifier(registry=mkt)
            report = verifier.round_trip(
                bundle.zip_path,
                plugin_id="demo",
                version="1.0.0",
                download_dir=td / "dl",
            )
            self.assertTrue(report.passed, msg=report.to_dict())

    def test_detects_in_transit_body_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)

            class TamperRegistry(InMemoryMarketplace):
                def download(self, handle, out_path):
                    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
                    # Substitute a totally different ZIP at download time.
                    Path(out_path).write_bytes(b"PK\x03\x04tampered")
                    return out_path

            verifier = MarketplaceVerifier(registry=TamperRegistry())
            report = verifier.round_trip(
                bundle.zip_path,
                plugin_id="demo",
                version="1.0.0",
                download_dir=td / "dl",
            )
            self.assertFalse(report.passed)
            self.assertTrue(report.tamper_detected)
            self.assertEqual(report.tamper_kind, "body_sha_drift")

    def test_detects_manifest_swap_tamper(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)

            # Mutate the ZIP body so SHA-256 matches what we publish,
            # but the manifest references files with stale hashes.
            tampered_zip = td / "tampered.zip"
            with zipfile.ZipFile(bundle.zip_path, "r") as src, \
                 zipfile.ZipFile(tampered_zip, "w") as dst:
                for item in src.namelist():
                    data = src.read(item)
                    if item.endswith(".ir.json"):
                        data = b"{\"meta\":{\"id\":\"swapped\"}}"
                    dst.writestr(item, data)
            tampered_sha = hashlib.sha256(tampered_zip.read_bytes()).hexdigest()

            class StaleShaRegistry(InMemoryMarketplace):
                def __init__(self, served_path, served_sha):
                    super().__init__()
                    self._served_path = served_path
                    self._served_sha = served_sha

                def publish(self, zip_path, *, plugin_id, version,
                            signature_b64=None):
                    # Honest publish of the served (tampered) zip.
                    receipt = super().publish(
                        self._served_path,
                        plugin_id=plugin_id,
                        version=version,
                        signature_b64=signature_b64,
                    )
                    # Trust receipt as-is — body sha matches served zip
                    return receipt

            mkt = StaleShaRegistry(tampered_zip, tampered_sha)
            verifier = MarketplaceVerifier(registry=mkt)
            report = verifier.round_trip(
                bundle.zip_path,    # original; ignored by registry
                plugin_id="demo",
                version="1.0.0",
                download_dir=td / "dl",
            )
            # The body SHA WILL match (served = downloaded), but the
            # manifest will fail because game.ir.json's sha256 in the
            # tampered ZIP doesn't match the recorded manifest sha.
            self.assertFalse(report.passed)
            self.assertTrue(report.tamper_detected)
            self.assertEqual(report.tamper_kind, "manifest_mismatch")
            self.assertTrue(report.manifest_mismatches)

    def test_verify_existing_after_publish(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)
            mkt = InMemoryMarketplace()
            verifier = MarketplaceVerifier(registry=mkt)
            rt = verifier.round_trip(
                bundle.zip_path,
                plugin_id="demo",
                version="1.0.0",
                download_dir=td / "dl",
            )
            # Now run verify_existing using the handle from round_trip
            again = verifier.verify_existing(
                rt.publish_handle, download_dir=td / "dl2"
            )
            self.assertTrue(again.passed)


class CliTest(unittest.TestCase):
    def test_cli_smoke(self):
        from tools.plugin_marketplace.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            bundle = _build_dummy_bundle(td)
            rc = main(
                [
                    str(bundle.zip_path),
                    "--plugin-id",
                    "demo",
                    "--version",
                    "1.0.0",
                    "--registry-dir",
                    str(td / "registry"),
                    "--download-dir",
                    str(td / "dl"),
                    "--json",
                ]
            )
            self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
