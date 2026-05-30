"""W244 wave 55 — slot-math-kernels public API contract test.

The PyPI package `slot-math-kernels` has downstream consumers (math
designers, regulator labs, audit firms) who pin to specific function
signatures + dataclass field names. ANY breaking change must be:

  1. Caught by this test (fail loudly in CI)
  2. Treated as a MAJOR semver bump (2.0.0 not 1.x.x)
  3. Documented in CHANGELOG.md under "Breaking changes"

This test reads `packages/slot-math-kernels/API_SURFACE.json` — the
committed contract snapshot — and verifies the live package exposes
EVERY documented symbol with EXACTLY the documented parameter names.

To intentionally evolve the contract:
  1. Add/remove the symbol or update its params in source.
  2. Run `python3 tools/refresh_api_surface.py` (regenerates snapshot).
  3. Review the JSON diff carefully.
  4. Bump version in `pyproject.toml` (MAJOR for breaks).
  5. Document in CHANGELOG.md.
  6. Commit both source + refreshed snapshot together.

This is the "downstream-installer trust contract" — auditors and
external users rely on the snapshot to know what they're consuming.
"""
from __future__ import annotations

import importlib
import importlib.util
import inspect
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PKG_SRC = ROOT / "packages" / "slot-math-kernels" / "src"
CONTRACT = ROOT / "packages" / "slot-math-kernels" / "API_SURFACE.json"


def _load_package_isolated():
    """Import slot_math_kernels from vendored src only — no monorepo."""
    sys_path_orig = sys.path[:]
    mods_orig = {
        k: sys.modules[k] for k in list(sys.modules)
        if k.startswith(("slot_math_kernels", "tools.math_dsl"))
    }
    for k in list(sys.modules):
        if k.startswith(("slot_math_kernels", "tools.math_dsl")):
            del sys.modules[k]
    sys.path[:] = [str(PKG_SRC)] + [
        p for p in sys.path
        if "slot-math-engine-template" not in p
    ]
    return sys_path_orig, mods_orig


def _restore_imports(sys_path_orig, mods_orig):
    for k in list(sys.modules):
        if k.startswith(("slot_math_kernels", "tools.math_dsl")):
            del sys.modules[k]
    sys.path[:] = sys_path_orig
    sys.modules.update(mods_orig)


class TestApiContract(unittest.TestCase):
    """Public surface of slot-math-kernels package MUST match snapshot."""

    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(CONTRACT.read_text())
        cls._orig_path, cls._orig_mods = _load_package_isolated()
        cls.smk = importlib.import_module("slot_math_kernels")

    @classmethod
    def tearDownClass(cls):
        _restore_imports(cls._orig_path, cls._orig_mods)

    def test_contract_kernel_count(self):
        """Contract must enumerate all 22 kernel modules."""
        self.assertEqual(len(self.contract), 22)

    def test_all_kernels_in___all__(self):
        """Every contract kernel must be in slot_math_kernels.__all__."""
        for kernel_name in self.contract:
            self.assertIn(
                kernel_name, self.smk.__all__,
                f"contract kernel {kernel_name} missing from __all__",
            )

    def test_each_kernel_module_exists(self):
        for kernel_name in self.contract:
            mod = getattr(self.smk, kernel_name, None)
            self.assertIsNotNone(
                mod, f"contract kernel {kernel_name} not importable",
            )

    def test_class_signatures_match_contract(self):
        """Each documented dataclass must exist + expose documented fields."""
        broken = []
        for kernel_name, spec in self.contract.items():
            mod = getattr(self.smk, kernel_name)
            for cls_name, expected_fields in spec.get("classes", {}).items():
                cls = getattr(mod, cls_name, None)
                if cls is None:
                    broken.append(f"{kernel_name}.{cls_name}: missing class")
                    continue
                if not hasattr(cls, "__dataclass_fields__"):
                    broken.append(
                        f"{kernel_name}.{cls_name}: not a dataclass anymore",
                    )
                    continue
                actual_fields = list(cls.__dataclass_fields__.keys())
                if actual_fields != expected_fields:
                    broken.append(
                        f"{kernel_name}.{cls_name}: fields drift\n"
                        f"  expected: {expected_fields}\n"
                        f"  actual:   {actual_fields}",
                    )
        if broken:
            self.fail(
                "API contract violations (class fields):\n\n"
                + "\n".join(broken)
                + "\n\nIf intentional: refresh API_SURFACE.json + bump "
                "MAJOR semver + document in CHANGELOG.md.",
            )

    def test_function_signatures_match_contract(self):
        """Each documented function must exist + accept documented params."""
        broken = []
        for kernel_name, spec in self.contract.items():
            mod = getattr(self.smk, kernel_name)
            for fn_name, expected_params in spec.get("functions", {}).items():
                fn = getattr(mod, fn_name, None)
                if fn is None:
                    broken.append(f"{kernel_name}.{fn_name}: missing function")
                    continue
                try:
                    actual = list(inspect.signature(fn).parameters.keys())
                except (ValueError, TypeError) as e:
                    broken.append(
                        f"{kernel_name}.{fn_name}: signature unreadable: {e}",
                    )
                    continue
                if actual != expected_params:
                    broken.append(
                        f"{kernel_name}.{fn_name}: param drift\n"
                        f"  expected: {expected_params}\n"
                        f"  actual:   {actual}",
                    )
        if broken:
            self.fail(
                "API contract violations (function params):\n\n"
                + "\n".join(broken)
                + "\n\nIf intentional: refresh API_SURFACE.json + bump "
                "MAJOR semver + document in CHANGELOG.md.",
            )


if __name__ == "__main__":
    unittest.main()
