#!/usr/bin/env python3
"""
Standalone Evidence Manifest Verifier.

Reads a W4.11* SHA-256 evidence manifest JSON and re-verifies it by:
  1. Re-hashing every recorded file from the supplied repo root.
  2. Comparing each digest to the recorded `sha256`.
  3. Re-deriving the Merkle root from the records and comparing to
     the recorded `merkle_root_sha256`.

Designed for regulator / auditor use — pure stdlib, no third-party
dependencies, exits non-zero on ANY mismatch. The CLI prints a
human-readable summary plus a JSON receipt that can be archived.

Usage:
    python3 tools/parity/verify_evidence_manifest.py
    python3 tools/parity/verify_evidence_manifest.py --manifest <path> --repo <dir>
    python3 tools/parity/verify_evidence_manifest.py --quiet
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

DEFAULT_REPO = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = DEFAULT_REPO / "reports" / "acceptance" / "W4_11_EVIDENCE_MANIFEST.json"
DEFAULT_RECEIPT = DEFAULT_REPO / "reports" / "acceptance" / "W4_11_EVIDENCE_RECEIPT.json"


def hash_file(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as fh:
        while chunk := fh.read(1 << 16):
            h.update(chunk)
            size += len(chunk)
    return size, h.hexdigest()


def verify(manifest_path: Path, repo: Path) -> tuple[bool, dict]:
    manifest = json.loads(manifest_path.read_text())
    records = manifest.get("records", [])
    expected_root = manifest.get("merkle_root_sha256", "")

    per_file: list[dict] = []
    missing: list[str] = []
    digest_mismatch: list[str] = []
    size_mismatch: list[str] = []

    for rec in records:
        rel = rec["path"]
        fp = repo / rel
        entry = {"path": rel, "ok": False, "reason": None,
                 "expected_sha256": rec["sha256"],
                 "actual_sha256": None,
                 "expected_size": rec["size_bytes"],
                 "actual_size": None}
        if not fp.exists():
            missing.append(rel)
            entry["reason"] = "missing"
            per_file.append(entry)
            continue
        actual_size, actual_digest = hash_file(fp)
        entry["actual_size"] = actual_size
        entry["actual_sha256"] = actual_digest
        if actual_digest != rec["sha256"]:
            digest_mismatch.append(rel)
            entry["reason"] = "digest mismatch"
        elif actual_size != rec["size_bytes"]:
            size_mismatch.append(rel)
            entry["reason"] = "size mismatch"
        else:
            entry["ok"] = True
        per_file.append(entry)

    # Re-derive Merkle root from the records (no source re-read).
    leaf_lines = sorted(f"{r['path']}|{r['size_bytes']}|{r['sha256']}\n" for r in records)
    derived_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    root_ok = derived_root == expected_root
    all_files_ok = not missing and not digest_mismatch and not size_mismatch
    verified = all_files_ok and root_ok

    # W244 wave 6 — deterministic receipt. `verified_at_utc` previously
    # wall-clock; now derived from the verified root so re-running with
    # the same evidence bundle produces a byte-identical receipt.
    derived_ts = f"deterministic-by-merkle:{derived_root[:16]}"
    receipt = {
        "schema": "w4-11-evidence-receipt/v1",
        "verified": verified,
        "verified_at_utc": derived_ts,
        "manifest_path": str(manifest_path),
        "repo_root": str(repo),
        "expected_merkle_root_sha256": expected_root,
        "derived_merkle_root_sha256": derived_root,
        "merkle_root_match": root_ok,
        "file_count": len(records),
        "passed_count": sum(1 for e in per_file if e["ok"]),
        "missing": missing,
        "digest_mismatch": digest_mismatch,
        "size_mismatch": size_mismatch,
        "per_file": per_file,
    }
    return verified, receipt


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify W4.11 SHA-256 evidence manifest")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST,
                        help=f"Path to evidence manifest JSON (default: {DEFAULT_MANIFEST})")
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO,
                        help="Repo root (default: containing repo)")
    parser.add_argument("--receipt", type=Path, default=DEFAULT_RECEIPT,
                        help=f"Where to write the JSON receipt (default: {DEFAULT_RECEIPT})")
    parser.add_argument("--quiet", action="store_true", help="Suppress human-readable output")
    args = parser.parse_args()

    if not args.manifest.exists():
        print(f"[verify] manifest not found: {args.manifest}", file=sys.stderr)
        return 2

    verified, receipt = verify(args.manifest, args.repo)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, ensure_ascii=False, indent=2))

    if not args.quiet:
        print(f"[verify] manifest:          {args.manifest}")
        print(f"[verify] repo root:         {args.repo}")
        print(f"[verify] file count:        {receipt['file_count']}")
        print(f"[verify] passed:            {receipt['passed_count']} / {receipt['file_count']}")
        print(f"[verify] expected root:     {receipt['expected_merkle_root_sha256']}")
        print(f"[verify] derived root:      {receipt['derived_merkle_root_sha256']}")
        print(f"[verify] merkle root match: {'YES' if receipt['merkle_root_match'] else 'NO'}")
        if receipt["missing"]:
            print(f"[verify] missing files:     {receipt['missing']}")
        if receipt["digest_mismatch"]:
            print(f"[verify] digest mismatches: {receipt['digest_mismatch']}")
        if receipt["size_mismatch"]:
            print(f"[verify] size mismatches:   {receipt['size_mismatch']}")
        print(f"[verify] receipt written:   {args.receipt}")
        print(f"[verify] RESULT:            {'VERIFIED ✅' if verified else 'TAMPERED ❌'}")

    return 0 if verified else 1


if __name__ == "__main__":
    raise SystemExit(main())
