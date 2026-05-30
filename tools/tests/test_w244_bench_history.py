"""W244 wave 79 — bench history snapshot determinism + structure."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_bench_history.py"
OUT = ROOT / "reports" / "acceptance" / "W244_BENCHMARK_HISTORY.json"


class TestBenchHistory(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if not OUT.exists():
            raise unittest.SkipTest(
                "W244_BENCHMARK_HISTORY.json not built — run "
                "`python3 tools/build_bench_history.py`"
            )
        cls.d = json.loads(OUT.read_text())

    def test_schema_present(self):
        self.assertEqual(
            self.d["schema"], "w244-benchmark-history/v1",
        )

    def test_merkle_64_hex(self):
        m = self.d["merkle_root_sha256"]
        self.assertEqual(len(m), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in m))

    def test_at_least_one_snapshot(self):
        self.assertGreaterEqual(len(self.d["snapshots"]), 1)
        self.assertEqual(
            len(self.d["snapshots"]), self.d["snapshot_count"],
        )

    def test_snapshot_structure(self):
        for s in self.d["snapshots"]:
            for k in ("commit", "timestamp", "bench_count",
                      "merkle_root_sha256", "mean_across_all", "records"):
                self.assertIn(k, s, f"snapshot missing {k}")
            # commit short SHA — 7-12 chars
            self.assertGreaterEqual(len(s["commit"]), 7)
            self.assertLessEqual(len(s["commit"]), 12)
            self.assertIsInstance(s["records"], dict)

    def test_merkle_matches_leaf_recompute(self):
        leaf_lines = []
        for snap in self.d["snapshots"]:
            for bench in sorted(snap["records"]):
                leaf_lines.append(
                    f"{snap['commit']}|{bench}|"
                    f"{snap['records'][bench]!r}\n"
                )
        expected = hashlib.sha256(
            "".join(leaf_lines).encode("utf-8"),
        ).hexdigest()
        self.assertEqual(expected, self.d["merkle_root_sha256"])

    def test_rebuild_byte_stable(self):
        before = OUT.read_text(encoding="utf-8")
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT), timeout=30,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        after = OUT.read_text(encoding="utf-8")
        self.assertEqual(before, after, "bench history drifted")


if __name__ == "__main__":
    unittest.main()
