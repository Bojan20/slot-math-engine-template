"""W244 wave 69 — kernel Markdown docs build determinism + structure."""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_kernel_markdown_docs.py"
OUT_DIR = ROOT / "docs" / "kernels"


class TestKernelMarkdownDocs(unittest.TestCase):

    def test_output_dir_exists(self):
        self.assertTrue(OUT_DIR.is_dir())

    def test_readme_index_present(self):
        self.assertTrue((OUT_DIR / "README.md").exists())

    def test_at_least_19_per_kernel_docs(self):
        docs = list(OUT_DIR.glob("*_kernel.md"))
        self.assertGreaterEqual(
            len(docs), 19,
            f"expected ≥19 per-kernel docs, found {len(docs)}",
        )

    def test_each_doc_has_merkle_hex(self):
        import re
        bad = []
        for p in OUT_DIR.glob("*_kernel.md"):
            text = p.read_text(encoding="utf-8")
            if not re.search(r"`[0-9a-f]{64}`", text):
                bad.append(p.name)
        if bad:
            self.fail("docs without Merkle: " + ", ".join(bad))

    def test_each_doc_has_formula_section(self):
        bad = []
        for p in OUT_DIR.glob("*_kernel.md"):
            text = p.read_text(encoding="utf-8")
            if "## Closed-form formula" not in text:
                bad.append(p.name)
        if bad:
            self.fail("docs without formula section: " + ", ".join(bad))

    def test_index_lists_all_docs(self):
        index = (OUT_DIR / "README.md").read_text(encoding="utf-8")
        for p in OUT_DIR.glob("*_kernel.md"):
            self.assertIn(p.name, index, f"index missing {p.name}")

    def test_rebuild_byte_stable(self):
        before = {p.name: p.read_bytes() for p in OUT_DIR.glob("*.md")}
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        after = {p.name: p.read_bytes() for p in OUT_DIR.glob("*.md")}
        for name, before_bytes in before.items():
            self.assertEqual(
                before_bytes, after[name],
                f"doc drifted on rebuild: {name}",
            )


if __name__ == "__main__":
    unittest.main()
