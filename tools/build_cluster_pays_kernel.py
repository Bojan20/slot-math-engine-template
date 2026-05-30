#!/usr/bin/env python3
"""W244 wave 21 — deterministic acceptance for `cluster_pays`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.cluster_pays import ClusterPaysParams, cluster_pays_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "CLUSTER_PAYS_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Public-spec proxy cluster count distributions — illustrative only.
# Real values are vendor PAR-derived (out of scope; kernel just aggregates).

FIXTURES = [
    {
        "name": "sweet-bonanza-7x7",
        "description": "Pragmatic Sweet Bonanza 7×7 cluster pays, 4-way",
        "params": ClusterPaysParams(
            cluster_count_distribution={
                "hp1": {5: 0.04, 6: 0.018, 7: 0.008, 8: 0.003},
                "hp2": {5: 0.05, 6: 0.022, 7: 0.010, 8: 0.004},
                "lp1": {5: 0.15, 6: 0.08, 7: 0.04, 8: 0.018},
                "lp2": {5: 0.18, 6: 0.09, 7: 0.045, 8: 0.020},
            },
            pay_table={
                "hp1": {5: 5.0, 6: 10.0, 7: 25.0, 8: 50.0},
                "hp2": {5: 3.0, 6: 6.0, 7: 15.0, 8: 30.0},
                "lp1": {5: 0.5, 6: 1.0, 7: 2.5, 8: 5.0},
                "lp2": {5: 0.3, 6: 0.6, 7: 1.5, 8: 3.0},
            },
            min_cluster_size=5,
            grid_rows=7, grid_cols=7,
        ),
    },
    {
        "name": "aloha-cluster-5x4",
        "description": "NetEnt Aloha Cluster Pays 5×4, 4-way",
        "params": ClusterPaysParams(
            cluster_count_distribution={
                "tiki1": {5: 0.025, 6: 0.012, 7: 0.005},
                "tiki2": {5: 0.030, 6: 0.014, 7: 0.006},
                "fruit": {5: 0.08, 6: 0.04, 7: 0.018},
            },
            pay_table={
                "tiki1": {5: 8.0, 6: 20.0, 7: 60.0},
                "tiki2": {5: 5.0, 6: 12.0, 7: 30.0},
                "fruit": {5: 0.8, 6: 2.0, 7: 5.0},
            },
            min_cluster_size=5,
            grid_rows=4, grid_cols=5,
        ),
    },
    {
        "name": "gates-of-olympus-6x5",
        "description": "Pragmatic Gates of Olympus 6×5, scatter-pay (8-way)",
        "params": ClusterPaysParams(
            cluster_count_distribution={
                "zeus": {8: 0.020, 9: 0.012, 10: 0.006, 11: 0.003},
                "crown": {8: 0.025, 9: 0.014, 10: 0.007, 11: 0.003},
                "gem": {8: 0.10, 9: 0.05, 10: 0.025, 11: 0.012},
            },
            pay_table={
                "zeus": {8: 50.0, 9: 100.0, 10: 250.0, 11: 500.0},
                "crown": {8: 25.0, 9: 50.0, 10: 100.0, 11: 250.0},
                "gem": {8: 0.5, 9: 1.0, 10: 2.5, 11: 5.0},
            },
            min_cluster_size=8,
            grid_rows=5, grid_cols=6,
            adjacency="8-way",
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = cluster_pays_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"grid={r['grid']}|"
            f"adj={r['adjacency']}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "cluster-pays-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "cluster_pays",
        "module": "tools.math_dsl.cluster_pays",
        "industry_pattern": (
            "Pragmatic Sweet Bonanza, NetEnt Aloha Cluster Pays, Pragmatic "
            "Gates of Olympus, BTG Money Cart, ELK Mystery Mish-Mash. "
            "Connected cluster of same-symbol cells (4-way or 8-way) ≥ "
            "min_cluster_size pays per published ladder."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_cluster_pays_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Kernel aggregates "
            "operator-supplied empirical cluster count distribution × "
            "pay ladder — no first-principles percolation theory needed "
            "(that boundary lives in validated PAR data)."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[cluster-pays-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:30s}  grid={r['grid']}  adj={r['adjacency']}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
