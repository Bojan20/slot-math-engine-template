"""W244 wave 51 — IF dashboard HTML build determinism + structure tests."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_industry_firsts_html.py"
JSON_SRC = ROOT / "reports" / "dossier" / "INDUSTRY_FIRST_DOSSIER.json"
HTML_OUT = ROOT / "reports" / "dossier" / "INDUSTRY_FIRST_DOSSIER.html"


class TestIndustryFirstsHtmlBuild(unittest.TestCase):
    """Verify the static HTML dashboard builds deterministically."""

    def test_html_exists_and_has_cards(self):
        self.assertTrue(HTML_OUT.exists(), f"HTML missing: {HTML_OUT}")
        text = HTML_OUT.read_text(encoding="utf-8")
        # Should have one <article class="card"> per IF
        dossier = json.loads(JSON_SRC.read_text())
        expected = len(dossier["waves"])
        self.assertEqual(
            text.count('<article class="card"'), expected,
            f"card count mismatch — expected {expected}",
        )

    def test_rebuild_is_byte_stable(self):
        """Two builds must produce byte-identical HTML."""
        before = HTML_OUT.read_text(encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        after = HTML_OUT.read_text(encoding="utf-8")
        self.assertEqual(
            before, after, "HTML drifted across rebuilds — non-deterministic",
        )

    def test_body_merkle_present_in_html(self):
        """Footer should advertise SHA-256 Merkle of body — used for audit."""
        text = HTML_OUT.read_text(encoding="utf-8")
        self.assertIn("HTML Merkle", text)
        # Should contain a 64-char hex digest somewhere in footer
        import re
        matches = re.findall(r"<code>([0-9a-f]{64})</code>", text)
        self.assertGreaterEqual(
            len(matches), 1, "no SHA-256 hex digest found in HTML footer",
        )


if __name__ == "__main__":
    unittest.main()
