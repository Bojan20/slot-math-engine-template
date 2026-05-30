"""W244 wave 52 — Regulator Portal HTML build determinism + structure tests."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_regulator_portal.py"
OUT = ROOT / "reports" / "dossier" / "REGULATOR_PORTAL.html"
IFS_JSON = ROOT / "reports" / "dossier" / "INDUSTRY_FIRST_DOSSIER.json"
KERNELS_JSON = ROOT / "reports" / "acceptance" / "W244_ALL_KERNELS.json"
BENCH_JSON = ROOT / "reports" / "acceptance" / "W244_BENCHMARK_DOSSIER.json"


class TestRegulatorPortalBuild(unittest.TestCase):
    """The portal must build deterministically with all 3 tabs."""

    def test_portal_html_exists(self):
        self.assertTrue(OUT.exists())
        text = OUT.read_text(encoding="utf-8")
        # All 3 tab sections rendered
        for tid in ("tab-ifs", "tab-kern", "tab-bench"):
            self.assertIn(f'id="{tid}"', text, f"missing tab section {tid}")

    def test_if_card_count_matches_dossier(self):
        text = OUT.read_text(encoding="utf-8")
        dossier = json.loads(IFS_JSON.read_text())
        expected = len(dossier["waves"])
        self.assertEqual(text.count('<article class="card"'), expected)

    def test_kernel_table_rows_match_dossier(self):
        text = OUT.read_text(encoding="utf-8")
        kern_d = json.loads(KERNELS_JSON.read_text())
        expected = len(kern_d.get("records", []))
        # Each kernel row contains <code>244.X</code>
        import re
        wave_ids = re.findall(r"<code>244\.\d+</code>", text)
        self.assertEqual(
            len(wave_ids), expected,
            f"kernel rows {len(wave_ids)} != dossier records {expected}",
        )

    def test_master_merkle_present(self):
        text = OUT.read_text(encoding="utf-8")
        kern_d = json.loads(KERNELS_JSON.read_text())
        master = kern_d.get("master_merkle_root_sha256", "")
        self.assertIn(master, text, "kernel master Merkle missing in portal")

    def test_bench_merkle_present(self):
        text = OUT.read_text(encoding="utf-8")
        bench_d = json.loads(BENCH_JSON.read_text())
        bench_merkle = bench_d.get("merkle_root_sha256", "")
        self.assertIn(bench_merkle, text, "bench Merkle missing in portal")

    def test_rebuild_byte_stable(self):
        before = OUT.read_text(encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        after = OUT.read_text(encoding="utf-8")
        self.assertEqual(
            before, after, "portal drifted across rebuilds",
        )


if __name__ == "__main__":
    unittest.main()
