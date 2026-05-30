"""W244 wave 72 — docs/README.md auto-index build determinism + structure."""
from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_docs_index.py"
OUT = ROOT / "docs" / "README.md"
DOCS = ROOT / "docs"


class TestDocsIndex(unittest.TestCase):
    def test_readme_exists(self):
        self.assertTrue(OUT.exists())

    def test_header_present(self):
        text = OUT.read_text(encoding="utf-8")
        self.assertIn("slot-math-engine-template", text)
        self.assertIn("docs index", text)
        self.assertIn("Auto-generated", text)

    def test_lists_top_level_docs(self):
        text = OUT.read_text(encoding="utf-8")
        # Pick a few well-known docs
        for known in (
            "BACKEND_API.md", "DEPLOYMENT.md", "DEVELOPER_GUIDE.md",
            "DATABASE.md",
        ):
            if (DOCS / known).exists():
                self.assertIn(known, text, f"missing link to {known}")

    def test_lists_kernel_docs(self):
        text = OUT.read_text(encoding="utf-8")
        self.assertIn("kernels/", text)
        self.assertIn("kernels/README.md", text)

    def test_merkle_in_footer(self):
        text = OUT.read_text(encoding="utf-8")
        self.assertTrue(re.search(r"Index Merkle.*`[0-9a-f]{64}`", text))

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
