"""P5.9 — Studio E2E Playwright codegen tests."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path

from tools.studio_e2e.emitter import write_studio_e2e, _safe_slug


class SafeSlugTest(unittest.TestCase):
    def test_replaces_unsafe_chars(self):
        self.assertEqual(_safe_slug("Demo Game!@#"), "Demo-Game---")

    def test_preserves_alnum_and_dashes(self):
        self.assertEqual(_safe_slug("good_slug-1"), "good_slug-1")


class EmitterLayoutTest(unittest.TestCase):
    def test_emits_full_suite_layout(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            artifacts = write_studio_e2e(td, slug="demo-game")
            self.assertTrue(artifacts.config_path.exists())
            self.assertTrue(artifacts.package_json.exists())
            self.assertTrue(artifacts.tsconfig_json.exists())
            self.assertTrue(artifacts.spec_path.exists())
            self.assertTrue(artifacts.readme.exists())
            self.assertEqual(
                artifacts.spec_path.parent.name, "tests"
            )

    def test_package_json_is_parseable(self):
        with tempfile.TemporaryDirectory() as td:
            artifacts = write_studio_e2e(Path(td), slug="g-1")
            pkg = json.loads(artifacts.package_json.read_text())
            self.assertIn("@playwright/test", pkg["devDependencies"])
            self.assertIn("typescript", pkg["devDependencies"])
            self.assertEqual(pkg["scripts"]["test"], "playwright test")

    def test_spec_has_expected_test_blocks(self):
        with tempfile.TemporaryDirectory() as td:
            artifacts = write_studio_e2e(Path(td), slug="demo")
            spec = artifacts.spec_path.read_text()
            self.assertIn("test.describe('Studio · demo'", spec)
            self.assertIn("'loads without console errors'", spec)
            self.assertIn("'spin button advances spin counter'", spec)
            self.assertIn("'paytable + reel matrix render'", spec)
            self.assertIn("'rtp ticker has a numeric value'", spec)

    def test_config_uses_chromium(self):
        with tempfile.TemporaryDirectory() as td:
            artifacts = write_studio_e2e(Path(td), slug="demo")
            cfg = artifacts.config_path.read_text()
            self.assertIn("chromium", cfg)
            self.assertIn("Desktop Chrome", cfg)
            self.assertIn("STUDIO_BASE_URL", cfg)

    def test_tsconfig_is_valid_json(self):
        with tempfile.TemporaryDirectory() as td:
            artifacts = write_studio_e2e(Path(td), slug="demo")
            data = json.loads(artifacts.tsconfig_json.read_text())
            self.assertTrue(data["compilerOptions"]["strict"])

    def test_readme_mentions_npx(self):
        with tempfile.TemporaryDirectory() as td:
            artifacts = write_studio_e2e(Path(td), slug="demo")
            self.assertIn("npx playwright test",
                          artifacts.readme.read_text())


class DeterminismTest(unittest.TestCase):
    def test_emit_is_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            a = write_studio_e2e(td / "a", slug="g")
            b = write_studio_e2e(td / "b", slug="g")
            self.assertEqual(
                a.spec_path.read_bytes(),
                b.spec_path.read_bytes(),
            )
            self.assertEqual(
                a.config_path.read_bytes(),
                b.config_path.read_bytes(),
            )


class CliTest(unittest.TestCase):
    def test_cli_smoke(self):
        from tools.studio_e2e.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            rc = main([
                "--out", str(td / "suite"),
                "--slug", "cli-demo",
                "--json",
            ])
            self.assertEqual(rc, 0)
            self.assertTrue((td / "suite" / "playwright.config.ts").exists())


class SpecSyntaxSmokeTest(unittest.TestCase):
    def test_spec_has_no_obvious_syntax_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            artifacts = write_studio_e2e(Path(td), slug="demo")
            spec = artifacts.spec_path.read_text()
            # Catch leftover `$slug` template variables in output.
            self.assertNotIn("$slug", spec)
            # Catch unbalanced curly braces (rough sanity).
            self.assertEqual(spec.count("{"), spec.count("}"))


if __name__ == "__main__":
    unittest.main()
