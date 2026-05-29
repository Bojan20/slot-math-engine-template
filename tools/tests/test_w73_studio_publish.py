"""W73 — Studio → Marketplace pipeline tests."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path

from tools.studio_publish.pipeline import publish_studio


def _make_studio(td: Path) -> Path:
    games = td / "games"
    games.mkdir()
    (games / "g1.ir.json").write_text(json.dumps({
        "meta": {"id": "g1", "vendor": "v", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3},
        "evaluation": {"paylines": list(range(20))},
        "limits": {},
        "features": [],
        "reels": {"base": []},
        "paytable": [],
    }))
    return games


def _gen_keypair(td: Path):
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
    )
    from cryptography.hazmat.primitives import serialization
    sk = Ed25519PrivateKey.generate()
    priv = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub = sk.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    pp = td / "priv.pem"
    op = td / "pub.pem"
    pp.write_bytes(priv)
    op.write_bytes(pub)
    return pp, op


class PublishTest(unittest.TestCase):
    def test_publish_without_signing(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            games = _make_studio(td)
            rep = publish_studio(
                games,
                out_dir=td / "out",
                plugin_id="demo",
                version="1.0.0",
                description="W73 smoke",
            )
            self.assertTrue(rep.passed, msg=rep.to_dict())
            steps = {s.name: s for s in rep.steps}
            self.assertEqual(steps["bundle"].status, "pass")
            self.assertEqual(steps["sign"].status, "skip")
            self.assertEqual(steps["marketplace"].status, "pass")

    def test_publish_with_signing(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            games = _make_studio(td)
            priv, pub = _gen_keypair(td)
            rep = publish_studio(
                games,
                out_dir=td / "out",
                plugin_id="demo",
                version="1.0.1",
                private_pem=priv,
                public_pem=pub,
            )
            self.assertTrue(rep.passed, msg=rep.to_dict())
            steps = {s.name: s for s in rep.steps}
            self.assertEqual(steps["sign"].status, "pass")
            self.assertTrue(rep.sig_path)
            self.assertTrue(Path(rep.sig_path).exists())

    def test_publish_emits_publish_report_json(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            games = _make_studio(td)
            publish_studio(
                games,
                out_dir=td / "out",
                plugin_id="demo",
                version="1.0.2",
            )
            report_path = td / "out" / "publish-report.json"
            self.assertTrue(report_path.exists())
            data = json.loads(report_path.read_text())
            self.assertEqual(data["plugin_id"], "demo")
            self.assertEqual(data["version"], "1.0.2")
            self.assertIn("steps", data)


class CliTest(unittest.TestCase):
    def test_cli_smoke(self):
        from tools.studio_publish.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            games = _make_studio(td)
            rc = main([
                str(games),
                "--out", str(td / "out"),
                "--plugin-id", "cli-demo",
                "--version", "1.0.0",
                "--json",
            ])
            self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
