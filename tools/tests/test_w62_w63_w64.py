"""W62 + W63 + W64 combined tests."""
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

# W62
from tools.rtp_monitor.monitor import MonitorState
from tools.drift_alert_hub.hub import (
    AlertHub,
    DEFAULT_RULES,
    InMemoryAlertSink,
)
from tools.telemetry_bridge import (
    bridge_iterable,
    bridge_file,
    BridgeReport,
)
from tools.telemetry_bridge.__main__ import main as tb_main

# W63
from tools.catalog_diff import (
    CatalogDiffReport,
    KernelDelta,
    diff_indices,
    render_markdown,
)
from tools.catalog_diff.__main__ import main as cd_main
from tools.catalog_sync.syncer import build_catalog

# W64
from tools.pilot_signoff import (
    PilotSignoffReport,
    build_signoff,
    render_ansi,
)
from tools.pilot_signoff.__main__ import main as ps_main
from tools.vendor_onboard.wizard import run_onboarding


def _spin_event(bet: float, pay: float, idx: int = 0) -> dict:
    return {
        "event_type": "slot.spin_completed",
        "ts": 1_700_000_000.0 + idx,
        "payload": {"bet": bet, "pay": pay},
    }


# ─── W62: Telemetry → Drift Hub Bridge ─────────────────────────────


