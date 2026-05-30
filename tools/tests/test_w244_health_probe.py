"""W244 wave 61 — health probe must exit 0 on clean surface.

If `python3 tools/w244_health.py` exits non-zero, the W244 surface has
drift / missing files / schema breaks. CI must catch this immediately.
"""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "w244_health.py"


class TestHealthProbe(unittest.TestCase):
    def test_health_probe_exits_zero(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT), timeout=30,
        )
        self.assertEqual(
            r.returncode, 0,
            f"w244 health probe failed:\nSTDOUT:\n{r.stdout}\n"
            f"STDERR:\n{r.stderr}",
        )
        self.assertIn("All", r.stdout)
        self.assertIn("checks PASS", r.stdout)


if __name__ == "__main__":
    unittest.main()
