"""W244 wave 50 — verifies `packages/slot-math-kernels/` standalone integrity.

The PyPI distribution lives at `packages/slot-math-kernels/` with 22
kernel modules **vendored** (copied from `tools/math_dsl/`) so that
`pip install slot-math-kernels` works without the monorepo present.

This test must run from the monorepo and:
  1. Verifies all 22 vendored modules exist + are importable from the
     `slot_math_kernels` package using ONLY the package's own `src/`
     path (no `tools/math_dsl` fallback).
  2. Spot-checks that the vendored copy is byte-identical to the
     `tools/math_dsl/` source (modulo the relative-import rewrites for
     `both_ways_expanding_wild` and `hold_and_win`).

If this test fails, the published wheel will be broken — keep it green
or `slot-math-kernels` on PyPI will not be `pip install`able.
"""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PKG_SRC = ROOT / "packages" / "slot-math-kernels" / "src"
MONOREPO_KERNELS = ROOT / "tools" / "math_dsl"

VENDORED_MODULES = [
    "asymmetric_paytable", "both_ways", "both_ways_expanding_wild",
    "buy_feature", "cascade", "charge_meter", "cluster_pays",
    "crash_kernel", "expanding_symbol", "hold_and_win",
    "inverse_solver", "money_collect", "multi_dim_inverse_solver",
    "must_hit_by", "pay_anywhere", "persistent_multiplier", "pick_chain",
    "stacked_wilds", "state_machine", "sticky_wilds", "ways_evaluator",
    "wheel",
]

# Modules whose imports were rewritten from `tools.math_dsl.X` to `.X`
# during vendoring (wave 50). These will differ byte-wise.
REWRITTEN_MODULES = {"both_ways_expanding_wild", "hold_and_win"}


class TestVendoredPackageStandalone(unittest.TestCase):
    """The vendored package must import cleanly without `tools/` on path."""

    def test_all_22_modules_exist_in_vendored_src(self):
        for mod_name in VENDORED_MODULES:
            mod_path = PKG_SRC / "slot_math_kernels" / f"{mod_name}.py"
            self.assertTrue(mod_path.exists(), f"missing: {mod_path}")

    def test_init_exposes_22_modules(self):
        init = PKG_SRC / "slot_math_kernels" / "__init__.py"
        text = init.read_text()
        for mod_name in VENDORED_MODULES:
            self.assertIn(mod_name, text, f"missing {mod_name} in __init__")

    def test_standalone_import_without_monorepo_tools(self):
        """Verify `slot_math_kernels` imports with ONLY its own src on path."""
        # Set up isolated import path: vendored package src only, no tools/
        clean_path = [str(PKG_SRC)] + [
            p for p in sys.path
            if "slot-math-engine-template" not in p
        ]
        # Save state, swap path, import, restore
        original_path = sys.path[:]
        original_modules = {
            k: sys.modules[k] for k in list(sys.modules)
            if k.startswith(("slot_math_kernels", "tools.math_dsl"))
        }
        for k in list(sys.modules):
            if k.startswith(("slot_math_kernels", "tools.math_dsl")):
                del sys.modules[k]
        try:
            sys.path[:] = clean_path
            spec = importlib.util.find_spec("slot_math_kernels")
            self.assertIsNotNone(spec, "vendored package not findable")
            mod = importlib.import_module("slot_math_kernels")
            self.assertEqual(len(mod.__all__), 22)
            # Smoke test charge_meter end-to-end
            cm = mod.charge_meter
            params = cm.ChargeMeterParams(
                expected_charge_per_spin=0.5,
                tiers=(cm.ChargeTier(
                    "classic", threshold=50.0, award_value_x_bet=10.0,
                ),),
            )
            r = cm.charge_meter_rtp(params)
            self.assertAlmostEqual(r["rtp_contribution"], 0.10, places=10)
        finally:
            sys.path[:] = original_path
            for k in list(sys.modules):
                if k.startswith(("slot_math_kernels", "tools.math_dsl")):
                    del sys.modules[k]
            sys.modules.update(original_modules)


class TestVendoredCopyDrift(unittest.TestCase):
    """Detect drift between monorepo source and vendored copy.

    For non-rewritten modules: byte-identical match required.
    For rewritten modules: structural delta limited to the import lines.
    """

    def test_non_rewritten_modules_byte_identical(self):
        for mod_name in VENDORED_MODULES:
            if mod_name in REWRITTEN_MODULES:
                continue
            mono = (MONOREPO_KERNELS / f"{mod_name}.py").read_text()
            vendored = (
                PKG_SRC / "slot_math_kernels" / f"{mod_name}.py"
            ).read_text()
            self.assertEqual(
                mono, vendored,
                f"DRIFT in {mod_name}.py — monorepo and vendored copy "
                "differ. Re-run wave 50 vendoring or sync manually.",
            )

    def test_rewritten_modules_minimal_delta(self):
        """Rewritten modules differ only in import-prefix change."""
        for mod_name in REWRITTEN_MODULES:
            mono = (MONOREPO_KERNELS / f"{mod_name}.py").read_text()
            vendored = (
                PKG_SRC / "slot_math_kernels" / f"{mod_name}.py"
            ).read_text()
            # Replicate the rewrite forward, expect equality
            mono_rewritten = (
                mono
                .replace("from tools.math_dsl.both_ways ", "from .both_ways ")
                .replace(
                    "from tools.math_dsl.expanding_symbol ",
                    "from .expanding_symbol ",
                )
                .replace(
                    "from tools.math_dsl.money_collect ",
                    "from .money_collect ",
                )
                .replace(
                    "from tools.math_dsl.must_hit_by ",
                    "from .must_hit_by ",
                )
            )
            self.assertEqual(
                mono_rewritten, vendored,
                f"DRIFT in {mod_name}.py beyond expected import rewrite",
            )


if __name__ == "__main__":
    unittest.main()