class TestTelemetryBridge(unittest.TestCase):
    def test_iterable_consumes_spin_events(self):
        state = MonitorState(target_rtp=0.95, rolling_window=100)
        sink = InMemoryAlertSink()
        hub = AlertHub(rules=list(DEFAULT_RULES))
        hub.register_sink(sink)
        events = [_spin_event(1.0, 0.0, i) for i in range(200)]
        r = bridge_iterable(events, state=state, hub=hub)
        self.assertEqual(r.events_received, 200)
        self.assertEqual(r.spins_consumed, 200)
        self.assertGreater(r.snapshots_emitted, 0)
        # All-losing stream → drift_severity=red → critical alerts fire
        self.assertGreater(len(sink.alerts), 0)

    def test_iterable_skips_non_spin(self):
        state = MonitorState(target_rtp=0.95)
        hub = AlertHub(rules=[])
        events = [
            {"event_type": "slot.session_started"},
            _spin_event(1.0, 0.95, 0),
            {"event_type": "slot.heartbeat"},
        ]
        r = bridge_iterable(events, state=state, hub=hub)
        self.assertEqual(r.spins_consumed, 1)
        self.assertEqual(r.non_spin_skipped, 2)

    def test_file_decode_errors_counted(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.ndjson"
            p.write_text(
                json.dumps(_spin_event(1.0, 0.95, 0)) + "\n"
                + "not-json-line\n"
                + json.dumps(_spin_event(1.0, 0.95, 1)) + "\n"
            )
            state = MonitorState(target_rtp=0.95)
            hub = AlertHub(rules=[])
            r = bridge_file(p, state=state, hub=hub)
            self.assertEqual(r.spins_consumed, 2)
            self.assertEqual(r.decode_errors, 1)

    def test_missing_feed_returns_empty_report(self):
        state = MonitorState(target_rtp=0.95)
        hub = AlertHub(rules=[])
        r = bridge_file(Path("/no/such/path.ndjson"), state=state, hub=hub)
        self.assertEqual(r.events_received, 0)

    def test_report_to_dict_serializable(self):
        state = MonitorState(target_rtp=0.95)
        hub = AlertHub(rules=list(DEFAULT_RULES))
        events = [_spin_event(1.0, 0.0, i) for i in range(150)]
        r = bridge_iterable(events, state=state, hub=hub)
        d = r.to_dict()
        # Must be JSON serializable
        json.dumps(d)
        self.assertIn("last_snapshot", d)
        self.assertIn("alerts_dispatched", d)

    def test_cli_critical_exit_1(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            p = d / "spins.ndjson"
            # All-losing stream forces a critical drift alert
            with p.open("w") as f:
                for i in range(200):
                    f.write(json.dumps(_spin_event(1.0, 0.0, i)) + "\n")
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = tb_main([
                    "--feed", str(p),
                    "--log-out", str(d / "alerts.ndjson"),
                    "--quiet",
                ])
            self.assertEqual(rc, 1)
            self.assertTrue((d / "alerts.ndjson").exists())


# ─── W63: Catalog Diff Reporter ────────────────────────────────────


class TestCatalogDiff(unittest.TestCase):
    def _idx(self, **kwargs) -> dict:
        return {
            "version": kwargs.get("version", "0.1.0"),
            "entries": kwargs.get("entries", []),
        }

    def _entry(self, kid: str, fields=("a", "b"), helpers=(), docstring=""):
        return {
            "kernel_id": kid,
            "module": f"tools.solvers.{kid}",
            "params_class": f"{kid.title()}Params",
            "params_fields": list(fields),
            "has_analytical_rtp": True,
            "has_mc_simulate": True,
            "helpers": list(helpers),
            "docstring": docstring,
            "feature_kinds": [],
            "related_kernels": [],
        }

    def test_no_changes_passes(self):
        idx = self._idx(entries=[self._entry("k1"), self._entry("k2")])
        r = diff_indices(idx, idx)
        self.assertTrue(r.passed)
        self.assertEqual(r.n_breaking, 0)

    def test_added_kernel_is_compatible(self):
        old = self._idx(entries=[self._entry("k1")])
        new = self._idx(entries=[self._entry("k1"), self._entry("k2")])
        r = diff_indices(old, new)
        self.assertEqual(r.added, ["k2"])
        self.assertEqual(r.removed, [])
        self.assertTrue(r.passed)

    def test_removed_kernel_is_breaking(self):
        old = self._idx(entries=[self._entry("k1"), self._entry("k2")])
        new = self._idx(entries=[self._entry("k1")])
        r = diff_indices(old, new)
        self.assertEqual(r.removed, ["k2"])
        self.assertFalse(r.passed)
        self.assertGreaterEqual(r.n_breaking, 1)

    def test_field_removal_is_breaking(self):
        old = self._idx(entries=[self._entry("k1", fields=("a", "b", "c"))])
        new = self._idx(entries=[self._entry("k1", fields=("a", "b"))])
        r = diff_indices(old, new)
        self.assertEqual(len(r.deltas), 1)
        self.assertEqual(r.deltas[0].field_removed, ["c"])
        self.assertTrue(r.deltas[0].is_breaking)
        self.assertFalse(r.passed)

    def test_field_addition_is_compatible(self):
        old = self._idx(entries=[self._entry("k1", fields=("a",))])
        new = self._idx(entries=[self._entry("k1", fields=("a", "b"))])
        r = diff_indices(old, new)
        self.assertEqual(r.deltas[0].field_added, ["b"])
        self.assertFalse(r.deltas[0].is_breaking)
        self.assertTrue(r.passed)

    def test_docstring_drift_detected_but_not_breaking(self):
        old = self._idx(entries=[self._entry("k1", docstring="v1")])
        new = self._idx(entries=[self._entry("k1", docstring="v2")])
        r = diff_indices(old, new)
        self.assertTrue(r.deltas[0].docstring_changed)
        self.assertFalse(r.deltas[0].is_breaking)
        self.assertTrue(r.passed)

    def test_markdown_render_includes_verdict(self):
        old = self._idx(entries=[self._entry("k1")])
        new = self._idx(entries=[self._entry("k1", fields=("a",))])
        r = diff_indices(old, new)
        md = render_markdown(r)
        self.assertIn("Catalog Diff", md)
        self.assertIn("BREAKING", md)

    def test_real_catalog_no_drift_when_same(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            build_catalog(d / "c1", include_docstrings=False)
            old_idx = json.loads((d / "c1" / "INDEX.json").read_text())
            build_catalog(d / "c2", include_docstrings=False)
            new_idx = json.loads((d / "c2" / "INDEX.json").read_text())
            r = diff_indices(old_idx, new_idx)
            # Only version delta + maybe related_kernels heuristic stability
            self.assertEqual(r.added, [])
            self.assertEqual(r.removed, [])
            self.assertEqual(r.n_breaking, 0)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            old = self._idx(entries=[self._entry("k1")])
            new = self._idx(entries=[self._entry("k1"), self._entry("k2")])
            (d / "old.json").write_text(json.dumps(old))
            (d / "new.json").write_text(json.dumps(new))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = cd_main([
                    "--old", str(d / "old.json"),
                    "--new", str(d / "new.json"),
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W64: Pilot Sign-off ───────────────────────────────────────────


class TestPilotSignoff(unittest.TestCase):
    def _bootstrap_pilot(self, root: Path) -> Path:
        """Run W59 onboarding to produce a real pilot folder for the test."""
        run_onboarding(
            vendor_id="signoff_pilot",
            display_name="Sign-off Pilot",
            out_dir=root,
        )
        return root / "pilot_signoff_pilot"

    def test_build_signoff_minimum(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            pilot = self._bootstrap_pilot(d)
            report = build_signoff(pilot_dir=pilot)
            self.assertEqual(report.vendor, "signoff_pilot")
            self.assertEqual(len(report.ir_digest_sha256), 64)
            # Onboarding should have all steps passing
            self.assertTrue(report.onboard_passed)

    def test_render_ansi_has_signature_block(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            pilot = self._bootstrap_pilot(d)
            report = build_signoff(pilot_dir=pilot)
            text = render_ansi(report)
            self.assertIn("PILOT SIGN-OFF REPORT", text)
            self.assertIn("Studio sign-off", text)
            self.assertIn("Regulator counter-signature", text)
            self.assertIn("VERDICT", text)

    def test_cert_digest_match(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            pilot = self._bootstrap_pilot(d)
            report = build_signoff(pilot_dir=pilot)
            # Cert must agree with IR
            self.assertTrue(report.cert_digest_match)

    def test_no_jurisdictions_blocks_passed(self):
        # Without --multi-territory dir, n_jurisdictions=0 → passed=False
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            pilot = self._bootstrap_pilot(d)
            report = build_signoff(pilot_dir=pilot)
            self.assertEqual(report.n_jurisdictions, 0)
            self.assertFalse(report.passed)

    def test_with_jurisdictions_via_multi_territory(self):
        from tools.multi_territory.builder import build_multi_territory_release
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            pilot = self._bootstrap_pilot(d)
            ir = json.loads((pilot / "ir.json").read_text())
            mt_dir = d / "mt"
            build_multi_territory_release(
                ir, profile_ids=["gli19"], out_dir=mt_dir,
            )
            report = build_signoff(
                pilot_dir=pilot, multi_territory_dir=mt_dir,
            )
            self.assertEqual(report.n_jurisdictions, 1)
            # Final verdict depends on lint result; assert structure correct
            self.assertIn(report.jurisdictions[0]["profile_id"], ("gli19",))

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            pilot = self._bootstrap_pilot(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ps_main([
                    "--pilot", str(pilot),
                    "--out", str(d / "signoff.txt"),
                    "--quiet",
                ])
            # No jurisdictions → BLOCKED → exit 1
            self.assertEqual(rc, 1)
            self.assertTrue((d / "signoff.txt").exists())
            text = (d / "signoff.txt").read_text()
            self.assertIn("VERDICT", text)


if __name__ == "__main__":
    unittest.main()
