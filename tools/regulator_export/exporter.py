"""Regulator export package — bundles IR + math doc + truth + manifest."""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class ExportEntry:
    name: str
    rel_path: str
    sha256: str
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "rel_path": self.rel_path,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
        }


@dataclass
class ExportManifest:
    game_id: str
    vendor: str
    swid: str
    generated_at: str
    entries: list[ExportEntry] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "vendor": self.vendor,
            "swid": self.swid,
            "generated_at": self.generated_at,
            "n_entries": len(self.entries),
            "entries": [e.to_dict() for e in self.entries],
        }


def _hash_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def _add_entry(
    manifest: ExportManifest,
    out_dir: Path,
    name: str,
    content: bytes,
    sub: str | None = None,
) -> None:
    sub_path = sub if sub else name
    full = out_dir / sub_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_bytes(content)
    manifest.entries.append(ExportEntry(
        name=name,
        rel_path=sub_path,
        sha256=_hash_bytes(content),
        size_bytes=len(content),
    ))


def write_manifest(out_dir: Path, manifest: ExportManifest) -> None:
    p = out_dir / "manifest.json"
    p.write_text(json.dumps(manifest.to_dict(), indent=2, sort_keys=True))


def export_game(
    ir: dict[str, Any],
    *,
    out_dir: Path,
    math_doc_text: str | None = None,
    truth_check: dict[str, Any] | None = None,
    extra_files: dict[str, bytes] | None = None,
) -> ExportManifest:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = ir.get("meta") or {}
    manifest = ExportManifest(
        game_id=str(meta.get("id", "unknown")),
        vendor=str(meta.get("vendor", "unknown")),
        swid=str(meta.get("swid", "unknown")),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    ir_blob = json.dumps(ir, indent=2, sort_keys=True).encode()
    _add_entry(manifest, out_dir,
                name=f"{manifest.game_id}_ir.json",
                content=ir_blob,
                sub=f"{manifest.game_id}_ir.json")
    _add_entry(manifest, out_dir,
                name=f"{manifest.game_id}_ir.sha256.txt",
                content=f"{_hash_bytes(ir_blob)}\n".encode(),
                sub=f"{manifest.game_id}_ir.sha256.txt")

    if math_doc_text is not None:
        _add_entry(manifest, out_dir,
                    name=f"{manifest.game_id}_math_doc.md",
                    content=math_doc_text.encode("utf-8"),
                    sub=f"{manifest.game_id}_math_doc.md")

    if truth_check is not None:
        _add_entry(manifest, out_dir,
                    name=f"{manifest.game_id}_truth_check.json",
                    content=json.dumps(truth_check, indent=2, sort_keys=True).encode(),
                    sub=f"{manifest.game_id}_truth_check.json")

    if extra_files:
        for fname, blob in extra_files.items():
            _add_entry(manifest, out_dir, name=fname, content=blob, sub=fname)

    write_manifest(out_dir, manifest)
    return manifest
