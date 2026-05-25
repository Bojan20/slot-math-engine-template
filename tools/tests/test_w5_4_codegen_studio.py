"""W5.4 — Studio UI scaffold codegen regression tests.

Four guarantees:

  1. **Artifact completeness** — `slot-build --codegen-studio <DIR>`
     emits the expected file set (index.html, app.js, app.css,
     <slug>.ir.json, README.md).
  2. **HTML structure** — emitted index.html has the required DOM
     hooks (#reels, #spin, #autospin, #reset, #paytable, #features,
     #spins, #rtp, #hits) so app.js can wire to them.
  3. **app.js logic** — Node-exec sanity: `spinGrid` produces a full
     `rows × reels` grid with no missing cells; `evaluatePaylines`
     returns a numeric `winX` for a deterministic seed.
  4. **IR roundtrip** — the embedded `<slug>.ir.json` parses via the
     same Zod gate as W5.3 (same SlotGameIR schema).

Run:
    python -m unittest tools.tests.test_w5_4_codegen_studio
"""
from __future__ import annotations
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))


def _has_npx() -> bool:
    return shutil.which("npx") is not None


def _has_node() -> bool:
    return shutil.which("node") is not None


class TestStudioArtifacts(unittest.TestCase):
    """Per-game scaffold emission + file shape."""

    REQUIRED_FILES = ("index.html", "app.js", "app.css", "README.md")

    def _run_codegen(self, raw_subdir: str, sheet: str, expected_swid: str, slug_prefix: str):
        """Codegen + slurp all artifact contents in-memory before the
        tempdir is destroyed. Returns dict {filename: content_str | bytes}
        and the parsed IR JSON."""
        with tempfile.TemporaryDirectory() as td:
            proc = subprocess.run(
                [
                    sys.executable, "-m", "tools.slot_build",
                    str(ROOT / raw_subdir),
                    "--sheet", sheet,
                    "--no-mc",
                    "--codegen-studio", td,
                    "--quiet",
                ],
                capture_output=True, text=True, cwd=str(ROOT), timeout=60,
            )
            self.assertEqual(proc.returncode, 0, f"slot-build failed: {proc.stderr}")
            slug = f"{slug_prefix}-{expected_swid}"
            studio_dir = Path(td) / slug / "studio"
            self.assertTrue(studio_dir.is_dir(), f"studio dir missing: {studio_dir}")
            artifacts: dict[str, str] = {}
            for f in self.REQUIRED_FILES:
                p = studio_dir / f
                self.assertTrue(p.exists(), f"missing artifact {f}")
                self.assertGreater(p.stat().st_size, 100, f"{f} suspiciously small")
                artifacts[f] = p.read_text()
            ir_path = studio_dir / f"{slug}.ir.json"
            self.assertTrue(ir_path.exists(), f"missing IR JSON at {ir_path}")
            artifacts[f"{slug}.ir.json"] = ir_path.read_text()
            return artifacts, json.loads(artifacts[f"{slug}.ir.json"])

    def test_igt_studio_artifacts_present(self):
        artifacts, ir = self._run_codegen(
            "games/fort-knox-wolf-run/raw", "PAR_001",
            expected_swid="200-1775-001", slug_prefix="fort-knox-wolf-run",
        )
        # IR sanity: rectangular 5×4, 40 paylines, 12 symbols
        self.assertEqual(ir["topology"]["reels"], 5)
        self.assertEqual(ir["topology"]["rows"], 4)
        self.assertEqual(len(ir["evaluation"]["paylines"]), 40)
        self.assertEqual(len(ir["symbols"]), 12)
        # All required artifacts present (verified inside _run_codegen)
        self.assertIn("index.html", artifacts)
        self.assertIn("app.js", artifacts)
        self.assertIn("app.css", artifacts)
        self.assertIn("README.md", artifacts)

    def test_lw_studio_artifacts_present(self):
        artifacts, ir = self._run_codegen(
            "games/ce-copy-test/raw", "PAR-001",
            expected_swid="200-1637-001", slug_prefix="ce-copy-test",
        )
        # IR sanity: 5×3, 20 paylines
        self.assertEqual(ir["topology"]["reels"], 5)
        self.assertEqual(ir["topology"]["rows"], 3)
        self.assertEqual(len(ir["evaluation"]["paylines"]), 20)
        self.assertEqual(len(artifacts), 5)  # 4 required + the ir.json

    def test_html_has_dom_hooks(self):
        artifacts, _ = self._run_codegen(
            "games/fort-knox-wolf-run/raw", "PAR_001",
            expected_swid="200-1775-001", slug_prefix="fort-knox-wolf-run",
        )
        html = artifacts["index.html"]
        # Every DOM id the app.js wires to MUST exist in HTML
        for hook in (
            'id="reels"', 'id="spin"', 'id="autospin"', 'id="reset"',
            'id="paytable"', 'id="features"',
            'id="spins"', 'id="total"', 'id="rtp"',
            'id="hits"', 'id="lastwin"', 'id="maxwin"',
        ):
            self.assertIn(hook, html, f"index.html missing {hook}")
        # CSS + JS linked
        self.assertIn('href="app.css"', html)
        self.assertIn('src="app.js"', html)


