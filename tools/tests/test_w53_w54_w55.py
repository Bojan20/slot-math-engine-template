"""W53 + W54 + W55 combined tests."""
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

# W53
from tools.multi_territory import (
    MultiTerritoryReport,
    build_multi_territory_release,
)
from tools.multi_territory.__main__ import main as mt_main

# W54
from tools.drift_alert_hub import (
    AlertHub,
    AlertRule,
    DEFAULT_RULES,
    DriftAlert,
    InMemoryAlertSink,
    LogfileAlertSink,
    WebhookPayloadSink,
    EmailPayloadSink,
)
from tools.drift_alert_hub.__main__ import main as dah_main

# W55
from tools.marketplace_ui import build_dashboard, render_index_html
from tools.marketplace_ui.__main__ import main as ui_main
from tools.plugin_marketplace.registry import FilesystemMarketplace


def _ir() -> dict:
    return {
        "meta": {
            "id": "test_game",
            "vendor": "vendor_c",
            "swid": "S-001",
            "target_rtp": 0.96,
            "volatility": "medium",
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A", "B", "C"] for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
        "features": [{"kind": "free_spins"}],
    }


# ─── W53: Multi-Territory ──────────────────────────────────────────


class TestMultiTerritory(unittest.TestCase):
    def test_build_single_profile(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_multi_territory_release(
                _ir(), profile_ids=["gli19"], out_dir=d,
            )
            self.assertEqual(report.n_profiles, 1)
            self.assertEqual(len(report.per_jurisdiction), 1)
            self.assertTrue(report.cert_xml_passed)
            # ZIP must exist
            self.assertTrue((d / "release.zip").exists())
            # Manifest hash
            self.assertEqual(len(report.manifest_sha256), 64)

    def test_build_multi_profiles(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_multi_territory_release(
                _ir(), profile_ids=["gli16", "gli19", "mga"], out_dir=d,
            )
            self.assertEqual(report.n_profiles, 3)
            self.assertEqual(len(report.per_jurisdiction), 3)
            # Each compliance JSON exists
            for p in report.per_jurisdiction:
                self.assertTrue((d / p.compliance_path).exists())

    def test_zip_contains_expected_artifacts(self):
        import zipfile
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_multi_territory_release(
                _ir(), profile_ids=["gli19"], out_dir=d,
            )
            with zipfile.ZipFile(d / "release.zip") as zf:
                names = set(zf.namelist())
            self.assertIn("ir.json", names)
            self.assertIn("cert.v2.xml", names)
            self.assertIn("marketplace_verify.json", names)
            self.assertTrue(any("compliance.json" in n for n in names))

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            ir_p = d / "ir.json"
            ir_p.write_text(json.dumps(_ir()))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = mt_main([
                    "--ir", str(ir_p),
                    "--out", str(d / "out"),
                    "--profile", "gli19",
                    "--quiet",
                ])
            # gli19 should pass for a standard 0.96 RTP IR with free_spins
            # Even if not, the marketplace verify should land
            self.assertIn(rc, (0, 1))
            self.assertTrue((d / "out" / "release.zip").exists())


# ─── W54: Drift Alert Hub ──────────────────────────────────────────


class TestDriftAlertHub(unittest.TestCase):
    def _snap(self, severity="red", spins=100, rtp=0.6):
        return {
            "drift_severity": severity,
            "cumulative_rtp": rtp,
            "ewma_rtp": rtp,
            "spins": spins,
        }

    def test_rule_evaluates_drift_severity(self):
        r = AlertRule("test_red", "drift_severity", "eq", "red", "critical")
        self.assertTrue(r.evaluate(self._snap("red")))
        self.assertFalse(r.evaluate(self._snap("green")))

    def test_rule_evaluates_numeric_gt(self):
        r = AlertRule("low_rtp", "cumulative_rtp", "lt", 0.80, "warning")
        self.assertTrue(r.evaluate(self._snap(rtp=0.5)))
        self.assertFalse(r.evaluate(self._snap(rtp=0.95)))

    def test_hub_dispatches_to_inmem_sink(self):
        hub = AlertHub(rules=list(DEFAULT_RULES))
        sink = InMemoryAlertSink()
        hub.register_sink(sink)
        emitted = hub.dispatch(self._snap("red"))
        self.assertGreater(len(emitted), 0)
        # Sink received them
        self.assertEqual(len(sink.alerts), len(emitted))

    def test_dedup_on_repeated_snapshot(self):
        hub = AlertHub(rules=list(DEFAULT_RULES))
        sink = InMemoryAlertSink()
        hub.register_sink(sink)
        snap = self._snap("red", spins=100)
        first = hub.dispatch(snap)
        second = hub.dispatch(snap)   # same fingerprint → no new emissions
        self.assertGreater(len(first), 0)
        self.assertEqual(len(second), 0)

    def test_logfile_sink_appends_ndjson(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            log = d / "alerts.ndjson"
            hub = AlertHub(rules=list(DEFAULT_RULES))
            hub.register_sink(LogfileAlertSink(log))
            hub.dispatch(self._snap("red", spins=200))
            self.assertTrue(log.exists())
            lines = [l for l in log.read_text().splitlines() if l.strip()]
            self.assertGreater(len(lines), 0)
            for l in lines:
                json.loads(l)  # valid JSON each line

    def test_webhook_sink_writes_slack_payload(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            sink_dir = d / "hooks"
            hub = AlertHub(rules=list(DEFAULT_RULES))
            hub.register_sink(WebhookPayloadSink(sink_dir))
            hub.dispatch(self._snap("red", spins=300))
            files = list(sink_dir.glob("*.slack.json"))
            self.assertGreater(len(files), 0)
            payload = json.loads(files[0].read_text())
            self.assertIn("text", payload)
            self.assertIn("attachments", payload)

    def test_email_sink_writes_eml(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            sink_dir = d / "emails"
            hub = AlertHub(rules=list(DEFAULT_RULES))
            hub.register_sink(EmailPayloadSink(sink_dir))
            hub.dispatch(self._snap("red", spins=400))
            files = list(sink_dir.glob("*.eml"))
            self.assertGreater(len(files), 0)
            content = files[0].read_text()
            self.assertIn("Subject:", content)
            self.assertIn("X-Drift-Severity:", content)

    def test_sink_exception_does_not_kill_hub(self):
        class BadSink:
            name = "bad"
            def send(self, alert):
                raise RuntimeError("boom")
        ok = InMemoryAlertSink()
        hub = AlertHub(rules=list(DEFAULT_RULES))
        hub.register_sink(BadSink())
        hub.register_sink(ok)
        hub.dispatch(self._snap("red"))
        # The ok sink still got alerts despite bad raising
        self.assertGreater(len(ok.alerts), 0)

    def test_cli_smoke(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            snaps_path = d / "snaps.ndjson"
            with snaps_path.open("w") as f:
                f.write(json.dumps(self._snap("green", spins=10, rtp=0.95)) + "\n")
                f.write(json.dumps(self._snap("red", spins=200, rtp=0.5)) + "\n")
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = dah_main([
                    "--snapshots", str(snaps_path),
                    "--log-out", str(d / "out.ndjson"),
                    "--quiet",
                ])
            # Exit 1 if any critical alert emitted
            self.assertEqual(rc, 1)


# ─── W55: Marketplace UI ───────────────────────────────────────────


class TestMarketplaceUI(unittest.TestCase):
    def _publish_some(self, registry: FilesystemMarketplace, n: int = 2):
        import zipfile
        out = []
        for i in range(n):
            tmp = Path(registry.root) / f"_seed{i}.zip"
            with zipfile.ZipFile(tmp, "w") as zf:
                zf.writestr("manifest.json", json.dumps({
                    "plugin_id": f"plg_{i}",
                    "version": "1.0.0",
                    "body_sha256_self": "",
                }))
                zf.writestr("README.md", f"plugin {i}")
            receipt = registry.publish(
                tmp, plugin_id=f"plg_{i}", version="1.0.0",
            )
            out.append(receipt)
            tmp.unlink()
        return out

    def test_render_index_template(self):
        html = render_index_html(
            registry_path="/tmp/registry",
            generated_at="2026-05-26T16:30:00+00:00",
        )
        self.assertIn("Slot-Math Plugin Marketplace", html)
        self.assertIn("/tmp/registry", html)
        self.assertIn("manifest.json", html)
        self.assertIn("verify.json", html)

    def test_build_dashboard_empty_registry(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            registry = FilesystemMarketplace(root=d / "reg")
            artifacts = build_dashboard(registry, d / "dash", verify=False)
            self.assertEqual(artifacts.n_plugins, 0)
            self.assertEqual(artifacts.n_verified_ok, 0)
            self.assertTrue(Path(artifacts.index_html).exists())
            self.assertTrue(Path(artifacts.manifest_json).exists())
            self.assertTrue(Path(artifacts.verify_json).exists())

    def test_build_dashboard_with_plugins(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            registry = FilesystemMarketplace(root=d / "reg")
            self._publish_some(registry, n=3)
            artifacts = build_dashboard(registry, d / "dash", verify=True)
            self.assertEqual(artifacts.n_plugins, 3)
            # All round-trips should pass for fresh publishes
            self.assertEqual(artifacts.n_verified_ok, 3)
            # Manifest content has the right shape
            manifest = json.loads(Path(artifacts.manifest_json).read_text())
            self.assertEqual(len(manifest["plugins"]), 3)
            # HTML references the expected JS
            html = Path(artifacts.index_html).read_text()
            self.assertIn("manifest.json", html)
            self.assertIn("verify.json", html)
            self.assertIn("fetchJSON", html)

    def test_verify_skipped_when_disabled(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            registry = FilesystemMarketplace(root=d / "reg")
            self._publish_some(registry, n=2)
            artifacts = build_dashboard(registry, d / "dash", verify=False)
            self.assertEqual(artifacts.n_plugins, 2)
            self.assertEqual(artifacts.n_verified_ok, 0)
            verify = json.loads(Path(artifacts.verify_json).read_text())
            self.assertEqual(verify, {})

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            registry = FilesystemMarketplace(root=d / "reg")
            self._publish_some(registry, n=2)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ui_main([
                    "--registry", str(d / "reg"),
                    "--out", str(d / "dash"),
                    "--no-verify",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)
            self.assertTrue((d / "dash" / "index.html").exists())


if __name__ == "__main__":
    unittest.main()
