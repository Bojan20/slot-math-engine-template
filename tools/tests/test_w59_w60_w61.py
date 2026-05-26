"""W59 + W60 + W61 combined tests."""
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

# W59
from tools.vendor_onboard import (
    OnboardStep,
    OnboardReport,
    run_onboarding,
    render_report_md,
)
from tools.vendor_onboard.__main__ import main as onboard_main

# W60
from tools.dashboard_livestream import (
    LivestreamConfig,
    LivestreamReport,
    run_livestream,
)
from tools.dashboard_livestream.__main__ import main as ls_main

# W61
from tools.catalog_sync import (
    CatalogReport,
    build_catalog,
    next_semver,
    render_index_md,
)
from tools.catalog_sync.__main__ import main as cs_main


def _ir(rel: str, *, target_rtp: float = 0.96) -> dict:
    return {
        "meta": {
            "id": rel.replace(".ir.json", ""),
            "vendor": "vendor_c",
            "swid": f"S-{rel}",
            "target_rtp": target_rtp,
            "volatility": "medium",
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "reels": {"base": [["A", "B", "C"] for _ in range(5)]},
        "paytable": [{"combo": ["A"] * 5, "pays": 100}],
        "features": [{"kind": "free_spins"}],
    }


# ─── W59: Vendor Onboard ───────────────────────────────────────────


class TestVendorOnboard(unittest.TestCase):
    def test_run_onboarding_produces_pilot_folder(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = run_onboarding(
                vendor_id="vendor_x",
                display_name="Vendor X — pilot",
                out_dir=d,
            )
            pilot = d / "pilot_vendor_x"
            self.assertTrue(pilot.exists())
            # Critical artifacts present
            self.assertTrue((pilot / "vendor_x.profile.yaml").exists())
            self.assertTrue((pilot / "ir.json").exists())
            self.assertTrue((pilot / "MANIFEST.json").exists())
            self.assertTrue((pilot / "ONBOARD_REPORT.md").exists())
            # All steps OK
            self.assertTrue(report.passed)

    def test_no_cert_skips_cert_step(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = run_onboarding(
                vendor_id="vendor_y",
                display_name="Vendor Y",
                out_dir=d,
                emit_cert=False,
            )
            pilot = d / "pilot_vendor_y"
            self.assertFalse((pilot / "cert.v2.xml").exists())
            # Step names should not include cert emit
            step_names = [s.name for s in report.steps]
            self.assertNotIn("emit_cert_xml_v2", step_names)

    def test_ir_roundtrip_step_passes(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = run_onboarding(
                vendor_id="vendor_z",
                display_name="Vendor Z",
                out_dir=d,
            )
            roundtrip_steps = [s for s in report.steps if s.name == "ir_roundtrip"]
            self.assertEqual(len(roundtrip_steps), 1)
            self.assertTrue(roundtrip_steps[0].ok)

    def test_manifest_includes_all_files(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            run_onboarding(
                vendor_id="vendor_w",
                display_name="Vendor W",
                out_dir=d,
            )
            mf = json.loads((d / "pilot_vendor_w" / "MANIFEST.json").read_text())
            names = {f["name"] for f in mf["files"]}
            self.assertIn("ir.json", names)
            self.assertIn("vendor_w.profile.yaml", names)
            # Every entry has a SHA-256
            for entry in mf["files"]:
                self.assertEqual(len(entry["sha256"]), 64)

    def test_render_report_md_contains_steps(self):
        report = OnboardReport(
            vendor_id="vx",
            out_dir="/tmp/x",
            generated_at_utc="2026-05-26T16:00:00+00:00",
            steps=[
                OnboardStep("scaffold_profile", True, "ok", "vx.yaml"),
                OnboardStep("ir_roundtrip", True, "digest stable"),
            ],
        )
        md = render_report_md(report)
        self.assertIn("Onboard report", md)
        self.assertIn("scaffold_profile", md)
        self.assertIn("READY-TO-CALIBRATE", md)

    def test_cli_passes(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = onboard_main([
                    "vendor_cli", "--display-name", "Vendor CLI",
                    "--out", str(d), "--quiet",
                ])
            self.assertEqual(rc, 0)
            self.assertTrue((d / "pilot_vendor_cli" / "ir.json").exists())


# ─── W60: Dashboard Live-stream ────────────────────────────────────


class TestDashboardLivestream(unittest.TestCase):
    def _seed_games(self, games_root: Path, n: int = 2):
        games_root.mkdir(parents=True, exist_ok=True)
        for i in range(n):
            sub = games_root / f"game_{i}"
            sub.mkdir(exist_ok=True)
            (sub / "g.ir.json").write_text(
                json.dumps(_ir(f"g{i}.ir.json"))
            )

    def test_run_livestream_max_iter_2(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._seed_games(d / "games", n=2)
            cfg = LivestreamConfig(
                games_root=d / "games",
                out_dir=d / "dash",
                interval_seconds=0.0,
                max_iterations=2,
            )
            report = run_livestream(cfg, sleep_fn=lambda s: None)
            self.assertEqual(report.n_iterations, 2)
            self.assertEqual(report.stopped_by, "max_iterations")
            # HTML + JSON emitted
            html_files = list((d / "dash").glob("*.html"))
            self.assertGreater(len(html_files), 0)

    def test_livestream_ledger_emitted_each_iteration(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._seed_games(d / "games", n=1)
            cfg = LivestreamConfig(
                games_root=d / "games",
                out_dir=d / "dash",
                interval_seconds=0.0,
                max_iterations=3,
            )
            report = run_livestream(cfg, sleep_fn=lambda s: None)
            ledger_path = d / "dash" / "livestream_ledger.json"
            self.assertTrue(ledger_path.exists())
            ledger = json.loads(ledger_path.read_text())
            self.assertEqual(ledger["n_iterations"], 3)

    def test_livestream_handles_empty_games_root(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "games").mkdir()
            cfg = LivestreamConfig(
                games_root=d / "games",
                out_dir=d / "dash",
                interval_seconds=0.0,
                max_iterations=1,
            )
            report = run_livestream(cfg, sleep_fn=lambda s: None)
            self.assertEqual(report.n_iterations, 1)
            # Counts dict still emitted with total=0
            self.assertEqual(report.iterations[0].counts.get("total", 0), 0)

    def test_keyboard_interrupt_stops_gracefully(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._seed_games(d / "games", n=1)

            def raise_after_first(s):
                raise KeyboardInterrupt()

            cfg = LivestreamConfig(
                games_root=d / "games",
                out_dir=d / "dash",
                interval_seconds=0.0,
                max_iterations=None,
            )
            report = run_livestream(cfg, sleep_fn=raise_after_first)
            # One iteration completed before the KeyboardInterrupt
            self.assertEqual(report.n_iterations, 1)
            self.assertEqual(report.stopped_by, "keyboard_interrupt")

    def test_cli_smoke(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            self._seed_games(d / "games", n=1)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = ls_main([
                    str(d / "games"),
                    "--out", str(d / "dash"),
                    "--interval", "0",
                    "--max-iterations", "1",
                    "--quiet",
                ])
            self.assertEqual(rc, 0)


# ─── W61: Catalog Sync ─────────────────────────────────────────────


class TestCatalogSync(unittest.TestCase):
    def test_next_semver_patch_default(self):
        self.assertEqual(next_semver("0.1.0"), "0.1.1")
        self.assertEqual(next_semver("1.2.3"), "1.2.4")

    def test_next_semver_minor(self):
        self.assertEqual(next_semver("1.2.3", bump="minor"), "1.3.0")

    def test_next_semver_major(self):
        self.assertEqual(next_semver("1.2.3", bump="major"), "2.0.0")

    def test_next_semver_seed_when_none(self):
        self.assertEqual(next_semver(None), "0.1.0")
        self.assertEqual(next_semver(""), "0.1.0")
        self.assertEqual(next_semver("garbage"), "0.1.0")

    def test_build_catalog_emits_all_files(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_catalog(d, include_docstrings=False)
            self.assertTrue((d / "INDEX.json").exists())
            self.assertTrue((d / "INDEX.md").exists())
            self.assertTrue((d / "version.txt").exists())
            self.assertTrue((d / "checksums.txt").exists())
            self.assertEqual((d / "version.txt").read_text().strip(),
                              report.version)

    def test_build_catalog_includes_all_kernels(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_catalog(d, include_docstrings=False)
            # At least 80 kernels expected (we ship 100)
            self.assertGreater(report.n_kernels, 80)
            # Most kernels expose both surfaces
            self.assertGreater(report.n_with_analytical, 80)
            self.assertGreater(report.n_with_mc, 80)

    def test_build_catalog_auto_bumps_version_on_resync(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            r1 = build_catalog(d, include_docstrings=False)
            r2 = build_catalog(d, include_docstrings=False)
            # patch bump → second version > first
            v1 = r1.version.split(".")
            v2 = r2.version.split(".")
            self.assertEqual(v1[:2], v2[:2])
            self.assertEqual(int(v2[2]), int(v1[2]) + 1)

    def test_checksums_match_files(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            build_catalog(d, include_docstrings=False)
            checksums_path = d / "checksums.txt"
            for line in checksums_path.read_text().splitlines():
                if not line.strip():
                    continue
                digest, name = line.split("  ", 1)
                actual = hashlib.sha256((d / name).read_bytes()).hexdigest()
                self.assertEqual(actual, digest, f"checksum mismatch for {name}")

    def test_index_md_lists_kernels(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_catalog(d, include_docstrings=False)
            md = (d / "INDEX.md").read_text()
            self.assertIn("Slot-Math Solver Catalog", md)
            self.assertIn(report.version, md)
            # At least one kernel id listed
            self.assertIn("free_spin_pop_count", md)

    def test_feature_kinds_attached(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            report = build_catalog(d, include_docstrings=False)
            # At least one kernel should have a feature_kind mapping
            self.assertTrue(any(e.feature_kinds for e in report.entries))

    def test_cli_smoke(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = cs_main(["--out", str(d), "--no-docstrings", "--quiet"])
            self.assertEqual(rc, 0)
            self.assertTrue((d / "INDEX.json").exists())


if __name__ == "__main__":
    unittest.main()
