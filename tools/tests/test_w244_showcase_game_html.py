"""W244 wave 70 — showcase game HTML build determinism + structure."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_showcase_game_html.py"
OUT = ROOT / "reports" / "dossier" / "showcase_game.html"
SRC = ROOT / "reports" / "acceptance" / "SHOWCASE_GAME_KERNEL.json"


class TestShowcaseGameHtml(unittest.TestCase):
    def test_html_exists(self):
        self.assertTrue(OUT.exists())

    def test_game_name_in_title(self):
        d = json.loads(SRC.read_text())
        text = OUT.read_text(encoding="utf-8")
        self.assertIn(d["game_name"], text)

    def test_all_kernels_rendered_as_cards(self):
        d = json.loads(SRC.read_text())
        text = OUT.read_text(encoding="utf-8")
        for kernel in d["closed_form"]["components"]:
            self.assertIn(kernel, text, f"missing component {kernel}")

    def test_mc_gate_status_present(self):
        text = OUT.read_text(encoding="utf-8")
        # Either PASS or FAIL must appear in status chip
        self.assertTrue(
            "gate-status pass" in text or "gate-status fail" in text,
        )

    def test_merkle_in_footer(self):
        text = OUT.read_text(encoding="utf-8")
        matches = re.findall(r"<code>([0-9a-f]{64})</code>", text)
        self.assertGreaterEqual(len(matches), 1)

    def test_rebuild_byte_stable(self):
        before = OUT.read_text(encoding="utf-8")
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        after = OUT.read_text(encoding="utf-8")
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
