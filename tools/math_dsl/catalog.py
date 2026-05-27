"""W6.6 — Spec catalog index.

Scans a directory of DSL spec YAMLs and emits a searchable JSON index:

    {
      "schema_version": "1.0.0",
      "generated_at_utc": "…",
      "specs": [
        {
          "path": "tools/math_dsl/specs/example_classic_5x3.yaml",
          "id": "crimson-tiger",
          "name": "Crimson Tiger",
          "vendor": "studio-internal",
          "topology": "rectangular 5x3",
          "features": ["free_spins"],
          "target_rtp": 0.96,
          "volatility_class": "medium",
          "jurisdictions": ["UKGC", "MGA", "ADM"],
          "sha256": "…"
        },
        …
      ],
      "by_topology": { "rectangular": [...], "variable_rows": [...], … },
      "by_volatility": { "low": [...], … },
      "by_jurisdiction": { "UKGC": [...], "MGA": [...], … }
    }

Use cases
=========
- Studio UI: load index, render filterable game list
- Sales: "give me all medium-volatility games certified for UKGC + MGA"
- Compliance: cross-reference jurisdiction overlap when shipping to NL
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .spec import parse_spec, DslParseError


def _entry_for_spec(yaml_text: str, path: Path) -> dict[str, Any] | None:
    try:
        spec = parse_spec(yaml_text)
    except DslParseError:
        return None
    sha = hashlib.sha256(yaml_text.encode("utf-8")).hexdigest()
    top = spec.topology
    if top.kind == "rectangular":
        topo_str = f"rectangular {top.reels}x{top.rows}"
    elif top.kind == "variable_rows":
        rng = top.row_range_per_reel or []
        if rng:
            mn = min(r[0] for r in rng)
            mx = max(r[1] for r in rng)
            topo_str = f"variable_rows {top.reels}r {mn}-{mx}"
        else:
            topo_str = f"variable_rows {top.reels}r"
    elif top.kind == "cluster_grid":
        topo_str = f"cluster {top.reels}x{top.rows} ({top.adjacency or 'orthogonal'})"
    else:
        topo_str = top.kind
    return {
        "path": str(path),
        "id": (spec.meta.get("name") or "").lower().replace(" ", "-") or "game",
        "name": spec.meta.get("name"),
        "vendor": spec.meta.get("vendor"),
        "author": spec.meta.get("author"),
        "topology": topo_str,
        "topology_kind": top.kind,
        "features": [f.kind for f in spec.features],
        "target_rtp": spec.constraints.target_rtp,
        "volatility_class": spec.constraints.volatility_class,
        "hit_freq_target": spec.constraints.hit_freq_target,
        "max_win_x": spec.constraints.max_win_x,
        "jurisdictions": list(spec.constraints.jurisdictions),
        "sha256": sha,
    }


def build_catalog(specs_dir: Path) -> dict:
    """Scan `specs_dir` for *.yaml + *.yml files, return catalog dict."""
    specs_dir = Path(specs_dir)
    entries: list[dict] = []
    for p in sorted(specs_dir.rglob("*.yaml")) + sorted(specs_dir.rglob("*.yml")):
        try:
            text = p.read_text(encoding="utf-8")
        except OSError:
            continue
        e = _entry_for_spec(text, p)
        if e is not None:
            entries.append(e)

    by_topology: dict[str, list[str]] = {}
    by_volatility: dict[str, list[str]] = {}
    by_jurisdiction: dict[str, list[str]] = {}
    for e in entries:
        by_topology.setdefault(e["topology_kind"], []).append(e["id"])
        by_volatility.setdefault(e["volatility_class"], []).append(e["id"])
        for j in e["jurisdictions"]:
            by_jurisdiction.setdefault(j, []).append(e["id"])

    return {
        "schema_version": "1.0.0",
        "generated_at_utc": datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        ),
        "specs_dir": str(specs_dir),
        "count": len(entries),
        "specs": entries,
        "by_topology": by_topology,
        "by_volatility": by_volatility,
        "by_jurisdiction": by_jurisdiction,
    }


def filter_catalog(
    catalog: dict,
    *,
    topology_kind: str | None = None,
    volatility_class: str | None = None,
    jurisdiction: str | None = None,
    feature_kind: str | None = None,
) -> list[dict]:
    """Apply optional filters and return the matching `specs[]` entries."""
    out = catalog.get("specs", [])
    if topology_kind:
        out = [e for e in out if e.get("topology_kind") == topology_kind]
    if volatility_class:
        out = [e for e in out if e.get("volatility_class") == volatility_class]
    if jurisdiction:
        out = [e for e in out if jurisdiction.upper() in e.get("jurisdictions", [])]
    if feature_kind:
        out = [e for e in out if feature_kind in e.get("features", [])]
    return out
