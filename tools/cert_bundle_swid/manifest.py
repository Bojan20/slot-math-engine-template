"""Manifest helpers — deterministic sha256 + sorted JSON serialisation.

Used to build the per-SWID `MANIFEST.json` and to canonicalise any JSON
artefact we emit so that re-running the bundle produces byte-identical
output.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def canon_json_bytes(obj: Any) -> bytes:
    """Canonical JSON bytes: sorted keys, 2-space indent, no trailing ws.

    Newline-terminated so the file ends cleanly on every platform.
    """
    s = json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)
    return (s + "\n").encode("utf-8")


def sha256_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_manifest(
    *,
    game: str,
    swid: str,
    epoch: int,
    tool_version: str,
    repo_sha: str,
    files: dict[str, bytes],
    pubkey_fingerprint: str,
) -> bytes:
    """Build canonical manifest bytes.

    `files` is the in-memory map {arcname -> blob} for every artefact
    being packaged (excluding MANIFEST.json + SIGNATURE.sig themselves).
    The returned bytes are the canonical JSON form that gets both
    written into the ZIP and signed by ed25519.
    """
    entries = []
    for arcname in sorted(files):
        blob = files[arcname]
        entries.append({
            "path": arcname,
            "sha256": sha256_bytes(blob),
            "size_bytes": len(blob),
        })
    manifest = {
        "schema": "slotmath.operator-package.swid/v1",
        "game": game,
        "swid": swid,
        "epoch": epoch,
        "repo_sha": repo_sha,
        "tool_version": tool_version,
        "ed25519_pubkey_fingerprint": pubkey_fingerprint,
        "files": entries,
    }
    return canon_json_bytes(manifest)
