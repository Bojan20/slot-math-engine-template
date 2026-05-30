#!/usr/bin/env python3
"""W244 wave 63 — JSON Schema (Draft 2020-12) export za acceptance JSON-ove.

Pisanje formal JSON Schema fajlova koji se mogu koristiti sa bilo kojim
industrijskim validatorom (`ajv`, `jsonschema` Python, `gojsonschema`,
etc). Komplement na pure-stdlib type-check iz wave 56.

Output: `reports/schemas/`:
  • `w244_kernel.schema.json`           — per-kernel acceptance JSON
  • `w244_all_kernels.schema.json`      — master dossier
  • `w244_benchmark.schema.json`        — benchmark dossier
  • `industry_first_dossier.schema.json` — IF dossier
  • `closed_form_portfolio.schema.json`  — CF portfolio
  • `schemas_manifest.json`              — Merkle-pinned index

Each schema is byte-stable, sorted-keys JSON. Manifest Merkle covers
all schema files for one-hash audit attestation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "reports" / "schemas"
OUT_DIR.mkdir(parents=True, exist_ok=True)


KERNEL_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/Bojan20/slot-math-engine-template/"
           "reports/schemas/w244_kernel.schema.json",
    "title": "W244 per-kernel acceptance artefakt",
    "description": (
        "Schema za standardne *_KERNEL.json acceptance fajlove pod "
        "reports/acceptance/. Excludes meta artefakti (DONE_UNIVERSAL_CLOSURE, "
        "RUST_PYTHON_PARITY, SHOWCASE_GAME) koji imaju vlastite shape-ove."
    ),
    "type": "object",
    "required": [
        "schema", "merkle_root_sha256", "generated_at_utc", "kernel",
        "module", "industry_pattern", "fixtures_count", "records",
    ],
    "properties": {
        "schema": {"type": "string"},
        "merkle_root_sha256": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$",
        },
        "generated_at_utc": {"type": "string"},
        "kernel": {"type": "string"},
        "module": {"type": "string"},
        "industry_pattern": {"type": "string"},
        "fixtures_count": {"type": "integer", "minimum": 0},
        "records": {"type": "array"},
        "verification": {"type": "string"},
    },
    "additionalProperties": True,
}

MASTER_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/Bojan20/slot-math-engine-template/"
           "reports/schemas/w244_all_kernels.schema.json",
    "title": "W244 master kernel dossier",
    "description": "Schema za reports/acceptance/W244_ALL_KERNELS.json — "
                   "master Merkle attestation across svih kernels.",
    "type": "object",
    "required": [
        "schema", "master_merkle_root_sha256", "generated_at_utc",
        "all_kernels_ok", "kernels_total", "kernels_ok", "kernels_fail",
        "total_fixtures", "records",
    ],
    "properties": {
        "schema": {"type": "string"},
        "master_merkle_root_sha256": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$",
        },
        "generated_at_utc": {"type": "string"},
        "all_kernels_ok": {"type": "boolean"},
        "kernels_total": {"type": "integer", "minimum": 0},
        "kernels_ok": {"type": "integer", "minimum": 0},
        "kernels_fail": {"type": "integer", "minimum": 0},
        "total_fixtures": {"type": "integer", "minimum": 0},
        "records": {
            "type": "array",
            "items": {
                "type": "object",
                "required": [
                    "wave_id", "kernel", "status", "builder_exit_code",
                    "output_path", "fixtures_count", "merkle_root_sha256",
                ],
                "properties": {
                    "wave_id": {"type": "string"},
                    "kernel": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": ["OK", "FAIL"],
                    },
                    "builder_exit_code": {"type": "integer"},
                    "output_path": {"type": "string"},
                    "fixtures_count": {"type": "integer", "minimum": 0},
                    "merkle_root_sha256": {
                        "type": "string",
                        "pattern": "^[0-9a-f]{64}$",
                    },
                },
            },
        },
    },
}

BENCH_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/Bojan20/slot-math-engine-template/"
           "reports/schemas/w244_benchmark.schema.json",
    "title": "W244 benchmark dossier",
    "description": "Schema za reports/acceptance/W244_BENCHMARK_DOSSIER.json.",
    "type": "object",
    "required": [
        "schema", "merkle_root_sha256", "bench_count", "fastest",
        "slowest", "all_sub_microsecond", "records",
    ],
    "properties": {
        "schema": {"type": "string"},
        "merkle_root_sha256": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$",
        },
        "bench_count": {"type": "integer", "minimum": 0},
        "fastest": {"type": "object"},
        "slowest": {"type": "object"},
        "mean_across_all_benches_ns": {"type": "number"},
        "all_sub_microsecond": {"type": "boolean"},
        "records": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["group", "bench", "mean_ns", "ops_per_sec"],
                "properties": {
                    "group": {"type": "string"},
                    "bench": {"type": "string"},
                    "mean_ns": {"type": "number", "minimum": 0},
                    "stderr_ns": {"type": "number"},
                    "ops_per_sec": {"type": "number", "minimum": 0},
                },
            },
        },
    },
}

IF_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/Bojan20/slot-math-engine-template/"
           "reports/schemas/industry_first_dossier.schema.json",
    "title": "Industry First Dossier",
    "type": "object",
    "required": ["schema", "generatedAtUtc", "headline", "waves"],
    "properties": {
        "schema": {"type": "string"},
        "generatedAtUtc": {"type": "string"},
        "repo_sha": {"type": "string"},
        "headline": {"type": "object"},
        "waves": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["wave"],
                "properties": {
                    "wave": {"type": ["integer", "string"]},
                    "kimi": {"type": ["string", "null"]},
                    "commit": {"type": ["string", "null"]},
                    "name": {"type": "string"},
                    "headline": {"type": "string"},
                    "industry_first": {"type": "string"},
                },
            },
        },
    },
}

CF_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/Bojan20/slot-math-engine-template/"
           "reports/schemas/closed_form_portfolio.schema.json",
    "title": "Closed-Form Portfolio dossier",
    "type": "object",
    "required": [
        "schema_version", "report_id", "generated_utc",
        "total_configs", "total_configs_passed", "reports",
    ],
    "properties": {
        "schema_version": {"type": "string"},
        "report_id": {"type": "string"},
        "generated_utc": {"type": "string"},
        "portfolio_milestone": {"type": "string"},
        "acceptance_reports_total": {"type": "integer"},
        "overall_pass_count": {"type": "integer"},
        "overall_fail_count": {"type": "integer"},
        "total_configs": {"type": "integer"},
        "total_configs_passed": {"type": "integer"},
        "pass_rate_pct": {"type": ["number", "string"]},
        "reports": {
            "type": "array",
            "items": {
                "type": "object",
                "required": [
                    "fileName", "reportId", "overallPass",
                    "configsTotal", "configsPassed",
                ],
                "properties": {
                    "fileName": {"type": "string"},
                    "reportId": {"type": "string"},
                    "overallPass": {"type": "boolean"},
                    "configsTotal": {"type": "integer"},
                    "configsPassed": {"type": "integer"},
                },
            },
        },
    },
}


SCHEMAS = {
    "w244_kernel.schema.json": KERNEL_SCHEMA,
    "w244_all_kernels.schema.json": MASTER_SCHEMA,
    "w244_benchmark.schema.json": BENCH_SCHEMA,
    "industry_first_dossier.schema.json": IF_SCHEMA,
    "closed_form_portfolio.schema.json": CF_SCHEMA,
}


def main() -> int:
    entries = []
    for name, schema in sorted(SCHEMAS.items()):
        text = json.dumps(schema, indent=2, sort_keys=True) + "\n"
        (OUT_DIR / name).write_text(text, encoding="utf-8")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        entries.append({
            "filename": name,
            "title": schema.get("title", "?"),
            "sha256": digest,
            "size_bytes": len(text),
        })

    # Manifest Merkle = sha256 over the sorted-by-filename digest stream
    leaf_lines = "".join(
        f"{e['filename']}|{e['sha256']}\n" for e in entries
    )
    manifest_merkle = hashlib.sha256(
        leaf_lines.encode("utf-8")
    ).hexdigest()

    manifest = {
        "schema": "w244-schemas-manifest/v1",
        "manifest_merkle_root_sha256": manifest_merkle,
        "draft": "json-schema draft 2020-12",
        "purpose": (
            "Industry-standard JSON Schema files validating the W244 "
            "acceptance + dossier surface. Validates with any conforming "
            "validator (ajv, Python jsonschema, gojsonschema, NJsonSchema)."
        ),
        "schemas_count": len(entries),
        "schemas": entries,
        "verification": (
            "Re-run `python3 tools/build_acceptance_schemas.py`. "
            "manifest_merkle_root_sha256 must rebuild byte-identical."
        ),
    }
    manifest_text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    (OUT_DIR / "schemas_manifest.json").write_text(
        manifest_text, encoding="utf-8",
    )

    print(f"[schemas] wrote {len(entries)} schemas + manifest")
    for e in entries:
        print(f"  {e['filename']:38s} {e['sha256'][:16]}…  "
              f"{e['size_bytes']:>5d} B")
    print(f"  schemas_manifest.json: merkle={manifest_merkle}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
