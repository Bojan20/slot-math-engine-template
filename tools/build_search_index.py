#!/usr/bin/env python3
"""W244 wave 71 — unified cross-dossier search index.

Generates `reports/dossier/search-index.json` — single JSON sa svim
searchable entry-jima preko 4 dossier surface-a:

  • Industry Firsts (89 waves)        → reports/dossier/INDUSTRY_FIRST_DOSSIER.json
  • Kernel acceptance artefakti (19)  → reports/acceptance/*_KERNEL.json
  • Closed-form solvers (120)         → reports/dossier/CLOSED_FORM_PORTFOLIO_100.json
  • Showcase game (1)                 → reports/acceptance/SHOWCASE_GAME_KERNEL.json

Schema:
  { "schema": "w244-search-index/v1",
    "merkle_root_sha256": "...",
    "entries": [ {kind, id, title, body, url} ... ] }

Loaded by `reports/dossier/index.html` (landing page) za client-side
full-text search across the entire dossier surface.

Deterministic — body Merkle u manifest.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOSSIER = REPO / "reports" / "dossier"
ACCEPT = REPO / "reports" / "acceptance"
OUT = DOSSIER / "search-index.json"

SKIP_FILES = {
    "DONE_UNIVERSAL_CLOSURE_KERNEL.json",
    "RUST_PYTHON_PARITY_KERNEL.json",
}


def _industry_first_entries() -> list[dict]:
    src = DOSSIER / "INDUSTRY_FIRST_DOSSIER.json"
    if not src.exists():
        return []
    d = json.loads(src.read_text())
    entries = []
    for w in d.get("waves", []):
        wave_id = w.get("wave", "?")
        name = w.get("name", "")
        if_text = w.get("industry_first", "")
        headline = w.get("headline", "")
        body = " ".join(filter(None, [name, headline, if_text]))
        entries.append({
            "kind": "industry-first",
            "id": f"W{wave_id}",
            "title": f"W{wave_id}: {name}",
            "body": body,
            "url": f"INDUSTRY_FIRST_DOSSIER.html#w{wave_id}",
        })
    return entries


def _kernel_entries() -> list[dict]:
    entries = []
    for f in sorted(ACCEPT.glob("*_KERNEL.json")):
        if f.name in SKIP_FILES:
            continue
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        kernel = d.get("kernel", f.stem)
        # SHOWCASE_GAME_KERNEL is handled separately, but allow it through
        # here too since it shares the per-kernel reference page format.
        if f.name == "SHOWCASE_GAME_KERNEL.json":
            entries.append({
                "kind": "showcase",
                "id": "showcase-game",
                "title": f"Showcase game: {d.get('game_name', '?')}",
                "body": " ".join(filter(None, [
                    d.get("game_name", ""), d.get("topology", ""),
                    " ".join(d.get("kernels_composed", [])),
                    d.get("industry_first", ""),
                ])),
                "url": "showcase_game.html",
            })
            continue
        industry = d.get("industry_pattern", "")
        module = d.get("module", "")
        entries.append({
            "kind": "kernel",
            "id": kernel,
            "title": f"Kernel: {kernel}",
            "body": " ".join(filter(None, [kernel, module, industry])),
            "url": f"kernels/{f.stem.lower()}.html",
        })
    return entries


def _cf_solver_entries() -> list[dict]:
    src = DOSSIER / "CLOSED_FORM_PORTFOLIO_100.json"
    if not src.exists():
        return []
    d = json.loads(src.read_text())
    entries = []
    for r in d.get("reports", []):
        rid = r.get("reportId", "?")
        passed = r.get("overallPass", False)
        body = (f"{rid} {r.get('fileName', '')} "
                f"configs={r.get('configsPassed', 0)}/{r.get('configsTotal', 0)} "
                f"{'PASS' if passed else 'FAIL'}")
        entries.append({
            "kind": "cf-solver",
            "id": rid,
            "title": f"CF solver: {rid}",
            "body": body,
            "url": "CLOSED_FORM_PORTFOLIO.html",
        })
    return entries


def main() -> int:
    entries = (
        _industry_first_entries()
        + _kernel_entries()
        + _cf_solver_entries()
    )

    # Stable sort by (kind, id) for byte-stable output
    entries.sort(key=lambda e: (e["kind"], e["id"]))

    # Merkle = sha256 over canonical leaf stream
    leaf_lines = "".join(
        f"{e['kind']}|{e['id']}|{e['url']}\n" for e in entries
    )
    merkle = hashlib.sha256(leaf_lines.encode("utf-8")).hexdigest()

    manifest = {
        "schema": "w244-search-index/v1",
        "merkle_root_sha256": merkle,
        "entries_count": len(entries),
        "by_kind": {},
        "entries": entries,
    }
    # Count by kind
    for e in entries:
        manifest["by_kind"][e["kind"]] = (
            manifest["by_kind"].get(e["kind"], 0) + 1
        )

    text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    OUT.write_text(text, encoding="utf-8")

    print(f"[search-index] wrote {OUT.relative_to(REPO)}")
    print(f"  entries:    {len(entries)}")
    for k, n in sorted(manifest["by_kind"].items()):
        print(f"    {k:<18} {n}")
    print(f"  merkle:     {merkle}")
    print(f"  size:       {OUT.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
