"""W244 wave 56 — JSON schema validation za dossier + acceptance artefakte.

Catches structural drift in dossier files without external `jsonschema`
dependency. Each artefakt mora da ima:

  • schema (string)
  • merkle_root_sha256 (64-hex)
  • generated_at_utc (string)
  • specific kernel / dossier shape

Drift in shape = drift in audit trail = regulator finding. This gate
fails loud so we never ship a malformed dossier.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ACCEPT = ROOT / "reports" / "acceptance"
DOSSIER = ROOT / "reports" / "dossier"

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _is_str(v) -> bool:
    return isinstance(v, str) and len(v) > 0


def _is_hex64(v) -> bool:
    return isinstance(v, str) and HEX64.match(v) is not None


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _is_list(v) -> bool:
    return isinstance(v, list)


def _is_dict(v) -> bool:
    return isinstance(v, dict)


# Files whose shape is "composed / meta" rather than per-kernel.
# These follow their own schema and ARE shape-checked in their own
# test class below.
SPECIAL_FILES = {
    "DONE_UNIVERSAL_CLOSURE_KERNEL.json",
    "INVERSE_SOLVER_KERNEL.json",
    "RUST_PYTHON_PARITY_KERNEL.json",
    "SHOWCASE_GAME_KERNEL.json",
    "WASM_PYTHON_PARITY_KERNEL.json",
}


class TestKernelArtefactShape(unittest.TestCase):
    """Standard *_KERNEL.json files share a per-kernel shape."""

    REQUIRED_PER_KERNEL = {
        "schema": _is_str,
        "merkle_root_sha256": _is_hex64,
        "generated_at_utc": _is_str,
        "kernel": _is_str,
        "module": _is_str,
        "industry_pattern": _is_str,
        "fixtures_count": _is_int,
        "records": _is_list,
    }
    # Base shape every acceptance JSON must share (incl. meta files).
    REQUIRED_BASE = {
        "schema": _is_str,
        "merkle_root_sha256": _is_hex64,
        "generated_at_utc": _is_str,
    }

    def _standard_kernel_files(self):
        return [
            f for f in sorted(ACCEPT.glob("*_KERNEL.json"))
            if f.name not in SPECIAL_FILES
        ]

    def test_at_least_20_kernel_artifacts(self):
        files = sorted(ACCEPT.glob("*_KERNEL.json"))
        self.assertGreaterEqual(
            len(files), 20,
            f"expected at least 20 kernel JSONs, found {len(files)}",
        )

    def test_base_shape_present_in_every_kernel_json(self):
        broken = []
        for f in sorted(ACCEPT.glob("*_KERNEL.json")):
            try:
                d = json.loads(f.read_text())
            except json.JSONDecodeError as e:
                broken.append(f"{f.name}: bad JSON: {e}")
                continue
            for key, check in self.REQUIRED_BASE.items():
                if key not in d:
                    broken.append(f"{f.name}: missing base {key!r}")
                elif not check(d[key]):
                    broken.append(
                        f"{f.name}: base {key!r} type check failed",
                    )
        if broken:
            self.fail("Base shape violations:\n" + "\n".join(broken))

    def test_standard_kernel_files_have_per_kernel_shape(self):
        broken = []
        for f in self._standard_kernel_files():
            d = json.loads(f.read_text())
            for key, check in self.REQUIRED_PER_KERNEL.items():
                if key not in d:
                    broken.append(f"{f.name}: missing {key!r}")
                elif not check(d[key]):
                    broken.append(
                        f"{f.name}: {key!r} type check failed "
                        f"(got {type(d[key]).__name__})",
                    )
        if broken:
            self.fail(
                "Per-kernel shape violations:\n\n" + "\n".join(broken)
                + "\n\nIf this kernel is composed/meta, add it to "
                "SPECIAL_FILES and add a dedicated shape test.",
            )

    def test_fixtures_count_matches_records_len(self):
        broken = []
        for f in self._standard_kernel_files():
            d = json.loads(f.read_text())
            if "fixtures_count" in d and "records" in d:
                if d["fixtures_count"] != len(d["records"]):
                    broken.append(
                        f"{f.name}: fixtures_count={d['fixtures_count']} != "
                        f"len(records)={len(d['records'])}",
                    )
        if broken:
            self.fail("Counter mismatch:\n" + "\n".join(broken))


class TestSpecialMetaArtefactShape(unittest.TestCase):
    """Composed / meta acceptance JSONs have bespoke shapes — gated here."""

    def test_inverse_solver_kernel_shape(self):
        d = json.loads(
            (ACCEPT / "INVERSE_SOLVER_KERNEL.json").read_text()
        )
        for k in ("scenarios_count", "all_converged", "records"):
            self.assertIn(k, d)
        self.assertIsInstance(d["scenarios_count"], int)
        self.assertEqual(len(d["records"]), d["scenarios_count"])

    def test_rust_python_parity_shape(self):
        d = json.loads(
            (ACCEPT / "RUST_PYTHON_PARITY_KERNEL.json").read_text()
        )
        for k in ("kernels_checked", "kernels_match", "all_match",
                  "epsilon", "records"):
            self.assertIn(k, d)
        self.assertIsInstance(d["all_match"], bool)
        self.assertEqual(len(d["records"]), d["kernels_checked"])

    def test_showcase_game_shape(self):
        d = json.loads(
            (ACCEPT / "SHOWCASE_GAME_KERNEL.json").read_text()
        )
        for k in ("game_name", "topology", "kernels_composed",
                  "closed_form", "mc_round_trip_validation"):
            self.assertIn(k, d)

    def test_done_universal_closure_shape(self):
        d = json.loads(
            (ACCEPT / "DONE_UNIVERSAL_CLOSURE_KERNEL.json").read_text()
        )
        for k in ("done_universal_items_closed",
                  "both_ways_expanding_wild", "asymmetric_showcase"):
            self.assertIn(k, d)


class TestMasterDossierShape(unittest.TestCase):
    """W244_ALL_KERNELS.json meta dossier — strict shape."""

    def test_master_dossier_keys(self):
        d = json.loads((ACCEPT / "W244_ALL_KERNELS.json").read_text())
        required = {
            "schema": _is_str,
            "master_merkle_root_sha256": _is_hex64,
            "generated_at_utc": _is_str,
            "all_kernels_ok": lambda v: isinstance(v, bool),
            "kernels_total": _is_int,
            "kernels_ok": _is_int,
            "kernels_fail": _is_int,
            "total_fixtures": _is_int,
            "records": _is_list,
        }
        for key, check in required.items():
            self.assertIn(key, d, f"missing {key!r}")
            self.assertTrue(check(d[key]),
                            f"{key!r} type check failed: {d[key]!r}")

    def test_master_dossier_counters_consistent(self):
        d = json.loads((ACCEPT / "W244_ALL_KERNELS.json").read_text())
        self.assertEqual(
            d["kernels_ok"] + d["kernels_fail"], d["kernels_total"],
        )
        self.assertEqual(len(d["records"]), d["kernels_total"])


class TestBenchmarkDossierShape(unittest.TestCase):
    """W244_BENCHMARK_DOSSIER.json — strict shape."""

    def test_benchmark_dossier_keys(self):
        d = json.loads((ACCEPT / "W244_BENCHMARK_DOSSIER.json").read_text())
        required = {
            "schema": _is_str,
            "merkle_root_sha256": _is_hex64,
            "bench_count": _is_int,
            "fastest": _is_dict,
            "slowest": _is_dict,
            "all_sub_microsecond": lambda v: isinstance(v, bool),
            "records": _is_list,
        }
        for key, check in required.items():
            self.assertIn(key, d, f"missing {key!r}")
            self.assertTrue(check(d[key]),
                            f"{key!r} type check failed: {d[key]!r}")

    def test_benchmark_dossier_records_complete(self):
        d = json.loads((ACCEPT / "W244_BENCHMARK_DOSSIER.json").read_text())
        for rec in d["records"]:
            for key in ("group", "bench", "mean_ns", "ops_per_sec"):
                self.assertIn(key, rec, f"bench record missing {key}: {rec}")


class TestIndustryFirstsDossierShape(unittest.TestCase):
    """INDUSTRY_FIRST_DOSSIER.json — strict shape."""

    def test_ifs_dossier_keys(self):
        d = json.loads((DOSSIER / "INDUSTRY_FIRST_DOSSIER.json").read_text())
        for key in ("schema", "generatedAtUtc", "headline", "waves"):
            self.assertIn(key, d, f"missing {key!r}")
        self.assertIsInstance(d["waves"], list)
        self.assertGreater(len(d["waves"]), 80,
                           "expected ≥80 IF waves")

    def test_each_wave_has_industry_first(self):
        d = json.loads((DOSSIER / "INDUSTRY_FIRST_DOSSIER.json").read_text())
        missing_if = [
            w.get("wave", "?") for w in d["waves"]
            if not (w.get("industry_first") or "").strip()
        ]
        # Allow up to 10% incomplete (some early waves may lack IF text)
        self.assertLess(
            len(missing_if) / max(len(d["waves"]), 1), 0.15,
            f">15% of waves missing industry_first text: {missing_if[:5]}",
        )


if __name__ == "__main__":
    unittest.main()
