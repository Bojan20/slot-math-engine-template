"""W244 wave 66 — dossier landing page build determinism + structure.

Landing page at `reports/dossier/index.html` is the GitHub Pages entry
point — must rebuild byte-identical + link to all 4 root dashboards.
"""
from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_dossier_landing.py"
OUT = ROOT / "reports" / "dossier" / "index.html"


class TestDossierLanding(unittest.TestCase):
    def test_landing_exists(self):
        self.assertTrue(OUT.exists())

    def test_links_to_all_4_dashboards(self):
        text = OUT.read_text(encoding="utf-8")
        for href in (
            "INDUSTRY_FIRST_DOSSIER.html",
            "REGULATOR_PORTAL.html",
            "CLOSED_FORM_PORTFOLIO.html",
            "kernels/index.html",
        ):
            self.assertIn(
                f'href="{href}"', text,
                f"landing missing link to {href}",
            )

    def test_pills_render_counters(self):
        text = OUT.read_text(encoding="utf-8")
        # 5 pills in hero
        self.assertEqual(text.count('class="pill"'), 5)
        # Standard markers
        self.assertIn("industry firsts", text)
        self.assertIn("kernels attested", text)
        self.assertIn("CF solvers", text)

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


class TestGhPagesWorkflow(unittest.TestCase):
    """Workflow YAML must be loadable + reference real assets."""

    def test_workflow_exists_and_parses(self):
        try:
            import yaml
        except ImportError:
            self.skipTest("PyYAML not installed")
        wf = ROOT / ".github" / "workflows" / "gh-pages-dossier.yml"
        self.assertTrue(wf.exists())
        d = yaml.safe_load(wf.read_text())
        self.assertIn("jobs", d)
        self.assertIn("build", d["jobs"])
        self.assertIn("deploy", d["jobs"])


if __name__ == "__main__":
    unittest.main()
