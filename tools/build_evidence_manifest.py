#!/usr/bin/env python3
"""
Build a single tamper-evident SHA-256 manifest over every shippable
W4.11* + W4.15 deliverable.

The manifest commits to:
  * 6 dashboards (HTML)
  * 6 manifest JSONs (dashboard side-car)
  * 4 acceptance reports (closed-form + MC + portfolio validator + book IR)
  * 1 GH Actions workflow
  * 2 documentation files (COMMERCIAL_PITCH.md + dossier MD)

For each file we record:
  * relative path
  * file size in bytes
  * SHA-256 hex digest

The top-level Merkle root is the SHA-256 of the sorted-by-path
"path|size|digest\n" records. A regulator can re-run this script and
verify the root matches without re-reading any of the source files —
just supplying the recorded `sha256` for each.

Output: reports/acceptance/W4_11_EVIDENCE_MANIFEST.json
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "W4_11_EVIDENCE_MANIFEST.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Files to commit
# ---------------------------------------------------------------------------
FILES_RELATIVE = [
    # Dashboards
    "reports/dashboards/index.html",
    "reports/dashboards/sales-one-pager.html",
    "reports/dashboards/mc-parity-dashboard.html",
    "reports/dashboards/real-market-portfolio.html",
    "reports/dashboards/portfolio-validator-dashboard.html",
    "reports/dashboards/unified-audit.html",
    "reports/dashboards/live-par-compiler.html",
    # Dashboard sidecar manifests
    "reports/dashboards/index.manifest.json",
    "reports/dashboards/sales-one-pager.manifest.json",
    "reports/dashboards/mc-parity-dashboard.manifest.json",
    "reports/dashboards/real-market-portfolio.manifest.json",
    "reports/dashboards/portfolio-validator-dashboard.manifest.json",
    # Acceptance reports
    "reports/acceptance/book_bonusbuy_parity.json",
    "reports/acceptance/book_bonusbuy_mc.json",
    "reports/acceptance/portfolio_validator.json",
    # IR (the only force-added template artefact)
    "games/book-expanding-bonusbuy/out/template-book-bonusbuy.ir.json",
    # Workflow
    ".github/workflows/template-parity.yml",
    # Docs
    "docs/COMMERCIAL_PITCH.md",
    "reports/dossier/INDUSTRY_FIRST_DOSSIER.md",
    "reports/dossier/INDUSTRY_FIRST_DOSSIER.json",
]


def hash_file(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as fh:
        while chunk := fh.read(1 << 16):
            h.update(chunk)
            size += len(chunk)
    return size, h.hexdigest()


def main() -> int:
    records: list[dict] = []
    missing: list[str] = []
    for rel in sorted(FILES_RELATIVE):
        fp = REPO / rel
        if not fp.exists():
            missing.append(rel)
            continue
        size, digest = hash_file(fp)
        records.append({"path": rel, "size_bytes": size, "sha256": digest})

    # Merkle-style root: SHA-256 over `path|size|sha256\n` lines, sorted by path.
    leaf_lines = [f"{r['path']}|{r['size_bytes']}|{r['sha256']}\n" for r in records]
    root_hash = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    manifest = {
        "schema": "w4-11-evidence-manifest/v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "merkle_root_sha256": root_hash,
        "file_count": len(records),
        "total_bytes": sum(r["size_bytes"] for r in records),
        "missing_files": missing,
        "records": records,
        "verification": (
            "To verify: hash each file with SHA-256, concatenate lines of the form "
            "`<path>|<size_bytes>|<sha256>\\n` sorted lexicographically by path, then "
            "SHA-256 that concatenation. The result must equal `merkle_root_sha256`."
        ),
    }
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"[evidence-manifest] wrote {OUT.relative_to(REPO)}")
    print(f"  files committed: {len(records)} / {len(FILES_RELATIVE)}")
    print(f"  missing:         {len(missing)} {missing if missing else ''}")
    print(f"  total bytes:     {sum(r['size_bytes'] for r in records):,}")
    print(f"  merkle root:     {root_hash}")
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
