"""W72 — Trust Anchor Rotation tests."""
from __future__ import annotations
import tempfile
import unittest
from pathlib import Path

from tools.trust_anchor.anchor import (
    RevocationLog,
    record_revocation,
    rotate_anchor,
    verify_rotation,
)


_KEYPAIR_COUNTER = [0]


def _make_old_keypair(td: Path):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
    )
    from cryptography.hazmat.primitives import serialization
    _KEYPAIR_COUNTER[0] += 1
    n = _KEYPAIR_COUNTER[0]
    sk = Ed25519PrivateKey.generate()
    priv_pem = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    pp = td / f"priv-{n}.pem"
    op = td / f"pub-{n}.pem"
    pp.write_bytes(priv_pem)
    op.write_bytes(pub_pem)
    return pp, op


class RotateTest(unittest.TestCase):
    def test_rotate_produces_manifest_and_new_keypair(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            old_priv, old_pub = _make_old_keypair(td)
            out = td / "rotation"
            res = rotate_anchor(
                old_master_private_pem=old_priv,
                out_dir=out,
                overlap_days=14,
            )
            self.assertTrue(res.manifest_path.exists())
            self.assertTrue(res.new_master_pubkey_path.exists())
            self.assertTrue(res.new_master_private_path.exists())
            self.assertEqual(len(res.manifest.transition_signature_b64) % 4, 0)

    def test_verify_rotation_passes_for_genuine_signature(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            old_priv, old_pub = _make_old_keypair(td)
            out = td / "rot"
            res = rotate_anchor(
                old_master_private_pem=old_priv,
                out_dir=out,
            )
            rep = verify_rotation(
                manifest_path=res.manifest_path,
                old_master_public_pem=old_pub,
                new_master_public_pem=res.new_master_pubkey_path,
            )
            self.assertTrue(rep["passed"], msg=rep)

    def test_verify_rotation_fails_on_wrong_old_pubkey(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            old_priv, _ = _make_old_keypair(td)
            other_priv, other_pub = _make_old_keypair(td)  # different key
            out = td / "rot"
            res = rotate_anchor(
                old_master_private_pem=old_priv,
                out_dir=out,
            )
            rep = verify_rotation(
                manifest_path=res.manifest_path,
                old_master_public_pem=other_pub,
                new_master_public_pem=res.new_master_pubkey_path,
            )
            self.assertFalse(rep["passed"])

    def test_verify_rotation_fails_when_new_pubkey_swapped(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            old_priv, old_pub = _make_old_keypair(td)
            out = td / "rot"
            res = rotate_anchor(
                old_master_private_pem=old_priv,
                out_dir=out,
            )
            # Swap the new pubkey file with a different key's pem.
            _, fake_pub = _make_old_keypair(td)
            rep = verify_rotation(
                manifest_path=res.manifest_path,
                old_master_public_pem=old_pub,
                new_master_public_pem=fake_pub,
            )
            self.assertFalse(rep["passed"])


class RevocationTest(unittest.TestCase):
    def test_record_and_check_revocation(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            log_path = td / "log.json"
            log = record_revocation(
                log_path,
                plugin_id="demo",
                version="1.0.0",
                reason="hash mismatch",
            )
            self.assertTrue(log.is_revoked("demo", "1.0.0"))
            self.assertFalse(log.is_revoked("demo", "2.0.0"))
            # Idempotent — recording twice does not duplicate.
            log2 = record_revocation(
                log_path,
                plugin_id="demo",
                version="1.0.0",
                reason="dup",
            )
            self.assertEqual(len(log2.entries), 1)
            on_disk = RevocationLog.load(log_path)
            self.assertEqual(len(on_disk.entries), 1)

    def test_load_returns_empty_when_no_log(self):
        with tempfile.TemporaryDirectory() as td:
            log = RevocationLog.load(Path(td) / "absent.json")
            self.assertEqual(log.entries, [])


class CliTest(unittest.TestCase):
    def test_cli_rotate_then_verify(self):
        from tools.trust_anchor.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            old_priv, old_pub = _make_old_keypair(td)
            out = td / "rot"
            rc = main([
                "rotate",
                "--old-private", str(old_priv),
                "--out-dir", str(out),
            ])
            self.assertEqual(rc, 0)
            rc = main([
                "verify",
                "--manifest", str(out / "rotation_manifest.json"),
                "--old-public", str(old_pub),
                "--new-public", str(out / "new_master_public.pem"),
            ])
            self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
