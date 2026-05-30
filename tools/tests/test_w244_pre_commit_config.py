"""W244 wave 65 — .pre-commit-config.yaml structure + local hooks validation.

Ensures pre-commit config is loadable + local hook commands resolve to
real targets (not dangling paths). Without this gate, a broken config
silently disables protection.
"""
from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CFG = ROOT / ".pre-commit-config.yaml"


def _load_yaml():
    try:
        import yaml
    except ImportError:
        raise unittest.SkipTest("PyYAML not installed")
    return yaml.safe_load(CFG.read_text())


class TestPreCommitConfig(unittest.TestCase):
    def test_config_exists(self):
        self.assertTrue(CFG.exists(), "missing .pre-commit-config.yaml")

    def test_config_parses(self):
        d = _load_yaml()
        self.assertIn("repos", d)
        self.assertGreater(len(d["repos"]), 0)

    def test_has_local_w244_hooks(self):
        d = _load_yaml()
        local_repos = [r for r in d["repos"] if r.get("repo") == "local"]
        self.assertGreaterEqual(
            len(local_repos), 1, "no local repos defined",
        )
        local_hook_ids = {
            h["id"] for r in local_repos for h in r["hooks"]
        }
        self.assertIn("w244-health", local_hook_ids)
        self.assertIn("w244-api-contract", local_hook_ids)

    def test_local_hook_files_patterns_valid_regex(self):
        d = _load_yaml()
        for repo in d["repos"]:
            if repo.get("repo") != "local":
                continue
            for hook in repo["hooks"]:
                files_pat = hook.get("files")
                if not files_pat:
                    continue
                try:
                    re.compile(files_pat, re.VERBOSE)
                except re.error as e:
                    self.fail(
                        f"hook {hook['id']}: bad regex {files_pat!r}: {e}",
                    )

    def test_w244_health_script_exists_and_runs(self):
        """The local w244-health hook entry must be a working script."""
        script = ROOT / "tools" / "w244_health.py"
        self.assertTrue(script.exists(), f"missing {script}")
        r = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True, text=True, cwd=str(ROOT), timeout=30,
        )
        self.assertEqual(
            r.returncode, 0,
            f"health probe failed:\n{r.stdout}\n{r.stderr}",
        )

    def test_api_contract_test_file_exists(self):
        """The local w244-api-contract hook references a real pytest target."""
        t = ROOT / "tools" / "tests" / "test_w244_pypi_api_contract.py"
        self.assertTrue(t.exists(), f"missing {t}")

    def test_ruff_hook_present(self):
        d = _load_yaml()
        repos = [r.get("repo", "") for r in d["repos"]]
        # ruff-pre-commit official repo
        has_ruff = any("ruff" in r for r in repos)
        self.assertTrue(has_ruff, "no ruff hook configured")


if __name__ == "__main__":
    unittest.main()
