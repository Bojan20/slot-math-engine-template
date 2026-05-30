"""W244 wave 74 — wasm ↔ Python parity acceptance verification.

Verifies the wasm-python parity JSON artefakt:
  • All fixtures PASS (no failures)
  • Max ULP delta ≤ epsilon (1e-12 default)
  • Merkle root re-derives from canonical leaf stream
  • At least 5 kernels covered
"""
from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ARTEFAKT = ROOT / "reports" / "acceptance" / "WASM_PYTHON_PARITY_KERNEL.json"


class TestWasmPythonParity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        if not ARTEFAKT.exists():
            raise unittest.SkipTest(
                "WASM_PYTHON_PARITY_KERNEL.json not built — run "
                "`make wasm-parity`"
            )
        cls.d = json.loads(ARTEFAKT.read_text())

    def test_schema_and_merkle(self):
        self.assertEqual(self.d["schema"], "wasm-python-parity/v1")
        m = self.d["merkle_root_sha256"]
        self.assertEqual(len(m), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in m))

    def test_all_match(self):
        self.assertTrue(
            self.d["all_match"],
            f"Fail count: {self.d['fail_count']}",
        )
        self.assertEqual(self.d["fail_count"], 0)

    def test_max_delta_within_epsilon(self):
        max_delta = self.d["max_observed_delta"]
        epsilon = self.d["epsilon"]
        self.assertLessEqual(
            max_delta, epsilon,
            f"max delta {max_delta:.3e} exceeds epsilon {epsilon}",
        )

    def test_at_least_5_kernels_covered(self):
        self.assertGreaterEqual(
            len(self.d["kernels_covered"]), 5,
            f"only {len(self.d['kernels_covered'])} kernels covered",
        )

    def test_merkle_matches_leaf_recompute(self):
        leaf_lines = "".join(
            f"{r['kernel']}|{r['fixture']}|{r['wasm_value']!r}\n"
            for r in self.d["records"]
        )
        expected = hashlib.sha256(leaf_lines.encode("utf-8")).hexdigest()
        self.assertEqual(expected, self.d["merkle_root_sha256"])

    def test_every_record_has_required_fields(self):
        for r in self.d["records"]:
            for k in ("kernel", "fixture", "wasm_fn", "python_value",
                      "wasm_value", "delta", "pass"):
                self.assertIn(k, r, f"record missing {k}: {r}")


if __name__ == "__main__":
    unittest.main()