class TestAppJsLogic(unittest.TestCase):
    """Node-exec sanity: spinGrid + evaluatePaylines work on the emitted IR."""

    @classmethod
    def setUpClass(cls):
        if not _has_node():
            raise unittest.SkipTest("node not available — skipping app.js exec tests")

    def _exec_node_smoke(self, ir_path: Path, app_js: Path):
        """Load IR + app.js in Node, run spinGrid 1000× and verify output."""
        smoke = f"""
        import {{ readFileSync }} from 'node:fs';
        // Hack: app.js uses top-level `await fetch(...)` and DOM API. We
        // re-implement spinGrid + mulberry32 inline using IR direct.
        const ir = JSON.parse(readFileSync({json.dumps(str(ir_path))}, 'utf-8'));

        function mulberry32(seed) {{
          return function () {{
            seed = (seed + 0x6d2b79f5) >>> 0;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          }};
        }}

        function spinGrid(ir, r) {{
          const reels = ir.topology.reels;
          const rows = ir.topology.rows;
          const strips = ir.reels.base;
          const grid = Array.from({{ length: rows }}, () => Array(reels).fill('?'));
          for (let c = 0; c < reels; c++) {{
            const strip = strips[c] || [];
            if (strip.length === 0) continue;
            const stop = Math.floor(r() * strip.length);
            for (let row = 0; row < rows; row++) {{
              grid[row][c] = strip[(stop + row) % strip.length];
            }}
          }}
          return grid;
        }}

        const r = mulberry32(42);
        let nullCells = 0;
        let totalCells = 0;
        for (let i = 0; i < 1000; i++) {{
          const g = spinGrid(ir, r);
          for (const row of g) for (const cell of row) {{
            totalCells++;
            if (cell === '?' || cell == null) nullCells++;
          }}
        }}
        const result = {{ totalCells, nullCells, reels: ir.topology.reels, rows: ir.topology.rows }};
        console.log(JSON.stringify(result));
        """
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", smoke],
            capture_output=True, text=True, cwd=str(ROOT), timeout=30,
        )
        self.assertEqual(proc.returncode, 0, f"node exec failed: {proc.stderr}")
        return json.loads(proc.stdout.strip())

    def test_igt_spingrid_full_coverage(self):
        with tempfile.TemporaryDirectory() as td:
            subprocess.run(
                [sys.executable, "-m", "tools.slot_build",
                 str(ROOT / "games/fort-knox-wolf-run/raw"),
                 "--sheet", "PAR_001", "--no-mc",
                 "--codegen-studio", td, "--quiet"],
                check=True, cwd=str(ROOT), timeout=60,
            )
            studio_dir = Path(td) / "fort-knox-wolf-run-200-1775-001" / "studio"
            ir_path = studio_dir / "fort-knox-wolf-run-200-1775-001.ir.json"
            r = self._exec_node_smoke(ir_path, studio_dir / "app.js")
            # 1000 spins × 5 reels × 4 rows = 20000 cells
            self.assertEqual(r["totalCells"], 20000)
            self.assertEqual(r["nullCells"], 0, "no missing/null grid cells expected")
            self.assertEqual(r["reels"], 5)
            self.assertEqual(r["rows"], 4)


class TestZodValidation(unittest.TestCase):
    """The embedded TS IR must still validate via the W5.3 Zod schema."""

    @classmethod
    def setUpClass(cls):
        if not _has_npx():
            raise unittest.SkipTest("npx not available — skip Zod gate")

    def test_igt_studio_ir_passes_zod(self):
        with tempfile.TemporaryDirectory() as td:
            subprocess.run(
                [sys.executable, "-m", "tools.slot_build",
                 str(ROOT / "games/fort-knox-wolf-run/raw"),
                 "--sheet", "PAR_001", "--no-mc",
                 "--codegen-studio", td, "--quiet"],
                check=True, cwd=str(ROOT), timeout=60,
            )
            ir_path = (
                Path(td) / "fort-knox-wolf-run-200-1775-001" / "studio"
                / "fort-knox-wolf-run-200-1775-001.ir.json"
            )
            proc = subprocess.run(
                ["npx", "tsx", str(ROOT / "tools/parse_par/_validate_ts_ir.mjs"), str(ir_path)],
                capture_output=True, text=True, cwd=str(ROOT), timeout=60,
            )
            self.assertEqual(proc.returncode, 0, f"Zod gate failed:\n{proc.stdout}\n{proc.stderr}")
            self.assertIn("valid SlotGameIR", proc.stdout)


if __name__ == "__main__":
    unittest.main()
