"""W5.3 — TS engine codegen regression tests.

Three guarantees:

  1. **Adapter correctness** — `convert_to_ts_ir` produces a dict that
     satisfies the TS `SlotGameIRZ` Zod schema for both shipped vendors
     (IGT Fort Knox + L&W CE COPY TEST).
  2. **Codegen artifact completeness** — `slot-build --codegen-ts <DIR>`
     emits the expected file set: `<slug>.ir.json`, `runner.ts`,
     `package.json`, `tsconfig.json`, `README.md`.
  3. **End-to-end runner smoke** — emitted `runner.ts` executes without
     panic via `tsx` and prints a parseable RTP line.

Run:
    python -m unittest tools.tests.test_w5_3_codegen_ts
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

from tools.parse_par import load_profile, parse_par
from tools.parse_par.to_slot_sim import convert_to_slot_sim_ir
from tools.parse_par.to_ts_ir import convert_to_ts_ir


def _has_npx() -> bool:
    return shutil.which("npx") is not None


def _validate_ts_ir_via_zod(ir_path: Path) -> tuple[bool, str]:
    """Run the Zod validator script and return (ok, stdout_or_err)."""
    if not _has_npx():
        return True, "(npx unavailable — skipping Zod validation)"
    proc = subprocess.run(
        ["npx", "tsx", str(ROOT / "tools/parse_par/_validate_ts_ir.mjs"), str(ir_path)],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        timeout=60,
    )
    output = (proc.stdout + proc.stderr).strip()
    return proc.returncode == 0, output


class TestTsIrConverter(unittest.TestCase):
    """Direct converter unit tests — pure Python, no Node required."""

    def test_igt_converter_shape(self):
        profile = load_profile("igt")
        raw_dir = ROOT / "games/fort-knox-wolf-run/raw"
        parsed = parse_par(profile, raw_dir, sheet="PAR_001")
        universal = convert_to_slot_sim_ir(parsed, "igt")
        ts_ir = convert_to_ts_ir(universal)

        # Required top-level keys
        for key in (
            "schema_version", "meta", "topology", "symbols", "reels",
            "evaluation", "paytable", "features", "rng", "bet",
            "limits", "compliance", "rtp_allocation",
        ):
            self.assertIn(key, ts_ir, f"missing top-level key {key!r}")

        self.assertEqual(ts_ir["topology"]["kind"], "rectangular")
        self.assertEqual(ts_ir["topology"]["reels"], 5)
        self.assertEqual(ts_ir["topology"]["rows"], 4)

        # Symbols: 12 total, exactly one wild + one scatter
        kinds = [s["kind"] for s in ts_ir["symbols"]]
        self.assertEqual(len(ts_ir["symbols"]), 12)
        self.assertEqual(kinds.count("wild"), 1)
        self.assertEqual(kinds.count("scatter"), 1)

        # Paytable: WildWolf has 5/4/3 entries
        self.assertIn("WildWolf", ts_ir["paytable"])
        self.assertEqual(ts_ir["paytable"]["WildWolf"]["5"], 1000.0)
        self.assertEqual(ts_ir["paytable"]["WildWolf"]["4"], 200.0)
        self.assertEqual(ts_ir["paytable"]["WildWolf"]["3"], 50.0)

        # Linear progressive is intentionally OMITTED from TS features
        feat_kinds = [f["kind"] for f in ts_ir["features"]]
        self.assertIn("free_spins", feat_kinds)
        self.assertIn("pick", feat_kinds)  # Fort Knox bonus
        # Exactly 2 features expected (FS + FK pick) — no progressive
        self.assertEqual(len(ts_ir["features"]), 2)

        # Evaluation: 40 paylines preserved
        self.assertEqual(ts_ir["evaluation"]["kind"], "lines")
        self.assertEqual(len(ts_ir["evaluation"]["paylines"]), 40)

    def test_lw_converter_shape(self):
        profile = load_profile("lw")
        raw_dir = ROOT / "games/ce-copy-test/raw"
        parsed = parse_par(profile, raw_dir, sheet="PAR-001")
        universal = convert_to_slot_sim_ir(parsed, "lw")
        ts_ir = convert_to_ts_ir(universal)

        self.assertEqual(ts_ir["topology"], {"kind": "rectangular", "reels": 5, "rows": 3})
        # L&W has 20 paylines
        self.assertEqual(len(ts_ir["evaluation"]["paylines"]), 20)
        # FS reels emitted
        self.assertIn("free_spins", ts_ir["reels"])
        # Free spins feature present
        feat_kinds = [f["kind"] for f in ts_ir["features"]]
        self.assertIn("free_spins", feat_kinds)

    def test_substitutes_except_expansion(self):
        """Wild with `substitutes_except: ['Bonus']` should become explicit
        list of all symbols except Bonus."""
        profile = load_profile("igt")
        raw_dir = ROOT / "games/fort-knox-wolf-run/raw"
        parsed = parse_par(profile, raw_dir, sheet="PAR_001")
        universal = convert_to_slot_sim_ir(parsed, "igt")
        ts_ir = convert_to_ts_ir(universal)

        wild = next(s for s in ts_ir["symbols"] if s["kind"] == "wild")
        subs = wild.get("substitutes")
        # Must be an explicit list (W5.3 expansion of "*" + exceptions)
        self.assertIsInstance(subs, list)
        # Must NOT contain "Bonus"
        self.assertNotIn("Bonus", subs)
        # Must contain at least one HP (DarkWolf)
        self.assertIn("DarkWolf", subs)


class TestZodValidation(unittest.TestCase):
    """Zod schema validation via TS validator script."""

    def setUp(self):
        if not _has_npx():
            self.skipTest("npx not available — skip Zod validation")

    def _convert_and_validate(self, vendor: str, raw_subdir: str, sheet: str):
        profile = load_profile(vendor)
        parsed = parse_par(profile, ROOT / raw_subdir, sheet=sheet)
        universal = convert_to_slot_sim_ir(parsed, vendor)
        ts_ir = convert_to_ts_ir(universal)
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "out.ir.json"
            p.write_text(json.dumps(ts_ir, indent=2, ensure_ascii=False, default=str))
            ok, output = _validate_ts_ir_via_zod(p)
            self.assertTrue(ok, f"Zod validation failed:\n{output}")
            self.assertIn("valid SlotGameIR", output)

    def test_igt_zod_validation(self):
        self._convert_and_validate("igt", "games/fort-knox-wolf-run/raw", "PAR_001")

    def test_igt_par_002_zod_validation(self):
        self._convert_and_validate("igt", "games/fort-knox-wolf-run/raw", "PAR_002")

    def test_lw_zod_validation(self):
        self._convert_and_validate("lw", "games/ce-copy-test/raw", "PAR-001")


class TestCodegenArtifacts(unittest.TestCase):
    """End-to-end: slot-build --codegen-ts emits the full file set."""

    def setUp(self):
        if not _has_npx():
            self.skipTest("npx not available — skipping codegen smoke")

    def _run_codegen(self, raw_subdir: str, sheet: str, expected_swid: str, slug_prefix: str):
        with tempfile.TemporaryDirectory() as td:
            proc = subprocess.run(
                [
                    sys.executable, "-m", "tools.slot_build",
                    str(ROOT / raw_subdir),
                    "--sheet", sheet,
                    "--no-mc",
                    "--codegen-ts", td,
                    "--quiet",
                ],
                capture_output=True,
                text=True,
                cwd=str(ROOT),
                timeout=120,
            )
            self.assertEqual(proc.returncode, 0, f"slot-build failed: {proc.stderr}")
            slug = f"{slug_prefix}-{expected_swid}"
            ts_dir = Path(td) / slug / "ts"
            self.assertTrue(ts_dir.is_dir(), f"codegen dir missing: {ts_dir}")

            # All 5 artifacts present
            for fname in ("README.md", "package.json", "tsconfig.json", "runner.ts", f"{slug}.ir.json"):
                p = ts_dir / fname
                self.assertTrue(p.exists(), f"missing artifact {fname}")
                self.assertGreater(p.stat().st_size, 50, f"{fname} suspiciously small")

            # package.json deps include zod + tsx + typescript
            pkg = json.loads((ts_dir / "package.json").read_text())
            self.assertIn("zod", pkg["devDependencies"])
            self.assertIn("tsx", pkg["devDependencies"])
            self.assertIn("typescript", pkg["devDependencies"])

            # ir.json passes Zod validation
            ok, output = _validate_ts_ir_via_zod(ts_dir / f"{slug}.ir.json")
            self.assertTrue(ok, f"emitted IR failed Zod: {output}")

            # runner.ts smoke (3000 spins — fast)
            proc = subprocess.run(
                ["npx", "tsx", "runner.ts", "3000", "42"],
                capture_output=True,
                text=True,
                cwd=str(ts_dir),
                timeout=60,
            )
            self.assertEqual(proc.returncode, 0, f"runner.ts failed: {proc.stderr}")
            self.assertIn("RTP=", proc.stdout)
            self.assertIn("hitRate=", proc.stdout)

    def test_igt_codegen_end_to_end(self):
        self._run_codegen(
            "games/fort-knox-wolf-run/raw", "PAR_001",
            expected_swid="200-1775-001", slug_prefix="fort-knox-wolf-run",
        )

    def test_lw_codegen_end_to_end(self):
        self._run_codegen(
            "games/ce-copy-test/raw", "PAR-001",
            expected_swid="200-1637-001", slug_prefix="ce-copy-test",
        )


if __name__ == "__main__":
    unittest.main()
