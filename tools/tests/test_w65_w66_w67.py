"""W65 + W66 + W67 combined tests."""
from __future__ import annotations
import io
import json
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

# W65
from tools.plugin_sign import (
    generate_keypair,
    sign_zip,
    verify_zip,
)
from tools.plugin_sign.__main__ import main as ps_main

# W66
from tools.rtp_monitor.monitor import MonitorState
from tools.drift_alert_hub.hub import (
    AlertHub,
    DEFAULT_RULES,
)
from tools.drift_replay.theatre import (
    replay,
    replay_file,
)
from tools.drift_replay.__main__ import main as dr_main

# W67
from tools.cert_sbom.emitter import (
    build_sbom,
    extract_entry_points,
)
from tools.cert_sbom.__main__ import main as sbom_main


# Cryptography availability — skip W65 tests cleanly when missing.
try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: F401
        Ed25519PrivateKey,
    )
    HAVE_CRYPTO = True
except ImportError:
    HAVE_CRYPTO = False


def _seed_zip(path: Path, payload: bytes = b"hello plugin") -> None:
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("manifest.json", '{"name": "p"}')
        zf.writestr("README.md", payload.decode("utf-8", errors="replace"))


def _spin_event(bet: float, pay: float, ts: float = 1_700_000_000.0) -> dict:
    return {
        "event_type": "slot.spin_completed",
        "ts": ts,
        "payload": {"bet": bet, "pay": pay},
    }


# ─── W65: Plugin Signing ───────────────────────────────────────────


