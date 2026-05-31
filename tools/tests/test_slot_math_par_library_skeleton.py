"""SLOT-MATH wave 1.2 — PAR library skeleton + gitignore policy."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LIB = ROOT / "reports" / "par-library"


class TestParLibrarySkeleton(unittest.TestCase):

    def test_library_dir_exists(self):
        self.assertTrue(LIB.is_dir())

    def test_readme_documents_layout(self):
        readme = LIB / "README.md"
        self.assertTrue(readme.exists())
        text = readme.read_text(encoding="utf-8")
        # Critical concepts must be documented
        for keyword in (
            "canonical.par.yaml",
            "audit.lossless.json",
            "merkle.sha256",
            "source.original",
            "Read-only after import",
            "Naming convention",
        ):
            self.assertIn(
                keyword, text,
                f"README missing concept: {keyword}",
            )

    def test_gitignore_excludes_vendor_data(self):
        gi = LIB / ".gitignore"
        self.assertTrue(gi.exists())
        text = gi.read_text(encoding="utf-8")
        for pattern in (
            "source.original.*",
            "*.swid.txt",
            "swid.*",
            "*.cache.json",
        ):
            self.assertIn(
                pattern, text,
                f".gitignore missing pattern: {pattern}",
            )

    def test_template_dir_in_git(self):
        tmpl = LIB / "_template"
        self.assertTrue(tmpl.is_dir())
        self.assertTrue((tmpl / "README.md").exists())

    def test_no_vendor_data_committed(self):
        """Sanity: no `source.original.*` should be in git under par-library."""
        for p in LIB.rglob("source.original.*"):
            self.fail(
                f"vendor original committed to git: {p} — "
                "should be in .gitignore"
            )
        for p in LIB.rglob("*.swid.*"):
            self.fail(f"SWID identifier committed: {p}")


if __name__ == "__main__":
    unittest.main()
