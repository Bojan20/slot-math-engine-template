"""W244 wave 34 — Python ↔ Rust parity pytest gate.

Skipped if Rust binary not built; otherwise asserts byte-equivalence
between Python and Rust kernel implementations.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

RUST_BIN = ROOT / "target" / "release" / "kernel_parity"


@unittest.skipUnless(
    RUST_BIN.exists(),
    f"Rust binary missing at {RUST_BIN}; "
    f"run `cd rust-sim && cargo build --release --bin kernel_parity`",
)
class TestRustPythonParity(unittest.TestCase):
    """Parity gate: every Python kernel matches Rust port byte-stable."""

    def test_all_5_kernels_parity_ok(self):
        """One round of parity check; assert all 5 kernels match within ULP."""
        from tools.parity.w244_rust_python_parity import (
            EPS, KERNELS, _compare_rtp, _run_rust,
        )
        for kernel, fixture_fn, py_runner in KERNELS:
            py_params, rust_params = fixture_fn()
            py_result = py_runner(py_params)
            rust_result = _run_rust(kernel, rust_params)
            cmp = _compare_rtp(py_result, rust_result, kernel)
            self.assertEqual(cmp["status"], "OK",
                             f"{kernel}: status={cmp['status']} "
                             f"py={cmp['py_rtp']} rust={cmp['rust_rtp']} "
                             f"delta={cmp.get('delta', 'NA')}")
            self.assertLess(cmp["delta"], EPS,
                            f"{kernel}: delta {cmp['delta']} ≥ EPS {EPS}")


if __name__ == "__main__":
    unittest.main()
