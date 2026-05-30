"""W244 wave 71 — unified search index build determinism + structure."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_search_index.py"
OUT = ROOT / "reports" / "dossier" / "search-index.json"
LANDING = ROOT / "reports" / "dossier" / "index.html"


class TestSearchIndex(unittest.TestCase):
    def test_index_exists(self):
        self.assertTrue(OUT.exists())

    def test_schema_and_merkle_present(self):
        d = json.loads(OUT.read_text())
        self.assertEqual(d["schema"], "w244-search-index/v1")
        self.assertTrue(re.match(r"^[0-9a-f]{64}$",
                                  d["merkle_root_sha256"]))
        self.assertGreater(d["entries_count"], 200)

    def test_all_kinds_present(self):
        d = json.loads(OUT.read_text())
        by_kind = d["by_kind"]
        for kind in ("industry-first", "kernel",
                     "cf-solver", "showcase"):
            self.assertIn(kind, by_kind, f"missing kind: {kind}")
        # IF dossier has ~89 waves
        self.assertGreaterEqual(by_kind["industry-first"], 80)
        # Kernels ≥19 standard
        self.assertGreaterEqual(by_kind["kernel"], 19)
        # CF solvers = 120
        self.assertGreaterEqual(by_kind["cf-solver"], 100)

    def test_every_entry_has_required_fields(self):
        d = json.loads(OUT.read_text())
        for e in d["entries"]:
            for k in ("kind", "id", "title", "body", "url"):
                self.assertIn(k, e, f"entry missing {k}: {e}")

    def test_merkle_matches_leaf_recompute(self):
        d = json.loads(OUT.read_text())
        leaf_lines = "".join(
            f"{e['kind']}|{e['id']}|{e['url']}\n"
            for e in d["entries"]
        )
        expected = hashlib.sha256(leaf_lines.encode("utf-8")).hexdigest()
        self.assertEqual(d["merkle_root_sha256"], expected)

    def test_rebuild_byte_stable(self):
        before = OUT.read_text(encoding="utf-8")
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        after = OUT.read_text(encoding="utf-8")
        self.assertEqual(before, after)


class TestLandingHasSearchBar(unittest.TestCase):
    def test_landing_includes_search_input(self):
        text = LANDING.read_text(encoding="utf-8")
        self.assertIn('id="q"', text)
        self.assertIn("search-index.json", text)
        self.assertIn("entries_count", text)


if __name__ == "__main__":
    unittest.main()