@unittest.skipUnless(HAVE_CRYPTO, "cryptography not installed")
class TestPluginSign(unittest.TestCase):
    def test_keygen_writes_pair(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            priv, pub = generate_keypair(d / "keys")
            self.assertTrue(priv.exists() and pub.exists())
            self.assertIn(b"PRIVATE KEY", priv.read_bytes())
            self.assertIn(b"PUBLIC KEY", pub.read_bytes())

    def test_sign_and_verify_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            priv, pub = generate_keypair(d / "keys")
            z = d / "p.zip"
            _seed_zip(z)
            r = sign_zip(z, private_pem_path=priv)
            self.assertEqual(len(r.body_sha256), 64)
            self.assertTrue(Path(r.sig_path).exists())
            self.assertTrue(Path(r.sig_b64_path).exists())
            v = verify_zip(z, public_pem_path=pub)
            self.assertTrue(v.passed)

    def test_verify_detects_tampered_body(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            priv, pub = generate_keypair(d / "keys")
            z = d / "p.zip"
            _seed_zip(z, payload=b"original")
            sign_zip(z, private_pem_path=priv)
            # Tamper body
            _seed_zip(z, payload=b"tampered")
            v = verify_zip(z, public_pem_path=pub)
            self.assertFalse(v.passed)

    def test_verify_missing_sig_sidecar(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            _, pub = generate_keypair(d / "keys")
            z = d / "no-sig.zip"
            _seed_zip(z)
            v = verify_zip(z, public_pem_path=pub)
            self.assertFalse(v.passed)
            self.assertIn("not found", v.error)

    def test_verify_wrong_pubkey(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            priv1, _ = generate_keypair(d / "k1")
            _, pub2 = generate_keypair(d / "k2")
            z = d / "p.zip"
            _seed_zip(z)
            sign_zip(z, private_pem_path=priv1)
            v = verify_zip(z, public_pem_path=pub2)
            self.assertFalse(v.passed)

    def test_cli_keygen_sign_verify(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc1 = ps_main(["keygen", "--out", str(d / "keys"), "--quiet"])
            self.assertEqual(rc1, 0)
            z = d / "p.zip"
            _seed_zip(z)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc2 = ps_main([
                    "sign", str(z),
                    "--key", str(d / "keys" / "private.pem"),
                    "--quiet",
                ])
            self.assertEqual(rc2, 0)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc3 = ps_main([
                    "verify", str(z),
                    "--key", str(d / "keys" / "public.pem"),
                    "--quiet",
                ])
            self.assertEqual(rc3, 0)


# ─── W66: Drift Replay Theatre ─────────────────────────────────────


class TestDriftReplay(unittest.TestCase):
    def test_replay_no_throttle(self):
        state = MonitorState(target_rtp=0.95)
        hub = AlertHub(rules=list(DEFAULT_RULES))
        events = [_spin_event(1.0, 0.0, ts=1.0 + i) for i in range(120)]
        report = replay(events, state=state, hub=hub, speedup=0.0,
                        sleep_fn=lambda s: None)
        self.assertEqual(len(report.ticks), 120)
        self.assertEqual(report.bridge_report.spins_consumed, 120)
        # All-losing stream → critical alerts emit
        self.assertGreater(len(report.bridge_report.alerts_dispatched), 0)

    def test_replay_throttle_sleeps_proportional_to_delta(self):
        sleeps: list[float] = []
        state = MonitorState(target_rtp=0.95)
        hub = AlertHub(rules=[])
        events = [
            _spin_event(1.0, 0.95, ts=1.0),
            _spin_event(1.0, 0.95, ts=11.0),   # +10s event delta
            _spin_event(1.0, 0.95, ts=11.5),   # +0.5s event delta
        ]
        # speedup 10 → 10s event delta = 1s wall, 0.5s = 0.05s
        replay(
            events, state=state, hub=hub, speedup=10.0,
            sleep_fn=lambda s: sleeps.append(s),
        )
        # First tick has no prev_ts → 0s sleep
        # Second tick: 10s/10 = 1s
        # Third tick: 0.5s/10 = 0.05s
        self.assertEqual(len(sleeps), 2)
        self.assertAlmostEqual(sleeps[0], 1.0, places=6)
        self.assertAlmostEqual(sleeps[1], 0.05, places=6)

    def test_replay_tick_log_emitted_per_tick(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            tick_log = d / "ticks.ndjson"
            state = MonitorState(target_rtp=0.95)
            hub = AlertHub(rules=[])
            events = [_spin_event(1.0, 0.95, ts=1.0 + i) for i in range(5)]
            replay(events, state=state, hub=hub, speedup=0.0,
                   sleep_fn=lambda s: None, tick_log_path=tick_log)
            lines = [l for l in tick_log.read_text().splitlines() if l.strip()]
            self.assertEqual(len(lines), 5)
            for l in lines:
                d_ = json.loads(l)
                self.assertIn("sequence", d_)

    def test_replay_file_handles_malformed_lines(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "feed.ndjson"
            with p.open("w") as f:
                f.write(json.dumps(_spin_event(1.0, 0.95)) + "\n")
                f.write("not-json\n")
                f.write(json.dumps(_spin_event(1.0, 0.95)) + "\n")
            state = MonitorState(target_rtp=0.95)
            hub = AlertHub(rules=[])
            r = replay_file(p, state=state, hub=hub, speedup=0.0,
                            sleep_fn=lambda s: None)
            self.assertEqual(r.bridge_report.spins_consumed, 2)
            self.assertEqual(r.bridge_report.decode_errors, 1)

    def test_replay_file_missing_path_returns_empty(self):
        state = MonitorState(target_rtp=0.95)
        hub = AlertHub(rules=[])
        r = replay_file(Path("/no/such/path.ndjson"),
                        state=state, hub=hub, speedup=0.0,
                        sleep_fn=lambda s: None)
        self.assertEqual(r.bridge_report.events_received, 0)

    def test_cli_smoke(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "feed.ndjson"
            with p.open("w") as f:
                for i in range(10):
                    f.write(json.dumps(_spin_event(1.0, 0.95, ts=1.0 + i)) + "\n")
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = dr_main([
                    "--feed", str(p),
                    "--speedup", "0",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W67: Cert Bundle SBOM ─────────────────────────────────────────


class TestCertSBOM(unittest.TestCase):
    def test_extract_entry_points_from_pyproject(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "pyproject.toml").write_text(
                '[project]\nname = "x"\nversion = "1.0.0"\n\n'
                '[project.scripts]\n'
                'slot-foo = "tools.foo.__main__:main"\n'
                'slot-bar = "tools.bar.__main__:main"\n'
                '\n[project.urls]\nHome = "x"\n'
            )
            eps = extract_entry_points(d / "pyproject.toml")
            self.assertEqual(eps["slot-foo"], "tools.foo.__main__:main")
            self.assertEqual(eps["slot-bar"], "tools.bar.__main__:main")
            self.assertNotIn("Home", eps)

    def test_extract_entry_points_missing_file(self):
        eps = extract_entry_points(Path("/no/such/pyproject.toml"))
        self.assertEqual(eps, {})

    def test_build_sbom_against_real_repo(self):
        # Use the actual repo root — sanity-checks that the walker
        # picks up real tools.* modules and the entry-point parser
        # finds the >60 declared scripts.
        report = build_sbom(repo_root=ROOT, bump_serial=False)
        self.assertGreater(report.n_components, 80)
        self.assertGreater(len(report.entry_points), 50)
        self.assertEqual(report.project_name, "slot-math-engine-template")
        self.assertTrue(report.serial_number.startswith("urn:uuid:"))

    def test_sbom_cyclonedx_envelope_shape(self):
        report = build_sbom(repo_root=ROOT, bump_serial=False)
        doc = report.to_cyclonedx()
        self.assertEqual(doc["bomFormat"], "CycloneDX")
        self.assertEqual(doc["specVersion"], "1.4")
        self.assertIn("metadata", doc)
        self.assertIn("components", doc)
        # First component shape check
        c = doc["components"][0]
        self.assertEqual(c["type"], "library")
        self.assertTrue(c["purl"].startswith("pkg:python/"))
        self.assertEqual(c["hashes"][0]["alg"], "SHA-256")
        self.assertEqual(len(c["hashes"][0]["content"]), 64)

    def test_sbom_deterministic_serial(self):
        r1 = build_sbom(repo_root=ROOT, bump_serial=False)
        r2 = build_sbom(repo_root=ROOT, bump_serial=False)
        self.assertEqual(r1.serial_number, r2.serial_number)
        # Same component count (file system hasn't changed mid-test)
        self.assertEqual(r1.n_components, r2.n_components)

    def test_sbom_random_serial_changes(self):
        r1 = build_sbom(repo_root=ROOT, bump_serial=True)
        r2 = build_sbom(repo_root=ROOT, bump_serial=True)
        self.assertNotEqual(r1.serial_number, r2.serial_number)

    def test_cli_emits_json(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            out = d / "sbom.cdx.json"
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = sbom_main([
                    "--repo-root", str(ROOT),
                    "--out", str(out),
                    "--deterministic-serial",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)
            self.assertTrue(out.exists())
            doc = json.loads(out.read_text())
            self.assertEqual(doc["bomFormat"], "CycloneDX")
            self.assertIn("components", doc)


if __name__ == "__main__":
    unittest.main()
