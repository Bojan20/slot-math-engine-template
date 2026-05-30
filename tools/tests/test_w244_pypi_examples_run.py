"""W244 wave 54 — PyPI package examples must all run cleanly (exit 0).

Each script in `packages/slot-math-kernels/examples/*.py` demonstrates
one kernel's intended downstream usage. Broken examples = broken docs =
broken external onboarding. This gate ensures they keep working.

Each example must:
  * Exit 0
  * Import cleanly from `slot_math_kernels` (no monorepo dep)
  * Print non-empty output (sanity)
"""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
EXAMPLES = ROOT / "packages" / "slot-math-kernels" / "examples"
PKG_SRC = ROOT / "packages" / "slot-math-kernels" / "src"


def _run_example(path: Path) -> subprocess.CompletedProcess:
    """Run an example using ONLY the vendored package — no monorepo path."""
    env_path = str(PKG_SRC)
    return subprocess.run(
        [sys.executable, str(path)],
        capture_output=True, text=True, cwd=str(ROOT),
        env={"PYTHONPATH": env_path, "PATH": "/usr/bin:/bin"},
        timeout=30,
    )


class TestPyPiExamplesRun(unittest.TestCase):
    """All packaged examples must succeed."""

    def test_examples_directory_exists(self):
        self.assertTrue(EXAMPLES.is_dir(), f"missing: {EXAMPLES}")
        scripts = sorted(EXAMPLES.glob("*.py"))
        self.assertGreaterEqual(
            len(scripts), 5,
            f"expected at least 5 example scripts, found {len(scripts)}",
        )

    def test_all_examples_exit_zero(self):
        scripts = sorted(EXAMPLES.glob("*.py"))
        failures = []
        for s in scripts:
            r = _run_example(s)
            if r.returncode != 0:
                failures.append(
                    f"{s.name} → exit {r.returncode}\n"
                    f"STDOUT:\n{r.stdout[-500:]}\n"
                    f"STDERR:\n{r.stderr[-500:]}"
                )
        if failures:
            self.fail("Some examples failed:\n\n" + "\n---\n".join(failures))

    def test_all_examples_produce_output(self):
        scripts = sorted(EXAMPLES.glob("*.py"))
        for s in scripts:
            r = _run_example(s)
            self.assertTrue(
                r.stdout.strip(),
                f"{s.name} produced no stdout (broken demo?)",
            )


if __name__ == "__main__":
    unittest.main()
