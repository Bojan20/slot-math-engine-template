#!/usr/bin/env python3
"""W244 wave 22 — single-CLI batch runner for all W244 math kernels.

Runs all 11 W244 wave kernels (10-21) in deterministic order and emits a
master JSON aggregating per-kernel Merkle roots + fixture counts. Single
SHA-256 over the per-kernel pinned hashes gives one regulator-friendly
attestation for the entire W244 kernel batch.

Output: reports/acceptance/W244_ALL_KERNELS.json

Usage:
  $ python -m tools.build_all_w244_kernels
"""
from __future__ import annotations

import hashlib
import importlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "W244_ALL_KERNELS.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Kernel registry: (wave_id, builder_module, kernel_name, output_filename)
KERNELS = [
    ("244.10", "tools.build_money_collect_kernel", "money_collect",
     "MONEY_COLLECT_KERNEL.json"),
    ("244.11", "tools.build_charge_meter_kernel", "charge_meter",
     "CHARGE_METER_KERNEL.json"),
    ("244.12", "tools.build_must_hit_by_kernel", "must_hit_by",
     "MUST_HIT_BY_KERNEL.json"),
    ("244.13", "tools.build_pick_chain_kernel", "pick_chain",
     "PICK_CHAIN_KERNEL.json"),
    ("244.15", "tools.build_buy_feature_kernel", "buy_feature",
     "BUY_FEATURE_KERNEL.json"),
    ("244.16", "tools.build_wheel_kernel", "wheel",
     "WHEEL_KERNEL.json"),
    ("244.17", "tools.build_state_machine_kernel", "state_machine",
     "STATE_MACHINE_KERNEL.json"),
    ("244.18", "tools.build_expanding_symbol_kernel", "expanding_symbol",
     "EXPANDING_SYMBOL_KERNEL.json"),
    ("244.19", "tools.build_persistent_multiplier_kernel", "persistent_multiplier",
     "PERSISTENT_MULTIPLIER_KERNEL.json"),
    ("244.20", "tools.build_cascade_kernel", "cascade",
     "CASCADE_KERNEL.json"),
    ("244.21", "tools.build_cluster_pays_kernel", "cluster_pays",
     "CLUSTER_PAYS_KERNEL.json"),
    ("244.23", "tools.build_sticky_wilds_kernel", "sticky_wilds",
     "STICKY_WILDS_KERNEL.json"),
    ("244.24", "tools.build_stacked_wilds_kernel", "stacked_wilds",
     "STACKED_WILDS_KERNEL.json"),
    ("244.25", "tools.build_ways_evaluator_kernel", "ways_evaluator",
     "WAYS_EVALUATOR_KERNEL.json"),
]


def run_kernel_builder(module_name: str) -> int:
    """Invoke builder module's `main()` and return exit code."""
    mod = importlib.import_module(module_name)
    return mod.main()


def main() -> int:
    records = []
    all_passed = True
    for wave_id, mod_name, kernel_name, out_file in KERNELS:
        rc = run_kernel_builder(mod_name)
        out_path = REPO / "reports" / "acceptance" / out_file
        if rc != 0 or not out_path.exists():
            records.append({
                "wave_id": wave_id,
                "kernel": kernel_name,
                "status": "FAIL",
                "builder_exit_code": rc,
                "output_path": str(out_path.relative_to(REPO)),
            })
            all_passed = False
            continue
        # Load the per-kernel JSON, extract its merkle_root_sha256 + fixture count
        data = json.loads(out_path.read_text())
        records.append({
            "wave_id": wave_id,
            "kernel": kernel_name,
            "status": "OK",
            "builder_exit_code": rc,
            "output_path": str(out_path.relative_to(REPO)),
            "fixtures_count": data.get("fixtures_count", 0),
            "merkle_root_sha256": data.get("merkle_root_sha256"),
        })

    # Master Merkle: SHA-256 over `wave_id|kernel|merkle_root\n` rows
    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['wave_id']}|{r['kernel']}|"
            f"{r.get('merkle_root_sha256', 'FAIL')}\n"
        )
    master_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "w244-all-kernels/v1",
        "master_merkle_root_sha256": master_root,
        "generated_at_utc": f"deterministic-by-merkle:{master_root[:16]}",
        "all_kernels_ok": all_passed,
        "kernels_total": len(KERNELS),
        "kernels_ok": sum(1 for r in records if r["status"] == "OK"),
        "kernels_fail": sum(1 for r in records if r["status"] == "FAIL"),
        "total_fixtures": sum(r.get("fixtures_count", 0) for r in records),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_all_w244_kernels`. Output must "
            "match `master_merkle_root_sha256` exactly. Each per-kernel "
            "Merkle root is independently verifiable via its own builder. "
            "Master root = SHA-256 over '<wave_id>|<kernel>|<merkle>\\n' "
            "lines in registry order."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[w244-all-kernels] wrote {OUT.relative_to(REPO)}")
    print(f"  kernels:          {artifact['kernels_ok']} / {artifact['kernels_total']}")
    print(f"  total fixtures:   {artifact['total_fixtures']}")
    print(f"  master merkle:    {master_root}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
