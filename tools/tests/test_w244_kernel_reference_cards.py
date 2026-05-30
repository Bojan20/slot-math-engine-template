"""W244 wave 62 — per-kernel reference cards build determinism + structure."""
from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_kernel_reference_cards.py"
OUT_DIR = ROOT / "reports" / "dossier" / "kernels"


class TestKernelReferenceCards(unittest.TestCase):

    def test_output_dir_exists(self):
        self.assertTrue(OUT_DIR.is_dir())

    def test_index_exists(self):
        self.assertTrue((OUT_DIR / "index.html").exists())

    def test_at_least_19_kernel_pages(self):
        """Skip 3 special meta files (RUST_PYTHON_PARITY,
        SHOWCASE_GAME, DONE_UNIVERSAL_CLOSURE)."""
        pages = list(OUT_DIR.glob("*_kernel.html"))
        self.assertGreaterEqual(
            len(pages), 19,
            f"expected ≥19 per-kernel pages, found {len(pages)}",
        )

    def test_each_page_has_merkle(self):
        broken = []
        for p in OUT_DIR.glob("*_kernel.html"):
            text = p.read_text(encoding="utf-8")
            matches = re.findall(r"<code>([0-9a-f]{64})</code>", text)
            if not matches:
                broken.append(p.name)
        if broken:
            self.fail("Pages without Merkle hex: " + ", ".join(broken))

    def test_index_lists_all_kernel_pages(self):
        index_text = (OUT_DIR / "index.html").read_text(encoding="utf-8")
        page_names = [
            p.name for p in sorted(OUT_DIR.glob("*_kernel.html"))
        ]
        missing = [
            n for n in page_names if f'href="{n}"' not in index_text
        ]
        if missing:
            self.fail("Index missing links: " + ", ".join(missing))

    def test_rebuild_byte_stable(self):
        before = {p.name: p.read_bytes() for p in OUT_DIR.glob("*.html")}
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        after = {p.name: p.read_bytes() for p in OUT_DIR.glob("*.html")}
        for name, before_bytes in before.items():
            self.assertIn(name, after, f"page disappeared: {name}")
            self.assertEqual(
                before_bytes, after[name],
                f"page drifted on rebuild: {name}",
            )


if __name__ == "__main__":
    unittest.main()
