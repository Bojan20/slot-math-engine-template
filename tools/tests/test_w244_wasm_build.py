"""W244 wave 73 — slot-math-wasm build artifact smoke.

Verifies that the wasm-pack output produces expected files + exposes
the documented kernel functions. Heavy build step gated behind env var
so unit-test run stays fast; structural checks always active.
"""
from __future__ import annotations

import os
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PKG = ROOT / "packages" / "slot-math-wasm"
PKG_OUT = PKG / "pkg"


EXPECTED_EXPORTS = [
    "both_ways_rtp",
    "charge_meter_tier_rtp",
    "buy_feature_rtp",
    "buy_feature_ukgc_rts13c_pass",
    "buy_feature_mga_pass",
    "pay_anywhere_expected_pay",
    "binomialPmfGe",
    "wheel_rtp",
    "ways_total",
    "crash_probability_below",
]


class TestWasmCrateStructure(unittest.TestCase):
    def test_cargo_toml_exists(self):
        self.assertTrue((PKG / "Cargo.toml").exists())

    def test_lib_rs_exists(self):
        self.assertTrue((PKG / "src" / "lib.rs").exists())

    def test_readme_present(self):
        self.assertTrue((PKG / "README.md").exists())

    def test_license_present(self):
        self.assertTrue((PKG / "LICENSE").exists())

    def test_cargo_toml_declares_cdylib(self):
        text = (PKG / "Cargo.toml").read_text()
        self.assertIn('crate-type = ["cdylib", "rlib"]', text)
        self.assertIn("wasm-bindgen", text)

    def test_lib_rs_declares_all_expected_exports(self):
        text = (PKG / "src" / "lib.rs").read_text()
        for fn in EXPECTED_EXPORTS:
            # Either #[wasm_bindgen] attribute followed by pub fn, or
            # js_name override that maps to the JS export.
            self.assertTrue(
                f"pub fn {fn}(" in text
                or f'js_name = {fn})' in text,
                f"missing wasm-exposed function: {fn}",
            )


class TestWasmBuildArtefakti(unittest.TestCase):
    """Build artefakti present if `pkg/` exists (build was run).

    The wasm-pack build step itself isn't run in this test because it
    requires the `wasm32-unknown-unknown` rustup target + stable
    toolchain — both env-specific. CI workflow handles the build."""

    def test_pkg_dir_exists(self):
        if not PKG_OUT.exists():
            self.skipTest(
                "pkg/ not built — run `make wasm-build` first"
            )

    def test_wasm_binary_present(self):
        if not PKG_OUT.exists():
            self.skipTest("pkg/ not built")
        wasm_files = list(PKG_OUT.glob("*.wasm"))
        self.assertGreater(len(wasm_files), 0)

    def test_js_wrapper_present(self):
        if not PKG_OUT.exists():
            self.skipTest("pkg/ not built")
        self.assertTrue((PKG_OUT / "slot_math_wasm.js").exists())

    def test_ts_typings_present(self):
        if not PKG_OUT.exists():
            self.skipTest("pkg/ not built")
        self.assertTrue((PKG_OUT / "slot_math_wasm.d.ts").exists())

    def test_js_wrapper_exports_all_kernels(self):
        if not PKG_OUT.exists():
            self.skipTest("pkg/ not built")
        js = (PKG_OUT / "slot_math_wasm.js").read_text()
        for fn in EXPECTED_EXPORTS:
            self.assertIn(
                fn, js, f"JS wrapper missing export {fn}",
            )

    def test_dts_declares_all_kernels(self):
        if not PKG_OUT.exists():
            self.skipTest("pkg/ not built")
        dts = (PKG_OUT / "slot_math_wasm.d.ts").read_text()
        for fn in EXPECTED_EXPORTS:
            self.assertIn(
                fn, dts, f".d.ts missing export {fn}",
            )


class TestWasmCargoTests(unittest.TestCase):
    """Run native cargo test on the wasm crate to verify math."""

    def test_native_cargo_tests_pass(self):
        if not os.environ.get("SLOT_RUN_CARGO_WASM_TESTS"):
            self.skipTest(
                "set SLOT_RUN_CARGO_WASM_TESTS=1 to run cargo tests "
                "(takes ~5s)"
            )
        env = {**os.environ, "RUSTUP_TOOLCHAIN": "stable"}
        r = subprocess.run(
            ["cargo", "test", "--release"],
            capture_output=True, text=True, cwd=str(PKG),
            env=env, timeout=120,
        )
        self.assertEqual(
            r.returncode, 0,
            f"wasm crate cargo test failed:\n{r.stdout}\n{r.stderr}",
        )
        # Look for the standard "test result: ok" line
        self.assertIn("test result: ok", r.stdout)


if __name__ == "__main__":
    unittest.main()
