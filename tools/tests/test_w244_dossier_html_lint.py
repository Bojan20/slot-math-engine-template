"""W244 wave 67 — dossier HTML lint must exit 0 + all community docs exist."""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LINT = ROOT / "tools" / "lint_dossier_html.py"


class TestDossierHtmlLint(unittest.TestCase):
    def test_lint_exits_zero(self):
        r = subprocess.run(
            [sys.executable, str(LINT)],
            capture_output=True, text=True, cwd=str(ROOT), timeout=15,
        )
        self.assertEqual(
            r.returncode, 0,
            f"dossier HTML lint failed:\n{r.stdout}\n{r.stderr}",
        )


class TestCommunityProfile(unittest.TestCase):
    """GitHub community profile docs must exist + be non-trivial."""

    EXPECTED_DOCS = {
        "CITATION.cff": 500,
        "SECURITY.md": 500,
        "CONTRIBUTING.md": 1000,
        "CODE_OF_CONDUCT.md": 300,
    }

    def test_all_community_docs_present(self):
        for fname, min_size in self.EXPECTED_DOCS.items():
            p = ROOT / fname
            self.assertTrue(p.exists(), f"missing: {fname}")
            size = p.stat().st_size
            self.assertGreater(
                size, min_size,
                f"{fname} suspiciously small ({size}B < {min_size}B)",
            )

    def test_citation_cff_parses(self):
        try:
            import yaml
        except ImportError:
            self.skipTest("PyYAML not installed")
        d = yaml.safe_load((ROOT / "CITATION.cff").read_text())
        self.assertIn("cff-version", d)
        self.assertIn("authors", d)
        self.assertIn("title", d)
        self.assertEqual(d["title"], "slot-math-engine-template")


if __name__ == "__main__":
    unittest.main()
