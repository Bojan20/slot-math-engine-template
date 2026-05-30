"""W244 wave 75 — wasm-parity CI workflow YAML structure validation."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WF = ROOT / ".github" / "workflows" / "wasm-parity.yml"


def _load_yaml():
    try:
        import yaml
    except ImportError:
        raise unittest.SkipTest("PyYAML not installed")
    return yaml.safe_load(WF.read_text())


class TestWasmParityWorkflow(unittest.TestCase):
    def test_workflow_exists(self):
        self.assertTrue(WF.exists())

    def test_workflow_yaml_parses(self):
        d = _load_yaml()
        self.assertIn("jobs", d)
        self.assertIn("wasm-parity", d["jobs"])

    def test_has_required_steps(self):
        d = _load_yaml()
        steps = d["jobs"]["wasm-parity"]["steps"]
        step_names = [s.get("name", "") for s in steps]
        # Critical steps must be present
        required = [
            "Install Rust",
            "wasm-pack",
            "Build wasm",
            "wasm ↔ Python parity",
        ]
        for r in required:
            self.assertTrue(
                any(r in n for n in step_names),
                f"missing step containing '{r}':\n  "
                + "\n  ".join(step_names),
            )

    def test_triggers_on_relevant_paths(self):
        d = _load_yaml()
        # YAML parses `on:` as Python bool `True` when key is unquoted in
        # some PyYAML versions. Handle both keys.
        on_block = d.get("on") or d.get(True)
        self.assertIsNotNone(on_block, "no `on:` block")
        push_paths = on_block.get("push", {}).get("paths", [])
        # Critical path patterns
        required_patterns = [
            "packages/slot-math-wasm/**",
            "tools/parity/w244_wasm_python_parity.py",
        ]
        for pat in required_patterns:
            self.assertIn(
                pat, push_paths,
                f"missing path trigger: {pat}",
            )


if __name__ == "__main__":
    unittest.main()
