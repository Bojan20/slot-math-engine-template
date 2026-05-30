"""W244 wave 77 — slot-math-wasm TypeScript wrapper structural smoke."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TS_DIR = ROOT / "packages" / "slot-math-wasm" / "ts"


class TestWasmTsWrapper(unittest.TestCase):

    def test_ts_dir_exists(self):
        self.assertTrue(TS_DIR.is_dir())

    def test_index_ts_present(self):
        self.assertTrue((TS_DIR / "index.ts").exists())

    def test_readme_present(self):
        self.assertTrue((TS_DIR / "README.md").exists())

    def test_namespaces_exported(self):
        text = (TS_DIR / "index.ts").read_text(encoding="utf-8")
        for ns in ("export const rtp", "export const compliance",
                   "export const helpers"):
            self.assertIn(ns, text, f"missing export: {ns}")

    def test_init_promise_exported(self):
        text = (TS_DIR / "index.ts").read_text(encoding="utf-8")
        self.assertIn("export async function initWasm", text)
        # Default export bundles initWasm
        self.assertIn("export default", text)

    def test_wrapper_calls_all_wasm_exports(self):
        """TS wrapper must invoke every public wasm function."""
        text = (TS_DIR / "index.ts").read_text(encoding="utf-8")
        WASM_EXPORTS = [
            "wasm.both_ways_rtp",
            "wasm.charge_meter_tier_rtp",
            "wasm.buy_feature_rtp",
            "wasm.buy_feature_ukgc_rts13c_pass",
            "wasm.buy_feature_mga_pass",
            "wasm.pay_anywhere_expected_pay",
            "wasm.binomialPmfGe",
            "wasm.wheel_rtp",
            "wasm.ways_total",
            "wasm.crash_probability_below",
        ]
        for fn in WASM_EXPORTS:
            self.assertIn(
                fn, text, f"TS wrapper missing call to {fn}",
            )


if __name__ == "__main__":
    unittest.main()
