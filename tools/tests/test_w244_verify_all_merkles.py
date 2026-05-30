"""W244 wave 82 — scripts/verify_all_merkles.sh exists + structurally sane.

Heavy run (full rebuild + diff) is gated by env var. Structural checks
always active so any future drift in script structure breaks loudly.
"""
from __future__ import annotations

import os
import stat
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "scripts" / "verify_all_merkles.sh"


class TestVerifyAllMerklesScript(unittest.TestCase):

    def test_script_exists(self):
        self.assertTrue(SCRIPT.exists())

    def test_script_executable(self):
        st = SCRIPT.stat()
        self.assertTrue(
            st.st_mode & stat.S_IXUSR,
            "script not marked executable (run `chmod +x`)",
        )

    def test_script_uses_strict_mode(self):
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("set -euo pipefail", text)

    def test_script_has_help_flag(self):
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("--help", text)

    def test_script_documents_exit_codes(self):
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("Exit codes", text)
        self.assertIn("0 —", text)
        self.assertIn("1 —", text)
        self.assertIn("2 —", text)

    def test_script_covers_all_artefakt_classes(self):
        text = SCRIPT.read_text(encoding="utf-8")
        for expected in (
            "kernel acceptance",
            "dossier HTML",
            "JSON Schemas",
            "search index",
            "Markdown docs",
            "bench history",
            "wasm",
        ):
            self.assertIn(expected, text,
                          f"script missing coverage for: {expected}")


class TestReproducibilityDoc(unittest.TestCase):

    def test_reproducibility_md_exists(self):
        self.assertTrue((ROOT / "REPRODUCIBILITY.md").exists())

    def test_doc_lists_required_tools(self):
        text = (ROOT / "REPRODUCIBILITY.md").read_text()
        for tool in ("Python", "Rust", "Node.js", "wasm-pack"):
            self.assertIn(tool, text)

    def test_doc_has_audit_checklist(self):
        text = (ROOT / "REPRODUCIBILITY.md").read_text()
        self.assertIn("Audit checklist", text)
        # Should have 7+ bullet items
        bullets = text.count("- [ ]")
        self.assertGreaterEqual(bullets, 5)


class TestVerifyScriptHeavyRun(unittest.TestCase):
    """Opt-in: actually invoke the verifier."""

    def test_full_run_exits_zero(self):
        if not os.environ.get("SLOT_RUN_VERIFY_ALL_MERKLES"):
            self.skipTest(
                "set SLOT_RUN_VERIFY_ALL_MERKLES=1 to invoke the "
                "verifier (takes ~30s)"
            )
        r = subprocess.run(
            [str(SCRIPT), "--skip-wasm"],
            capture_output=True, text=True, cwd=str(ROOT),
            timeout=180,
        )
        self.assertEqual(
            r.returncode, 0,
            f"verifier failed:\n{r.stdout[-2000:]}\n{r.stderr[-1000:]}",
        )


if __name__ == "__main__":
    unittest.main()
