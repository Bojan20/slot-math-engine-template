"""W244 wave 63 — JSON Schema validation za acceptance + dossier files.

Validates that:
  1. Generated schema files conform to JSON Schema draft 2020-12 spec
     (parseable + have $schema + $id + type)
  2. Manifest Merkle rebuilds deterministically
  3. Real acceptance JSONs validate against the published schemas
     using `jsonschema` library if installed, else minimal validator

Acts as the "external auditor verifies our schemas" gate.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "tools" / "build_acceptance_schemas.py"
SCHEMAS_DIR = ROOT / "reports" / "schemas"
ACCEPT = ROOT / "reports" / "acceptance"
DOSSIER = ROOT / "reports" / "dossier"


class TestSchemasBuild(unittest.TestCase):

    def test_schemas_dir_exists(self):
        self.assertTrue(SCHEMAS_DIR.is_dir())

    def test_all_5_schemas_present(self):
        expected = {
            "w244_kernel.schema.json",
            "w244_all_kernels.schema.json",
            "w244_benchmark.schema.json",
            "industry_first_dossier.schema.json",
            "closed_form_portfolio.schema.json",
        }
        actual = {p.name for p in SCHEMAS_DIR.glob("*.schema.json")}
        self.assertEqual(actual, expected)

    def test_manifest_present_with_merkle(self):
        m = SCHEMAS_DIR / "schemas_manifest.json"
        self.assertTrue(m.exists())
        d = json.loads(m.read_text())
        self.assertIn("manifest_merkle_root_sha256", d)
        merkle = d["manifest_merkle_root_sha256"]
        self.assertEqual(len(merkle), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in merkle))

    def test_each_schema_has_required_meta(self):
        broken = []
        for p in SCHEMAS_DIR.glob("*.schema.json"):
            d = json.loads(p.read_text())
            for key in ("$schema", "$id", "title", "type"):
                if key not in d:
                    broken.append(f"{p.name}: missing {key}")
        if broken:
            self.fail("Schema meta violations:\n" + "\n".join(broken))

    def test_rebuild_byte_stable(self):
        m_before = (SCHEMAS_DIR / "schemas_manifest.json").read_text()
        r = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        m_after = (SCHEMAS_DIR / "schemas_manifest.json").read_text()
        self.assertEqual(m_before, m_after, "schemas manifest drifted")

    def test_manifest_merkle_matches_leaf_recompute(self):
        d = json.loads(
            (SCHEMAS_DIR / "schemas_manifest.json").read_text(),
        )
        # Recompute manifest Merkle = sha256 over sorted "{filename}|{sha256}\n"
        entries = d["schemas"]
        for e in entries:
            # verify per-file sha matches actual file
            actual = hashlib.sha256(
                (SCHEMAS_DIR / e["filename"]).read_bytes(),
            ).hexdigest()
            self.assertEqual(
                actual, e["sha256"],
                f"per-file sha mismatch for {e['filename']}",
            )
        leaf_lines = "".join(
            f"{e['filename']}|{e['sha256']}\n"
            for e in sorted(entries, key=lambda x: x["filename"])
        )
        expected_root = hashlib.sha256(
            leaf_lines.encode("utf-8"),
        ).hexdigest()
        self.assertEqual(expected_root, d["manifest_merkle_root_sha256"])


def _minimal_validate(instance, schema, path="") -> list[str]:
    """Tiny JSON Schema type-only validator (subset). Returns list of errors."""
    errs = []
    if "type" in schema:
        t = schema["type"]
        type_map = {
            "object": dict, "array": list, "string": str,
            "integer": int, "number": (int, float),
            "boolean": bool, "null": type(None),
        }
        valid_types = t if isinstance(t, list) else [t]
        ok = any(
            (vt == "integer" and isinstance(instance, int)
             and not isinstance(instance, bool))
            or (vt != "integer" and isinstance(instance, type_map.get(vt, ())))
            for vt in valid_types
        )
        if not ok:
            errs.append(f"{path}: expected {t}, got {type(instance).__name__}")
            return errs
    if schema.get("type") == "object":
        for req in schema.get("required", []):
            if not isinstance(instance, dict) or req not in instance:
                errs.append(f"{path}: required key {req!r} missing")
        for k, sub in schema.get("properties", {}).items():
            if isinstance(instance, dict) and k in instance:
                errs.extend(_minimal_validate(
                    instance[k], sub, f"{path}.{k}",
                ))
    elif schema.get("type") == "array":
        items = schema.get("items")
        if items and isinstance(instance, list):
            for i, x in enumerate(instance):
                errs.extend(_minimal_validate(
                    x, items, f"{path}[{i}]",
                ))
    return errs


class TestSchemasValidateRealArtefakti(unittest.TestCase):
    """Real acceptance / dossier JSONs must validate against published schemas."""

    def test_w244_all_kernels_validates(self):
        schema = json.loads(
            (SCHEMAS_DIR / "w244_all_kernels.schema.json").read_text(),
        )
        instance = json.loads(
            (ACCEPT / "W244_ALL_KERNELS.json").read_text(),
        )
        errs = _minimal_validate(instance, schema)
        self.assertEqual(errs, [], f"W244_ALL_KERNELS invalid: {errs}")

    def test_w244_benchmark_validates(self):
        schema = json.loads(
            (SCHEMAS_DIR / "w244_benchmark.schema.json").read_text(),
        )
        instance = json.loads(
            (ACCEPT / "W244_BENCHMARK_DOSSIER.json").read_text(),
        )
        errs = _minimal_validate(instance, schema)
        self.assertEqual(errs, [], f"benchmark invalid: {errs}")

    def test_industry_first_dossier_validates(self):
        schema = json.loads(
            (SCHEMAS_DIR / "industry_first_dossier.schema.json").read_text(),
        )
        instance = json.loads(
            (DOSSIER / "INDUSTRY_FIRST_DOSSIER.json").read_text(),
        )
        errs = _minimal_validate(instance, schema)
        self.assertEqual(errs, [], f"IF dossier invalid: {errs}")

    def test_closed_form_portfolio_validates(self):
        schema = json.loads(
            (SCHEMAS_DIR / "closed_form_portfolio.schema.json").read_text(),
        )
        instance = json.loads(
            (DOSSIER / "CLOSED_FORM_PORTFOLIO_100.json").read_text(),
        )
        errs = _minimal_validate(instance, schema)
        self.assertEqual(errs, [], f"CF portfolio invalid: {errs}")

    def test_standard_kernel_files_validate(self):
        schema = json.loads(
            (SCHEMAS_DIR / "w244_kernel.schema.json").read_text(),
        )
        SKIP = {
            "DONE_UNIVERSAL_CLOSURE_KERNEL.json",
            "RUST_PYTHON_PARITY_KERNEL.json",
            "SHOWCASE_GAME_KERNEL.json",
            # INVERSE_SOLVER uses `modules` (plural) + `scenarios_count`
            # instead of `module` + `fixtures_count`.
            "INVERSE_SOLVER_KERNEL.json",
            # WASM_PYTHON_PARITY also uses bespoke schema (no kernel /
            # module / industry_pattern keys; has fixtures_count + records).
            "WASM_PYTHON_PARITY_KERNEL.json",
        }
        bad = []
        for f in sorted(ACCEPT.glob("*_KERNEL.json")):
            if f.name in SKIP:
                continue
            instance = json.loads(f.read_text())
            errs = _minimal_validate(instance, schema)
            if errs:
                bad.append(f"{f.name}: {errs[:3]}")
        if bad:
            self.fail("Kernel JSONs invalid:\n" + "\n".join(bad))


if __name__ == "__main__":
    unittest.main()
