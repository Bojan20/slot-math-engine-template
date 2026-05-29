"""W6.9 (sign/verify CLI) + W6.10 (ed25519 path) + W6.11 (acceptance runner)."""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, compile_to_ir,
    sign_ir, verify_ir, sign_and_inject_provenance,
    run_acceptance,
)
from tools.math_dsl.provenance import (
    _ed25519_available, _ed25519_active,
)


# ─── W6.10 — ed25519 path detection ─────────────────────────────────


class TestEd25519Detection(unittest.TestCase):
    def test_ed25519_available_flag(self):
        # Just assert the function returns a boolean (cryptography
        # availability depends on the env; both outcomes are valid)
        self.assertIsInstance(_ed25519_available(), bool)

    def test_ed25519_active_false_without_env(self):
        # Without env key set, active must be False even if cryptography
        # is installed.
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(_ed25519_active())

    def test_hmac_default_when_no_env(self):
        with patch.dict(os.environ, {}, clear=True):
            spec = parse_spec((ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml").read_text())
            ir = compile_to_ir(spec)
            sig = sign_ir(ir, algo="auto")
            self.assertTrue(verify_ir(ir, sig, algo="auto"))

    def test_force_hmac_works(self):
        spec = parse_spec((ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml").read_text())
        ir = compile_to_ir(spec)
        sig = sign_ir(ir, algo="hmac")
        self.assertTrue(verify_ir(ir, sig, algo="hmac"))

    def test_provenance_records_signature_algo(self):
        spec = parse_spec((ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml").read_text())
        ir = compile_to_ir(spec)
        signed = sign_and_inject_provenance(
            ir, vendor="x", par_source="x.tsv", algo="hmac",
        )
        self.assertIn("signature_algo", signed["provenance"])
        self.assertEqual(signed["provenance"]["signature_algo"], "hmac")

    @unittest.skipUnless(_ed25519_available(), "cryptography not installed")
    def test_ed25519_sign_verify_round_trip(self):
        from cryptography.hazmat.primitives.asymmetric import ed25519
        from cryptography.hazmat.primitives import serialization
        # Generate a key pair in-memory
        priv = ed25519.Ed25519PrivateKey.generate()
        priv_pem = priv.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")
        with patch.dict(os.environ, {"CORTEX_PROVENANCE_ED25519_PRIVATE_KEY": priv_pem}):
            spec = parse_spec((ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml").read_text())
            ir = compile_to_ir(spec)
            sig = sign_ir(ir, algo="ed25519")
            self.assertEqual(len(sig), 128)  # 64 bytes hex
            self.assertTrue(verify_ir(ir, sig, algo="ed25519"))


# ─── W6.11 — Acceptance suite runner ────────────────────────────────


class TestAcceptanceRunner(unittest.TestCase):
    def test_acceptance_classic_only(self):
        """Test against a tempdir with just one spec."""
        import tempfile
        import shutil
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            src = ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
            shutil.copy(src, d)
            report = run_acceptance(d, mode="c-1")
        self.assertEqual(len(report.entries), 1)
        e = report.entries[0]
        self.assertEqual(e.name, "Crimson Tiger")
        self.assertGreater(e.synth_ms, 0)

    def test_acceptance_aggregates_passes(self):
        report = run_acceptance(ROOT / "tools" / "math_dsl" / "specs", mode="c-1")
        self.assertEqual(report.pass_count + report.fail_count, len(report.entries))
        # All 4 sample specs should pass under C-1 (RTP-only constraint)
        self.assertEqual(report.fail_count, 0)
        self.assertEqual(report.pass_count, 4)
        self.assertTrue(report.ok)

    def test_acceptance_summary_markdown(self):
        report = run_acceptance(ROOT / "tools" / "math_dsl" / "specs", mode="c-1")
        text = report.summary()
        self.assertIn("Acceptance suite", text)
        self.assertIn("PASS", text)
        self.assertIn("Crimson Tiger", text)

    def test_acceptance_rtp_within_tolerance(self):
        report = run_acceptance(ROOT / "tools" / "math_dsl" / "specs", mode="c-1")
        for e in report.entries:
            if not e.ok:
                continue
            # spec.rtp_tolerance + extra 0.005 default
            self.assertLess(e.rtp_delta, 0.05,
                            f"{e.name} delta {e.rtp_delta} too large")

    def test_acceptance_empty_dir(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            report = run_acceptance(td)
        self.assertEqual(len(report.entries), 0)
        self.assertFalse(report.ok)
        self.assertIn("no specs", report.summary().lower())


# ─── W6.9 — CLI integration smoke ───────────────────────────────────


class TestCliSignVerify(unittest.TestCase):
    def test_sign_then_verify_cli_roundtrip(self):
        import tempfile
        import subprocess
        spec_path = ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
        with tempfile.TemporaryDirectory() as td:
            ir_json = Path(td) / "x.ir.json"
            # 1) compile
            r1 = subprocess.run(
                [sys.executable, "-m", "tools.math_dsl", "compile", str(spec_path)],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(r1.returncode, 0)
            ir_json.write_text(r1.stdout)
            # 2) sign in-place
            r2 = subprocess.run(
                [sys.executable, "-m", "tools.math_dsl", "sign",
                 str(ir_json), "--vendor", "tst", "--swid", "x"],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(r2.returncode, 0)
            # 3) verify must succeed
            r3 = subprocess.run(
                [sys.executable, "-m", "tools.math_dsl", "verify", str(ir_json)],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(r3.returncode, 0)
            self.assertIn("OK", r3.stdout)


if __name__ == "__main__":
    unittest.main()
