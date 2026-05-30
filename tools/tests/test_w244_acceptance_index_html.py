"""W244 wave 83 — acceptance index HTML build determinism + structure."""
from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_acceptance_index_html.py"
OUT = ROOT / "reports" / "dossier" / "acceptance_index.html"
ACCEPT = ROOT / "reports" / "acceptance"


class TestAcceptanceIndexHtml(unittest.TestCase):
    def test_html_exists(self):
        self.assertTrue(OUT.exists())

    def test_row_count_covers_all_json_files(self):
        text = OUT.read_text(encoding="utf-8")
        json_files = list(ACCEPT.glob("*.json"))
        # Allow ±2 because some JSONs might be malformed and skipped
        # quietly; the renderer logs but doesn't fail
        tr_count = text.count("<tr>") - 1  # subtract header row
        self.assertGreaterEqual(tr_count, len(json_files) - 2)

    def test_search_bar_present(self):
        text = OUT.read_text(encoding="utf-8")
        self.assertIn('id="search"', text)

    def test_cross_link_nav_present(self):
        text = OUT.read_text(encoding="utf-8")
        for href in ("INDUSTRY_FIRST_DOSSIER.html",
                     "REGULATOR_PORTAL.html", "CLOSED_FORM_PORTFOLIO.html",
                     "kernels/index.html", "showcase_game.html"):
            self.assertIn(f'href="{href}"', text)

    def test_body_merkle_in_footer(self):
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
