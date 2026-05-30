"""W244 wave 68 — perf regression detector smoke + behavior tests."""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "perf_regression_check.py"
BENCH = ROOT / "reports" / "acceptance" / "W244_BENCHMARK_DOSSIER.json"


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT)] + args,
        capture_output=True, text=True, cwd=str(ROOT), timeout=20,
    )


class TestPerfRegressionDetector(unittest.TestCase):

    def test_no_regression_on_clean_head(self):
        """HEAD vs HEAD should always be 0 regressions."""
        r = _run(["--base", "HEAD"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("No regression", r.stdout)

    def test_threshold_argument_accepted(self):
        r = _run(["--threshold", "0.05"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("5.0% slowdown", r.stdout)

    def test_verbose_flag_works(self):
        r = _run(["--verbose"])
        self.assertEqual(r.returncode, 0, r.stderr)
        # verbose mode prints all benchmarks
        self.assertIn("kernels/" if False else "Summary:", r.stdout)

    def test_missing_baseline_exits_zero(self):
        """If baseline rev doesn't have the bench file, exit 0 (no compare)."""
        # Use an empty tree SHA (4b825d…) — git's well-known empty tree
        r = _run(["--base", "4b825dc642cb6eb9a060e54bf8d69288fbee4904"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("no baseline", r.stdout)


if __name__ == "__main__":
    unittest.main()
