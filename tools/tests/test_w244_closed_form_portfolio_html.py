"""W244 wave 57 — Closed-Form Portfolio HTML build determinism + structure."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_closed_form_portfolio_html.py"
OUT = ROOT / "reports" / "dossier" / "CLOSED_FORM_PORTFOLIO.html"
SRC = ROOT / "reports" / "dossier" / "CLOSED_FORM_PORTFOLIO_100.json"


class TestClosedFormPortfolioHtml(unittest.TestCase):
    def test_html_exists(self):
        self.assertTrue(OUT.exists())

    def test_row_count_matches_source(self):
        text = OUT.read_text(encoding="utf-8")
        d = json.loads(SRC.read_text())
        expected = len(d.get("reports", []))
        # Each row contains data-name= attribute
        rows = re.findall(r'<tr data-name="', text)
        self.assertEqual(len(rows), expected)

    def test_pass_fail_status_chips_present(self):
        text = OUT.read_text(encoding="utf-8")
        self.assertIn("status ok", text)
        self.assertIn("status fail", text)
        # Stats panel
        self.assertIn("Configs validated", text)

    def test_body_merkle_present(self):
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
        self.assertEqual(before, after, "CF portfolio HTML drifted")


if __name__ == "__main__":
    unittest.main()
